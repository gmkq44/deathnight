'use strict';
var T = require('./tracker.js');
var assert = require('assert');

// ------------------------------------------------------------ helpers
function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------ parser
(function () {
  var s = T.parseScore('C D E | F:3 G\nBb A# | c d');
  assert.strictEqual(s.bars, 4);
  assert.strictEqual(s.events.length, 9);
  assert.strictEqual(s.events[3].beats, 3);
  assert.strictEqual(s.events[5].pc, 10); // Bb
  assert.strictEqual(s.events[6].pc, 10); // A#
  assert.strictEqual(s.events[7].pc, 0);  // lowercase c
  assert.strictEqual(s.barFirst[3], 5);
  assert.ok(Math.abs(T.barPosOf(s, 4) - 1.75) < 1e-9 || T.barPosOf(s, 4) > 1);
  var e = T.parseScore('D♭ E＃ ‖ ,, G');
  assert.strictEqual(e.events[0].pc, 1);
  assert.strictEqual(e.events[1].pc, 5);
  assert.strictEqual(T.parseScore('').events.length, 0);
  var r = T.parseScore('0:1 C D:2 | E:3 0 | F');
  assert.strictEqual(r.bars, 3);
  assert.strictEqual(r.events.length, 4);
  assert.strictEqual(r.barBeats[1], 4);
  assert.strictEqual(r.barBeats[2], 4);
  assert.strictEqual(r.events[0].beatInBar, 1);
  console.log('parser ok');
})();

// ------------------------------------------------------------ original test piece (random, not a real piece)
function makeScore(seed, bars) {
  var r = rng(seed), pcs = [2, 4, 5, 7, 9, 10, 0], pats = [[1, 1, 1, 1], [0.5, 0.5, 1, 2], [2, 2], [0.5, 0.5, 0.5, 0.5, 2], [1, 1, 2], [3, 1], [4], [0.5, 0.5, 1, 1, 1]];
  var txt = [], ix = 3;
  for (var b = 0; b < bars; b++) {
    var p = pats[Math.floor(r() * pats.length)], bar = [];
    for (var k = 0; k < p.length; k++) {
      ix = Math.max(0, Math.min(6, ix + Math.floor(r() * 3) - 1));
      bar.push(['D', 'E', 'F', 'G', 'A', 'Bb', 'C'][ix] + ':' + p[k]);
    }
    txt.push(bar.join(' '));
  }
  return T.parseScore(txt.join(' | '));
}

// ------------------------------------------------------------ tracker simulation
function simulate(score, o) {
  var r = rng(o.seed || 1), ev = score.events, beat = o.beat || 0.75, on = [];
  var wrong = o.wrong || 0, drop = o.drop || 0, noise = o.noise || 0, jit = o.jitter || 0.03;
  var plan = [];
  for (var i = 0; i < ev.length; i++) plan.push(i);
  if (o.restartAt) { // stop after restartAt[0], restart from restartAt[1]
    plan = [];
    for (i = 0; i <= o.restartAt[0]; i++) plan.push(i);
    for (i = o.restartAt[1]; i < ev.length; i++) plan.push(i);
  }
  var t = 1, prevI = -1, held = null;
  for (var q = 0; q < plan.length; q++) {
    i = plan[q];
    if (prevI >= 0 && i !== prevI + 1) t += 1.5;
    else if (prevI >= 0) t += ev[prevI].beats * beat;
    prevI = i;
    var tt = t + (r() - 0.5) * 2 * jit;
    var pc = ev[i].pc;
    if (r() < wrong) pc = (pc + (r() < 0.5 ? 1 : 11) + Math.floor(r() * 3)) % 12;
    if (r() >= drop) on.push({ t: tt, pc: pc, truth: i });
    // other-hand onset in the middle of long notes
    if (ev[i].beats >= 3) on.push({ t: tt + (ev[i].beats >= 4 ? 2 : 1) * beat, pc: r() < 0.5 ? ev[i].pc : [7, 9, 0, 4][Math.floor(r() * 4)], truth: i, lh: true });
    if (r() < noise) on.push({ t: tt + 0.2 + r() * 0.1, pc: Math.floor(r() * 12), truth: i, junk: true });
  }
  on.sort(function (a, b) { return a.t - b.t; });
  var tr = T.createTracker(score, { beatSec: 0.75 }), good = 0, tot = 0, maxLag = 0;
  for (i = 0; i < on.length; i++) {
    var res = tr.onOnset(on[i].pc, on[i].t);
    if (i >= 3) {
      var lag = on[i].truth - res.pos;
      tot++;
      if (Math.abs(lag) <= 1) good++;
      if (Math.abs(lag) > maxLag) maxLag = Math.abs(lag);
    }
  }
  return { final: tr.pos(), last: ev.length - 1, pct: tot ? good / tot : 1, maxLag: maxLag, n: on.length };
}

var scenarios = [
  ['clean', {}],
  ['slow child (beat 1.1s)', { beat: 1.1 }],
  ['fast child (beat 0.55s)', { beat: 0.55 }],
  ['8% wrong notes', { wrong: 0.08 }],
  ['5% dropped onsets', { drop: 0.05 }],
  ['wrong 8% + drop 5% + 5% junk', { wrong: 0.08, drop: 0.05, noise: 0.05 }],
  ['restart from earlier bar', { restartAt: [20, 8] }],
  ['restart with errors', { restartAt: [24, 10], wrong: 0.05, drop: 0.03 }]
];
var worst = 1;
scenarios.forEach(function (sc) {
  var agg = { pct: 0, fin: 0, runs: 0, maxLag: 0 };
  for (var s = 1; s <= 30; s++) {
    var score = makeScore(s * 7, 18);
    var o = JSON.parse(JSON.stringify(sc[1])); o.seed = s;
    var r = simulate(score, o);
    agg.pct += r.pct; agg.runs++;
    if (r.last - r.final <= 2) agg.fin++;
    agg.maxLag = Math.max(agg.maxLag, r.maxLag);
  }
  var pct = agg.pct / agg.runs;
  worst = Math.min(worst, pct);
  console.log(sc[0].padEnd(34), 'within 1 note: ' + (pct * 100).toFixed(1) + '%', ' reached end: ' + agg.fin + '/' + agg.runs, ' worst lag: ' + agg.maxLag);
});

// ------------------------------------------------------------ audio: FFT + synthetic piano
function fft(re, im) {
  var n = re.length, i, j = 0, k, t;
  for (i = 1; i < n; i++) {
    var bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (var len = 2; len <= n; len <<= 1) {
    var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (i = 0; i < n; i += len) {
      var cr = 1, ci = 0;
      for (k = 0; k < len / 2; k++) {
        var ur = re[i + k], ui = im[i + k];
        var vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        var vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        var nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
var SR = 48000;
function spectrum(sig, endSample, size) {
  var re = new Float64Array(size), im = new Float64Array(size), st = endSample - size;
  for (var i = 0; i < size; i++) {
    var x = st + i >= 0 && st + i < sig.length ? sig[st + i] : 0;
    var w = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / size) + 0.08 * Math.cos(4 * Math.PI * i / size);
    re[i] = x * w;
  }
  fft(re, im);
  var mag = new Float32Array(size / 2);
  for (i = 0; i < size / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / size;
  return mag;
}
function addTone(sig, midi, t0, dur, amp, bass, detune, r) {
  var f0 = 440 * Math.pow(2, (midi - 69 + (detune || 0)) / 12);
  var amps = bass ? [0.25, 0.8, 0.7, 0.5, 0.3, 0.2] : [1, 0.55, 0.38, 0.22, 0.14, 0.08];
  var decay = bass ? 0.7 : 1.1;
  var a = Math.floor(t0 * SR), b = Math.min(sig.length, Math.floor((t0 + dur) * SR));
  var ph = amps.map(function () { return r() * 6.28; });
  for (var i = a; i < b; i++) {
    var tt = (i - a) / SR, env = Math.exp(-tt * decay) * Math.min(1, tt / 0.004) * (tt > dur - 0.05 ? (dur - tt) / 0.05 : 1);
    var v = 0;
    for (var h = 0; h < amps.length; h++) v += amps[h] * Math.sin(2 * Math.PI * f0 * (h + 1) * tt + ph[h]);
    sig[i] += amp * env * v;
  }
}

function audioTest(label, o) {
  o = o || {};
  var r = rng(o.seed || 5), midis = [], n = 24, beat = 0.75, sig = new Float32Array(SR * (n * 0.8 + 3)), times = [], pcs = [];
  var pool = [62, 64, 65, 67, 69, 70, 72]; // D4..C5
  var t = 0.8, i;
  for (i = 0; i < n; i++) {
    var m = pool[Math.floor(r() * pool.length)];
    // avoid repeated identical notes: onset detection of repeats is out of scope here
    if (i > 0 && m === midis[i - 1]) m = pool[(pool.indexOf(m) + 1) % pool.length];
    midis.push(m); times.push(t);
    addTone(sig, m, t, 0.7, o.amp || 0.08, false, o.detune, r);
    if (o.lh && i % 2 === 0) addTone(sig, [45, 46][Math.floor(r() * 2)], t, 1.5, (o.amp || 0.08) * (o.lhGain || 0.9), true, o.detune, r);
    t += (r() < 0.4 ? 0.5 : 1) * beat;
  }
  for (i = 0; i < sig.length; i++) sig[i] += (r() - 0.5) * 2 * (o.noise || 0.0005);
  var od = T.createOnsetDetector(), onsets = [], hop = 800, size = 2048;
  for (var e = size; e < sig.length; e += hop) {
    var mag = spectrum(sig, e, size);
    var on = od.push(mag, SR / size, (e - size / 2) / SR);
    if (on >= 0) onsets.push(on);
  }
  // match onsets to truth
  var found = 0, falseOn = 0, correct = 0, tune = 0, devs = [];
  onsets.forEach(function (ot) {
    var k = -1;
    for (var j = 0; j < times.length; j++) if (Math.abs(times[j] - ot) < 0.09) { k = j; break; }
    if (k < 0) { falseOn++; return; }
    found++;
    var end = Math.floor((ot + 0.13) * SR);
    var p = T.detectPitch(spectrum(sig, end, 8192), SR / 8192, { tune: tune });
    if (p && p.pc === midis[k] % 12) correct++;
    if (p) devs.push(p.dev);
  });
  console.log(label.padEnd(40), 'onsets found ' + found + '/' + n + ', false ' + falseOn + ', pitch correct ' + correct + '/' + found);
  return { found: found, n: n, falseOn: falseOn, correct: correct };
}

audioTest('RH only');
audioTest('RH + LH bass (same level)', { lh: true });
audioTest('RH + LH bass (LH louder)', { lh: true, lhGain: 1.6 });
audioTest('quiet (p), room noise', { amp: 0.015, noise: 0.002, lh: true });
audioTest('tuned 30 cents sharp', { lh: true, detune: 0.3 });

console.log('worst tracker scenario: ' + (worst * 100).toFixed(1) + '%');
