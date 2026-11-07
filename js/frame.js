/* frame.js | 视角层界面：看点抽屉
 * 依赖：window.ChronLoader / ChronTime / ChronState / ChronProv / ChronDetail / ChronRiver / ChronAtlas
 * 发布：window.ChronFrame
 *
 * 为什么把「依据原文」和「争议」直接印在卡片上：视角层最大的风险是读者分不清
 * 哪句是史料、哪句是本站的话。把 ground 逐字引出来、把 dispute 摆在同一张卡上，
 * 等于自己把审自己的刀递过去——这也是本站「可核查」立场在策展层的延续。
 */
(function () {
  "use strict";

  var INJECT_TIMEOUT = window.__CHRONICLE_FRAME_TIMEOUT || 8000;
  var SRC = "data/frame/highlights.js";
  var loaded = false, failing = null;
  var panel = null, body = null, head = null;
  /* 看点清单还在路上时按下的「关」也要接住：否则晚到的 open 会把抽屉掀在别层上面 */
  var wantOpen = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function inject() {
    if (loaded) return Promise.resolve(true);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      var timer = setTimeout(function () {
        s.onload = s.onerror = null;
        if (s.parentNode) s.parentNode.removeChild(s);
        reject(new Error("载入超时（" + INJECT_TIMEOUT + "ms）：" + SRC));
      }, INJECT_TIMEOUT);
      function done(fn) {
        return function () { clearTimeout(timer); if (s.parentNode) s.parentNode.removeChild(s); fn(); };
      }
      s.src = SRC; s.async = true;
      s.onload = done(function () {
        if (!window.__CHRONICLE_FRAME) { reject(new Error(SRC + " 已加载但没挂上 __CHRONICLE_FRAME")); return; }
        loaded = true; resolve(true);
      });
      s.onerror = done(function () { reject(new Error("文件缺失：" + SRC)); });
      document.head.appendChild(s);
    }).catch(function (e) { failing = e.message; console.error("[frame] " + e.message); return false; });
  }

  function ensure() {
    if (panel) return;
    panel = document.createElement("aside");
    panel.id = "frame";
    panel.className = "frame-drawer";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "看点：本站编辑立场");
    panel.innerHTML =
      '<header class="fr-head">' +
        '<div class="fr-crumb" id="fr-crumb">看点</div>' +
        '<div class="fr-tools">' +
          '<button data-act="river" title="把这批看点铺成全屏长河">铺成长河</button>' +
          '<button data-act="map" title="在舆图上看它们的落点">舆图</button>' +
          '<button data-act="close" title="关闭 (Esc)">✕</button>' +
        "</div>" +
      "</header>" +
      '<div class="fr-body" id="fr-body" tabindex="0"></div>';
    document.body.appendChild(panel);
    head = panel.querySelector("#fr-crumb");
    body = panel.querySelector("#fr-body");
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act],[data-ev]");
      if (!b) return;
      if (b.hasAttribute("data-ev")) { window.ChronDetail.openEvent(b.getAttribute("data-ev")); return; }
      var a = b.getAttribute("data-act");
      if (a === "close") close();
      else if (a === "river") toRiver();
      else if (a === "map") toMap();
    });
  }

  function card(h) {
    var L = window.ChronLoader, T = window.ChronTime, PV = window.ChronProv;
    var e = L.eventById(h.id);
    if (!e) return '<div class="fr-bad">条目缺失：' + esc(h.id) + "（视角层与语料脱钩，请跑 node tools/validate-frame.mjs）</div>";
    var c = h.claim || {};
    var tk = window.__CHRONICLE_META.tracks[e.track];
    var peer = h.peer ? L.eventById(h.peer.id) : null;
    return '<article class="fr-card">' +
      '<div class="fr-top"><b data-ev="' + esc(e.id) + '">' + esc(e.title) + "</b>" +
        '<span class="fr-y">' + esc(T.formatYear(e.year, e.yearApprox)) + "</span>" +
        '<span class="fr-tk" style="color:' + tk.color + '">' + esc(tk.short) + "</span>" +
        (PV ? PV.badge(e) : "") + "</div>" +
      '<p class="fr-why">' + esc(h.why) + "</p>" +
      (c.text ? '<div class="fr-claim"><span class="fr-lab">本站主张</span>' + esc(c.text) +
        (c.strength ? '<em class="fr-st fr-st-' + (c.strength === "确证" ? "ok" : c.strength === "通行说法" ? "mid" : "warn") + '">' + esc(c.strength) + "</em>" : "") +
        "</div>" : "") +
      (c.ground ? '<blockquote class="fr-ground"><span class="fr-lab">条目原文</span>' + esc(c.ground) + "</blockquote>" : "") +
      (c.basis || c.scope ? '<div class="fr-kou">' +
        (c.basis ? "<span>判据：" + esc(c.basis) + "</span>" : "") +
        (c.scope ? "<span>范围：" + esc(c.scope) + "</span>" : "") + "</div>" : "") +
      (peer ? '<div class="fr-peer"><span class="fr-lab">对照 · ' + esc(h.peer.relation || "") + "</span>" +
        '<b data-ev="' + esc(peer.id) + '">' + esc(peer.title) + "</b>" +
        '<span class="fr-py">' + esc(T.formatYear(peer.year, peer.yearApprox)) + "</span>" +
        "<p>" + esc(h.peer.note || "") + "</p></div>" : "") +
      (c.dispute ? '<div class="fr-dis"><span class="fr-lab">争议与限度</span><p>' + esc(c.dispute) + "</p></div>" : "") +
      '<div class="fr-src">' + (e.detail.sources || []).map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") + "</div>" +
      "</article>";
  }

  function render() {
    if (!panel) return;
    var F = window.__CHRONICLE_FRAME;
    if (failing) {
      body.innerHTML = '<div class="fr-bad">看点数据没载入：' + esc(failing) + "</div>";
      return;
    }
    if (!F || !(F.highlights || []).length) {
      body.innerHTML = '<div class="fr-bad">看点清单为空。</div>';
      return;
    }
    head.textContent = "看点 · " + F.highlights.length + " 条";
    body.innerHTML = '<p class="fr-stance">' + esc(F.stance || "") + "</p>" +
      F.highlights.map(card).join("") +
      '<p class="fr-foot">「本站主张」是编辑立场，不是史料原文；「条目原文」逐字引自该条目的正文，' +
      "由 <code>tools/validate-frame.mjs</code> 校验确实出现过。对照侧与争议一并列出。</p>";
    body.scrollTop = 0;
  }

  function ids() {
    var F = window.__CHRONICLE_FRAME;
    return (F && F.highlights ? F.highlights : []).map(function (h) { return h.id; });
  }
  function toRiver() {
    window.ChronRiver.open({ ids: ids(), label: "看点（本站编辑立场）" });
  }
  function toMap() {
    var L = window.ChronLoader, first = L.eventById(ids()[0]);
    window.ChronAtlas.open({ year: first ? first.year : undefined });
  }

  function open() {
    ensure();
    wantOpen = true;
    return inject().then(function () {
      if (!wantOpen) return false;
      panel.hidden = false;
      document.body.classList.add("frame-open");
      render();
      return true;
    });
  }
  function close() {
    wantOpen = false;
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.body.classList.remove("frame-open");
  }
  function isOpen() { return !!panel && !panel.hidden; }

  window.ChronFrame = { open: open, close: close, isOpen: isOpen, render: render, ids: ids };
})();
