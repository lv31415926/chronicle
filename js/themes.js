/* themes.js | 主题时间线：按关键词匹配回填成员，横向链条视图 */
(function () {
  "use strict";

  var L = window.ChronLoader, T = window.ChronTime, S = window.ChronState, M = window.__CHRONICLE_META;
  var PV = window.ChronProv;

  var el, active = null, cache = {};

  function list() { return (window.__CHRONICLE_THEMES || []); }

  /* ---- 成员解析：用关键词对事件打分，避免手工维护 id 造成悬空引用 ----
   * ⚠ 这段评分口径被 tools/validate-achv.mjs 的 resolve() 复刻了一份（见 DATA_SCHEMA §14B）：
   * 改这里的加权、起线或去冗规则，必须同步改那边，否则界面与成就门会各说各话且两边都绿。 */
  function resolve(th) {
    /* 缓存键必须带数据量：详情面板会在分片尚未加载完时调用 ofEvent，
     * 只按 th.id 缓存会把「当时可见的事件」算出的链条一直用下去，主题标签永久少报。 */
    var ck = th.id + "@" + L.allEvents().length;
    if (cache[ck]) return cache[ck];
    var evs = L.allEvents();
    var out = [];
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.year < th.from || e.year > th.to) continue;
      if (th.tracks && th.tracks.indexOf(e.track) < 0) continue;
      var score = 0;
      var hay = (e.title + " " + e.summary + " " + (e.detail.tags || []).join(" ") + " " +
                 (e.detail.figures || []).join(" ") + " " + (e.detail.state || ""));
      th.keywords.forEach(function (k) {
        if (hay.indexOf(k) >= 0) score += 2;
        if (e.title.indexOf(k) >= 0) score += 3;
        if ((e.detail.tags || []).indexOf(k) >= 0) score += 2;
      });
      if (th.exclude && th.exclude.some(function (k) { return hay.indexOf(k) >= 0; })) continue;
      if (score >= (th.minScore || 4)) out.push({ ev: e, score: score });
    }
    out.sort(function (a, b) { return a.ev.year - b.ev.year || b.score - a.score; });
    /* 每个国家/时代去冗：同 dim 同年只留分最高 */
    var seen = {}, members = [];
    out.forEach(function (o) {
      var k = o.ev.year + "|" + o.ev.dim;
      if (seen[k]) return;
      seen[k] = 1;
      members.push(o.ev);
    });
    if (th.max) members = members.slice(0, th.max);
    cache[ck] = members;
    return members;
  }

  function ofEvent(id) {
    return list().filter(function (th) {
      return resolve(th).some(function (e) { return e.id === id; });
    });
  }

  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "theme-modal";
    el.hidden = true;
    el.innerHTML = '<div class="th-card" role="dialog" aria-label="主题时间线">' +
      '<header class="th-head"><div id="th-title"></div>' +
      '<div class="th-tools"><select id="th-pick" aria-label="选择主题"></select>' +
      '<button data-t="close">关闭 ✕</button></div></header>' +
      '<div class="th-intro" id="th-intro"></div>' +
      '<div class="th-bar"><div class="th-prog" id="th-prog"></div></div>' +
      '<div class="th-chain" id="th-chain"></div>' +
      '<footer class="th-foot"><button data-t="prev">← 上一节点</button>' +
      '<span id="th-idx"></span><button data-t="next">下一节点 →</button>' +
      '<span class="spacer"></span><button data-t="river">铺成全屏长河</button>' +
      '<button data-t="fit">在时间轴上展开这段</button></footer>' +
      "</div>";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      if (e.target === el) { close(); return; }
      var b = e.target.closest("[data-t],[data-ev]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      var t = b.getAttribute("data-t");
      if (t === "close") close();
      if (t === "prev") go(activeIdx - 1);
      if (t === "next") go(activeIdx + 1);
      if (t === "fit") fitToTimeline();
      if (t === "river") openRiver();
    });
    el.addEventListener("change", function (e) {
      if (e.target.id === "th-pick") openById(e.target.value);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") go(activeIdx + 1);
      if (e.key === "ArrowLeft") go(activeIdx - 1);
    });
    var pick = el.querySelector("#th-pick");
    list().forEach(function (th) {
      var o = document.createElement("option");
      o.value = th.id; o.textContent = th.label;
      pick.appendChild(o);
    });
    return el;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  var activeIdx = 0;

  function renderChain(th, members) {
    var chain = document.getElementById("th-chain");
    if (!members.length) {
      chain.innerHTML = '<div class="th-none">当前已加载数据中，这条主题还没有匹配到条目。' +
        '先加载全部分片，或放宽筛选条件后重试。</div>';
      return;
    }
    /* 时间比例 + 防叠字：先记下每个节点的时间占比，交给 layoutRail 换算成像素 */
    var lo = members[0].year, hi = members[members.length - 1].year;
    var span = Math.max(1, hi - lo);
    var html = members.map(function (e, i) {
      var d = M.dimensions[e.dim];
      return '<button class="node" data-ev="' + esc(e.id) + '" data-i="' + i + '" data-x="' +
        (((e.year - lo) / span).toFixed(4)) + '" style="--c:' + d.color + "; --t:" + M.tracks[e.track].color + '">' +
        '<i class="nb"></i>' +
        '<span class="ny">' + esc(T.formatYear(e.year, { approx: e.yearApprox })) + "</span>" +
        '<span class="nt">' + esc(e.title) + "</span>" +
        '<span class="nd">' + esc(d.label) + " · " + esc(M.tracks[e.track].short) +
        (PV ? PV.badge(e) : "") + "</span>" +
        "</button>";
    }).join("");
    chain.innerHTML = '<div class="th-rail">' + html + "</div>";
    layoutRail(chain);
  }

  /* 节点按时间比例摆放，可时间从来不是均匀的：30 张卡挤在一条视口宽的轴上必然互相压字。
   * 于是轨道宽度随节点数增长（横向滚动才有东西可滚），再自左向右扫一遍，
   * 把撞车的节点推到前一个之后——先后顺序不变，只保证不叠。 */
  function layoutRail(chain) {
    var rail = chain.querySelector(".th-rail");
    if (!rail) return;
    var nodes = rail.querySelectorAll(".node");
    if (!nodes.length) return;
    var nodeW = nodes[0].offsetWidth || 148;
    var step = nodeW + 14;
    /* openById 先渲染后显形，此时 clientWidth 为 0，轨道会塌成下限 */
    var avail = Math.max(320, (chain.clientWidth || window.innerWidth) - 180);
    var trackW = Math.max(avail, nodes.length * step) - nodeW;
    var prev = -1e9;
    for (var i = 0; i < nodes.length; i++) {
      var ideal = parseFloat(nodes[i].getAttribute("data-x")) * trackW;
      var x = Math.max(ideal, prev === -1e9 ? 0 : prev + step);
      nodes[i].style.left = (x + nodeW / 2) + "px";
      prev = x;
    }
    rail.style.width = Math.max(avail, prev + nodeW) + "px";
  }

  function openById(id) {
    ensure();
    var th = list().filter(function (x) { return x.id === id; })[0];
    if (!th) return;
    if (!L.allEvents().length) {
      el.hidden = false; el.classList.add("open");
      document.getElementById("th-chain").innerHTML = '<div class="th-none">数据尚未加载完成…</div>';
      L.ensureAll().then(function () { ChronTimeline.invalidate(); openById(id); });
      return;
    }
    active = th;
    cache = {};
    var members = resolve(th);
    document.getElementById("th-pick").value = id;
    document.getElementById("th-title").innerHTML = "<h3>" + esc(th.label) + "</h3>" +
      '<div class="th-sub">' + esc(T.formatYear(th.from) + " – " + T.formatYear(th.to)) +
      " · 匹配 " + members.length + " 个节点 · 覆盖中国/世界两条轨</div>";
    document.getElementById("th-intro").innerHTML = "<p>" + esc(th.intro) + "</p>" +
      (th.outro ? '<p class="outro">' + esc(th.outro) + "</p>" : "");
    renderChain(th, members);
    activeIdx = 0;
    go(0);
    el.hidden = false;
    el.classList.add("open");
    S.patch({ activeTheme: id });
  }

  function go(i) {
    if (!active) return;
    var members = resolve(active);
    if (!members.length) return;
    i = Math.max(0, Math.min(members.length - 1, i));
    activeIdx = i;
    var nodes = document.querySelectorAll("#th-chain .node");
    nodes.forEach(function (n, k) { n.classList.toggle("cur", k === i); });
    document.getElementById("th-idx").textContent = (i + 1) + " / " + members.length;
    document.getElementById("th-prog").style.width = ((i + 1) / members.length * 100) + "%";
    if (nodes[i]) nodes[i].scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    var e = members[i];
    S.patch({ selectedId: e.id, selectedYear: e.year });
    ChronTimeline.flyToYear(e.year, Math.max(16, (active.to - active.from) * 0.06), 380);
    ChronTimeline.pulseEvent(e.id);
    var live = document.getElementById("live");
    if (live) live.textContent = "主题节点 " + (i + 1) + "：" + e.title;
  }

  function fitToTimeline() {
    if (!active) return;
    close();
    ChronTimeline.flyToYear((active.from + active.to) / 2, active.to - active.from);
  }

  /* 长河是底面（z 38），本浮窗是 58；不关窗就打开等于把长河盖住了 */
  function openRiver() {
    if (!active || !window.ChronRiver) return;
    var ids = resolve(active).map(function (e) { return e.id; });
    var label = active.label;
    close();
    ChronRiver.open({ ids: ids, label: label });
  }

  function close() {
    if (!el) return;
    el.hidden = true;
    el.classList.remove("open");
    /* #/theme/<id> 是 router 认得的地址：收了层却留着它，刷新就自己弹回来。 */
    window.ChronRouter.resetHash(["#/theme"]);
    S.patch({ activeTheme: null });
  }

  function isOpen() { return !!el && !el.hidden; }
  function open() { openById((list()[0] || {}).id); }

  window.ChronThemes = {
    open: open, openById: openById, close: close, isOpen: isOpen,
    ofEvent: ofEvent, list: list, resolve: resolve
  };
})();
