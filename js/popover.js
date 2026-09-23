/* popover.js | 悬停当年大事气泡 */
(function () {
  "use strict";

  var S = window.ChronState, L = window.ChronLoader, T = window.ChronTime,
      M = window.__CHRONICLE_META, LOD = window.ChronLOD, PV = window.ChronProv;

  var el, pinned = false, hideTimer = null, currentKey = null, lastHit = null;

  function ensure() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "popover";
    el.setAttribute("role", "tooltip");
    el.setAttribute("aria-live", "polite");
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener("pointerenter", function () { clearTimeout(hideTimer); });
    el.addEventListener("pointerleave", function () { if (!pinned) hideSoon(); });
    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-ev]");
      if (a) { window.ChronDetail.openEvent(a.getAttribute("data-ev")); hide(true); return; }
      var y = e.target.closest("[data-year]");
      if (y) { window.ChronDetail.openYear(Number(y.getAttribute("data-year"))); hide(true); return; }
      var z = e.target.closest("[data-zoom]");
      if (z) {
        var from = Number(z.getAttribute("data-from")), to = Number(z.getAttribute("data-to"));
        window.ChronTimeline.flyToYear((from + to) / 2, Math.max(20, to - from));
        hide(true);
      }
    });
    el.addEventListener("dblclick", function (e) { e.stopPropagation(); });
    return el;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function dimBadge(dim) {
    var d = M.dimensions[dim];
    return '<span class="badge" style="color:' + d.color + ';border-color:' + d.color + '55">' +
           '<i class="sh" data-sh="' + d.shape + '"></i>' + esc(d.label) + "</span>";
  }

  function weightDots(w) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += '<i class="w' + (i <= w ? " on" : "") + '"></i>';
    return '<span class="wts" title="重要度 ' + w + '/5">' + s + "</span>";
  }

  function eventRow(ev) {
    return '<li class="ev" data-ev="' + esc(ev.id) + '" tabindex="0">' +
      weightDots(ev.weight) +
      '<span class="dot" style="background:' + M.dimensions[ev.dim].color + '"></span>' +
      '<span class="ttl">' + esc(ev.title) + (PV ? PV.badge(ev) : "") + "</span>" +
      '<span class="sum">' + esc(ev.summary) + "</span>" +
      "</li>";
  }

  function groupByDim(evs) {
    var g = {};
    evs.forEach(function (e) { (g[e.dim] || (g[e.dim] = [])).push(e); });
    return M.dimOrder.filter(function (d) { return g[d]; }).map(function (d) {
      return { dim: d, items: g[d].sort(function (a, b) { return b.weight - a.weight; }) };
    });
  }

  function headerForYear(y, track) {
    var approx = L.allEventsAtYear(y).some(function (e) { return e.yearApprox; });
    var h = '<div class="ph-year">' + esc(T.formatYear(y, { approx: approx })) +
            '<span class="ph-sub">' + esc(T.formatCentury(y)) + "</span></div>";
    var parts = [];
    if (track === "cn" || !track) {
      var p = T.polityOf(y);
      if (p.main) parts.push(p.main.label + (p.main.note ? "（" + p.main.note + "）" : ""));
      if (p.coeval.length) parts.push("并立：" + p.coeval.map(function (x) { return x.label; }).join("、"));
      var mg = T.minguoYear(y);
      if (mg) parts.unshift(mg);
    }
    var ce = T.eraOf("cn", y), we = T.eraOf("world", y);
    if (ce) parts.push("中国时代：" + ce.label);
    if (we) parts.push("世界时代：" + we.label);
    if (parts.length) h += '<div class="ph-meta">' + esc(parts.join(" · ")) + "</div>";
    return h;
  }

  function trackBlock(track, evs) {
    if (!evs.length) return "";
    var g = groupByDim(evs);
    var html = '<section class="tk" data-track="' + track + '">' +
      '<h4><i class="tkdot" style="background:' + M.tracks[track].color + '"></i>' +
      esc(M.tracks[track].label) + '<span class="cnt">' + evs.length + " 条</span></h4>";
    g.forEach(function (grp) {
      html += '<div class="grp">' + dimBadge(grp.dim) + "<ul>";
      grp.items.slice(0, 8).forEach(function (e) { html += eventRow(e); });
      if (grp.items.length > 8) html += '<li class="more">另有 ' + (grp.items.length - 8) + " 条…</li>";
      html += "</ul></div>";
    });
    return html + "</section>";
  }

  /* ---- 三种内容构建 ---- */
  function buildForEvent(ev) {
    var y = ev.year;
    var all = L.allEventsAtYear(y);
    var cn = all.filter(function (e) { return e.track === "cn" && S.get().dims[e.dim] && e.weight >= S.get().weightFloor; });
    var wd = all.filter(function (e) { return e.track === "world" && S.get().dims[e.dim] && e.weight >= S.get().weightFloor; });
    var html = '<div class="pop-head">' + headerForYear(y, ev.track) +
      '<button class="pin" data-pin="1" title="钉住">' + (pinned ? "已钉住" : "钉住") + "</button></div>";
    if (S.get().tracks.cn) html += trackBlock("cn", cn);
    if (S.get().tracks.world) html += trackBlock("world", wd);
    html += footerForYear(y, all.length);
    return html;
  }

  function footerForYear(y, n) {
    var rel = L.allEventsAtYear(y).reduce(function (a, e) {
      return a.concat((e.related || []).map(function (i) { return L.eventById(i); }).filter(Boolean));
    }, []);
    var uniq = [];
    var seen = {};
    rel.forEach(function (e) { if (!seen[e.id] && e.year !== y) { seen[e.id] = 1; uniq.push(e); } });
    var html = '<div class="pop-foot">';
    if (uniq.length) {
      html += '<div class="rel"><span class="rellb">同期关联</span><ul>' +
        uniq.slice(0, 4).map(eventRow).join("") + "</ul></div>";
    }
    html += '<div class="acts"><button data-year="' + y + '">查看 ' + esc(T.formatYear(y)) + ' 完整档案 →</button>';
    html += '<button data-zoom="1" data-from="' + (y - 25) + '" data-to="' + (y + 25) + '">放大此区间</button></div></div>';
    return html;
  }

  function buildForBin(g) {
    var isEra = !!g.era;
    var from = isEra ? g.era.from : g.start;
    var to = isEra ? g.era.to : g.start + (g.step || 1) - 1;
    var single = !isEra && from === to;
    var rangeTxt = single ? T.formatYear(from) : T.formatYear(from) + " – " + T.formatYear(to);
    var head = single ? headerForYear(from) :
      '<div class="ph-year">' + esc(g.label) +
      '<span class="ph-sub">' + esc(rangeTxt) + "</span></div>";
    var html = '<div class="pop-head">' + head +
      '<button class="pin" data-pin="1">' + (pinned ? "已钉住" : "钉住") + "</button></div>";
    if (isEra) html += '<div class="ph-meta" style="padding:0 14px 6px">' + esc((g.era.sub || "")) + "</div>";

    var byTrack = { cn: [], world: [] };
    g.events.forEach(function (e) { byTrack[e.track].push(e); });
    /* 单年层级已把事件分成 singles/folded；主列表只放 singles，避免重复列出 */
    var split = Array.isArray(g.singles) && g.singles.length + (g.folded || []).length === g.events.length;
    ["cn", "world"].forEach(function (t) {
      if (!byTrack[t].length || !S.get().tracks[t]) return;
      var all = byTrack[t].slice().sort(function (a, b) { return b.weight - a.weight; });
      var shown = split ? all.filter(function (e) { return g.singles.indexOf(e) >= 0; }) : all;
      if (!shown.length) shown = all;
      var dist = {};
      all.forEach(function (e) { dist[e.dim] = (dist[e.dim] || 0) + 1; });
      html += '<section class="tk" data-track="' + t + '"><h4><i class="tkdot" style="background:' +
        M.tracks[t].color + '"></i>' + esc(M.tracks[t].label) + '<span class="cnt">' + all.length + " 条</span></h4>";
      html += '<div class="dist">' + M.dimOrder.filter(function (d) { return dist[d]; }).map(function (d) {
        return '<span class="b" title="' + esc(M.dimensions[d].label) + " " + dist[d] + '条" style="background:' +
          M.dimensions[d].color + ';flex:' + dist[d] + '"></span>';
      }).join("") + "</div>";
      html += "<ul>" + shown.slice(0, 6).map(eventRow).join("") + "</ul>";
      if (shown.length > 6) html += '<li class="more">另有 ' + (shown.length - 6) + " 条，点击放大查看</li>";
      html += "</section>";
    });
    if (g.folded && g.folded.length) {
      html += '<section class="tk foldblk"><h4>折叠条目 ' + g.folded.length + " 条</h4><ul>" +
        g.folded.slice(0, 6).map(eventRow).join("") + "</ul></section>";
    }
    html += '<div class="pop-foot"><div class="acts"><button data-zoom="1" data-from="' + from +
      '" data-to="' + to + '">放大这段时期 →</button></div></div>';
    return html;
  }

  function buildEmptyYear(year) {
    var before = [], after = [];
    for (var i = 1; i <= 120 && !before.length; i++) before = L.allEventsAtYear(year - i);
    for (var j = 1; j <= 120 && !after.length; j++) after = L.allEventsAtYear(year + j);
    var html = '<div class="pop-head">' + headerForYear(year) + "</div>";
    html += '<div class="empty">此年无收录条目。前后最近有记载的年份：</div>';
    if (before.length) html += '<section class="tk"><h4>' + esc(T.formatYear(year - (function () { for (var i = 1; i <= 120; i++) if (L.allEventsAtYear(year - i).length) return i; return 0; })())) + '</h4><ul>' + before.slice(0, 4).map(eventRow).join("") + "</ul></section>";
    if (after.length) html += '<section class="tk"><h4>' + esc(T.formatYear(year + (function () { for (var i = 1; i <= 120; i++) if (L.allEventsAtYear(year + i).length) return i; return 0; })())) + '</h4><ul>' + after.slice(0, 4).map(eventRow).join("") + "</ul></section>";
    return html;
  }

  function show(hit, x, y) {
    var e = ensure();
    clearTimeout(hideTimer);
    lastHit = hit;
    var html;
    if (hit.kind === "event") { html = buildForEvent(hit.event); currentKey = "e:" + hit.event.id; }
    else if (hit.bin || hit.group) { html = buildForBin(hit.bin || hit.group); currentKey = "b:" + (hit.bin || hit.group).key; }
    else { html = ""; currentKey = null; }
    if (!html) return;
    e.innerHTML = pinned ? '<div class="pinned-tip">已钉住 · 点击空白取消</div>' + html : html;
    e.hidden = false;
    position(x, y);
  }

  function position(x, y) {
    var e = el;
    var W = window.innerWidth, H = window.innerHeight;
    var w = e.offsetWidth || 380, h = e.offsetHeight || 320;
    var left = x + 20, top = y + 14;
    if (left + w > W - 12) left = x - w - 20;
    if (left < 8) left = 8;
    if (top + h > H - 12) top = Math.max(8, H - h - 12);
    e.style.left = left + "px";
    e.style.top = top + "px";
  }

  function follow(hit, x, y) {
    if (!el || el.hidden) return;
    var key = hit.kind === "event" ? "e:" + hit.event.id : "b:" + ((hit.bin || hit.group || {}).key || "");
    if (key !== currentKey) show(hit, x, y);
    else position(x, y);
  }

  function isSame(hit) {
    var key = hit.kind === "event" ? "e:" + hit.event.id : "b:" + ((hit.bin || hit.group || {}).key || "");
    return key === currentKey;
  }

  function hideSoon() {
    if (pinned) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { hide(true); }, 220);
  }

  function hide(force) {
    if (force) pinned = false;
    clearTimeout(hideTimer);
    if (!el) return;
    if (el.contains(document.activeElement) && !force) return;
    el.hidden = true;
    currentKey = null;
  }

  function togglePin() {
    pinned = !pinned;
    if (pinned && lastHit) show(lastHit, parseFloat(el.style.left) - 20, parseFloat(el.style.top) - 14);
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest) return;
    if (e.target.closest("[data-pin]")) { togglePin(); e.stopPropagation(); return; }
    if (!e.target.closest(".popover") && pinned) hide(true);
  }, true);

  window.ChronPopover = { show: show, hide: hide, hideSoon: hideSoon, follow: follow, isOpen: function () { return !!el && !el.hidden; }, isSame: isSame, emptyYear: buildEmptyYear };
})();
