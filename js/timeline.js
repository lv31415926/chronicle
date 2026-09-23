/* timeline.js | Canvas 双线编年史主视图（lane 抽象支持 overlay/split 两种模式） */
(function () {
  "use strict";

  var S = window.ChronState, L = window.ChronLoader, A = window.ChronAxis,
      LOD = window.ChronLOD, T = window.ChronTime, SH = window.ChronShapes,
      PL = window.ChronPalette, FL = window.ChronFlow, M = window.__CHRONICLE_META;

  var canvas, ctx, wrap, vp, minimap, mmCtx, mmCache = null;
  var dirty = true, layout = null, hitShapes = [], bridgeShapes = [];
  var serif = '"Songti SC","Source Han Serif SC","Noto Serif SC","SimSun",serif';
  var sans = '-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var opts = { showLabels: true, showBridge: true, showFold: true, showYearTicks: true, showFlow: true };
  var pulseTarget = null, pulseStart = 0;

  /* ============ 布局 ============ */
  function computeLayout() {
    var r = wrap.getBoundingClientRect();
    var W = Math.max(320, Math.floor(r.width));
    var H = Math.max(340, Math.floor(r.height));
    var padL = 16, padR = 16, plotW = W - padL - padR;
    var eraH = 22, axisH = 44, hudH = 8;
    var mode = S.get().mode;

    var top = hudH + 2;
    var bottom = H - axisH - 4;
    var bodyH = bottom - top;

    var lo = { W: W, H: H, plotX: padL, plotW: plotW, mode: mode, axis: { y: H - axisH, h: axisH - 2 }, lanes: [], mid: top + bodyH / 2 };

    function mkLane(track, y0, y1, dir) {
      var era = { y: dir === -1 ? y0 : y1 - eraH, h: eraH };
      var innerTop = dir === -1 ? era.y + era.h + 4 : y0 + 4;
      var innerBottom = dir === -1 ? y1 - 4 : era.y - 4;
      var base = dir === -1 ? innerBottom : innerTop;
      var laneH = Math.abs(innerBottom - innerTop);
      var step = Math.max(14, Math.min(26, laneH / 8));
      return {
        track: track, dir: dir, era: era, eraList: track === "cn" ? M.cnEras : M.worldEras,
        base: base, top: Math.min(innerTop, innerBottom), bottom: Math.max(innerTop, innerBottom),
        step: step, max: Math.max(3, Math.floor(laneH / step))
      };
    }

    if (mode === "overlay") {
      var half = bodyH / 2;
      lo.lanes.push(mkLane("cn", top, top + half, -1));
      lo.lanes.push(mkLane("world", top + half, bottom, 1));
      lo.mid = top + half;
    } else {
      var q = bodyH / 2;
      lo.lanes.push(mkLane("cn", top, top + q - 6, -1));
      lo.lanes.push(mkLane("world", top + q + 6, bottom, -1));
      lo.mid = top + q;
    }
    lo.cnBase = lo.lanes[0].base;
    lo.wdBase = lo.lanes[1].base;
    return lo;
  }

  function laneOf(track) {
    return layout.lanes[0].track === track ? layout.lanes[0] : layout.lanes[1];
  }

  function resize() {
    layout = computeLayout();
    ctx = SH.setupHiDPI(canvas, layout.W, layout.H);
    if (!vp) vp = new A.Viewport(layout.plotW, S.get().view.from, S.get().view.to);
    else vp.w = layout.plotW;
    if (minimap) {
      var mr = minimap.getBoundingClientRect();
      if (mr.width > 40) mmCtx = SH.setupHiDPI(minimap, mr.width, mr.height);
    }
    dirty = true;
  }

  function syncView() {
    var v = S.get().view;
    if (!vp) return;
    if (Math.abs(vp.from - v.from) > 1e-9 || Math.abs(vp.to - v.to) > 1e-9) { vp.from = v.from; vp.to = v.to; dirty = true; }
  }

  /* ============ 绘制 ============ */
  function draw() {
    if (!ctx || !layout) return;
    var st = S.get(), pal = PL.get();
    syncView();
    if (st.mode !== layout.mode) { layout = computeLayout(); }
    var tier = LOD.tierOf(vp.pxPerYear);
    if (st.lod !== tier.id) S.patch({ lod: tier.id });

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, layout.W, layout.H);
    hitShapes = []; bridgeShapes = []; labelReqs = [];

    var evs = L.eventsIn(Math.floor(vp.from) - 1, Math.ceil(vp.to) + 1).filter(S.passesFilter);
    var groups = LOD.aggregate(evs, tier, vp.pxPerYear);

    drawTrackBands(pal, st);
    drawGrid(pal, st);
    drawEraBands(pal, st);
    drawBaselines(pal, st);
    drawFlow(st, pal, evs);

    if (tier.id === "L5") groups.forEach(function (g) { drawEraGroup(pal, g); });
    else groups.forEach(function (g) { drawBin(pal, g, tier); });

    drawBridge(pal, st);
    drawMarks(pal, st);
    drawPulse();
    drawAxis(pal, st);
    flushLabels(pal);
    drawMinimap(pal);
    drawHud(pal, st, tier, evs.length);
  }

  function drawTrackBands(pal, st) {
    layout.lanes.forEach(function (ln) {
      if (!st.tracks[ln.track]) return;
      ctx.fillStyle = ln.track === "cn" ? pal.trackBandCn : pal.trackBandWorld;
      ctx.fillRect(layout.plotX, ln.top, layout.plotW, ln.bottom - ln.top);
    });
  }

  function drawGrid(pal, st) {
    var plan = A.tickPlan(vp, layout.plotW);
    layout.lanes.forEach(function (ln) {
      if (!st.tracks[ln.track]) return;
      plan.minors.forEach(function (y) {
        var x = Math.round(layout.plotX + vp.x(y)) + .5;
        if (x < layout.plotX || x > layout.plotX + layout.plotW) return;
        ctx.strokeStyle = pal.gridMinor; ctx.lineWidth = 1;
        seg(x, ln.top, ln.bottom);
      });
      plan.majors.forEach(function (y) {
        var x = Math.round(layout.plotX + vp.x(y)) + .5;
        if (x < layout.plotX || x > layout.plotX + layout.plotW) return;
        ctx.strokeStyle = pal.gridMajor; ctx.lineWidth = 1;
        seg(x, ln.era.y, ln.bottom > ln.top ? ln.bottom : ln.top);
      });
    });
    function seg(x, a, b) { ctx.beginPath(); ctx.moveTo(x, a); ctx.lineTo(x, b); ctx.stroke(); }
  }

  function drawEraBands(pal, st) {
    layout.lanes.forEach(function (ln) {
      if (!st.tracks[ln.track]) return;
      var col = M.tracks[ln.track].color;
      A.eraSegments(ln.eraList, vp.from, vp.to).forEach(function (sg) {
        var x0 = layout.plotX + vp.x(sg.from), x1 = layout.plotX + vp.x(sg.to);
        var w = Math.max(1.5, x1 - x0);
        ctx.fillStyle = PL.alpha(col, ln.track === "cn" ? .17 : .15);
        ctx.fillRect(x0, ln.era.y, w - 1, ln.era.h);
        ctx.strokeStyle = PL.alpha(col, .45); ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x0) + .5, ln.era.y + .5, Math.round(w) - 1, ln.era.h - 1);
        if (w < 40) return;
        var ed = sg.era;
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, ln.era.y, w - 2, ln.era.h); ctx.clip();
        ctx.textBaseline = "middle"; ctx.textAlign = "left";
        ctx.fillStyle = pal.eraBandText; ctx.font = "600 11.5px " + sans;
        var wide = w > 150 && ed.sub;
        ctx.fillText(SH.ellipsize(ctx, ed.label + (ed.approx ? " ~" : ""), w - 12),
                     x0 + 6, ln.era.y + ln.era.h / 2 + (wide ? -6 : 0));
        if (wide) {
          ctx.fillStyle = pal.eraBandTextDim; ctx.font = "10px " + sans;
          ctx.fillText(SH.ellipsize(ctx, ed.sub, w - 12), x0 + 6, ln.era.y + ln.era.h / 2 + 7);
        }
        ctx.restore();
      });
    });
  }

  function drawBaselines(pal, st) {
    layout.lanes.forEach(function (ln) {
      if (!st.tracks[ln.track]) return;
      ctx.strokeStyle = PL.alpha(M.tracks[ln.track].color, .55);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(layout.plotX, ln.base); ctx.lineTo(layout.plotX + layout.plotW, ln.base);
      ctx.stroke();
    });
  }

  /* 水层：减弱动效或数据未就绪时画「静止的河」（freeze 把 dt 归零），
   * 只有真正在动时才安排下一帧；关掉开关则整层不画，退回纯脏标记模型。 */
  function drawFlow(st, pal, evs) {
    if (!FL || !opts.showFlow) return;
    var anim = !reduceMotion && !!st.ready && !(window.ChronRiver && window.ChronRiver.isOpen());
    FL.draw(ctx, { layout: layout, vp: vp, pal: pal, st: st, evs: evs,
                   now: performance.now(), freeze: !anim });
    /* 32ms 后补一次脏标记：水层按 ~30fps 自续，整幕不必被拉到 60fps 全量重绘 */
    if (anim) setTimeout(function () { dirty = true; }, 32);
  }

  function drawEraGroup(pal, g) {
    var ln = laneOf(g.track);
    var col = M.tracks[g.track].color;
    var x0 = layout.plotX + vp.x(g.era.from), x1 = layout.plotX + vp.x(g.era.to);
    var w = Math.max(2, x1 - x0);
    var y = ln.base + ln.dir * 20;
    ctx.fillStyle = PL.alpha(col, .1 + Math.min(.3, Math.log(g.count + 1) / 14));
    SH.roundRect(ctx, x0 + 1, y - 10, Math.max(2, w - 2), 20, 5); ctx.fill();
    ctx.strokeStyle = PL.alpha(col, .5); ctx.lineWidth = 1;
    SH.roundRect(ctx, x0 + 1, y - 10, Math.max(2, w - 2), 20, 5); ctx.stroke();
    var cx = x0 + w / 2;
    if (w > 46 && inPlot(cx)) {
      ctx.font = "600 11px " + sans; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = pal.ink;
      ctx.fillText(SH.ellipsize(ctx, g.era.label + " · " + g.count + "件", Math.max(12, w - 10)), cx, y);
      ctx.textAlign = "left";
    }
    hitShapes.push({ kind: "era", x: cx, y: y, r: Math.max(9, Math.min(w / 2, 90)), group: g });
    g.top5.forEach(function (ev, i) {
      var ex = layout.plotX + vp.x(ev.year);
      if (!inPlot(ex)) return;
      var ey = y + ln.dir * (ln.dir === -1 ? -(16 + i * 4) : 16 + i * 4);
      var r = SH.weightRadius(ev.weight) * .85;
      SH.drawShape(ctx, ev.dim, ex, ey, r, M.dimensions[ev.dim].color, pal.bg, 1);
      hitShapes.push({ kind: "event", x: ex, y: ey, r: r + 3, event: ev });
    });
  }

  var labelReqs = [];

  function drawBin(pal, g, tier) {
    var ln = laneOf(g.track);
    var tcol = M.tracks[g.track].color;
    var cx = layout.plotX + vp.x(g.start + (g.step > 1 ? (g.step - 1) / 2 : 0));
    if (!inPlot(cx, 30)) return;

    if (g.step > 1) {
      var dom = Object.keys(g.byDim).sort(function (a, b) { return g.byDim[b] - g.byDim[a]; })[0];
      var r = 5 + Math.min(11, Math.log(g.count + 1) * 3);
      var y = ln.base + ln.dir * (12 + r * .2);
      ctx.globalAlpha = pal.binFillAlpha;
      SH.drawShape(ctx, dom, cx, y, r, PL.alpha(M.dimensions[dom].color, .88), tcol, 1.4);
      ctx.globalAlpha = 1;
      if (r > 9) {
        ctx.font = "700 9px " + sans; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = pal.bg; ctx.fillText(String(g.count), cx, y + .5); ctx.textAlign = "left";
      }
      hitShapes.push({ kind: "bin", x: cx, y: y, r: r + 3, bin: g });
      if (vp.pxPerYear * g.step > 36) {
        label({ x: cx, y: y + ln.dir * (r + 12), text: g.label + " · " + g.count + "件",
                color: M.tracks[g.track].colorSoft, dir: ln.dir, size: 10, prio: 40,
                y0: ln.top + 6, y1: ln.bottom - 6 });
      }
      return;
    }

    var shown = g.singles.slice(0, ln.max);
    shown.forEach(function (ev, i) {
      var rr = SH.weightRadius(ev.weight);
      var y2 = ln.base + ln.dir * (11 + i * ln.step);
      ctx.strokeStyle = PL.alpha(tcol, .3); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, ln.base); ctx.lineTo(cx, y2); ctx.stroke();
      SH.drawShape(ctx, ev.dim, cx, y2, rr, M.dimensions[ev.dim].color, pal.bg, 1);
      hitShapes.push({ kind: "event", x: cx, y: y2, r: rr + 3, event: ev });
      if (opts.showLabels && (tier.id === "L1" || (tier.id === "L2" && ev.weight >= 5))) {
        label({ x: cx, y: y2 + ln.dir * (rr + 10), text: ev.title,
                color: M.tracks[ev.track].colorSoft, dir: ln.dir, size: 11, halo: true,
                prio: 20 + ev.weight * 2, y0: ln.top + 6, y1: ln.bottom - 6 });
      }
    });

    if (g.folded.length && opts.showFold) {
      var fy = ln.base + ln.dir * (11 + Math.max(1, shown.length) * ln.step);
      if (!shown.length) fy = ln.base + ln.dir * 12;
      var txt = "+" + g.folded.length;
      ctx.font = "600 9.5px " + sans;
      var w2 = ctx.measureText(txt).width + 9;
      ctx.fillStyle = PL.alpha(tcol, .24);
      SH.roundRect(ctx, cx - w2 / 2, fy - 7, w2, 14, 7); ctx.fill();
      ctx.fillStyle = pal.inkSoft; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(txt, cx, fy); ctx.textAlign = "left";
      hitShapes.push({ kind: "fold", x: cx, y: fy, r: Math.max(9, w2 / 2), bin: g });
    }

    /* overlay：两轨基线背对背，中间只有一条 8px 空带，年份标注共用（同年即同位）；
     * split：各轨走自己基线外侧。两条请求若落在同一格，后者被固定位避让丢弃。 */
    if (opts.showYearTicks && vp.pxPerYear > 5.2 && (shown.length || g.folded.length)) {
      var shared = layout.mode === "overlay";
      label({ x: cx, y: shared ? layout.mid : ln.base - ln.dir * 7,
              text: T.formatYearShort(g.start, false), color: pal.inkFaint, dir: ln.dir,
              size: shared ? 9 : 9.5, prio: 45, fixed: true, halo: true });
    }
  }

  /* 标注采用两遍法：绘制阶段只登记请求，flushLabels 按优先级贪心占位。
   * 放不下就丢弃——密集视图下「少标」远胜于「叠字」。 */
  function label(rq) {
    if (!rq.text) return;
    rq.y0 = rq.y0 === undefined ? -1e9 : rq.y0;
    rq.y1 = rq.y1 === undefined ? 1e9 : rq.y1;
    labelReqs.push(rq);
  }

  function slotClash(placed, bx, top, tw, rowH) {
    for (var i = 0; i < placed.length; i++) {
      var s = placed[i];
      if (top < s.top + s.h && top + rowH > s.top && bx < s.x + s.w + 6 && bx + tw + 6 > s.x) return true;
    }
    return false;
  }

  function flushLabels(pal) {
    if (!labelReqs.length) return;
    var reqs = labelReqs.slice();
    labelReqs = [];
    var mid = layout.plotX + layout.plotW / 2;
    reqs.sort(function (a, b) {
      return (b.prio - a.prio) || (Math.abs(a.x - mid) - Math.abs(b.x - mid));
    });

    /* 年份刻度自成一行、互不遮挡即可，不占正文标注的配额 */
    var budget = Math.max(6, Math.min(24, Math.round(layout.plotW / 90)));
    var maxW = Math.max(84, layout.plotW * 0.22);
    var placed = [], used = 0;

    for (var i = 0; i < reqs.length; i++) {
      var rq = reqs[i];
      if (!rq.fixed && used >= budget) continue;
      ctx.font = "600 " + rq.size + "px " + serif;
      var tw = ctx.measureText(rq.text).width;
      if (tw > maxW) {
        rq.text = SH.ellipsize(ctx, rq.text, maxW);
        tw = ctx.measureText(rq.text).width;
      }
      if (tw > layout.plotW - 4) continue;
      var bx = Math.max(layout.plotX + 2, Math.min(rq.x - tw / 2, layout.plotX + layout.plotW - tw - 2));
      var rowH = rq.size + 3;
      var y = rq.y, ok = false;
      for (var a = 0, tries = rq.fixed ? 1 : 7; a < tries; a++) {
        if (y >= rq.y0 && y <= rq.y1 && !slotClash(placed, bx, y - rowH / 2, tw, rowH)) { ok = true; break; }
        y += rq.dir * rowH;
      }
      if (!ok) continue;
      placed.push({ x: bx, y: y, top: y - rowH / 2, w: tw, h: rowH });
      if (!rq.fixed) used++;

      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      if (rq.halo) {
        ctx.lineWidth = 3.2; ctx.lineJoin = "round"; ctx.strokeStyle = pal.labelHalo;
        ctx.strokeText(rq.text, bx, y);
      }
      ctx.fillStyle = rq.color;
      ctx.fillText(rq.text, bx, y);
    }
  }

  function inPlot(x, pad) {
    pad = pad || 0;
    return x >= layout.plotX - pad && x <= layout.plotX + layout.plotW + pad;
  }

  function focusedEvent(st) {
    if (st.hover && st.hover.kind === "event") return st.hover.event;
    if (st.selectedId) return L.eventById(st.selectedId);
    return null;
  }

  function yOf(ev) {
    for (var i = 0; i < hitShapes.length; i++) {
      var s = hitShapes[i];
      if (s.kind === "event" && s.event && s.event.id === ev.id) return s.y;
    }
    var ln = laneOf(ev.track);
    return ln.base + ln.dir * 12;
  }

  function drawBridge(pal, st) {
    if (!opts.showBridge || st.mode !== "overlay") return;
    var f = focusedEvent(st);
    if (!f) return;
    var seen = {};
    (f.related || []).forEach(function (rid) {
      if (seen[rid]) return; seen[rid] = 1;
      var ev = L.eventById(rid);
      if (!ev || !S.passesFilter(ev)) return;
      var x0 = layout.plotX + vp.x(f.year), x1 = layout.plotX + vp.x(ev.year);
      var y0 = yOf(f), y1 = yOf(ev);
      ctx.strokeStyle = pal.bridgeHot; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2, x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = .9;
      SH.drawShape(ctx, ev.dim, x1, y1, SH.weightRadius(ev.weight) + 3, null, pal.bridgeHot, 1.6);
      ctx.globalAlpha = 1;
      bridgeShapes.push({ kind: "event", x: x1, y: y1, r: 12, event: ev });
    });
  }

  function drawMarks(pal, st) {
    function ring(s, color, lw) {
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 4.5, 0, Math.PI * 2); ctx.stroke();
    }
    function find(id) {
      return hitShapes.filter(function (s) { return s.kind === "event" && s.event.id === id; })[0];
    }
    if (st.selectedId) { var sel = find(st.selectedId); if (sel) ring(sel, pal.selectGlow, 2); }
    if (st.hover) {
      if (st.hover.kind === "event") { var h = find(st.hover.event.id); if (h) ring(h, pal.hoverGlow, 1.8); }
      else if (st.hover.bin) {
        var b = hitShapes.filter(function (s) { return s.bin && s.bin.key === st.hover.bin.key; })[0];
        if (b) ring(b, pal.hoverGlow, 1.8);
      }
    }
    if (st.selectedYear) {
      var x = layout.plotX + vp.x(st.selectedYear);
      if (inPlot(x)) {
        ctx.strokeStyle = PL.alpha(pal.selectGlow, .5); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, layout.lanes[0].era.y); ctx.lineTo(x, layout.H - layout.axis.h); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawPulse() {
    if (!pulseTarget) return;
    var t = (performance.now() - pulseStart) / 900;
    if (t > 1) { pulseTarget = null; return; }
    var s = hitShapes.filter(function (x) { return x.kind === "event" && x.event.id === pulseTarget; })[0];
    if (!s) { pulseTarget = null; return; }
    ctx.strokeStyle = PL.alpha(PL.get().selectGlow, 1 - t);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 6 + t * 28, 0, Math.PI * 2); ctx.stroke();
    dirty = true;
  }

  function drawAxis(pal, st) {
    var plan = A.tickPlan(vp, layout.plotW);
    ctx.textBaseline = "top";
    plan.minors.forEach(function (y) {
      var x = Math.round(layout.plotX + vp.x(y)) + .5;
      if (!inPlot(x)) return;
      ctx.strokeStyle = pal.gridMinor; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, layout.axis.y); ctx.lineTo(x, layout.axis.y + 3); ctx.stroke();
    });
    plan.majors.forEach(function (y) {
      var x = Math.round(layout.plotX + vp.x(y)) + .5;
      if (!inPlot(x, 24)) return;
      ctx.strokeStyle = pal.gridMajor;
      ctx.beginPath(); ctx.moveTo(x, layout.axis.y); ctx.lineTo(x, layout.axis.y + 6); ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = pal.ink; ctx.font = "600 11px " + sans;
      ctx.fillText(y < 0 ? "前" + Math.abs(y) : String(y), x, layout.axis.y + 9);
      if (vp.pxPerYear * plan.major > 90) {
        ctx.fillStyle = pal.inkFaint; ctx.font = "10px " + sans;
        ctx.fillText(T.centuryAbbrev(y), x, layout.axis.y + 24);
      }
    });
    ctx.textAlign = "left";
    ctx.strokeStyle = pal.rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(layout.plotX, layout.axis.y - .5); ctx.lineTo(layout.plotX + layout.plotW, layout.axis.y - .5); ctx.stroke();
  }

  function drawMinimap(pal) {
    if (!mmCtx || !minimap) return;
    var r = minimap.getBoundingClientRect();
    var W = r.width, H = r.height;
    if (W < 50) return;
    mmCtx.clearRect(0, 0, W, H);
    mmCtx.fillStyle = pal.minimapBg; mmCtx.fillRect(0, 0, W, H);
    var all = L.allEvents();
    if (!all.length) return;
    if (!mmCache || mmCache.n !== all.length) mmCache = { n: all.length, d: A.densityBins(all, 180) };
    var d = mmCache.d, bw = W / d.counts.length;
    for (var i = 0; i < d.counts.length; i++) {
      var h = Math.max(1, d.counts[i] / d.max * (H - 8));
      mmCtx.fillStyle = pal.density;
      mmCtx.fillRect(i * bw, H - h - 2, Math.max(1, bw - 1), h);
    }
    M.worldEras.forEach(function (e) {
      var x = (e.from - M.yearMin) / (M.yearMax - M.yearMin) * W;
      mmCtx.strokeStyle = pal.rule; mmCtx.lineWidth = 1;
      mmCtx.beginPath(); mmCtx.moveTo(x, 0); mmCtx.lineTo(x, H); mmCtx.stroke();
    });
    var sc = W / (M.yearMax - M.yearMin);
    var x0 = Math.max(0, (vp.from - M.yearMin) * sc), x1 = Math.min(W, (vp.to - M.yearMin) * sc);
    mmCtx.fillStyle = PL.alpha(pal.selectGlow, .13);
    mmCtx.fillRect(x0, 0, Math.max(3, x1 - x0), H);
    mmCtx.strokeStyle = pal.selectGlow; mmCtx.lineWidth = 1.4;
    mmCtx.strokeRect(x0 + .5, .5, Math.max(3, x1 - x0) - 1, H - 1);
    var zx = (1 - M.yearMin) * sc;
    mmCtx.strokeStyle = pal.eraBandTextDim;
    mmCtx.beginPath(); mmCtx.moveTo(zx, 0); mmCtx.lineTo(zx, H); mmCtx.stroke();
  }

  function drawHud(pal, st, tier, n) {
    ctx.font = "10.5px " + sans; ctx.fillStyle = pal.inkFaint;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(tier.label + " 层 · 视野约 " + Math.round(vp.span) + " 年 · 屏内 " + n + " 条",
                 layout.W - 10, 4);
    ctx.textAlign = "left";
  }

  /* ============ 循环与对外接口 ============ */
  function loop() {
    if (dirty) { dirty = false; draw(); }
    requestAnimationFrame(loop);
  }

  function hitTest(x, y) {
    return SH.hit(hitShapes, x, y, 4) || SH.hit(bridgeShapes, x, y, 2);
  }
  function yearAtPixel(px) {
    if (!vp) return null;
    return T.coordToYear(vp.yearAt(px - layout.plotX));
  }
  function zoomToRange(from, to) {
    var nv = new A.Viewport(vp.w, from, to).constrained();
    S.setView(nv.from, nv.to);
  }
  function zoomToYear(y, span) { zoomToRange(y - span / 2, y + span / 2); }
  function flyToYear(year, span, dur) {
    dur = dur || 480;
    var v0 = { from: vp.from, to: vp.to };
    var v1 = new A.Viewport(vp.w, year - span / 2, year + span / 2).constrained();
    var t0 = performance.now();
    (function step(now) {
      var t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      S.setView(v0.from + (v1.from - v0.from) * e, v0.to + (v1.to - v0.to) * e);
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  function pulseEvent(id) { pulseTarget = id; pulseStart = performance.now(); dirty = true; }

  function init(cnv, wrapEl, mm) {
    canvas = cnv; wrap = wrapEl; minimap = mm;
    resize();
    /* 画布高是内联像素值，容器因内容长高/变矮时 window.resize 不会触发，
     * 于是画布溢出压住下方提示条——必须跟着 wrap 的实际尺寸重算。 */
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(wrap);
    S.subscribe(function (s, ch) {
      PL.set(s.theme);
      document.documentElement.setAttribute("data-theme", s.theme);
      if (s.mode !== (layout && layout.mode)) layout = computeLayout();
      syncView(); dirty = true;
      if (ch.view) L.ensureRange(Math.floor(s.view.from), Math.ceil(s.view.to)).then(function (n) { if (n) dirty = true; });
    });
    L.ensureRange(Math.floor(S.get().view.from), Math.ceil(S.get().view.to))
      .then(function () { dirty = true; })
      .catch(function (e) { console.error("[timeline] 数据加载失败", e); });
    requestAnimationFrame(loop);
  }

  window.ChronTimeline = {
    init: init, resize: resize, invalidate: function () { dirty = true; }, draw: draw,
    hitTest: hitTest, yearAtPixel: yearAtPixel, zoomToRange: zoomToRange, zoomToYear: zoomToYear,
    flyToYear: flyToYear, pulseEvent: pulseEvent, opts: opts, laneOf: laneOf,
    get viewport() { return vp; },
    get layout() { return layout; }
  };
})();
