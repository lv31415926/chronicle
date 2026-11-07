/* atlas-quiz.js | 舆图寻址挑战：给年代与线索，在海岸线底图上落针
 * 依赖：window.ChronAtlas / ChronGeo / ChronLoader / ChronTime / __CHRONICLE_META
 * 发布：window.ChronAtlasQuiz
 *
 * 题源只有本库：题目从「已地理化的条目」里抽，线索取自条目自带的时代、政权与摘要。
 * 不另外编造「某城在某年发生过什么」——那会让一个游戏变成假信息的入口。
 */
(function () {
  "use strict";

  var ROUND = 10, pool = [], qs = [], i = 0, score = 0, active = false;
  var box = null, pin = null, svg = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot" }[c];
    });
  }
  function havKm(a, b) {
    var R = 6371, d2r = Math.PI / 180;
    var dLat = (b[1] - a[1]) * d2r, dLng = (b[0] - a[0]) * d2r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * d2r) * Math.cos(b[1] * d2r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function buildPool() {
    var L = window.ChronLoader, G = window.ChronGeo, M = window.__CHRONICLE_META;
    pool = [];
    L.allEvents().forEach(function (e) {
      if (e.weight < 4) return;
      var c = G.coordFor(e);
      if (!c || c.approx) return;                       /* 区域条目没有精确落点，不出题 */
      if (c.place.coord[0] < 60 || c.place.coord[0] > 150) return;  /* 第一版只在东亚视野内出题 */
      pool.push({ ev: e, coord: c.coord, place: c.place, era: window.ChronTime.eraOf(e.track, e.year) });
    });
    /* 去重：同一地点只留一条，否则连着十题都在问长安。 */
    var seen = {}, out = [];
    pool.forEach(function (p) { if (!seen[p.place.key]) { seen[p.place.key] = 1; out.push(p); } });
    pool = out;
  }

  function pick() {
    if (pool.length < ROUND) { qs = pool.slice(); }
    else {
      /* 梯度：按重要度分三档，各抽若干，前几题容易（都城、名关），后几题刁。 */
      var hi = pool.filter(function (p) { return p.ev.weight === 5; });
      var mid = pool.filter(function (p) { return p.ev.weight === 4; });
      qs = [];
      var take = function (arr, n) {
        for (var k = 0; k < n && arr.length; k++) {
          qs.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
        }
      };
      take(hi, Math.min(4, hi.length));
      take(mid, ROUND - qs.length);
      qs.sort(function () { return Math.random() - 0.5; });
    }
    i = 0; score = 0;
  }

  function ensure() {
    if (box) return;
    box = document.createElement("div");
    box.id = "qz";
    box.className = "qz";
    box.hidden = true;
    box.innerHTML =
      '<div class="qz-card">' +
        '<div class="qz-top"><b id="qz-n">1 / 10</b><span id="qz-score">得分 0</span>' +
        '<button class="tb-btn" id="qz-quit">退出</button></div>' +
        '<div class="qz-q" id="qz-q">—</div>' +
        '<div class="qz-hint" id="qz-hint">在图上点一处落针，再按「确定」。</div>' +
        '<div class="qz-act"><button class="tb-btn" id="qz-ok" disabled>✓ 确定</button>' +
        '<button class="tb-btn" id="qz-next" hidden>下一题 ›</button></div>' +
        '<div class="qz-foot" id="qz-foot">题库＝本站已地理化且带出处的条目；线索不剧透今地名。</div>' +
      "</div>";
    /* 卡片必须挂在地图容器里：.atlas 是 z-60 的 fixed 全屏层，
     * 挂在 body 上的绝对定位卡片会被它整个盖住——题面看不见，游戏就成了「点了没反应」。 */
    (document.querySelector("#atlas .at-map") || document.body).appendChild(box);
    box.querySelector("#qz-quit").addEventListener("click", stop);
    box.querySelector("#qz-ok").addEventListener("click", confirm);
    box.querySelector("#qz-next").addEventListener("click", next);
  }

  var dropped = null;
  function onMapClick(e) {
    if (!active) return;
    var r = svg.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top;
    var c = window.ChronAtlas.cam;
    var g = unprojLocal((px - c.x) / c.k, (py - c.y) / c.k);
    dropped = g;
    drawPin(g);
    box.querySelector("#qz-ok").disabled = false;
    box.querySelector("#qz-hint").textContent = "落针在 " + g[0].toFixed(1) + "°E, " + g[1].toFixed(1) + "°N ｜ 可再点别处调整，按「确定」锁定。";
  }
  /* 反算：与 atlas.js 同一公式，但不共享内部函数，避免把 atlas 的私有实现变成公共契约。 */
  function unprojLocal(px, py) {
    var W = 1024;
    var lng = px / W * 360 - 180;
    var n = Math.PI - 2 * Math.PI * py / W;
    return [lng, 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))];
  }
  function drawPin(g) {
    if (!pin) {
      pin = document.createElementNS("http://www.w3.org/2000/svg", "g");
      pin.setAttribute("class", "qz-pin");
      svg.appendChild(pin);
    }
    var p = window.ChronAtlas.screenOf(g[0], g[1]);
    pin.innerHTML = '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" class="qz-ring"></circle>' +
      '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.5"></circle>';
  }

  function confirm() {
    var q = qs[i];
    if (!q || !dropped) return;
    var km = havKm(dropped, q.coord);
    var pts = km <= 120 ? 3 : km <= 350 ? 2 : km <= 900 ? 1 : 0;
    score += pts;
    active = false;                                  /* 揭晓阶段不接受新的落针 */
    var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    var a = window.ChronAtlas.screenOf(dropped[0], dropped[1]);
    var b = window.ChronAtlas.screenOf(q.coord[0], q.coord[1]);
    line.setAttribute("x1", a[0]); line.setAttribute("y1", a[1]);
    line.setAttribute("x2", b[0]); line.setAttribute("y2", b[1]);
    line.setAttribute("class", "qz-line");
    svg.appendChild(line);
    var truth = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    truth.setAttribute("cx", b[0]); truth.setAttribute("cy", b[1]); truth.setAttribute("r", 5);
    truth.setAttribute("class", "qz-truth");
    svg.appendChild(truth);
    box.querySelector("#qz-hint").innerHTML =
      "正确答案：<b>" + esc(q.place.zh) + "</b>（" + esc(q.place.modern) + "）｜偏差 " +
      Math.round(km).toLocaleString() + " km ｜ 本题 +" + pts +
      '<div class="qz-src">' + esc(q.ev.title) + " · " + (q.ev.detail.sources || []).join("；") + "</div>";
    box.querySelector("#qz-ok").hidden = true;
    box.querySelector("#qz-next").hidden = false;
    box.querySelector("#qz-next").textContent = i + 1 >= qs.length ? "看成绩" : "下一题 ›";
  }

  function next() {
    i++;
    clearMarks();
    if (i >= qs.length) return finish();
    active = true;
    ask();
  }
  function clearMarks() {
    if (pin) pin.remove(); pin = null;
    [].slice.call(svg.querySelectorAll(".qz-line,.qz-truth")).forEach(function (n) { n.remove(); });
    dropped = null;
    box.querySelector("#qz-ok").hidden = false;
    box.querySelector("#qz-ok").disabled = true;
    box.querySelector("#qz-next").hidden = true;
  }

  function ask() {
    var q = qs[i], M = window.__CHRONICLE_META, T = window.ChronTime;
    var tk = M.tracks[q.ev.track];
    box.querySelector("#qz-n").textContent = (i + 1) + " / " + qs.length;
    box.querySelector("#qz-score").textContent = "得分 " + score;
    /* 线索只用条目自带的信息：年代、政权、维度、摘要——摘要里若含今地名会剧透，故打码。 */
    var clue = String(q.ev.summary || "").replace(new RegExp(esc(q.place.modern), "g"), "＿＿");
    clue = clue.replace(new RegExp(esc(q.place.zh), "g"), "＿＿");
    box.querySelector("#qz-q").innerHTML =
      "请在舆图上标定 <b>" + esc(T.formatYear(q.ev.year, q.ev.yearApprox)) + "</b>（" +
      '<i style="color:' + tk.color + '">' + esc(tk.short) + "</i>）的<b>「＿＿」</b>：" +
      esc(q.ev.title) + '<div class="qz-clue">' + esc(clue) + "</div>";
    box.querySelector("#qz-hint").textContent = "在图上点一处落针，再按「确定」。";
    window.ChronAtlas.jumpYear(q.ev.year);
  }

  var RANKS = [[27, "太史令 · 舆图大家"], [21, "职方郎中"], [15, "州郡从事"], [9, "外黄尉"], [0, "初学守令"]];
  function finish() {
    active = false;
    var r = RANKS.find(function (x) { return score >= x[0]; }) || RANKS[RANKS.length - 1];
    box.querySelector("#qz-q").innerHTML = "十题得分 <b>" + score + "</b> ｜ 授「" + esc(r[1]) + "」";
    box.querySelector("#qz-hint").textContent = "再来一局？";
    box.querySelector("#qz-ok").hidden = false;
    box.querySelector("#qz-ok").textContent = "再来一局";
    box.querySelector("#qz-ok").disabled = false;
    box.querySelector("#qz-ok").onclick = function () { this.textContent = "✓ 确定"; this.onclick = null; start(); };
    box.querySelector("#qz-next").hidden = true;
  }

  function start() {
    ensure();
    if (!pool.length) buildPool();
    if (pool.length < 3) {
      window.ChronDetail.flash && window.ChronDetail.flash("可出题的条目不足（地理层还没铺够）", 4000);
      return;
    }
    svg = document.getElementById("at-svg");
    if (!svg || !window.ChronAtlas.isOpen()) { window.ChronAtlas.open({}); }
    setTimeout(function () {
      svg = document.getElementById("at-svg");
      pick(); active = true; box.hidden = false;
      svg.addEventListener("click", onMapClick);
      ask();
    }, 60);
  }
  function stop() {
    active = false;
    if (box) box.hidden = true;
    if (svg) svg.removeEventListener("click", onMapClick);
    clearMarks();
  }

  window.ChronAtlasQuiz = {
    open: start, stop: stop,
    isActive: function () { return active; },
    poolSize: function () { return pool.length; }
  };
})();
