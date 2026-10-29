(function () {
  "use strict";

  var OG = window.OG;
  var CAFES = window.CAFES || [];
  var LIVE = window.LIVE || {}, LIVE_META = window.LIVE_META || null;
  var INSIGHTS = window.INSIGHTS || {}, SCOUT = window.SCOUT || { items: [] };
  var I18N = window.I18N, I18N_DATA = window.I18N_DATA || {};
  var DEV = { phone: "+77006830247", email: "ItsTeamSwift@proton.me" };

  var KITCHENS = ["kazakh", "uzbek", "uyghur", "georgian", "italian", "japanese", "chinese", "panasian", "korean", "indian", "turkish",
    "mediterranean", "european", "russian", "seafood", "steak", "grill", "pub", "cocktail", "burger", "doner", "pizza", "breakfast",
    "coffee", "bakery", "canteen", "bistro", "mixed", "store", "konbini"];
  var FEATURES = ["kids", "namaz", "halal", "veranda", "music", "allday", "pets"];
  var COLLS = ["choice", "date", "breakfast", "view", "laptop", "lunch", "kids", "night", "cheap"];
  var DISTRICTS = ["Алмалинский", "Ауэзовский", "Бостандыкский", "Жетысуский", "Медеуский", "Наурызбайский", "Турксибский", "Алатауский"];
  var PIN = { "Ресторан": "#9c5a2c", "Кафе": "#c9853f", "Бистро": "#c9853f", "Кофейня": "#6b4226", "Бар": "#7a3e6e",
    "Донерная": "#d06a2a", "Бургерная": "#d06a2a", "Фастфуд": "#d06a2a", "Магазин": "#5f7d36", "Кондитерская": "#b5577a" };
  var PRICE_MAX = 35000;

  var state = { q: "", type: "Все", kitchen: "", district: "", sort: "rating", show: "all", maxCheck: PRICE_MAX,
    feats: [], openNow: false, colls: [], pos: null, view: "list" };

  var $ = function (id) { return document.getElementById(id); };
  var grid = $("grid"), modal = $("modal"), mBody = $("mBody");

  // ——— хранилище (только удобства одного посетителя) ———
  function load(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* хранилище недоступно */ }
  }
  var lists = { fav: load("og-fav", []), want: load("og-want", []), cmp: [] };

  // ——— язык ———
  var LANG = (function () {
    var p = (location.search.match(/[?&]lang=(ru|kk|en)/) || [])[1];
    if (p) return p;
    var s = load("og-lang", null);
    if (s && I18N[s]) return s;
    // по умолчанию — русский; казахский, если он основной язык браузера
    return (navigator.language || "").slice(0, 2) === "kk" ? "kk" : "ru";
  })();
  var LOCALE = function () { return LANG === "en" ? "en-GB" : LANG === "kk" ? "kk-KZ" : "ru-RU"; };

  function t(key, vars) {
    var s = (I18N[LANG] && I18N[LANG][key] != null) ? I18N[LANG][key] : I18N.ru[key];
    if (s == null) return key;
    if (typeof s === "string" && vars) s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ""; });
    return s;
  }
  function tr(text) {
    if (LANG === "ru" || !text) return text;
    var d = I18N_DATA[LANG];
    return (d && d[text]) || text;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) { return Number(n).toLocaleString(LOCALE()); }
  function plural(n, key) {
    var f = t(key);
    if (LANG === "en") return n === 1 ? f[0] : f[1];
    if (LANG === "kk") return f[0];
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return f[0];
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return f[1];
    return f[2];
  }
  function dateText(iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString(LOCALE(), { day: "numeric", month: "long" });
  }
  function typeName(type) { var n = t("type." + type); return n.indexOf("type.") === 0 ? type : n; }

  // ——— данные: базовые + агенты ———
  CAFES.forEach(function (c) {
    c.baseRating = c.rating;
    var l = LIVE[c.id];
    if (l) {
      c.checkedAt = l.confirmedAt || null;
      if (l.rating != null) {
        if (l.prev != null && l.prev !== l.rating) { c.prevRating = l.prev; c.changedAt = l.changedAt; }
        c.rating = l.rating;
        c.ratingApprox = false;
        if (l.votes) c.votes = l.votes;
        c.closed = !!l.closed;
      }
      if (l.hours) { c.hours = l.hours; c._hours = undefined; }
      if (l.check) { c.check = l.check; c.checkApprox = false; }                     // средний чек от агентов
      if (l.lat && l.lon) { c.lat = l.lat; c.lon = l.lon; if (l.district) c.district = l.district; if (l.address) c.address = l.address; } // уточнённое местоположение
      c.hist = l.hist || null;
    }
    if (INSIGHTS[c.id] && !INSIGHTS[c.id].empty) c.insight = INSIGHTS[c.id];
    c.partner = !!c.partner;
  });

  // ——— форматирование ———
  function ratingText(c) { return c.rating ? (c.ratingApprox ? "≈ " : "") + c.rating.toFixed(1) : "—"; }
  function votesText(c) { return c.votes ? num(c.votes) + " " + plural(c.votes, "w.vote") : t("card.noVotes"); }
  function checkText(c) { return (c.checkApprox ? "≈ " : "") + num(c.check) + " ₸"; }
  function openedText(c) { return c.opened ? (c.openedApprox ? "≈ " : "") + c.opened : t("opened.none"); }
  function distText(c) {
    if (!state.pos || !c.lat) return "";
    var d = OG.distanceKm(state.pos, c);
    return t("card.km", { d: d < 10 ? d.toFixed(1).replace(".", LANG === "en" ? "." : ",") : Math.round(d) });
  }
  function trendBadge(c) {
    if (c.prevRating == null) return "";
    var up = c.rating > c.prevRating;
    return '<span class="trend trend--' + (up ? "up" : "down") + '" title="' + esc(t("m.was", { r: c.prevRating.toFixed(1) })) + '">' +
      (up ? "▲" : "▼") + " " + esc(t("m.was", { r: c.prevRating.toFixed(1) })) + "</span>";
  }
  function openText(c) {
    var s = OG.openState(c);
    if (!s.known) return null;
    if (s.always) return { open: true, text: t("card.open24") };
    if (s.open) return { open: true, text: t("card.openUntil", { t: s.until }) };
    return { open: false, text: t("card.closedNow") + (s.opensAt ? " · " + t("card.opensAt", { t: (s.opensDay != null ? t("days")[s.opensDay] + " " : "") + s.opensAt }) : "") };
  }
  function tags(c, limit) {
    var list = c.features.slice(0, limit || 99);
    if (!list.length) return "";
    return '<div class="tags">' + list.map(function (f) { return '<span class="tag">' + esc(t("feat." + f)) + "</span>"; }).join("") + "</div>";
  }

  // ——— фильтры ———
  function haystack(c) {
    if (!c._hay || c._hayLang !== LANG) {
      c._hay = [c.name, c.type, typeName(c.type), c.cuisine, tr(c.cuisine), c.address, c.about, tr(c.about), t("kitchen." + c.kitchen), c.district || ""]
        .concat(c.features.map(function (f) { return t("feat." + f); }))
        .concat(c.menu.map(function (m) { return m.name + " " + tr(m.name); }))
        .join(" ").toLowerCase();
      c._hayLang = LANG;
    }
    return c._hay;
  }

  function filtered(ignoreShow) {
    var list = CAFES.filter(function (c) {
      if (state.type !== "Все" && c.type !== state.type) return false;
      if (state.kitchen && c.kitchen !== state.kitchen) return false;
      if (state.district && c.district !== state.district) return false;
      if (state.q && haystack(c).indexOf(state.q) === -1) return false;
      if (state.maxCheck < PRICE_MAX && c.check > state.maxCheck) return false;
      for (var i = 0; i < state.feats.length; i++) if (c.features.indexOf(state.feats[i]) === -1) return false;
      for (var j = 0; j < state.colls.length; j++) if (!OG.COLLECTIONS[state.colls[j]](c)) return false;
      if (state.openNow) { var s = OG.openState(c); if (!s.known || !s.open) return false; }
      if (!ignoreShow && state.show !== "all" && lists[state.show].indexOf(c.id) === -1) return false;
      return true;
    });
    var dist = function (c) { return state.pos && c.lat ? OG.distanceKm(state.pos, c) : 9999; };
    var by = {
      rating: function (a, b) { return (b.partner - a.partner) || b.rating - a.rating || (b.votes || 0) - (a.votes || 0); },
      votes: function (a, b) { return (b.votes || 0) - (a.votes || 0); },
      cheap: function (a, b) { return a.check - b.check || b.rating - a.rating; },
      new: function (a, b) { return (b.opened || 0) - (a.opened || 0) || b.rating - a.rating; },
      old: function (a, b) { return (a.opened || 9999) - (b.opened || 9999) || b.rating - a.rating; },
      name: function (a, b) { return a.name.localeCompare(b.name, "ru"); },
      near: function (a, b) { return dist(a) - dist(b); }
    };
    return list.sort(by[state.sort] || by.rating);
  }

  function chipsHTML(items, attr, pressed, counts) {
    return items.map(function (it) {
      return '<button class="chip" type="button" ' + attr + '="' + esc(it.key) + '" aria-pressed="' + (pressed.indexOf(it.key) >= 0) + '">' +
        esc(it.label) + (counts ? "<small>" + counts[it.key] + "</small>" : "") + "</button>";
    }).join("");
  }

  function buildControls() {
    var types = {};
    CAFES.forEach(function (c) { types[c.type] = (types[c.type] || 0) + 1; });
    var order = ["Все"].concat(Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }));
    $("types").innerHTML = order.map(function (k) {
      var n = k === "Все" ? CAFES.length : types[k];
      return '<button class="chip" type="button" role="tab" data-type="' + esc(k) + '" aria-selected="' + (k === state.type) + '">' +
        esc(k === "Все" ? t("types.all") : typeName(k)) + "<small>" + n + "</small></button>";
    }).join("");

    var used = {};
    CAFES.forEach(function (c) { used[c.kitchen] = (used[c.kitchen] || 0) + 1; });
    $("cuisine").innerHTML = '<option value="">' + esc(t("sel.cuisineAll")) + "</option>" + KITCHENS
      .filter(function (k) { return used[k]; })
      .map(function (k) { return '<option value="' + k + '">' + esc(t("kitchen." + k)) + " (" + used[k] + ")</option>"; }).join("");
    $("cuisine").value = state.kitchen;

    var dCount = {};
    CAFES.forEach(function (c) { if (c.district) dCount[c.district] = (dCount[c.district] || 0) + 1; });
    $("district").innerHTML = '<option value="">' + esc(t("sel.districtAll")) + "</option>" + DISTRICTS
      .filter(function (d) { return dCount[d]; })
      .map(function (d) { return '<option value="' + esc(d) + '">' + esc(t("district." + d)) + " (" + dCount[d] + ")</option>"; }).join("");
    $("district").value = state.district;

    var sorts = ["rating", "votes", "cheap", "new", "old", "name"].concat(state.pos ? ["near"] : []);
    $("sort").innerHTML = sorts.map(function (s) { return '<option value="' + s + '">' + esc(t("sort." + s)) + "</option>"; }).join("");
    $("sort").value = state.sort;

    $("show").innerHTML = ["all", "fav", "want"].map(function (s) {
      return '<option value="' + s + '">' + esc(t("show." + s)) + (s !== "all" ? " (" + lists[s].length + ")" : "") + "</option>";
    }).join("");
    $("show").value = state.show;

    var fc = { open: CAFES.filter(function (c) { return OG.openState(c).known; }).length };
    CAFES.forEach(function (c) { c.features.forEach(function (f) { fc[f] = (fc[f] || 0) + 1; }); });
    var feats = [{ key: "open", label: t("feat.open") }].concat(FEATURES.filter(function (f) { return fc[f]; })
      .map(function (f) { return { key: f, label: t("feat." + f) }; }));
    $("feats").innerHTML = chipsHTML(feats, "data-feat", state.feats.concat(state.openNow ? ["open"] : []), fc);

    var cc = {};
    COLLS.forEach(function (k) { cc[k] = CAFES.filter(OG.COLLECTIONS[k]).length; });
    $("colls").innerHTML = chipsHTML(COLLS.map(function (k) { return { key: k, label: t("coll." + k) }; }), "data-coll", state.colls, cc);
    showPrice();
  }

  function showPrice() {
    $("priceOut").textContent = state.maxCheck >= PRICE_MAX ? t("price.any") : num(state.maxCheck) + " ₸";
  }

  function initControls() {
    $("types").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      state.type = b.dataset.type;
      [].forEach.call(this.children, function (x) { x.setAttribute("aria-selected", x === b); });
      render();
    });
    $("cuisine").addEventListener("change", function () { state.kitchen = this.value; render(); });
    $("district").addEventListener("change", function () { state.district = this.value; render(); });
    $("sort").addEventListener("change", function () { state.sort = this.value; render(); });
    $("show").addEventListener("change", function () { state.show = this.value; render(); });
    var price = $("price");
    price.value = PRICE_MAX;
    price.addEventListener("input", function () { state.maxCheck = Number(this.value); showPrice(); render(); });
    $("feats").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      var on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on);
      if (b.dataset.feat === "open") state.openNow = on;
      else state.feats = [].filter.call(this.children, function (x) { return x.getAttribute("aria-pressed") === "true" && x.dataset.feat !== "open"; })
        .map(function (x) { return x.dataset.feat; });
      render();
    });
    $("colls").addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
      state.colls = [].filter.call(this.children, function (x) { return x.getAttribute("aria-pressed") === "true"; })
        .map(function (x) { return x.dataset.coll; });
      render();
    });
    var timer;
    $("q").addEventListener("input", function () {
      var v = this.value;
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = v.trim().toLowerCase(); render(); }, 120);
    });
  }

  // ——— карточки ———
  function card(c, i) {
    var o = openText(c), d = distText(c);
    return '<div class="cardw">' +
      '<button class="card" type="button" data-id="' + esc(c.id) + '">' +
        '<div class="card__media">' +
          '<img src="' + esc(c.photos[0]) + '" alt="" loading="lazy" decoding="async">' +
          '<span class="card__type">' + esc(typeName(c.type)) + (c.partner ? " · " + esc(t("card.ad")) : "") + "</span>" +
          '<span class="card__rating" title="' + esc(t("m.rating")) + '"><span class="star">★</span>' + ratingText(c) + trendBadge(c) + "</span>" +
          (c.closed ? '<span class="card__closed">' + esc(t("card.maybeClosed")) + "</span>" :
            c.partner ? '<span class="card__partner">' + esc(t("card.partner")) + "</span>" : "") +
        "</div>" +
        '<div class="card__body">' +
          (OG.isChoice(c) ? '<div class="choice" title="' + esc(t("choice.note")) + '">✦ ' + esc(t("choice.badge")) + "</div>" : "") +
          '<h2 class="card__name">' + esc(c.name) + "</h2>" +
          '<div class="card__cuisine">' + esc(tr(c.cuisine)) + "</div>" +
          '<div class="card__meta"><span>' + esc(t("card.check")) + " <b>" + checkText(c) + "</b></span><span>" + votesText(c) + "</span><span>" +
            esc(t("card.opened")) + " " + openedText(c) + "</span></div>" +
          (o || d ? '<div class="card__meta">' + (o ? '<span class="open ' + (o.open ? "open--yes" : "open--no") + '">' + esc(o.text) + "</span>" : "") +
            (d ? "<span>📍 " + esc(d) + "</span>" : "") + "</div>" : "") +
          '<div class="card__addr">📍 ' + esc(c.address) + "</div>" +
          tags(c, 3) +
        "</div></button>" +
      '<div class="card__tools">' + toolBtn(c, "fav", "♥", "card.fav") + toolBtn(c, "want", "🔖", "card.want") + toolBtn(c, "cmp", "⇄", "card.compare") + "</div>" +
      "</div>";
  }
  function toolBtn(c, list, icon, key) {
    var on = lists[list].indexOf(c.id) >= 0;
    return '<button class="tool" type="button" data-act="' + list + '" data-id="' + esc(c.id) + '" aria-pressed="' + on + '" title="' + esc(t(key)) +
      '" aria-label="' + esc(t(key)) + '">' + icon + "</button>";
  }

  function render() {
    var list = filtered();
    grid.innerHTML = list.map(card).join("");
    $("empty").hidden = list.length > 0;
    $("count").textContent = t("count", { n: list.length, w: plural(list.length, "w.place") }) +
      (list.length !== CAFES.length ? t("count.of", { total: CAFES.length }) : "");
    if (state.view === "map") drawMap(list);
  }

  function renderStats() {
    var votes = CAFES.reduce(function (s, c) { return s + (c.votes || 0); }, 0);
    var rated = CAFES.filter(function (c) { return c.rating; });
    var avg = rated.reduce(function (s, c) { return s + c.rating; }, 0) / (rated.length || 1);
    var top = CAFES.filter(function (c) { return c.rating >= 4.8; }).length;
    $("stats").innerHTML = [
      [CAFES.length, t("stats.places")], [avg.toFixed(2) + " ★", t("stats.avg")], [top, t("stats.top")], [num(votes), t("stats.votes")]
    ].map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + esc(s[1]) + "</span></div>"; }).join("");
    $("heroLead").textContent = t("hero.lead", { n: CAFES.length });
  }

  // ——— избранное, «хочу сходить», сравнение ———
  function toggle(list, id) {
    var arr = lists[list], i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else {
      if (list === "cmp" && arr.length >= 4) { flash(t("compare.max")); return false; }
      arr.push(id);
    }
    if (list !== "cmp") { save("og-" + list, arr); buildShowCounts(); }
    else updateCmpBar();
    return arr.indexOf(id) >= 0;
  }
  function buildShowCounts() {
    [].forEach.call($("show").options, function (o) {
      if (o.value !== "all") o.textContent = t("show." + o.value) + " (" + lists[o.value].length + ")";
    });
  }
  function updateCmpBar() {
    var n = lists.cmp.length;
    $("cmpbar").hidden = n === 0;
    $("cmpOpen").textContent = t("compare.bar", { n: n });
  }
  function flash(text) {
    var n = $("nearNote");
    n.textContent = text;
    n.hidden = false;
    clearTimeout(flash.t);
    flash.t = setTimeout(function () { n.hidden = true; }, 3500);
  }

  grid.addEventListener("click", function (e) {
    var tool = e.target.closest(".tool");
    if (tool) {
      var on = toggle(tool.dataset.act, tool.dataset.id);
      tool.setAttribute("aria-pressed", on);
      if (state.show !== "all" && tool.dataset.act === state.show) render();
      return;
    }
    var b = e.target.closest(".card");
    if (!b) return;
    if (location.hash === "#" + b.dataset.id) openCafe(b.dataset.id);
    else location.hash = b.dataset.id;
  });

  $("cmpOpen").addEventListener("click", function () {
    var items = lists.cmp.map(byId).filter(Boolean);
    if (items.length < 2) { flash(t("compare.hint")); return; }
    var rows = [
      ["", function (c) { return '<img class="cmp__img" src="' + esc(c.photos[0]) + '" alt=""><b>' + esc(c.name) + "</b>"; }],
      [t("m.rating"), function (c) { return "★ " + ratingText(c) + "<br><small>" + votesText(c) + "</small>"; }],
      [t("m.check"), checkText],
      [t("sel.cuisine"), function (c) { return esc(typeName(c.type)) + " · " + esc(tr(c.cuisine)); }],
      [t("m.hours"), function (c) { var o = openText(c); return o ? esc(o.text) : "—"; }],
      [t("m.year"), openedText],
      [t("sel.district"), function (c) { return c.district ? esc(t("district." + c.district)) : "—"; }],
      [t("m.features"), function (c) { return c.features.map(function (f) { return esc(t("feat." + f)); }).join(", ") || "—"; }]
    ];
    if (state.pos) rows.push(["📍", function (c) { return distText(c) || "—"; }]);
    rows.push(["", function (c) { return '<button class="btn btn--ghost btn--sm" type="button" data-open="' + esc(c.id) + '">' + esc(t("map.more")) + "</button>"; }]);
    $("cmpBody").innerHTML = '<div class="m__head"><h2 id="cmpTitle">' + esc(t("compare.title")) + "</h2></div>" +
      '<div class="cmp"><table><tbody>' + rows.map(function (r) {
        return "<tr><th>" + esc(r[0]) + "</th>" + items.map(function (c) { return "<td>" + r[1](c) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
    $("cmpModal").showModal();
  });
  $("cmpClear").addEventListener("click", function () {
    lists.cmp = [];
    updateCmpBar();
    [].forEach.call(grid.querySelectorAll('.tool[data-act="cmp"]'), function (x) { x.setAttribute("aria-pressed", "false"); });
  });

  // ——— карточка заведения ———
  function byId(id) { return CAFES.find(function (x) { return x.id === id; }); }

  function hoursHTML(c) {
    var h = c.features.indexOf("allday") >= 0 ? { always: true } : OG.parseHours(c.hours);
    if (!h) return '<p class="m__about">' + esc(t("m.hoursNone")) + "</p>";
    var o = openText(c), days = t("days");
    var head = o ? '<p class="open ' + (o.open ? "open--yes" : "open--no") + '">' + esc(o.text) + "</p>" : "";
    if (h.always) return head;
    var rows = [], i = 0, key = function (d) { return JSON.stringify(h.week[d] || []); };
    while (i < 7) {
      var j = i;
      while (j + 1 < 7 && key(j + 1) === key(i)) j++;
      var r = h.week[i] || [];
      var span = r.length ? r.map(function (x) {
        var f = function (m) { m = m % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
        return f(x[0]) + "–" + (x[1] >= 1440 && x[1] % 1440 === 0 ? "24:00" : f(x[1]));
      }).join(", ") : "—";
      rows.push("<li><span>" + days[i] + (j > i ? "–" + days[j] : "") + "</span><b>" + span + "</b></li>");
      i = j + 1;
    }
    return head + '<ul class="hours">' + rows.join("") + '</ul><p class="menu-note">' + esc(t("m.hoursSrc")) + "</p>";
  }

  function sparkline(c) {
    var pts = (c.hist || []).filter(function (p) { return p[1] != null; });
    if (pts.length < 2) return "";
    var w = 280, h = 64, pad = 6;
    var rs = pts.map(function (p) { return p[1]; });
    var min = Math.min.apply(null, rs) - 0.1, max = Math.max.apply(null, rs) + 0.1;
    var x = function (i) { return pad + i * (w - 2 * pad) / (pts.length - 1); };
    var y = function (r) { return h - pad - (r - min) / (max - min) * (h - 2 * pad); };
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1); }).join(" ");
    return '<div class="m__section"><h3>' + esc(t("m.trend")) + '</h3><svg class="spark" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(t("m.trend")) + '">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      pts.map(function (p, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p[1]).toFixed(1) + '" r="3"><title>' + esc(dateText(p[0]) + ": " + p[1].toFixed(1)) + "</title></circle>"; }).join("") +
      '</svg><p class="menu-note">' + esc(dateText(pts[0][0])) + " — " + esc(dateText(pts[pts.length - 1][0])) + ": " +
      pts[0][1].toFixed(1) + " → " + pts[pts.length - 1][1].toFixed(1) + "</p></div>";
  }

  function insightHTML(c) {
    var s = c.insight;
    if (!s) return "";
    var li = function (a) { return a.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join(""); };
    return '<div class="m__section"><h3>' + esc(t("m.insights")) + '</h3><div class="pc">' +
      (s.pros && s.pros.length ? '<div><b class="pc__h pc__h--pro">' + esc(t("m.pros")) + "</b><ul>" + li(s.pros) + "</ul></div>" : "") +
      (s.cons && s.cons.length ? '<div><b class="pc__h pc__h--con">' + esc(t("m.cons")) + "</b><ul>" + li(s.cons) + "</ul></div>" : "") +
      '</div><p class="menu-note">' + esc(t("m.insightsBy", { n: s.reviews || "—", d: dateText(s.at) })) + "</p></div>";
  }

  function detail(c) {
    var isStore = c.type === "Магазин";
    var menu = c.menu.map(function (m) {
      return '<li><span class="menu__name">' + esc(tr(m.name)) + (m.signature ? "<em>" + esc(t("m.signature")) + "</em>" : "") +
        '</span><span class="menu__price">' + num(m.price) + " ₸</span></li>";
    }).join("");
    var thumbs = c.photos.map(function (p, i) {
      return '<button class="thumb" type="button" data-src="' + esc(p) + '" aria-current="' + (i === 0) + '" aria-label="' + (i + 1) + '">' +
        '<img src="' + esc(p) + '" alt="" loading="lazy"></button>';
    }).join("");
    var on = function (l) { return lists[l].indexOf(c.id) >= 0; };
    return '<div class="gallery">' +
        '<div class="gallery__main"><img id="mMain" src="' + esc(c.photos[0]) + '" alt="' + esc(c.name) + '"></div>' +
        '<div class="gallery__thumbs">' + thumbs + "</div>" +
        '<p class="photo-note">' + esc(t("m.photoNote")) + "</p>" +
      "</div>" +
      '<div class="m">' +
        '<div class="m__head">' + (OG.isChoice(c) ? '<p class="choice choice--lg">✦ ' + esc(t("choice.badge")) + " <small>" + esc(t("choice.note")) + "</small></p>" : "") +
          '<h2 id="mTitle">' + esc(c.name) + (c.partner ? ' <span class="badge">' + esc(t("card.partner")) + "</span>" : "") + "</h2><p>" +
          esc(typeName(c.type)) + " · " + esc(tr(c.cuisine)) + "</p></div>" +
        '<div class="actions actions--tight">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="fav" aria-pressed="' + on("fav") + '">♥ ' + esc(t("card.fav")) + "</button>" +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="want" aria-pressed="' + on("want") + '">🔖 ' + esc(t("card.want")) + "</button>" +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="cmp" aria-pressed="' + on("cmp") + '">⇄ ' + esc(t("card.compare")) + "</button>" +
        "</div>" +
        '<div class="facts">' +
          '<div class="fact"><div class="fact__label">' + esc(t("m.rating")) + '</div><div class="fact__value"><span class="star">★</span> ' + ratingText(c) +
            trendBadge(c) + '</div><div class="fact__note">' + (c.rating ? votesText(c) + (c.ratingApprox ? esc(t("m.approx")) : "") : esc(t("m.unrated"))) +
            (c.checkedAt ? "<br>" + esc(t("m.checked", { d: dateText(c.checkedAt) })) : "") + "</div></div>" +
          '<div class="fact"><div class="fact__label">' + esc(t("m.year")) + '</div><div class="fact__value">' + openedText(c) +
            '</div><div class="fact__note">' + esc(c.openedNote ? tr(c.openedNote) : t("m.yearNone")) + "</div></div>" +
          '<div class="fact"><div class="fact__label">' + esc(t("m.check")) + '</div><div class="fact__value">' + checkText(c) +
            '</div><div class="fact__note">' + esc(c.checkApprox ? t("m.checkEst") : t("m.check2gis")) + "</div></div>" +
        "</div>" +
        sparkline(c) +
        '<div class="m__section"><h3>' + esc(t("m.hours")) + "</h3>" + hoursHTML(c) + "</div>" +
        (c.features.length ? '<div class="m__section"><h3>' + esc(t("m.features")) + "</h3>" + tags(c) + "</div>" : "") +
        '<div class="m__section"><h3>' + esc(t("m.address")) + '</h3><p class="m__about">📍 ' + esc(c.address) + ", Алматы" +
          (c.district ? " · " + esc(t("district." + c.district)) + " " + esc(t("m.district")) : "") + (distText(c) ? " · " + esc(distText(c)) : "") + "</p></div>" +
        (c.about ? '<div class="m__section"><h3>' + esc(t("m.about")) + '</h3><p class="m__about">' + esc(tr(c.about)) + "</p></div>" : "") +
        insightHTML(c) +
        '<div class="m__section"><h3>' + esc(t(isStore ? "m.goods" : "m.menu")) + '</h3><ul class="menu">' + menu + "</ul>" +
          '<p class="menu-note">' + esc(t(isStore ? "m.goodsNote" : "m.menuNote")) + "</p></div>" +
        '<div class="actions">' +
          '<a class="btn" href="' + esc(c.gis) + '" target="_blank" rel="noopener">' + esc(t("m.open2gis")) + "</a>" +
          '<a class="btn btn--ghost" href="' + esc(yandexLink(c)) + '" target="_blank" rel="noopener">' + esc(t("m.openYandex")) + "</a>" +
          '<a class="btn btn--ghost" href="' + esc(googleLink(c)) + '" target="_blank" rel="noopener">' + esc(t("m.openGoogle")) + "</a>" +
          (c.lat ? '<button class="btn btn--ghost" type="button" data-onmap="' + esc(c.id) + '">' + esc(t("m.onMap")) + "</button>" : "") +
          '<button class="btn btn--ghost" type="button" id="mShare">' + esc(t("m.share")) + "</button>" +
          '<a class="btn btn--ghost" href="' + reportLink(c) + '" target="_blank" rel="noopener">' + esc(t("m.report")) + "</a>" +
          '<button class="btn btn--ghost" type="button" data-owner="" data-place="' + esc(c.id) + '">' + esc(t("m.owner")) + "</button>" +
        "</div>" +
      "</div>";
  }

  // ссылки на то же место в других картах: поиск по названию (коды 162 — Алматы в Яндекс Картах)
  function yandexLink(c) { return "https://yandex.kz/maps/162/almaty/search/" + encodeURIComponent(c.name + (c.lat ? "" : " " + c.address)); }
  function googleLink(c) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.name + " Алматы " + (c.lat ? "" : c.address)); }

  function reportLink(c) {
    var text = "OnlyGuests: неточность у «" + c.name + "» (" + c.address + "): ";
    return "https://wa.me/" + DEV.phone.slice(1) + "?text=" + encodeURIComponent(text);
  }

  var openId = null;
  function openCafe(id) {
    var c = byId(id);
    if (!c) return;
    openId = id;
    mBody.innerHTML = detail(c);
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
    document.title = c.name + " — OnlyGuests";
  }
  function closeCafe() { if (modal.open) modal.close(); }
  function clearHash() {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; }
  }

  modal.addEventListener("close", function () {
    openId = null;
    document.title = t("title");
    if (location.hash.length > 1 && byId(decodeURIComponent(location.hash.slice(1)))) clearHash();
  });

  mBody.addEventListener("click", function (e) {
    var th = e.target.closest(".thumb");
    if (th) {
      $("mMain").src = th.dataset.src;
      [].forEach.call(mBody.querySelectorAll(".thumb"), function (x) { x.setAttribute("aria-current", x === th); });
      return;
    }
    var act = e.target.closest("[data-act]");
    if (act && openId) {
      act.setAttribute("aria-pressed", toggle(act.dataset.act, openId));
      var gt = grid.querySelector('.tool[data-act="' + act.dataset.act + '"][data-id="' + openId + '"]');
      if (gt) gt.setAttribute("aria-pressed", act.getAttribute("aria-pressed"));
      return;
    }
    var mp = e.target.closest("[data-onmap]");
    if (mp) { var id = mp.dataset.onmap; closeCafe(); setView("map", id); return; }
    if (e.target.id === "mShare") {
      var btn = e.target;
      copy(location.href, function () { btn.textContent = t("m.copied"); }, function () { btn.textContent = location.href; });
    }
  });

  document.addEventListener("click", function (e) {
    var cl = e.target.closest("[data-close]");
    if (cl) { cl.closest("dialog").close(); return; }
    var op = e.target.closest("[data-open]");
    if (op) {
      var d = op.closest("dialog");
      if (d && d !== modal) d.close();
      location.hash = op.dataset.open;
      if (location.hash === "#" + op.dataset.open) openCafe(op.dataset.open);
      return;
    }
    var ow = e.target.closest("[data-owner]");
    if (ow) { openOwner(ow.dataset.place || "", ow.dataset.owner === "partner"); return; }
    var b = e.target.closest("[data-copy]");
    if (b) {
      var label = b.textContent, val = b.dataset.copy;
      copy(val, function () { b.textContent = t("copied"); setTimeout(function () { b.textContent = label; }, 1800); }, function () { b.textContent = val; });
    }
  });
  [].forEach.call(document.querySelectorAll("dialog"), function (d) {
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
  });

  function copy(text, done, fail) {
    try { navigator.clipboard.writeText(text).then(done, fail); } catch (err) { fail(); }
  }

  window.addEventListener("hashchange", function () {
    var id = decodeURIComponent(location.hash.slice(1));
    if (byId(id)) openCafe(id); else closeCafe();
  });

  // ——— рядом со мной ———
  function locate(cb) {
    if (state.pos) { cb(true); return; }
    if (!navigator.geolocation) { flash(t("near.fail")); cb(false); return; }
    flash(t("near.wait"));
    try {
      navigator.geolocation.getCurrentPosition(function (p) {
        state.pos = { lat: p.coords.latitude, lon: p.coords.longitude };
        flash(t("near.ok"));
        cb(true);
      }, function () { flash(t("near.fail")); cb(false); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
    } catch (e) { flash(t("near.fail")); cb(false); }
  }
  $("nearBtn").addEventListener("click", function () {
    locate(function (ok) {
      if (!ok) return;
      state.sort = "near";
      buildControls();
      render();
      if (mapObj) placeYou();
    });
  });

  // ——— карта (Leaflet + OpenStreetMap) ———
  var mapObj = null, mapLayer = null, youMarker = null, leafletLoading = false;
  function loadLeaflet(cb) {
    if (window.L) { cb(true); return; }
    if (leafletLoading) { loadLeaflet.q.push(cb); return; }
    leafletLoading = true;
    loadLeaflet.q = [cb];
    // Leaflet лежит в репозитории (vendor/): карта не зависит от CDN
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "vendor/leaflet.css";
    document.head.appendChild(css);
    var s = document.createElement("script");
    s.src = "vendor/leaflet.js";
    s.onload = function () { loadLeaflet.q.forEach(function (f) { f(true); }); };
    s.onerror = function () { loadLeaflet.q.forEach(function (f) { f(false); }); leafletLoading = false; };
    document.head.appendChild(s);
  }

  function setView(v, focusId) {
    state.view = v;
    $("viewList").setAttribute("aria-pressed", v === "list");
    $("viewMap").setAttribute("aria-pressed", v === "map");
    $("map").hidden = v !== "map";
    grid.hidden = v === "map";
    if (v !== "map") { $("mapNote").hidden = true; render(); return; }
    $("mapNote").hidden = false;
    $("mapNote").textContent = t("map.loading");
    loadLeaflet(function (ok) {
      if (!ok) { $("mapNote").textContent = t("map.fail"); return; }
      if (!mapObj) {
        mapObj = L.map("map", { scrollWheelZoom: true, minZoom: 10, maxZoom: 18 }).setView([43.238, 76.92], 12);
        // 1) автономная подложка из репозитория (работает без интернета и в артефакте)
        if (window.BASEMAP) {
          L.imageOverlay(window.BASEMAP.src, window.BASEMAP.bounds, { opacity: 1, interactive: false, zIndex: 1 }).addTo(mapObj);
          mapObj.setMaxBounds([[window.BASEMAP.bounds[0][0] - 0.05, window.BASEMAP.bounds[0][1] - 0.08], [window.BASEMAP.bounds[1][0] + 0.05, window.BASEMAP.bounds[1][1] + 0.08]]);
        }
        // 2) поверх — чёткие плитки OpenStreetMap, если они доступны
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, zIndex: 2, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mapObj);
        mapLayer = L.layerGroup().addTo(mapObj);
        $("map").addEventListener("click", function (e) {
          var b = e.target.closest("[data-open]");
          if (b) { e.stopPropagation(); location.hash = b.dataset.open; }
        });
      }
      setTimeout(function () { mapObj.invalidateSize(); render(); if (state.pos) placeYou(); if (focusId) focus(focusId); }, 50);
    });
  }
  function popup(c) {
    var o = openText(c);
    return '<div class="pop"><b>' + esc(c.name) + "</b><br>" + esc(typeName(c.type)) + " · ★ " + ratingText(c) + " · " + checkText(c) +
      (o ? "<br>" + esc(o.text) : "") + '<br><button class="btn btn--sm" type="button" data-open="' + esc(c.id) + '">' + esc(t("map.more")) + "</button></div>";
  }
  var markers = {};
  function drawMap(list) {
    if (!mapObj) return;
    mapLayer.clearLayers();
    markers = {};
    var missing = 0;
    list.forEach(function (c) {
      if (!c.lat) { missing++; return; }
      var m = L.circleMarker([c.lat, c.lon], { radius: c.partner ? 9 : 7, color: "#fff", weight: 2, fillColor: PIN[c.type] || "#9c5a2c", fillOpacity: 0.95 })
        .bindPopup(popup(c)).bindTooltip(c.name);
      m.addTo(mapLayer);
      markers[c.id] = m;
    });
    if (missing && $("mapNote").textContent !== t("map.fail")) {
      $("mapNote").hidden = false;
      $("mapNote").textContent = t("map.noCoords", { n: missing });
    } else if (!missing && $("mapNote").textContent !== t("map.fail")) $("mapNote").hidden = true;
  }
  function focus(id) {
    var c = byId(id);
    if (!c || !c.lat) return;
    if (!markers[id]) { state.type = "Все"; state.q = ""; render(); }
    mapObj.setView([c.lat, c.lon], 16);
    if (markers[id]) markers[id].openPopup();
  }
  function placeYou() {
    if (!mapObj || !state.pos) return;
    if (youMarker) youMarker.remove();
    youMarker = L.circleMarker([state.pos.lat, state.pos.lon], { radius: 9, color: "#fff", weight: 3, fillColor: "#2b6cb0", fillOpacity: 1 })
      .bindTooltip(t("map.you"), { permanent: false }).addTo(mapObj);
    mapObj.setView([state.pos.lat, state.pos.lon], 14);
  }
  $("viewList").addEventListener("click", function () { setView("list"); });
  $("viewMap").addEventListener("click", function () { setView("map"); });

  // ——— мне повезёт ———
  var luckyPick = null;
  function spin() {
    var pool = filtered();
    var reel = $("luckyReel");
    if (!pool.length) { reel.innerHTML = '<p class="m__about">' + esc(t("lucky.none")) + "</p>"; luckyPick = null; return; }
    var weights = pool.map(function (c) { return Math.pow(c.rating, 4); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * total, k = 0;
    while (r > weights[k]) { r -= weights[k]; k++; }
    luckyPick = pool[Math.min(k, pool.length - 1)];
    var steps = 18, i = 0;
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var tick = function () {
      var c = i < steps && !reduce ? pool[Math.floor(Math.random() * pool.length)] : luckyPick;
      reel.innerHTML = '<div class="lucky__item' + (c === luckyPick && (i >= steps || reduce) ? " lucky__item--win" : "") + '">' +
        '<img src="' + esc(c.photos[0]) + '" alt=""><div><b>' + esc(c.name) + "</b><span>" + esc(typeName(c.type)) + " · ★ " + ratingText(c) +
        " · " + checkText(c) + "</span></div></div>";
      if (i++ < steps && !reduce) setTimeout(tick, 40 + i * i * 1.6);
    };
    tick();
  }
  $("luckyBtn").addEventListener("click", function () { $("luckyModal").showModal(); spin(); });
  $("luckyAgain").addEventListener("click", spin);
  $("luckyGo").addEventListener("click", function () {
    if (!luckyPick) return;
    $("luckyModal").close();
    location.hash = luckyPick.id;
  });

  // ——— ИИ-помощник «Куда пойти?» ———
  function describe(q) {
    var parts = [];
    q.types.forEach(function (x) { parts.push(typeName(x)); });
    q.kitchens.forEach(function (x) { parts.push(t("kitchen." + x)); });
    q.feats.forEach(function (x) { parts.push(t("feat." + x)); });
    q.collections.forEach(function (x) { if (x !== "cheap" || !q.maxCheck) parts.push(t("coll." + x)); });
    if (q.district) parts.push(t("district." + q.district));
    if (q.maxCheck) parts.push("≤ " + num(q.maxCheck) + " ₸");
    if (q.openNow) parts.push(t("feat.open"));
    if (q.near) parts.push(t("tools.near").replace(/^📍\s*/, ""));
    return parts;
  }
  function miniCard(c, why) {
    var o = openText(c), d = distText(c);
    return '<button class="mini" type="button" data-open="' + esc(c.id) + '"><img src="' + esc(c.photos[0]) + '" alt="" loading="lazy"><span>' +
      "<b>" + esc(c.name) + "</b><small>" + esc(typeName(c.type)) + " · ★ " + ratingText(c) + " · " + checkText(c) + (d ? " · " + esc(d) : "") +
      (o ? " · " + esc(o.text) : "") + "</small>" + (why ? "<em>" + esc(why) + "</em>" : "") + "</span></button>";
  }
  function compact(c) {
    var o = OG.openState(c);
    return { id: c.id, name: c.name, type: c.type, cuisine: c.cuisine, rating: c.rating, votes: c.votes, check: c.check,
      features: c.features, district: c.district || null, open: o.known ? o.open : null, km: state.pos && c.lat ? +OG.distanceKm(state.pos, c).toFixed(1) : null,
      about: c.about, pros: c.insight ? c.insight.pros : undefined };
  }
  function askLocal(text, q) {
    var res = OG.isEmpty(q) && !q.near ? CAFES.filter(function (c) {
      var hay = haystack(c);
      return text.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 2; }).some(function (w) { return hay.indexOf(w) >= 0; });
    }) : OG.search(CAFES, q, { pos: state.pos });
    if (OG.isEmpty(q) && !q.near) res.sort(function (a, b) { return b.rating - a.rating; });
    return res;
  }
  function renderAsk(text, q, res, ai) {
    var out = $("askOut"), parts = describe(q);
    if (!res.length && !(ai && ai.picks && ai.picks.length)) {
      out.innerHTML = '<p class="m__about">' + esc(t("ask.none")) + "</p>";
      return;
    }
    var picks = ai && ai.picks && ai.picks.length ? ai.picks.map(function (p) { return { c: byId(p.id), why: p.why }; }).filter(function (p) { return p.c; }) :
      res.slice(0, 4).map(function (c) { return { c: c, why: "" }; });
    out.innerHTML = (parts.length ? '<p class="ask__got"><b>' + esc(t("ask.understood")) + ":</b> " + parts.map(function (p) { return '<span class="tag">' + esc(p) + "</span>"; }).join(" ") + "</p>" : "") +
      "<p>" + esc(ai && ai.text ? t("ask.ai", { model: ai.model || "AI" }) : t("ask.local")) + "</p>" +
      (ai && ai.text ? '<p class="m__about">' + esc(ai.text) + "</p>" : "") +
      '<div class="minis">' + picks.map(function (p) { return miniCard(p.c, p.why); }).join("") + "</div>" +
      (res.length > picks.length ? '<button class="btn btn--ghost btn--sm" type="button" id="askAll">' + esc(t("count", { n: res.length, w: plural(res.length, "w.place") })) + " →</button>" : "");
    var all = $("askAll");
    if (all) all.addEventListener("click", function () { applyQuery(q); });
  }
  function applyQuery(q) {
    state.type = q.types.length === 1 ? q.types[0] : "Все";
    state.kitchen = q.kitchens.length === 1 ? q.kitchens[0] : "";
    state.feats = q.feats.slice();
    state.colls = q.collections.filter(function (x) { return x !== "cheap" || !q.maxCheck; });
    state.district = q.district || "";
    state.maxCheck = q.maxCheck || PRICE_MAX;
    state.openNow = q.openNow;
    state.q = "";
    $("q").value = "";
    $("price").value = state.maxCheck;
    if (q.near && state.pos) state.sort = "near";
    buildControls();
    render();
    $("count").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("ask").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = $("askQ").value.trim();
    if (!text) return;
    var q = OG.parseQuery(text);
    $("askOut").innerHTML = '<p class="m__about">' + esc(t("ask.thinking")) + "</p>";
    var go = function () {
      var res = askLocal(text, q);
      renderAsk(text, q, res, null);
      // Если сайт развёрнут с функцией /api/ask (Vercel), ответ уточняет бесплатная модель OpenRouter
      var api = document.querySelector('meta[name="og-api"]');
      if (!api || !window.fetch || location.protocol === "file:") return;
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
      var pool = (res.length ? res : CAFES.slice().sort(function (a, b) { return b.rating - a.rating; })).slice(0, 25).map(compact);
      fetch(api.content + "/ask", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ q: text, lang: LANG, understood: describe(q), candidates: pool }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (ai) { clearTimeout(timer); if (ai && ai.picks && ai.picks.length) renderAsk(text, q, res, ai); })
        .catch(function () { clearTimeout(timer); });
    };
    if (q.near) locate(function () { go(); }); else go();
  });

  // ——— панели: агенты, рейтинг недели, разведчик, партнёрство ———
  function renderAgents() {
    var el = $("agentsStatus");
    if (!LIVE_META) { el.textContent = t("agents.never"); return; }
    var moved = CAFES.filter(function (c) { return c.prevRating != null; }).length;
    el.textContent = t("agents.status", { d: dateText(LIVE_META.updatedAt), c: LIVE_META.checked, m: moved, model: LIVE_META.model });
  }

  function renderWeek() {
    var weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), moves = [];
    CAFES.forEach(function (c) {
      var h = (c.hist || []).filter(function (p) { return p[1] != null; });
      if (h.length < 2) return;
      var base = h[0];
      for (var i = 0; i < h.length; i++) if (h[i][0] <= weekAgo) base = h[i];
      var d = +(c.rating - base[1]).toFixed(1);
      if (d) moves.push({ c: c, d: d, from: base[1] });
    });
    var row = function (m) {
      return '<li><button class="linkbtn" type="button" data-open="' + esc(m.c.id) + '">' + esc(m.c.name) + "</button>" +
        '<span class="trend trend--' + (m.d > 0 ? "up" : "down") + '">' + (m.d > 0 ? "▲ +" : "▼ ") + m.d.toFixed(1) + "</span>" +
        "<small>" + m.from.toFixed(1) + " → " + m.c.rating.toFixed(1) + "</small></li>";
    };
    var up = moves.filter(function (m) { return m.d > 0; }).sort(function (a, b) { return b.d - a.d; }).slice(0, 5);
    var down = moves.filter(function (m) { return m.d < 0; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 5);
    $("weekBody").innerHTML = !moves.length ? '<p class="m__about">' + esc(t("week.empty")) + "</p>" :
      (up.length ? "<h3>" + esc(t("week.up")) + '</h3><ul class="moves">' + up.map(row).join("") + "</ul>" : "") +
      (down.length ? "<h3>" + esc(t("week.down")) + '</h3><ul class="moves">' + down.map(row).join("") + "</ul>" : "");
  }

  function renderScout() {
    var items = (SCOUT.items || []).slice(0, 8);
    $("scoutBody").innerHTML = !items.length ? '<p class="m__about">' + esc(t("scout.empty")) + "</p>" :
      "<p>" + esc(t("scout.text")) + '</p><ul class="moves">' + items.map(function (i) {
        var link = i.gis || i.source;
        return "<li>" + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener nofollow">' + esc(i.name) + "</a>" : "<b>" + esc(i.name) + "</b>") +
          (i.rating ? '<span class="trend">★ ' + Number(i.rating).toFixed(1) + "</span>" : "") +
          "<small>" + esc(typeName(i.type) || i.type) + " · " + esc(i.address) + (i.note ? " — " + esc(i.note) : "") + "</small></li>";
      }).join("") + "</ul>";
  }

  // ——— кабинет владельца ———
  var WHAT = [];
  function openOwner(placeId, partner) {
    var sel = $("oPlace");
    sel.innerHTML = '<option value="">' + esc(t("owner.placeNew")) + "</option>" + CAFES.slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name, "ru"); })
      .map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name + " — " + c.address) + "</option>"; }).join("");
    sel.value = placeId || "";
    $("oNewWrap").hidden = !!sel.value;
    WHAT = [];
    $("oWhat").innerHTML = t("owner.whatOpts").map(function (w, i) {
      return '<button class="chip" type="button" data-w="' + i + '" aria-pressed="false">' + esc(w) + "</button>";
    }).join("");
    $("oPartner").checked = !!partner;
    if (modal.open) modal.close();
    $("ownerModal").showModal();
  }
  $("oPlace").addEventListener("change", function () { $("oNewWrap").hidden = !!this.value; });
  $("oWhat").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true");
    WHAT = [].filter.call(this.children, function (x) { return x.getAttribute("aria-pressed") === "true"; }).map(function (x) { return x.textContent; });
  });
  function ownerText() {
    var c = byId($("oPlace").value);
    return ["OnlyGuests — заявка владельца",
      "Заведение: " + (c ? c.name + " (" + c.address + ")" : $("oNew").value.trim() || "—"),
      "Имя: " + ($("oName").value.trim() || "—"),
      "Телефон: " + ($("oPhone").value.trim() || "—"),
      "Что изменить: " + (WHAT.join(", ") || "—"),
      "Партнёрство за 10 000 ₸: " + ($("oPartner").checked ? "да" : "нет"),
      "Комментарий: " + ($("oMsg").value.trim() || "—")].join("\n");
  }
  $("ownerForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = ownerText();
    copy(text, function () {}, function () {});
    window.open("https://wa.me/" + DEV.phone.slice(1) + "?text=" + encodeURIComponent(text), "_blank", "noopener");
  });
  $("oMail").addEventListener("click", function () {
    var text = ownerText();
    copy(text, function () {}, function () {});
    location.href = "mailto:" + DEV.email + "?subject=" + encodeURIComponent("OnlyGuests — заявка владельца") + "&body=" + encodeURIComponent(text);
  });

  // ——— язык интерфейса ———
  function applyI18n() {
    document.documentElement.lang = LANG;
    document.title = openId ? document.title : t("title");
    [].forEach.call(document.querySelectorAll("[data-i18n]"), function (el) { el.textContent = t(el.dataset.i18n); });
    [].forEach.call(document.querySelectorAll("[data-i18n-html]"), function (el) { el.innerHTML = t(el.dataset.i18nHtml); });
    [].forEach.call(document.querySelectorAll("[data-i18n-ph]"), function (el) { el.placeholder = t(el.dataset.i18nPh); el.setAttribute("aria-label", t(el.dataset.i18nPh)); });
    [].forEach.call(document.querySelectorAll("[data-i18n-aria]"), function (el) { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    [].forEach.call(document.querySelectorAll("[data-lang]"), function (b) { b.setAttribute("aria-pressed", b.dataset.lang === LANG); });
    $("askExamples").innerHTML = t("ask.examples").split(" · ").map(function (x) {
      return '<button class="chip chip--ex" type="button" data-ex>' + esc(x) + "</button>";
    }).join("");
    $("partnerList").innerHTML = t("partner.list").map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
    buildControls();
    renderStats();
    renderAgents();
    renderWeek();
    renderScout();
    updateCmpBar();
    render();
    if (openId) openCafe(openId);
  }
  document.querySelector(".lang").addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang]");
    if (!b || b.dataset.lang === LANG) return;
    LANG = b.dataset.lang;
    save("og-lang", LANG);
    applyI18n();
  });
  $("askExamples").addEventListener("click", function (e) {
    var b = e.target.closest("[data-ex]");
    if (!b) return;
    $("askQ").value = b.textContent;
    $("ask").requestSubmit ? $("ask").requestSubmit() : $("askBtn").click();
  });

  // ——— тема ———
  function setTheme(th) {
    document.documentElement.setAttribute("data-theme", th);
    save("og-theme", th);
  }
  var savedTheme = load("og-theme", null);
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  $("themeBtn").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "light" : "dark");
  });

  initControls();
  applyI18n();
  // ?q=… (из Telegram-бота и поиска Google) — сразу спрашиваем помощника
  var q0 = (location.search.match(/[?&]q=([^&]+)/) || [])[1];
  if (q0) {
    try { $("askQ").value = decodeURIComponent(q0.replace(/\+/g, " ")); } catch (e) { $("askQ").value = q0; }
    $("ask").dispatchEvent(new Event("submit", { cancelable: true }));
  }
  if (location.hash.length > 1) openCafe(decodeURIComponent(location.hash.slice(1)));
})();
