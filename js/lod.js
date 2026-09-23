/* lod.js | 缩放层级判定与 bin 聚合 */
(function () {
  "use strict";

  /* 五级：L5 时代 / L4 50年bin / L3 10年bin / L2 单年折叠 / L1 单年全量
   * 阈值按 px/年 判定。全程 5026 年在 800–1600px 画布上是 0.16–0.32 px/年，
   * 必须落进 L5，否则默认视图看不到时代带。
   * minWeight 只在单年层级（bin===1）被 aggregate 读取：bin 层级不做权重过滤，
   * 整段事件并入一个 bin、由其中最高权重决定其强度，故此处不给 bin 层级声明该字段。 */
  var TIERS = [
    { id: "L5", maxPx: 0.5,   bin: 500, label: "时代" },
    { id: "L4", maxPx: 1.6,    bin: 50,  label: "半世纪" },
    { id: "L3", maxPx: 5,      bin: 10,  label: "十年" },
    { id: "L2", maxPx: 16,     bin: 1,   minWeight: 4, label: "单年·折叠" },
    { id: "L1", maxPx: Infinity, bin: 1, minWeight: 1, label: "单年·全量" }
  ];

  function tierOf(pxPerYear) {
    for (var i = 0; i < TIERS.length; i++) if (pxPerYear < TIERS[i].maxPx) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }

  /* bin 起始年：在无 0 年的序数空间里对齐，再映回显示年份。
   * 这样 BCE 桶为 [-step,-1]、[-2step,-step-1]，CE 桶为 [1,step]…
   * binLabel 的 start+step-1 恒等式才成立（公元1–9 不会被并入「前10–前1」）。 */
  function binStart(y, step) {
    if (step <= 1) return y;
    var ord = y < 0 ? y : y - 1;
    var s = Math.floor(ord / step) * step;
    return s < 0 ? s : s + 1;
  }

  function binLabel(start, step) {
    var end = start + step - 1;
    if (end <= -1 && start <= -1) {
      if (step === 1) return "前" + Math.abs(start) + "年";
      return "前" + Math.abs(start) + "–前" + Math.abs(end) + "年";
    }
    if (start >= 1) {
      if (step === 1) return start + "年";
      return start + "–" + end + "年";
    }
    return "前" + Math.abs(start) + "–" + end + "年";   // 跨公元
  }

  /* 把事件按 bin 聚合（单年层级 bin=1） */
  function aggregate(evs, tier, pxPerYear) {
    if (tier.id === "L5") {
      return aggByEra(evs, pxPerYear);
    }
    var step = tier.bin;
    var map = new Map();
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      var key = ev.track + "|" + (step === 1 ? ev.year : binStart(ev.year, step));
      var b = map.get(key);
      if (!b) {
        b = {
          kind: "bin", key: key, track: ev.track,
          start: step === 1 ? ev.year : binStart(ev.year, step),
          step: step, events: [], weight: 0, byDim: {}
        };
        map.set(key, b);
      }
      b.events.push(ev);
      if (ev.weight > b.weight) b.weight = ev.weight;
      b.byDim[ev.dim] = (b.byDim[ev.dim] || 0) + 1;
    }
    var out = [];
    map.forEach(function (b) {
      b.events.sort(function (x, y) { return y.weight - x.weight || x.title.localeCompare(y.title, "zh"); });
      b.label = binLabel(b.start, b.step);
      b.count = b.events.length;
      if (step === 1) {
        /* 单年：按 weight 折叠，低权重并入 +N */
        var keep = b.events.filter(function (e) { return e.weight >= tier.minWeight; });
        var fold = b.events.filter(function (e) { return e.weight < tier.minWeight; });
        b.singles = keep;
        b.folded = fold;
        b.foldLabel = fold.length ? "+" + fold.length : null;
      } else {
        b.singles = [];
        b.folded = [];
        b.foldLabel = null;
        b.top = b.events[0];
      }
      out.push(b);
    });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  /* L5：按时代带聚合 */
  function aggByEra(evs, pxPerYear) {
    var M = window.__CHRONICLE_META;
    var map = new Map();
    function ensure(track, era) {
      var key = track + "|" + era.id;
      var b = map.get(key);
      if (!b) {
        b = {
          kind: "era", key: key, track: track, era: era,
          start: era.from, end: era.to, events: [], weight: 0, byDim: {}
        };
        map.set(key, b);
      }
      return b;
    }
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      var list = ev.track === "cn" ? M.cnEras : M.worldEras;
      var hit = null;
      for (var j = 0; j < list.length; j++) {
        if (ev.year >= list[j].from && ev.year <= list[j].to) { hit = list[j]; break; }
      }
      var era = hit || { id: "out", from: ev.year, to: ev.year, label: "其他", sub: "", approx: false };
      var b = ensure(ev.track, era);
      b.events.push(ev);
      if (ev.weight > b.weight) b.weight = ev.weight;
      b.byDim[ev.dim] = (b.byDim[ev.dim] || 0) + 1;
    }
    var out = [];
    map.forEach(function (b) {
      b.events.sort(function (x, y) { return y.weight - x.weight || x.year - y.year; });
      b.count = b.events.length;
      b.label = b.era.label;
      b.singles = [];
      b.folded = [];
      b.top5 = b.events.filter(function (e) { return e.weight >= 5; }).slice(0, 8);
      if (!b.top5.length) b.top5 = b.events.slice(0, 5);
      out.push(b);
    });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  window.ChronLOD = {
    TIERS: TIERS,
    tierOf: tierOf,
    binStart: binStart,
    binLabel: binLabel,
    aggregate: aggregate
  };
})();
