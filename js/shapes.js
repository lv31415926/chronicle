/* shapes.js | 维度形状二次编码绘制（色盲友好）+ Canvas 工具 */
(function () {
  "use strict";

  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  function polygon(cx, cy, r, n, rot) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (rot || -Math.PI / 2) + i * 2 * Math.PI / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  }

  function starPath(cx, cy, r) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    return pts;
  }

  /* shape(ctx, dim, cx, cy, r, fill, stroke, lw) */
  function drawShape(ctx, dim, cx, cy, r, fill, stroke, lw) {
    var shape = (window.__CHRONICLE_META.dimensions[dim] || {}).shape || "circle";
    ctx.save();
    ctx.lineWidth = lw || 1.2;
    ctx.fillStyle = fill || "currentColor";
    if (stroke) ctx.strokeStyle = stroke;

    switch (shape) {
      case "circle":
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        if (stroke) ctx.stroke();
        break;
      case "square":
        ctx.beginPath(); ctx.rect(cx - r * 0.9, cy - r * 0.9, r * 1.8, r * 1.8); ctx.fill();
        if (stroke) ctx.stroke();
        break;
      case "triangle":
        tracePath(ctx, polygon(cx, cy + r * 0.15, r * 1.15, 3)); ctx.fill(); if (stroke) ctx.stroke();
        break;
      case "diamond":
        tracePath(ctx, polygon(cx, cy, r * 1.25, 4)); ctx.fill(); if (stroke) ctx.stroke();
        break;
      case "pentagon":
        tracePath(ctx, polygon(cx, cy, r * 1.15, 5)); ctx.fill(); if (stroke) ctx.stroke();
        break;
      case "hexagon":
        tracePath(ctx, polygon(cx, cy, r * 1.1, 6, -Math.PI / 2 + Math.PI / 6)); ctx.fill(); if (stroke) ctx.stroke();
        break;
      case "star":
        tracePath(ctx, starPath(cx, cy, r * 1.35)); ctx.fill(); if (stroke) ctx.stroke();
        break;
      case "ring":
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(1.4, r * 0.5); ctx.strokeStyle = fill || "#999"; ctx.stroke();
        break;
      case "compass":
        tracePath(ctx, [[cx, cy - r * 1.3], [cx + r * 0.5, cy], [cx, cy + r * 1.3], [cx - r * 0.5, cy]]);
        ctx.fill(); if (stroke) ctx.stroke();
        break;
      case "cross":
        ctx.beginPath();
        var t = r * 0.42;
        tracePath(ctx, [[cx - t, cy - r], [cx + t, cy - r], [cx + t, cy - t], [cx + r, cy - t],
                        [cx + r, cy + t], [cx + t, cy + t], [cx + t, cy + r], [cx - t, cy + r],
                        [cx - t, cy + t], [cx - r, cy + t], [cx - r, cy - t], [cx - t, cy - t]]);
        ctx.fill(); if (stroke) ctx.stroke();
        break;
      default:
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* 命中检测：统一用半径盒近似（外扩 pad） */
  function hit(shapes, x, y, pad) {
    pad = pad || 3;
    for (var i = shapes.length - 1; i >= 0; i--) {
      var s = shapes[i];
      var r = (s.r || 5) + pad;
      if (Math.abs(x - s.x) <= r && Math.abs(y - s.y) <= r) return s;
    }
    return null;
  }

  function setupHiDPI(canvas, cssW, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo) + "…";
  }

  function weightColor(base, weight) {
    return base;
  }

  window.ChronShapes = {
    drawShape: drawShape,
    hit: hit,
    setupHiDPI: setupHiDPI,
    roundRect: roundRect,
    ellipsize: ellipsize,
    polygon: polygon,
    weightRadius: function (w) { return 3 + w * 1.5; }
  };
})();
