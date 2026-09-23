/* state.js | 单一状态源：视窗 / 筛选 / 模式 / 主题 / 选中，订阅广播 */
(function () {
  "use strict";

  var M = window.__CHRONICLE_META;
  var LS = "chronicle.state.v1";

  var state = {
    view: { from: M.yearMin, to: M.yearMax },
    /* range = 全局时间区间筛选，与维度/重要度筛选同级；
     * view 是画布视野，由滚轮与拖拽决定，两者互不覆盖。 */
    range: { from: M.yearMin, to: M.yearMax },
    mode: "overlay",                 // overlay | split
    dims: {},                        // dim -> bool；空表示全选
    tracks: { cn: true, world: true },
    weightFloor: 1,
    /* provFloor = 溯源门槛：0 全部 / 1 有出处 / 2 出处可定位 / 3 仅已核。
     * 与 weightFloor 同级但正交——weight 问「这条在历史里有多重」，
     * prov 问「读者能不能自己去查」。两者一旦互串，投稿就能靠数量挤掉正史。 */
    provFloor: 0,
    hover: null,                     // { kind:'event'|'bin'|'year', ... }
    selectedId: null,
    selectedYear: null,
    theme: "dark",
    route: { name: "timeline", params: {} },
    activeTheme: null,               // 主题时间线 id
    query: "",
    ready: false,
    lod: "L5"
  };
  M.dimOrder.forEach(function (d) { state.dims[d] = true; });

  var subs = [];
  function subscribe(fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }

  function emit(changed) {
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](state, changed || {}); } catch (e) { console.error("[state] subscriber failed", e); }
    }
  }

  function shallowDiff(a, b) {
    var out = {};
    Object.keys(b).forEach(function (k) { if (a[k] !== b[k]) out[k] = true; });
    return out;
  }

  function patch(next) {
    var before = Object.assign({}, state);
    Object.keys(next).forEach(function (k) {
      if (k === "view") {
        state.view = Object.assign({}, state.view, next.view);
        normalizeView();
      } else if (k === "range") {
        var r = clampRange(
          next.range.from !== undefined ? next.range.from : state.range.from,
          next.range.to !== undefined ? next.range.to : state.range.to);
        if (r) state.range = r;
      } else {
        state[k] = next[k];
      }
    });
    emit(shallowDiff(before, state));
    persist();
  }

  function normalizeView() {
    var v = state.view;
    var span = v.to - v.from;
    var maxSpan = (M.yearMax - M.yearMin) * 1.12;
    var minSpan = 12;
    if (span > maxSpan) { var c = (v.from + v.to) / 2; v.from = c - maxSpan / 2; v.to = c + maxSpan / 2; }
    if (span < minSpan) { var c2 = (v.from + v.to) / 2; v.from = c2 - minSpan / 2; v.to = c2 + minSpan / 2; }
    /* 路由可写入任意视窗（#/view/3000/4000），越界必须推回，否则画面全空。
     * 允许 8% 弹性余量，与 interaction 的拖拽回弹一致。 */
    var pad = (M.yearMax - M.yearMin) * 0.08;
    var lo = M.yearMin - pad, hi = M.yearMax + pad;
    if (v.from < lo) { v.to += lo - v.from; v.from = lo; }
    if (v.to > hi) { v.from -= v.to - hi; v.to = hi; }
    if (v.from < lo) v.from = lo;
  }

  function setView(from, to) {
    state.view = { from: from, to: to };
    normalizeView();
    emit({ view: true });
    persist();
  }

  function clampRange(from, to) {
    var a = Math.round(Number(from)), b = Math.round(Number(to));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (b < a) { var t = a; a = b; b = t; }
    return {
      from: Math.max(M.yearMin, Math.min(M.yearMax, a)),
      to: Math.max(M.yearMin, Math.min(M.yearMax, b))
    };
  }

  function setRange(from, to) {
    var r = clampRange(from, to);
    if (!r) return state.range;
    state.range = r;
    emit({ range: true });
    persist();
    return state.range;
  }
  function inRange(y) { return y >= state.range.from && y <= state.range.to; }

  function toggleDim(d) {
    state.dims = Object.assign({}, state.dims, (function () { var o = {}; o[d] = !state.dims[d]; return o; })());
    emit({ dims: true });
    persist();
  }
  function allDims(on) {
    var n = {};
    M.dimOrder.forEach(function (d) { n[d] = !!on; });
    state.dims = n;
    emit({ dims: true });
    persist();
  }
  function soloDim(d) {
    var n = {};
    M.dimOrder.forEach(function (x) { n[x] = (x === d); });
    state.dims = n;
    emit({ dims: true });
    persist();
  }
  function toggleTrack(t) {
    state.tracks = Object.assign({}, state.tracks);
    var other = t === "cn" ? "world" : "cn";
    if (state.tracks[t] && !state.tracks[other]) return;   // 至少保留一条轨
    state.tracks[t] = !state.tracks[t];
    emit({ tracks: true });
    persist();
  }

  /* 已是单轨则恢复双线，否则独显该轨 */
  function soloTrack(t) {
    var other = t === "cn" ? "world" : "cn";
    var solo = state.tracks[t] && !state.tracks[other];
    state.tracks = solo ? { cn: true, world: true }
      : (t === "cn" ? { cn: true, world: false } : { cn: false, world: true });
    emit({ tracks: true });
    persist();
  }

  function persist() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        view: state.view, range: state.range, mode: state.mode, dims: state.dims,
        tracks: state.tracks, theme: state.theme, weightFloor: state.weightFloor,
        provFloor: state.provFloor
      }));
    } catch (e) { /* file:// 下部分浏览器禁 localStorage，静默降级 */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o.view && Number.isFinite(o.view.from) && Number.isFinite(o.view.to) && o.view.to > o.view.from) state.view = o.view;
      var r = o.range && clampRange(o.range.from, o.range.to);
      state.range = r || { from: M.yearMin, to: M.yearMax };
      if (o.mode === "overlay" || o.mode === "split") state.mode = o.mode;
      if (o.dims) Object.keys(state.dims).forEach(function (k) { if (k in o.dims) state.dims[k] = !!o.dims[k]; });
      if (o.tracks) state.tracks = { cn: o.tracks.cn !== false, world: o.tracks.world !== false };
      if (o.theme === "light" || o.theme === "dark") state.theme = o.theme;
      if (o.weightFloor >= 1 && o.weightFloor <= 5) state.weightFloor = o.weightFloor;
      if (o.provFloor >= 0 && o.provFloor <= 3) state.provFloor = o.provFloor | 0;
      normalizeView();
    } catch (e) { /* 忽略 */ }
  }

  function visibleDims() { return M.dimOrder.filter(function (d) { return state.dims[d]; }); }

  function passesFilter(ev) {
    /* ChronProv 在函数体内取，不在文件头取：state.js 比 prov.js 先加载，
     * 顶层读它拿到的是 undefined（CHRON_ORDER 门就是管这个的）。 */
    return !!state.tracks[ev.track] && !!state.dims[ev.dim] && ev.weight >= state.weightFloor
      && ev.year >= state.range.from && ev.year <= state.range.to
      && window.ChronProv.rankOf(ev) >= state.provFloor;
  }

  /* passesFilter 读到的那几个键。按这套口径画东西的界面一律来问这里，
   * 而不是各自抄一份「哪些变化要重画」：抄漏一个键，画面上就留着读者刚刚
   * 亲手排除的那批条目（长河漏掉 provFloor 正是实测抓到的第一次）。
   * 清单与函数体虽在同一文件，仍由 test-units 逐键对账——两者会各自演化。
   * 注意 view 不在其内：拖拽时每帧都变，跟着重画会把读者正看着的一屏抽回顶部。 */
  var FILTER_KEYS = { tracks: 1, dims: 1, weightFloor: 1, provFloor: 1, range: 1 };
  function filterChanged(changed) {
    for (var k in changed) if (FILTER_KEYS[k]) return true;
    return false;
  }

  window.ChronState = {
    get: function () { return state; },
    subscribe: subscribe,
    patch: patch,
    setView: setView,
    setRange: setRange,
    inRange: inRange,
    toggleDim: toggleDim,
    allDims: allDims,
    soloDim: soloDim,
    toggleTrack: toggleTrack,
    soloTrack: soloTrack,
    visibleDims: visibleDims,
    passesFilter: passesFilter,
    filterChanged: filterChanged,
    restore: restore,
    persist: persist,
    emit: emit
  };
})();
