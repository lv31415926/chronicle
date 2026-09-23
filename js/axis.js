/* axis.js | 视口坐标映射、刻度布局、时代带与 minimap */
(function () {
  "use strict";

  var T = window.ChronTime;
  var M = window.__CHRONICLE_META;

  function Viewport(width, from, to) {
    this.w = width;
    this.from = from;
    this.to = to;
  }
  Viewport.prototype = {
    get span() { return this.to - this.from; },
    get pxPerYear() { return this.w / this.span; },
    x: function (year) { return (year - this.from) / this.span * this.w; },
    /* 亚像素年份（拖拽/锚点缩放用） */
    yearAt: function (x) { return this.from + x / this.w * this.span; },
    clone: function () { return new Viewport(this.w, this.from, this.to); },
    translated: function (dxYears) { return new Viewport(this.w, this.from + dxYears, this.to + dxYears); },
    zoomed: function (factor, anchorYear) {
      var span = this.span * factor;
      var maxSpan = (M.yearMax - M.yearMin) * 1.12;
      if (span > maxSpan) span = maxSpan;
      if (span < 12) span = 12;
      var ratio = (anchorYear - this.from) / this.span;
      var f = anchorYear - ratio * span;
      return new Viewport(this.w, f, f + span);
    },
    /* 边界弹性：把视窗钳制回合法范围（含 8% 越界容忍由调用方控制） */
    constrained: function (slack) {
      slack = slack === undefined ? 0 : slack;
      var lo = M.yearMin - slack, hi = M.yearMax + slack;
      var f = this.from, to = this.to;
      if (f < lo) { to += lo - f; f = lo; }
      if (to > hi) { f -= to - hi; to = hi; }
      if (f < lo) f = lo;
      return new Viewport(this.w, f, to);
    }
  };

  /* 主刻度 + 次刻度 */
  function tickPlan(vp, widthPx) {
    var major = T.pickStep(vp.pxPerYear, 128);
    var minor = Math.max(1, major / (major >= 10 ? 5 : 2));
    return {
      majors: T.ticks(vp.from, vp.to, major),
      minors: T.ticks(vp.from, vp.to, minor),
      major: major,
      minor: minor
    };
  }

  /* 时代带分段：把 [from,to] 与 era 列表求交 */
  function eraSegments(list, from, to) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var a = Math.max(e.from, from), b = Math.min(e.to, to);
      if (b >= a) out.push({ era: e, from: a, to: b });
    }
    return out;
  }

  /* minimap 密度：全程按 bin 统计事件数（用于柱状背景） */
  function densityBins(events, bins) {
    var lo = M.yearMin, hi = M.yearMax;
    var step = (hi - lo) / bins;
    var arr = new Array(bins).fill(0);
    for (var i = 0; i < events.length; i++) {
      var k = Math.floor((events[i].year - lo) / step);
      if (k < 0) k = 0; if (k >= bins) k = bins - 1;
      arr[k]++;
    }
    var max = 1;
    for (var j = 0; j < arr.length; j++) if (arr[j] > max) max = arr[j];
    return { counts: arr, max: max, step: step, lo: lo };
  }

  window.ChronAxis = {
    Viewport: Viewport,
    tickPlan: tickPlan,
    eraSegments: eraSegments,
    densityBins: densityBins
  };
})();
