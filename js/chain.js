/* chain.js | 涟漪层界面：因果链抽屉 + 详情里的「此事牵出的涟漪」
 * 依赖：window.ChronLoader / ChronTime / ChronState / ChronDetail / ChronRiver / ChronRouter
 * 发布：window.ChronChain
 *
 * 这一层是全站最容易把「本站的推断」读成「史料的说法」的一层，所以界面的职责
 * 不是把它讲得可信，而是把「谁在说这句话」摆在读者眼前：
 * 每一边连接都带 basis 标记——「有出处」给的是本站据以连接的材料名，
 * 「本站的连接」直说这一环是本站连的。两者的视觉权重必须一样大，
 * 把后者做小、做灰、做成脚注，就等于希望读者不去看它，那正好是这层最不该做的事。
 *
 * 每一环都必须能跳回事实层条目：涟漪的骨架是年份与事件，读者随时可以退回去查
 * 「这一环到底记了什么」。抽掉这些链接，这一层就成了一篇无从核对的文章。
 * caveat 原样印在卡末且不折叠：它写的是这条链哪里站不住，属于内容，不属于免责声明。
 */
(function () {
  "use strict";

  var INJECT_TIMEOUT = window.__CHRONICLE_CHAIN_TIMEOUT || 8000;
  var DIR = "data/chain/";
  var MAN_FILE = "manifest.js";

  var loaded = false, failing = null, loading = null;
  var panel = null, body = null, head = null;
  var list = [];                    // 全部链（按分片顺序）
  var byEv = Object.create(null);   // 锚点条目 id -> [{ch, i}] 该条目在第几环
  var byId = Object.create(null);   // 链 id -> chain
  var parts = [];                   // [{id,label,n}] 来自 manifest，供分片导航
  var view = { part: "", cross: "", open: "" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* 与门同一个二选一：basis 的名单在这里改了而 validate-chain 没改，
   * 卡上就会出现一类没人判定过的连接（test-chain ⑳ 把两侧逐字对账）。 */
  var BASES = ["有出处", "本站的连接"];
  var BASIS_CLS = { "有出处": "gp", "本站的连接": "self" };
  var BASIS_TIP = {
    "有出处": "这一边的连接有所凭的材料名，且该材料名逐字出现在这一边两端条目自己列出的出处里。它说的是「据以连接」，不是「史书这样写了这条因果」。",
    "本站的连接": "这一边是本站连的：先后可考，没有哪份史料把这两件事说成一件事。"
  };

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
    var M = window.__CHRONICLE_CHAIN_MANIFEST;
    list = []; byEv = Object.create(null); byId = Object.create(null); parts = [];
    (M.chunks || []).forEach(function (c) {
      var arr = (window.__CHRONICLE_CHAIN_CHUNK || {})[c.id] || [];
      parts.push({ id: c.id, label: c.label || c.id, n: arr.length });
      arr.forEach(function (ch) {
        ch._part = c.label || c.id;
        list.push(ch);
        byId[ch.id] = ch;
        (ch.links || []).forEach(function (L, i) {
          if (!L || !L.ev) return;
          (byEv[L.ev] || (byEv[L.ev] = [])).push({ ch: ch, i: i });
        });
      });
    });
  }

  /* 清单先取、分片后取：清单与磁盘对不上由 validate-chain 判红，
   * 界面上出现「清单说有、实际没取到」时必须说一句，不许静默少一片。 */
  function ensure() {
    if (loaded) return Promise.resolve(true);
    if (loading) return loading;
    loading = injectSrc(DIR + MAN_FILE).then(function () {
      var M = window.__CHRONICLE_CHAIN_MANIFEST;
      if (!M || !Array.isArray(M.chunks)) throw new Error(MAN_FILE + " 已加载但没有 chunks 数组");
      return M.chunks.reduce(function (p, c) {
        return p.then(function () {
          return injectSrc(DIR + c.file).then(function () {
            var store = window.__CHRONICLE_CHAIN_CHUNK || {};
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
      console.error("[chain] " + e.message);
      return false;
    });
    return loading;
  }

  /* ---------- 取数 ---------- */
  function forEvent(id) { return (loaded && byEv[id]) || []; }
  function get(id) { return (loaded && byId[id]) || null; }
  function isLoaded() { return loaded; }

  /* 跨轨：环里出现过别的轨（world）。这一层卖的是「影响后续世界」，
   * 所以界面第一件事是说清这条链到底跨不跨——不跨就照实写「只在本轨」。 */
  function tracksOf(ch) {
    var L = window.ChronLoader, set = {};
    (ch.links || []).forEach(function (x) {
      var e = x && x.ev ? L && L.eventById(x.ev) : null;
      if (e) set[e.track] = 1;
    });
    return Object.keys(set);
  }
  function isCross(ch) { return tracksOf(ch).length > 1; }
  function isGrounded(ch) {
    return (ch.links || []).some(function (L, i) {
      return i < (ch.links || []).length - 1 && L && L.basis === "有出处";
    });
  }
  function stats() {
    var b = {};
    list.forEach(function (ch) {
      (ch.links || []).forEach(function (L, i) {
        if (!L || i === (ch.links || []).length - 1) return;
        b[L.basis] = (b[L.basis] || 0) + 1;
      });
    });
    return {
      total: list.length,
      rings: list.reduce(function (a, ch) { return a + (ch.links || []).length; }, 0),
      cross: list.filter(isCross).length,
      bases: b
    };
  }
  /* 首末环的年份现从锚点取：涟漪层不存年份，界面上也不许抄一份。 */
  function yearsOf(ch) {
    var L = window.ChronLoader, T = window.ChronTime, M = window.__CHRONICLE_META;
    var out = { from: null, to: null, span: "", track: "" };
    var fs = L && L.eventById((ch.links[0] || {}).ev);
    var ls = L && L.eventById((ch.links[ch.links.length - 1] || {}).ev);
    if (fs) out.from = T.formatYear(fs.year, { approx: !!fs.yearApprox });
    if (ls) out.to = T.formatYear(ls.year, { approx: !!ls.yearApprox });
    if (fs && ls) out.span = (ls.year - fs.year) + " 年间";
    if (fs && M.tracks[fs.track]) out.track = M.tracks[fs.track].short;
    return out;
  }

  /* ---------- 卡片 ---------- */
  function basisChip(basis) {
    return '<span class="ch-basis ch-basis-' + (BASIS_CLS[basis] || "self") + '" title="' +
      esc(BASIS_TIP[basis] || "") + '">' + esc(basis) + "</span>";
  }

  /* 一环：年份 + 条目标题（可点回事实层）+ 该条摘要。
   * here 是详情里那一条所在的环：跳环时把它标出来，读者才知道本站把他带到了链条的哪一格；
   * 它是读者已经站着的地方，所以只有它不给「跳回本页」的链接，其余环照样可点。 */
  function ring(ch, i, here) {
    var L = window.ChronLoader, T = window.ChronTime, M = window.__CHRONICLE_META;
    var link = ch.links[i] || {};
    var ev = L && L.eventById(link.ev);
    var no = '<div class="ch-ring ch-orphan"><span class="ch-no">第' + (i + 1) + "环</span>锚点条目 " +
      esc(link.ev || "(空)") + " 不在已载入的分片里。" +
      '<button type="button" data-ch-loadall="1">加载全部分片后看</button></div>';
    if (!ev) return no;
    var tk = M.tracks[ev.track];
    var y = '<span class="ch-y">' + esc(T.formatYear(ev.year, { approx: !!ev.yearApprox })) + "</span>" +
      '<span class="ch-tk">' + esc(tk ? tk.short : ev.track) + "</span>";
    var name = here === i
      ? '<b class="ch-here">' + esc(ev.title) + "</b>"
      : '<b data-ev="' + esc(ev.id) + '">' + esc(ev.title) + "</b>";
    return '<div class="ch-ring' + (here === i ? " ch-mark" : "") + '">' +
      '<span class="ch-no">第' + (i + 1) + "环</span>" + name + y +
      '<p class="ch-sum">' + esc(ev.summary || "") + "</p></div>";
  }

  /* 一边：连接的说法 + 是谁在说 + 所凭的材料名。末环后面没有边。 */
  function edge(ch, i) {
    var link = ch.links[i] || {};
    if (i >= ch.links.length - 1) return "";
    return '<div class="ch-edge">' + basisChip(link.basis) +
      '<p class="ch-claim">' + esc(link.claim || "") + "</p>" +
      ((link.prov || []).length
        ? '<div class="ch-prov"><span class="ch-lab">据以连接的材料</span>' +
          link.prov.map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") + "</div>"
        : "") + "</div>";
  }

  /* here：详情里要着重标出的那一环（抽屉里没有「当前条目」，传 null）。 */
  function card(ch, expanded, here) {
    var open = expanded || view.open === ch.id;
    var ys = yearsOf(ch);
    var top = '<div class="ch-top">' +
      '<b class="ch-title" data-ch="' + esc(ch.id) + '">' + esc(ch.title) + "</b>" +
      '<span class="ch-part">' + esc(ch._part || "") + "</span>" +
      '<span class="ch-cross' + (isCross(ch) ? " on" : "") + '" title="' +
      (isCross(ch) ? "这条链的环跨过了中国史与世界史两轨" : "这条链的环都留在同一轨里") + '">' +
      (isCross(ch) ? "跨轨" : "本轨") + "</span>" +
      '<span class="ch-span">' + esc(ys.from) + " → " + esc(ys.to) + "（" + esc(ys.span) + "）</span>" +
      "</div>";
    if (!open) {
      var peek = String((ch.links[0] || {}).claim || ch.title || "").slice(0, 46);
      return '<article class="ch-card ch-min" id="chc-' + esc(ch.id) + '">' + top +
        '<p class="ch-peek">' + esc(peek) + (String(peek).length > 46 ? "…" : "") + "</p>" +
        '<p class="ch-count">' + (ch.links || []).length + " 环</p></article>";
    }
    var html = '<article class="ch-card ch-full" id="chc-' + esc(ch.id) + '">' + top;
    (ch.links || []).forEach(function (_, i) {
      html += ring(ch, i, here) + edge(ch, i);
    });
    html += (ch.caveat
      ? '<div class="ch-caveat"><span class="ch-lab">这条链哪里站不住</span><p>' + esc(ch.caveat) + "</p></div>"
      : "") + "</article>";
    return html;
  }

  /* ---------- 详情里的「此事牵出的涟漪」 ---------- */
  /* 同步返回：数据是懒取的，读者点得比载入快时给一句实话而不是空白，
   * 并顺手把数据取完再重画——留着「正在载入」再也不动，比不画更糟。 */
  function block(ev) {
    if (!ev) return "";
    if (!loaded && !failing) {
      ensure().then(function (ok) { if (ok) repaintDetail(); });
      return '<div class="para ch-block"><h5>此事牵出的涟漪</h5><p>涟漪数据正在载入，稍候自动重画。</p></div>';
    }
    if (failing) return "";
    var hits = byEv[ev.id] || [];
    if (!hits.length) return "";
    var seen = {}, partsHtml = [];
    hits.forEach(function (h) {
      if (seen[h.ch.id]) return;
      seen[h.ch.id] = 1;
      /* 同一条链可能有两处环落在本条目上：卡只画一次，但把命中的环号列出来，
       * 免得读者以为「第 2 环」是这条链唯一的位置。 */
      var ns = hits.filter(function (x) { return x.ch.id === h.ch.id; })
        .map(function (x) { return x.i + 1; }).join("、");
      partsHtml.push('<div class="ch-in">' +
        '<span class="ch-at">在链上第 ' + ns + " 环</span>" + card(h.ch, true, h.i) + "</div>");
    });
    return '<div class="para ch-block"><h5>此事牵出的涟漪 · ' + hits.length + " 处</h5>" +
      partsHtml.join("") +
      '<p class="ch-note">「有出处」给的是本站据以连接的材料名，不是史料对这条因果的表述；' +
      "「本站的连接」是本站连的。<b>先后是有据的，因果是我们的推断。</b></p></div>";
  }

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
    panel.id = "chain";
    panel.className = "chain-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "历史的涟漪：因果链");
    panel.innerHTML =
      '<header class="cy-head">' +
        '<div class="cy-crumb" id="cy-crumb">涟漪</div>' +
        '<div class="cy-tools">' +
          '<button type="button" data-act="random" title="随机抽一条链">随机一条</button>' +
          '<button type="button" data-act="river" title="把这些链的环铺成全屏长河">铺成长河</button>' +
          '<button type="button" data-act="close" title="关闭 (Esc)">✕</button>' +
        "</div>" +
      "</header>" +
      '<div class="cy-filters" id="cy-filters"></div>' +
      '<div class="cy-body" id="cy-body" tabindex="0"></div>';
    document.body.appendChild(panel);
    head = panel.querySelector("#cy-crumb");
    body = panel.querySelector("#cy-body");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-ev],[data-ch],[data-ch-part],[data-ch-cross],[data-ch-clear],[data-ch-loadall]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { window.ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      if (b.hasAttribute("data-ch-loadall")) {
        window.ChronLoader.ensureAll().then(function () {
          window.ChronTimeline.invalidate(); render();
        });
        return;
      }
      if (b.hasAttribute("data-ch")) {
        var id = b.getAttribute("data-ch");
        view.open = view.open === id ? "" : id;
        render();
        return;
      }
      if (b.hasAttribute("data-ch-part")) {
        var p = b.getAttribute("data-ch-part");
        view.part = view.part === p ? "" : p; view.open = ""; render(); return;
      }
      if (b.hasAttribute("data-ch-cross")) {
        var c = b.getAttribute("data-ch-cross");
        view.cross = view.cross === c ? "" : c; view.open = ""; render(); return;
      }
      if (b.hasAttribute("data-ch-clear")) {
        view = { part: "", cross: "", open: "" }; render();
        if (location.hash.indexOf("#/chain") === 0) window.ChronRouter.go("#/chain");
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
    return list.filter(function (ch) {
      if (view.part && ch._part !== view.part) return false;
      if (view.cross === "1" && !isCross(ch)) return false;
      if (view.cross === "0" && isCross(ch)) return false;
      return true;
    });
  }

  function filtersBar() {
    var el = panel.querySelector("#cy-filters");
    var st = stats();
    var parts2 = ['<div class="cy-row"><span class="cy-lab">年代</span>'];
    parts.forEach(function (c) {
      parts2.push('<button type="button" class="cy-pill' + (view.part === c.label ? " on" : "") +
        '" data-ch-part="' + esc(c.label) + '">' + esc(c.label) + " " + c.n + "</button>");
    });
    parts2.push('</div><div class="cy-row"><span class="cy-lab">是否跨轨</span>' +
      '<button type="button" class="cy-pill' + (view.cross === "1" ? " on" : "") +
      '" data-ch-cross="1" title="环里同时有中国史与世界史的条目">跨轨 ' + st.cross + "</button>" +
      '<button type="button" class="cy-pill' + (view.cross === "0" ? " on" : "") +
      '" data-ch-cross="0" title="环都留在同一轨里">本轨 ' + (st.total - st.cross) + "</button>");
    if (view.part || view.cross) {
      parts2.push('<button type="button" data-ch-clear="1">清除全部筛选</button>');
    }
    parts2.push("</div>");
    el.innerHTML = parts2.join("");
  }

  function render() {
    if (!panel) return;
    if (failing) {
      head.textContent = "涟漪";
      panel.querySelector("#cy-filters").innerHTML = "";
      body.innerHTML = '<div class="cy-bad">涟漪数据没载入：' + esc(failing) +
        '<br><button type="button" data-act="close">重试请关闭后重新打开</button></div>';
      return;
    }
    if (!loaded) {
      head.textContent = "涟漪 · 载入中";
      body.innerHTML = '<div class="cy-bad">正在载入 ' + (((window.__CHRONICLE_CHAIN_MANIFEST || {}).chunks) || []).length + " 片涟漪…</div>";
      return;
    }
    filtersBar();
    var cs = filtered(), st = stats();
    head.textContent = "涟漪 · " + cs.length + (cs.length === st.total ? " 条链" : " 条链（筛自 " + st.total + " 条）");
    if (!cs.length) {
      body.innerHTML = '<div class="cy-bad">这一组筛选下没有链。' +
        '<button type="button" data-ch-clear="1">清除筛选</button></div>';
      return;
    }
    body.innerHTML = '<p class="cy-legend">这一层说的是「因为 A，后来有了 B」，' +
      "而这句话多半没有史料这样写过。所以每一边都写明是谁在连：<b>有出处</b>指本站据以连接的材料名" +
      "（该名字逐字出自两端条目自己列的出处，界面上印在边下方，可以自己去翻）；" +
      "<b>本站的连接</b>指这一边是本站连的。<b>落点一律是一件当时看来很小的事</b>——" +
      "大事的余波落在小事上才叫涟漪，否则那只是另一份大事年表。每条链末尾那句" +
      "「这条链哪里站不住」是内容的一部分，不折叠。</p>" +
      cs.map(function (c) { return card(c, false); }).join("");
    body.scrollTop = 0;
  }

  function randomOne() {
    if (!loaded || !list.length) return;
    var pool = filtered();
    if (!pool.length) pool = list;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    view.open = pick.id; render();
    var n = document.getElementById("chc-" + pick.id);
    if (n && n.scrollIntoView) n.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function toRiver() {
    var ids = [], seen = {};
    filtered().forEach(function (ch) {
      (ch.links || []).forEach(function (L) {
        if (L && L.ev && !seen[L.ev]) { seen[L.ev] = 1; ids.push(L.ev); }
      });
    });
    if (!ids.length || !window.ChronRiver) return;
    /* 长河是底面（z 38），抽屉压在它上面会把右半屏连点带字一起盖掉：
     * 既然把这一批环铺成了长河，就让位给长河，抽屉收掉、筛选留在 view 里。 */
    close();
    var lab = (view.part ? view.part + " · " : "") +
      (view.cross === "1" ? "跨轨" : view.cross === "0" ? "本轨" : "全部") + "涟漪链的环";
    ChronRiver.open({ ids: ids, label: lab });
  }

  function open(opts) {
    ensurePanel();
    opts = opts || {};
    if (opts.chain) { view.open = opts.chain; }
    panel.hidden = false;
    document.body.classList.add("chain-open");
    /* 顶栏按钮的亮灭由这里的信号驱动：抽屉还有路由、快捷键、详情跳转三条入口，
     * 只在一个地方点亮的按钮一定会在某条路上对不上。 */
    window.dispatchEvent(new Event("chronicle:chain"));
    return ensure().then(function () { render(); return true; });
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("chain-open");
    /* 屏上的层收了，地址栏的 #/chain 也得收：留着它刷新就自己弹回来。 */
    window.ChronRouter.resetHash(["#/chain"]);
    window.dispatchEvent(new Event("chronicle:chain"));
  }
  function isOpen() { return !!panel && !panel.hidden; }

  /* 详情抽屉的点击委托不认识 ch-* 属性，交回本模块处理。
   * 返回值表示「这一笔我接了」，detail.js 据此停止往下试。 */
  function handleDetailClick(el) {
    if (!el) return false;
    if (el.hasAttribute("data-ch-loadall")) {
      window.ChronLoader.ensureAll().then(function () {
        window.ChronTimeline.invalidate();
        repaintDetail();
      });
      return true;
    }
    if (el.hasAttribute("data-ch")) { return openChain(el.getAttribute("data-ch")), true; }
    return false;
  }

  /* 从详情跳到抽屉里的某一条：抽屉打开、并滚到那张卡。
   * 滚动必须排在 open() 之后——数据是懒取的，卡片这会儿可能还没画出来。 */
  function openChain(id) {
    view.open = id; view.part = ""; view.cross = "";
    window.ChronRouter.go("#/chain/" + encodeURIComponent(id));
    return open().then(function () {
      render();
      var n = document.getElementById("chc-" + id);
      if (n && n.scrollIntoView) n.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  window.ChronChain = {
    BASES: BASES, ensure: ensure, isLoaded: isLoaded, stats: stats,
    forEvent: forEvent, get: get, block: block, card: card,
    open: open, close: close, isOpen: isOpen, render: render,
    openChain: openChain, handleDetailClick: handleDetailClick
  };
})();
