// Спокойная фоновая музыка на «пианино»: генерируется прямо в браузере (Web Audio), без аудиофайлов и лицензий.
// Медленные аккорды в до мажоре с мягким арпеджио и редкими нотами мелодии, реверберация, тихая громкость.
// Браузеры запрещают звук до первого касания страницы, поэтому музыка включается после первого действия
// посетителя; кнопка 🎹 в шапке выключает и снова включает её (выбор запоминается).
(function (root) {
  "use strict";

  var BPM = 56, BEAT = 60 / BPM;
  var midi = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  // аккорды: бас + тона (MIDI). Две прогрессии чередуются, чтобы музыка не надоедала.
  var A = [
    { bass: 36, tones: [55, 59, 64, 67] },          // Cmaj7
    { bass: 33, tones: [52, 55, 60, 64] },          // Am7
    { bass: 41, tones: [48, 52, 57, 60, 64] },      // Fmaj7
    { bass: 43, tones: [50, 55, 59, 62, 64] }       // G6
  ];
  var B = [
    { bass: 36, tones: [55, 59, 64, 67] },          // Cmaj7
    { bass: 40, tones: [52, 55, 59, 62] },          // Em7
    { bass: 38, tones: [50, 53, 57, 60, 64] },      // Dm9
    { bass: 41, tones: [48, 52, 57, 60, 64] }       // Fmaj7
  ];
  var MELODY = [72, 74, 76, 79, 81, 84];             // пентатоника до мажора
  var PATTERNS = [[0, 1, 2, 3, 2, 1, 2, 1], [0, 2, 1, 3, 2, 3, 1, 2], [0, 1, 2, 1, 3, 2, 1, 0], [0, 2, 3, 2, 1, 2, 3, 2]];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // ——— синтезатор «пианино» ———
  function createEngine(ctx, destination) {
    var master = ctx.createGain();
    master.gain.value = 0.0001;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.4;
    master.connect(comp); comp.connect(destination);

    // реверберация из затухающего шума
    var rate = ctx.sampleRate, len = Math.floor(rate * 3.4), ir = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = ir.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    var verb = ctx.createConvolver(); verb.buffer = ir;
    var verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
    verb.connect(verbOut); verbOut.connect(master);
    var send = ctx.createGain(); send.gain.value = 0.5; send.connect(verb);

    // короткий шум «молоточка»
    var nb = ctx.createBuffer(1, Math.floor(rate * 0.04), rate), nd = nb.getChannelData(0);
    for (var j = 0; j < nd.length; j++) nd[j] = (Math.random() * 2 - 1) * (1 - j / nd.length);

    var PARTIALS = [[1, 1], [2, 0.55], [3, 0.32], [4, 0.2], [5, 0.12], [6, 0.07], [8, 0.03]];

    function note(m, t, vel, hold) {
      var f = midi(m);
      var dec = Math.max(1.8, Math.min(5.2, 6.4 - m / 18)) * (hold || 1);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      var filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.setValueAtTime(Math.min(f * 14, 9000), t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(f * 3.2, 1100), t + 0.9);
      filt.Q.value = 0.4;
      g.connect(filt); filt.connect(master); filt.connect(send);
      PARTIALS.forEach(function (p) {
        var o = ctx.createOscillator(), pg = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f * p[0] * (1 + 0.00025 * p[0] * p[0]);   // лёгкая негармоничность струны
        o.detune.value = rnd(-3, 3);
        pg.gain.value = p[1];
        o.connect(pg); pg.connect(g);
        o.start(t); o.stop(t + dec + 0.1);
      });
      var n = ctx.createBufferSource(); n.buffer = nb;
      var nf = ctx.createBiquadFilter(); nf.type = "lowpass"; nf.frequency.value = 1100;
      var ng = ctx.createGain(); ng.gain.value = vel * 0.18;
      n.connect(nf); nf.connect(ng); ng.connect(master);
      n.start(t);
    }

    var bar = 0;
    function scheduleBar(t0) {
      var prog = (Math.floor(bar / 4) % 2 === 0) ? A : B, ch = prog[bar % 4], pat = pick(PATTERNS);
      bar++;
      note(ch.bass, t0, 0.5, 1.15);
      if (ch.bass + 12 < 50) note(ch.bass + 12, t0 + 0.02, 0.18, 1);
      for (var i = 0; i < 8; i++) {
        if (Math.random() < 0.16) continue;                           // паузы делают игру живой
        var m = ch.tones[pat[i] % ch.tones.length];
        note(m, t0 + (i * BEAT / 2) + rnd(-0.012, 0.014), rnd(0.2, 0.34), 1);
      }
      if (Math.random() < 0.6) {                                      // редкая мелодия
        var k = Math.floor(rnd(0, MELODY.length)), at = (Math.random() < 0.5 ? 1 : 2) * BEAT + rnd(0, 0.03);
        note(MELODY[k], t0 + at, rnd(0.3, 0.42), 1.2);
        if (Math.random() < 0.45) note(MELODY[Math.max(0, Math.min(MELODY.length - 1, k + (Math.random() < 0.5 ? -1 : 1)))], t0 + at + BEAT, rnd(0.26, 0.36), 1.3);
      }
    }
    return { master: master, scheduleBar: scheduleBar, barLength: 4 * BEAT };
  }

  // ——— воспроизведение в браузере ———
  var KEY = "og-music";
  var ctx = null, eng = null, timer = null, playing = false, nextTime = 0, btn = null;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* хранилище недоступно */ } }

  function paint() {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(playing));
    btn.classList.toggle("is-on", playing);
  }

  function tick() {
    if (!ctx || !eng) return;
    while (nextTime < ctx.currentTime + 2) {
      eng.scheduleBar(nextTime);
      nextTime += eng.barLength;
    }
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
      eng.master.gain.exponentialRampToValueAtTime(0.42, now + 2.5);   // плавное появление, тихо
      nextTime = now + 0.25;
      tick();
      timer = setInterval(tick, 400);
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
      e.master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      setTimeout(function () { if (!playing && c.suspend) c.suspend(); }, 1500);
    } catch (err) { /* уже остановлено */ }
    paint();
  }

  function toggle() {
    if (playing) { store("off"); stop(); } else { store("on"); start(); }
  }

  function init() {
    btn = document.getElementById("musicBtn");
    if (!btn) return;
    paint();
    btn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
    // автозапуск после первого действия посетителя, если он сам не выключал музыку
    if (stored() !== "off") {
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
      e.master.gain.value = 0.42;
      for (var i = 0; i < bars; i++) e.scheduleBar(0.2 + i * e.barLength);
      return oc.startRendering().then(function (buf) {
        var peak = 0, sum = 0, n = 0, d = buf.getChannelData(0);
        for (var k = 0; k < d.length; k += 3) { var v = Math.abs(d[k]); if (v > peak) peak = v; sum += v * v; n++; }
        return { peak: peak, rms: Math.sqrt(sum / n), seconds: secs, samples: Array.prototype.slice.call(d.subarray(0, sr * 12)) };
      });
    }
  };
})(typeof window !== "undefined" ? window : this);
