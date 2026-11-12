/* river.js | 全屏「长河」视图：把一组事件（检索词 / 主题线 / 当前筛选）按时间铺成可通读的流
 * 层级 z-index 38：低于详情抽屉(40)、气泡(50)、检索面板(70)，让浮层能盖在它上面。 */
(function () {
  "use strict";

  var L = window.ChronLoader, T = window.ChronTime, S = window.ChronState, M = window.__CHRONICLE_META;
  var PV = window.ChronProv;

  var root, body, toc, statsEl, open0 = false, source = null, sort = "year", onlyFilter = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- 取数 ---------- */
  function collect() {
    var r = S.get().range, out = [], i, e;
    if (source && source.annals) {
      /* 编年原文铺长河：节点不是条目，没有 weight/dim/track，只有年与句。
       * 这里包一层而不是改 schema——密层的价值正是「同一年的原文并排」，
       * 把它冒充成条目会把权重、维度、溯源三套筛选全喂进空值。 */
      out = source.annals.map(function (n) { return { year: n.y, _an: n }; });
    } else if (source && source.ids) {
      for (i = 0; i < source.ids.length; i++) {
        e = L.eventById(source.ids[i]);
        if (e) out.push(e);
      }
    } else if (source && source.query && window.ChronSearch) {
      out = ChronSearch.run(source.query, 5000).map(function (x) { return x.h.ev; });
    } else {
      out = L.allEvents();
    }
    out = out.filter(function (e) { return e.year >= r.from && e.year <= r.to; });
    if (onlyFilter) out = out.filter(S.passesFilter);
    /* 同一事件可能既在检索命中又在链条里：按 id 去重，否则长河里会出现重复行。
     * 编年节点没有 ev id，用它自己的编号——写成 e.id 会让全部原文只剩第一条
     * （undefined 也是键，第二条起就被当成重复）。 */
    var seen = {};
    out = out.filter(function (e) {
      var k = e._an ? "an|" + e._an.i : e.id;
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    out.sort(sort === "weight"
      ? function (a, b) { return b.weight - a.weight || a.year - b.year; }
      : function (a, b) { return a.year - b.year || b.weight - a.weight; });
    return out;
  }

  /* ---------- 分节：跨度决定粒度，世纪/十年/单年三档 ---------- */
  function bucketOf(y, mode) {
    if (mode === "year") return { k: "y" + y, lo: y, hi: y };
    if (mode === "decade") {
      var a = Math.abs(y), d = Math.floor(a / 10) * 10;
      return { k: (y < 0 ? "db" : "dc") + d, lo: y < 0 ? -(d + 9) : d, hi: y < 0 ? -d : d + 9 };
    }
    var c = T.centuryOf(y);
    return { k: (y < 0 ? "cb" : "cc") + c, lo: y < 0 ? -(c * 100) : (c - 1) * 100 + 1, hi: y < 0 ? -((c - 1) * 100 + 1) : c * 100 };
  }

  function sectionize(items) {
    if (!items.length) return [];
    var span = items[items.length - 1].year - items[0].year;
    var mode = sort === "weight" ? "none" : (span <= 30 ? "year" : span <= 240 ? "decade" : "century");
    if (mode === "none") {
      return [{ label: "按重要度排列", short: "重要度序", lo: items[0].year, hi: items[items.length - 1].year, items: items }];
    }
    var order = [], map = {};
    items.forEach(function (e) {
      var b = bucketOf(e.year, mode);
      if (!map[b.k]) { map[b.k] = { lo: b.lo, hi: b.hi, items: [] }; order.push(b.k); }
      map[b.k].items.push(e);
    });
    return order.map(function (k) {
      var s = map[k], y0 = s.items[0].year;
      s.label = (mode === "century" ? T.formatCentury(y0)
        : mode === "decade" ? T.formatYearShort(s.lo) + "—" + T.formatYearShort(s.hi) + " 年代"
        : T.formatYearShort(s.lo) + " 年");
      /* 目录条要一眼可辨：全称世纪名在按比例收窄后会被裁成一串看不出差别的
       * 「前第二十」，故目录用紧凑名，正文标题保留全称。 */
      var round = s.lo < 0 ? s.hi : s.lo;
      s.short = (mode === "century" ? T.centuryAbbrev(y0)
        : mode === "decade" ? T.formatYearShort(round) + "s"
        : T.formatYearShort(y0));
      return s;
    });
  }

  /* ---------- 渲染 ---------- */
  /* 编年一行：年月日标签 + 原文整句 + 卷次与系年来源。
   * 原文不截断——这一层卖的就是「史书到底怎么写的」，掐头去尾等于又变成转述。 */
  function annalsRow(n) {
    var A = window.ChronAnnals;
    return '<li class="rv-it rv-an an-' + esc(n.s) + '">' +
      '<button class="rv-y" data-an-year="' + esc(n.y) + '" title="打开这一年的编年">' +
        esc(T.formatYearShort(n.y)) + "</button>" +
      '<span class="rv-g an-g">' + esc((A && A.SECTION_LABEL[n.s]) || n.s) + "</span>" +
      '<div class="rv-c">' +
        '<div class="rv-t">' + esc(A ? A.whenLabel(n) : "") +
          '<span class="rv-w">' + esc((A && A.KIND_LABEL[n.k]) || n.k) + "</span></div>" +
        '<p class="rv-s an-q">' + esc(n.q) + "</p>" +
        '<div class="rv-m"><span>明史卷' + esc(n.j) + "</span>" +
          "<span>" + esc(n.e || "") + "</span>" +
          '<span class="an-anchor an-a-' + esc(n.a) + '" title="' +
            (n.a === "b" ? "这句自己没写年月，年代跟着本纪排" : "年月或年号写在这句里") + '">' +
            (n.a === "b" ? "本纪系年" : "句内自标") + "</span></div>" +
      "</div></li>";
  }

  function itemRow(e) {
    if (e._an) return annalsRow(e._an);
    var d = M.dimensions[e.dim], tk = M.tracks[e.track], era = T.eraOf(e.track, e.year);
    return '<li class="rv-it" data-ev="' + esc(e.id) + '">' +
      '<button class="rv-y" data-fly="' + esc(e.id) + '" title="在时间轴上定位">' +
        esc(T.formatYearShort(e.year, e.yearApprox)) + "</button>" +
      '<span class="rv-g" style="color:' + d.color + '">' + d.glyph + "</span>" +
      '<div class="rv-c">' +
        '<div class="rv-t">' + esc(e.title) + (PV ? PV.badge(e) : "") +
          '<span class="rv-w" title="重要度 ' + e.weight + '/5">' + "★".repeat(e.weight) + "</span></div>" +
        '<div class="rv-m">' +
          '<b style="color:' + tk.color + '">' + esc(tk.short) + "</b>" +
          "<span>" + esc(d.label) + "</span>" +
          (era ? "<span>" + esc(era.label) + "</span>" : "") +
          "<span>" + esc(T.formatCentury(e.year)) + "</span>" +
          (e.detail && e.detail.place ? '<span class="rv-p">' + esc(e.detail.place) + "</span>" : "") +
        "</div>" +
        '<p class="rv-s">' + esc(e.summary) + "</p>" +
      "</div></li>";
  }

  function render() {
    if (!root) return;
    var items = collect(), r = S.get().range, secs = sectionize(items), st = L.stats();
    var isAn = items.length > 0 && !!items[0]._an;
    var cn = items.filter(function (e) { return e.track === "cn"; }).length;

    var srcName = source && source.label ? source.label : "当前筛选";
    /* 整条长河的溯源构成：逐节点看标签太累，读者要的是「我接下来读的这一片凭什么」。
     * 编年原文没有本站的溯源等级——它本身就是底本，硬套 PV 会把「原文」显示成
     * 「仅书名」那一档，等于用一个不相关的尺子量它，所以这一行换成卷次与部类构成。 */
    var ps = (PV && !isAn) ? PV.stats(items) : null;
    var pvSum = ps ? PV.TIERS.filter(function (t) { return ps[t.key] > 0; })
      .map(function (t) { return t.label + " " + ps[t.key]; }).join(" · ") : "";
    statsEl.innerHTML = "<b>" + items.length + "</b> 个节点 · " +
      "<span>" + esc(T.formatYear(r.from)) + " — " + esc(T.formatYear(r.to)) + "</span>" +
      (isAn ? "<span>《明史》原文 · 逐字引自底本</span>"
            : "<span>中国 " + cn + " / 世界 " + (items.length - cn) + "</span>") +
      (pvSum ? '<span class="rv-pv" title="' + esc(pvSum) + '">溯源：' + esc(pvSum) + "</span>" : "") +
      '<span class="rv-src">来源：「' + esc(srcName) + "」</span>" +
      (st.loadedChunks < st.totalChunks
        ? '<span class="rv-warn">数据仅载入 ' + st.loadedChunks + "/" + st.totalChunks + " 片，长河尚不完整</span>"
        : "");

    if (!items.length) {
      toc.innerHTML = "";
      body.innerHTML = '<div class="rv-none">这个区间里没有匹配的条目。' +
        "可先「加载全部分片」、放宽维度或重要度筛选、降低顶栏的溯源门槛、或扩大区间。</div>";
      return;
    }

    toc.innerHTML = secs.map(function (s, i) {
      return '<button data-sec="' + i + '" title="' + esc(s.label) + '">' +
        "<span>" + esc(s.short) + "</span><i>" + s.items.length + "</i></button>";
    }).join("");

    body.innerHTML = secs.map(function (s, i) {
      var y0 = s.items[0].year, y1 = s.items[s.items.length - 1].year;
      var range = y0 === y1 ? s.items.length + " 条"
        : T.formatYearShort(y0) + " — " + T.formatYearShort(y1) + " · " + s.items.length + " 条";
      return '<section class="rv-sec" id="rv-sec-' + i + '">' +
        '<h3><span class="rv-h-l">' + esc(s.label) + "</span>" +
        '<span class="rv-h-r">' + esc(range) + "</span></h3>" +
        '<ul class="rv-ul">' + s.items.map(itemRow).join("") + "</ul></section>";
    }).join("");
    body.scrollTop = 0;
  }

  /* ---------- DOM ---------- */
  function ensure() {
    if (root) return;
    root = document.createElement("div");
    root.id = "river";
    root.className = "river";
    root.hidden = true;
    root.innerHTML =
      '<header class="rv-head">' +
        '<div class="rv-head-l"><h2 id="rv-title">长河</h2><div class="rv-stats" id="rv-stats"></div></div>' +
        '<div class="rv-head-r">' +
          '<label class="rv-chk"><input type="checkbox" id="rv-filter"> 仅当前筛选</label>' +
          '<button class="tb-btn" id="rv-sort">排序：时间</button>' +
          '<button class="tb-btn" id="rv-wide">区间 ±20%</button>' +
          '<button class="tb-btn" id="rv-close">关闭 ✕</button>' +
        "</div>" +
      "</header>" +
      '<nav class="rv-toc" id="rv-toc"></nav>' +
      '<div class="rv-body" id="rv-body" tabindex="-1"></div>';
    document.body.appendChild(root);
    body = root.querySelector("#rv-body");
    toc = root.querySelector("#rv-toc");
    statsEl = root.querySelector("#rv-stats");

    root.addEventListener("click", function (e) {
      var sec = e.target.closest("[data-sec]");
      if (sec) {
        var n = body.querySelector("#rv-sec-" + sec.getAttribute("data-sec"));
        if (!n) return;
        var top = n.offsetTop - 8;
        /* 跨两万多像素的平滑滚动实测要跑 1.2 秒以上，点目录应当立刻到位；
         * 只有近距离跳转才值得动画。 */
        if (Math.abs(top - body.scrollTop) > body.clientHeight * 2) body.scrollTop = top;
        else body.scrollTo({ top: top, behavior: "smooth" });
        return;
      }
      var fly = e.target.closest("[data-fly]");
      if (fly) {
        var ev0 = L.eventById(fly.getAttribute("data-fly"));
        if (ev0) { S.patch({ selectedYear: ev0.year }); ChronTimeline.flyToYear(ev0.year, 30); }
        return;
      }
      var an = e.target.closest("[data-an-year]");
      if (an) { if (window.ChronAnnals) ChronAnnals.openYear(an.getAttribute("data-an-year")); return; }
      var it = e.target.closest("[data-ev]");
      if (it && window.ChronDetail) ChronDetail.openEvent(it.getAttribute("data-ev"));
    });
    root.querySelector("#rv-close").addEventListener("click", close);
    root.querySelector("#rv-sort").addEventListener("click", function () {
      sort = sort === "year" ? "weight" : "year";
      this.textContent = "排序：" + (sort === "year" ? "时间" : "重要度");
      render();
    });
    root.querySelector("#rv-filter").addEventListener("change", function () {
      onlyFilter = this.checked; render();
    });
    /* 区间由顶栏控件驱动；长河里只留一个「放宽」出口，避免读着读着发现缺头缺尾 */
    root.querySelector("#rv-wide").addEventListener("click", function () {
      var r = S.get().range, pad = Math.max(10, Math.round((r.to - r.from) * 0.2));
      S.setRange(r.from - pad, r.to + pad);
    });
  }

  function open(opts) {
    ensure();
    source = opts || {};
    /* 编年原文不是条目：维度/权重/溯源三套筛选量的是它身上没有的字段，「按重要度」也是。
     * 实测带着这两颗控件进来，167 条原文被 S.passesFilter 筛成 0 条——
     * 所以这一路把控件收掉，而不是留着让读者以为「我筛过了所以没了」。 */
    var an = !!source.annals;
    onlyFilter = !an && !(source.ids || source.query);
    root.querySelector(".rv-chk").style.display = an ? "none" : "";
    var sortBtn = root.querySelector("#rv-sort");
    sortBtn.style.display = an ? "none" : "";
    if (an) { sort = "year"; sortBtn.textContent = "排序：时间"; }
    root.querySelector("#rv-filter").checked = onlyFilter;
    root.querySelector("#rv-title").textContent = source.label ? source.label : "时间长河 · 全览";
    root.hidden = false;
    document.body.classList.add("river-open");
    open0 = true;
    render();
    window.dispatchEvent(new Event("chronicle:river"));
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.classList.remove("river-open");
    open0 = false;
    source = null;
    window.dispatchEvent(new Event("chronicle:river"));
    if (location.hash.indexOf("#/river") === 0) location.hash = "#/timeline";
  }
  function isOpen() { return open0; }

  /* 重画判据向 state.js 的 filterChanged 要：长河的条目正是按 passesFilter 挑的，
   * 少认一个键，画面上就会留着读者刚刚亲手排除的那批（此前漏的正是 provFloor）。 */
  S.subscribe(function (s, ch) {
    if (!open0) return;
    if (S.filterChanged(ch)) render();
  });
  window.addEventListener("chronicle:ready", function () { if (open0) render(); });
  /* ready 只保证视窗那几片就位，整轮后台补齐完成另有 chronicle:rest：
   * 顶部的「数据仅载入 x/y 片」是一句会过期的话，补齐后必须有人把它撤掉。
   * 逐片重画会把读者正看着的那一屏反复抽回顶部，所以只在整轮收尾时刷新一次。 */
  window.addEventListener("chronicle:rest", function () { if (open0) render(); });

  window.ChronRiver = { open: open, close: close, isOpen: isOpen, render: render };
})();
