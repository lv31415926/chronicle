/* app.js | 启动装配：加载元数据 → 构建控件 → 初始化时间轴与交互 → 状态回显 */
(function () {
  "use strict";

  var S = window.ChronState, T = window.ChronTime, L = window.ChronLoader,
      Tm = window.ChronTimeline, M = window.__CHRONICLE_META, PV = window.ChronProv;

  var el = {};

  function $(id) { return document.getElementById(id); }

  /* ---------- 维度筛选 chips ---------- */
  function buildDimChips() {
    var box = $("dim-chips");
    box.innerHTML = M.dimOrder.map(function (d) {
      var dim = M.dimensions[d];
      return '<button class="chip dim on" data-dim="' + d + '" style="--c:' + dim.color + '" ' +
        'aria-pressed="true" title="' + dim.label + '（单击筛选，Alt+单击独显）">' +
        '<i class="sh" data-sh="' + dim.shape + '" style="background:' + dim.color + '"></i>' +
        '<span>' + dim.label + "</span><em class=\"n\" data-n=\"" + d + "\"></em></button>";
    }).join("");
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-dim]");
      if (!b) return;
      var d = b.getAttribute("data-dim");
      if (e.altKey) S.soloDim(d);
      else S.toggleDim(d);
      syncChips();
    });
    $("dim-all").addEventListener("click", function () { S.allDims(true); syncChips(); });
    $("dim-none").addEventListener("click", function () { S.allDims(false); S.toggleDim("politics"); syncChips(); });
  }

  function syncChips() {
    var st = S.get();
    document.querySelectorAll("#dim-chips [data-dim]").forEach(function (b) {
      var d = b.getAttribute("data-dim");
      b.classList.toggle("on", !!st.dims[d]);
      b.setAttribute("aria-pressed", st.dims[d] ? "true" : "false");
    });
  }

  /* 维度计数（当前视窗内、通过筛选） */
  function updateDimCounts() {
    var st = S.get();
    var evs = L.eventsIn(Math.floor(st.view.from), Math.ceil(st.view.to));
    var n = {};
    M.dimOrder.forEach(function (d) { n[d] = 0; });
    evs.forEach(function (e) { if (st.tracks[e.track] && e.weight >= st.weightFloor) n[e.dim]++; });
    M.dimOrder.forEach(function (d) {
      var t = document.querySelector('[data-n="' + d + '"]');
      if (t) t.textContent = n[d] ? n[d] : "";
    });
  }

  /* ---------- 缩放滑杆 ---------- */
  function buildZoom() {
    var sl = $("zoom");
    var MINL = Math.log(12), MAXL = Math.log(M.yearMax - M.yearMin + 400);
    function spanToVal(s) { return (Math.log(Math.max(12, s)) - MINL) / (MAXL - MINL) * 1000; }
    function valToSpan(v) { return Math.exp(MINL + v / 1000 * (MAXL - MINL)); }
    sl.max = 1000; sl.min = 0; sl.step = 1;
    sl.addEventListener("input", function () {
      var vp = Tm.viewport;
      var center = (vp.from + vp.to) / 2;
      var span = valToSpan(Number(sl.value));
      Tm.zoomToRange(center - span / 2, center + span / 2);
    });
    return { sl: sl, spanToVal: spanToVal, vp: function () { return Tm.viewport; } };
  }

  /* ---------- 时间区间（全局筛选，与视野分家） ---------- */
  /* 解析与回显同源（ChronTime.parseYear / formatYearShort），
   * 分成两份实现迟早会各自漂移：输入框会被回显重写，读不回就是静默失效。 */
  var parseYearInput = T.parseYear;
  var yearToText = function (y) { return T.formatYearShort(y); };

  /* 用户只改一端时另一端沿用现值；两端都读不出数字则整体回弹，不写入半截区间 */
  function commitRange() {
    var r = S.get().range;
    var a = parseYearInput($("range-from").value);
    var b = parseYearInput($("range-to").value);
    if (a === null && b === null) { syncRangeUI(); return; }
    S.setRange(a === null ? r.from : a, b === null ? r.to : b);
    flyToRange(S.get().range);
    syncRangeUI();
  }

  /* 区间是筛选，视野是镜头；只有用户亲手设定区间才带动画跟过去，
   * 滚轮缩放反过来永不动区间，否则两者会互相覆写。 */
  function flyToRange(r) {
    Tm.flyToYear((r.from + r.to) / 2, Math.max(12, r.to - r.from));
  }

  function centuryRange(y) {
    var c = T.centuryOf(y);
    return y > 0 ? { from: (c - 1) * 100 + 1, to: c * 100 }
                 : { from: -c * 100, to: -(c - 1) * 100 - 1 };
  }

  /* 时代带：中国与世界两套带同年可能各有归属，按选中事件的轨道取，其次中国。
   * 带与带在改元/开国的边界年份上刻意重叠（元 1271–1368 与 明 1368–1644），
   * 取「起始最晚」的命中者，与 polityOf 的边界年归新政权口径一致。 */
  function eraRange(y) {
    var st = S.get(), ev = st.selectedId && L.eventById(st.selectedId);
    var order = ev ? [ev.track, ev.track === "cn" ? "world" : "cn"] : ["cn", "world"];
    for (var i = 0; i < order.length; i++) {
      var list = order[i] === "cn" ? M.cnEras : M.worldEras, hit = null;
      for (var j = 0; j < list.length; j++) {
        var e = list[j];
        if (y >= e.from && y <= e.to && (!hit || e.from > hit.from)) hit = e;
      }
      if (hit) return { from: hit.from, to: hit.to };
    }
    return null;
  }

  function applyPreset(key) {
    var st = S.get();
    var anchor = st.selectedYear || Math.round((st.view.from + st.view.to) / 2);
    var r = null;
    if (key === "all") r = { from: M.yearMin, to: M.yearMax };
    else if (key === "view") r = { from: Math.floor(st.view.from), to: Math.ceil(st.view.to) };
    else if (key === "century") r = centuryRange(anchor);
    else if (key === "era") r = eraRange(anchor);
    else if (key === "last100" || key === "last500") {
      var n = key === "last100" ? 100 : 500;
      r = { from: M.yearMax - n + 1, to: M.yearMax };
    }
    if (!r) return false;
    S.setRange(r.from, r.to);
    return true;
  }

  /* 区间会被 restore / 长河的「区间 ±20%」/ 预设 从别处改掉，故由状态反推输入框 */
  function syncRangeUI() {
    var r = S.get().range, ae = document.activeElement;
    var f = $("range-from"), t = $("range-to");
    if (ae !== f) f.value = yearToText(r.from);
    if (ae !== t) t.value = yearToText(r.to);
  }

  function buildRange() {
    var f = $("range-from"), t = $("range-to"), ps = $("range-preset");
    [f, t].forEach(function (inp) {
      inp.addEventListener("change", commitRange);
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commitRange(); inp.blur(); }
      });
    });
    ps.addEventListener("change", function () {
      if (!ps.value) return;
      if (applyPreset(ps.value)) flyToRange(S.get().range);
      ps.value = "";
      syncRangeUI();
    });
    $("btn-river").addEventListener("click", function () {
      ChronRiver.isOpen() ? ChronRiver.close() : ChronRiver.open({});
    });
    window.addEventListener("chronicle:river", syncToggles);
    syncRangeUI();
  }

  /* ---------- 快捷跳转 ---------- */
  var PRESETS = [
    { label: "全程", from: M.yearMin, to: M.yearMax },
    { label: "上古", from: -3000, to: -221 },
    { label: "春秋战国", from: -841, to: -221 },
    { label: "秦汉", from: -221, to: 220 },
    { label: "唐宋", from: 618, to: 1279 },
    { label: "明清", from: 1368, to: 1912 },
    { label: "近代", from: 1840, to: 1949 },
    { label: "当代", from: 1949, to: 2026 },
    { label: "一战二战", from: 1914, to: 1946 },
    { label: "冷战", from: 1945, to: 1992 }
  ];

  function buildPresets() {
    var box = $("presets");
    box.innerHTML = PRESETS.map(function (p, i) {
      return '<button data-p="' + i + '">' + p.label + "</button>";
    }).join("");
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-p]");
      if (!b) return;
      var p = PRESETS[Number(b.getAttribute("data-p"))];
      Tm.flyToYear((p.from + p.to) / 2, p.to - p.from);
    });
  }

  /* ---------- 主题线下拉 ---------- */
  function buildThemeSelect() {
    var sel = $("theme-select");
    var ths = window.__CHRONICLE_THEMES || [];
    sel.innerHTML = '<option value="">选择主题时间线…</option>' +
      ths.map(function (t) { return '<option value="' + t.id + '">' + t.label + "</option>"; }).join("");
    sel.addEventListener("change", function () {
      if (sel.value) { ChronThemes.openById(sel.value); }
    });
  }

  /* ---------- 图例 ---------- */
  function buildLegend() {
    var box = $("legend");
    box.innerHTML =
      '<div class="lg-row"><b>轨道</b>' +
      ['cn', 'world'].map(function (t) {
        return '<button class="lg tk" data-track="' + t + '" aria-pressed="true">' +
          '<i style="background:' + M.tracks[t].color + '"></i>' + M.tracks[t].label + "</button>";
      }).join("") + "</div>" +
      '<div class="lg-row"><b>维度（形状二次编码）</b>' +
      M.dimOrder.map(function (d) {
        return '<span class="lg"><i class="sh" data-sh="' + M.dimensions[d].shape + '" style="background:' +
          M.dimensions[d].color + '"></i>' + M.dimensions[d].label + "</span>";
      }).join("") + "</div>" +
      '<div class="lg-row"><b>溯源</b>' +
      /* 四级清单由 prov.js 生成，不在此手写：加了新档却漏了图例，读者就只见到一个没解释的标签 */
      PV.TIERS.map(function (t) {
        return '<span class="lg">' + PV.badgeTier(t.key) + "<em>" + PV.esc(t.hint) + "</em></span>";
      }).join("") + "</div>" +
      '<div class="lg-row"><b>重要度</b><span class="lg">点/形越大越重要：weight 1–5</span>' +
      '<span class="lg" style="color:var(--ink-faint)">~ 前缀 = 年代为学界推定</span></div>';
    box.addEventListener("click", function (e) {
      var b = e.target.closest("[data-track]");
      if (!b) return;
      S.toggleTrack(b.getAttribute("data-track"));
      syncTrackBtns();
    });
  }

  function syncTrackBtns() {
    document.querySelectorAll("#legend [data-track]").forEach(function (b) {
      var t = b.getAttribute("data-track");
      b.classList.toggle("off", !S.get().tracks[t]);
      b.setAttribute("aria-pressed", S.get().tracks[t] ? "true" : "false");
    });
  }

  /* ---------- 状态条 ---------- */
  function updateStatus() {
    var st = S.get(), vp = Tm.viewport;
    if (!vp) return;
    $("st-view").textContent = T.formatYear(Math.round(vp.from)) + " — " + T.formatYear(Math.round(vp.to)) +
      "（" + Math.round(vp.span) + " 年 · " + st.lod + "）";
    var s = L.stats();
    var c = L.yearCoverage();
    var bad = L.failedChunks();
    $("st-data").textContent = "已载 " + s.total + " 条 / " + s.loadedChunks + "·" + s.totalChunks + " 分片" +
      (c.distinctYears ? " · 覆盖 " + c.distinctYears + " 个年份" : "") +
      (bad.length ? " · ⚠ " + bad.length + " 片载入失败" : "");
    if (el.zoom) el.zoom.sl.value = el.zoom.spanToVal(vp.span);
    $("year-jump-label").textContent = st.selectedYear ? T.formatYear(st.selectedYear) : "—";
    updateDimCounts();
  }

  /* ---------- 控件接线 ---------- */
  function wire() {
    $("btn-mode").addEventListener("click", function () {
      S.patch({ mode: S.get().mode === "overlay" ? "split" : "overlay" });
      Tm.resize();
      syncToggles();
    });
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-mode");
        if (m === S.get().mode) return;
        S.patch({ mode: m });
        Tm.resize();
        syncToggles();
      });
    });
    $("btn-theme").addEventListener("click", function () {
      S.patch({ theme: S.get().theme === "dark" ? "light" : "dark" });
      syncToggles();
    });
    $("btn-bridge").addEventListener("click", function () {
      Tm.opts.showBridge = !Tm.opts.showBridge;
      this.classList.toggle("on", Tm.opts.showBridge);
      Tm.invalidate();
    });
    $("btn-flow").addEventListener("click", function () {
      Tm.opts.showFlow = !Tm.opts.showFlow;
      this.classList.toggle("on", Tm.opts.showFlow);
      if (window.ChronFlow) ChronFlow.reset();
      Tm.invalidate();
    });
    $("btn-labels").addEventListener("click", function () {
      Tm.opts.showLabels = !Tm.opts.showLabels;
      this.classList.toggle("on", Tm.opts.showLabels);
      Tm.invalidate();
    });
    $("btn-compare").addEventListener("click", function () {
      ChronCompare.render(S.get().selectedYear || Math.max(M.yearMin, Math.min(M.yearMax, new Date().getFullYear())));
    });
    $("btn-search").addEventListener("click", function () { ChronSearch.open(); });
    $("btn-help").addEventListener("click", function () { $("help").hidden = !$("help").hidden; });
    $("help-close").addEventListener("click", function () { $("help").hidden = true; });
    $("btn-loadall").addEventListener("click", function () {
      var b = this;
      b.disabled = true; b.textContent = "加载中…";
      L.ensureAll().then(function () {
        Tm.invalidate(); b.disabled = false; b.textContent = "加载全部分片";
        ChronDetail.isOpen() && ChronDetail.flash("全部分片已加载");
        window.dispatchEvent(new Event("chronicle:ready"));
      });
    });

    var wf = $("weight-floor");
    wf.min = 1; wf.max = 5; wf.value = 1;
    wf.addEventListener("input", function () {
      S.patch({ weightFloor: Number(wf.value) });
      $("weight-floor-label").textContent = "≥" + wf.value;
    });

    var pf = $("prov-floor");
    /* 选项由档位表按强度升序生成：手写四行则加一档必然漏一档，
     * 而漏掉的恰好是最严的那格——读者以为筛到了顶，其实筛的是上一档。 */
    var byRank = PV.TIERS.slice().sort(function (a, b) { return PV.RANK[a.key] - PV.RANK[b.key]; });
    pf.innerHTML = byRank.map(function (t, i) {
      return '<option value="' + PV.RANK[t.key] + '">' +
        (i === 0 ? "全部来源" : "≥ " + PV.floorLabel(PV.RANK[t.key])) + "</option>";
    }).join("");
    pf.value = String(S.get().provFloor);   /* restore() 先于 wire()：门槛要能被刷新回来 */
    pf.addEventListener("change", function () {
      S.patch({ provFloor: Number(pf.value) | 0 });
    });

    var yj = $("year-jump");
    yj.addEventListener("change", function () {
      var v = parseInt(yj.value, 10);
      if (!Number.isFinite(v) || v === 0) return;
      v = Math.max(M.yearMin, Math.min(M.yearMax, v));
      S.patch({ selectedYear: v });
      Tm.flyToYear(v, Math.max(20, Tm.viewport.span));
      ChronDetail.openYear(v);
    });
    $("btn-jump-prev").addEventListener("click", function () { jumpEventYear(-1); });
    $("btn-jump-next").addEventListener("click", function () { jumpEventYear(1); });
  }

  function jumpEventYear(dir) {
    var st = S.get();
    var cur = st.selectedYear || Math.round((st.view.from + st.view.to) / 2);
    var nxt = window.ChronInteraction.nearestYearWithEvents(cur, dir);
    if (nxt === null) return;
    S.patch({ selectedYear: nxt, selectedId: null });
    Tm.flyToYear(nxt, Math.max(14, st.view.to - st.view.from));
    ChronDetail.openYear(nxt);
  }

  /* ---------- 启动 ---------- */
  /* 模式与主题会从 localStorage 恢复，控件态一律由状态反推；
   * 只在点击回调里改类名会让按钮停在 HTML 写死的默认值上。 */
  function syncToggles() {
    var st = S.get();
    $("btn-mode").textContent = st.mode === "overlay" ? "叠加对照" : "分栏对照";
    document.querySelectorAll("[data-mode]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-mode") === st.mode);
    });
    $("btn-theme").textContent = st.theme === "dark" ? "深墨" : "宣纸";
    $("btn-river").classList.toggle("on", !!(window.ChronRiver && ChronRiver.isOpen()));
    /* 下拉必须跟着状态走：抽屉里的「放宽到全部来源」改的是同一个值，
     * 不同步就会出现「已经放宽了、控件还指着最严那格」。 */
    var pf = $("prov-floor");
    if (pf) pf.value = String(st.provFloor);
    syncRangeUI();
  }

  /* 进入闸门：ready=数据已到（进度条停），armed=引言读完（整屏皆入口）。
   * 撤遮罩只由用户触发；fail 态另走 catch 的「点击重载」，两条路互斥，
   * 否则报错屏会被这个入口判成「已经进过」而永久盖死。 */
  function armEnter(afterMs) {
    var b = $("boot"), btn = $("boot-enter");
    b.classList.add("ready");
    function reveal() {
      btn.hidden = false;
      /* 用一次强制重排代替 requestAnimationFrame：后台标签页里 rAF 永不回调，
       * 按钮会永久停在 opacity:0——整屏都算入口，唯独最显眼的那个不亮。
       * 读 offsetWidth 足以让 hidden=false 先落一帧，过渡照样成立。 */
      void btn.offsetWidth;
      btn.classList.add("show");
      b.classList.add("armed");
      /* 只把焦点交给按钮：回车/空格经它自己的 click 冒泡到遮罩即算入河。
       * 这里不再另挂 keydown——那会让一次回车同时落进 interaction.js 的 Enter 分支，
       * 携带 selectedYear 的老用户一进门就撞开一个详情抽屉。 */
      try { btn.focus({ preventScroll: true }); } catch (e) { /* 老浏览器不认参数 */ }
    }
    if (afterMs > 0) setTimeout(reveal, afterMs); else reveal();

    function enter() {
      if (b.classList.contains("fail") || b.classList.contains("done")) return;
      b.classList.add("done");
      b.removeEventListener("click", enter);
    }
    b.addEventListener("click", enter);
  }

  /* 首屏之后的后台补齐。
   * requestIdleCallback 只是礼貌，不是保险：有它则由 timeout 保证最终一定执行，
   * 没它（Safari）则固定延时执行——两条路都必须把剩下的分片取完。少了这一步，
   * 「视窗优先」就退化成「永远只有视窗里那几片」，拿优化当借口少给数据比慢一点严重得多。
   * 补齐完成派发 chronicle:rest：长河顶部写着「数据仅载入 x/y 片」，全片落地后
   * 那句话就成了假话，必须由它的渲染者刷新一次（只在收尾时一次，不逐片重画）。 */
  function topUpOnIdle() {
    var run = function () {
      var v = S.get().view;
      L.ensureRest(Math.floor(v.from), Math.ceil(v.to)).then(function (n) {
        if (n) Tm.invalidate();
        updateStatus();
        window.dispatchEvent(new CustomEvent("chronicle:rest", { detail: { added: n } }));
      }).catch(function (e) {
        /* 启动遮罩已经让位，这里不能再用 catch 里那套 .fail 把整屏盖回来；
         * 缺片由状态栏的「已载 x·y 分片」如实呈现。 */
        console.error("[app] 后台补齐中断：" + e.message);
        updateStatus();
      });
    };
    if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1200);
  }

  function boot() {
    S.restore();
    document.documentElement.setAttribute("data-theme", S.get().theme);
    syncToggles();
    $("btn-bridge").classList.add("on");
    $("btn-labels").classList.add("on");

    buildDimChips(); syncChips();
    buildLegend(); syncTrackBtns();
    buildPresets(); buildThemeSelect(); buildRange(); wire();
    el.zoom = buildZoom();

    Tm.init($("tl-canvas"), $("tl-wrap"), $("minimap"));
    window.ChronInteraction.init($("tl-canvas"), $("minimap"));
    /* 只做事件委托，不读数据，所以挂在加载之前：晚一步挂上，
     * 遮罩撤掉前那几毫秒里点到的按钮就是真没反应。 */
    if (window.ChronContribute) ChronContribute.mount();

    var t0 = performance.now();
    /* 引言逐字落定约 1.9s，出处小字 2.4s 才站稳；数据往往 300ms 就到。
     * 旧实现到点自动撤遮罩，读者刚看完半句，两万多年历史就劈面砸下来。
     * 现在改成「读完再请进」：到点只让「进入长河」浮现，何时入河由人点。
     * （不会冻死：加载失败另有 catch 的「点击重载」出口，且与这里的入口互斥。） */
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var ENTER_REVEAL = reduceMotion ? 1200 : 3200;
    Promise.all([
      L.injectReady ? L.injectReady() : L.ensureManifest()
    ]).then(function () {
      /* 首屏只等视窗那几片。54 个文件、1.7 MB（brotli）压在「进入长河」之前，
       * 本地双击 file:// 察觉不到，一上线就是每个新访客的首屏等待。
       * 余下的交给 topUpOnIdle()；深链（#/event、#/river、主题线）另有 ensureAll 兜底，
       * 所以「先看到局部」不会变成「永远只看到局部」。 */
      return L.ensureRange(Math.floor(S.get().view.from), Math.ceil(S.get().view.to));
    }).then(function () {
      Tm.invalidate();
      S.patch({ ready: true });
      var bad = L.failedChunks(), s = L.stats();
      $("boot-stat").textContent = "已载入 " + s.total + " 条事件（视窗内 " + s.loadedChunks + "/" + s.totalChunks +
        " 片，其余在后台补齐，" + Math.round(performance.now() - t0) + " ms）" +
        (bad.length ? "；有 " + bad.length + " 片未能载入：" + bad.map(function (b) { return b.id; }).join("、") : "");
      armEnter(Math.max(0, ENTER_REVEAL - (performance.now() - t0)));
      window.dispatchEvent(new Event("chronicle:ready"));
      window.ChronRouter.init();
      updateStatus();
      S.subscribe(function () { syncToggles(); updateStatus(); });
      document.addEventListener("chronicle:chunk", function () { updateStatus(); });
      topUpOnIdle();
    }).catch(function (e) {
      console.error(e);
      /* #boot 是整屏遮罩（position:fixed; inset:0; z-index:60）。只加 .fail 不改
       * 遮罩本身，等于把整站永久盖死——报错屏必须是出口，不能是终点。 */
      $("boot-stat").textContent = "数据加载失败：" + e.message +
        "（请确认 data/manifest.js 与分片文件已就位）· 点击任意处重试";
      $("boot").classList.add("fail");
      $("boot").addEventListener("click", function () { location.reload(); }, { once: true });
    });
  }

  window.ChronApp = {
    boot: boot, syncChips: syncChips, updateStatus: updateStatus,
    updateDimCounts: updateDimCounts
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
