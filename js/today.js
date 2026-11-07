/* today.js | 「历史上的今天」：把日历变成一个入口，一条变五条
 * 依赖：window.ChronLoader / ChronTime / ChronState / ChronDetail / ChronRiver / ChronRouter / ChronProv
 * 发布：window.ChronToday
 *
 * 这一层凭什么存在：日层 data/dates.js 里的每一个 (m,d) 都是从条目自己的文本里派生出来的
 * （口径见 tools/date-lib.mjs），所以本页**一个日期都不生产**，只把已有纪日的那几条摊开。
 * 页面一旦开始「凑数」，它就成了全站唯一一个可以造假日期的地方——所以版式上有三条硬规矩：
 *   ① how=src 的那一层必须标「出处纪日」：那是文书落款日，不等于事件发生日，混进「今天」
 *      就是把一条史实的日期抬进另一条史实。
 *   ② 空着的日子就说空着。邻近三天的条目要列，也必须带着自己的日子列——不能排进今天的名单里。
 *   ③ 早于盘上 prolepticBefore 的「公历日」是后世历表推的（当时行儒略历），页脚必须说这一句。
 *      这个数字读自 data/dates.js，不在本文件里抄一份：抄了就没人管它跟 date-lib 打不打架。
 *   ④ 深链可以写 #/today/4/31，可这一天不存在。按盘上 mdays 判出来不存在，就照实说不存在、
 *      落回读者的今天——默默画一个「4 月 31 日」的标题，是这一层唯一一种会被当成史实的造假。
 */
(function () {
  "use strict";

  var HOW_LABEL = {
    text: "正文纪日",
    process: "经过段纪日",
    src: "出处纪日",
    "text-cn": "中文纪日"
  };
  var HOW_TIP = {
    text: "这个月日就写在条目的标题或摘要里",
    process: "这个月日写在条目的经过段里",
    src: "只出现在出处里：这是文书/文件的落款日期，不一定是事件发生的那一天",
    "text-cn": "原文用中文写月日（如「十二月十三日」）；本库只收 1912 年及以后，此前多为农历，不做历表换算"
  };

  var panel = null, head = null, body = null, foot = null;
  var day = null;                 // {m,d}
  var ghost = null;               // 深链点了个不存在的日子（4/31、2/30）时的原样，页面上要说清并回落真今天
  var byMD = Object.create(null); // "m-d" -> [rec]
  var ready = false;              // 语料片是否已铺满：缺片时「今天」会少条目，且没人知道少的是哪几条

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- 日层 ---------- */
  function dates() { return window.__CHRONICLE_DATES || null; }
  function indexDates() {
    var D = dates();
    byMD = Object.create(null);
    if (!D || !Array.isArray(D.recs)) return null;
    D.recs.forEach(function (r) {
      var k = r.m + "-" + r.d;
      (byMD[k] || (byMD[k] = [])).push(r);
    });
    return D;
  }

  function todayMD() {
    var n = new Date();
    return { m: n.getMonth() + 1, d: n.getDate() };
  }
  /* 日历上有没有这一天。各月天数只认盘上的 mdays（那一份表归 date-lib 生成）：
   * 路由或界面各自抄一份，就会抄出两个口径——实测旧路由那份放过 4/31、吞掉 2/30。
   * 返回 null 表示日层没载入（那时页面上已经写着「日层没载入」），不在此处拦。 */
  function cellExists(m, d) {
    var D = dates();
    if (!D || !Array.isArray(D.mdays) || D.mdays.length !== 12) return null;
    if (!Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12 || d < 1) return false;
    return d <= D.mdays[m - 1];
  }
  function monthLen(m) {
    var D = dates();
    return D && Array.isArray(D.mdays) && m >= 1 && m <= 12 ? D.mdays[m - 1] : null;
  }
  /* 前后挪 N 天一律借 Date 走：闰年、大小月、跨年都由它算，自己写月天数就会写错二月。 */
  function shiftMD(m, d, delta) {
    var x = new Date(2000, m - 1, d);
    x.setDate(x.getDate() + delta);
    return { m: x.getMonth() + 1, d: x.getDate() };
  }

  function recsFor(m, d) { return byMD[m + "-" + d] || []; }

  /* 「同一个号数在别的月份」是这一页的第二个入口：今天空着的时候，
   * 别的月的今天可能很热闹。它们不叫今天，所以只给数字与跳转，不铺进今天的名单。 */
  function sameDayOtherMonths(m, d) {
    var out = [];
    for (var i = 1; i <= 12; i++) {
      if (i === m) continue;
      var n = recsFor(i, d).length;
      if (n) out.push({ m: i, n: n });
    }
    return out;
  }

  /* 空日兜底：±3 天内的条目，每一条都带着自己的日期出现。 */
  function nearbyDays(m, d, span) {
    var out = [];
    for (var k = -span; k <= span; k++) {
      if (!k) continue;
      var nd = shiftMD(m, d, k);
      recsFor(nd.m, nd.d).forEach(function (r) { out.push({ rec: r, m: nd.m, d: nd.d }); });
    }
    return out;
  }

  function statsLine() {
    var D = dates();
    if (!D || !Array.isArray(D.recs)) return { recs: 0, slots: 0, blanks: null, ambiguous: 0 };
    indexDates();
    var slots = Object.keys(byMD).length;
    /* 空天数从日层读，不在这里数格子：界面自己写一遍 d<=31，就会把 4/31、6/31、9/31、11/31
     * 当成「空着的一天」报给读者。读不到就整句不说——宁可少一句账，也不能报一个编出来的数。 */
    return { recs: D.recs.length, slots: slots, blanks: Number.isInteger(D.blankDays) ? D.blankDays : null,
      ambiguous: D.ambiguousCount || 0 };
  }

  function row(rec, showMD) {
    var e = window.ChronLoader.eventById(rec.id);
    if (!e) return "";
    var M = window.__CHRONICLE_META, T = window.ChronTime, PV = window.ChronProv;
    var d = M.dimensions[e.dim], tk = M.tracks[e.track];
    var nowY = new Date().getFullYear();
    /* 「约」字不能省：历法上没有「公元 0 年」，跨公元前后的整年数天生差一。 */
    var ago = e.year > 0 ? nowY - e.year : nowY + Math.abs(e.year);
    var era = T ? T.eraOf(e.track, e.year) : null;
    var meta = [e.state || "", era ? era.label : ""].filter(Boolean).join(" · ");
    return '<div class="td-it" data-ev="' + esc(e.id) + '">' +
      '<span class="td-y">' + esc(T ? T.formatYearShort(e.year, e.yearApprox) : e.year) +
        (showMD ? "<em>" + esc(rec.m + "月" + rec.d + "日") + "</em>" : "") +
        "<i>约 " + ago + " 年前</i></span>" +
      '<span class="td-g" style="color:' + d.color + '" title="' + esc(d.label) + '">' + d.glyph + "</span>" +
      '<span class="td-c"><b>' + esc(e.title) + "</b>" + (PV ? PV.badge(e) : "") +
        '<span class="td-m"><i style="color:' + tk.color + '">' + esc(tk.short) + "</i> " +
        esc(meta ? meta + " · " + e.summary : e.summary) + "</span></span>" +
      '<span class="td-h how-' + esc(rec.how) + '" title="' + esc(HOW_TIP[rec.how] || "") + '">' +
        esc(HOW_LABEL[rec.how] || rec.how) + "</span>" +
      "</div>";
  }

  function rows(recs) {
    return recs.slice().sort(function (a, b) {
      var ea = window.ChronLoader.eventById(a.id), eb = window.ChronLoader.eventById(b.id);
      return (ea ? ea.year : 0) - (eb ? eb.year : 0);
    }).map(function (r) { return row(r, false); }).join("");
  }

  function footer(m, d, list) {
    var st = statsLine();
    var PB = (dates() || {}).prolepticBefore;
    var hasSrc = list.some(function (r) { return r.how === "src"; });
    var hasOld = typeof PB === "number" && list.some(function (r) {
      var e = window.ChronLoader.eventById(r.id); return e && e.year < PB;
    });
    var parts = ['<p class="td-note">这些月日不是编辑手打的：每条都取自该条自己的标题、摘要、经过段或出处，' +
      "且必须与该条年份同年。全库 " + st.recs + " 条系到了日，命中 " + st.slots + " 个日历格" +
      (st.blanks === null ? "" : "，空 " + st.blanks + " 天") +
      (st.ambiguous ? "；另有 " + st.ambiguous + " 条因同一年里出现两个不同日子而整条不收" : "") + "。</p>"];
    if (hasSrc) {
      parts.push('<p class="td-note td-warn">这一天的名单里有「出处纪日」的条目：那是文书落款的那一天，' +
        "不一定等于事情发生在这一天。口径里单独分这一层，就是为了不让它和事件日混成一件事。</p>");
    }
    if (hasOld) {
      parts.push('<p class="td-note td-warn">这一天早于 ' + PB + " 年的公历日由后世历表推得（当时行的是儒略历），" +
        "按推定值给出。</p>");
    }
    return parts.join("");
  }

  function render() {
    if (!body) return;
    var D = indexDates();
    if (!D) {
      head.textContent = "历史上的今天";
      body.innerHTML = '<div class="td-bad">日层没载入（缺 <code>data/dates.js</code>）。' +
        "本站不会用别处的日期凑数，所以这一页今天不上工。</div>";
      foot.innerHTML = "";
      return;
    }
    if (!day) day = todayMD();
    var m = day.m, d = day.d;
    var list = recsFor(m, d);
    var missing = list.filter(function (r) { return !window.ChronLoader.eventById(r.id); }).length;

    head.innerHTML = '历史上的今天 · <b>' + m + " 月 " + d + " 日</b>" +
      '<span class="td-count">' + (ready ? list.length + " 条" : list.length + " 条（分片载入中）") + "</span>";

    var parts = [];
    if (ghost) {
      var gLen = monthLen(ghost.m);
      parts.push('<div class="td-bad">链接里写的是 ' + ghost.m + ' 月 ' + ghost.d + ' 日，可' +
        (gLen === null ? "一年只有 12 个月" : "这个月只有 " + gLen + " 天") +
        "——本站不替它编一天，已按今天（" + m + " 月 " + d + " 日）打开。</div>");
    }
    var others = sameDayOtherMonths(m, d);
    if (others.length) {
      parts.push('<div class="td-row"><span class="td-lab">同一个号数</span>' +
        others.map(function (o) {
          return '<button type="button" class="td-pill" data-go="' + o.m + "-" + d + '">' + o.m + "月 " + o.n + "</button>";
        }).join("") + "</div>");
    }

    if (!ready) {
      parts.push('<div class="td-bad">正在补载全部分片——「今天」要把全库翻一遍才知道这一天有几条，' +
        "少一片就会少几条，而且没人知道少的是哪几条。</div>");
    } else if (list.length) {
      parts.push('<div class="td-list">' + rows(list) + "</div>");
      if (missing) parts.push('<div class="td-bad">另有 ' + missing + " 条的日子指向没载入的条目（顶栏「加载全部分片」可补）。</div>");
    } else {
      /* 空就明说空。把邻近三天塞进「今天」的名单里，读者带走的是三个假日期。 */
      parts.push('<div class="td-bad td-empty">这一天本库没有可核对的纪日。</div>');
      var near = nearbyDays(m, d, 3);
      if (near.length) {
        parts.push('<div class="td-sec"><h4>前后三日 · ' + near.length + " 条（各自带着自己的日子，不是今天）</h4>" +
          '<div class="td-list">' + near.map(function (x) { return row(x.rec, true); }).join("") + "</div></div>");
      } else {
        parts.push('<div class="td-sec">前后三日也空着。用 ◀ ▶ 挪几天，或点「随机一天」。</div>');
      }
    }
    body.innerHTML = parts.join("");
    foot.innerHTML = footer(m, d, list);
  }

  /* ---------- 抽屉 ---------- */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = "today";
    panel.className = "td-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "历史上的今天");
    panel.innerHTML =
      '<header class="td-head">' +
        '<div class="td-crumb" id="td-crumb">历史上的今天</div>' +
        '<div class="td-tools">' +
          '<button type="button" data-act="prev" title="前一天">◀</button>' +
          '<button type="button" data-act="next" title="后一天">▶</button>' +
          '<button type="button" data-act="today" title="回到今天">今天</button>' +
          '<button type="button" data-act="random" title="随机抽一天（只抽有日子的格子）">随机一天</button>' +
          '<button type="button" data-act="river" title="把这一天的条目铺成全屏长河">铺成长河</button>' +
          '<button type="button" data-act="close" title="关闭 (Esc)">✕</button>' +
        "</div>" +
      "</header>" +
      '<div class="td-body" id="td-body" tabindex="0"></div>' +
      '<div class="td-foot" id="td-foot"></div>';
    document.body.appendChild(panel);
    head = panel.querySelector("#td-crumb");
    body = panel.querySelector("#td-body");
    foot = panel.querySelector("#td-foot");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-ev],[data-go]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { window.ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      if (b.hasAttribute("data-go")) {
        var p = b.getAttribute("data-go").split("-");
        go(Number(p[0]), Number(p[1]));
        return;
      }
      var a = b.getAttribute("data-act");
      if (a === "close") close();
      else if (a === "prev") move(-1);
      else if (a === "next") move(1);
      else if (a === "today") { day = todayMD(); go(day.m, day.d); }
      else if (a === "random") randomDay();
      else if (a === "river") toRiver();
    });
    return panel;
  }

  function move(delta) {
    day = shiftMD(day.m, day.d, delta);
    go(day.m, day.d);
  }
  /* 随机一天只在「有日子的格子」里抽：抽到空着的一天不是随机，是给读者一个白页。 */
  function randomDay() {
    var keys = Object.keys(byMD);
    if (!keys.length) return;
    var k = keys[Math.floor(Math.random() * keys.length)].split("-");
    go(Number(k[0]), Number(k[1]));
  }
  function toRiver() {
    if (!window.ChronRiver) return;
    var ids = recsFor(day.m, day.d).map(function (r) { return r.id; });
    /* 空着的一天铺不出长河，但按钮就杵在标题栏上——点下去一声不响，读者只会以为自己没点到。
     * 说一句「这一天没有」，比沉默诚实，也比沉默便宜。 */
    if (!ids.length) {
      window.ChronDetail.flash && window.ChronDetail.flash("这一天本库没有可核对的纪日，长河铺不出来", 4000);
      return;
    }
    close();
    window.ChronRiver.open({ ids: ids, label: "历史上的 " + day.m + "月" + day.d + "日" });
  }

  /* 走路由而不是直接渲染：地址栏里的 #/today/11/6 是要能分享的链接，
   * 也只有走路由，按钮、快捷键、深链三条入口才不会各画一份状态。 */
  function go(m, d) {
    day = { m: m, d: d };
    window.ChronRouter.go("#/today/" + m + "/" + d);
  }

  function loadAll() {
    if (ready) return Promise.resolve();
    return window.ChronLoader.ensureAll().then(function () {
      ready = true;
      if (window.ChronTimeline) window.ChronTimeline.invalidate();
      if (isOpen()) render();
    }, function () { ready = false; if (isOpen()) render(); });
  }

  function open(opts) {
    ensurePanel();
    opts = opts || {};
    ghost = null;
    if (opts.m && opts.d) {
      var exists = cellExists(opts.m, opts.d);
      if (exists === false) { ghost = { m: opts.m, d: opts.d }; day = todayMD(); }
      else day = { m: opts.m, d: opts.d };   /* exists===null：日层没载入，render 里已经有那一句 */
    } else day = todayMD();   /* 裸 #/today 就是「读者的今天」：每次进来都重新按本机日期，
                               * 不然上一条记录留下的日期会冒充今天。 */
    panel.hidden = false;
    document.body.classList.add("today-open");
    /* 顶栏按钮的亮灭由这里的信号驱动：抽屉有按钮、快捷键、深链三条入口，
     * 只在一个地方点亮的按钮一定会在某条路上对不上。 */
    window.dispatchEvent(new Event("chronicle:today"));
    render();
    if (!ready) loadAll();
    return Promise.resolve(true);
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("today-open");
    /* 屏上的层收了，地址栏的 #/today 也得收：留着它刷新就自己弹回来。 */
    window.ChronRouter.resetHash(["#/today"]);
    window.dispatchEvent(new Event("chronicle:today"));
  }
  function isOpen() { return !!panel && !panel.hidden; }

  window.ChronToday = {
    open: open, close: close, isOpen: isOpen, render: render, go: go,
    recsFor: recsFor, stats: statsLine, isReady: function () { return ready; }
  };
})();
