// Фоновая музыка «как в ресторане»: тихий лаунж-джаз, который генерируется прямо в браузере (Web Audio),
// без аудиофайлов и лицензий. Свинг ~78 BPM, электропианино играет аккорды, контрабас «ходит» по ступеням,
// щёточные барабаны едва слышны, сверху редкие фразы рояля. Прогрессии ii–V–I чередуются и каждый раз
// звучат чуть по-разному. Браузеры запрещают звук до первого касания, поэтому музыка стартует после
// первого действия посетителя; кнопка 🎹 в шапке выключает и включает её (выбор запоминается).
(function (root) {
  "use strict";

  var BPM = 78, BEAT = 60 / BPM, SWING = 0.64;               // доля бита, на которую сдвигается «и» (свинг)
  var midi = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // аккорды: bass — корень (MIDI), vox — беcкорневое голосоведение для электропианино
  var C = {
    Dm9:   { bass: 38, vox: [53, 57, 60, 64], steps: [38, 41, 45, 48] },
    G13:   { bass: 43, vox: [53, 57, 59, 64], steps: [43, 47, 50, 53] },
    Cmaj9: { bass: 36, vox: [59, 62, 64, 67], steps: [36, 40, 43, 47] },
    Am9:   { bass: 45, vox: [55, 60, 64, 71], steps: [45, 48, 52, 55] },
    Em7:   { bass: 40, vox: [55, 59, 62, 67], steps: [40, 43, 47, 50] },
    A7:    { bass: 45, vox: [55, 61, 64, 69], steps: [45, 49, 52, 55] },
    Fmaj7: { bass: 41, vox: [57, 60, 64, 67], steps: [41, 45, 48, 52] }
  };
  // такты: массив аккордов (один — на весь такт, два — по два бита)
  var CYCLE_A = [["Dm9"], ["G13"], ["Cmaj9"], ["Am9"], ["Dm9"], ["G13"], ["Em7", "A7"], ["Dm9"]];
  var CYCLE_B = [["Fmaj7"], ["G13"], ["Em7", "A7"], ["Dm9"], ["G13"], ["Cmaj9"], ["Am9", "Dm9"], ["G13"]];
  // ноты мелодии: до-мажорная пентатоника + 9-я (мягкий джазовый звук)
  var SCALE = [64, 67, 69, 71, 72, 74, 76, 79, 81, 83, 84];
  // ритмы компинга в битах от начала такта (электропианино)
  var COMP = [[0, 1.65], [0, 2.65], [0.65, 2, 3.65], [0, 1.65, 3], [0.0, 2.0, 2.65]];

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

    // общий шум для щёток
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

    // ——— рояль (мелодия) ———
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

    // ——— щётки: райд, хет на 2 и 4, шорох «снейра» ———
    function brush(t, vel, kind) {
      var n = ctx.createBufferSource(); n.buffer = nb;
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      if (kind === "ride") { f.type = "bandpass"; f.frequency.value = 7600; f.Q.value = 1.4; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); }
      else if (kind === "hat") { f.type = "highpass"; f.frequency.value = 6000; g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); }
      else { f.type = "bandpass"; f.frequency.value = 3200; f.Q.value = 0.6; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); }
      n.connect(f); f.connect(g); g.connect(master); g.connect(send);
      n.start(t, rnd(0, 0.6), 0.35);
    }

    var bar = 0;
    function swingT(t0, beat) {                 // позиция в битах → секунды со свингом
      var whole = Math.floor(beat + 1e-6), frac = beat - whole;
      return t0 + (whole + (Math.abs(frac - 0.5) < 0.2 ? SWING : frac)) * BEAT;
    }
    function scheduleBar(t0) {
      var cycle = (Math.floor(bar / 8) % 2 === 0) ? CYCLE_A : CYCLE_B, idx = bar % 8, chords = cycle[idx];
      var nextChords = (idx === 7 ? ((Math.floor(bar / 8) + 1) % 2 === 0 ? CYCLE_A : CYCLE_B)[0] : cycle[idx + 1]);
      var nextRoot = C[nextChords[0]].bass;
      bar++;
      var chordAt = function (beat) { return C[chords.length === 1 ? chords[0] : chords[beat < 2 ? 0 : 1]]; };

      // контрабас: корень, ступень, ступень, подход к следующему аккорду
      for (var b = 0; b < 4; b++) {
        var c = chordAt(b), note;
        if (b === 0) note = c.bass;
        else if (b === 3) note = nextRoot + pick([-1, 1, -2, 1]);
        else note = c.steps[b === 1 ? pick([1, 2]) : pick([2, 3])];
        bass(clamp(note, 31, 52), t0 + b * BEAT + rnd(-0.008, 0.012), rnd(0.2, 0.27), BEAT * 0.95);
      }
      // электропианино: аккорды синкопами
      var rhythm = pick(COMP);
      rhythm.forEach(function (pos, k) {
        var c = chordAt(pos), at = swingT(t0, pos) + rnd(-0.01, 0.012), v = (k === 0 ? 0.2 : 0.15) * rnd(0.85, 1.1);
        c.vox.forEach(function (m, s) { rhodes(m, at + s * 0.011, v / (1 + s * 0.12)); });
      });
      // щётки
      [0, 1, 2, 3].forEach(function (bt) { brush(t0 + bt * BEAT, bt % 2 ? 0.05 : 0.04, "ride"); });
      brush(swingT(t0, 1.5), 0.034, "ride"); brush(swingT(t0, 3.5), 0.034, "ride");
      brush(t0 + 1 * BEAT, 0.05, "hat"); brush(t0 + 3 * BEAT, 0.05, "hat");
      if (Math.random() < 0.7) brush(t0 + 1 * BEAT, 0.06, "swish");
      if (Math.random() < 0.7) brush(t0 + 3 * BEAT, 0.06, "swish");
      // редкая фраза рояля
      if (Math.random() < 0.62) {
        var pos = pick([0.5, 1, 1.5, 2]), si = Math.floor(rnd(3, SCALE.length - 2)), count = Math.floor(rnd(2, 5));
        for (var n = 0; n < count && pos < 3.9; n++) {
          piano(SCALE[si], swingT(t0, pos) + rnd(-0.01, 0.02), rnd(0.26, 0.4), n === count - 1 ? 1.4 : 0.9);
          si = clamp(si + pick([-2, -1, -1, 1, 1, 2]), 0, SCALE.length - 1);
          pos += pick([0.5, 0.5, 1, 1.5]);
        }
      }
    }
    return { master: master, scheduleBar: scheduleBar, barLength: 4 * BEAT };
  }

  // ——— воспроизведение в браузере ———
  var KEY = "og-music";
  var ctx = null, eng = null, timer = null, playing = false, nextTime = 0, btn = null;
  var LEVEL = 0.4;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* хранилище недоступно */ } }
  function paint() {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(playing));
    btn.classList.toggle("is-on", playing);
  }
  function tick() {
    if (!ctx || !eng) return;
    while (nextTime < ctx.currentTime + 2.5) { eng.scheduleBar(nextTime); nextTime += eng.barLength; }
  }
  function start() {
    if (playing) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      if (!ctx) { ctx = new AC(); eng = createEngine(ctx, ctx.destination); }
      if (ctx.resume) ctx.resume();
      var now = ctx.currentTime;
      eng.master.gain.cancelScheduledValues(now);
      eng.master.gain.setValueAtTime(Math.max(eng.master.gain.value, 0.0001), now);
      eng.master.gain.exponentialRampToValueAtTime(LEVEL, now + 3);   // плавное появление
      nextTime = now + 0.3;
      tick();
      timer = setInterval(tick, 500);
      playing = true;
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

  function init() {
    btn = document.getElementById("musicBtn");
    if (!btn) return;
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

  // для проверки: офлайн-рендер нескольких тактов и статистика уровня
  root.OGMusic = {
    isPlaying: function () { return playing; },
    state: function () { return ctx ? ctx.state : "none"; },
    render: function (bars) {
      var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext, sr = 44100, secs = Math.ceil(bars * 4 * BEAT + 4);
      var oc = new OAC(2, sr * secs, sr), e = createEngine(oc, oc.destination);
      e.master.gain.value = LEVEL;
      for (var i = 0; i < bars; i++) e.scheduleBar(0.2 + i * e.barLength);
      return oc.startRendering().then(function (buf) {
        var peak = 0, sum = 0, n = 0, d = buf.getChannelData(0);
        for (var k = 0; k < d.length; k += 3) { var v = Math.abs(d[k]); if (v > peak) peak = v; sum += v * v; n++; }
        return { peak: peak, rms: Math.sqrt(sum / n), seconds: secs, samples: Array.prototype.slice.call(d.subarray(0, Math.min(d.length, sr * 30))) };
      });
    }
  };
})(typeof window !== "undefined" ? window : this);
