/* story.js | 故事层界面：小故事抽屉 + 详情里的「此事的小故事」
 * 依赖：window.ChronLoader / ChronTime / ChronState / ChronDetail / ChronRiver
 * 发布：window.ChronStory
 *
 * 这一层与事实层的关系决定了界面必须怎么画：
 * 事实层的一条只回答「哪一年发生了什么」，故事层的一条回答「当时那个人手上是什么情形」。
 * 两者共用一条 ev，所以每张故事卡都必须把锚点条目原样挂出来——读者随时能跳回账本，
 * 看这条复述底下垫的是哪一年的哪条记载。抽掉这个链接，故事就成了无源的文字。
 *
 * 另一个必须画出来的东西是 kind 与 quoteState。「史载」和「后世附会」同样值得读，
 * 但对读者来说它们不是一类东西：前者可以当史料引用，后者是流传里成形的故事。
 * 引文标「原文」还是「大意」是同一件事的另一半——错标一次「原文」，
 * 读者就会把整层当成编的。所以这两个标记不参与排版美化，它们是内容的骨架。
 */
(function () {
  "use strict";

  // 预算与事件分片同源（loader.js 定义）：异闻单片最大 69 KB，慢网下一片就要几秒
  var INJECT_TIMEOUT = window.__CHRONICLE_STORY_TIMEOUT || window.ChronLoader.injectTimeout;
  var DIR = "data/story/";
  var MAN_FILE = "manifest.js";

  var loaded = false, failing = null, loading = null;
  var panel = null, body = null, head = null;
  var list = [];                      // 全部故事（按分片顺序）
  var byEv = Object.create(null);     // 锚点条目 id -> [story]
  var byId = Object.create(null);     // 故事 id -> story
  var byPerson = Object.create(null); // 人名 -> [story]
  var eras = [];                      // [{id,label,n}] 来自 manifest，供分片导航
  var view = { kind: "", era: "", person: "", open: "" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- 注入 ---------- */
  function injectSrc(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("载入超时（" + INJECT_TIMEOUT + "ms 无响应）：" + src));
      }, INJECT_TIMEOUT);
      function done(fn) {
        return function () { clearTimeout(timer); if (s.parentNode) s.parentNode.removeChild(s); fn(); };
      }
      s.src = src; s.async = true;
      s.onload = done(resolve);
      s.onerror = done(function () { reject(new Error("文件缺失：" + src)); });
      document.head.appendChild(s);
    });
  }

  function index() {
    var M = window.__CHRONICLE_STORY_MANIFEST;
    list = []; byEv = Object.create(null); byId = Object.create(null);
    byPerson = Object.create(null); eras = [];
    (M.chunks || []).forEach(function (c) {
      var arr = (window.__CHRONICLE_STORY_CHUNK || {})[c.id] || [];
      eras.push({ id: c.id, label: c.label || c.id, n: arr.length });
      arr.forEach(function (st) {
        st._era = c.label || c.id;
        list.push(st);
        byId[st.id] = st;
        (byEv[st.ev] || (byEv[st.ev] = [])).push(st);
        (st.people || []).forEach(function (p) {
          (byPerson[p] || (byPerson[p] = [])).push(st);
        });
      });
    });
  }

  /* 清单先取、分片后取：清单里少一片或多一片都由 validate-story 判红，
   * 界面上不许出现「清单说有、实际没取到」时还谎称条数。 */
  function ensure() {
    if (loaded) return Promise.resolve(true);
    if (loading) return loading;
    loading = injectSrc(DIR + MAN_FILE).then(function () {
      var M = window.__CHRONICLE_STORY_MANIFEST;
      if (!M || !Array.isArray(M.chunks)) throw new Error(MAN_FILE + " 已加载但没有 chunks 数组");
      return M.chunks.reduce(function (p, c) {
        return p.then(function () {
          return injectSrc(DIR + c.file).then(function () {
            var store = window.__CHRONICLE_STORY_CHUNK || {};
            if (!Array.isArray(store[c.id])) {
              throw new Error("分片未注册 " + c.id + "（" + c.file + " 已加载但全局里没有它）");
            }
          });
        });
      }, Promise.resolve());
    }).then(function () {
      index(); loaded = true; return true;
    }).catch(function (e) {
      failing = e.message; loading = null;
      console.error("[story] " + e.message);
      return false;
    });
    return loading;
  }

  /* ---------- 取数 ---------- */
  function forEvent(id) { return (loaded && byEv[id]) || []; }
  function get(id) { return (loaded && byId[id]) || null; }
  function isLoaded() { return loaded; }
  function stats() {
    var k = {};
    list.forEach(function (s) { k[s.kind] = (k[s.kind] || 0) + 1; });
    return { total: list.length, kinds: k, verbatim: list.filter(function (s) { return s.quoteState === "verbatim"; }).length };
  }

  var KINDS = ["史载", "笔记异闻", "后世附会", "出土文献与档案"];
  var KIND_CLS = { "史载": "real", "笔记异闻": "note", "后世附会": "tale", "出土文献与档案": "dig" };
  var KIND_TIP = {
    "史载": "正史、实录、档案里这样写了。注意「史载」指史家这样写了，不等于事就是这样。",
    "笔记异闻": "出自笔记、文集、掌故，只有一份或少数几份记述，无从与官书对校。",
    "后世附会": "这个故事在流传里才成形。它照样值得看，只是不能当史料引用。",
    "出土文献与档案": "有实物或原始档案可指：甲骨、简牍、文书、地宫、原件。"
  };

  /* ---------- 卡片 ---------- */
  function kindChip(st) {
    return '<span class="st-kind st-kind-' + (KIND_CLS[st.kind] || "note") + '" title="' +
      esc(KIND_TIP[st.kind] || "") + '">' + esc(st.kind) + "</span>";
  }

  /* 详情里的那张卡不挂 data-ev：读者已经在这条条目上，再给他一个「跳到本页」的链接
   * 只会让他以为页面坏了。抽屉里的卡才需要跳得回账本。 */
  function anchorLine(st, plain) {
    var L = window.ChronLoader, T = window.ChronTime, M = window.__CHRONICLE_META;
    var ev = L && L.eventById(st.ev);
    if (!ev) {
      return '<div class="st-anchor st-orphan">锚点条目 ' + esc(st.ev) +
        " 不在已载入的分片里。<button type=\"button\" data-st-loadall=\"1\">加载全部分片后看</button></div>";
    }
    var tk = M.tracks[ev.track];
    var t = '<span class="st-y">' + esc(T.formatYear(ev.year, { approx: !!ev.yearApprox })) + "</span>" +
      '<span class="st-tk">' + esc(tk.short) + "</span>";
    return '<div class="st-anchor"><span class="st-lab">系年于</span>' +
      (plain ? '<b class="st-here">' + esc(ev.title) + "</b>"
             : '<b data-ev="' + esc(ev.id) + '">' + esc(ev.title) + "</b>") + t + "</div>";
  }

  /* 「原文／大意」这两个字是这一层的信用所在，宁可占一行也不缩进引号里。 */
  function quoteLine(st) {
    if (!st.quote) return "";
    var isV = st.quoteState === "verbatim";
    return '<blockquote class="st-quote' + (isV ? " st-ver" : " st-para") + '">' +
      '<span class="st-lab st-lab-' + (isV ? "ver" : "para") + '" title="' +
      esc(isV ? "逐字引自下列出处，出处给到可直接翻到的位置。" : "本站按原意转述，不是逐字。别把它当引文引用。") + '">' +
      (isV ? "原文" : "大意") + "</span>" + esc(st.quote) + "</blockquote>";
  }

  function card(st, expanded, plain) {
    var L = window.ChronLoader, T = window.ChronTime;
    var ev = L && L.eventById(st.ev);
    var one = view.open === st.id;
    var open = expanded || one;
    var head = '<div class="st-top">' + kindChip(st) +
      '<b class="st-title" data-st="' + esc(st.id) + '">' + esc(st.title) + "</b>" +
      '<span class="st-era">' + esc(st._era || "") + "</span>" +
      (ev ? '<span class="st-y">' + esc(T.formatYear(ev.year, { approx: !!ev.yearApprox })) + "</span>" : "") +
      "</div>";
    if (!open) {
      var first = String(st.scene || "").slice(0, 46);
      return '<article class="st-card st-min" id="stc-' + esc(st.id) + '">' + head +
        '<p class="st-peek">' + esc(first) + (String(st.scene || "").length > 46 ? "…" : "") + "</p></article>";
    }
    return '<article class="st-card st-full" id="stc-' + esc(st.id) + '">' + head +
      anchorLine(st, plain) +
      '<p class="st-scene">' + esc(st.scene) + "</p>" +
      quoteLine(st) +
      (st.people && st.people.length
        ? '<div class="st-people">' + st.people.map(function (p) {
            return '<button type="button" class="chip st-person" data-st-person="' + esc(p) + '" title="只看这个人的故事">' + esc(p) + "</button>";
          }).join("") + "</div>" : "") +
      (st.caveat ? '<div class="st-caveat"><span class="st-lab">为什么这样标</span><p>' + esc(st.caveat) + "</p></div>" : "") +
      (st.find ? '<div class="st-find"><span class="st-lab">实物在哪</span>' + esc(st.find) + "</div>" : "") +
      '<div class="st-src">' + (st.src || []).map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") +
      (!plain && ev && ev.detail && (ev.detail.sources || []).length
        ? '<button type="button" class="st-go" data-ev="' + esc(ev.id) + '">看条目出处</button>' : "") +
      "</div></article>";
  }

  /* ---------- 详情抽屉里的「此事的小故事」 ---------- */
  /* 同步返回：事实层已经载入完，故事层也已在空闲时补齐；
   * 万一还没补上（用户点得比空闲快），给一句实话而不是空白，并顺手把数据取完再重画。 */
  function block(ev) {
    if (!ev) return "";
    if (!loaded && !failing) {
      ensure().then(function (ok) { if (ok) repaintDetail(); });
      return '<div class="para st-wait"><h5>此事的小故事</h5><p>小故事正在载入，稍候自动重画。</p></div>';
    }
    if (failing) return "";
    var ss = byEv[ev.id] || [];
    if (!ss.length) return "";
    return '<div class="para st-block"><h5>此事的小故事 · ' + ss.length + " 条</h5>" +
      ss.map(function (s) { return card(s, true, true); }).join("") +
      '<p class="st-note">复述出自本站，不是史料原文；标「原文」的那行才逐字引自下列出处。</p></div>';
  }

  /* 载入完成后重画开着的详情：不重画就会留着一句「正在载入」再也不动。 */
  function repaintDetail() {
    if (!window.ChronDetail || !ChronDetail.isOpen()) return;
    if (ChronDetail.mode === "event" && window.ChronState) {
      var id = ChronState.get().selectedId;
      if (id) ChronDetail.openEvent(id);
    }
  }

  /* ---------- 抽屉 ---------- */
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = "story";
    panel.className = "story-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "历史上的小故事");
    panel.innerHTML =
      '<header class="sy-head">' +
        '<div class="sy-crumb" id="sy-crumb">小故事</div>' +
        '<div class="sy-tools">' +
          '<button type="button" data-act="random" title="随机抽一条">随机一条</button>' +
          '<button type="button" data-act="river" title="把这些故事的系年铺成全屏长河">铺成长河</button>' +
          '<button type="button" data-act="close" title="关闭 (Esc)">✕</button>' +
        "</div>" +
      "</header>" +
      '<div class="sy-filters" id="sy-filters"></div>' +
      '<div class="sy-body" id="sy-body" tabindex="0"></div>';
    document.body.appendChild(panel);
    head = panel.querySelector("#sy-crumb");
    body = panel.querySelector("#sy-body");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-ev],[data-st],[data-st-person],[data-st-kind],[data-st-era],[data-st-loadall],[data-st-clear]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { window.ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      if (b.hasAttribute("data-st-loadall")) {
        window.ChronLoader.ensureAll().then(function () {
          window.ChronTimeline.invalidate(); render();
        });
        return;
      }
      if (b.hasAttribute("data-st")) {
        var id = b.getAttribute("data-st");
        view.open = view.open === id ? "" : id;
        render();
        return;
      }
      if (b.hasAttribute("data-st-person")) {
        view.person = b.getAttribute("data-st-person"); view.open = ""; render();
        window.ChronRouter.go("#/story?person=" + encodeURIComponent(view.person));
        return;
      }
      if (b.hasAttribute("data-st-kind")) {
        var k = b.getAttribute("data-st-kind");
        view.kind = view.kind === k ? "" : k; view.open = ""; render(); return;
      }
      if (b.hasAttribute("data-st-era")) {
        var er = b.getAttribute("data-st-era");
        view.era = view.era === er ? "" : er; view.open = ""; render(); return;
      }
      if (b.hasAttribute("data-st-clear")) {
        view = { kind: "", era: "", person: "", open: "" }; render();
        /* 屏上的筛选清了，地址栏还留着 ?person=：刷新就把它请回来，
         * 读者看到的是「我清了但没清」。 */
        if (location.hash.indexOf("#/story") === 0) window.ChronRouter.go("#/story");
        return;
      }
      var a = b.getAttribute("data-act");
      if (a === "close") close();
      else if (a === "random") randomOne();
      else if (a === "river") toRiver();
    });
    return panel;
  }

  function filtered() {
    return list.filter(function (s) {
      if (view.kind && s.kind !== view.kind) return false;
      if (view.era && s._era !== view.era) return false;
      if (view.person && (s.people || []).indexOf(view.person) < 0) return false;
      return true;
    });
  }

  function filtersBar() {
    var el = panel.querySelector("#sy-filters");
    var st = stats();
    var parts = ['<div class="sy-row"><span class="sy-lab">性质</span>'];
    KINDS.forEach(function (k) {
      parts.push('<button type="button" class="sy-pill' + (view.kind === k ? " on" : "") +
        ' st-kind-' + KIND_CLS[k] + '" data-st-kind="' + esc(k) + '" title="' + esc(KIND_TIP[k]) + '">' +
        esc(k) + " " + (st.kinds[k] || 0) + "</button>");
    });
    parts.push("</div><div class=\"sy-row\"><span class=\"sy-lab\">时代</span>");
    eras.forEach(function (c) {
      parts.push('<button type="button" class="sy-pill' + (view.era === c.label ? " on" : "") +
        '" data-st-era="' + esc(c.label) + '">' + esc(c.label) + " " + c.n + "</button>");
    });
    parts.push("</div>");
    if (view.person) {
      parts.push('<div class="sy-row"><span class="sy-lab">人物</span>' +
        '<span class="sy-who">' + esc(view.person) + "</span>" +
        '<button type="button" data-st-clear="1">清除全部筛选</button></div>');
    }
    el.innerHTML = parts.join("");
  }

  function render() {
    if (!panel) return;
    if (failing) {
      head.textContent = "小故事";
      panel.querySelector("#sy-filters").innerHTML = "";
      body.innerHTML = '<div class="sy-bad">故事数据没载入：' + esc(failing) +
        '<br><button type="button" data-act="close">重试请关闭后重新打开</button></div>';
      return;
    }
    if (!loaded) {
      head.textContent = "小故事 · 载入中";
      body.innerHTML = '<div class="sy-bad">正在载入 ' + (((window.__CHRONICLE_STORY_MANIFEST || {}).chunks) || []).length + " 片小故事…</div>";
      return;
    }
    filtersBar();
    var ss = filtered();
    var st = stats();
    head.textContent = "小故事 · " + ss.length + (ss.length === st.total ? " 条" : " 条（筛自 " + st.total + " 条）");
    if (!ss.length) {
      body.innerHTML = '<div class="sy-bad">这一组筛选下没有故事。' +
        '<button type="button" data-st-clear="1">清除筛选</button></div>';
      return;
    }
    body.innerHTML = '<p class="sy-legend">四种性质不是四档褒贬：「后世附会」照样好看，只是不能当史料引用；' +
      "「史载」指的是史书这样写了，不等于事就是这样。标「原文」的引文逐字取自下方出处，" +
      "标「大意」的是本站转述。<b>正文复述均为本站所写</b>，不替史料说话。</p>" +
      ss.map(function (s) { return card(s, false); }).join("");
    body.scrollTop = 0;
  }

  function randomOne() {
    if (!loaded || !list.length) return;
    var pool = filtered();
    if (!pool.length) pool = list;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    view.open = pick.id; render();
    var n = document.getElementById("stc-" + pick.id);
    if (n && n.scrollIntoView) n.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function toRiver() {
    var ids = filtered().map(function (s) { return s.ev; });
    if (!ids.length || !window.ChronRiver) return;
    /* 长河是全屏层（z 38），抽屉压在它上面（z 46）会把右半屏连点带字一起盖掉：
     * 既然把这一批故事铺成了长河，就让位给长河，抽屉收掉、筛选留在 view 里。 */
    close();
    ChronRiver.open({ ids: ids, label: "小故事系年（" + (view.kind || view.era || view.person || "全部") + "）" });
  }

  function open(opts) {
    ensurePanel();
    opts = opts || {};
    if (opts.story) { view.open = opts.story; view.person = ""; }
    if (opts.person != null) { view.person = opts.person; view.open = ""; }
    panel.hidden = false;
    document.body.classList.add("story-open");
    /* 顶栏按钮的亮灭由这里的信号驱动，不写在点击回调里：抽屉还有路由、
     * 快捷键、详情跳转三条入口，只在一个地方点亮的按钮一定会在某条路上对不上。 */
    window.dispatchEvent(new Event("chronicle:story"));
    return ensure().then(function () { render(); return true; });
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("story-open");
    /* 屏上的层收了，地址栏的 #/story 也得收：留着它刷新就自己弹回来。 */
    window.ChronRouter.resetHash(["#/story"]);
    window.dispatchEvent(new Event("chronicle:story"));
  }
  function isOpen() { return !!panel && !panel.hidden; }

  /* 详情抽屉的点击委托不认识 st-* 属性，交回本模块处理。
   * 返回值表示「这一笔我接了」，detail.js 据此停止往下试。 */
  function handleDetailClick(el) {
    if (!el) return false;
    if (el.hasAttribute("data-st-loadall")) {
      window.ChronLoader.ensureAll().then(function () {
        window.ChronTimeline.invalidate();
        repaintDetail();
      });
      return true;
    }
    if (el.hasAttribute("data-st")) { return openStory(el.getAttribute("data-st")), true; }
    if (el.hasAttribute("data-st-person")) { return openPerson(el.getAttribute("data-st-person")), true; }
    return false;
  }

  /* 从详情跳到抽屉里的某一条：抽屉打开、并滚到那张卡。
   * 滚动必须排在 open() 之后——数据是懒取的，卡片这会儿可能还没画出来。 */
  function openStory(id) {
    view.open = id; view.person = ""; view.kind = ""; view.era = "";
    window.ChronRouter.go("#/story/" + encodeURIComponent(id));
    return open().then(function () {
      render();
      var n = document.getElementById("stc-" + id);
      if (n && n.scrollIntoView) n.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
  function openPerson(name) {
    view.person = name; view.open = "";
    window.ChronRouter.go("#/story?person=" + encodeURIComponent(name));
    return open({ person: name });
  }

  window.ChronStory = {
    KINDS: KINDS, ensure: ensure, isLoaded: isLoaded, stats: stats,
    forEvent: forEvent, get: get, people: function () { return Object.keys(byPerson); },
    block: block, card: card, open: open, close: close, isOpen: isOpen, render: render,
    openStory: openStory, openPerson: openPerson, handleDetailClick: handleDetailClick
  };
})();
