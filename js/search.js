/* search.js | 命令面板检索：字符级匹配 + 语法前缀（!track #dim @人物 区间）
 * 说明：数据规模在数千条量级，线性扫描（预拼 haystack + 长度加权）比维护倒排索引更简单可靠，
 * 且避开 file:// 下 Web Worker 的加载限制。 */
(function () {
  "use strict";

  var L = window.ChronLoader, T = window.ChronTime, S = window.ChronState, M = window.__CHRONICLE_META;
  var PV = window.ChronProv;

  var overlay, input, results, list = [], idx = 0, hay = null, hayCount = -1;
  var debounce = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function norm(s) {
    return String(s || "").toLowerCase().replace(/\s+/g, "");
  }

  function buildHay() {
    var evs = L.allEvents();
    if (hay && hayCount === evs.length) return hay;
    hay = evs.map(function (e) {
      var d = e.detail || {};
      var title = norm(e.title);
      var figures = norm((d.figures || []).join(""));
      var tags = norm((d.tags || []).join("") + (d.state || ""));
      var sum = norm(e.summary);
      var body = norm([title, figures, tags, sum, d.place, d.process, d.background, d.impact].join(""));
      return {
        ev: e, title: title, figures: figures, tags: tags, sum: sum, body: body,
        year: e.year, ylab: norm(T.formatYear(e.year)) + norm(String(Math.abs(e.year))) + norm(String(e.year)),
        track: e.track, dim: e.dim, weight: e.weight
      };
    });
    hayCount = evs.length;
    return hay;
  }

  /* ---- 查询语法 ---- */
  function parse(q) {
    var f = { text: [], track: null, dim: null, figure: null, from: null, to: null };
    var tokens = String(q || "").trim().split(/\s+/);
    tokens.forEach(function (t) {
      if (!t) return;
      var m;
      if ((m = /^!(cn|world|中|世)$/i.exec(t))) { f.track = /cn|中/i.test(m[1]) ? "cn" : "world"; return; }
      if ((m = /^#([a-zA-Z]+)$/.exec(t))) {
        var key = m[1].toLowerCase();
        var hit = M.dimOrder.filter(function (d) { return d.indexOf(key) === 0 || M.dimensions[d].label.indexOf(m[1]) >= 0; })[0];
        if (hit) { f.dim = hit; return; }
      }
      if ((m = /^@(.+)$/.exec(t))) { f.figure = norm(m[1]); return; }
      if ((m = /^(-?\d+)-(-?\d+)$/.exec(t))) {
        var a = Number(m[1]), b = Number(m[2]);
        f.from = Math.min(a, b); f.to = Math.max(a, b); return;
      }
      if ((m = /^(前)(\d+)$/.exec(t))) { f.from = f.to = -Number(m[2]); return; }
      if (/^-?\d+$/.test(t) && Number(t) !== 0) { f.from = f.to = Number(t); return; }
      if (t.indexOf("!#") < 0) f.text.push(norm(t));
    });
    return f;
  }

  function score(h, f) {
    var s = 0;
    if (f.track && h.track !== f.track) return -1;
    if (f.dim && h.dim !== f.dim) return -1;
    if (f.from !== null) {
      var ys = h.year;
      if (f.from === f.to) { if (Math.abs(ys - f.from) > 0) return -1; s += 6; }
      else if (ys < f.from || ys > f.to) return -1;
    }
    if (f.figure && h.figures.indexOf(f.figure) < 0) return -1;
    if (!f.text.length && (f.track || f.dim || f.figure || f.from !== null)) {
      return h.weight * 2;
    }
    for (var i = 0; i < f.text.length; i++) {
      var t = f.text[i];
      if (!t) continue;
      var hit = 0;
      if (h.title.indexOf(t) >= 0) { hit += 10; if (h.title === t) hit += 12; }
      if (h.tags.indexOf(t) >= 0) hit += 6;
      if (h.figures.indexOf(t) >= 0) hit += 7;
      if (h.ylab.indexOf(t) >= 0) hit += 5;
      if (h.sum.indexOf(t) >= 0) hit += 3;
      if (hit === 0 && h.body.indexOf(t) >= 0) hit += 1;
      if (hit === 0) return -1;                       /* 与逻辑：全部词须命中 */
      s += hit;
    }
    return s + h.weight;
  }

  function run(q, limit) {
    buildHay();
    var f = parse(q);
    var out = [];
    for (var i = 0; i < hay.length; i++) {
      var s = score(hay[i], f);
      if (s > 0) out.push({ h: hay[i], s: s });
    }
    out.sort(function (a, b) { return b.s - a.s || b.h.weight - a.h.weight || Math.abs(a.h.year) - Math.abs(b.h.year); });
    return out.slice(0, limit || 60);
  }

  /* ---- UI ---- */
  function ensure() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "cmdk";
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="cmdk-panel" role="dialog" aria-label="搜索">' +
      '<div class="cmdk-top"><input id="cmdk-input" type="search" placeholder="检索事件、人物、年份、政权…　例：变法　!cn #science 1937　@张居正" autocomplete="off" spellcheck="false">' +
      '<button class="tb-btn" id="cmdk-river" title="把命中结果按时间铺成全屏长河（Shift+Enter）">在长河中梳理 →</button>' +
      '<span class="cmdk-hint">↑↓ 选择 · Enter 打开 · Shift+Enter 入长河 · Esc 关闭</span></div>' +
      '<div class="cmdk-meta" id="cmdk-meta"></div>' +
      '<ul class="cmdk-list" id="cmdk-list"></ul>' +
      '<div class="cmdk-foot"><span>语法：<code>!cn</code>/<code>!world</code> 只看该轨 · <code>#science</code> 限定维度 · <code>@人物</code> · <code>1368-1644</code> 区间 · <code>前636</code> 单年</span></div>' +
      "</div>";
    document.body.appendChild(overlay);
    input = overlay.querySelector("#cmdk-input");
    results = overlay.querySelector("#cmdk-list");
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) { close(); return; }
      var li = e.target.closest("[data-ev]");
      if (li) pick(li.getAttribute("data-ev"));
    });
    input.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 80);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { move(1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { move(-1); e.preventDefault(); }
      else if (e.key === "Enter" && e.shiftKey) { toRiver(); e.preventDefault(); }
      else if (e.key === "Enter") { if (list[idx]) pick(list[idx].h.ev.id); e.preventDefault(); }
      else if (e.key === "Escape") { close(); e.preventDefault(); }
      else if (e.key === "Tab") {
        var cur = parse(input.value);
        var nxt = cur.track === "cn" ? "world" : cur.track === "world" ? null : "cn";
        input.value = input.value.replace(/\s![a-z]+\b/gi, "") + (nxt ? " !" + nxt : "");
        refresh(); e.preventDefault();
      }
    });
    overlay.querySelector("#cmdk-river").addEventListener("click", toRiver);
  }

  /* 有词走路由（地址栏可分享、可回退）；空词时面板正显示里程碑推荐，
   * 那批 id 没有对应的查询写法，只能直接把 id 交给长河。 */
  function toRiver() {
    if (!window.ChronRiver) return;
    var q = input.value.trim();
    if (q) { close(); ChronRouter.go("#/river/" + encodeURIComponent(q)); return; }
    var ids = list.map(function (r) { return r.h.ev.id; });
    if (!ids.length) return;
    close();
    ChronRiver.open({ ids: ids, label: "里程碑推荐" });
  }

  function refresh() {
    var q = input.value;
    S.patch({ query: q });
    list = run(q, 80);
    idx = 0;
    var meta = overlay.querySelector("#cmdk-meta");
    meta.textContent = q.trim()
      ? "命中 " + list.length + " 条" + (list.length >= 80 ? "（已截断）" : "") + " · 已索引 " + (hayCount < 0 ? 0 : hayCount) + " 条"
      : "已索引 " + (hayCount < 0 ? 0 : hayCount) + " 条 · 输入即检索";
    if (!q.trim()) {
      var w5 = buildHay().filter(function (h) { return h.weight === 5; }).slice(0, 30)
        .map(function (h) { return { h: h, s: 1 }; });
      list = w5;
      meta.textContent = "推荐：重要度 5 的里程碑（共 " + buildHay().filter(function (h) { return h.weight === 5; }).length + " 条）";
    }
    if (!list.length) {
      results.innerHTML = '<li class="cmdk-empty">没有匹配条目。数据可能尚未加载完毕——试试先「加载全部分片」，或换一个更短的关键词。</li>';
      return;
    }
    results.innerHTML = list.map(function (r, i) {
      var e = r.h.ev, d = M.dimensions[e.dim], tk = M.tracks[e.track];
      return '<li class="res' + (i === idx ? " cur" : "") + '" data-ev="' + esc(e.id) + '">' +
        '<i class="dot" style="background:' + d.color + '"></i>' +
        '<span class="rt">' + esc(e.title) + (PV ? PV.badge(e) : "") + "</span>" +
        '<span class="ry" style="color:' + tk.color + '">' + esc(T.formatYear(e.year, { approx: e.yearApprox })) + "</span>" +
        '<span class="rd">' + esc(d.label) + " · " + esc(tk.short) + "</span>" +
        '<span class="rs">' + esc(e.summary) + "</span>" +
        "</li>";
    }).join("");
  }

  function move(d) {
    if (!list.length) return;
    idx = (idx + d + list.length) % list.length;
    var nodes = results.querySelectorAll(".res");
    nodes.forEach(function (n, i) { n.classList.toggle("cur", i === idx); });
    if (nodes[idx]) nodes[idx].scrollIntoView({ block: "nearest" });
  }

  function pick(id) {
    var ev = L.eventById(id);
    if (!ev) return;
    close();
    ChronDetail.openEvent(id);
    ChronTimeline.flyToYear(ev.year, Math.max(14, S.get().view.to - S.get().view.from));
    ChronTimeline.pulseEvent(id);
    S.patch({ selectedId: id, selectedYear: ev.year });
  }

  function open() {
    ensure();
    buildHay();
    overlay.hidden = false;
    overlay.classList.add("open");
    setTimeout(function () { input.focus(); input.select(); }, 10);
    refresh();
  }
  function close() {
    if (!overlay) return;
    overlay.hidden = true;
    overlay.classList.remove("open");
  }
  function isOpen() { return !!overlay && !overlay.hidden; }
  function query(text) { ensure(); open(); input.value = text; refresh(); }

  window.ChronSearch = {
    open: open, close: close, isOpen: isOpen, query: query, run: run, parse: parse
  };
})();
