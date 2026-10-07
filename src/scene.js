// Night hallway scene. Canvas 2D only, no DOM, so it can be rendered in Node for previews.
(function (root) {
  'use strict';

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  var COL = {
    ink: '#080c1a', ceil: '#0a0f20', wall: '#19223f', wallFar: '#101830', floor: '#0e152b',
    seam: '#27335c', moon: '#d2e4ff', sky: '#6f8fd0', lamp: '#ffc07a', curtain: '#2b3163',
    door: '#0c1224', shadow: '#03050c', pants: '#6a7eb6', slip: '#d9a77a', top: '#a3b7e8', skin: '#ecd0b8', hair: '#1c2135',
    blanket: '#3b4b8a', mattress: '#232d55', pillow: '#b4c2e6', heart: '#ff9c80'
  };

  // Where the story is, for a progress value P (0..1 of the bars).
  function secParams(P) {
    var t, face = 0;
    if (P < 0.222) t = 0.5 * (P / 0.222);
    else if (P < 0.444) t = 0.5 + 0.35 * ((P - 0.222) / 0.222);
    else if (P < 0.667) t = 0.85 + 0.15 * ((P - 0.444) / 0.223);
    else if (P < 0.722) t = 1;
    else if (P < 0.889) t = 1 - 0.75 * ((P - 0.722) / 0.167);
    else t = 0.25;
    if (P >= 0.722) face = 1; else if (P > 0.667) face = (P - 0.667) / 0.055;
    var fear = P < 0.444 ? 0 : P < 0.667 ? smooth((P - 0.444) / 0.2) : P < 0.69 ? 1 - smooth((P - 0.667) / 0.023) : 0;
    var breezeBase = smooth((P - 0.2) / 0.04) * (1 - smooth((P - 0.46) / 0.04));
    return { t: t, face: face, fear: fear, bed: smooth((P - 0.86) / 0.07), breezeBase: breezeBase, synced: P >= 0.667 };
  }
  function dynAt(P) {
    if (P < 0.444) return 0.38;
    if (P < 0.667) return 0.55 + 0.45 * smooth((P - 0.444) / 0.2);
    if (P < 0.889) return 0.38;
    return 0.18;
  }
  var SECTIONS = [
    { at: 0, line: '半夜醒了，家里好安静。踮起脚，慢慢走。', hint: 'p 很轻，像踮着脚走路' },
    { at: 0.222, line: '月光照进走廊，窗帘好像动了一下。', hint: 'p 保持轻，连着弹' },
    { at: 0.444, line: '咚咚，咚咚……心跳变快了，影子越来越大。', hint: '从 mp 慢慢变大，到 f 最紧张' },
    { at: 0.667, line: '咦？原来是自己的影子。', hint: 'p 突然变轻，松一口气' },
    { at: 0.722, line: '放松了，慢慢走回房间。', hint: 'p 越来越慢' },
    { at: 0.889, line: '钻进被窝，闭上眼睛。晚安。', hint: 'pp 最后的和弦，让声音自己消失' }
  ];
  function sectionIndex(P) {
    var i, k = 0;
    for (i = 0; i < SECTIONS.length; i++) if (P >= SECTIONS[i].at - 1e-9) k = i;
    return k;
  }

  function create(ctx, colors) {
    var C = {}, k;
    for (k in COL) C[k] = (colors && colors[k]) || COL[k];
    var W = 0, H = 0, G = null, r = rng(11);
    var tCur = 0, breeze = 0, feet = [], rings = [], lastRing = 0, motes = [];

    function resize(w, h) {
      W = w; H = h;
      var vx = W * 0.56, vy = H * 0.43, fw = Math.min(W * 0.34, H * 0.2), fh = fw * 1.25;
      G = { vx: vx, vy: vy, L: vx - fw / 2, R: vx + fw / 2, T: vy - fh * 0.6, B: vy + fh * 0.4 };
      motes = [];
      for (var i = 0; i < 34; i++) motes.push({ x: r(), y: r(), s: 0.4 + r() * 1.2, v: 0.01 + r() * 0.03, p: r() * 6.28 });
    }
    function wl(u, v) { // point on the left wall: u 0 near .. 1 far, v 0 floor .. 1 ceiling
      var x = lerp(0, G.L, u);
      return { x: x, y: lerp(lerp(H, 0, v), lerp(G.B, G.T, v), u) };
    }
    function ground(t) {
      var tp = Math.pow(clamp(t, 0, 1), 0.8);
      return { x: lerp(W * 0.5, G.vx, tp), y: lerp(H * 0.97, G.B + (H - G.B) * 0.05, tp), s: lerp(1, 0.26, tp), tp: tp };
    }

    // ---- walking: every note is a footfall. The other foot lifts slowly while the note rings and hovers
    // until the next note, then lands. A long note makes him stop and listen.
    var lastPose = null, landSide = 1, noteT = -100, ivl = 0.75, fromS = { landD: 0, landH: 0, airD: 0 };
    var curK = { d: 6 }, curFront = false, puffs = [], ripples = [];

    function kParams(f) {
      var rel = { d: 7, L: 5.5, heel: 0, crouch: 0.6 };
      var sn = { d: 5.5, L: 9, heel: 3.4, crouch: 3.2 };
      var fr = { d: 5, L: 6.5, heel: 3.6, crouch: 5.8 };
      var o = {}, k;
      for (k in rel) o[k] = lerp(rel[k], lerp(sn[k], fr[k], f.fear), f.sneak);
      return o;
    }

    // all lengths in u = 1/100 of the boy's height
    function makePose(e, side, iv, fr, f, time) {
      var K = kParams(f);
      var riseT = clamp(iv * 0.85, 0.28, 1.0);
      var rise = smooth(e / riseT), ls = smooth((e - 1.5) / 0.7), la = smooth(e / 0.07);
      var imp = Math.exp(-e * 10) * (0.5 + f.inten);
      var pl = { side: side, h: lerp(fr.landH, 0, la), heel: K.heel * (1 - 0.5 * ls) };
      pl.d = lerp(fr.landD, lerp(-K.d, K.d, smooth(e / (1.25 * iv))) * (1 - ls), la);
      var air = { side: -side, heel: K.heel * 0.5 * ls };
      air.d = lerp(fr.airD, -0.8 * K.d, rise) * (1 - ls);
      air.h = K.L * smooth(e / (0.5 * riseT)) * (1 - ls);
      var hunch = clamp(0.25 * f.sneak + 0.75 * f.fear + 0.25 * f.sleepy - 0.45 * f.relief, -0.5, 1);
      var turn = f.sneak * 0.7 * Math.sin(time * 0.6 + 0.5) + f.fear * 1.2 * Math.sin(time * 2.3) * Math.sin(time * 0.9 + 1);
      turn = clamp(lerp(turn, 0.95, f.relief), -1, 1);
      return {
        K: K, legs: [pl, air], hunch: hunch, turn: turn, imp: imp, ls: ls,
        lift: air.h / K.L,
        hipDrop: K.crouch + 2.4 * imp - 1.2 * rise * (1 - ls),
        bodyX: side * 3.4 * smooth(e / 0.25) * (1 - 0.6 * ls),
        tilt: side * 0.05 * smooth(e / 0.25) * (1 - 0.6 * ls),
        tremble: f.fear * (0.35 + 0.65 * f.inten) * Math.sin(time * 43),
        breathe: Math.sin(time * (2 + 4 * f.fear)) * (0.012 + 0.012 * f.fear),
        f: f
      };
    }

    // two-bone IK; returns the middle joint, bending towards the outside of the body
    function ik(hx, hy, tx, ty, l1, l2, s) {
      var dx = tx - hx, dy = ty - hy, d = Math.sqrt(dx * dx + dy * dy), mx = l1 + l2 - 0.01;
      if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; tx = hx + dx; ty = hy + dy; }
      if (d < 0.001) d = 0.001;
      var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      var ux = dx / d, uy = dy / d;
      return { kx: hx + ux * a - uy * s * hh, ky: hy + uy * a + ux * s * hh, ex: tx, ey: ty };
    }
    function oval(c, x, y, rx, ry, rot) {
      c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(1, ry / rx); c.beginPath(); c.arc(0, 0, rx, 0, 6.2832); c.restore(); c.fill();
    }

    function drawBoy(c, x, y, h, o) {
      var u = h / 100, p = o.pose, f = p.f, ds = o.front ? -1 : 1, j, side, leg, q, a;
      c.save();
      c.translate(x, y);
      c.scale(o.sx === undefined ? 1 : o.sx, 1);
      c.lineCap = 'round'; c.lineJoin = 'round';
      var hipY = (-38 + p.hipDrop) * u;
      // foot shadows on the floor
      if (!o.flat) {
        c.fillStyle = 'rgba(3,5,12,0.5)';
        for (j = 0; j < 2; j++) {
          leg = p.legs[j];
          c.globalAlpha = 0.9 * (1 - 0.6 * Math.min(1, leg.h / 8));
          oval(c, leg.side * 6.5 * u, leg.d * 0.55 * u * ds, 6 * u * (1 - 0.15 * Math.min(1, leg.h / 8)), 1.8 * u);
        }
        c.globalAlpha = 1;
      }
      // legs
      for (j = 0; j < 2; j++) {
        leg = p.legs[j]; side = leg.side;
        var lf = leg.h / p.K.L, fx = side * (6.5 + 1.2 * (isFinite(lf) ? lf : 0)) * u, gy = leg.d * 0.55 * u * ds;
        var hx = side * 6 * u + p.bodyX * u;
        q = ik(hx, hipY, fx, gy - (2.6 + leg.h + leg.heel) * u, 19 * u, 19.5 * u, -side);
        // seen from the front or back the knee mostly bends towards or away from us, so only a little shows sideways
        q.kx = (hx + q.ex) / 2 + (q.kx - (hx + q.ex) / 2) * 0.28; q.ky = (hipY + q.ey) / 2 + (q.ky - (hipY + q.ey) / 2) * 0.35;
        c.strokeStyle = o.pants; c.lineWidth = 9.5 * u;
        c.beginPath(); c.moveTo(hx, hipY); c.lineTo(q.kx, q.ky); c.stroke();
        c.lineWidth = 8.2 * u;
        c.beginPath(); c.moveTo(q.kx, q.ky); c.lineTo(q.ex, q.ey); c.stroke();
        if (!o.flat) {
          c.fillStyle = o.slip;
          if (leg.heel > 0.5) oval(c, fx, gy - (leg.h + 1.4 + leg.heel * 0.45) * u, 4.6 * u, 3.3 * u);
          else oval(c, fx, gy - (leg.h + 1.7) * u, 5.7 * u, 2.9 * u);
        }
      }
      // upper body: moves with the weight shift, leans, breathes
      c.save();
      c.translate(p.bodyX * u + p.tremble * 0.5 * u, p.hipDrop * u);
      c.translate(0, -38 * u); c.rotate(p.tilt); c.scale(1, 1 + p.breathe); c.translate(0, 38 * u);
      var sy = (-70 + p.hunch * 3) * u, sxo = (14 - p.hunch * 1.5) * u;
      c.fillStyle = o.top; rr(c, -15 * u, (-77 + p.hunch * 2.5) * u, 30 * u, (42 - p.hunch * 2.5) * u, 11 * u); c.fill();
      // arms
      var air = p.legs[1];
      for (j = -1; j <= 1; j += 2) {
        var rel = { x: j * 18.5, y: -43 }, sn = { x: j * 25, y: -50 }, fr = { x: j * 8.5, y: -57 }, rf = { x: j * 19.5, y: -41 };
        var tx = lerp(rel.x, lerp(sn.x, fr.x, f.fear), f.sneak), ty = lerp(rel.y, lerp(sn.y, fr.y, f.fear), f.sneak);
        tx = lerp(tx, rf.x, f.relief); ty = lerp(ty, rf.y, f.relief);
        ty += (j === air.side ? 1.2 : -2.0) * p.lift + p.tremble * 0.4;
        a = ik(j * (sxo / u) * u, sy, tx * u, ty * u, 15 * u, 15 * u, -j);
        c.strokeStyle = o.top; c.lineWidth = 7.2 * u;
        c.beginPath(); c.moveTo(j * sxo, sy); c.lineTo(a.kx, a.ky); c.lineTo(a.ex, a.ey); c.stroke();
        c.fillStyle = o.skin;
        c.beginPath(); c.arc(a.ex, a.ey, 4 * u, 0, 6.2832); c.fill();
      }
      // head
      var hy = (-88 + p.hunch * 3.5) * u, tn = p.turn;
      c.fillStyle = o.skin;
      c.beginPath(); c.arc(tn * 1.1 * u, hy, 13 * u, 0, 6.2832); c.fill();
      c.fillStyle = o.hair;
      c.beginPath();
      if (o.front) { c.arc(0, hy - 2 * u, 13.6 * u, Math.PI * 0.96, Math.PI * 2.04); c.closePath(); }
      else c.arc(-tn * 1.3 * u, hy - 1 * u, 13.8 * u, 0, 6.2832);
      c.fill();
      // hair tuft that follows the draught
      c.strokeStyle = o.hair; c.lineWidth = 1.9 * u;
      c.beginPath(); c.moveTo(1 * u, hy - 12.5 * u); c.quadraticCurveTo((3 + (o.tuft || 0) * 5) * u, hy - 18 * u, (5 + (o.tuft || 0) * 9) * u, hy - 17 * u); c.stroke();
      if (o.front && !o.flat) {
        var ex = tn * 2.4 * u, sl = f.sleepy;
        if (f.relief > 0.05 || sl < 0.5) {
          c.fillStyle = o.hair;
          c.beginPath(); c.arc(-4.6 * u + ex, hy + 1 * u, 1.4 * u * (1 - 0.7 * sl), 0, 6.2832); c.fill();
          c.beginPath(); c.arc(4.6 * u + ex, hy + 1 * u, 1.4 * u * (1 - 0.7 * sl), 0, 6.2832); c.fill();
        } else {
          c.strokeStyle = o.hair; c.lineWidth = 1.2 * u;
          c.beginPath(); c.arc(-4.6 * u + ex, hy, 1.8 * u, 0.2, Math.PI - 0.2); c.stroke();
          c.beginPath(); c.arc(4.6 * u + ex, hy, 1.8 * u, 0.2, Math.PI - 0.2); c.stroke();
        }
        c.fillStyle = 'rgba(255,140,130,' + (0.12 + 0.28 * f.relief).toFixed(2) + ')';
        oval(c, -8 * u + ex, hy + 4.5 * u, 2.6 * u, 1.7 * u); oval(c, 8 * u + ex, hy + 4.5 * u, 2.6 * u, 1.7 * u);
        c.strokeStyle = o.hair; c.lineWidth = 1.2 * u;
        c.beginPath(); c.arc(ex, hy + 3.5 * u, (3 + 1.4 * f.relief) * u, 0.25, Math.PI - 0.25); c.stroke();
      }
      c.restore();
      c.restore();
    }

    function drawHall(S, sp, moonI, time) {
      var c = ctx, g, i;
      // ceiling, walls, floor
      c.fillStyle = C.ceil; c.fillRect(0, 0, W, H);
      c.fillStyle = C.ceil;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(G.R, G.T); c.lineTo(G.L, G.T); c.closePath(); c.fill();
      g = c.createLinearGradient(0, 0, G.L, 0); g.addColorStop(0, rgba(C.wall, 0.55)); g.addColorStop(1, C.wall);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(G.L, G.T); c.lineTo(G.L, G.B); c.lineTo(0, H); c.closePath(); c.fill();
      g = c.createLinearGradient(W, 0, G.R, 0); g.addColorStop(0, rgba(C.wall, 0.55)); g.addColorStop(1, C.wall);
      c.fillStyle = g;
      c.beginPath(); c.moveTo(W, 0); c.lineTo(G.R, G.T); c.lineTo(G.R, G.B); c.lineTo(W, H); c.closePath(); c.fill();
      c.fillStyle = C.wallFar; c.fillRect(G.L, G.T, G.R - G.L, G.B - G.T);
      g = c.createLinearGradient(0, G.B, 0, H); g.addColorStop(0, C.floor); g.addColorStop(1, rgba(C.floor, 0.85));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(G.L, G.B); c.lineTo(G.R, G.B); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
      // floor boards
      c.strokeStyle = rgba(C.seam, 0.45); c.lineWidth = 1;
      for (i = -3; i <= 11; i++) {
        var fx = W * (i / 8);
        c.beginPath(); c.moveTo(fx, H); c.lineTo(lerp(G.L, G.R, i / 8), G.B); c.stroke();
      }
      for (i = 1; i <= 6; i++) {
        var fy = lerp(G.B, H, Math.pow(i / 7, 1.9));
        c.beginPath(); c.moveTo(lerp(G.L, 0, (fy - G.B) / (H - G.B)), fy); c.lineTo(lerp(G.R, W, (fy - G.B) / (H - G.B)), fy); c.stroke();
      }
      // far door with a warm crack under it
      var dw = (G.R - G.L) * 0.52, dh = (G.B - G.T) * 0.88, dx = G.vx - dw / 2 + (G.R - G.L) * 0.05, dy = G.B - dh;
      c.fillStyle = C.door; rr(c, dx, dy, dw, dh, 2); c.fill();
      c.strokeStyle = rgba(C.seam, 0.7); c.lineWidth = 1.2; c.strokeRect(dx, dy, dw, dh);
      c.fillStyle = rgba(C.lamp, 0.85); c.beginPath(); c.arc(dx + dw * 0.82, dy + dh * 0.55, Math.max(1.2, dw * 0.04), 0, 6.2832); c.fill();
      var flick = 0.8 + 0.2 * Math.sin(time * 5.3) * sp.fear;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = rgba(C.lamp, 0.75 * flick); c.fillRect(dx + 1, G.B - 2, dw - 2, 2);
      g = c.createLinearGradient(0, G.B, 0, G.B + (H - G.B) * 0.5);
      g.addColorStop(0, rgba(C.lamp, 0.22 * flick)); g.addColorStop(1, rgba(C.lamp, 0));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(dx, G.B); c.lineTo(dx + dw, G.B); c.lineTo(dx + dw + W * 0.12, G.B + (H - G.B) * 0.5); c.lineTo(dx - W * 0.1, G.B + (H - G.B) * 0.5); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';

      // window on the left wall
      var u0 = 0.07, u1 = 0.52, v0 = 0.3, v1 = 0.84;
      var TL = wl(u0, v1), TR = wl(u1, v1), BL = wl(u0, v0), BR = wl(u1, v0);
      c.fillStyle = rgba(C.sky, 0.22 + 0.5 * moonI);
      c.beginPath(); c.moveTo(TL.x, TL.y); c.lineTo(TR.x, TR.y); c.lineTo(BR.x, BR.y); c.lineTo(BL.x, BL.y); c.closePath(); c.fill();
      var wcx = (TL.x + TR.x + BL.x + BR.x) / 4, wcy = (TL.y + TR.y + BL.y + BR.y) / 4;
      var mr = Math.abs(TR.x - TL.x) * 0.2;
      g = c.createRadialGradient(wcx, wcy - mr, 0, wcx, wcy - mr, mr * 5);
      g.addColorStop(0, rgba(C.moon, 0.55 * moonI)); g.addColorStop(1, rgba(C.moon, 0));
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g;
      c.beginPath(); c.moveTo(TL.x, TL.y); c.lineTo(TR.x, TR.y); c.lineTo(BR.x, BR.y); c.lineTo(BL.x, BL.y); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = rgba(C.moon, 0.55 + 0.45 * moonI); c.beginPath(); c.arc(wcx, wcy - mr, mr, 0, 6.2832); c.fill();
      c.strokeStyle = rgba(C.ink, 0.85); c.lineWidth = Math.max(2, W * 0.006);
      c.beginPath(); c.moveTo(TL.x, TL.y); c.lineTo(TR.x, TR.y); c.lineTo(BR.x, BR.y); c.lineTo(BL.x, BL.y); c.closePath(); c.stroke();
      c.lineWidth = Math.max(1.5, W * 0.004);
      c.beginPath(); c.moveTo((TL.x + TR.x) / 2, (TL.y + TR.y) / 2); c.lineTo((BL.x + BR.x) / 2, (BL.y + BR.y) / 2);
      c.moveTo((TL.x + BL.x) / 2, (TL.y + BL.y) / 2); c.lineTo((TR.x + BR.x) / 2, (TR.y + BR.y) / 2); c.stroke();

      // curtains
      var amp = (2 + 7 * sp.breezeBase + 24 * breeze) * (H / 800);
      function curtain(x0, x1, top, bot, dir) {
        var n = 14, j, y, p, pts = [];
        c.beginPath();
        for (j = 0; j <= n; j++) {
          y = lerp(top, bot, j / n); p = j / n;
          pts.push({ y: y, o: Math.sin(y * 0.012 + time * 1.5 + dir) * amp * p });
        }
        c.moveTo(x0 + pts[0].o, pts[0].y);
        for (j = 1; j <= n; j++) c.lineTo(x0 + pts[j].o, pts[j].y);
        for (j = n; j >= 0; j--) c.lineTo(x1 + pts[j].o * 1.15, pts[j].y);
        c.closePath();
        c.fillStyle = C.curtain; c.fill();
        c.strokeStyle = rgba(C.moon, 0.05 + 0.1 * moonI); c.lineWidth = 1.2;
        for (j = 1; j < 4; j++) {
          c.beginPath();
          for (var q = 0; q <= n; q++) {
            var xx = lerp(x0, x1, j / 4) + pts[q].o * (1 + j * 0.05);
            if (q === 0) c.moveTo(xx, pts[q].y); else c.lineTo(xx, pts[q].y);
          }
          c.stroke();
        }
      }
      var wTop = Math.min(TL.y, TR.y) - H * 0.025, wBot = Math.max(BL.y, BR.y) + H * 0.07;
      curtain(TL.x - W * 0.01, TL.x + (TR.x - TL.x) * 0.26, wTop, wBot, 0);
      curtain(TR.x - (TR.x - TL.x) * 0.26, TR.x + W * 0.02, wTop, wBot, 2);

      // moon beam and light pool on the floor
      c.globalCompositeOperation = 'lighter';
      g = c.createLinearGradient(0, BL.y, 0, H);
      g.addColorStop(0, rgba(C.moon, 0.02)); g.addColorStop(1, rgba(C.moon, 0.22 * moonI));
      c.fillStyle = g;
      c.beginPath(); c.moveTo(BL.x, BL.y); c.lineTo(BR.x, BR.y); c.lineTo(W * 0.78, H); c.lineTo(W * 0.12, H); c.closePath(); c.fill();
      var px = W * 0.4, py = lerp(G.B, H, 0.78);
      g = c.createRadialGradient(px, py, 0, px, py, W * 0.4);
      g.addColorStop(0, rgba(C.moon, 0.2 * moonI)); g.addColorStop(1, rgba(C.moon, 0));
      c.save(); c.translate(px, py); c.scale(1, 0.32); c.translate(-px, -py);
      c.fillStyle = g; c.beginPath(); c.arc(px, py, W * 0.4, 0, 6.2832); c.fill(); c.restore();
      // dust in the beam
      for (i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y += m.v * 0.016; m.x += Math.sin(time * 0.6 + m.p) * 0.0004;
        if (m.y > 1) { m.y = 0; m.x = r(); }
        var mx = lerp(BL.x, W * 0.12, m.y) + (lerp(BR.x, W * 0.78, m.y) - lerp(BL.x, W * 0.12, m.y)) * m.x;
        var my = lerp(BL.y, H, m.y);
        c.fillStyle = rgba(C.moon, (0.15 + 0.5 * (0.5 + 0.5 * Math.sin(time * 1.4 + m.p))) * moonI);
        c.beginPath(); c.arc(mx, my, m.s * (H / 800) + 0.4, 0, 6.2832); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }

    function drawBedroom(S, alpha, moonI, time) {
      var c = ctx, g, age = S.finaleAge;
      c.save(); c.globalAlpha = alpha;
      g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.ceil); g.addColorStop(1, C.wallFar);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // window with moon and stars
      var wx = W * 0.58, wy = H * 0.12, ww = W * 0.3, wh = H * 0.26;
      var mi = clamp(moonI, 0.15, 1) * (age >= 0 ? 0.55 + 0.45 * Math.exp(-age / 9) : 1);
      c.fillStyle = rgba(C.sky, 0.28 + 0.3 * mi); rr(c, wx, wy, ww, wh, 6); c.fill();
      for (var i = 0; i < 14; i++) {
        var sx = wx + ww * (0.08 + 0.84 * ((i * 0.381) % 1)), sy = wy + wh * (0.08 + 0.7 * ((i * 0.613) % 1));
        c.fillStyle = rgba(C.moon, 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(time * 1.3 + i * 2)));
        c.fillRect(sx, sy, 1.8, 1.8);
      }
      c.fillStyle = rgba(C.moon, 0.7 * mi + 0.2); c.beginPath(); c.arc(wx + ww * 0.7, wy + wh * 0.3, ww * 0.1, 0, 6.2832); c.fill();
      c.strokeStyle = rgba(C.ink, 0.9); c.lineWidth = Math.max(2, W * 0.007); rr(c, wx, wy, ww, wh, 6); c.stroke();
      c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.moveTo(wx, wy + wh / 2); c.lineTo(wx + ww, wy + wh / 2); c.stroke();
      c.globalCompositeOperation = 'lighter';
      g = c.createLinearGradient(wx, wy + wh, W * 0.3, H);
      g.addColorStop(0, rgba(C.moon, 0.16 * mi)); g.addColorStop(1, rgba(C.moon, 0));
      c.fillStyle = g; c.beginPath(); c.moveTo(wx, wy + wh); c.lineTo(wx + ww, wy + wh); c.lineTo(W * 0.62, H); c.lineTo(W * 0.1, H); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
      // bed
      var bx = W * 0.5, by = H * 0.8;
      c.fillStyle = C.mattress; rr(c, W * 0.22, by - H * 0.05, W * 0.74, H * 0.14, 16); c.fill();
      c.fillStyle = C.pillow; c.beginPath(); c.ellipse(W * 0.36, by - H * 0.05, W * 0.12, H * 0.03, 0, 0, 6.2832); c.fill();
      var hx = W * 0.35, hy = by - H * 0.085, hr = W * 0.055;
      c.fillStyle = C.skin; c.beginPath(); c.arc(hx, hy, hr, 0, 6.2832); c.fill();
      c.fillStyle = C.hair; c.beginPath(); c.arc(hx, hy - hr * 0.1, hr * 1.04, Math.PI * 0.95, Math.PI * 2.08); c.closePath(); c.fill();
      c.strokeStyle = C.hair; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath(); c.arc(hx - hr * 0.35, hy + hr * 0.1, hr * 0.14, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.arc(hx + hr * 0.35, hy + hr * 0.1, hr * 0.14, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = C.blanket; rr(c, W * 0.44, by - H * 0.065, W * 0.54, H * 0.13, 14); c.fill();
      c.strokeStyle = rgba(C.moon, 0.14); c.lineWidth = 2;
      c.beginPath(); c.moveTo(W * 0.47, by - H * 0.045); c.quadraticCurveTo(W * 0.7, by - H * 0.075, W * 0.95, by - H * 0.04); c.stroke();
      // nightstand lamp, fading after the last chord
      var lampI = age < 0 ? 0.55 : 0.55 * Math.exp(-age / 3.2);
      var lx = W * 0.1, ly = by - H * 0.1;
      c.fillStyle = C.mattress; rr(c, lx - W * 0.07, ly + H * 0.035, W * 0.14, H * 0.12, 4); c.fill();
      c.fillStyle = rgba(C.lamp, 0.35 + 0.65 * lampI);
      c.beginPath(); c.moveTo(lx - W * 0.035, ly + H * 0.035); c.lineTo(lx + W * 0.035, ly + H * 0.035); c.lineTo(lx + W * 0.02, ly - H * 0.015); c.lineTo(lx - W * 0.02, ly - H * 0.015); c.closePath(); c.fill();
      c.globalCompositeOperation = 'lighter';
      g = c.createRadialGradient(lx, ly, 0, lx, ly, W * 0.55);
      g.addColorStop(0, rgba(C.lamp, 0.5 * lampI)); g.addColorStop(1, rgba(C.lamp, 0));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      if (age > 1.5) {
        c.fillStyle = rgba(C.moon, 0.55 * smooth((age - 1.5) / 2));
        c.font = 'italic ' + Math.round(H * 0.026) + 'px serif';
        for (i = 0; i < 3; i++) {
          var za = (time * 0.35 + i * 0.33) % 1;
          c.globalAlpha = alpha * Math.sin(za * Math.PI) * smooth((age - 1.5) / 2);
          c.fillText('z', hx + hr * 1.3 + za * W * 0.07 + i * 5, hy - hr * 1.2 - za * H * 0.08);
        }
      }
      c.restore();
    }

    function draw(S, dt) {
      var c = ctx, time = S.time, P = clamp(S.P, 0, 1), sp = secParams(P), i;
      dt = clamp(dt, 0.001, 0.1);
      feetNow = S.time;
      tCur += (sp.t - tCur) * Math.min(1, dt * 2.5);
      breeze *= Math.exp(-dt * 1.4);
      var inten = clamp(S.inten, 0, 1);
      var fac = {
        sneak: 1 - smooth((P - 0.667) / 0.05), fear: sp.fear, inten: inten,
        relief: smooth((P - 0.667) / 0.01) * (1 - smooth((P - 0.7) / 0.03)),
        sleepy: smooth((P - 0.78) / 0.1)
      };
      var pose = makePose(time - noteT, landSide, ivl, fromS, fac, time);
      lastPose = pose; curK = pose.K;
      var moonI = clamp(0.2 + 0.62 * inten, 0, 1);
      if (S.finaleAge >= 0) moonI *= 0.45 + 0.55 * Math.exp(-S.finaleAge / 8);
      var hallA = 1 - 0.94 * sp.bed;
      c.setTransform(S.dpr || 1, 0, 0, S.dpr || 1, 0, 0);
      c.clearRect(0, 0, W, H);

      c.save(); c.globalAlpha = hallA;
      drawHall(S, sp, moonI, time);

      // footprints
      var now = time;
      for (i = feet.length - 1; i >= 0; i--) {
        var f = feet[i], age = now - f.born;
        if (age > 2.4) { feet.splice(i, 1); continue; }
        var fa = Math.exp(-age / 1.1) * 0.6;
        var fg = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.s);
        fg.addColorStop(0, rgba(C.moon, fa)); fg.addColorStop(1, rgba(C.moon, 0));
        c.save(); c.translate(f.x, f.y); c.scale(1, 0.35); c.translate(-f.x, -f.y);
        c.fillStyle = fg; c.beginPath(); c.arc(f.x, f.y, f.s, 0, 6.2832); c.fill(); c.restore();
      }

      for (i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i], ra2 = (now - rp.born) / 0.85;
        if (ra2 >= 1) { ripples.splice(i, 1); continue; }
        c.save(); c.translate(rp.x, rp.y); c.scale(1, 0.3);
        c.strokeStyle = rgba(C.moon, (1 - ra2) * rp.a); c.lineWidth = 2.2 * (1 - ra2) + 0.6;
        c.beginPath(); c.arc(0, 0, rp.s * (0.25 + ra2), 0, 6.2832); c.stroke(); c.restore();
      }
      for (i = puffs.length - 1; i >= 0; i--) {
        var pf = puffs[i], pa = (now - pf.born) / 0.8;
        if (pa >= 1) { puffs.splice(i, 1); continue; }
        c.fillStyle = rgba(C.moon, (1 - pa) * pf.a);
        c.beginPath(); c.arc(pf.x + pf.vx * pa, pf.y + pf.vy * pa, pf.r * (1 + pa), 0, 6.2832); c.fill();
      }

      var gp = ground(tCur), hpx = H * 0.36 * gp.s;
      var sx = Math.max(0.15, Math.abs(Math.cos(sp.face * Math.PI)));
      var front = sp.face > 0.5; curFront = front;
      var swayX = Math.sin(time * 0.9) * 2 * gp.s;

      // shadow on the right wall
      var ds = 0.5;
      var wallX = lerp(W, G.R, ds), wallY = lerp(H, G.B, ds), wallTop = lerp(0, G.T, ds);
      var avail = wallY - wallTop;
      var slope = (H - G.B) / (W - G.R);
      c.save(); c.globalAlpha = hallA; c.globalCompositeOperation = 'lighter';
      var rg0 = c.createRadialGradient(wallX, wallY - avail * 0.45, 0, wallX, wallY - avail * 0.45, W * 0.42);
      rg0.addColorStop(0, rgba(C.sky, 0.2 * moonI + 0.12 * sp.fear)); rg0.addColorStop(1, rgba(C.sky, 0));
      c.fillStyle = rg0;
      c.beginPath(); c.moveTo(W, 0); c.lineTo(G.R, G.T); c.lineTo(G.R, G.B); c.lineTo(W, H); c.closePath(); c.fill();
      c.restore();
      var shH = lerp(Math.min(avail * 0.4, H * 0.3), avail * 0.92, sp.fear * (0.55 + 0.45 * inten));
      var shPose = pose;
      if (!sp.synced) {
        var cyc = time * 1.15 + 0.4, fe = cyc % 0.62;
        shPose = makePose(fe, (Math.floor(cyc / 0.62) % 2) ? 1 : -1, 0.62, { landD: 0, landH: 0, airD: 0 },
          { sneak: 1, fear: Math.max(sp.fear, 0.7), relief: 0, sleepy: 0, inten: inten }, time * 1.3);
      }
      var sa = 0.22 + 0.5 * sp.fear;
      for (i = 0; i < 3; i++) {
        c.save();
        c.translate(wallX, wallY);
        c.transform(1, slope * 0.22, 0, 1, 0, 0);
        c.scale(0.85, 1);
        c.globalAlpha = hallA * sa * (i === 0 ? 0.55 : 0.3);
        drawBoy(c, 0, 0, shH * (1 + i * 0.03), { pose: shPose, tuft: breeze, sx: 1, pants: C.shadow, top: C.shadow, skin: C.shadow, hair: C.shadow, front: false, flat: true });
        c.restore();
      }

      // the boy
      var bx = gp.x + swayX, by = gp.y;
      c.fillStyle = rgba(C.ink, 0.28);
      c.save(); c.translate(bx, by); c.scale(1, 0.25);
      c.beginPath(); c.arc(0, 0, hpx * 0.17, 0, 6.2832); c.fill(); c.restore();
      drawBoy(c, bx, by, hpx, { pose: pose, tuft: breeze, sx: sx, pants: C.pants, top: C.top, skin: C.skin, hair: C.hair, slip: C.slip, front: front });

      // heartbeat rings in the scary part
      if (sp.fear > 0.15) {
        var period = lerp(1.05, 0.42, inten);
        if (now - lastRing > period) { lastRing = now; rings.push({ born: now, x: bx, y: by - hpx * 0.58 }); }
      }
      for (i = rings.length - 1; i >= 0; i--) {
        var rg = rings[i], ra = (now - rg.born) / 0.95;
        if (ra >= 1) { rings.splice(i, 1); continue; }
        c.strokeStyle = rgba(C.heart, (1 - ra) * 0.5 * Math.max(0.3, sp.fear));
        c.lineWidth = 2 + 3 * (1 - ra);
        c.beginPath(); c.arc(rg.x, rg.y, hpx * (0.2 + ra * 0.9), 0, 6.2832); c.stroke();
      }

      // vignette; darker and tighter when afraid
      var vg = c.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.3, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      vg.addColorStop(0, rgba(C.ink, 0)); vg.addColorStop(1, rgba(C.ink, 0.62 - 0.22 * moonI + 0.12 * sp.fear));
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
      c.restore();

      if (sp.bed > 0.005) drawBedroom(S, sp.bed, moonI, time);
    }

    return {
      resize: resize,
      draw: draw,
      note: function () {
        if (feetNow - noteT < 0.09) return;
        breeze = Math.min(1, breeze + 0.3);
        if (lastPose) fromS = { landD: lastPose.legs[1].d, landH: lastPose.legs[1].h, airD: lastPose.legs[0].d };
        landSide = -landSide;
        var dtN = feetNow - noteT;
        if (dtN < 2.5) ivl = clamp(ivl * 0.6 + dtN * 0.4, 0.25, 1.2);
        noteT = feetNow;
        if (!G) return;
        var gp = ground(tCur), hpx = H * 0.36 * gp.s, u = hpx / 100, lf = lastPose ? lastPose.f : { fear: 0, inten: 0.3 };
        var fx = gp.x + landSide * 6.5 * u, fy = gp.y + curK.d * -0.55 * u * (curFront ? -1 : 1);
        var loud = 0.45 + 0.9 * lf.inten;
        feet.push({ x: fx, y: fy - 1, s: Math.max(6, hpx * 0.1), born: feetNow });
        if (feet.length > 20) feet.shift();
        ripples.push({ x: fx, y: fy, s: hpx * 0.32 * loud, a: 0.14 + 0.3 * lf.inten, born: feetNow });
        for (var k2 = 0; k2 < 5; k2++) {
          puffs.push({ x: fx + (r() - 0.5) * 5 * u, y: fy - u, vx: (r() - 0.5) * 22 * u * loud, vy: -(5 + r() * 12) * u * loud, r: (0.7 + r() * 1.1) * u, a: 0.16 + 0.22 * lf.inten, born: feetNow });
        }
        if (puffs.length > 60) puffs.splice(0, puffs.length - 60);
        if (ripples.length > 8) ripples.shift();
      },
      setClock: function (t) { feetNow = t; },
      reset: function () { tCur = 0; feet.length = 0; rings.length = 0; puffs.length = 0; ripples.length = 0; breeze = 0; noteT = -100; landSide = 1; ivl = 0.75; lastPose = null; fromS = { landD: 0, landH: 0, airD: 0 }; }
    };
  }
  var feetNow = 0;

  var api = { create: create, secParams: secParams, dynAt: dynAt, sectionIndex: sectionIndex, SECTIONS: SECTIONS, smooth: smooth, clamp: clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NightScene = api;
})(typeof window !== 'undefined' ? window : this);
