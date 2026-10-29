// OnlyGuests core: часы работы, разбор запросов, подборки и поиск.
// Общий код для сайта (window.OG), ИИ-помощника и Telegram-бота (require("../js/core.js")).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.OG = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  // ——— часы работы (подмножество формата OpenStreetMap) ———
  function toMin(t) {
    var p = t.split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function parseDays(s) {
    var set = [];
    s.split(",").forEach(function (part) {
      var r = part.split("-"), a = DAYS.indexOf(r[0]), b = DAYS.indexOf(r[1] || r[0]);
      if (a < 0 || b < 0) return;
      for (var i = a; ; i = (i + 1) % 7) { set.push(i); if (i === b) break; }
    });
    return set;
  }

  // "Mo-Fr 09:00-22:00; Sa,Su 10:00-02:00" → [[ [540,1320] ], …] по дням недели (0 — понедельник)
  function parseHours(str) {
    if (!str) return null;
    // правила иногда разделяют запятой вместо «;» и пишут часы одной цифрой
    str = String(str).trim().replace(/(\d),\s*(?=(Mo|Tu|We|Th|Fr|Sa|Su)\b)/g, "$1; ").replace(/\b(\d):(\d\d)/g, "0$1:$2");
    if (/^24\/7\b/.test(str)) return { always: true };
    var week = [null, null, null, null, null, null, null], any = false;
    str.split(/\s*;\s*/).forEach(function (rule) {
      if (!rule || /^PH\b/.test(rule)) return;
      var m = rule.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/);
      if (!m) return;
      var days = m[1] ? parseDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
      var spec = m[2].trim(), ranges = [];
      if (spec !== "off" && spec !== "closed") {
        spec.split(",").forEach(function (r) {
          var t = r.trim().match(/^(\d\d?:\d\d)-(\d\d?:\d\d)$/);
          if (!t) return;
          var a = toMin(t[1]), b = toMin(t[2]);
          if (b <= a) b += 1440;
          ranges.push([a, b]);
        });
        if (!ranges.length) return;
      }
      days.forEach(function (d) { week[d] = ranges; });
      any = true;
    });
    if (!any) return null;
    var full = week.every(function (r) { return r && r.length === 1 && r[0][0] === 0 && r[0][1] >= 1440; });
    return full ? { always: true } : { week: week };
  }

  // Текущее время в Алматы: день недели (0 — понедельник) и минуты
  function almatyNow(date) {
    date = date || new Date();
    try {
      var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })
        .formatToParts(date);
      var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value; };
      return { day: DAYS.indexOf(get("weekday").slice(0, 2)), min: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
    } catch (e) {
      var d = new Date(date.getTime() + (date.getTimezoneOffset() + 300) * 60000);
      return { day: (d.getDay() + 6) % 7, min: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function fmt(min) {
    min = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }

  // { known, open, always, until, opensAt } — состояние на текущий момент
  function openState(c, date) {
    var h = c._hours !== undefined ? c._hours : (c._hours = c.features && c.features.indexOf("allday") >= 0 ? { always: true } : parseHours(c.hours));
    if (!h) return { known: false };
    if (h.always) return { known: true, open: true, always: true };
    var now = almatyNow(date), prev = (now.day + 6) % 7, i, r;
    var today = h.week[now.day] || [], yest = h.week[prev] || [];
    for (i = 0; i < yest.length; i++) {
      r = yest[i];
      if (r[1] > 1440 && now.min < r[1] - 1440) return { known: true, open: true, until: fmt(r[1]) };
    }
    for (i = 0; i < today.length; i++) {
      r = today[i];
      if (now.min >= r[0] && now.min < r[1]) return { known: true, open: true, until: fmt(r[1]) };
    }
    for (i = 0; i < today.length; i++) if (today[i][0] > now.min) return { known: true, open: false, opensAt: fmt(today[i][0]) };
    for (var k = 1; k <= 7; k++) {
      var d = h.week[(now.day + k) % 7];
      if (d && d.length) return { known: true, open: false, opensAt: fmt(d[0][0]), opensDay: (now.day + k) % 7 };
    }
    return { known: true, open: false };
  }

  function lateNight(c) {
    var h = c._hours !== undefined ? c._hours : parseHours(c.hours);
    if (c.features && c.features.indexOf("allday") >= 0) return true;
    if (!h) return false;
    if (h.always) return true;
    return h.week.some(function (d) { return d && d.some(function (r) { return r[1] >= 1440 + 60; }); });
  }

  // ——— расстояние ———
  function distanceKm(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.asin(Math.sqrt(x));
  }

  // ——— подборки ———
  var VIEW = ["abay-kok-tobe", "auyl", "gogra", "medeu-visit-center", "chalet", "vista", "friends-bar-terrace", "eywa-terrace", "yug22", "sybaga-ethno-restaurant"];
  var NO_DINE = ["canteen", "doner", "burger", "store", "konbini"];

  function tagged(c, tag) { return !!(c.insight && c.insight.tags && c.insight.tags.indexOf(tag) >= 0); }

  // «Выбор OnlyGuests»: заведения с очень высоким рейтингом и большим числом оценок (считается на лету по свежим данным)
  var CHOICE = { rating: 4.9, votes: 1000, types: ["Ресторан", "Кафе", "Бистро", "Бар"] };
  function isChoice(c) {
    return CHOICE.types.indexOf(c.type) >= 0 && !c.closed && !c.ratingApprox && c.rating >= CHOICE.rating && (c.votes || 0) >= CHOICE.votes;
  }

  var COLLECTIONS = {
    choice: isChoice,
    date: function (c) {
      return tagged(c, "date") || (c.rating >= 4.7 && c.check >= 6000 && NO_DINE.indexOf(c.kitchen) < 0 &&
        ["Ресторан", "Бар", "Бистро"].indexOf(c.type) >= 0);
    },
    breakfast: function (c) {
      return tagged(c, "breakfast") || ["breakfast", "bakery"].indexOf(c.kitchen) >= 0 ||
        (c.kitchen === "coffee" && c.menu.some(function (m) { return /сырник|завтрак|круассан/i.test(m.name); })) ||
        /завтрак/i.test(c.about + " " + c.cuisine);
    },
    view: function (c) { return tagged(c, "view") || VIEW.indexOf(c.id) >= 0 || /панорам|вид|крыше|этаже|Кок-Тобе|Медеу|Шымбулак/i.test(c.about); },
    laptop: function (c) { return tagged(c, "laptop") || (c.type === "Кофейня" && c.kitchen !== "bakery") || /ноутбук|коворкинг/i.test(c.about); },
    lunch: function (c) {
      return tagged(c, "lunch") || /ланч|обед/i.test(c.about + " " + c.menu.map(function (m) { return m.name; }).join(" ")) ||
        (c.check <= 3000 && c.type !== "Магазин" && c.type !== "Бар");
    },
    kids: function (c) { return c.features.indexOf("kids") >= 0 || tagged(c, "kids"); },
    night: function (c) { return lateNight(c) || tagged(c, "late"); },
    cheap: function (c) { return c.check <= 2500 && c.type !== "Магазин"; }
  };

  // ——— разбор запроса на русском, казахском и английском ———
  var WORDS = {
    kitchen: {
      kazakh: ["казах", "қазақ", "kazakh", "бешбармак", "бешбармақ", "бауырсак", "казы"],
      uzbek: ["узбек", "өзбек", "uzbek", "плов", "палау", "plov", "самс", "чайхан", "шайхан"],
      uyghur: ["уйгур", "ұйғыр", "uyghur", "лагман", "лағман", "lagman"],
      georgian: ["грузин", "georgian", "хинкал", "хачапур", "khinkali", "khachapuri", "кавказ"],
      italian: ["итальян", "italian", "паста", "pasta", "лазань", "тирамису"],
      japanese: ["япон", "жапон", "japanese", "суши", "sushi", "ролл", "рамен", "ramen"],
      chinese: ["китай", "қытай", "chinese", "утк", "хого", "hot pot"],
      panasian: ["паназ", "азиат", "asian", "вок", "wok", "поке", "poke", "том-ям", "tom yum"],
      korean: ["корей", "korean", "кимчи", "токпок"],
      turkish: ["турец", "түрік", "turkish", "кебаб", "kebab", "лахмаджун"],
      indian: ["индий", "үнді", "indian", "карри", "curry"],
      mediterranean: ["средизем", "греч", "greek", "mediterranean", "ливан"],
      european: ["европ", "еуропа", "european", "франц", "french"],
      steak: ["стейк", "steak"],
      grill: ["шашлык", "кәуап", "мангал", "grill", "барбекю", "bbq"],
      pub: ["паб", "pub", "пиво", "сыра", "beer", "крафт"],
      cocktail: ["коктейл", "cocktail", "лаунж", "lounge", "джин"],
      burger: ["бургер", "burger"],
      doner: ["донер", "doner", "шаурм", "shawarma", "дюрюм"],
      pizza: ["пицц", "pizza"],
      seafood: ["рыб", "балық", "fish", "морепрод", "seafood"],
      coffee: ["кофе", "coffee", "раф", "латте", "капучино"],
      bakery: ["десерт", "торт", "выпеч", "dessert", "cake", "bakery", "кондитер"],
      breakfast: ["завтрак", "таңғы", "breakfast"],
      store: ["супермаркет", "гипермаркет", "supermarket", "продукт", "magnum", "магнум", "small", "toimart", "тоймарт"],
      konbini: ["магазин у дома", "convenience", " cu "]
    },
    type: {
      "Бар": [" бар ", " бары", " барах", " bar", "bar "],
      "Кофейня": ["кофейн", "кофехан", "coffee shop"],
      "Донерная": ["донерн", "донерхан"],
      "Бургерная": ["бургерн", "бургерхан"],
      "Магазин": ["магазин", "дүкен", "store", "shop"],
      "Бистро": ["бистро", "bistro"],
      "Кондитерская": ["кондитерск", "patisserie"]
    },
    feat: {
      kids: [" дет", "ребен", "ребён", " бала", "kid", "child", "семь"],
      namaz: ["намаз", "молел", "prayer"],
      halal: ["халал", "halal"],
      veranda: ["веранд", "террас", "terrace", "летник", "на улице"],
      music: ["музык", "music", "live"],
      allday: ["круглосуточ", "24/7", "24 час", "тәулік", "all night"],
      pets: ["собак", "питом", "pet", "dog", " ит "]
    },
    collection: {
      choice: ["выбор onlyguests", "выбор only", "лучшие места", "лучшее в", "best of", "onlyguests choice", "үздік таңдау"],
      date: ["свидан", "романт", "date", "кездесу"],
      view: ["вид", "горы", "панорам", "view", "mountain", "көрініс", " тау "],
      laptop: ["ноутбук", "поработ", "laptop", "work", "wi-fi", "wifi"],
      lunch: ["ланч", "обед", "lunch", "түскі"],
      night: ["ночью", "поздно", "night", "late", "түнде"],
      cheap: ["дешев", "дёшев", "недорог", "бюджет", "cheap", "арзан"]
    },
    district: {
      "Медеуский": ["медеу"], "Бостандыкский": ["бостандык", "бостандық"], "Алмалинский": ["алмалин", "алмалы"],
      "Ауэзовский": ["ауэзов", "әуезов"], "Жетысуский": ["жетысу", "жетісу"], "Турксибский": ["турксиб", "түрксіб"],
      "Наурызбайский": ["наурызбай"], "Алатауский": ["алатау"]
    },
    near: ["рядом", "поблизости", "near", "nearby", "жақын", "около меня"],
    open: ["открыт", "сейчас", "open now", "ашық"]
  };

  function has(text, list) {
    return list.some(function (w) { return text.indexOf(w) >= 0; });
  }

  function parseQuery(text) {
    var t = " " + String(text || "").toLowerCase().replace(/ё/g, "е") + " ";
    var q = { kitchens: [], types: [], feats: [], collections: [], district: null, maxCheck: null, near: false, openNow: false };
    Object.keys(WORDS.kitchen).forEach(function (k) { if (has(t, WORDS.kitchen[k])) q.kitchens.push(k); });
    // в казахском «бар» значит «есть», поэтому в казахском тексте тип «Бар» распознаём только по латинице
    var kazakh = /[әғқңөұүһі]/.test(t);
    Object.keys(WORDS.type).forEach(function (k) {
      var words = k === "Бар" && kazakh ? [" bar", "bar "] : WORDS.type[k];
      if (has(t, words)) q.types.push(k);
    });
    Object.keys(WORDS.feat).forEach(function (k) { if (has(t, WORDS.feat[k])) q.feats.push(k); });
    Object.keys(WORDS.collection).forEach(function (k) { if (has(t, WORDS.collection[k])) q.collections.push(k); });
    Object.keys(WORDS.district).forEach(function (k) { if (has(t, WORDS.district[k])) q.district = k; });
    q.near = has(t, WORDS.near);
    q.openNow = has(t, WORDS.open);
    var m = t.match(/(?:до|up to|under|дейін)?\s*(\d[\d\s]{2,6})\s*(?:₸|тг|тенге|теңге|tenge|kzt)?/);
    if (m && /до|up to|under|дейін|₸|тг|тенге|теңге|tenge|kzt|на человека/.test(t)) {
      var n = Number(m[1].replace(/\s/g, ""));
      if (n >= 500 && n <= 100000) q.maxCheck = n;
    }
    if (q.collections.indexOf("cheap") >= 0 && !q.maxCheck) q.maxCheck = 3000;
    // «кофейня» — это тип, а не кухня, если не уточнили иначе
    if (q.types.indexOf("Кофейня") >= 0) q.kitchens = q.kitchens.filter(function (k) { return k !== "coffee"; });
    if (q.types.indexOf("Бар") >= 0 && q.kitchens.length === 1 && q.kitchens[0] === "cocktail") q.kitchens = [];
    return q;
  }

  function isEmpty(q) {
    return !(q.kitchens.length || q.types.length || q.feats.length || q.collections.length || q.district || q.maxCheck || q.openNow);
  }

  // Ищет места по разобранному запросу. opts: { pos: {lat, lon}, date, limit }
  function search(cafes, q, opts) {
    opts = opts || {};
    var list = cafes.filter(function (c) {
      if (c.closed) return false;
      if (q.kitchens.length && q.kitchens.indexOf(c.kitchen) < 0) return false;
      if (q.types.length && q.types.indexOf(c.type) < 0) return false;
      if (q.district && c.district !== q.district) return false;
      if (q.maxCheck && c.check > q.maxCheck) return false;
      for (var i = 0; i < q.feats.length; i++) if (c.features.indexOf(q.feats[i]) < 0 && !(q.feats[i] === "allday" && lateNight(c))) return false;
      for (var j = 0; j < q.collections.length; j++) if (q.collections[j] !== "cheap" && !COLLECTIONS[q.collections[j]](c)) return false;
      if (q.openNow) { var st = openState(c, opts.date); if (st.known && !st.open) return false; }
      return true;
    });
    var score = function (c) {
      var s = c.rating * 10 + Math.log10((c.votes || 50) + 1) * 2;
      if (c.partner) s += 1.5;
      if (opts.pos && c.lat) s -= distanceKm(opts.pos, c) * 3;
      return s;
    };
    list.sort(function (a, b) { return score(b) - score(a); });
    return opts.limit ? list.slice(0, opts.limit) : list;
  }

  return {
    isChoice: isChoice, CHOICE: CHOICE, parseHours: parseHours, openState: openState, lateNight: lateNight, almatyNow: almatyNow,
    distanceKm: distanceKm, COLLECTIONS: COLLECTIONS, parseQuery: parseQuery, isEmpty: isEmpty, search: search, DAYS: DAYS
  };
});
