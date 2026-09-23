/* interaction.js | 滚轮锚点缩放、拖拽惯性、点击、键盘、minimap 拖框、悬停调度 */
(function () {
  "use strict";

  var S = window.ChronState, T = window.ChronTime, Tm = window.ChronTimeline,
      A = window.ChronAxis, M = window.__CHRONICLE_META;

  var drag = null, inertia = null, hoverTimer = null, lastHoverAt = 0;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rect() { return document.getElementById("tl-canvas").getBoundingClientRect(); }
  function local(e) { var r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  /* ============ 缩放：以鼠标下的年份为锚点 ============ */
  function applyZoom(factor, anchorYear) {
    var vp = Tm.viewport;
    var nv = vp.zoomed(Math.max(0.4, Math.min(2.5, factor)), anchorYear).constrained(0);
    Tm.zoomToRange(nv.from, nv.to);
  }

  function panByPixels(dx) {
    var vp = Tm.viewport;
    var dYears = dx / vp.w * vp.span;
    var nv = vp.translated(-dYears).constrained(vp.span * 0.08);
    S.setView(nv.from, nv.to);
  }

  function onWheel(e) {
    e.preventDefault();
    stopInertia();
    var p = local(e);
    var vp = Tm.viewport;
    var anchor = T.coordToYear(vp.yearAt(p.x - Tm.layout.plotX));
    var pinch = e.ctrlKey || e.metaKey;                        /* 触控板捏合 → ctrlKey */
    var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) && !pinch;

    if (horizontal && !e.shiftKey) { panByPixels(-e.deltaX); return; }
    if (e.shiftKey && !pinch && Math.abs(e.deltaY) < Math.abs(e.deltaX)) { panByPixels(-e.deltaX); return; }
    var d = pinch ? e.deltaY : (e.deltaY || e.deltaX);
    applyZoom(Math.exp(d * 0.0016), anchor);
  }

  /* ============ 拖拽 + 惯性 ============ */
  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stopInertia();
    var p = local(e);
    drag = {
      id: e.pointerId, x0: e.clientX, from: Tm.viewport.from, to: Tm.viewport.to,
      moved: 0, samples: [], hit: Tm.hitTest(p.x, p.y)
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    document.body.classList.add("dragging");
  }

  function onPointerMove(e) {
    var p = local(e);
    if (drag && drag.id === e.pointerId) {
      var dxPx = e.clientX - drag.x0;
      drag.moved = Math.max(drag.moved, Math.abs(dxPx));
      var w = Tm.viewport.w;
      var v0 = new A.Viewport(w, drag.from, drag.to);
      var nv = v0.translated(-(dxPx / w * v0.span)).constrained(v0.span * 0.08);
      S.setView(nv.from, nv.to);
      drag.samples.push({ t: performance.now(), px: dxPx });
      if (drag.samples.length > 14) drag.samples.shift();
      hideHover();
      return;
    }
    onHoverMove(p.x, p.y);
  }

  function onPointerUp(e) {
    if (!drag || drag.id !== e.pointerId) return;
    var moved = drag.moved, samples = drag.samples, hit = drag.hit;
    document.body.classList.remove("dragging");
    drag = null;
    if (moved < 5) { handleClick(hit, local(e)); return; }
    if (reduceMotion || samples.length < 3) return;
    var last = samples[samples.length - 1], first = samples[0];
    var dt = (last.t - first.t) / 1000;
    if (dt <= 0.02 || dt > 0.4) return;
    var pxPerSec = (last.px - first.px) / dt;
    var span = Tm.viewport.span;
    var vYears = -pxPerSec / Tm.viewport.w * span;            /* 年/秒 */
    if (Math.abs(vYears) > span * 0.06) startInertia(vYears);
  }

  function startInertia(v0) {
    var tau = 420, t0 = performance.now();
    function step(now) {
      var el = now - t0;
      var frame = 1000 / 60;
      var dv = v0 * Math.exp(-el / tau) * (frame / 1000);
      var vp = Tm.viewport;
      var nv = vp.translated(-dv).constrained(vp.span * 0.08);
      S.setView(nv.from, nv.to);
      if (el < 1400 && Math.abs(dv) > vp.span * 0.0003) inertia = requestAnimationFrame(step);
      else { inertia = null; }
    }
    inertia = requestAnimationFrame(step);
  }
  function stopInertia() { if (inertia) { cancelAnimationFrame(inertia); inertia = null; } }

  /* ============ 悬停 ============ */
  function onHoverMove(x, y) {
    var hit = Tm.hitTest(x, y);
    var Pop = window.ChronPopover;
    if (!hit) {
      clearTimeout(hoverTimer);
      document.body.style.cursor = "";
      hideHover();
      return;
    }
    document.body.style.cursor = "pointer";
    var now = performance.now();
    if (Pop && Pop.isOpen() && Pop.isSame(hit)) { Pop.follow(hit, x, y); return; }
    if (now - lastHoverAt < 40) return;
    lastHoverAt = now;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      S.patch({
        hover: {
          kind: hit.kind === "event" ? "event" : (hit.kind === "bin" || hit.kind === "era") ? "bin" : "fold",
          event: hit.event || null, bin: hit.bin || hit.group || null
        }
      });
      Pop && Pop.show(hit, x, y);
    }, 120);
  }

  function hideHover() {
    if (S.get().hover) S.patch({ hover: null });
    window.ChronPopover && ChronPopover.hideSoon();
  }

  /* ============ 点击 ============ */
  function zoomToGroup(g) {
    if (!g) return;
    if (g.era) { Tm.flyToYear((g.era.from + g.era.to) / 2, Math.max(40, g.era.to - g.era.from)); return; }
    var step = g.step || 1;
    if (step <= 1) { Tm.flyToYear(g.start, 26); return; }
    Tm.flyToYear(g.start + (step - 1) / 2, step * 1.6);
  }

  function handleClick(hit, p) {
    var D = window.ChronDetail;
    if (hit && hit.kind === "event") {
      S.patch({ selectedId: hit.event.id, selectedYear: hit.event.year, hover: null });
      window.ChronPopover && ChronPopover.hide(true);
      D && D.openEvent(hit.event.id);
      return;
    }
    if (hit && (hit.kind === "bin" || hit.kind === "era" || hit.kind === "fold")) {
      zoomToGroup(hit.bin || hit.group);
      return;
    }
    var year = Tm.yearAtPixel(p.x);
    if (year === null) return;
    S.patch({ selectedYear: year, selectedId: null });
    D && D.openYear(year);
  }

  /* ============ 键盘 ============ */
  function nearestYearWithEvents(from, dir) {
    for (var i = 1; i <= 4000; i++) {
      var y = from + dir * i;
      if (y < M.yearMin || y > M.yearMax) break;
      if (window.ChronLoader.allEventsAtYear(y).length) return y;
    }
    return null;
  }

  function onKeyDown(e) {
    var tag = (e.target && e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      if (e.key === "Escape" && e.target.blur) e.target.blur();
      return;
    }
    var vp = Tm.viewport;
    if (!vp) return;
    var span = vp.span;
    var jumpPx = (e.shiftKey ? span * 0.25 : span * 0.06) / span * vp.w;
    var k = e.key;

    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === "k") { window.ChronSearch && ChronSearch.open(); e.preventDefault(); return; }

    switch (k) {
      case "ArrowLeft":  panByPixels(jumpPx); e.preventDefault(); break;
      case "ArrowRight": panByPixels(-jumpPx); e.preventDefault(); break;
      case "+": case "=": applyZoom(0.5, (vp.from + vp.to) / 2); e.preventDefault(); break;
      case "-": case "_": applyZoom(2, (vp.from + vp.to) / 2); e.preventDefault(); break;
      case "Home": Tm.zoomToRange(M.yearMin, M.yearMax); e.preventDefault(); break;
      case "End": Tm.flyToYear(2026, 40); e.preventDefault(); break;
      case "Escape":
        var floating = (window.ChronDetail && ChronDetail.isOpen())
          || (window.ChronSearch && ChronSearch.isOpen())
          || (window.ChronThemes && ChronThemes.isOpen());
        S.patch({ selectedId: null, selectedYear: null, hover: null });
        window.ChronDetail && ChronDetail.close();
        window.ChronSearch && ChronSearch.close();
        window.ChronThemes && ChronThemes.close();
        /* 长河是底面：浮层还在时一次 Esc 只收浮层，否则用户点开的详情会把他甩出视图 */
        if (!floating && window.ChronRiver) ChronRiver.close();
        break;
      case "r": case "R":
        if (window.ChronRiver) { ChronRiver.isOpen() ? ChronRiver.close() : ChronRiver.open({}); e.preventDefault(); }
        break;
      case "/": window.ChronSearch && ChronSearch.open(); e.preventDefault(); break;
      case "[": case "]": {
        var cur = S.get().selectedYear || Math.round((vp.from + vp.to) / 2);
        var nxt = nearestYearWithEvents(cur, k === "]" ? 1 : -1);
        if (nxt !== null) {
          S.patch({ selectedYear: nxt, selectedId: null });
          Tm.flyToYear(nxt, Math.max(10, span));
          window.ChronDetail && ChronDetail.openYear(nxt);
        }
        e.preventDefault();
        break;
      }
      case "Enter":
        if (S.get().selectedId) { window.ChronDetail && ChronDetail.openEvent(S.get().selectedId); e.preventDefault(); }
        else if (S.get().selectedYear) { window.ChronDetail && ChronDetail.openYear(S.get().selectedYear); e.preventDefault(); }
        break;
    }
  }

  /* ============ minimap ============ */
  function bindMinimap(el) {
    var on = false;
    function jump(clientX) {
      var r = el.getBoundingClientRect();
      var t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      var center = M.yearMin + t * (M.yearMax - M.yearMin);
      var span = Tm.viewport.span;
      Tm.zoomToRange(center - span / 2, center + span / 2);
    }
    el.addEventListener("pointerdown", function (e) { on = true; try { el.setPointerCapture(e.pointerId); } catch (x) {} jump(e.clientX); });
    el.addEventListener("pointermove", function (e) { if (on) jump(e.clientX); });
    el.addEventListener("pointerup", function () { on = false; });
    el.addEventListener("pointercancel", function () { on = false; });
  }

  function init(canvasEl, minimapEl) {
    canvasEl.addEventListener("wheel", onWheel, { passive: false });
    canvasEl.addEventListener("pointerdown", onPointerDown);
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerup", onPointerUp);
    canvasEl.addEventListener("pointercancel", onPointerUp);
    canvasEl.addEventListener("pointerleave", function () { clearTimeout(hoverTimer); hideHover(); });
    canvasEl.addEventListener("dblclick", function (e) {
      var p = local(e);
      Tm.flyToYear(Tm.yearAtPixel(p.x), Math.max(24, Tm.viewport.span * 0.25));
    });
    window.addEventListener("keydown", onKeyDown);
    if (minimapEl) bindMinimap(minimapEl);
  }

  window.ChronInteraction = {
    init: init, panByPixels: panByPixels, applyZoom: applyZoom, zoomToGroup: zoomToGroup,
    nearestYearWithEvents: nearestYearWithEvents
  };
})();
