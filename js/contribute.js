/* contribute.js | 投稿三入口：补出处 / 报核对 / 添新条目（零后端）
 *
 * 本站没有服务器，所以「投稿」只能是「把一条结构化记录送到一个公开可查的地方」，
 * 不是「写进数据库」。三条出口按可靠性排序：开预填 issue → 复制 JSON → 下载 .json。
 * issue 那条依赖仓库地址：没配就不画它，画了就是死链。
 *
 * 一条铁律贯穿全部出口：**出口里永远不可能出现等级字段**。投稿者能交出的只有
 * 「出处是什么」「核到了哪儿」「哪一年发生了什么」，等级由 prov.js 按证据现算。
 * 做不到这条，第一个投稿的人就是第一个给自己盖章的人。
 *
 * 客户端的限频与蜜罐是礼貌，不是防线：本地存储清得掉，脚本可以绕过。
 * 真正的门槛在接收侧（并档时的 validate 门），这里只挡顺手刷屏。
 */
(function () {
  "use strict";

  var M = window.__CHRONICLE_META, L = window.ChronLoader, T = window.ChronTime,
    PV = window.ChronProv;

  /* ===== 配置（全站唯一一处）=====
   * 公开仓库建好后填 "owner/name"；留空时 issue 出口整体不出现。
   * 可在 index.html 内联一行 window.__CHRONICLE_CONTRIB_REPO 覆盖，不必改本文件。 */
  var REPO = window.__CHRONICLE_CONTRIB_REPO || "";
  var LABEL = "contribution";
  var SCHEMA = "chronicle-contribution/1";

  /* issue 预填要走 GET URL，过长的 GET 会被浏览器或 GitHub 截掉——
   * 与其让用户点开后看到一个被切半截的正文，不如不画这个按钮。 */
  var ISSUE_URL_MAX = 7800;
  var MAX = { title: 60, summary: 300, locator: 400, note: 300, who: 40 };
  /* 长度下限单独记：报错文案要照抄这里的数。判据和文案各写一遍数字，
   * 改了其一就等于对着读者说谎。 */
  var MIN = { title: 4, summary: 10 };

  var KINDS = {
    source: { label: "补出处", tip: "这条已有条目，我知道它出自哪本书哪一卷哪一页" },
    check: { label: "报核对", tip: "我按条目给的出处翻到了原文，说说对得上还是对不上" },
    event: { label: "添新条目", tip: "这一年有件大事这里没有，我来补一条" }
  };

  /* 核对结论只有这三种措辞；不提供「已核实」这种由投稿人自封的说法。 */
  var VERDICTS = {
    confirm: "所给出处与条目相符",
    diverge: "所给出处与条目有出入",
    missing: "按所给出处查不到该内容"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function clip(v, n) { return String(v == null ? "" : v).trim().slice(0, n); }
  function tierLabelOf(ev) { return PV ? PV.labelOf(PV.tierOf(ev)) : "未知"; }

  /* ===== 纯函数①：白名单构造 =====
   * 白名单是唯一防线：只从已知字段取值，未知键一律不带出去。
   * 于是 tier / verified / confidence 无论投稿人往表单里塞什么，都进不了记录——
   * 不是「塞了会被拒」，是「根本没有这条通道」。 */
  function buildRecord(kind, f) {
    f = f || {};
    var rec = { schema: SCHEMA, kind: kind, at: todayISO(), app: "时间长河" };
    if (kind !== "event") rec.target = clip(f.target, 80);
    if (f.who) rec.who = clip(f.who, MAX.who);
    if (kind === "source") {
      rec.locator = clip(f.locator, MAX.locator);
      if (clip(f.note, MAX.note)) rec.note = clip(f.note, MAX.note);
    } else if (kind === "check") {
      rec.verdict = VERDICTS[f.verdict] ? String(f.verdict) : "";
      rec.locator = clip(f.locator, MAX.locator);
      if (clip(f.note, MAX.note)) rec.note = clip(f.note, MAX.note);
      /* at 已在表头按提交当日写入，且只此一处：表单里没有日期栏，
       * 补填旧日期等于把自己的记录标成「三年前核过」。 */
    } else if (kind === "event") {
      var y = (f.year === "" || f.year == null) ? null : Number(f.year);
      rec.event = {
        year: Number.isFinite(y) ? y : null,
        yearApprox: String(f.yearApprox) === "1",
        track: f.track ? String(f.track) : "",
        dim: f.dim ? String(f.dim) : "",
        title: clip(f.title, MAX.title),
        summary: clip(f.summary, MAX.summary),
        sources: clip(f.locator, MAX.locator) ? [clip(f.locator, MAX.locator)] : [],
        /* 刻意不收 weight：重要度决定条目占多大版面、能否进上层视图，
         * 交给投稿人就是把版面变成嗓门竞赛。并档时由维护口径评定。 */
        weight: null
      };
    }
    return rec;
  }

  /* ===== 纯函数②：本地就能判定的硬约束 =====
   * 只拦「交上来也一定是废件」的那些：缺字段、年份越界、出现公元 0 年、
   * 轨道/维度不认识、目标条目不存在。年份口径与 time.js 的无 0 年规则一致。 */
  function checkRecord(rec) {
    var errs = [];
    if (!rec || !KINDS[rec.kind]) { errs.push("未知的投稿类型"); return errs; }
    if (rec.kind !== "event") {
      if (!rec.target) errs.push("缺少目标条目编号");
      else if (!L.eventById(rec.target)) errs.push("目标条目在本站数据里不存在（可能已改名或已并档）");
      if (!rec.locator) errs.push("出处定位不能空着——只写「我核过」等于没写");
    }
    if (rec.kind === "check" && !VERDICTS[rec.verdict]) errs.push("必须选一个核对结论");
    if (rec.kind === "event") {
      var e = rec.event || {};
      if (!Number.isInteger(e.year)) errs.push("年份必须是整数");
      else if (e.year === 0) errs.push("没有公元 0 年：前1年的下一年就是公元1年");
      else if (e.year < M.yearMin || e.year > M.yearMax)
        errs.push("年份超出本站范围（" + M.yearMin + " ~ " + M.yearMax + "）");
      if (!M.tracks[e.track]) errs.push("必须选择中国或世界轨道");
      if (!M.dimensions[e.dim]) errs.push("必须选择一个维度");
      if (e.title.length < MIN.title) errs.push("标题太短（至少 " + MIN.title + " 字），无法据以判断是哪件事");
      if (e.summary.length < MIN.summary) errs.push("摘要太短（至少 " + MIN.summary + " 字）——没有一句话，读者无从判断要不要点开");
    }
    return errs;
  }

  /* ===== 出口：序列化与送达 ===== */
  function jsonText(rec) { return JSON.stringify(rec, null, 2); }

  function issueTitle(rec) {
    var k = (KINDS[rec.kind] || {}).label || rec.kind;
    if (rec.kind === "event") return "[" + k + "] " + rec.event.year + " · " + rec.event.title;
    var ev = L.eventById(rec.target);
    return "[" + k + "] " + (ev ? ev.title : rec.target);
  }

  function issueBody(rec) {
    var line = "";
    if (rec.kind === "event") {
      line = "> 新条目：" + rec.event.year + " · " +
        ((M.tracks[rec.event.track] || {}).label || "?") + " · " +
        ((M.dimensions[rec.event.dim] || {}).label || "?") + "\n\n";
    } else {
      var ev = L.eventById(rec.target);
      line = ev ? "> 目标条目：" + T.formatYear(ev.year, { approx: ev.yearApprox }) + " " +
        ev.title + "（`" + ev.id + "`，当前溯源：" + tierLabelOf(ev) + "）\n\n" : "";
    }
    return "<!-- 由「时间长河」站内表单生成；请勿改动下面 JSON 的键名。 -->\n\n" + line +
      "```json\n" + jsonText(rec) + "\n```\n\n" +
      "本站无服务器：这条记录以 issue 形式公开留存，任何人都能看到它（含所填署名与出处）。\n";
  }

  function issueUrl(rec) {
    if (!REPO || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPO)) return "";
    var u = "https://github.com/" + REPO + "/issues/new?labels=" + encodeURIComponent(LABEL) +
      "&title=" + encodeURIComponent(issueTitle(rec)) +
      "&body=" + encodeURIComponent(issueBody(rec));
    return u.length <= ISSUE_URL_MAX ? u : "";
  }

  function fileName(rec) {
    return "chronicle-" + rec.kind + "-" + (rec.kind === "event" ? rec.event.year : rec.target) + ".json";
  }

  function download(rec) {
    var name = fileName(rec);
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([jsonText(rec)], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    /* blob URL 不撤销就是每次下载留一块内存：创建即欠，用完必还。 */
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 0);
    return name;
  }

  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) { done = false; }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      toast(done ? okMsg : text, done ? 1600 : 9000);
    }
    /* file:// 不是安全上下文，navigator.clipboard 在部分浏览器里根本不存在，
     * 即便存在也可能因权限被拒——两条退路都要有，否则「复制」在双击打开的页面上是死的。 */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg, 1600); }, fallback);
    } else fallback();
  }

  /* ===== 客户端礼貌层：蜜罐 + 限频 ===== */
  var RL_KEY = "chronicle.contrib.v1";
  var RL_WINDOW = 10 * 60 * 1000, RL_MAX = 5, RL_DAY = 20;

  function rlRead() {
    try {
      var a = JSON.parse(localStorage.getItem(RL_KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  /* 判定与读写分开：限频对不对只看一串时间戳，把它做成纯函数才能在测试里
   * 推到窗口两侧，而不是去改浏览器存储。now - t >= 0 是时钟守卫：
   * 未来时间戳（改过系统时间、跨设备同步）若算进窗口，会把人锁到永远。 */
  function rlJudge(all, now) {
    var day = (Array.isArray(all) ? all : [])
      .filter(function (t) { return typeof t === "number" && now - t >= 0 && now - t < 24 * 3600 * 1000; })
      .sort(function (a, b) { return a - b; });
    var win = day.filter(function (t) { return now - t < RL_WINDOW; }).length;
    return {
      stamps: day, win: win, day: day.length,
      ok: win < RL_MAX && day.length < RL_DAY,
      waitMin: win >= RL_MAX ? Math.max(1, Math.ceil((RL_WINDOW - (now - day[day.length - 1])) / 60000)) : 0
    };
  }
  /* now 由调用方传入：判据要能被打桩，靠内部 Date.now 就只能等。 */
  function rlState(now) { return rlJudge(rlRead(), now); }
  function rlCommit(now) {
    var a = rlState(now).stamps.concat([now]);
    try { localStorage.setItem(RL_KEY, JSON.stringify(a)); }
    catch (e) { /* 无痕模式写不进去：礼貌层放弃，不能因此挡住正常投稿 */ }
  }
  function honeypotFilled(v) { return !!String(v == null ? "" : v).trim(); }

  /* ===== 表单 ===== */
  var form = null, stage = "edit", pending = null;

  function ensureForm() {
    if (form) return form;
    form = document.createElement("div");
    form.className = "contrib-modal";
    form.hidden = true;
    form.innerHTML =
      '<div class="contrib-card" role="dialog" aria-modal="true" aria-labelledby="contrib-title">' +
      '<header><h3 id="contrib-title">投稿</h3>' +
      '<button type="button" data-c="close" aria-label="关闭投稿表单">✕</button></header>' +
      '<div class="contrib-target"></div>' +
      '<form novalidate>' +
      /* 蜜罐：字段名刻意不像必填项，且放在视口外而非 display:none——
       * 后者会被一部分脚本直接跳过。 */
      '<div class="contrib-hp" aria-hidden="true"><label>请勿填写<input name="fax" tabindex="-1" autocomplete="off"></label></div>' +
      '<div class="contrib-fields"></div>' +
      '<p class="contrib-hint"></p>' +
      '<div class="contrib-msg" role="alert"></div>' +
      '<footer><div class="contrib-actions"></div>' +
      /* 页脚这句与「溯源四级」是同一件事的两面：等级只标「可核到什么程度」，
       * 不给人分级——补一条出处的人与写正史的人在同一条河上。 */
      '<p class="contrib-motto">我们都是历史的见证者，我们都是历史的创造者。</p></footer>' +
      "</form></div>";
    document.body.appendChild(form);
    form.addEventListener("click", onFormClick);
    form.addEventListener("submit", function (e) { e.preventDefault(); submitForm(); });
    form.addEventListener("input", function () { setMsg("", ""); });
    return form;
  }

  function onFormClick(e) {
    var t = e.target;
    var c = t && t.getAttribute ? t.getAttribute("data-c") : null;
    if (e.target === form || c === "close" || c === "cancel") { closeForm(); return; }
    if (!pending) return;
    if (c === "copy") { copyText(jsonText(pending.rec), "记录已复制到剪贴板"); return; }
    if (c === "download") { toast("已下载 " + download(pending.rec), 2000); return; }
    if (c === "again") { openForm(pending.kind, pending.ev); return; }
  }

  function fieldHtml(f) {
    var req = f.required ? " required" : "";
    var h = '<label class="cf cf-' + f.type + '"><span>' + esc(f.label) + "</span>";
    if (f.type === "select") {
      h += '<select name="' + f.name + '"' + req + ">" + f.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' +
          (String(o[0]) === String(f.value == null ? "" : f.value) ? " selected" : "") + ">" +
          esc(o[1]) + "</option>";
      }).join("") + "</select>";
    } else if (f.type === "textarea") {
      h += '<textarea name="' + f.name + '" rows="' + (f.rows || 2) + '" maxlength="' + f.max + '"' + req +
        (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") + "></textarea>";
    } else {
      h += '<input name="' + f.name + '" type="' + (f.type === "number" ? "number" : "text") + '"' +
        (f.min != null ? ' min="' + f.min + '"' : "") +
        (f.maxv != null ? ' max="' + f.maxv + '"' : "") + req +
        (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") +
        (f.value != null && f.value !== "" ? ' value="' + esc(f.value) + '"' : "") + ">";
    }
    return h + "</label>";
  }

  function specFor(kind) {
    if (kind === "source") {
      return {
        fields: [
          { name: "locator", type: "textarea", label: "出处定位", required: true, max: MAX.locator, rows: 3,
            ph: "例：《史记》卷六·秦始皇本纪；或 篇名 + 页码；或可公开访问的链接" },
          { name: "note", type: "textarea", label: "补充说明", max: MAX.note, rows: 2,
            ph: "选填：这个出处能支持到哪一步" },
          { name: "who", type: "text", label: "署名", max: MAX.who, ph: "选填；留空即匿名" }
        ],
        hint: "写下出处后，这条的溯源等级由本站按「读者能不能自己翻到」重算；你写的任何「已核实」都不算数，只有核对记录算。"
      };
    }
    if (kind === "check") {
      return {
        fields: [
          { name: "verdict", type: "select", label: "核对结论", required: true,
            options: Object.keys(VERDICTS).map(function (k) { return [k, VERDICTS[k]]; }) },
          { name: "locator", type: "textarea", label: "你翻的是哪一处", required: true, max: MAX.locator, rows: 2,
            ph: "卷次/页码/链接，与条目现登记的出处对照着写" },
          { name: "note", type: "textarea", label: "看到了什么", max: MAX.note, rows: 2,
            ph: "有出入请写清哪里不一样" },
          { name: "who", type: "text", label: "署名", max: MAX.who, ph: "选填；留空即匿名" }
        ],
        hint: "核对日期按提交当日写入，不接受补填——否则谁都能把自己标成三年前核过的。"
      };
    }
    return {
      fields: [
        { name: "year", type: "number", label: "年份", required: true, min: M.yearMin, maxv: M.yearMax,
          ph: "公元前填负数（无公元 0 年）" },
        { name: "yearApprox", type: "select", label: "年代性质",
          options: [["0", "确切纪年"], ["1", "学界推定（显示为 ~ 前缀）"]] },
        { name: "track", type: "select", label: "轨道", required: true,
          options: [["cn", M.tracks.cn.label], ["world", M.tracks.world.label]] },
        { name: "dim", type: "select", label: "维度", required: true,
          options: M.dimOrder.map(function (d) { return [d, M.dimensions[d].label]; }) },
        { name: "title", type: "text", label: "标题", required: true, max: MAX.title,
          ph: "至少 " + MIN.title + " 字，不超过 " + MAX.title + " 字" },
        { name: "summary", type: "textarea", label: "一句话摘要", required: true, max: MAX.summary, rows: 3,
          ph: "至少 " + MIN.summary + " 字，说清这一条在讲什么" },
        { name: "locator", type: "textarea", label: "出处", max: MAX.locator, rows: 2,
          ph: "选填。没有出处的条目会公开标为「无出处」，排在可查证据之后" },
        { name: "who", type: "text", label: "署名", max: MAX.who, ph: "选填；留空即匿名" }
      ],
      hint: "新条目先进投稿队列，重要度由本站评定后才有版面；你提交的不会盖掉已有条目，也不会自动排到别人前面。"
    };
  }

  function targetHtml(kind, ev) {
    if (kind !== "event" && ev) {
      return "<b>" + esc(ev.title) + "</b><span>" +
        esc(T.formatYear(ev.year, { approx: ev.yearApprox })) + " · " +
        esc(M.tracks[ev.track].label) + " · 溯源 " + esc(tierLabelOf(ev)) + "</span>" +
        '<code class="contrib-id">' + esc(ev.id) + "</code>";
    }
    return "<b>新增一条本站没有的记述</b><span>范围：公元前 " + Math.abs(M.yearMin) + " 年 至 " +
      M.yearMax + " 年</span>";
  }

  function editActions() {
    return '<button type="submit" class="primary">生成记录</button>' +
      '<button type="button" data-c="cancel">取消</button>';
  }

  function openForm(kind, ev) {
    if (!KINDS[kind]) return null;
    var f = ensureForm(), sp = specFor(kind);
    pending = { kind: kind, ev: ev || null, rec: null };
    stage = "edit";
    form.hidden = false;
    form.className = "contrib-modal open";
    form.querySelector(".contrib-target").innerHTML = targetHtml(kind, ev);
    form.querySelector(".contrib-fields").innerHTML = sp.fields.map(fieldHtml).join("");
    form.querySelector(".contrib-hint").textContent = sp.hint;
    form.querySelector(".contrib-actions").innerHTML = editActions();
    /* 蜜罐在 .contrib-fields 之外，重建字段区清不掉它。留着的后果不是误判机器人，
     * 而是把此后每一次正常投稿都静默吞掉——界面还会回一句「已收到」。 */
    var hp = form.querySelector('[name="fax"]');
    if (hp) hp.value = "";
    setMsg("", "");
    var first = form.querySelector(".contrib-fields input, .contrib-fields textarea, .contrib-fields select");
    if (first && first.focus) first.focus();
    document.body.classList.add("contrib-open");
    return form;
  }

  function closeForm() {
    if (!form) return;
    form.hidden = true;
    form.className = "contrib-modal";
    pending = null;
    stage = "edit";
    document.body.classList.remove("contrib-open");
  }

  function isOpen() { return !!form && !form.hidden; }

  function readForm(sp) {
    var out = {};
    sp.fields.forEach(function (f) {
      var el = form.querySelector('[name="' + f.name + '"]');
      out[f.name] = el ? el.value : "";
    });
    var hp = form.querySelector('[name="fax"]');
    out.fax = hp ? hp.value : "";
    return out;
  }

  function setMsg(t, level) {
    var m = form.querySelector(".contrib-msg");
    m.textContent = t;
    m.className = "contrib-msg" + (level ? " " + level : "");
  }

  function submitForm() {
    if (stage !== "edit" || !pending) return;
    var kind = pending.kind, sp = specFor(kind), v = readForm(sp);

    /* 蜜罐：填了就演一条「看起来成功」的路，不解释为什么——
     * 提醒一次，脚本就把这一栏改掉了；静默丢弃才有成本。 */
    if (honeypotFilled(v.fax)) { setMsg("已收到，感谢补充。", "good"); return; }

    var now = Date.now(), rl = rlState(now);
    if (!rl.ok) {
      setMsg(rl.win >= RL_MAX
        ? "提交太频繁了，请歇 " + rl.waitMin + " 分钟再来。若你在批量整理史料，欢迎一次开一个 issue 说清一批。"
        : "今天在这里的提交已经够多了（" + rl.day + " 条）。剩下的请直接联系维护者，别再刷屏。", "bad");
      return;
    }

    var rec = buildRecord(kind, Object.assign({ target: pending.ev ? pending.ev.id : "" }, v));
    var errs = checkRecord(rec);
    if (errs.length) { setMsg(errs.join("；"), "bad"); return; }

    rlCommit(now);
    pending.rec = rec;
    stage = "deliver";
    showDeliver(rec);
  }

  function showDeliver(rec) {
    var url = issueUrl(rec);
    var exits = "";
    if (url) {
      exits += '<a class="primary" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        "在 GitHub 上开一个 issue</a>";
    }
    exits += '<button type="button" data-c="copy">复制 JSON</button>' +
      '<button type="button" data-c="download">下载 .json</button>';
    form.querySelector(".contrib-fields").innerHTML =
      '<pre class="contrib-json">' + esc(jsonText(rec)) + "</pre>" +
      '<div class="contrib-exits">' + exits + "</div>";
    /* 仓库没配时不留空位、也不给假链接：如实说明记录现在只能靠人手送达。 */
    form.querySelector(".contrib-hint").textContent = url
      ? "开 issue 是本站唯一的写入通道：上面那条链接会把这份记录原样带过去。并档之后它才会出现在时间轴上，署名按记录里的 by 保留。"
      : "公开仓库地址还没登记，issue 这条通道尚未接上：先把上面这段 JSON 存下来，按 README 里的联系方式交给维护者，并档后会保留你的署名。";
    form.querySelector(".contrib-actions").innerHTML =
      '<button type="button" data-c="again">再投一条</button>' +
      '<button type="button" data-c="cancel">关闭</button>';
    setMsg("记录已生成。", "good");
  }

  /* ===== 挂载 =====
   * 不在文件加载时碰 document：本模块要能被 Node 垫片求值后单测纯函数，
   * 加载期写 DOM 会让「能不能求值」与「功能对不对」两件事糊在一起。
   * 由 app.js 在启动完成后调用一次 mount()。 */
  var mounted = false;

  function mount() {
    if (mounted) return;
    mounted = true;
    document.addEventListener("click", function (e) {
      if (!e.target || !e.target.closest) return;
      var b = e.target.closest("[data-contrib]");
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        openForm(b.getAttribute("data-contrib"), L.eventById(b.getAttribute("data-id")));
        return;
      }
      var n = e.target.closest("[data-contrib-new]");
      if (n) { e.preventDefault(); openForm("event", null); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Esc" || e.key === "Escape") { if (isOpen()) { e.stopPropagation(); closeForm(); } }
    });
  }

  /* 详情抽屉里那两条入口：跟在「史料与出处」块后面，无出处时更要出现。 */
  function bar(ev) {
    return '<div class="contrib-bar">' +
      '<button type="button" data-contrib="source" data-id="' + esc(ev.id) + '" title="' +
      esc(KINDS.source.tip) + '">补充出处</button>' +
      '<button type="button" data-contrib="check" data-id="' + esc(ev.id) + '" title="' +
      esc(KINDS.check.tip) + '">我核过这条</button></div>';
  }

  function toast(t, ms) {
    var el = document.createElement("div");
    el.className = "contrib-toast";
    el.textContent = t;
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, ms || 2000);
  }

  window.ChronContribute = {
    SCHEMA: SCHEMA, KINDS: KINDS, VERDICTS: VERDICTS, MAX: MAX, MIN: MIN, LABEL: LABEL,
    buildRecord: buildRecord, checkRecord: checkRecord, jsonText: jsonText,
    issueTitle: issueTitle, issueBody: issueBody, issueUrl: issueUrl, fileName: fileName,
    honeypotFilled: honeypotFilled, rlState: rlState, rlJudge: rlJudge,
    formSpec: specFor,
    RL: { WINDOW: RL_WINDOW, MAX: RL_MAX, DAY: RL_DAY, KEY: RL_KEY },
    openForm: openForm, closeForm: closeForm, isOpen: isOpen, bar: bar,
    todayISO: todayISO, mount: mount, isMounted: function () { return mounted; },
    repo: function () { return REPO; }, setRepo: function (v) { REPO = String(v || ""); }
  };
})();
