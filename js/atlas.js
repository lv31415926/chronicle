/* atlas.js | 舆图视图：现代海岸线底图 + 事件落针 + 人物行迹 + 大势示意
 * 依赖：window.ChronGeo / ChronState / ChronLoader / ChronTime / ChronProv / ChronDetail
 * 发布：window.ChronAtlas
 *
 * 三条设计约束（都是本项目的第一性约束，不是风格偏好）：
 * ① 零依赖：SVG 自绘，不引 Leaflet/D3——引了就等于放弃 file:// 双击可用。
 * ② 地图不是第二套内容库：每个针点都开现有详情，每条行迹都挂现有条目 id；
 *    地图只回答「在哪儿」，「凭什么」一律回给语料与溯源标签。
 * ③ 不画现代国界与省界：底图只有海岸线与水系。历史疆域一律以「大势示意」出现，
 *    并写明非精确疆界——把不可靠的边界画得像测绘成果，与本站「可核查」的立场冲突。
 */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";
  var WORLD_W = 1024;                    // 投影基准宽度（像素），相机再缩放
  var MIN_K = 1, MAX_K = 42;
  var DIR_OFF = { nw: [-0.55, 0.42], ne: [0.55, 0.42], sw: [-0.55, -0.42], se: [0.55, -0.42],
    w: [-0.7, 0], e: [0.7, 0], n: [0, 0.55], s: [0, -0.55], c: [0, 0] };

  var root = null, svg = null, gCam = null, gPins = null, gLabels = null, tip = null, yearInput = null;
  var cam = { k: 1, x: 0, y: 0 };        // 屏幕 = 投影坐标 * k + (x,y)
  var state = { year: -100, mode: "events", journey: null, place: null, embed: false, half: 10 };
  /* 数据还在路上时按下的「关」不能丢：那时 root 还藏着，close() 会当自己没活干，
   * 于是晚到的 open 把舆图掀在读者已经离开的页面上。这一旗只记「用户要不要它开着」。 */
  var wantOpen = false;
  var dirty = false, rafId = 0, settleTimer = 0, labelsLive = true;
  var paths = { land: [], water: [] };
  var pinData = [];
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 投影 ---------- */
  function proj(lng, lat) {
    var x = (lng + 180) / 360 * WORLD_W;
    var s = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180);
    var y = WORLD_W / 2 - WORLD_W * Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
    return [x, y];
  }
  function unproj(px, py) {
    var lng = px / WORLD_W * 360 - 180;
    var n = Math.PI - 2 * Math.PI * py / WORLD_W;
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return [lng, lat];
  }
  function screenOf(lng, lat) {
    var p = proj(lng, lat);
    return [p[0] * cam.k + cam.x, p[1] * cam.k + cam.y];
  }
  function ringToPath(ring) {
    var d = "";
    for (var i = 0; i < ring.length; i++) {
      var p = proj(ring[i][0], ring[i][1]);
      d += (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2);
    }
    return d + "Z";
  }
  function lineToPath(pts) {
    var d = "";
    for (var i = 0; i < pts.length; i++) {
      var p = proj(pts[i][0], pts[i][1]);
      d += (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2);
    }
    return d;
  }
  /* 屏幕坐标版：针、行迹线、大势标注都挂在不吃相机变换的层上，
   * 用投影坐标画它们，线就会落在错误位置（实测只剩一小段虚线）。 */
  function lineToPathScreen(pts) {
    var d = "";
    for (var i = 0; i < pts.length; i++) {
      var p = screenOf(pts[i][0], pts[i][1]);
      d += (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
    }
    return d;
  }

  /* ---------- DOM ---------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in (attrs || {})) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function ensure() {
    if (root) return;
    root = document.createElement("div");
    root.id = "atlas";
    root.className = "atlas";
    root.hidden = true;
    root.innerHTML =
      '<div class="at-map">' +
        '<svg id="at-svg" class="at-svg" role="img" aria-label="时间长河舆图：现代海岸线底图上标注编年事件落点与人物行迹。滚轮缩放，拖拽平移，点落针看条目详情。"></svg>' +
        '<div class="at-tip" id="at-tip" hidden></div>' +
        '<div class="at-chrome">' +
          '<div class="at-modes" id="at-modes"></div>' +
          '<div class="at-note" id="at-note"></div>' +
        '</div>' +
      '</div>' +
      '<div class="at-bar">' +
        '<button class="tb-btn" id="at-prev" title="上一个有落点的年份">◀</button>' +
        '<input type="range" id="at-year-range" min="-3000" max="2026" step="1" value="-100" aria-label="舆图年份">' +
        '<span class="at-year" id="at-year-lab">—</span>' +
        '<button class="tb-btn" id="at-next" title="下一个有落点的年份">▶</button>' +
        '<span class="at-half" id="at-half">±10 年</span>' +
        '<button class="tb-btn" id="at-fit" title="回到全图">复位</button>' +
        '<button class="tb-btn" id="at-quiz" title="舆图寻址挑战">寻址挑战</button>' +
        '<button class="tb-btn" id="at-theme" title="切换配色">深墨</button>' +
        '<button class="tb-btn at-open-tl" id="at-tl" title="回时间轴">时间轴</button>' +
        '<button class="tb-btn" id="at-close">关闭 ✕</button>' +
      '</div>';
    document.body.appendChild(root);
    svg = root.querySelector("#at-svg");
    tip = root.querySelector("#at-tip");
    yearInput = root.querySelector("#at-year-range");
    /* 追加顺序就是绘制顺序：海在最底，海岸线在其上，相机层（大势）再上，
     * 针与标注最上。先前把海矩形加在相机层之后，等于用一层不透明底色
     * 把整幅底图盖掉——截图上「地图一片黑」就是这么来的。 */
    el("rect", { x: 0, y: 0, width: "100%", height: "100%", class: "at-sea" }, svg);
    /* gBase 是唯一吃相机变换的层（投影坐标）；gPins/gLabels 用屏幕坐标，不吃变换，
     * 否则针与字号会跟着缩放一起变大——那正是参考项目专门写过性能文档的那件事。 */
    gBase = el("g", { id: "at-base" }, svg);
    gLand = el("g", { id: "at-land" }, gBase);
    gSnap = el("g", { id: "at-snap" }, gBase);
    gPins = el("g", { id: "at-pins" }, svg);
    gSnapLabels = el("g", { id: "at-snaplab" }, svg);
    gLabels = el("g", { id: "at-labels" }, svg);
    wire();
  }
  var gBase = null, gLand = null, gSnap = null, gSnapLabels = null, gCam = null;

  function wire() {
    root.addEventListener("click", function (e) {
      var pin = e.target.closest("[data-ev]");
      if (pin) { window.ChronDetail.openEvent(pin.getAttribute("data-ev")); return; }
      var pl = e.target.closest("[data-place]");
      if (pl) { location.hash = "#/place/" + encodeURIComponent(pl.getAttribute("data-place")); return; }
      var mode = e.target.closest("[data-mode]");
      if (mode) { setMode(mode.getAttribute("data-mode")); return; }
      var stop = e.target.closest("[data-stop]");
      if (stop) {
        var j = state.journey && window.ChronGeo.journeyOf(state.journey);
        if (j) { var s = j.stops[Number(stop.getAttribute("data-stop"))]; if (s) jumpYear(s.year); }
        return;
      }
    });
    root.querySelector("#at-close").addEventListener("click", close);
    root.querySelector("#at-tl").addEventListener("click", function () { location.hash = "#/timeline"; });
    root.querySelector("#at-fit").addEventListener("click", function () { fitDefault(); });
    root.querySelector("#at-prev").addEventListener("click", function () { stepYear(-1); });
    root.querySelector("#at-next").addEventListener("click", function () { stepYear(1); });
    root.querySelector("#at-quiz").addEventListener("click", function () {
      if (window.ChronAtlasQuiz) window.ChronAtlasQuiz.open();
    });
    /* 舆图是全屏层，顶栏的配色按钮被它盖住点不到——地图条里必须自己有一个，
     * 否则「进了地图就换不了宣纸」。走的是同一个状态键，不另开一套主题逻辑。 */
    root.querySelector("#at-theme").addEventListener("click", function () {
      var S = window.ChronState;
      S.patch({ theme: S.get().theme === "dark" ? "light" : "dark" });
      this.textContent = S.get().theme === "dark" ? "深墨" : "宣纸";
    });
    yearInput.addEventListener("input", function () { jumpYear(Number(this.value)); });
    bindCamera();
  }

  /* ---------- 相机交互：RAF 合帧 + 停手后再算标注 ---------- */
  function bindCamera() {
    var dragging = false, last = null, moved = 0;
    var pointers = {}, pinch = null;

    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var r = svg.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var f = Math.exp(-e.deltaY * 0.0016);
      zoomAt(mx, my, f);
      schedule();
    }, { passive: false });

    svg.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      } else {
        dragging = true; last = { x: e.clientX, y: e.clientY }; moved = 0;
        svg.setPointerCapture(e.pointerId);
      }
    });
    svg.addEventListener("pointermove", function (e) {
      if (!(e.pointerId in pointers)) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinch) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        var r = svg.getBoundingClientRect();
        zoomAt((pinch.cx - r.left), (pinch.cy - r.top), d / Math.max(1, pinch.d));
        pinch.d = d; pinch.cx = (a.x + b.x) / 2; pinch.cy = (a.y + b.y) / 2;
        schedule(); return;
      }
      if (!dragging) return;
      cam.x += e.clientX - last.x; cam.y += e.clientY - last.y;
      moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      labelsLive = false;
      schedule();
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (dragging && Object.keys(pointers).length === 0) {
        dragging = false;
        if (moved < 4) clickBlank(e);
        settle();
      }
    }
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    window.addEventListener("resize", function () { if (!root.hidden) schedule(true); });
  }

  function zoomAt(mx, my, f) {
    var k2 = Math.max(MIN_K, Math.min(MAX_K, cam.k * f));
    var real = k2 / cam.k;
    cam.x = mx - (mx - cam.x) * real;
    cam.y = my - (my - cam.y) * real;
    cam.k = k2;
    labelsLive = false;
    updateHalf();
  }
  function clickBlank(e) {
    /* 寻址挑战进行中：落针归题目管，这里不能再把空白点击解释成「该年档案」。 */
    if (window.ChronAtlasQuiz && window.ChronAtlasQuiz.isActive()) return;
    var r = svg.getBoundingClientRect();
    var px = (e.clientX - r.left - cam.x) / cam.k, py = (e.clientY - r.top - cam.y) / cam.k;
    var g = unproj(px, py);
    /* 空白处点击 = 该年档案，与时间轴同一动作，不给地图另开一套语义。 */
    if (Math.abs(g[0]) <= 180 && Math.abs(g[1]) <= 85) window.ChronDetail.openYear(state.year);
  }

  /* 视野年限宽度随缩放走：拉远看一世纪，拉近看一年。 */
  function updateHalf() {
    var pxPerDeg = cam.k * WORLD_W / 360;
    var spanDeg = (svg ? svg.clientWidth : 800) / Math.max(1, pxPerDeg);
    var y = spanDeg * 4;                       // 1 经度 ≈ 4 年（经验值，够粗）
    state.half = Math.max(1, Math.min(250, Math.round(y / 2)));
    var lab = root && root.querySelector("#at-half");
    if (lab) lab.textContent = "±" + state.half + " 年";
  }
  function settle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { labelsLive = true; renderPins(); }, reduceMotion ? 0 : 120);
  }
  function schedule(force) {
    dirty = dirty || force;
    if (rafId) return;
    rafId = requestAnimationFrame(function () { rafId = 0; dirty = false; paint(); });
  }

  /* ---------- 图层 ---------- */
  function buildBase() {
    var b = window.ChronGeo.basemap();
    if (!b) return;
    /* 只清两个子层的内容，不删组节点本身：曾写过 gBase.innerHTML 式清空，
     * 结果把 gLand/gSnap 一起摘掉，路径挂在一个已脱离文档的 <g> 上——
     * 地图于是「一片黑」，而控制台一条错误都没有。 */
    while (gLand.firstChild) gLand.removeChild(gLand.firstChild);
    while (gSnap.firstChild) gSnap.removeChild(gSnap.firstChild);
    paths.land = [];
    (b.land || []).forEach(function (ring) {
      var p = el("path", { d: ringToPath(ring), class: "at-land" }, gLand);
      paths.land.push(p);
    });
    paths.water = [];
    (b.water || []).forEach(function (w) {
      if (w.kind !== "river") return;
      var p = el("path", { d: lineToPath(w.pts), class: "at-river", "data-zh": w.zh }, gLand);
      paths.water.push({ node: p, w: w });
    });
    (b.water || []).forEach(function (w) {
      if (w.kind !== "lake") return;
      var c = proj(w.pts[0][0], w.pts[0][1]);
      var n = el("circle", { cx: c[0], cy: c[1], r: 2.2, class: "at-lake", "data-zh": w.zh }, gLand);
      paths.water.push({ node: n, w: w });
    });
    /* gSnap 在 ensure() 里建，重绘只清子节点 */
  }
  function paintBaseYear() {
    var year = state.year;
    paths.water.forEach(function (o) {
      var w = o.w;
      var on = !(w.appear != null && year < w.appear) && !(w.vanish != null && year > w.vanish);
      o.node.style.display = on ? "" : "none";
    });
    paintSnapshots();
  }

  /* 大势示意：墨色面 + 进退箭头 + 上一阶段虚线残影。 */
  function paintSnapshots() {
    if (!gSnap) return;
    while (gSnap.firstChild) gSnap.removeChild(gSnap.firstChild);
    blobLabels = [];
    if (state.mode !== "snapshot") { setNote(""); return; }
    var sn = window.ChronGeo.snapshotFor(state.year);
    if (!sn) { setNote("大势层：还没有覆盖该年的快照（现有 " + window.ChronGeo.snapshots().length + " 幅）"); return; }
    var prev = null;
    window.ChronGeo.snapshots().forEach(function (s) { if (s.year < sn.year && (!prev || s.year > prev.year)) prev = s; });
    /* 残影是「上一阶段」的对比，不是「任意更早的一幅」：
     * 只有 3 幅快照时，明的前一档会是唐（差 674 年），画出来只会误导。 */
    if (prev && sn.year - prev.year <= 200) (prev.blobs || []).forEach(function (b) {
      el("path", { d: ringToPath(b.ring), class: "at-ghost" }, gSnap);
    });
    (sn.blobs || []).forEach(function (b) {
      el("path", { d: ringToPath(b.ring), class: "at-blob", fill: b.fill || "#b5452f" }, gSnap);
      /* 标注写在屏幕坐标层：写进相机层会跟着 scale 一起放大，
       * 拉远时「匈奴」两个字会盖住半幅图（实测就是这样）。 */
      if (b.label) blobLabels.push({ at: b.label, zh: b.zh || "" });
    });
    (sn.arrows || []).forEach(function (a) {
      var d = lineToPath(a.pts) ;
      var p = el("path", { d: d, class: "at-arrow" }, gSnap);
      el("circle", { cx: proj(a.pts[a.pts.length - 1][0], a.pts[a.pts.length - 1][1])[0],
        cy: proj(a.pts[a.pts.length - 1][0], a.pts[a.pts.length - 1][1])[1], r: 1.6, class: "at-arrowhead" }, gSnap);
    });
    drawBlobLabels();
    setNote("大势示意 · " + (sn.zh || sn.key) + " · " + sn.year + " 年 ｜ " + (sn.note || "") +
      " ｜ 依据：" + (sn.source || "") + " ｜ 许可：" + (sn.license || ""));
  }

  var blobLabels = [];
  function drawBlobLabels() {
    if (!gSnapLabels) return;
    while (gSnapLabels.firstChild) gSnapLabels.removeChild(gSnapLabels.firstChild);
    blobLabels.forEach(function (b) {
      var p = screenOf(b.at[0], b.at[1]);
      var t = el("text", { x: p[0], y: p[1], class: "at-bloblab" }, gSnapLabels);
      t.textContent = b.zh;
    });
  }

  function setNote(t) {
    var n = root && root.querySelector("#at-note");
    if (n) { n.textContent = t; n.style.display = t ? "" : "none"; }
  }

  /* ---------- 落针 ---------- */
  function collectPins() {
    var L = window.ChronLoader, S = window.ChronState;
    var lo = state.year - state.half, hi = state.year + state.half;
    var out = [];
    /* 大势模式下不铺全量事件：那一屏 400 多个针会把墨面彻底压住，
     * 读者要看的是「这一幅大势凭什么」，所以只画快照自己挂的那几条。 */
    var onlyIds = null;
    if (state.mode === "snapshot") {
      var sn = window.ChronGeo.snapshotFor(state.year);
      if (!sn) return { pins: [], hidden: 0, total: 0 };
      onlyIds = {}; (sn.events || []).forEach(function (id) { onlyIds[id] = 1; });
    }
    L.allEvents().forEach(function (e) {
      if (onlyIds && !onlyIds[e.id]) return;
      if (e.year < lo || e.year > hi) return;
      if (!S.passesFilter(e)) return;
      var c = window.ChronGeo.coordFor(e);
      if (!c) return;
      out.push({ ev: e, coord: c.coord, approx: c.approx, place: c.place });
    });
    out.sort(function (a, b) { return b.ev.weight - a.ev.weight || a.ev.year - b.ev.year; });
    var CAP = 260;
    var hidden = Math.max(0, out.length - CAP);
    return { pins: out.slice(0, CAP), hidden: hidden, total: out.length };
  }

  function renderPins() {
    if (!gPins) return;
    while (gPins.firstChild) gPins.removeChild(gPins.firstChild);
    while (gLabels.firstChild) gLabels.removeChild(gLabels.firstChild);

    var journey = state.mode === "journey" && state.journey
      ? window.ChronGeo.journeyPoints(window.ChronGeo.journeyOf(state.journey)) : null;

    if (journey) { renderJourney(journey); return; }

    var got = collectPins();
    var budget = cam.k >= 8 ? 26 : cam.k >= 4 ? 16 : cam.k >= 2.5 ? 10 : 0;
    var taken = {}, placed = 0;
    function cell(x, y) { return Math.round(x / 150) + ":" + Math.round(y / 22); }
    got.pins.forEach(function (p) {
      var s = screenOf(p.coord[0], p.coord[1]);
      var M = window.__CHRONICLE_META;
      var color = M.tracks[p.ev.track] ? M.tracks[p.ev.track].color : "#888";
      var cls = "at-pin" + (p.approx ? " at-approx" : "");
      var node;
      if (p.approx) {
        node = el("circle", { cx: s[0], cy: s[1], r: 13, class: cls, fill: color }, gPins);
      } else {
        node = el("circle", { cx: s[0], cy: s[1], r: 3 + p.ev.weight * 0.9, class: cls, fill: color,
          "data-ev": p.ev.id, "data-place": p.place.key }, gPins);
      }
      node.setAttribute("data-ev", p.ev.id);
      node.setAttribute("data-place", p.place.key);
      if (labelsLive && placed < budget && p.ev.weight >= (cam.k >= 4 ? 4 : 5)) {
        var ck = cell(s[0], s[1]);
        if (!taken[ck]) {
          taken[ck] = 1; placed++;
          var t = el("text", { x: s[0] + 6, y: s[1] + 3, class: "at-lab" }, gLabels);
          /* 只写地名：把整条标题铺在图上，二十个字互相叠成一团，谁也读不了。
           * 标题在点开的详情里，也在「铺成长河」里。 */
          t.textContent = p.place.zh;
        }
      }
    });
    var cnt = got.total + (got.hidden ? "（另 " + got.hidden + " 条未画）" : "");
    setNote("落针 " + cnt + " 条 · " + window.ChronTime.formatYear(state.year) + " ±" + state.half +
      " 年 ｜ 底图为示意海岸线，不含现代国界");
  }

  function renderJourney(stops) {
    var pts = [];
    stops.forEach(function (s, i) {
      if (!s.coord) return;
      pts.push(s.coord);
      var p = screenOf(s.coord[0], s.coord[1]);
      var g = el("g", { "data-stop": i }, gPins);
      el("circle", { cx: p[0], cy: p[1], r: 11, class: "at-stop" }, g);
      var t = el("text", { x: p[0], y: p[1] + 4, class: "at-stopn" }, g);
      t.textContent = String(i + 1);
      if (labelsLive) {
        var l = el("text", { x: p[0] + 15, y: p[1] + 4, class: "at-lab" }, gLabels);
        l.textContent = window.ChronTime.formatYearShort(s.year) + " · " + (s.place ? s.place.zh : s.title);
      }
    });
    if (pts.length > 1) {
      el("path", { d: lineToPathScreen(pts), class: "at-route" }, gPins);
    }
    var miss = stops.filter(function (s) { return s.missing; }).length;
    setNote("行迹 " + stops.length + " 站" + (miss ? "（" + miss + " 站地点未登记，已跳过）" : "") +
      " ｜ 站点年份可点，底图为示意海岸线");
  }

  function paint() {
    if (!svg) return;
    gBase.setAttribute("transform", "translate(" + cam.x + " " + cam.y + ") scale(" + cam.k + ")");
    renderPins();
    paintBaseYear();
  }

  /* ---------- 年份与取景 ---------- */
  function jumpYear(y) {
    state.year = Math.max(-3000, Math.min(2026, Math.round(y)));
    if (yearInput) yearInput.value = state.year;
    var lab = root.querySelector("#at-year-lab");
    if (lab) lab.textContent = window.ChronTime.formatYear(state.year);
    schedule();
    syncHash();
  }
  function stepYear(dir) {
    var L = window.ChronLoader;
    var evs = L.allEvents();
    var y = state.year + dir;
    for (var guard = 0; guard < 6000; guard++, y += dir) {
      if (y < -3000 || y > 2026) return;
      if (L.allEventsAtYear(y).length) { jumpYear(y); return; }
    }
  }
  function fitTo(coords, pad) {
    if (!coords.length) return fitDefault();
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    coords.forEach(function (c) {
      var p = proj(c[0], c[1]);
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    var W = svg.clientWidth || 800, H = svg.clientHeight || 600;
    pad = pad == null ? 60 : pad;
    var dx = Math.max(maxX - minX, 0.001), dy = Math.max(maxY - minY, 0.001);
    /* extent 为 0（只定位到一个点）时不能按「无限放大」算：k 会顶到上限，
     * 读者看见的是一格纯色底而不是这座城在地图上的位置。单点最多放到 6×。 */
    var cap = (dx < 1 && dy < 1) ? 6 : MAX_K;
    var k = Math.max(MIN_K, Math.min(cap, Math.min((W - pad * 2) / dx, (H - pad * 2) / dy)));
    cam.k = k;
    cam.x = W / 2 - (minX + maxX) / 2 * k;
    cam.y = H / 2 - (minY + maxY) / 2 * k;
    updateHalf();
    schedule(true);
  }
  function fitDefault() {
    var b = window.ChronGeo.basemap();
    var v = (b && b.view) || { west: 65, east: 145, south: 0, north: 60 };
    fitTo([[v.west, v.south], [v.east, v.north]]);
  }
  function fitWorld() {
    var W = svg.clientWidth || 800, H = svg.clientHeight || 600;
    cam.k = Math.max(MIN_K, Math.min(W / WORLD_W, H / (WORLD_W / 2)));
    cam.x = (W - WORLD_W * cam.k) / 2;
    cam.y = (H - WORLD_W * cam.k) / 2;
    updateHalf(); schedule(true);
  }

  /* ---------- 模式 ---------- */
  var MODES = [["events", "事件"], ["journey", "行迹"], ["snapshot", "大势"]];
  function buildModes() {
    var box = root.querySelector("#at-modes");
    box.innerHTML = MODES.map(function (m) {
      return '<button class="tb-btn' + (state.mode === m[0] ? " on" : "") + '" data-mode="' + m[0] + '">' + m[1] + "</button>";
    }).join("");
  }
  function setMode(m) {
    if (m === "journey" && !state.journey) {
      var js = window.ChronGeo.journeys();
      if (js.length) state.journey = js[0].key;
    }
    if (m === "journey" && state.journey) {
      var j = window.ChronGeo.journeyOf(state.journey);
      if (j && j.stops && j.stops.length) jumpYear(j.stops[0].year);
    }
    state.mode = m; buildModes(); schedule(true);
  }

  /* ---------- 地址栏 ---------- */
  function syncHash() {
    if (state.embed) return;
    var q = ["year=" + state.year];
    if (state.place) q.push("place=" + encodeURIComponent(state.place));
    if (state.journey) q.push("journey=" + encodeURIComponent(state.journey));
    var h = "#/atlas?" + q.join("&");
    if (location.hash !== h) history.replaceState(null, "", location.href.split("#")[0] + h);
  }

  /* ---------- 开合 ---------- */
  function open(opts) {
    opts = opts || {};
    ensure();
    wantOpen = true;
    return window.ChronGeo.ensure(["places", "overlay", "journeys", "basemap", "snapshots"]).then(function (okAll) {
      if (!wantOpen) return false;
      if (!okAll) {
        var f = window.ChronGeo.failedList();
        setNote("地理数据没载入：" + (f.join("；") || "未知原因"));
      }
      buildBase(); buildModes();
      root.hidden = false;
      document.body.classList.add("atlas-open");
      if (opts.embed) { state.embed = true; root.classList.add("at-embed"); }
      if (opts.journey) { state.journey = opts.journey; state.mode = "journey"; }
      else if (opts.year != null || opts.place) { state.mode = "events"; }
      /* 上一条深链留下的模式不能赖在这一条上：只给 year 的链接是「看这一年的事」，
       * 不是「接着看刚才那个人」。 */
      buildModes();
      var coords = [];
      if (opts.journey) {
        var j = window.ChronGeo.journeyOf(opts.journey);
        if (j) { window.ChronGeo.journeyPoints(j).forEach(function (s) { if (s.coord) coords.push(s.coord); }); }
      } else if (opts.place) {
        var p = window.ChronGeo.placeOf(opts.place) || window.ChronGeo.resolvePlace(opts.place);
        if (p) { coords.push(p.coord); state.place = p.key; }
      }
      if (opts.year != null) jumpYear(Number(opts.year)); else jumpYear(state.year);
      updateHalf();
      if (coords.length) fitTo(coords, 80); else if (!cam.k) fitDefault();
      else schedule(true);
      return true;
    });
  }
  function close() {
    wantOpen = false;
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.classList.remove("atlas-open");
    if (location.hash.indexOf("#/atlas") === 0) location.hash = "#/timeline";
  }
  function isOpen() { return !!root && !root.hidden; }

  /* ---------- 给 Agent / 自动化用的只读查询 ---------- */
  function inspect(q) {
    var p = q.place ? (window.ChronGeo.placeOf(q.place) || window.ChronGeo.resolvePlace(q.place)) : null;
    var S = window.ChronState, L = window.ChronLoader, PV = window.ChronProv;
    var year = q.year != null ? Number(q.year) : state.year;
    var evs = p ? window.ChronGeo.eventsAtPlace(p.key).filter(function (e) {
      return Math.abs(e.year - year) <= (q.half || 200);
    }) : [];
    return {
      year: year,
      place: p ? { key: p.key, zh: p.zh, modern: p.modern, coord: p.coord, sources: p.sources } : null,
      events: evs.slice(0, 40).map(function (e) {
        return { id: e.id, year: e.year, title: e.title, dim: e.dim, weight: e.weight,
          prov: PV ? PV.labelOf(e) : null, sources: (e.detail.sources || []).slice(0, 3) };
      }),
      trackCounts: { cn: evs.filter(function (e) { return e.track === "cn"; }).length,
        world: evs.filter(function (e) { return e.track === "world"; }).length },
      url: location.href.split("#")[0] + "#/atlas?year=" + year + (p ? "&place=" + encodeURIComponent(p.key) : "")
    };
  }
  function locate(q) {
    open(q || {});
    return inspect(q || {});
  }

  /* 筛选变了，落针必须跟着重画：collectPins 用的正是 S.passesFilter。
   * 这里只问 filterChanged，不自己抄一份「哪些键算筛选」——抄漏哪个键，
   * 画面上就留着读者刚刚亲手排除的那批条目（长河漏 provFloor 是前例）。 */
  var S = window.ChronState;           // 顶层读取：state.js 排在本文件之前
  S.subscribe(function (s, ch) {
    if (!root || root.hidden) return;
    if (S.filterChanged(ch)) schedule(true);
  });
  /* 时间轴那边换了年份（点条目、按 [ ]），舆图跟着走；反向不成立——
   * 舆图自己的年份条不改全局视野，否则拖一下滑块就把时间轴甩出读者刚看的地方。 */
  S.subscribe(function (s, ch) {
    if (!root || root.hidden) return;
    /* ch 是「哪些键变了」的标志位（{selectedYear:true}），不是值本身。
     * 把 ch.selectedYear 当年份用，true 会被 Number() 变成 1，地图就跳到公元 1 年。 */
    if (ch.selectedYear && s.selectedYear != null && s.selectedYear !== state.year) jumpYear(s.selectedYear);
  });

  window.ChronAtlas = {
    open: open, close: close, isOpen: isOpen,
    jumpYear: jumpYear, fitTo: fitTo, fitDefault: fitDefault, fitWorld: fitWorld,
    setMode: setMode, inspect: inspect, locate: locate,
    screenOf: screenOf, proj: proj, state: state, cam: cam
  };
})();
