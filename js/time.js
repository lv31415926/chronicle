/* time.js | 公元前/后换算、纪元格式化、时代与政权查表、刻度生成 */
(function () {
  "use strict";

  var M = window.__CHRONICLE_META;
  var R = window.__CHRONICLE_REIGN;

  /* 无 0 年：-1 与 1 相邻。yearSpan 用「天文年距离」再修正。 */
  function yearDistance(a, b) {
    var d = Math.abs(b - a);
    if (a < 0 && b > 0) d -= 1;      // 跨过不存在的 0 年
    if (a > 0 && b < 0) d -= 1;
    return d;
  }

  /* 把连续浮点坐标映射到「显示年份」，跳过 0 */
  function coordToYear(x) {
    var y = Math.round(x);
    if (y === 0) y = x >= 0 ? 1 : -1;
    return y;
  }

  function formatYear(y, opts) {
    opts = opts || {};
    var approx = opts.approx ? "~" : "";
    if (y < 0) return approx + "前" + Math.abs(y) + "年";
    if (y === 1) return approx + "公元1年";
    return approx + "公元" + y + "年";
  }

  function formatYearShort(y, approx) {
    var a = approx ? "~" : "";
    return y < 0 ? a + "前" + Math.abs(y) : "" + y;
  }

  /* 世纪（公元前 1–100 = 前1世纪） */
  function centuryOf(y) {
    if (y > 0) return Math.floor((y - 1) / 100) + 1;
    return Math.floor((Math.abs(y) - 1) / 100) + 1;
  }

  var CN_NUM = ["零","一","二","三","四","五","六","七","八","九","十"];
  function cnCentury(n) {
    if (n <= 10) return "第" + CN_NUM[n] + "世纪";
    if (n < 20) return "第十" + (n === 10 ? "" : CN_NUM[n - 10]) + "世纪";
    var t = Math.floor(n / 10), o = n % 10;
    return "第" + (t === 1 ? "" : CN_NUM[t]) + "十" + (o ? CN_NUM[o] : "") + "世纪";
  }

  function formatCentury(y) {
    var c = centuryOf(y);
    return (y < 0 ? "前" : "") + cnCentury(c);
  }

  /* 轴上用的紧凑世纪标签：前7世纪 / 7世纪 */
  function centuryAbbrev(y) {
    return (y < 0 ? "前" : "") + centuryOf(y) + "世纪";
  }

  /* 时代带查找 */
  function eraOf(track, y) {
    var list = track === "cn" ? M.cnEras : M.worldEras;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (y >= e.from && y <= e.to) return e;
    }
    return null;
  }

  /* 政权查找（中国）：并立政权同时命中时，取「立国最晚」者为主系——
   * 改元/开国的边界年份应标新政权（前221→秦、9→新莽、1949→中华人民共和国）。 */
  function polityOf(y) {
    var hits = [];
    for (var i = 0; i < R.polities.length; i++) {
      var p = R.polities[i];
      if (y >= p.from && y <= p.to) hits.push(p);
    }
    if (!hits.length) return { main: null, coeval: [] };
    var PRIMARY = ["西汉","东汉","西晋","东晋","隋","唐","北宋","南宋","元","明","清",
                   "中华民国（北京政府）","中华民国（南京政府）","中华人民共和国","秦","三国","南北朝",
                   "五代十国","新莽","西周","东周·春秋","战国","共和行政","西周（宣幽）"];
    var primary = hits.filter(function (p) { return PRIMARY.indexOf(p.label) >= 0; });
    var pool = primary.length ? primary : hits;
    var main = pool.reduce(function (a, b) { return b.from > a.from ? b : a; }, pool[0]);
    return { main: main, coeval: hits.filter(function (p) { return p !== main; }) };
  }
  /* 年份的完整中文标注：公元 + 世纪 + 中国政权 + 时代 */
  function yearLabel(y, approx) {
    var parts = [formatYear(y, { approx: approx }), formatCentury(y)];
    var era = eraOf("cn", y);
    if (era) parts.push(era.label);
    var p = polityOf(y);
    if (p.main) parts.push(p.main.label);
    return parts.join(" · ");
  }

  function minguoYear(y) { return y >= 1912 && y <= 1949 ? "民国" + (y - R.minguoEpoch) + "年" : null; }

  /* ===== 刻度生成：按 pxPerYear 选择步长（年数序列） ===== */
  var STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];

  function pickStep(pxPerYear, minGapPx) {
    var need = minGapPx / Math.max(pxPerYear, 1e-9);
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i] >= need) return STEPS[i];
    return STEPS[STEPS.length - 1];
  }

  /* 生成对齐到步长倍数的刻度年份序列（跳过 0） */
  function ticks(from, to, step) {
    var out = [];
    var start = Math.ceil(from / step) * step;
    for (var y = start; y <= to; y += step) {
      if (y === 0) continue;
      out.push(y);
    }
    return out;
  }

  function clampYear(y) {
    if (y > M.yearMax) return M.yearMax;
    if (y < M.yearMin) return M.yearMin;
    return y;
  }

  /* 手写年份 → 带符号数字。与 formatYearShort 互逆（后者产出「前636」/「2026」），
   * 输入框被回显重写后必须还能原样读回，否则用户的编辑会静默失效。
   * 解析不出只能返回 null：NaN 会绕过调用方的空值判断。 */
  function parseYear(text) {
    var t = String(text == null ? "" : text).trim().replace(/[,，\s]/g, "");
    if (!t) return null;
    var m, n = null;
    if ((m = /^(?:公元前|前|BCE|BC)(\d{1,4})年?$/i.exec(t))) n = -Number(m[1]);
    else if ((m = /^(\d{1,4})年?(?:BCE|BC)$/i.exec(t))) n = -Number(m[1]);
    else if ((m = /^-(\d{1,4})$/.exec(t))) n = -Number(m[1]);
    else if ((m = /^(?:公元(?:后)?|AD|CE)?(\d{1,4})年?$/i.exec(t))) n = Number(m[1]);
    /* 「公元前」的「前」不能做成可选，否则「公元1368」会被读成公元前 */
    return Number.isFinite(n) && n !== 0 ? n : null;
  }

  window.ChronTime = {
    yearDistance: yearDistance,
    coordToYear: coordToYear,
    formatYear: formatYear,
    formatYearShort: formatYearShort,
    parseYear: parseYear,
    formatCentury: formatCentury,
    centuryAbbrev: centuryAbbrev,
    centuryOf: centuryOf,
    eraOf: eraOf,
    polityOf: polityOf,
    yearLabel: yearLabel,
    minguoYear: minguoYear,
    pickStep: pickStep,
    ticks: ticks,
    clampYear: clampYear
  };
})();
