// Фоновая музыка «как в ресторане»: плейлист из 20 инструментальных пьес, которые генерируются прямо в браузере
// (Web Audio), без аудиофайлов и лицензий. Стили: лаунж-свинг, босса-нова, лоу-фай, вальс, баллады на рояле,
// латин с маримбой, амбиент и «шёлковый путь» с щипковым инструментом. У каждой пьесы свой темп, тональность,
// гармония и набор инструментов; играют они по очереди в случайном порядке (≈1,5–2 минуты каждая).
// Браузеры запрещают звук до первого касания, поэтому музыка стартует после первого действия посетителя.
// Кнопка 🎹 в шапке выключает и включает её, мини-плеер снизу показывает название и переключает пьесу (⏭).
(function (root) {
  "use strict";

  var midi = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ——— гармония: из символа аккорда («Dm9», «Bbmaj7», «G13») получаем бас, голоса и ступени ———
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var Q = {
    "maj9": [4, 7, 11, 14], "maj7": [4, 7, 11, 14], "6": [4, 7, 9, 14], "m9": [3, 7, 10, 14], "m7": [3, 7, 10, 14], "m6": [3, 7, 9, 14],
    "m7b5": [3, 6, 10, 13], "m": [3, 7, 12, 15], "13": [4, 9, 10, 14], "9": [4, 7, 10, 14], "7": [4, 7, 10, 14], "7b9": [4, 7, 10, 13],
    "sus": [5, 7, 10, 14], "add9": [4, 7, 12, 14], "": [4, 7, 12, 16], "dim7": [3, 6, 9, 12]
  };
  var chordCache = {};
  function fold(n, lo, hi) { while (n >= hi) n -= 12; while (n < lo) n += 12; return n; }
  function chord(sym) {
    if (chordCache[sym]) return chordCache[sym];
    var m = /^([A-G])([#b]?)(.*)$/.exec(sym), root = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    root = ((root % 12) + 12) % 12;
    var q = m[3], iv = Q[q] || Q[""], minor = /^m(?!aj)/.test(q) || q === "dim7";
    var third = minor ? 3 : 4, sev = /maj/.test(q) ? 11 : (q === "6" || q === "m6" ? 9 : 10);
    var b = 36 + root;
    var vox = iv.map(function (i) { return fold(root + i + 48, 53, 72); }).sort(function (a, c) { return a - c; })
      .filter(function (n, k, arr) { return k === 0 || n !== arr[k - 1]; });
    return (chordCache[sym] = { root: root, bass: b, vox: vox, steps: [b, fold(b + third, 34, 50), fold(b + 7, 34, 50), fold(b + sev, 34, 50)] });
  }

  var MODES = { pent: [0, 2, 4, 7, 9], minpent: [0, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], maj: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  function scaleOf(tonic, mode) {
    var set = MODES[mode], out = [];
    for (var n = 64; n <= 88; n++) if (set.indexOf(((n - tonic) % 12 + 12) % 12) >= 0) out.push(n);
    return out;
  }

  // ——— плейлист: 20 пьес ———
  // style: swing | bossa | lofi | waltz | ballad | latin | ambient | modal; comp/lead — инструменты;
  // prog — аккорды по тактам (массив из двух — по два бита); key/mode — для мелодии
  var TRACKS = [
    { name: "Evening at the Bistro", style: "swing", bpm: 78, swing: 0.64, key: "C", mode: "pent", comp: "rhodes", lead: "piano",
      prog: [["Dm9"], ["G13"], ["Cmaj9"], ["Am9"], ["Dm9"], ["G13"], ["Em7", "A7"], ["Dm9"], ["Fmaj7"], ["G13"], ["Em7", "A7"], ["Dm9"], ["G13"], ["Cmaj9"], ["Am9", "Dm9"], ["G13"]] },
    { name: "Blue Hour", style: "ballad", bpm: 58, key: "F", mode: "pent", comp: "pad", lead: "piano",
      prog: [["Fmaj9"], ["Dm9"], ["Gm9"], ["C13"], ["Fmaj9"], ["Am7"], ["Bbmaj7"], ["C13"]] },
    { name: "Café Crème", style: "bossa", bpm: 94, swing: 0.5, key: "D", mode: "minpent", comp: "pluck", lead: "vibes",
      prog: [["Dm9"], ["Dm9"], ["Gm9"], ["Gm9"], ["Em7b5"], ["A7b9"], ["Dm9"], ["Dm9"]] },
    { name: "Sunday Brunch", style: "swing", bpm: 100, swing: 0.62, key: "Bb", mode: "pent", comp: "rhodes", lead: "vibes",
      prog: [["Bbmaj7"], ["Gm7"], ["Cm7"], ["F7"], ["Bbmaj7"], ["Gm7"], ["Cm7", "F7"], ["Bbmaj7"]] },
    { name: "Rainy Window", style: "lofi", bpm: 74, swing: 0.6, key: "A", mode: "minpent", comp: "rhodes", lead: "bell",
      prog: [["Am9"], ["Fmaj9"], ["Dm9"], ["E7"], ["Am9"], ["Fmaj9"], ["Gmaj7"], ["E7b9"]] },
    { name: "Velvet Lounge", style: "swing", bpm: 64, swing: 0.66, key: "Eb", mode: "pent", comp: "rhodes", lead: "piano",
      prog: [["Ebmaj7"], ["Cm9"], ["Fm9"], ["Bb13"], ["Ebmaj7"], ["Ab6"], ["Gm7", "C7"], ["Fm9", "Bb13"]] },
    { name: "Garden Terrace", style: "waltz", bpm: 88, swing: 0.5, key: "G", mode: "pent", comp: "pluck", lead: "piano",
      prog: [["Gmaj7"], ["Em7"], ["Am7"], ["D7"], ["Gmaj7"], ["Bm7"], ["Cmaj7"], ["D7"]] },
    { name: "Midnight Espresso", style: "lofi", bpm: 82, swing: 0.58, key: "E", mode: "minpent", comp: "rhodes", lead: "rhodes",
      prog: [["Em9"], ["Cmaj7"], ["Am9"], ["B7b9"], ["Em9"], ["Cmaj7"], ["D9"], ["B7b9"]] },
    { name: "Copacabana Lunch", style: "bossa", bpm: 106, swing: 0.5, key: "G", mode: "maj", comp: "pluck", lead: "piano",
      prog: [["Gmaj9"], ["Gmaj9"], ["Am9"], ["D13"], ["Gmaj9"], ["E7b9"], ["Am9"], ["D13"]] },
    { name: "Golden Window", style: "ballad", bpm: 54, key: "Ab", mode: "pent", comp: "pad", lead: "piano",
      prog: [["Abmaj9"], ["Fm9"], ["Dbmaj9"], ["Eb13"], ["Abmaj9"], ["Cm7"], ["Dbmaj7"], ["Eb13"]] },
    { name: "Silk Road Tea", style: "modal", bpm: 72, swing: 0.5, key: "D", mode: "dorian", comp: "pad", lead: "pluck",
      prog: [["Dm7"], ["Dm7"], ["Csus"], ["Dm7"], ["Dm7"], ["Gsus"], ["Csus"], ["Dm7"]] },
    { name: "Almaty Dusk", style: "ambient", bpm: 60, swing: 0.5, key: "C", mode: "pent", comp: "pad", lead: "bell",
      prog: [["Cmaj9"], ["Am9"], ["Fmaj9"], ["Gsus"], ["Cmaj9"], ["Em7"], ["Fmaj9"], ["Gsus"]] },
    { name: "Paris Corner", style: "waltz", bpm: 96, swing: 0.5, key: "F", mode: "maj", comp: "piano", lead: "pluck",
      prog: [["Fmaj7"], ["D7"], ["Gm7"], ["C7"], ["Fmaj7"], ["Am7", "D7"], ["Gm7"], ["C7"]] },
    { name: "Bossa Aperitivo", style: "bossa", bpm: 114, swing: 0.5, key: "A", mode: "pent", comp: "pluck", lead: "vibes",
      prog: [["Amaj7"], ["F#m7"], ["Bm7"], ["E9"], ["Amaj7"], ["C#m7"], ["Dmaj7"], ["E9"]] },
    { name: "Late Dinner", style: "swing", bpm: 72, swing: 0.65, key: "C", mode: "minpent", comp: "rhodes", lead: "piano",
      prog: [["Cm9"], ["Fm9"], ["Dm7b5"], ["G7b9"], ["Cm9"], ["Ab9"], ["Dm7b5", "G7b9"], ["Cm9"]] },
    { name: "Morning Pour-over", style: "lofi", bpm: 70, swing: 0.58, key: "C", mode: "pent", comp: "rhodes", lead: "vibes",
      prog: [["Cmaj9"], ["Am9"], ["Dm9"], ["G13"], ["Cmaj9"], ["Em7"], ["Fmaj9"], ["G13"]] },
    { name: "Marimba Breeze", style: "latin", bpm: 100, swing: 0.5, key: "Eb", mode: "maj", comp: "vibes", lead: "vibes",
      prog: [["Ebmaj7"], ["Cm7"], ["Fm7"], ["Bb7"], ["Ebmaj7"], ["Abmaj7"], ["Fm7"], ["Bb7"]] },
    { name: "Candlelight", style: "ballad", bpm: 52, key: "Db", mode: "pent", comp: "pad", lead: "piano",
      prog: [["Dbmaj9"], ["Bbm9"], ["Gbmaj7"], ["Ab13"], ["Dbmaj9"], ["Fm7"], ["Gbmaj7"], ["Ab13"]] },
    { name: "Jazz Cellar", style: "swing", bpm: 112, swing: 0.62, key: "F", mode: "minpent", comp: "rhodes", lead: "piano",
      prog: [["Fm7"], ["Bb7"], ["Ebmaj7"], ["Abmaj7"], ["Dm7b5"], ["G7b9"], ["Cm7"], ["F7"]] },
    { name: "Winter Boulevard", style: "ambient", bpm: 56, swing: 0.5, key: "B", mode: "minpent", comp: "pad", lead: "piano",
      prog: [["Bm9"], ["Gmaj7"], ["Em9"], ["F#7b9"], ["Bm9"], ["Dmaj7"], ["Gmaj7"], ["F#sus"]] }
  ];

  function createEngine(ctx, destination) {
    var rate = ctx.sampleRate;
    var master = ctx.createGain(); master.gain.value = 0.0001;
    var warm = ctx.createBiquadFilter(); warm.type = "lowpass"; warm.frequency.value = 7200; warm.Q.value = 0.3;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.012; comp.release.value = 0.35;
    master.connect(warm); warm.connect(comp); comp.connect(destination);

    // комната ресторана: умеренная реверберация
    var len = Math.floor(rate * 2.4), ir = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    var verb = ctx.createConvolver(); verb.buffer = ir;
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.42; verb.connect(verbOut); verbOut.connect(master);
    var send = ctx.createGain(); send.gain.value = 0.42; send.connect(verb);

    // общий шум для щёток и перкуссии
    var nb = ctx.createBuffer(1, rate, rate), nd = nb.getChannelData(0);
    for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;

    // ——— электропианино (Rhodes): FM с затухающим индексом + лёгкое тремоло ———
    var epBus = ctx.createGain(); epBus.gain.value = 1;
    var trem = ctx.createOscillator(); trem.frequency.value = 4.2;
    var tremAmt = ctx.createGain(); tremAmt.gain.value = 0.07; trem.connect(tremAmt); tremAmt.connect(epBus.gain); trem.start(0);
    epBus.connect(master); epBus.connect(send);
    function rhodes(m, t, vel) {
      var f = midi(m);
      var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.type = "sine"; mod.type = "sine"; car.frequency.value = f; mod.frequency.value = f;
      mg.gain.setValueAtTime(f * 1.9, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.7);
      mod.connect(mg); mg.connect(car.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(vel * 0.38, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      car.connect(g); g.connect(epBus);
      var tine = ctx.createOscillator(), tg = ctx.createGain();   // звонкий «зубец» на атаке
      tine.type = "sine"; tine.frequency.value = f * 4; tg.gain.setValueAtTime(vel * 0.22, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      tine.connect(tg); tg.connect(g);
      car.start(t); mod.start(t); tine.start(t); car.stop(t + 2.5); mod.stop(t + 2.5); tine.stop(t + 0.3);
    }

    // ——— рояль ———
    var PARTIALS = [[1, 1], [2, 0.5], [3, 0.28], [4, 0.16], [5, 0.09], [6, 0.05]];
    function piano(m, t, vel, hold) {
      var f = midi(m), dec = clamp(6.2 - m / 18, 1.8, 4.8) * (hold || 1);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      var filt = ctx.createBiquadFilter(); filt.type = "lowpass";
      filt.frequency.setValueAtTime(Math.min(f * 12, 8500), t); filt.frequency.exponentialRampToValueAtTime(Math.max(f * 3, 1100), t + 0.9);
      g.connect(filt); filt.connect(master); filt.connect(send);
      PARTIALS.forEach(function (p) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = "sine"; o.frequency.value = f * p[0] * (1 + 0.00025 * p[0] * p[0]); o.detune.value = rnd(-3, 3); pg.gain.value = p[1];
        o.connect(pg); pg.connect(g); o.start(t); o.stop(t + dec + 0.1);
      });
    }

    // ——— щипковый (гитара/уд): треугольник + октава, быстрое затухание ———
    function pluck(m, t, vel, hold) {
      var f = midi(m), dec = 1.3 * (hold || 1), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(Math.min(f * 7, 7000), t); lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.6, 500), t + 0.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      [["triangle", 1, 1], ["sine", 2, 0.4], ["sine", 3, 0.12]].forEach(function (p) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = p[0]; o.frequency.value = f * p[1]; o.detune.value = rnd(-2, 2); pg.gain.value = p[2]; o.connect(pg); pg.connect(g); o.start(t); o.stop(t + dec + 0.05);
      });
      g.connect(lp); lp.connect(master); lp.connect(send);
    }

    // ——— вибрафон / маримба ———
    function vibes(m, t, vel, hold) {
      var f = midi(m), dec = 2.2 * (hold || 1), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = "sine"; o.frequency.value = f; o2.type = "sine"; o2.frequency.value = f * 4;
      g2.gain.setValueAtTime(vel * 0.45, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o2.connect(g2); g2.connect(g); o.connect(g); g.connect(master); g.connect(send);
      var lfo = ctx.createOscillator(), la = ctx.createGain(); lfo.frequency.value = 5; la.gain.value = vel * 0.18; lfo.connect(la); la.connect(g.gain);
      o.start(t); o2.start(t); lfo.start(t); o.stop(t + dec + 0.1); o2.stop(t + 0.3); lfo.stop(t + dec + 0.1);
    }

    // ——— колокольчик (долгий, чистый) ———
    function bell(m, t, vel, hold) {
      var f = midi(m), dec = 3.4 * (hold || 1), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      [[1, 1], [2.01, 0.34], [3.99, 0.14]].forEach(function (p) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = "sine"; o.frequency.value = f * p[0]; pg.gain.value = p[1]; o.connect(pg); pg.connect(g); o.start(t); o.stop(t + dec + 0.1);
      });
      g.connect(master); g.connect(send);
    }

    // ——— тёплый «пэд»: медленная атака, два чуть расстроенных осциллятора на ноту ———
    function pad(notes, t, dur, vel) {
      var g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1500; lp.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(0.9, dur * 0.4));
      g.gain.setValueAtTime(vel, t + dur * 0.62); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.9);
      notes.forEach(function (m) {
        [-6, 6].forEach(function (dt) {
          var o = ctx.createOscillator(), pg = ctx.createGain();
          o.type = "triangle"; o.frequency.value = midi(m); o.detune.value = dt + rnd(-2, 2); pg.gain.value = 0.5 / notes.length;
          o.connect(pg); pg.connect(g); o.start(t); o.stop(t + dur + 1);
        });
      });
      g.connect(lp); lp.connect(master); lp.connect(send);
    }

    // ——— контрабас ———
    function bass(m, t, vel, dur) {
      var f = midi(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.35);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.012);
      g.gain.exponentialRampToValueAtTime(vel * 0.45, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [["triangle", 1, 0.7], ["sine", 1, 0.6], ["sine", 2, 0.34], ["sine", 3, 0.12]].forEach(function (p) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = p[0]; o.frequency.value = f * p[1]; pg.gain.value = p[2]; o.connect(pg); pg.connect(g); o.start(t); o.stop(t + dur + 0.05);
      });
      g.connect(lp); lp.connect(master);
      var n = ctx.createBufferSource(); n.buffer = nb;                  // щипок струны
      var nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = 700; nf.Q.value = 0.8;
      var ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.16, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      n.connect(nf); nf.connect(ng); ng.connect(master); n.start(t, rnd(0, 0.5), 0.06);
    }
    // мягкий синус-бас (лоу-фай, амбиент, дрон)
    function sub(m, t, vel, dur) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = midi(m);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.03);
      g.gain.setValueAtTime(vel, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }

    // ——— ударные: щётки, бочка/там-там, шейкер, римшот ———
    function brush(t, vel, kind) {
      var n = ctx.createBufferSource(); n.buffer = nb;
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      if (kind === "ride") { f.type = "bandpass"; f.frequency.value = 7600; f.Q.value = 1.4; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); }
      else if (kind === "hat") { f.type = "highpass"; f.frequency.value = 6000; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); }
      else if (kind === "shaker") { f.type = "highpass"; f.frequency.value = 7500; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045); }
      else if (kind === "rim") { f.type = "bandpass"; f.frequency.value = 1900; f.Q.value = 3; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); }
      else if (kind === "snare") { f.type = "bandpass"; f.frequency.value = 2200; f.Q.value = 0.5; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); }
      else { f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 0.6; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); }
      n.connect(f); f.connect(g); g.connect(master); if (kind !== "shaker") g.connect(send);
      n.start(t, rnd(0, 0.6), 0.35);
    }
    function kick(t, vel, lo, hi) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(hi || 130, t); o.frequency.exponentialRampToValueAtTime(lo || 48, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
    }

    // инструменты по имени
    var COMPS = {
      rhodes: function (notes, t, v) { notes.forEach(function (m, s) { rhodes(m, t + s * 0.011, v / (1 + s * 0.12)); }); },
      piano: function (notes, t, v) { notes.forEach(function (m, s) { piano(m, t + s * 0.01, v * 0.8 / (1 + s * 0.15), 0.6); }); },
      pluck: function (notes, t, v) { notes.forEach(function (m, s) { pluck(m, t + s * 0.018, v * 0.9 / (1 + s * 0.12), 0.7); }); },
      vibes: function (notes, t, v) { notes.forEach(function (m, s) { vibes(m, t + s * 0.02, v * 0.8 / (1 + s * 0.12), 0.7); }); },
      pad: function (notes, t, v, dur) { pad(notes, t, dur, v * 0.34); }
    };
    var LEADS = { piano: piano, rhodes: rhodes, pluck: pluck, vibes: vibes, bell: bell };

    // ——— состояние пьесы ———
    var tr = TRACKS[0], bar = 0, BEAT = 60 / tr.bpm, BEATS = 4, scale = scaleOf(chord(tr.key).root, tr.mode);
    function setTrack(i) {
      tr = TRACKS[i]; bar = 0; BEAT = 60 / tr.bpm; BEATS = tr.style === "waltz" ? 3 : 4;
      scale = scaleOf(chord(tr.key).root, tr.mode);
    }
    function swingT(t0, beat) {                 // позиция в битах → секунды со свингом
      var whole = Math.floor(beat + 1e-6), frac = beat - whole;
      return t0 + (whole + (Math.abs(frac - 0.5) < 0.2 ? (tr.swing || 0.5) : frac)) * BEAT;
    }
    function jit() { return rnd(-0.008, 0.012); }

    // фраза мелодии: случайное блуждание по гамме
    function phrase(t0, prob, minN, maxN, maxPos, durs, vlo, vhi) {
      if (Math.random() > prob) return;
      var lead = LEADS[tr.lead], pos = pick([0.5, 1, 1.5, 2]), si = Math.floor(rnd(scale.length * 0.3, scale.length * 0.75)), count = Math.floor(rnd(minN, maxN + 1));
      for (var n = 0; n < count && pos < maxPos; n++) {
        lead(scale[si], swingT(t0, pos) + rnd(-0.01, 0.02), rnd(vlo, vhi), n === count - 1 ? 1.4 : 0.9);
        si = clamp(si + pick([-2, -1, -1, 1, 1, 2]), 0, scale.length - 1);
        pos += pick(durs);
      }
    }

    function scheduleBar(t0) {
      var P = tr.prog, raw = P[bar % P.length], nextRaw = P[(bar + 1) % P.length], idx = bar;
      var chords = raw.map(chord), nextRoot = chord(nextRaw[0]).bass;
      bar++;
      var at = function (beat) { return chords.length === 1 ? chords[0] : chords[beat < BEATS / 2 ? 0 : 1]; };
      var comp = COMPS[tr.comp], barLen = BEATS * BEAT, k;

      switch (tr.style) {
      case "swing": {
        for (var b = 0; b < 4; b++) {                                    // «ходящий» бас
          var c = at(b), note;
          if (b === 0) note = c.bass; else if (b === 3) note = nextRoot + pick([-1, 1, -2, 1]); else note = c.steps[b === 1 ? pick([1, 2]) : pick([2, 3])];
          bass(clamp(note, 31, 52), t0 + b * BEAT + jit(), rnd(0.2, 0.27), BEAT * 0.95);
        }
        pick([[0, 1.65], [0, 2.65], [0.65, 2, 3.65], [0, 1.65, 3], [0.0, 2.0, 2.65]]).forEach(function (pos, i) {
          comp(at(pos).vox, swingT(t0, pos) + rnd(-0.01, 0.012), (i === 0 ? 0.2 : 0.15) * rnd(0.85, 1.1), BEAT * 2);
        });
        [0, 1, 2, 3].forEach(function (bt) { brush(t0 + bt * BEAT, bt % 2 ? 0.05 : 0.04, "ride"); });
        brush(swingT(t0, 1.5), 0.034, "ride"); brush(swingT(t0, 3.5), 0.034, "ride");
        brush(t0 + BEAT, 0.05, "hat"); brush(t0 + 3 * BEAT, 0.05, "hat");
        if (Math.random() < 0.7) brush(t0 + BEAT, 0.06, "swish");
        if (Math.random() < 0.7) brush(t0 + 3 * BEAT, 0.06, "swish");
        phrase(t0, 0.62, 2, 4, 3.9, [0.5, 0.5, 1, 1.5], 0.26, 0.4);
        break;
      }
      case "bossa": {
        var c0 = at(0);
        [[0, c0.bass], [1.5, c0.steps[2]], [2, c0.bass], [3.5, c0.steps[2]]].forEach(function (p) { bass(clamp(p[1], 31, 52), t0 + p[0] * BEAT + jit(), 0.22, BEAT * 0.9); });
        (idx % 2 ? [1, 2.5] : [0, 1.5, 3]).forEach(function (p) { brush(t0 + p * BEAT, 0.05, "rim"); });
        for (k = 0; k < 8; k++) brush(t0 + k * 0.5 * BEAT, k % 2 ? 0.02 : 0.03, "hat");
        pick([[0, 1.5, 3], [0, 1.5, 2.5, 3.5]]).forEach(function (p, i) { comp(at(p).vox, t0 + p * BEAT + jit(), (i === 0 ? 0.19 : 0.14) * rnd(0.9, 1.1), BEAT); });
        phrase(t0, 0.55, 2, 4, 3.9, [0.5, 0.5, 1, 1.5], 0.22, 0.34);
        break;
      }
      case "lofi": {
        var cl = at(0);
        kick(t0 + jit(), 0.2); kick(swingT(t0, 2.5) + jit(), 0.15); if (Math.random() < 0.4) kick(t0 + 1.75 * BEAT, 0.1);
        brush(t0 + BEAT, 0.07, "snare"); brush(t0 + 3 * BEAT, 0.07, "snare");
        for (k = 0; k < 8; k++) brush(swingT(t0, k * 0.5), k % 2 ? 0.02 : 0.034, "hat");
        sub(cl.bass, t0, 0.26, BEAT * 1.9); sub(clamp(cl.steps[2], 34, 52), swingT(t0, 2.5), 0.2, BEAT * 1.3);
        [0, 1.5, 2.75].forEach(function (p, i) { if (i === 2 && Math.random() < 0.4) return; comp(at(p).vox, swingT(t0, p) + rnd(-0.012, 0.016), (i === 0 ? 0.18 : 0.13) * rnd(0.85, 1.1), BEAT * 2); });
        phrase(t0, 0.5, 2, 4, 3.9, [0.5, 1, 1, 1.5], 0.22, 0.33);
        break;
      }
      case "waltz": {
        var cw = at(0);
        bass(clamp(cw.bass, 31, 52), t0 + jit(), 0.24, BEAT * 1.2);
        [1, 2].forEach(function (p) { comp(at(p).vox, t0 + p * BEAT + rnd(-0.01, 0.014), 0.13 * rnd(0.85, 1.1), BEAT); });
        for (k = 0; k < 3; k++) brush(t0 + k * BEAT, k === 0 ? 0.04 : 0.03, "ride");
        if (Math.random() < 0.5) brush(t0 + BEAT, 0.04, "swish");
        phrase(t0, 0.72, 2, 4, 2.9, [0.5, 1, 1, 1.5], 0.24, 0.36);
        break;
      }
      case "ballad": {
        var cb = at(0);
        COMPS.pad(cb.vox, t0, barLen, 0.5);
        sub(cb.bass, t0, 0.22, BEAT * 2.4); sub(clamp(cb.steps[2], 34, 52), t0 + 2 * BEAT, 0.14, BEAT * 1.8);
        var arp = Math.random() < 0.8; if (arp) for (k = 0; k < 4; k++) piano(cb.vox[k % cb.vox.length] + (k === 3 ? 12 : 0), t0 + k * BEAT + rnd(-0.01, 0.02), 0.13 * rnd(0.85, 1.1), 0.8);
        phrase(t0, 0.55, 2, 3, 3.8, [1, 1, 1.5, 2], 0.24, 0.34);
        break;
      }
      case "latin": {
        var cn = at(0);
        [[0, cn.bass], [1.5, cn.steps[2]], [2, cn.bass], [3.5, cn.steps[2]]].forEach(function (p) { sub(clamp(p[1], 34, 52), t0 + p[0] * BEAT + jit(), 0.22, BEAT * 0.8); });
        kick(t0, 0.12); kick(t0 + 2 * BEAT, 0.1);
        for (k = 0; k < 8; k++) brush(t0 + k * 0.5 * BEAT, k % 2 ? 0.02 : 0.032, "shaker");
        brush(t0 + 1.5 * BEAT, 0.05, "rim"); brush(t0 + 3 * BEAT, 0.05, "rim");
        [0, 0.75, 1.5, 2.5, 3].forEach(function (p, i) { if (i === 1 && Math.random() < 0.5) return; comp(at(p).vox, t0 + p * BEAT + jit(), 0.13 * rnd(0.85, 1.1), BEAT); });
        phrase(t0, 0.6, 3, 5, 3.9, [0.5, 0.5, 0.75, 1], 0.2, 0.3);
        break;
      }
      case "ambient": {
        var ca = at(0);
        COMPS.pad(ca.vox, t0, barLen, 0.55); sub(ca.bass, t0, 0.2, barLen * 0.95);
        var nb2 = Math.floor(rnd(1, 4));
        for (k = 0; k < nb2; k++) LEADS[Math.random() < 0.7 ? tr.lead : "bell"](pick(scale), t0 + rnd(0, barLen * 0.85), rnd(0.12, 0.24), 1.6);
        break;
      }
      case "modal": {                                                   // дрон + бубен/там-там + щипковая мелодия
        var cm = at(0);
        COMPS.pad(cm.vox, t0, barLen, 0.4);
        sub(cm.bass, t0, 0.24, BEAT * 2.2); sub(clamp(cm.bass + 7, 34, 52), t0 + 2 * BEAT, 0.16, BEAT * 1.8);
        kick(t0, 0.16, 62, 100); kick(t0 + 1.5 * BEAT, 0.1, 62, 100); kick(t0 + 2.5 * BEAT, 0.12, 62, 100);
        for (k = 0; k < 8; k++) brush(t0 + k * 0.5 * BEAT, k % 2 ? 0.016 : 0.026, "shaker");
        phrase(t0, 0.8, 3, 6, 3.9, [0.5, 0.5, 0.75, 1], 0.22, 0.34);
        break;
      }
      }
    }
    return {
      master: master, scheduleBar: scheduleBar, setTrack: setTrack,
      barLength: function () { return BEATS * BEAT; },
      finished: function () { return bar >= tr.loops * tr.prog.length; }
    };
  }

  // сколько раз сыграть круг аккордов, чтобы пьеса звучала около 100 секунд
  TRACKS.forEach(function (t) {
    var beats = t.style === "waltz" ? 3 : 4, secs = t.prog.length * beats * 60 / t.bpm;
    t.loops = Math.max(2, Math.round(100 / secs));
  });

  // ——— воспроизведение в браузере ———
  var KEY = "og-music";
  var ctx = null, eng = null, timer = null, playing = false, nextTime = 0, btn = null, mini = null, miniName = null;
  var LEVEL = 0.4, order = [], pos = -1, skip = false, current = 0;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* хранилище недоступно */ } }
  function lang() { return (document.documentElement.lang || "ru").slice(0, 2); }
  function paint() {
    if (btn) { btn.setAttribute("aria-pressed", String(playing)); btn.classList.toggle("is-on", playing); }
    if (mini) { mini.hidden = !playing; if (miniName) miniName.textContent = TRACKS[current].name; }
  }
  function shuffle() {
    order = TRACKS.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = order[i]; order[i] = order[j]; order[j] = x; }
    if (order[0] === current && order.length > 1) { var y = order[0]; order[0] = order[1]; order[1] = y; }
    pos = -1;
  }
  function nextTrack() {
    if (pos + 1 >= order.length) shuffle();
    pos++; current = order[pos];
    eng.setTrack(current);
    paint();
  }
  function tick() {
    if (!ctx || !eng) return;
    while (nextTime < ctx.currentTime + 2.5) {
      if (skip || eng.finished()) { skip = false; nextTrack(); }
      eng.scheduleBar(nextTime); nextTime += eng.barLength();
    }
  }
  function start() {
    if (playing) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      if (!ctx) { ctx = new AC(); eng = createEngine(ctx, ctx.destination); shuffle(); nextTrack(); }
      if (ctx.resume) ctx.resume();
      var now = ctx.currentTime;
      eng.master.gain.cancelScheduledValues(now);
      eng.master.gain.setValueAtTime(Math.max(eng.master.gain.value, 0.0001), now);
      eng.master.gain.exponentialRampToValueAtTime(LEVEL, now + 3);   // плавное появление
      nextTime = now + 0.3;
      playing = true;
      tick();
      timer = setInterval(tick, 500);
    } catch (e) { playing = false; }
    paint();
  }
  function stop() {
    if (!playing) return;
    playing = false;
    clearInterval(timer);
    var c = ctx, e = eng;
    try {
      var now = c.currentTime;
      e.master.gain.cancelScheduledValues(now);
      e.master.gain.setValueAtTime(Math.max(e.master.gain.value, 0.0001), now);
      e.master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      setTimeout(function () { if (!playing && c.suspend) c.suspend(); }, 1700);
    } catch (err) { /* уже остановлено */ }
    paint();
  }
  function toggle() { if (playing) { store("off"); stop(); } else { store("on"); start(); } }
  function next() { if (playing) { skip = true; tick(); } }

  function buildMini() {
    var label = { ru: "Следующая песня", kk: "Келесі ән", en: "Next song" };
    mini = document.createElement("div");
    mini.className = "mplayer"; mini.hidden = true;
    mini.innerHTML = '<span class="mplayer__note" aria-hidden="true">♪</span><span class="mplayer__name" aria-live="polite"></span>' +
      '<button class="mplayer__next" type="button" aria-label="' + label[lang()] + '" title="' + label[lang()] + '">⏭</button>';
    miniName = mini.querySelector(".mplayer__name");
    mini.querySelector(".mplayer__next").addEventListener("click", function (e) { e.stopPropagation(); next(); });
    document.body.appendChild(mini);
  }

  function init() {
    btn = document.getElementById("musicBtn");
    if (!btn) return;
    buildMini();
    paint();
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    if (stored() !== "off") {                                   // автозапуск после первого действия посетителя
      var first = function (e) {
        if (e.target && e.target.closest && e.target.closest("#musicBtn")) return;
        ["pointerdown", "keydown", "touchstart"].forEach(function (n) { document.removeEventListener(n, first, true); });
        if (stored() !== "off") start();
      };
      ["pointerdown", "keydown", "touchstart"].forEach(function (n) { document.addEventListener(n, first, true); });
    }
    document.addEventListener("visibilitychange", function () {
      if (!ctx || !playing) return;
      if (document.hidden) { if (ctx.suspend) ctx.suspend(); } else if (ctx.resume) ctx.resume();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();

  // для проверки: офлайн-рендер нескольких тактов выбранной пьесы и статистика уровня
  root.OGMusic = {
    tracks: TRACKS.map(function (t) { return { name: t.name, style: t.style, bpm: t.bpm, loops: t.loops, bars: t.prog.length }; }),
    isPlaying: function () { return playing; },
    state: function () { return ctx ? ctx.state : "none"; },
    current: function () { return TRACKS[current].name; },
    next: next,
    render: function (bars, track) {
      var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, sr = 44100, t = TRACKS[track || 0];
      var secs = Math.ceil(bars * (t.style === "waltz" ? 3 : 4) * 60 / t.bpm + 4);
      var oc = new OAC(2, sr * secs, sr), e = createEngine(oc, oc.destination);
      e.setTrack(track || 0); e.master.gain.value = LEVEL;
      for (var i = 0; i < bars; i++) e.scheduleBar(0.2 + i * e.barLength());
      return oc.startRendering().then(function (buf) {
        var peak = 0, sum = 0, n = 0, d = buf.getChannelData(0), bad = 0;
        for (var k = 0; k < d.length; k += 3) { var v = Math.abs(d[k]); if (v !== v) bad++; if (v > peak) peak = v; sum += v * v; n++; }
        return { peak: peak, rms: Math.sqrt(sum / n), seconds: secs, nan: bad, samples: Array.prototype.slice.call(d.subarray(0, Math.min(d.length, sr * 30))) };
      });
    }
  };
})(typeof window !== "undefined" ? window : this);
