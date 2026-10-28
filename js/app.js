(function () {
  "use strict";

  var CAFES = window.CAFES || [];

  var KITCHENS = {
    kazakh: "Казахская",
    uzbek: "Узбекская и центральноазиатская",
    uyghur: "Уйгурская",
    georgian: "Грузинская",
    italian: "Итальянская",
    japanese: "Японская",
    chinese: "Китайская",
    panasian: "Паназиатская",
    indian: "Индийская",
    turkish: "Турецкая",
    mediterranean: "Средиземноморская",
    european: "Европейская",
    russian: "Русская",
    seafood: "Морепродукты",
    steak: "Стейки",
    grill: "Гриль и шашлык",
    pub: "Пабы и пивные",
    burger: "Бургеры",
    pizza: "Пицца",
    breakfast: "Завтраки",
    coffee: "Кофе",
    bakery: "Выпечка и десерты",
    canteen: "Столовые и фуд-холлы"
  };

  var FEATURES = {
    kids: "Детская комната",
    namaz: "Намазхана",
    halal: "Халал",
    veranda: "Летняя веранда",
    music: "Живая музыка",
    allday: "Круглосуточно",
    pets: "Можно с питомцами"
  };

  var PRICE_MAX = 35000;

  var state = { q: "", type: "Все", kitchen: "", sort: "rating", maxCheck: PRICE_MAX, feats: [] };

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), modal = $("modal"), mBody = $("mBody");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(n) { return Number(n).toLocaleString("ru-RU"); }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function img(url) { return url; }

  function ratingText(c) { return (c.ratingApprox ? "≈ " : "") + c.rating.toFixed(1); }

  function votesText(c) {
    return c.votes ? num(c.votes) + " " + plural(c.votes, "оценка", "оценки", "оценок") : "число оценок уточняется";
  }

  function checkText(c) { return (c.checkApprox ? "≈ " : "") + num(c.check) + " ₸"; }

  function tags(c, limit) {
    var list = c.features.slice(0, limit || 99);
    if (!list.length) return "";
    return '<div class="tags">' + list.map(function (f) { return '<span class="tag">' + esc(FEATURES[f]) + "</span>"; }).join("") + "</div>";
  }

  function openedText(c) {
    if (!c.opened) return "нет данных";
    return (c.openedApprox ? "≈ " : "") + c.opened;
  }

  // ——— фильтры ———
  function initControls() {
    var types = {};
    CAFES.forEach(function (c) { types[c.type] = (types[c.type] || 0) + 1; });
    var order = ["Все"].concat(Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }));
    $("types").innerHTML = order.map(function (t) {
      var n = t === "Все" ? CAFES.length : types[t];
      return '<button class="chip" type="button" role="tab" data-type="' + esc(t) + '" aria-selected="' + (t === state.type) + '">' +
        esc(t) + "<small>" + n + "</small></button>";
    }).join("");
    $("types").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      state.type = b.dataset.type;
      [].forEach.call(this.children, function (x) { x.setAttribute("aria-selected", x === b); });
      render();
    });

    var used = {};
    CAFES.forEach(function (c) { used[c.kitchen] = (used[c.kitchen] || 0) + 1; });
    $("cuisine").innerHTML = '<option value="">Все кухни</option>' + Object.keys(KITCHENS)
      .filter(function (k) { return used[k]; })
      .map(function (k) { return '<option value="' + k + '">' + esc(KITCHENS[k]) + " (" + used[k] + ")</option>"; })
      .join("");
    $("cuisine").addEventListener("change", function () { state.kitchen = this.value; render(); });
    $("sort").addEventListener("change", function () { state.sort = this.value; render(); });

    var price = $("price");
    price.value = PRICE_MAX;
    var showPrice = function () {
      $("priceOut").textContent = state.maxCheck >= PRICE_MAX ? "любой" : num(state.maxCheck) + " ₸";
    };
    showPrice();
    price.addEventListener("input", function () { state.maxCheck = Number(this.value); showPrice(); render(); });

    var featCount = {};
    CAFES.forEach(function (c) { c.features.forEach(function (f) { featCount[f] = (featCount[f] || 0) + 1; }); });
    $("feats").innerHTML = Object.keys(FEATURES).filter(function (f) { return featCount[f]; }).map(function (f) {
      return '<button class="chip" type="button" data-feat="' + f + '" aria-pressed="false">' + esc(FEATURES[f]) + "<small>" + featCount[f] + "</small></button>";
    }).join("");
    $("feats").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      var on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on);
      state.feats = [].filter.call(this.children, function (x) { return x.getAttribute("aria-pressed") === "true"; })
        .map(function (x) { return x.dataset.feat; });
      render();
    });

    var t;
    $("q").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(t);
      t = setTimeout(function () { state.q = v.trim().toLowerCase(); render(); }, 120);
    });
  }

  function haystack(c) {
    if (!c._hay) {
      c._hay = [c.name, c.type, c.cuisine, c.address, c.about, KITCHENS[c.kitchen]]
        .concat(c.features.map(function (f) { return FEATURES[f]; }))
        .concat(c.menu.map(function (m) { return m.name; }))
        .join(" ").toLowerCase();
    }
    return c._hay;
  }

  function filtered() {
    var list = CAFES.filter(function (c) {
      if (state.type !== "Все" && c.type !== state.type) return false;
      if (state.kitchen && c.kitchen !== state.kitchen) return false;
      if (state.q && haystack(c).indexOf(state.q) === -1) return false;
      if (state.maxCheck < PRICE_MAX && c.check > state.maxCheck) return false;
      for (var i = 0; i < state.feats.length; i++) if (c.features.indexOf(state.feats[i]) === -1) return false;
      return true;
    });
    var by = {
      rating: function (a, b) { return b.rating - a.rating || (b.votes || 0) - (a.votes || 0); },
      votes: function (a, b) { return (b.votes || 0) - (a.votes || 0); },
      cheap: function (a, b) { return a.check - b.check || b.rating - a.rating; },
      new: function (a, b) { return (b.opened || 0) - (a.opened || 0) || b.rating - a.rating; },
      old: function (a, b) { return (a.opened || 9999) - (b.opened || 9999) || b.rating - a.rating; },
      name: function (a, b) { return a.name.localeCompare(b.name, "ru"); }
    };
    return list.sort(by[state.sort]);
  }

  // ——— карточки ———
  function card(c) {
    return '<button class="card" type="button" data-id="' + esc(c.id) + '">' +
      '<div class="card__media">' +
        '<img src="' + esc(img(c.photos[0])) + '" alt="" loading="lazy" decoding="async">' +
        '<span class="card__type">' + esc(c.type) + "</span>" +
        '<span class="card__rating" title="Рейтинг 2ГИС"><span class="star">★</span>' + ratingText(c) + "</span>" +
      "</div>" +
      '<div class="card__body">' +
        '<h2 class="card__name">' + esc(c.name) + "</h2>" +
        '<div class="card__cuisine">' + esc(c.cuisine) + "</div>" +
        '<div class="card__meta"><span>Чек <b>' + checkText(c) + "</b></span><span>" + votesText(c) + "</span><span>Открыто: " + openedText(c) + "</span></div>" +
        '<div class="card__addr">📍 ' + esc(c.address) + "</div>" +
        tags(c, 3) +
      "</div></button>";
  }

  function render() {
    var list = filtered();
    grid.innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
    $("count").textContent = "Показано " + list.length + " " + plural(list.length, "заведение", "заведения", "заведений") +
      (list.length !== CAFES.length ? " из " + CAFES.length : "");
  }

  function renderStats() {
    var withVotes = CAFES.filter(function (c) { return c.votes; });
    var votes = withVotes.reduce(function (s, c) { return s + c.votes; }, 0);
    var avg = CAFES.reduce(function (s, c) { return s + c.rating; }, 0) / CAFES.length;
    var top = CAFES.filter(function (c) { return c.rating >= 4.8; }).length;
    $("stats").innerHTML = [
      [CAFES.length, "заведений"],
      [avg.toFixed(2) + " ★", "средний рейтинг 2ГИС"],
      [top, "с рейтингом 4.8+"],
      [num(votes), "оценок гостей"]
    ].map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + s[1] + "</span></div>"; }).join("");
  }

  // ——— карточка заведения ———
  function detail(c) {
    var menu = c.menu.map(function (m) {
      return '<li><span class="menu__name">' + esc(m.name) + (m.signature ? "<em>фирменное</em>" : "") +
        '</span><span class="menu__price">' + num(m.price) + " ₸</span></li>";
    }).join("");
    var thumbs = c.photos.map(function (p, i) {
      return '<button class="thumb" type="button" data-src="' + esc(img(p)) + '" aria-current="' + (i === 0) + '" aria-label="Фото ' + (i + 1) + '">' +
        '<img src="' + esc(img(p)) + '" alt="" loading="lazy"></button>';
    }).join("");

    return '<div class="gallery">' +
        '<div class="gallery__main"><img id="mMain" src="' + esc(img(c.photos[0])) + '" alt="' + esc(c.name) + '"></div>' +
        '<div class="gallery__thumbs">' + thumbs + "</div>" +
        '<p class="photo-note">Фото иллюстративные — реальные снимки заведения смотрите в 2ГИС.</p>' +
      "</div>" +
      '<div class="m">' +
        '<div class="m__head"><h2 id="mTitle">' + esc(c.name) + "</h2><p>" + esc(c.type) + " · " + esc(c.cuisine) + "</p></div>" +
        '<div class="facts">' +
          '<div class="fact"><div class="fact__label">Рейтинг 2ГИС</div><div class="fact__value"><span class="star">★</span> ' + ratingText(c) +
            '</div><div class="fact__note">' + votesText(c) + (c.ratingApprox ? ", значение приблизительное" : "") + "</div></div>" +
          '<div class="fact"><div class="fact__label">Год открытия</div><div class="fact__value">' + openedText(c) +
            '</div><div class="fact__note">' + esc(c.openedNote || "в открытых источниках не нашли — уточните у заведения") + "</div></div>" +
          '<div class="fact"><div class="fact__label">Средний чек</div><div class="fact__value">' + checkText(c) +
            '</div><div class="fact__note">' + (c.checkApprox ? "оценка по типу заведения, в 2ГИС не указан" : "по данным 2ГИС") + "</div></div>" +
        "</div>" +
        (c.features.length ? '<div class="m__section"><h3>Удобства</h3>' + tags(c) + "</div>" : "") +
        '<div class="m__section"><h3>Адрес</h3><p class="m__about">📍 ' + esc(c.address) + ", Алматы</p></div>" +
        (c.about ? '<div class="m__section"><h3>О заведении</h3><p class="m__about">' + esc(c.about) + "</p></div>" : "") +
        '<div class="m__section"><h3>Меню</h3><ul class="menu">' + menu + "</ul>" +
          '<p class="menu-note">Популярные позиции, цены ориентировочные. Полное и актуальное меню — в 2ГИС.</p></div>' +
        '<div class="actions">' +
          '<a class="btn" href="' + esc(c.gis) + '" target="_blank" rel="noopener">Открыть в 2ГИС ↗</a>' +
          '<button class="btn btn--ghost" type="button" id="mShare">Скопировать ссылку</button>' +
        "</div>" +
      "</div>";
  }

  function openCafe(id) {
    var c = CAFES.find(function (x) { return x.id === id; });
    if (!c) return;
    mBody.innerHTML = detail(c);
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
    document.title = c.name + " — OnlyGuests";
  }

  function closeCafe() {
    if (modal.open) modal.close();
  }

  modal.addEventListener("close", function () {
    document.title = "OnlyGuests — кафе и рестораны Алматы";
    if (location.hash.length > 1) location.hash = "";
  });

  grid.addEventListener("click", function (e) {
    var b = e.target.closest(".card");
    if (!b) return;
    if (location.hash === "#" + b.dataset.id) openCafe(b.dataset.id);
    else location.hash = b.dataset.id;
  });

  mBody.addEventListener("click", function (e) {
    var t = e.target.closest(".thumb");
    if (t) {
      $("mMain").src = t.dataset.src;
      [].forEach.call(mBody.querySelectorAll(".thumb"), function (x) { x.setAttribute("aria-current", x === t); });
      return;
    }
    if (e.target.id === "mShare") {
      var btn = e.target;
      var done = function () { btn.textContent = "Ссылка скопирована ✓"; };
      var fail = function () { btn.textContent = location.href; };
      try {
        navigator.clipboard.writeText(location.href).then(done, fail);
      } catch (err) { fail(); }
    }
  });

  $("mClose").addEventListener("click", closeCafe);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeCafe(); });

  window.addEventListener("hashchange", function () {
    var id = location.hash.slice(1);
    if (id) openCafe(decodeURIComponent(id)); else closeCafe();
  });

  // ——— тема ———
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("og-theme", t); } catch (e) { /* хранилище недоступно */ }
  }
  try {
    var saved = localStorage.getItem("og-theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) { /* хранилище недоступно */ }
  $("themeBtn").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "light" : "dark");
  });

  initControls();
  renderStats();
  render();
  if (location.hash.length > 1) openCafe(decodeURIComponent(location.hash.slice(1)));
})();
