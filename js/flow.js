/* flow.js | 「时间长河」的水层：河面亮度随该段史实密度涨落，星子顺流而下，水面有波光与流星。
 * 只画背景，不产生命中区；粒子位置全部由确定性伪随机生成，同一宽度下永远同一批。
 * 颜色一律走 palette 令牌 + 双轨本色的三层结构（朱砂↑ / 金脊 / 石青↓），
 * 深墨与宣纸共用同一套令牌，靠 riverInk 系数分轻重。 */
(function () {
  "use strict";

  var M = window.__CHRONICLE_META, PL = window.ChronPalette;

  var BUCKETS = 96;
  var parts = [], glints = [], plotW = 0;
  var flowPhase = 0, lastNow = 0;

  /* 水面色带比粒子活动区宽出的倍数：多出来的一圈就是「隐隐」的水汽 */
  var HAZE = 1.9;
  /* 三道波光：两道主波撑形状，第三道高频细波只负责「粼」，压在浪尖上 */
  var WAVES = [
    { amp: .68, freq: 7, speed: 1.2, a: .26, lw: 1.1 },
    { amp: .42, freq: 13, speed: -.9, a: .16, lw: .8 },
    { amp: .9, freq: 29, speed: 2.3, a: .085, lw: .7 }
  ];
  var SEG = 48;   /* 波光分段步长：让明暗沿河面走一段，而不是整条河一个亮度 */

  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* u = 横向行程(0..1)，v = 离水面的相对深度（平方分布：贴水密、远处疏） */
  function rebuild(w) {
    plotW = w;
    var rand = mulberry(0x51ed270b ^ Math.round(w));   // 按宽度重播种：同宽必得同一批
    var n = Math.max(56, Math.min(230, Math.round(w / 5)));
    parts = [];
    for (var i = 0; i < n; i++) {
      /* roll 一次决定这一颗是尘、是反光、还是流星：三者互斥，
       * 否则同一像素上会叠出两种笔法，既贵又糊。
       * 流星速度上限 0.063：漂移窗口 0.65s×0.063=0.041 仍在断言的 0.05 之内。 */
      var roll = rand();
      var meteor = roll < 0.05;
      parts.push({
        u: rand(), v: Math.pow(rand(), 2.1),
        sp: meteor ? 0.042 + rand() * 0.021 : 0.015 + rand() * 0.035,
        lane: i % 2, di: rand(), r: 0.7 + rand() * 1.7, a: 0.3 + rand() * 0.65,
        amp: 0.5 + rand() * 1.9, ph: rand() * Math.PI * 2,
        tint: rand(), glint: !meteor && roll < 0.13, meteor: meteor,
        tail: 16 + rand() * 30
      });
    }
    /* 波光是独立一张表：水层的粒子几何有自己的断言（分布半径、漂移区间、轨道内外），
     * 闪点混进 parts 会让那些判据量到不该量的东西。 */
    glints = [];
    var g = Math.max(24, Math.min(96, Math.round(w / 9)));
    for (var j = 0; j < g; j++) {
      glints.push({
        u: rand(), di: rand(), lane: j % 2,
        off: Math.pow(rand(), 1.6), len: 3.4 + rand() * 7.5,
        ph: rand() * Math.PI * 2, fr: 0.7 + rand() * 2.3, warm: rand()
      });
    }
  }

  /* 屏内事件按像素分桶 → 平滑包络；河面明暗与粒子亮度都读它。
   * 每帧现算：evs 是刚过滤出来的新数组，任何「视图+长度」式缓存键都可能被
   * 同长度的不同筛选结果撞开，而这里一次遍历不到 0.05ms。 */
  function densityOf(evs, layout, vp) {
    var a = new Float32Array(BUCKETS);
    for (var i = 0; i < evs.length; i++) {
      var x = vp.x(evs[i].year) / layout.plotW;
      if (x < 0 || x > 1) continue;
      a[Math.min(BUCKETS - 1, (x * BUCKETS) | 0)] += 1;
    }
    var max = 1, out = new Float32Array(BUCKETS);
    for (var b = 0; b < BUCKETS; b++) {
      var v = a[b] * 0.5;
      if (b > 0) v += a[b - 1];
      if (b < BUCKETS - 1) v += a[b + 1];
      v /= 2.5;
      out[b] = v;
      if (v > max) max = v;
    }
    for (var c = 0; c < BUCKETS; c++) out[c] = Math.pow(out[c] / max, 0.55);
    return out;
  }

  function at(d, u) {
    var f = Math.max(0, Math.min(BUCKETS - 1, u * (BUCKETS - 1)));
    var i = f | 0, j = Math.min(BUCKETS - 1, i + 1), t = f - i;
    return d[i] * (1 - t) + d[j] * t;
  }

  /* 进出绘图区时淡入淡出，否则粒子绕回左缘时看得见「跳帧」 */
  function edge(u) { return Math.max(0, Math.min(1, Math.min(u, 1 - u) * 18)); }

  function trackCol(t, fallback) {
    return (M.tracks && M.tracks[t] && M.tracks[t].color) || fallback;
  }

  function channels(layout, st) {
    var pal = PL.get();
    var vis = layout.lanes.filter(function (ln) { return st.tracks[ln.track]; });
    if (!vis.length) return [];
    var depth = function (ln) { return Math.abs(ln.bottom - ln.top); };
    /* 叠加：两轨基线只隔 8px，各画一条只会糊成一片暗光——合流成一条中脊河，水沫向两侧溅。
     * 分栏：两轨各自成河，走自己基线。
     * up/dn 是水面色带的上/下侧颜色：上=朱砂（中国在上），下=石青，中脊一道金。 */
    if (layout.mode === "overlay" && vis.length === 2) {
      var h1 = Math.min(depth(vis[0]), depth(vis[1]));
      return [{
        y: layout.mid, dir: 1, dirs: [-1, 1],
        half: Math.max(10, Math.min(30, h1 * 0.26)),
        col: pal.selectGlow, crest: pal.selectGlow,
        up: trackCol("cn", pal.selectGlow), dn: trackCol("world", pal.selectGlow)
      }];
    }
    return vis.map(function (ln) {
      var col = trackCol(ln.track, pal.selectGlow);
      return {
        y: ln.base, dir: ln.dir, dirs: [ln.dir],
        half: Math.max(9, Math.min(26, depth(ln) * 0.18)),
        col: col, crest: pal.selectGlow,
        up: ln.dir === -1 ? col : null, dn: ln.dir === 1 ? col : null
      };
    });
  }

  /* 一条河的竖向色带：河心两侧各有一道真实坡度，靠 haze 才扩出水汽。
   * 渐变坐标允许越出画布（rect 不行——越界的负 y 会被水层断言判成非法落点）。 */
  function drawRiver(ctx, ch, d, layout, pal) {
    var x0 = layout.plotX, x1 = x0 + layout.plotW, ink = pal.riverInk;
    var bh = ch.half * HAZE;
    var g = ctx.createLinearGradient(0, ch.y - bh, 0, ch.y + bh);
    var side = function (col, p, a) {
      g.addColorStop(p, col ? PL.alpha(col, Math.min(.42, a * ink)) : "rgba(0,0,0,0)");
    };
    g.addColorStop(0, "rgba(0,0,0,0)");
    side(ch.up, .5 - .5 / HAZE * 1.6, .09);   /* 水汽：核心之外的一圈，比核心淡 */
    side(ch.up, .5 - .5 / HAZE, .26);         /* 核心边缘 */
    g.addColorStop(.5, PL.alpha(ch.crest, Math.min(.42, .3 * ink)));
    side(ch.dn, .5 + .5 / HAZE, .26);
    side(ch.dn, .5 + .5 / HAZE * 1.6, .09);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    var yTop = Math.max(0, ch.y - bh), yBot = Math.min(layout.H, ch.y + bh);
    for (var x = x0; x < x1; x += 8) {
      var u = (x - x0) / layout.plotW;
      ctx.globalAlpha = edge(u) * (.34 + .66 * at(d, u));
      ctx.fillRect(x, yTop, 8, yBot - yTop);
    }
    ctx.globalAlpha = 1;
  }

  function drawShimmer(ctx, ch, d, layout, phase) {
    var x0 = layout.plotX, x1 = x0 + layout.plotW;
    for (var w = 0; w < WAVES.length; w++) {
      var W = WAVES[w];
      var dir = ch.dirs[w % ch.dirs.length];
      var amp = ch.half * W.amp;
      /* 分段落笔：一道整弧只能用一种透明度，而「波光」要的恰恰是密处亮、疏处暗 */
      for (var sx = x0; sx < x1; sx += SEG) {
        var ex = Math.min(x1, sx + SEG);
        var dm = (at(d, (sx - x0) / layout.plotW) + at(d, (ex - x0) / layout.plotW)) / 2;
        ctx.beginPath();
        for (var x = sx; x <= ex; x += 6) {
          var u = (x - x0) / layout.plotW;
          var y = ch.y + dir * amp * (.45 + .55 * at(d, u)) *
                  Math.sin(u * W.freq * Math.PI * 2 + W.speed * phase + w * 1.7);
          if (x === sx) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.globalAlpha = edge((sx + SEG / 2 - x0) / layout.plotW);
        ctx.strokeStyle = PL.alpha(ch.col, W.a * (0.45 + 0.75 * dm));
        ctx.lineWidth = W.lw;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 闪点亮度：sin 取三次方，绝大多数时候近乎看不见，只在浪尖那一瞬亮一下——
   * 「隐隐约约的波光粼粼」就是这个意思。抽成具名函数是为了让它能被单独量：
   * 埋在绘制循环里，测试只能连推若干帧去猜，而那样会把 u 漂移一起量进来。 */
  function glintAlpha(s, phase, dk) {
    var tw = .5 + .5 * Math.sin(phase * s.fr + s.ph);
    return (.06 + .62 * dk) * tw * tw * tw * edge(s.u);
  }

  function drawGlints(ctx, chs, d, layout, pal, phase) {
    var x0 = layout.plotX;
    for (var i = 0; i < glints.length; i++) {
      var s = glints[i];
      var ch = chs[s.lane % chs.length];
      var dir = ch.dirs[(s.di * ch.dirs.length) | 0];
      var a = glintAlpha(s, phase, at(d, s.u));
      if (a < .02) continue;
      var x = x0 + s.u * layout.plotW;
      var y = ch.y + dir * (2 + s.off * ch.half * 1.1);
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = s.warm > .45 ? pal.spark : PL.alpha(ch.crest, .85);
      /* .9px 高（反光层是 1px）：水层门禁靠这一笔宽把两层分开统计，改动要同步 */
      ctx.fillRect(x, y, s.len, .9);
      ctx.globalAlpha = 1;
    }
  }

  /* 流星：一颗光头 + 一条拖向游侧的渐隐尾（粒子顺流右行，尾在左）。 */
  function drawMeteor(ctx, p, x, y, pal, dk, fade) {
    /* 下限 14px 让每段宽 ≥3.5：尾迹是「线」，不该混进按宽度筛出的粒子落点统计。
     * 尾迹严格水平：任何竖直偏移都会把世界轨的尾段抬进两轨之间的死区。 */
    var len = Math.max(14, p.tail * (.55 + .45 * dk));
    var segs = 4, seg = len / segs;
    for (var i = segs - 1; i >= 0; i--) {
      var t = i / segs;
      var tx = Math.max(0, x - seg * (i + 1));
      ctx.globalAlpha = fade * (1 - t) * (1 - t) * .8;
      ctx.fillStyle = i === 0 ? pal.meteorHead : pal.meteorTail;
      ctx.fillRect(tx, y - .5, x - tx, Math.max(.5, 1.7 - t * 1.4));
    }
    ctx.globalAlpha = fade;
    ctx.fillStyle = pal.meteorHead;
    ctx.beginPath();
    ctx.arc(x, y, 1.1 + p.r * .45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawParts(ctx, chs, d, layout, pal, dt, phase) {
    var x0 = layout.plotX;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var ch = chs[p.lane % chs.length];
      var dir = ch.dirs[(p.di * ch.dirs.length) | 0];
      p.u += p.sp * dt;
      if (p.u > 1) p.u -= 1;
      var dk = at(d, p.u);
      var a = p.a * edge(p.u) * (.38 + .62 * dk);
      if (a <= .02) continue;
      var x = x0 + p.u * layout.plotW;
      var y = ch.y + dir * (1.5 + p.v * ch.half * 2.1) +
              Math.sin(p.u * 26 + p.ph + phase * .7) * p.amp;
      if (p.meteor) { drawMeteor(ctx, p, x, y, pal, dk, Math.min(1, a * 1.35)); continue; }
      var col = pal.flowDust;
      if (p.tint > .88) col = PL.alpha(ch.col, .9);
      else if (p.tint > .8) col = PL.alpha(pal.selectGlow, .9);
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      if (p.glint) {
        ctx.fillRect(x - 9, y - .5, 9, 1);
        ctx.beginPath(); ctx.arc(x, y, p.r * 1.3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(x - p.r / 2, y - p.r / 2, p.r, p.r);
      }
      ctx.globalAlpha = 1;
    }
  }

  /* env: {layout, vp, pal, st, evs, now, freeze} */
  function draw(ctx, env) {
    var layout = env.layout, st = env.st;
    var dt = 0;
    if (!env.freeze) {
      dt = lastNow ? Math.min(.05, (env.now - lastNow) / 1000) : 0;
      flowPhase += dt * 1.6;
    }
    lastNow = env.now;
    if (!parts.length || Math.abs(layout.plotW - plotW) > 1) rebuild(layout.plotW);
    var chs = channels(layout, st);
    if (!chs.length) return;
    var d = densityOf(env.evs, layout, env.vp);

    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.plotX, 0, layout.plotW, layout.H);
    ctx.clip();
    for (var i = 0; i < chs.length; i++) drawRiver(ctx, chs[i], d, layout, env.pal);
    for (var j = 0; j < chs.length; j++) drawShimmer(ctx, chs[j], d, layout, flowPhase);
    drawGlints(ctx, chs, d, layout, env.pal, flowPhase);
    drawParts(ctx, chs, d, layout, env.pal, dt, flowPhase);
    ctx.restore();
  }

  window.ChronFlow = {
    draw: draw, rebuild: rebuild, densityOf: densityOf, glintAlpha: glintAlpha,
    get parts() { return parts; },
    get glints() { return glints; },
    reset: function () { lastNow = 0; flowPhase = 0; }
  };
})();
