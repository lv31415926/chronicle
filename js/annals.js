/* annals.js | 明史编年层：底本原文的装载与阅读界面
 * 依赖：window.ChronLoader / ChronTime / ChronState / ChronDetail / ChronRouter / ChronRiver
 * 发布：window.ChronAnnals
 *
 * 这一层与前几层有一处根本不同，界面必须把它摆在最前面：
 * 事件层的每条是本站写的白话摘要，编年层的每条是《明史》原文连续句——本站一个字没改。
 * 所以这里的风险不是「编得像不像」，而是「读者会不会把史书的记述当成已核的事实」。
 * 每条都带卷次（j）与系年来源（a）：a=b 是本纪按日连续系年（这句自己没写年月），
 * a=s 是年月或年号写在这句里面。两者可核的程度不一样，界面不给它们同一个写法。
 *
 * 装载按年代范围，不在启动时全取：22 片 1.4 MB 全落在 1272—1644 这 372 年里，
 * 而读者多数时候看的是整条五千年轴；为首屏那一小段付 1.4 MB，等于让所有人
 * 为一处可能不看的内容排队。分批与两个预算沿用 loader.js（同一条慢链路上
 * 全并发会把彼此拖死），这里只借它的数字，不再自己写死。
 */
(function () {
  "use strict";

  var L = window.ChronLoader, T = window.ChronTime, S = window.ChronState;
  var INJECT_TIMEOUT = window.__CHRONICLE_ANNALS_TIMEOUT || L.injectTimeout;
  var FIRST_TRY = window.__CHRONICLE_ANNALS_FIRST_TIMEOUT || L.firstTryTimeout;
  var DIR = "data/annals/";
  var MAN_FILE = "manifest.js";

  /* 部类与类别的中文标签在这里有一份，判据在 tools/mingshi-lib.mjs 有一份。
   * 抄两份是本项目既有做法（涟漪、故事同理），代价由门付：
   * tools/test-annals.mjs 把两侧逐字对账，改名不同步就判红。 */
  var SECTION_LABEL = { ji: "本纪", zhi: "志", biao: "表", zhuan: "列传" };
  var KIND_LABEL = {
    sang: "丧殁", zai: "灾异", si: "边藩朝贡", bing: "兵事",
    guan: "官制除授", cai: "财赋", li: "礼文", za: "杂记"
  };
  var ANCHOR_LABEL = {
    b: "本纪连续系年：这句自己没写年月，年代跟着本纪往下排。",
    s: "句内自标：年月日或年号写在这句自己里面，不靠上下文。"
  };
  var MONTHS = ["", "正月", "二月", "三月", "四月", "五月", "六月",
    "七月", "八月", "九月", "十月", "十一月", "十二月"];

  var MAN = null, manifestFailing = null;
  var loadedIds = {}, failedIds = {}, inflight = {};
  var byYear = Object.create(null);      // 公元年 -> [node]（只含已载入片）
  var byJuan = Object.create(null);      // 卷次 -> [node]
  var tally = { nodes: 0, sections: {}, kinds: {}, anchors: {} };
  var loaded = false;                    // 清单到手且至少一片落地
  var panel = null, headEl = null, bodyEl = null, statsEl = null;
  var view = { sections: {}, kinds: {}, anchor: "", q: "", year: 0, juan: "", followRange: true };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function injectSrc(src, ms) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("载入超时（" + ms + "ms 无响应）：" + src));
      }, ms);
      function done(fn) {
        return function () { clearTimeout(timer); if (s.parentNode) s.parentNode.removeChild(s); fn(); };
      }
      s.src = src; s.async = true;
      s.onload = done(resolve);
      s.onerror = done(function () { reject(new Error("文件缺失：" + src)); });
      document.head.appendChild(s);
    });
  }

  /* ---------- 索引：每片落地即并入，界面不必等整批 ---------- */
  function absorb(id, arr) {
    for (var i = 0; i < arr.length; i++) {
      var n = arr[i];
      n._chunk = id;
      (byYear[n.y] || (byYear[n.y] = [])).push(n);
      (byJuan[n.j] || (byJuan[n.j] = [])).push(n);
      tally.nodes++;
      tally.sections[n.s] = (tally.sections[n.s] || 0) + 1;
      tally.kinds[n.k] = (tally.kinds[n.k] || 0) + 1;
      tally.anchors[n.a] = (tally.anchors[n.a] || 0) + 1;
    }
    loadedIds[id] = true;
    delete failedIds[id];
    delete inflight[id];
    loaded = true;
    window.dispatchEvent(new CustomEvent("chronicle:annals", { detail: { id: id, count: arr.length } }));
  }

  /* 片与年代的交集判据只用 yearFrom/yearTo，不用 id 前缀：
   * 前缀是命名，命名写歪一位就会整批漏取，而体积账是按这两个字段生成的。 */
  function chunksFor(from, to, section) {
    if (!MAN) return [];
    return MAN.chunks.filter(function (c) {
      if (section && c.id.indexOf(section + "-") !== 0) return false;
      return c.yearTo >= from && c.yearFrom <= to;
    });
  }
  function chunksCovering(y) { return chunksFor(y, y); }

  function loadManifest() {
    if (MAN) return Promise.resolve(MAN);
    if (manifestFailing) return Promise.reject(new Error(manifestFailing));
    return injectSrc(DIR + MAN_FILE, FIRST_TRY).then(function () {
      var m = window.__CHRONICLE_ANNALS_MANIFEST;
      if (!m || !Array.isArray(m.chunks)) throw new Error(MAN_FILE + " 已加载但没有 chunks 数组");
      if (!m.census || !m.census.nodes) throw new Error(MAN_FILE + " 缺少 census（界面拿它报「共几条」）");
      MAN = m;
      return m;
    }).catch(function (e) {
      /* 坏清单不得缓存成好清单：与事件层同一条规矩，第二次调用仍须落定为失败。 */
      manifestFailing = e.message;
      console.error("[annals] " + e.message);
      throw e;
    });
  }

  function loadChunk(c, ms) {
    if (loadedIds[c.id]) return Promise.resolve(0);
    if (inflight[c.id]) return inflight[c.id];
    inflight[c.id] = injectSrc(DIR + c.file, ms || INJECT_TIMEOUT).then(function () {
      var store = window.__CHRONICLE_ANNALS || {};
      if (!Array.isArray(store[c.id])) {
        throw new Error("分片未注册 " + c.id + "（" + c.file + " 已加载但全局里没有它）");
      }
      absorb(c.id, store[c.id]);
      return store[c.id].length;
    }).catch(function (e) {
      delete inflight[c.id];
      failedIds[c.id] = e.message;      // 少一片要留账：静默少数据比报错难查
      console.error("[annals] " + c.id + ": " + e.message);
      return 0;
    });
    return inflight[c.id];
  }

  var BATCH = 3;
  /* 分批而不是一次全并发：22 片同时拉，在慢链路上每条都更慢、整批一起超时——
   * 事件层为这件事专门改过（loader.js），同一条链路没有理由重犯。
   * 收尾必须包成 Promise：视窗那片已经载入时 need 是空数组，
   * 直接 return 数字会把调用方的 .then 当场打断。 */
  function loadList(list, until) {
    function step(i, n) {
      if (i >= list.length) return Promise.resolve(n);
      if (until && until()) return Promise.resolve(n);
      return Promise.all(list.slice(i, i + BATCH).map(function (c) { return loadChunk(c); }))
        .then(function (rs) { return step(i + BATCH, n + rs.reduce(function (a, b) { return a + b; }, 0)); });
    }
    return step(0, 0);
  }

  function gapOf(c, from, to) {
    if (c.yearTo < from) return from - c.yearTo;
    if (c.yearFrom > to) return c.yearFrom - to;
    return 0;
  }

  /* 视窗内那片用紧预算先取，其余交后台宽预算补：抽屉开在第一片上，
   * 让读者对着「载入中」等完二十几片，比让他多等一片更糟。 */
  function ensure(from, to) {
    return loadManifest().then(function () {
      var need = chunksFor(from, to).filter(function (c) { return !loadedIds[c.id]; });
      need.sort(function (a, b) { return gapOf(a, from, to) - gapOf(b, from, to) || a.id < b.id ? -1 : 1; });
      var first = need.shift();
      var p = first ? loadChunk(first, FIRST_TRY) : Promise.resolve(0);
      return p.then(function (n) { return loadList(need).then(function (m) { return n + m; }); });
    });
  }

  /* 「读完整部明史」的出口：22 片，读者自己按。 */
  function ensureAll() {
    return loadManifest().then(function () {
      return loadList(MAN.chunks.filter(function (c) { return !loadedIds[c.id]; }));
    });
  }

  /* ---------- 取数 ---------- */
  function nodesIn(from, to) {
    var out = [];
    for (var y = from; y <= to; y++) out = out.concat(byYear[y] || []);
    return out;
  }
  function atYear(y) { return byYear[y] || []; }
  function nodesOfJuan(j) { return byJuan[j] || []; }
  function isLoaded() { return loaded; }
  function chunkCount() { return Object.keys(loadedIds).length; }
  function failedList() {
    return Object.keys(failedIds).map(function (id) { return { id: id, reason: failedIds[id] }; });
  }
  function census() { return MAN ? MAN.census : null; }
  function manifest() { return MAN; }
  /* 读数只从已载入的片里算，并说清分母是哪一份：
   * 只取了 2 片时说「共 7535 条」是句假话，「已载入 2/22 片 · 892 条」才是实话。 */
  function stats() {
    return {
      nodes: tally.nodes,
      sections: Object.assign({}, tally.sections),
      kinds: Object.assign({}, tally.kinds),
      anchors: Object.assign({}, tally.anchors),
      chunks: chunkCount(),
      total: MAN ? MAN.chunks.length : 0
    };
  }
  function coversYear(y) {
    if (!MAN) return false;
    var c = chunksCovering(y);
    return c.length > 0 && c.every(function (x) { return !!loadedIds[x.id]; });
  }
  function inflightYear(y) {
    if (!MAN) return false;
    return chunksCovering(y).some(function (c) { return !!inflight[c.id]; });
  }

  /* ---------- 年月日标签：只用节点自带的三个锚，不补任何推算 ---------- */
  /* 左柱只写原文里没有的东西。本纪的句子本来就以太干支起头（「乙巳，免浙江银课」），
   * 柱里再抄一遍就成「乙巳乙巳」——实测 1449—1454 这 273 条里 143 条撞这个重复。
   * 原文一字不改是这一层的底线，所以要改的是柱子，不是句子。 */
  function whenLabel(n) {
    var q = String(n.q || "");
    if (n.w) return q.indexOf("是年") === 0 ? "" : "是年";
    var mo = n.m ? (n.L ? "闰" : "") + (MONTHS[n.m] || n.m + "月") : "";
    var s = "";
    /* 原文按「二月乙巳」顺序写出来的，柱子就整段让给它；只写了干支的，柱子补月份。 */
    if (mo && q.indexOf(mo) !== 0) s += mo;
    if (n.g && q.indexOf(n.g) !== 0 && !(mo && q.indexOf(mo + n.g) === 0)) s += n.g;
    /* 「年月未记」只能说给真的没有锚的条目：锚在原文开头写着的时候，柱子空着是
     * 让位，不是缺失——两者混成一句谎话，读者会以为这句没日期。 */
    return s || (n.m || n.g ? "" : "年月未记");
  }
  function yearHead(y, ns) {
    /* 一年里改过元的（1449 正统→景泰这类）不止一处：只取第一条的年号，
     * 等于给后半年也盖了前一任的年号，所以把这一年的年号都列出来。 */
    var es = [];
    ns.forEach(function (n) { if (n.e && es.indexOf(n.e) < 0) es.push(n.e); });
    return '<h3 class="an-yh"><button type="button" data-an-year="' + y + '" title="把时间轴移到这一年">' +
      esc(T.formatYearShort(y)) + "</button>" +
      (es.length ? '<span class="an-reign">' + esc(es.join("／")) + "</span>" : "") +
      "<i>" + ns.length + " 条</i></h3>";
  }

  function nodeLine(n) {
    var when = whenLabel(n);
    /* 柱子让位给原文时（1449—1454 这一段实测：本纪 222 条里 195 条让位，志 29 条、列传 22 条
     * 一条不让——只有本纪把年月写在句首），那一格是空的：
     * 留着 62px 空槽会把整行推右，看起来像排版坏了，所以这一行换成单栏。 */
    return '<div class="an-node an-' + esc(n.s) + (when ? "" : " an-nolabel") + '">' +
      '<span class="an-when">' + esc(when) + "</span>" +
      '<p class="an-q">' + esc(n.q) + "</p>" +
      '<div class="an-meta">' +
        '<button type="button" class="an-juan" data-an-juan="' + n.j + '" ' +
          'title="点此只看这一卷（卷' + n.j + "）\">" +
          esc(SECTION_LABEL[n.s] || n.s) + "卷" + n.j + "</button>" +
        '<span class="an-kind">' + esc(KIND_LABEL[n.k] || n.k) + "</span>" +
        '<span class="an-anchor an-a-' + esc(n.a) + '" title="' + esc(ANCHOR_LABEL[n.a] || "") + '">' +
          (n.a === "b" ? "本纪系年" : "句内自标") + "</span>" +
      "</div></div>";
  }

  /* ---------- 详情抽屉里的「《明史》这一年的原文」 ---------- */
  /* 同步返回，所以取不到数据时给一句实话而不是空白；顺手把该片取来再重画。 */
  function block(ev) {
    if (!ev || ev.track !== "cn") return "";
    var c = census();
    if (!c || manifestFailing) return "";
    if (ev.year < c.from || ev.year > c.to) return "";
    if (!coversYear(ev.year)) {
      if (!inflightYear(ev.year)) ensure(ev.year, ev.year).then(repaintDetail);
      return '<div class="para an-wait"><h5>《明史》编年</h5><p>这一年的编年原文正在载入，稍候自动重画。</p></div>';
    }
    var ns = atYear(ev.year);
    if (!ns.length) return "";
    return '<div class="para an-block"><h5>《明史》记这一年 · ' + ns.length + " 条</h5>" +
      ns.slice(0, 3).map(nodeLine).join("") +
      (ns.length > 3 ? '<button type="button" class="an-go" data-an-year="' + ev.year +
        '">还有 ' + (ns.length - 3) + " 条，打开编年看全年</button>" : "") +
      '<p class="an-note">以上逐字引自《明史》底本，每条后面的卷次就是它出自哪一卷。' +
      "标「本纪系年」的是这句自己没写年月、年代跟着本纪排；标「句内自标」的是年月或年号写在这句里。" +
      "史文如此写，不等于事必如此。</p></div>";
  }
  function repaintDetail() {
    if (!window.ChronDetail || !ChronDetail.isOpen()) return;
    if (ChronDetail.mode === "event" && S) {
      var id = S.get().selectedId;
      if (id) ChronDetail.openEvent(id);
    }
  }

  /* ---------- 抽屉 ---------- */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = "annals";
    panel.className = "an-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "明史编年原文");
    panel.innerHTML =
      '<header class="an-head">' +
        '<div><div class="an-crumb" id="an-crumb">明史编年</div><div class="an-stats" id="an-stats"></div></div>' +
        '<div class="an-tools">' +
          /* 「载入整部」不在这里放按钮：它只在片没取齐时才是个动作，
           * 而那时读者正在看的就是上面那行「已载入 3/22 片」——按钮长在那句话旁边。
           * 这里也不写死片数与体积，那两个数字每重生一次分片就会过期一次。 */
          '<button type="button" data-act="river" title="把这一段的编年原文按年铺进全屏长河">铺成长河</button>' +
          '<button type="button" data-act="close" title="关闭 (Esc)">✕</button>' +
        "</div>" +
      "</header>" +
      '<div class="an-filters" id="an-filters"></div>' +
      '<div class="an-body" id="an-body" tabindex="0"></div>';
    document.body.appendChild(panel);
    headEl = panel.querySelector("#an-crumb");
    statsEl = panel.querySelector("#an-stats");
    bodyEl = panel.querySelector("#an-body");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-an-year],[data-an-juan],[data-an-section]," +
        "[data-an-kind],[data-an-clear],[data-an-page]");
      if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "close") { close(); return; }
      if (act === "all") {
        b.disabled = true; b.textContent = "载入中…";
        ensureAll().then(function () { render(); }, function () { render(); });
        return;
      }
      if (act === "river") { toRiver(); return; }
      if (b.hasAttribute("data-an-year")) {
        var y = Number(b.getAttribute("data-an-year"));
        if (window.ChronTimeline) { ChronTimeline.flyToYear(y, 24); ChronTimeline.invalidate(); }
        openYear(y);
        return;
      }
      if (b.hasAttribute("data-an-juan")) {
        var j = Number(b.getAttribute("data-an-juan"));
        view.juan = view.juan === j ? "" : j;
        reloadWindow();
        return;
      }
      if (b.hasAttribute("data-an-section")) {
        view.sections[b.getAttribute("data-an-section")] = !view.sections[b.getAttribute("data-an-section")];
        render();
        return;
      }
      if (b.hasAttribute("data-an-kind")) {
        view.kinds[b.getAttribute("data-an-kind")] = !view.kinds[b.getAttribute("data-an-kind")];
        render();
        return;
      }
      if (b.hasAttribute("data-an-clear")) { clearFilters(); return; }
      if (b.hasAttribute("data-an-page")) {
        /* 翻页要走 openYear：它把 ?y= 一起改了。只改屏不改地址，
         * 读者翻到 1455—1460 后把链接发出去，对方打开还是 1449。 */
        openYear(Number(b.getAttribute("data-an-page")));
      }
    });
    return panel;
  }

  function anyTrue(o) { return Object.keys(o).some(function (k) { return o[k]; }); }

  function clearFilters() {
    view.sections = {}; view.kinds = {}; view.juan = ""; view.q = "";
    /* 屏上的筛选清了，地址栏还留着 ?juan=：刷新就把它请回来，读者看到的是「清了但没清」。
     * 但 ?y= 要留着——年份不是筛选，读者刚翻到哪一年就该还钉在哪一年；
     * 一并抹掉的话，他发出去的链接和发出去的那一屏就对不上了。 */
    if (location.hash.indexOf("#/annals") === 0) {
      window.ChronRouter.go("#/annals" + (view.year ? "?y=" + view.year : ""));
    }
  }

  function passFilters(n) {
    if (view.juan && n.j !== view.juan) return false;
    if (anyTrue(view.sections) && !view.sections[n.s]) return false;
    if (anyTrue(view.kinds) && !view.kinds[n.k]) return false;
    if (view.q && String(n.q).indexOf(view.q) < 0) return false;
    return true;
  }

  /* 一次最多铺这一档年数：整段明史 7535 条一次进 DOM，浏览器只剩滚动条在动，
   * 而读者要的是「先落在某一年，再往前后翻」。 */
  var YEAR_WINDOW = 6;
  var WINDOW_MAX = 24;
  function rangeShown() {
    var c = census(), r = S.get().range;
    var from, to;
    if (view.juan) {
      var ns = nodesOfJuan(view.juan);
      if (!ns.length) return null;
      from = ns[0].y; to = ns[0].y;
      ns.forEach(function (n) { if (n.y < from) from = n.y; if (n.y > to) to = n.y; });
    } else if (view.year) {
      from = view.year; to = view.year + YEAR_WINDOW - 1;
    } else if (view.followRange && r.to - r.from > 40) {
      /* 时间轴区间比明史整段还宽时跟着它走没意义（会把全段一次铺开），
       * 收到视窗中心附近的窗口。 */
      from = Math.round((Math.max(c.from, r.from) + Math.min(c.to, r.to)) / 2) - Math.floor(YEAR_WINDOW / 2);
      to = from + YEAR_WINDOW - 1;
    } else if (view.followRange) {
      from = Math.max(c.from, r.from); to = Math.min(c.to, r.to);
      if (to - from + 1 > WINDOW_MAX) to = from + WINDOW_MAX - 1;
    } else {
      from = c.from; to = c.to;
      if (to - from + 1 > WINDOW_MAX) {
        from = (view.year || Math.round((c.from + c.to) / 2)) - Math.floor(WINDOW_MAX / 2);
        to = from + WINDOW_MAX - 1;
      }
    }
    from = Math.max(c.from, from); to = Math.min(c.to, to);
    if (to < from) { var t = from; from = to; to = t; }
    return [from, to];
  }

  function filtersBar() {
    var st = stats(), c = census();
    var p = ['<div class="an-row"><span class="an-lab">部类</span>'];
    Object.keys(SECTION_LABEL).forEach(function (s) {
      if (!c.bySection[s]) return;
      p.push('<button type="button" class="an-pill' + (view.sections[s] ? " on" : "") +
        '" data-an-section="' + s + '">' + esc(SECTION_LABEL[s]) + " <i>" + (st.sections[s] || 0) + "</i></button>");
    });
    p.push('</div><div class="an-row an-row-kind"><span class="an-lab">类别</span>');
    Object.keys(KIND_LABEL).forEach(function (k) {
      p.push('<button type="button" class="an-pill' + (view.kinds[k] ? " on" : "") +
        '" data-an-kind="' + k + '" title="类别按句首关键词派生，只用于筛选，不判真伪">' +
        esc(KIND_LABEL[k]) + " <i>" + (st.kinds[k] || 0) + "</i></button>");
    });
    p.push('</div><div class="an-row"><input id="an-q" type="search" placeholder="句中含这些字" value="' +
      esc(view.q) + '">' + (view.juan ? '<span class="an-who">只看卷' + view.juan + "</span>" : "") +
      /* 清除是筛选的对偶：以前只在「只看某卷」和「空结果」两处放按钮，
       * 于是按了两个部类又有结果可看时，读者只能把药丸一个个点回去。 */
      (anyTrue(view.sections) || anyTrue(view.kinds) || view.juan || view.q
        ? '<button type="button" data-an-clear="1">清除筛选</button>' : "") +
      "</div>");
    panel.querySelector("#an-filters").innerHTML = p.join("");
    var inp = panel.querySelector("#an-q");
    inp.addEventListener("input", function () { view.q = this.value; render(); });
    if (view.q && document.activeElement !== inp) {
      /* 重画把输入框换了新的：不夺回焦点，读者每敲一个字都要重新点一下框 */
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* 旧浏览器忽略 */ }
    }
  }

  function render() {
    if (!panel) return;
    if (manifestFailing) {
      headEl.textContent = "明史编年";
      statsEl.innerHTML = "";
      panel.querySelector("#an-filters").innerHTML = "";
      bodyEl.innerHTML = '<div class="an-bad">编年数据没载入：' + esc(manifestFailing) + "</div>";
      return;
    }
    var c = census();
    if (!loaded) {
      headEl.textContent = "明史编年 · 载入中";
      bodyEl.innerHTML = '<div class="an-bad">正在载入编年分片（共 ' + MAN.chunks.length + " 片）…</div>";
      return;
    }
    filtersBar();
    var st = stats();
    var lim = rangeShown();
    var shown = lim ? nodesIn(lim[0], lim[1]).filter(passFilters) : [];

    headEl.textContent = view.juan ? "《明史》卷" + view.juan + " 的编年句" : "《明史》编年 · 原文";
    /* 还差多少片和还要下多少字节都从清单现算：写死的数字在分片重生后就成了假话，
     * 而这一层偏偏最容易被重生（抽取器一改，22 片全换）。 */
    var rest = MAN.chunks.filter(function (c) { return !loadedIds[c.id]; });
    var restKB = rest.reduce(function (a, c) { return a + (c.bytes || 0); }, 0) / 1024;
    var restLabel = restKB > 0 ? " · 约 " + (restKB >= 1024 ? (restKB / 1024).toFixed(1) + " MB" : Math.round(restKB) + " KB") : "";
    statsEl.innerHTML =
      "已载入 " + st.chunks + "/" + st.total + " 片 · " + st.nodes + "/" + c.nodes + " 条" +
      (st.chunks < st.total
        ? ' <button type="button" data-act="all" title="把清单里剩下的分片全部取来">载入整部（还差 ' +
          rest.length + " 片" + restLabel + "）</button>"
        : "") +
      (failedList().length ? ' <span class="an-fail">' + failedList().length + " 片没取到</span>" : "") +
      (lim ? " · 本段 " + shown.length + " 条（" + lim[0] + "—" + lim[1] + "）"
        /* 卷次深链是唯一的例外：分片按年代切、不按卷切，所以「第 75 卷」落在哪一片
         * 装载层无从判断——此时说「这一段没有原文」是假话，说「先载入整部」才是实话。 */
        : ' · <span class="an-fail">这一卷不在已载入的片里（分片按年代切，卷次跨片）' +
          (st.chunks < st.total ? "，请按上面「载入整部」" : "") + "</span>") +
      '<label class="an-chk"><input type="checkbox" id="an-follow"' + (view.followRange ? " checked" : "") +
      "> 随时间轴区间</label>";
    var follow = panel.querySelector("#an-follow");
    if (follow) follow.addEventListener("change", function () { view.followRange = this.checked; reloadWindow(); });

    if (!shown.length) {
      bodyEl.innerHTML = '<div class="an-bad">这一段没有符合条件的原文。' +
        (st.chunks < st.total ? "整部还没载入完，可先「载入整部」。" : "") +
        '<button type="button" data-an-clear="1">清除筛选</button></div>';
      return;
    }
    var byY = {};
    shown.forEach(function (n) { (byY[n.y] || (byY[n.y] = [])).push(n); });
    var years = Object.keys(byY).map(Number).sort(function (a, b) { return a - b; });
    /* 窗口两头各给一个出口：读者不必自己回时间轴拖 */
    var stepN = view.juan ? WINDOW_MAX : YEAR_WINDOW;
    var nav = '<div class="an-nav">' +
      '<button type="button" data-an-page="' + Math.max(c.from, lim[0] - stepN) + '">← 早 ' + stepN + " 年</button>" +
      "<span>" + years.length + " 年 · " + shown.length + " 条</span>" +
      '<button type="button" data-an-page="' + Math.min(c.to, lim[1] + 1) + '">晚 ' + stepN + " 年 →</button></div>";
    bodyEl.innerHTML = nav + years.map(function (y) {
      return '<section class="an-sec">' + yearHead(y, byY[y]) + byY[y].map(nodeLine).join("") + "</section>";
    }).join("") + nav;
    bodyEl.scrollTop = 0;
  }

  function toRiver() {
    var c = census(), st = stats();
    if (!window.ChronRiver || !st.nodes) return;
    var lim = rangeShown();
    var items = lim ? nodesIn(lim[0], lim[1]).filter(passFilters) : [];
    close();
    ChronRiver.open({
      annals: items,
      label: "《明史》编年 " + (lim ? lim[0] + "—" + lim[1] : c.from + "—" + c.to) +
        "（" + items.length + " 条原文）"
    });
  }

  function open(opts) {
    ensurePanel();
    opts = opts || {};
    if (opts.year) view.year = Number(opts.year);
    if (opts.section) { view.sections = {}; view.sections[opts.section] = true; }
    if (opts.q != null) view.q = opts.q;
    if (opts.juan) view.juan = Number(opts.juan);
    panel.hidden = false;
    document.body.classList.add("an-open");
    /* 顶栏按钮亮灭由这里的信号驱动，不写在点击回调里：这一层还有路由、
     * 快捷键、详情跳转三条入口，只在一处点亮的按钮必在某条路上对不上。 */
    window.dispatchEvent(new Event("chronicle:annals-open"));
    /* 取片的范围从「这一屏要铺哪几年」来，不从顶栏区间来：顶栏默认铺五千年，
     * 拿它当装载范围等于一开抽屉就拉完整部 22 片 1.4 MB——而这一屏最多只画 24 年。
     * 画哪一段取哪一段，「整部」留给读者按的那颗按钮。 */
    return loadManifest().then(reloadWindow).then(function () { return true; },
      function () { render(); return false; });
  }

  /* 窗口一动就重新对账：翻页、点卷次、点年号都走这里。
   * 先画再取也行，但那样读者翻进没载入的年代会先撞见一句
   * 「这一段没有符合条件的原文」——那句话只在整部载入完时才成立。 */
  function reloadWindow() {
    var lim = rangeShown();
    return lim ? ensure(lim[0], lim[1]).then(render, render) : Promise.resolve(render());
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("an-open");
    window.ChronRouter.resetHash(["#/annals"]);
    window.dispatchEvent(new Event("chronicle:annals-open"));
  }
  function isOpen() { return !!panel && !panel.hidden; }

  function openYear(y) {
    view.year = Number(y);
    window.ChronRouter.go("#/annals?y=" + y);
    return open({ year: y });
  }
  function openJuan(j) {
    view.juan = Number(j);
    window.ChronRouter.go("#/annals?juan=" + j);
    return open({ juan: j });
  }

  /* 详情抽屉的点击委托不认识 an-* 属性，交回本模块处理；
   * 返回值表示「这一笔我接了」，detail.js 据此停止往下试。 */
  function handleDetailClick(el) {
    if (!el) return false;
    if (el.hasAttribute("data-an-year")) { openYear(el.getAttribute("data-an-year")); return true; }
    if (el.hasAttribute("data-an-juan")) { openJuan(el.getAttribute("data-an-juan")); return true; }
    return false;
  }

  /* 勾了「随时间轴区间」就得真的跟着走：区间是顶栏控件、快捷键、深链改的，
   * 抽屉不订阅 state 的话，这句承诺只在点开它的那一刻成立。
   * 只认 range 这一个键——其余状态变化（选中条目、筛选）不改这一屏铺哪几年。 */
  S.subscribe(function (s, ch) {
    if (isOpen() && view.followRange && ch.range) reloadWindow();
  });

  window.ChronAnnals = {
    SECTION_LABEL: SECTION_LABEL, KIND_LABEL: KIND_LABEL, YEAR_WINDOW: YEAR_WINDOW,
    ensure: ensure, ensureAll: ensureAll, isLoaded: isLoaded, stats: stats,
    census: census, manifest: manifest, chunksFor: chunksFor,
    nodesIn: nodesIn, atYear: atYear, nodesOfJuan: nodesOfJuan, coversYear: coversYear,
    failedList: failedList, whenLabel: whenLabel, yearHead: yearHead, chunkCount: chunkCount, rangeShown: rangeShown,
    block: block, card: nodeLine, open: open, close: close, isOpen: isOpen, render: render,
    openYear: openYear, openJuan: openJuan, handleDetailClick: handleDetailClick,
    dir: DIR, manFile: MAN_FILE, batchSize: BATCH
  };
})();
