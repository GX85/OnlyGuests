// Claw'd — пиксельный оранжевый маскот Claude Code. Здесь он нарисован заново из прямоугольников (SVG).
//  • в шапке лендинга выходит, машет, прыгает и танцует; по клику показывает подсказку и разные трюки;
//  • на каждой карточке места занят своим делом (12 анимаций), анимация идёт только пока карточка на экране.
// Только CSS-трансформации, без картинок; при «уменьшить движение» остаётся статичная поза.
(function (root) {
  "use strict";

  var ANIMS = ["wave", "jump", "dance", "turn", "peek", "coffee", "sleep", "juggle", "music", "flex", "surprise", "walk"];
  var O = "#D97757", SH = "#B9553A", EYE = "#1d120c", CREAM = "#f6eadb";

  function r(x, y, w, h, fill, cls) { return '<rect' + (cls ? ' class="' + cls + '"' : "") + ' x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"/>'; }

  // тело на сетке: 15 × 8 клеток (руки по бокам, четыре ножки)
  function body() {
    return '<g class="cl-all">' +
      '<g class="cl-armL">' + r(1, 3, 2, 2, O) + "</g>" +
      '<g class="cl-armR">' + r(12, 3, 2, 2, O) + "</g>" +
      '<g class="cl-legs"><g class="cl-legA">' + r(4, 6, 1, 2, SH) + r(8, 6, 1, 2, SH) + '</g><g class="cl-legB">' + r(6, 6, 1, 2, SH) + r(10, 6, 1, 2, SH) + "</g></g>" +
      r(4, 0, 7, 1, O) + r(3, 1, 9, 5, O) + r(3, 5, 9, 1, SH) +
      '<g class="cl-eyes">' + r(5, 2, 1, 2, EYE) + r(9, 2, 1, 2, EYE) + "</g>" +
      "</g>";
  }

  // реквизит для каждой анимации
  var PROPS = {
    coffee: '<g class="cl-cup">' + r(14, 3, 3, 3, CREAM) + r(14, 3, 3, 1, "#6b4226") + r(17, 3.6, 1, 1.4, CREAM) + "</g>" +
            '<g class="cl-steam">' + r(14.6, 1, 0.6, 1.2, "#fff") + r(15.9, 0.4, 0.6, 1.2, "#fff") + "</g>",
    sleep: '<text class="cl-z cl-z1" x="12" y="-1" font-size="3" fill="' + CREAM + '" font-family="sans-serif" font-weight="700">z</text>' +
           '<text class="cl-z cl-z2" x="13.5" y="-3" font-size="2.4" fill="' + CREAM + '" font-family="sans-serif" font-weight="700">z</text>' +
           '<text class="cl-z cl-z3" x="15" y="-5" font-size="1.9" fill="' + CREAM + '" font-family="sans-serif" font-weight="700">z</text>',
    juggle: '<g class="cl-ball cl-b1">' + r(3, -3, 1.6, 1.6, "#f6eadb") + '</g><g class="cl-ball cl-b2">' + r(3, -3, 1.6, 1.6, "#8fb86a") + '</g><g class="cl-ball cl-b3">' + r(3, -3, 1.6, 1.6, "#e7b84a") + "</g>",
    music: '<text class="cl-note cl-n1" x="11.5" y="0" font-size="3.4" fill="' + CREAM + '" font-family="sans-serif">♪</text>' +
           '<text class="cl-note cl-n2" x="-0.5" y="1" font-size="3" fill="' + CREAM + '" font-family="sans-serif">♫</text>',
    surprise: '<g class="cl-bang">' + r(6.8, -6.2, 1.4, 3.6, "#f6eadb") + r(6.8, -1.9, 1.4, 1.4, "#f6eadb") + "</g>",
    flex: '<g class="cl-spark">' + r(0, -3, 1, 1, "#f6eadb") + r(14, -4, 1, 1, "#f6eadb") + r(7, -6, 1, 1, "#f6eadb") + "</g>"
  };

  function svg(anim, extraClass) {
    return '<svg class="clawd k-' + anim + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 21 17" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
      '<g transform="translate(2 9)">' + body() + (PROPS[anim] || "") + "</g></svg>";
  }

  // на карточку: своя анимация, соседние карточки отличаются
  function card(i) { return '<span class="clawd-track">' + svg(ANIMS[i % ANIMS.length]) + "</span>"; }

  // анимация идёт только на видимых карточках
  var io = null;
  function observe(scope) {
    var list = (scope || document).querySelectorAll(".clawd");
    if (!("IntersectionObserver" in root)) { [].forEach.call(list, function (e) { e.classList.add("on"); }); return; }
    if (io) io.disconnect();
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle("on", en.isIntersecting); });
    }, { rootMargin: "80px" });
    [].forEach.call(list, function (e) { io.observe(e); });
  }

  // ——— большой Claw'd в шапке лендинга ———
  var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var T = function (k) { return (OGClawd.t && OGClawd.t(k)) || ""; };
  var hero = null, slot = null, bubble = null, timers = [], bubbleTimer = null, quip = 0;

  function say(text, ms) {
    if (!bubble || !text) return;
    bubble.textContent = text; bubble.hidden = false; bubble.classList.remove("pop"); void bubble.offsetWidth; bubble.classList.add("pop");
    clearTimeout(bubbleTimer); bubbleTimer = setTimeout(function () { bubble.hidden = true; }, ms || 4200);
  }
  function play(anim, extra) { slot.innerHTML = svg(anim, "on " + (extra || "")); }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function intro() {
    timers.forEach(clearTimeout); timers = [];
    if (reduce) { play("idle"); return; }
    play("walkin");
    later(function () { play("wave"); say(T("clawd.hi"), 4800); }, 3300);
    later(function () { play("jump"); }, 6000);
    later(function () { play("dance"); }, 8400);
    later(function () { play("idle"); }, 11500);
  }
  function trick() {
    timers.forEach(clearTimeout); timers = [];
    var anims = ANIMS.slice(), a = anims[Math.floor(Math.random() * anims.length)];
    play(a === "walk" ? "dance" : a);                      // «прогулка» нужна только на карточках
    var q = T("clawd.quips"); if (q && q.length) say(q[quip++ % q.length], 4200);
    later(function () { play("idle"); }, 3800);
  }
  function mountHero(el, bub) {
    hero = el; bubble = bub; slot = el.querySelector(".clawd-slot");
    if (!slot) return;
    el.addEventListener("click", trick);
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); trick(); } });
    intro();
  }

  var OGClawd = { svg: svg, card: card, observe: observe, mountHero: mountHero, ANIMS: ANIMS, t: null };
  root.OGClawd = OGClawd;
})(typeof window !== "undefined" ? window : this);
