/* prov.js | 溯源分级
 *
 * 要回答的问题只有一个：读者拿到这条记述，能不能自己去查。
 * 它与 weight（这条在历史里有多重）是两条正交的轴——weight 决定层级与排序，
 * prov 只决定标签与可见性。两者一旦互串，投稿就能靠数量挤掉正史，
 * 或者被静默压死，两种都是产品事故。
 *
 * 分级不存字段，全部由证据现算：存了标签就有人会手改，改完没有任何门知道。
 * 唯一的例外是 checks——那是人留下的核对记录，只能新增，不能自封。
 */
(function () {
  "use strict";

  /* 五类「能直接翻到」的定位证据。前四类判据来自对 11597 条真实出处的形态统计；
   * link 是唯一例外——精选语料里 0 命中（全库无 URL），它是给公开投稿留的口子，
   * 由 tools/test-units.mjs 的规则↔语料对账看着，语料一旦漂进 URL 会当场变红要求复核。
   * 刻意不含「(1991)」这类括号年份：它多半是出版年而非位置，算进来会虚增可核度。 */
  var KINDS = [
    { key: "chapter", label: "篇目", re: /《[^》]+·[^》]+》/ },
    { key: "juan", label: "卷册", re: /[卷册部编]\s*[一二三四五六七八九十百千零〇两0-9]+|第\s*[一二三四五六七八九十百千零〇两0-9]+\s*[卷册部编]/ },
    { key: "section", label: "节页", re: /第\s*[一二三四五六七八九十百千零〇两0-9]+\s*[节章条页]|[:：]\s*\d{1,4}\s*[-—]\s*\d{1,4}|\bp\.?\s*\d{1,4}\b/i },
    { key: "dated", label: "日期", re: /\d{3,4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/ },
    { key: "link", label: "链接", re: /https?:\/\/|www\.|\bISBN\b/i }
  ];

  /* 标签只声称「可核到什么程度」，绝不声称真假——没人有资格替历史担保真假。 */
  var TIERS = [
    { key: "verified", label: "已核", hint: "有人核过原文", cls: "pv-verified",
      desc: "有人留下核对记录：写明谁、何时、查的是哪一处" },
    { key: "locatable", label: "可定位", hint: "出处可翻到", cls: "pv-locatable",
      desc: "出处给到能直接翻到的位置（篇目、卷册、节页、日期或链接），但尚无人核对过" },
    { key: "titled", label: "仅书名", hint: "只写到书名", cls: "pv-titled",
      desc: "出处只写到书名，读者无法定位到具体段落，等于无法查证" },
    { key: "unsourced", label: "无出处", hint: "查无可查", cls: "pv-unsourced",
      desc: "没有任何来源，当作线索看，不要当作依据用" }
  ];

  var TIER_BY_KEY = {};
  TIERS.forEach(function (t) { TIER_BY_KEY[t.key] = t; });

  function sourcesOf(e) {
    var s = e && e.detail && e.detail.sources;
    return Array.isArray(s) ? s : [];
  }

  function checksOf(e) {
    var c = e && e.checks;
    return Array.isArray(c) ? c : [];
  }

  /* 一条核对记录要能立住，必须留下「谁」和「哪天」；at 只收 ISO 日期，
   * 因为下游要按它排序与过期判断，收 "2026年9月" 这种写法等于埋一颗哑雷。 */
  function validCheck(c) {
    return !!c && typeof c.by === "string" && c.by.trim().length >= 1 &&
      typeof c.at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.at.trim());
  }

  function verifiedChecks(e) {
    return checksOf(e).filter(validCheck);
  }

  /* 返回命中的定位证据类别（一条出处命中多类只算一次，按类别去重） */
  function locatorsOf(e) {
    var ss = sourcesOf(e).map(String), out = [];
    KINDS.forEach(function (k) {
      if (ss.some(function (s) { return k.re.test(s); })) out.push(k.key);
    });
    return out;
  }

  function hasLocator(e) { return locatorsOf(e).length > 0; }

  function tierOf(e) {
    if (verifiedChecks(e).length) return "verified";
    var ss = sourcesOf(e);
    if (!ss.length) return "unsourced";
    return hasLocator(e) ? "locatable" : "titled";
  }

  function labelOf(key) { return (TIER_BY_KEY[key] || TIER_BY_KEY[3]).label; }
  function clsOf(key) { return (TIER_BY_KEY[key] || TIER_BY_KEY[3]).cls; }

  /* 由弱到强的序，供全局「溯源门槛」筛选比较用（筛选只认强弱，不该背键名）。
   * 新加一档却忘了登记 rank 时，rankOf 落到 0=最弱，条目仍可被看到，
   * 不会被一道没人察觉的 undefined 静默过滤掉。 */
  var RANK = { unsourced: 0, titled: 1, locatable: 2, verified: 3 };
  function rankOf(e) {
    var r = RANK[tierOf(e)];
    return typeof r === "number" ? r : 0;
  }
  function floorLabel(n) {
    for (var i = 0; i < TIERS.length; i++) if (RANK[TIERS[i].key] === n) return TIERS[i].label;
    return "全部";
  }

  function stats(evs) {
    var o = { verified: 0, locatable: 0, titled: 0, unsourced: 0, total: evs.length };
    for (var i = 0; i < evs.length; i++) o[tierOf(evs[i])]++;
    return o;
  }

  /* 自带一份 esc：本模块要在 6 个界面出现，抄 6 遍别处的转义等于把正确性分散到 6 处 */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function tierMeta(key) { return TIER_BY_KEY[key] || TIER_BY_KEY[3]; }

  /* 光有标签不够：读者要看得见「凭什么这么标」，标签才有教育意义，
   * 乱标的人也要面对「你说的出处在第几卷」这一问。 */
  function explain(e) {
    var key = tierOf(e), ss = sourcesOf(e);
    if (key === "verified") {
      var cs = verifiedChecks(e).map(function (c) { return esc(c.by) + " 于 " + esc(c.at); });
      return "已核对：" + cs.join("；") + "。核对记录列在下方。" +
        "核对只针对「记述与所引出处是否相符」，不等于对这段历史下最终结论。";
    }
    if (key === "unsourced") return "没有任何来源。当作线索看，不要当作依据用。";
    var kinds = locatorsOf(e).map(function (k) {
      for (var i = 0; i < KINDS.length; i++) if (KINDS[i].key === k) return KINDS[i].label;
      return k;
    });
    if (kinds.length) {
      return "出处给到了" + kinds.join("、") + "级位置，可以直接翻到原文；但尚无人核对过记述是否与出处一致。";
    }
    return "出处只写到书名（" + esc(ss[0] || "") + "），读者无法定位到具体段落，等于无法查证。";
  }

  function badgeTier(key) {
    var t = tierMeta(key);
    return '<span class="pv ' + t.cls + '" title="' + esc(t.desc) + '">' + esc(t.label) + "</span>";
  }
  function badge(e) { return badgeTier(tierOf(e)); }

  window.ChronProv = {
    KINDS: KINDS, TIERS: TIERS, RANK: RANK,
    sourcesOf: sourcesOf, checksOf: checksOf, validCheck: validCheck,
    verifiedChecks: verifiedChecks, locatorsOf: locatorsOf, hasLocator: hasLocator,
    tierOf: tierOf, labelOf: labelOf, clsOf: clsOf, stats: stats,
    rankOf: rankOf, floorLabel: floorLabel,
    tierMeta: tierMeta, esc: esc, badge: badge, badgeTier: badgeTier, explain: explain
  };
})();
