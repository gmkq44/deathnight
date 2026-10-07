// Pure logic: score parsing, onset detection, pitch-class detection, score following.
// No DOM access, so it can be tested in Node.
(function (root) {
  'use strict';

  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // ---------------------------------------------------------------- score
  // Text format: note letters separated by spaces, bars separated by | or a new line.
  // '#' sharp, 'b' flat (after an UPPERCASE letter), ':n' beats (default 1).
  // A rest (no sound) is written 0 or R, also with ':n' beats, e.g. 0:1.
  function parseScore(text) {
    var s = String(text || '').replace(/[＃♯]/g, '#').replace(/♭/g, 'b').replace(/｜/g, '|').replace(/０/g, '0');
    var events = [], tokens = [], bar = 1, barHasNote = false, i = 0, m, beats;
    function readBeats() {
      var bt = 1;
      if (s.charAt(i) === ':') {
        m = /^:(\d+(?:\.\d+)?)/.exec(s.slice(i));
        if (m) { bt = parseFloat(m[1]); i += m[0].length; } else { i++; }
      }
      return bt > 0 ? bt : 1;
    }
    while (i < s.length) {
      var ch = s.charAt(i);
      if (ch === '|' || ch === '\n') {
        if (barHasNote) { bar++; barHasNote = false; }
        i++;
        continue;
      }
      if (ch === '0' || ch === 'R' || ch === 'r') {
        i++;
        beats = readBeats();
        tokens.push({ rest: true, beats: beats, bar: bar });
        barHasNote = true;
        continue;
      }
      if (/[A-Ga-g]/.test(ch)) {
        var upper = ch === ch.toUpperCase();
        var pc = PC[ch.toUpperCase()];
        i++;
        var acc = 0;
        if (s.charAt(i) === '#') { acc = 1; i++; }
        else if (s.charAt(i) === 'b' && upper) { acc = -1; i++; }
        beats = readBeats();
        var ev = { pc: (((pc + acc) % 12) + 12) % 12, beats: beats, bar: bar };
        events.push(ev); tokens.push(ev);
        barHasNote = true;
        continue;
      }
      i++;
    }
    var bars = tokens.length ? tokens[tokens.length - 1].bar : 0;
    var barBeats = [], barFirst = [], barStart = [], t = 0, b, k;
    for (b = 1; b <= bars; b++) { barBeats[b] = 0; barFirst[b] = -1; }
    for (k = 0; k < tokens.length; k++) {
      var tk = tokens[k];
      tk.start = t;
      t += tk.beats;
      barBeats[tk.bar] += tk.beats;
      if (barStart[tk.bar] === undefined) barStart[tk.bar] = tk.start;
    }
    for (k = 0; k < events.length; k++) {
      var e = events[k];
      e.beatInBar = e.start - barStart[e.bar];
      if (barFirst[e.bar] < 0) barFirst[e.bar] = k;
    }
    return { events: events, bars: bars, totalBeats: t, barBeats: barBeats, barFirst: barFirst };
  }

  // Position in the piece as a bar number with fraction, 0-based: 0 = start of bar 1.
  function barPosOf(score, idx) {
    if (!score || idx < 0) return 0;
    var e = score.events[idx];
    var bb = score.barBeats[e.bar] || 1;
    return (e.bar - 1) + Math.min(0.999, e.beatInBar / bb);
  }

  // ------------------------------------------------------- onset detector
  // Spectral-flux onset detector. push() takes linear magnitudes of one frame.
  function createOnsetDetector(opt) {
    opt = opt || {};
    var lo = opt.loHz || 120, hi = opt.hiHz || 1800;
    var minGap = opt.minGap || 0.12;
    var absMin = opt.absMin || 6;
    var ratio = opt.ratio || 2.6;
    var scale = opt.scale || 2000;
    var prev = null, f1 = 0, f2 = 0, lastOn = -10;
    var avg = 0, n = 0;
    function reset() { prev = null; f1 = f2 = 0; lastOn = -10; avg = 0; n = 0; }
    // returns the time of the onset (frame time) or -1
    function push(mag, binHz, t) {
      var a = Math.max(1, Math.floor(lo / binHz)), z = Math.min(mag.length - 1, Math.ceil(hi / binHz));
      var flux = 0, i, c;
      if (prev === null || prev.length !== mag.length) prev = new Float32Array(mag.length);
      for (i = a; i <= z; i++) {
        c = Math.log(1 + mag[i] * scale);
        var d = c - prev[i];
        if (d > 0) flux += d;
        prev[i] = c;
      }
      // peak picking with one frame delay
      var out = -1;
      var thr = Math.max(absMin, ratio * avg);
      if (f1 > thr && f1 >= f2 && f1 > flux && (t - lastOn) > minGap) {
        out = t;
        lastOn = t;
      }
      // running mean of flux (slow), not updated by onset frames so it stays a noise level
      if (flux < Math.max(absMin, ratio * avg)) {
        avg = n < 20 ? (avg * n + flux) / (n + 1) : avg * 0.97 + flux * 0.03;
        n++;
      }
      f2 = f1; f1 = flux;
      return out;
    }
    return { push: push, reset: reset };
  }

  // -------------------------------------------------- pitch-class detector
  var HW = [1, 0.7, 0.5, 0.35, 0.25];
  function peakNear(mag, x) {
    var c = Math.round(x), best = 0, k;
    for (k = c - 1; k <= c + 1; k++) if (k > 0 && k < mag.length && mag[k] > best) best = mag[k];
    return best;
  }
  // mag: linear magnitudes, binHz: Hz per bin. Returns {midi, pc, dev, conf} or null.
  function detectPitch(mag, binHz, opt) {
    opt = opt || {};
    var tune = opt.tune || 0, minM = opt.minMidi || 58, maxM = opt.maxMidi || 84;
    var best = -1, bestS = 0, sum = 0, cnt = 0, m, h, s, f0, f;
    for (m = minM; m <= maxM; m++) {
      f0 = 440 * Math.pow(2, (m - 69 + tune) / 12);
      s = 0;
      for (h = 1; h <= HW.length; h++) {
        f = f0 * h;
        if (f / binHz > mag.length - 3) break;
        s += HW[h - 1] * peakNear(mag, f / binHz);
      }
      sum += s; cnt++;
      if (s > bestS) { bestS = s; best = m; }
    }
    if (best < 0 || bestS <= 0) return null;
    var mean = sum / cnt;
    // refine deviation from the fundamental peak
    f0 = 440 * Math.pow(2, (best - 69 + tune) / 12);
    var c = Math.round(f0 / binHz), dev = 0;
    if (c > 1 && c < mag.length - 2) {
      var pk = c;
      if (mag[c - 1] > mag[pk]) pk = c - 1;
      if (mag[c + 1] > mag[pk]) pk = c + 1;
      var a = mag[pk - 1], b = mag[pk], g = mag[pk + 1];
      var den = a - 2 * b + g;
      var off = den !== 0 ? 0.5 * (a - g) / den : 0;
      var fp = (pk + off) * binHz;
      dev = 12 * Math.log(fp / f0) / Math.LN2;
      if (!isFinite(dev) || Math.abs(dev) > 0.6) dev = 0;
    }
    return { midi: best, pc: ((best % 12) + 12) % 12, dev: dev + tune, conf: mean > 0 ? bestS / mean : 0, score: bestS };
  }

  // -------------------------------------------------------------- tracker
  // Follows the right-hand note list. Position = index of the last matched event.
  function createTracker(score, opt) {
    opt = opt || {};
    var ev = score.events, n = ev.length;
    var st = { pos: -1, lastT: 0, unmatched: 0, recent: [], beatSec: opt.beatSec || 0.75 };
    var HOLD = 0.65, WIN = 6;

    function push(pc) {
      if (pc === null || pc === undefined) return;
      st.recent.push(pc);
      if (st.recent.length > WIN) st.recent.shift();
    }
    function advance(idx, t) {
      var cur = st.pos;
      if (idx - cur === 1 && cur >= 0) {
        var el = t - st.lastT;
        var meas = el / ev[cur].beats;
        if (el < 4 && meas > 0.2 && meas < 2.5) st.beatSec = st.beatSec * 0.75 + meas * 0.25;
      }
      st.pos = idx; st.lastT = t; st.unmatched = 0;
    }
    // how many of the last w detected pitch classes agree with the score ending at idx
    function agree(idx, w) {
      var j, c = 0;
      if (idx < w - 1) return 0;
      for (j = 0; j < w; j++) if (ev[idx - j].pc === st.recent[st.recent.length - 1 - j]) c++;
      return c;
    }
    // fuzzy re-alignment: jump when another place explains the recent notes clearly better
    function align(t) {
      var w = Math.min(WIN, st.recent.length);
      if (w < 5) return false;
      var cs = st.pos >= 0 ? agree(st.pos, w) : 0, best = -1, bs = 0, bd = 1e9, idx, s, d;
      for (idx = w - 1; idx < n; idx++) {
        s = agree(idx, w);
        if (s < w - 1) continue;
        d = idx >= st.pos ? idx - st.pos : (st.pos - idx) + 2;
        if (s > bs || (s === bs && d < bd)) { bs = s; bd = d; best = idx; }
      }
      if (best >= 0 && best !== st.pos && bs >= cs + 2) {
        st.pos = best; st.lastT = t; st.unmatched = 0;
        return true;
      }
      return false;
    }

    // pc: detected pitch class (0-11) or null; t: seconds.
    function onOnset(pc, t) {
      var cur = st.pos, step, idx, res = null;
      var elapsed = t - st.lastT;
      var curDur = cur >= 0 ? ev[cur].beats * st.beatSec : 0;
      // a second onset inside a long held note is usually the other hand
      if (cur >= 0 && ev[cur].beats >= 1.5 && elapsed < HOLD * curDur) {
        var nextIsNew = cur + 1 < n && pc !== null && ev[cur + 1].pc === pc && ev[cur + 1].pc !== ev[cur].pc;
        if (!nextIsNew) return { status: 'hold', pos: st.pos };
      }
      if (pc !== null) {
        for (step = 1; step <= 3; step++) {
          idx = cur + step;
          if (idx >= n) break;
          if (ev[idx].pc === pc) { push(pc); advance(idx, t); res = { status: 'advance', skipped: step - 1 }; break; }
        }
        if (!res && cur >= 0 && ev[cur].pc === pc) return { status: 'same', pos: st.pos };
      }
      if (!res) {
        push(pc);
        st.unmatched++;
        if (cur >= 0 && st.unmatched >= 2 && elapsed >= 0.8 * curDur && cur + 1 < n) {
          advance(cur + 1, t);
          st.unmatched = 1;
          res = { status: 'soft' };
        } else {
          res = { status: 'unmatched' };
        }
      }
      if (align(t)) res = { status: 'resync' };
      res.pos = st.pos;
      return res;
    }

    return {
      onOnset: onOnset,
      state: st,
      pos: function () { return st.pos; },
      setPos: function (p, t) { st.pos = p; st.lastT = t || 0; st.unmatched = 0; st.recent = []; },
      reset: function () { st.pos = -1; st.lastT = 0; st.unmatched = 0; st.recent = []; }
    };
  }

  var api = {
    parseScore: parseScore, barPosOf: barPosOf, createOnsetDetector: createOnsetDetector,
    detectPitch: detectPitch, createTracker: createTracker, NAMES: NAMES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NightTracker = api;
})(typeof window !== 'undefined' ? window : this);
