// WhatsApp-бот OnlyGuests (WhatsApp Business Cloud API от Meta, вебхук для Vercel).
//
// Что умеет: свободный текст («халал рядом», «донер ночью», «грузинская кухня с детской до 8000»),
// кнопки меню, списки результатов с выбором, геопозиция («рядом со мной»), карточка места с фото и ссылками,
// «Ещё», точка на карте, случайное место. Если модель доступна, она выбирает лучшие места и объясняет выбор.
//
// Переменные окружения Vercel:
//   WHATSAPP_TOKEN         — постоянный токен доступа (System User Token) приложения Meta
//   WHATSAPP_PHONE_ID      — Phone number ID номера, на котором работает бот (раздел WhatsApp → API Setup)
//   WHATSAPP_VERIFY_TOKEN  — любая строка, её же вводите при настройке вебхука в Meta
//   WHATSAPP_APP_SECRET    — App Secret приложения (по желанию, включает проверку подписи запросов)
//
// Вебхук для Meta: https://<сайт>/api/whatsapp   (событие: messages)
"use strict";
const crypto = require("crypto");
const OG = require("../js/core.js");
const llm = require("./_llm");
const { loadCafes, originOf } = require("./_data");

const API = "https://graph.facebook.com/v21.0/";
const ROWS = 8;
const seen = new Set();   // повторные доставки одного и того же сообщения

const TXT = {
  ru: {
    hello: "Привет! Я бот *OnlyGuests* — подскажу, куда сходить в Алматы: кафе, бары, донерные и магазины.\n\nПросто напишите, что хотите:\n• _грузинская кухня с детской комнатой до 8000_\n• _халал рядом_\n• _донер ночью_\n• _кофейня поработать с ноутбуком_\n\nИли выберите кнопку ниже. Отправьте геопозицию 📍 — покажу ближайшие места.",
    none: "Ничего не нашлось. Попробуйте убрать одно из условий или напишите иначе.",
    pick: "Выбрать", places: "Места", more: "Ещё ▶", found: "Нашёл {n}. Лучшие:", near: "📍 Ближайшие к вам:",
    needLoc: "Чтобы показать ближайшие, отправьте геопозицию 📍", sendLoc: "Отправьте геопозицию, и я покажу ближайшие места.",
    top: "🏆 Лучшие по рейтингу 2ГИС", open: "🕒 Открыто сейчас", bars: "🍸 Бары", doner: "🌯 Донерные", coffee: "☕ Кофейни", shops: "🛒 Магазины",
    random: "🎲 Мне повезёт", bill: "чек", gis: "2ГИС", site: "Сайт", hours: "Часы", menu: "В меню", noHours: "часы уточняйте в 2ГИС",
    open24: "круглосуточно", openUntil: "открыто до {t}", closed: "закрыто", km: "{d} км", choice: "Выбор OnlyGuests",
    b: { top: "🏆 Топ", open: "🕒 Открыто", near: "📍 Рядом", bars: "🍸 Бары", doner: "🌯 Донер", random: "🎲 Повезёт", map: "📍 На карте" }
  },
  kk: {
    hello: "Сәлем! Мен *OnlyGuests* ботымын — Алматыда қайда баруға болатынын айтамын.\n\nНе қалайтыныңызды жазыңыз:\n• _балалар бөлмесі бар грузин асханасы 8000-ға дейін_\n• _жақын жердегі халал_\n• _түнде донер_\n\nНемесе төмендегі батырманы таңдаңыз. Геолокация жіберіңіз 📍 — ең жақын орындарды көрсетемін.",
    none: "Ештеңе табылмады. Бір шартты алып тастап көріңіз.",
    pick: "Таңдау", places: "Орындар", more: "Тағы ▶", found: "{n} орын табылды. Үздіктері:", near: "📍 Сізге ең жақын:",
    needLoc: "Ең жақындарын көрсету үшін геолокация жіберіңіз 📍", sendLoc: "Геолокация жіберіңіз, ең жақын орындарды көрсетемін.",
    top: "🏆 2ГИС рейтингі бойынша үздіктер", open: "🕒 Қазір ашық", bars: "🍸 Барлар", doner: "🌯 Донерханалар", coffee: "☕ Кофеханалар", shops: "🛒 Дүкендер",
    random: "🎲 Сәттілік", bill: "чек", gis: "2ГИС", site: "Сайт", hours: "Жұмыс уақыты", menu: "Мәзірде", noHours: "жұмыс уақытын 2ГИС-тен қараңыз",
    open24: "тәулік бойы", openUntil: "{t} дейін ашық", closed: "жабық", km: "{d} км", choice: "OnlyGuests таңдауы",
    b: { top: "🏆 Үздіктер", open: "🕒 Ашық", near: "📍 Жақын", bars: "🍸 Барлар", doner: "🌯 Донер", random: "🎲 Сәттілік", map: "📍 Картада" }
  },
  en: {
    hello: "Hi! I'm the *OnlyGuests* bot — I'll help you choose where to go in Almaty: cafés, bars, doner shops and stores.\n\nJust tell me what you want:\n• _Georgian food with a kids' room under 8000_\n• _halal near me_\n• _doner late at night_\n\nOr tap a button below. Send your location 📍 to see the nearest places.",
    none: "Nothing found. Try dropping one of the conditions.",
    pick: "Choose", places: "Places", more: "More ▶", found: "Found {n}. The best:", near: "📍 Nearest to you:",
    needLoc: "Send your location 📍 to see the nearest places", sendLoc: "Send your location and I'll show the nearest places.",
    top: "🏆 Best rated on 2GIS", open: "🕒 Open now", bars: "🍸 Bars", doner: "🌯 Doner shops", coffee: "☕ Coffee shops", shops: "🛒 Stores",
    random: "🎲 Feeling lucky", bill: "bill", gis: "2GIS", site: "Website", hours: "Hours", menu: "On the menu", noHours: "see 2GIS for opening hours",
    open24: "open 24/7", openUntil: "open until {t}", closed: "closed", km: "{d} km", choice: "OnlyGuests Choice",
    b: { top: "🏆 Top", open: "🕒 Open", near: "📍 Near me", bars: "🍸 Bars", doner: "🌯 Doner", random: "🎲 Lucky", map: "📍 On the map" }
  }
};
const PRESETS = { top: {}, open: { openNow: true }, bars: { types: ["Бар"] }, doner: { kitchens: ["doner"] }, coffee: { types: ["Кофейня"] }, shops: { types: ["Магазин"] } };
// слова-команды (текстом) → пресет
const WORDS = [
  [/^(привет|сәлем|салем|hi|hello|start|меню|menu|help|помощь|\/start)(?=[\s.,!?]|$)/i, "hello"],
  [/^(топ|top|үздіктер|лучшие)$/i, "top"], [/^(открыто|open|ашық)( сейчас| now)?$/i, "open"],
  [/^(бары|бар|bars)$/i, "bars"], [/^(донер|донерные|doner)$/i, "doner"], [/^(кофе|кофейни|coffee)$/i, "coffee"],
  [/^(магазины|магазин|shops|stores|дүкендер)$/i, "shops"], [/^(повезёт|повезет|random|сәттілік|мне повезёт)$/i, "random"],
  [/^(рядом|near|жақын|рядом со мной|near me)$/i, "near"]
];

const T = (lang, k, vars) => {
  let s = (TXT[lang] || TXT.ru)[k]; if (s == null) s = TXT.ru[k];
  if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (_, x) => (vars[x] != null ? vars[x] : ""));
  return s;
};
const q = (o) => Object.assign({ kitchens: [], types: [], feats: [], collections: [], district: null, maxCheck: null, near: false, openNow: false }, o);
const num = (n) => Number(n).toLocaleString("ru-RU").replace(/ /g, " ");
const rt = (c) => (c.rating ? c.rating.toFixed(1) : "—"); // у мест из OpenStreetMap оценки пока нет
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const ranked = (list) => list.slice().sort((a, b) =>
  (b.rating * 10 + Math.log10((b.votes || 50) + 1) * 2 + (b.partner ? 1.5 : 0)) - (a.rating * 10 + Math.log10((a.votes || 50) + 1) * 2 + (a.partner ? 1.5 : 0)));

function detectLang(text) {
  if (/[әғқңөұүһі]/i.test(text)) return "kk";
  if (/\b(near me|open now|best|where|find|food|cheap|coffee|late|kids)\b/i.test(text)) return "en";
  return "ru";
}

// ——— отправка ———
async function wa(payload) {
  try {
    const r = await fetch(API + process.env.WHATSAPP_PHONE_ID + "/messages", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.WHATSAPP_TOKEN },
      body: JSON.stringify(Object.assign({ messaging_product: "whatsapp", recipient_type: "individual" }, payload))
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) console.error("whatsapp send", r.status, JSON.stringify(j).slice(0, 300));
    return j;
  } catch (e) { console.error(e); return {}; }
}
const sendText = (to, body) => wa({ to, type: "text", text: { body: body.slice(0, 4000), preview_url: false } });
const sendButtons = (to, body, buttons) => wa({ to, type: "interactive", interactive: { type: "button", body: { text: cut(body, 1000) },
  action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cut(b.title, 20) } })) } } });
const sendList = (to, lang, header, body, rows) => wa({ to, type: "interactive", interactive: { type: "list", header: { type: "text", text: cut(header, 60) },
  body: { text: cut(body, 1000) }, action: { button: cut(T(lang, "pick"), 20), sections: [{ title: cut(T(lang, "places"), 24), rows: rows.slice(0, 10) }] } } });

function status(c, lang) {
  const s = OG.openState(c);
  if (!s.known) return "";
  return s.always ? T(lang, "open24") : s.open ? T(lang, "openUntil", { t: s.until }) : T(lang, "closed");
}
function row(c, lang, pos) {
  const km = pos && c.lat ? " · " + T(lang, "km", { d: OG.distanceKm(pos, c).toFixed(1) }) : "";
  return { id: "d:" + c.id, title: cut((OG.isChoice(c) ? "✦ " : "") + c.name, 24),
    description: cut("★" + rt(c) + " · " + (c.checkApprox ? "≈" : "") + num(c.check) + " ₸ · " + c.type + km, 72) };
}
function moreRow(lang, id) { return { id, title: cut(T(lang, "more"), 24) }; }

async function results(ctx, title, list, offset, prefix, intro) {
  const slice = list.slice(offset, offset + ROWS);
  const rows = slice.map((c) => row(c, ctx.lang, ctx.pos));
  if (prefix && offset + ROWS < list.length) rows.push(moreRow(ctx.lang, prefix + (offset + ROWS)));
  const lines = slice.slice(0, 3).map((c, i) => (offset + i + 1) + ". " + c.name + " — ★" + rt(c) + (status(c, ctx.lang) ? ", " + status(c, ctx.lang) : "")).join("\n");
  return sendList(ctx.to, ctx.lang, title, (intro ? intro + "\n\n" : "") + lines, rows);
}

async function details(ctx, c) {
  const { to, lang, origin } = ctx;
  const st = status(c, lang);
  const hours = c.hours ? (c.hours === "24/7" || c.features.includes("allday") ? T(lang, "open24") : c.hours) : (c.features.includes("allday") ? T(lang, "open24") : T(lang, "noHours"));
  const menu = c.menu.slice(0, 4).map((m) => m.name + " " + num(m.price) + " ₸").join(", ");
  const caption = (OG.isChoice(c) ? "✦ _" + T(lang, "choice") + "_\n" : "") + "*" + c.name + "* — " + c.type + ", " + c.cuisine + "\n" +
    "★ " + rt(c) + (c.votes ? " (" + num(c.votes) + ")" : "") + " · " + T(lang, "bill") + " " + (c.checkApprox ? "≈" : "") + num(c.check) + " ₸\n" +
    "📍 " + c.address + (c.district ? ", " + c.district : "") + "\n🕒 " + hours + (st ? " (" + st + ")" : "") + "\n\n" + c.about + "\n\n🍽 " + T(lang, "menu") + ": " + menu +
    "\n\n" + T(lang, "gis") + ": " + c.gis + "\n" + T(lang, "site") + ": " + origin + "/place/" + c.id;
  const img = await wa({ to, type: "image", image: { link: origin + "/" + c.photos[0], caption: caption.slice(0, 1000) } });
  if (img.error) await sendText(to, caption);
  if (c.lat) await sendButtons(to, c.name, [{ id: "l:" + c.id, title: T(lang, "b").map }]);
}

async function preset(ctx, key, offset) {
  const list = ranked(OG.search(ctx.cafes, q(PRESETS[key])));
  if (!list.length) return sendText(ctx.to, T(ctx.lang, "none"));
  return results(ctx, T(ctx.lang, key), list, offset, "c:" + key + ":");
}
async function near(ctx, pos, offset) {
  const c2 = Object.assign({}, ctx, { pos });
  const list = ctx.cafes.filter((c) => c.lat).sort((a, b) => OG.distanceKm(pos, a) - OG.distanceKm(pos, b)).slice(0, 30);
  return results(c2, T(ctx.lang, "near"), list, offset, "n:" + pos.lat.toFixed(3) + ":" + pos.lon.toFixed(3) + ":");
}
async function textQuery(ctx, text) {
  const query = OG.parseQuery(text);
  let list = OG.isEmpty(query) ? ctx.cafes.filter((c) => {
    const hay = (c.name + " " + c.cuisine + " " + c.type + " " + c.address + " " + c.menu.map((m) => m.name).join(" ")).toLowerCase();
    return text.toLowerCase().split(/\s+/).filter((w) => w.length > 2).some((w) => hay.includes(w));
  }) : OG.search(ctx.cafes, query, {});
  if (OG.isEmpty(query)) list = ranked(list);
  if (!list.length) return sendText(ctx.to, T(ctx.lang, "none"));
  if (query.near) await sendText(ctx.to, T(ctx.lang, "needLoc"));
  let intro = T(ctx.lang, "found", { n: list.length }), shown = list;
  if (list.length > 1) {
    const ai = await llm.pick(text, ctx.lang, list.slice(0, 20).map((c) => ({ id: c.id, name: c.name, type: c.type, cuisine: c.cuisine, rating: c.rating,
      votes: c.votes, check: c.check, features: c.features, district: c.district || null,
      open: (() => { const s = OG.openState(c); return s.known ? s.open : null; })(), about: c.about })), [], { timeout: 12000 });
    if (ai) {
      const byId = new Map(list.map((c) => [c.id, c]));
      const picked = ai.picks.map((p) => byId.get(p.id)).filter(Boolean);
      if (picked.length) { shown = picked.concat(list.filter((c) => !picked.includes(c))); if (ai.text) intro = ai.text; }
    }
  }
  return results(ctx, T(ctx.lang, "top").split(" ")[0] + " OnlyGuests", shown, 0, null, intro);
}

async function hello(ctx) {
  const b = T(ctx.lang, "b");
  await sendButtons(ctx.to, T(ctx.lang, "hello"), [{ id: "m:top", title: b.top }, { id: "m:open", title: b.open }, { id: "m:near", title: b.near }]);
  return sendButtons(ctx.to, "👇", [{ id: "m:bars", title: b.bars }, { id: "m:doner", title: b.doner }, { id: "m:random", title: b.random }]);
}
async function askLocation(ctx) {
  return wa({ to: ctx.to, type: "interactive", interactive: { type: "location_request_message", body: { text: T(ctx.lang, "sendLoc") }, action: { name: "send_location" } } });
}
async function command(ctx, key) {
  if (key === "hello") return hello(ctx);
  if (key === "near") return askLocation(ctx);
  if (key === "random") {
    const pool = ctx.cafes.filter((c) => c.rating >= 4.5);
    const w = pool.map((c) => Math.pow(c.rating, 4));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0; while (r > w[i]) { r -= w[i]; i++; }
    return details(ctx, pool[Math.min(i, pool.length - 1)]);
  }
  if (PRESETS[key]) return preset(ctx, key, 0);
}

async function handleMessage(msg, origin) {
  if (seen.has(msg.id)) return;
  seen.add(msg.id); if (seen.size > 2000) seen.clear();
  const to = msg.from;
  const text = msg.type === "text" ? (msg.text.body || "").trim() : "";
  const ctx = { to, lang: detectLang(text), origin, cafes: (await loadCafes(origin)).filter((c) => !c.closed), pos: null };
  wa({ messaging_product: "whatsapp", status: "read", message_id: msg.id });   // отметка «прочитано»

  if (msg.type === "location") return near(ctx, { lat: msg.location.latitude, lon: msg.location.longitude }, 0);
  if (msg.type === "interactive") {
    const id = (msg.interactive.button_reply || msg.interactive.list_reply || {}).id || "";
    const [kind, ...rest] = id.split(":");
    if (kind === "m") return command(ctx, rest[0]);
    if (kind === "c" && PRESETS[rest[0]]) return preset(ctx, rest[0], Math.max(0, parseInt(rest[1], 10) || 0));
    if (kind === "n") return near(ctx, { lat: parseFloat(rest[0]), lon: parseFloat(rest[1]) }, Math.max(0, parseInt(rest[2], 10) || 0));
    const c = ctx.cafes.find((x) => x.id === rest[0]);
    if (kind === "d" && c) return details(ctx, c);
    if (kind === "l" && c && c.lat) return wa({ to, type: "location", location: { latitude: c.lat, longitude: c.lon, name: c.name, address: c.address + ", Алматы" } });
    return;
  }
  if (msg.type !== "text") return sendText(to, T(ctx.lang, "hello").replace(/\*/g, ""));
  const w = WORDS.find(([re]) => re.test(text));
  if (w) return command(ctx, w[1]);
  return textQuery(ctx, text);
}

function raw(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "string") return resolve(req.body);
    if (req.body && typeof req.body === "object" && !req.readable) return resolve(JSON.stringify(req.body));
    let s = ""; req.on("data", (d) => { s += d; if (s.length > 1e6) req.destroy(); }); req.on("end", () => resolve(s)); req.on("error", () => resolve(s));
  });
}

module.exports = async (req, res) => {
  const origin = originOf(req);
  // проверка вебхука при подключении в Meta
  if (req.method === "GET") {
    const url = new URL(req.url, origin), verify = process.env.WHATSAPP_VERIFY_TOKEN;
    if (verify && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verify) {
      res.statusCode = 200; res.setHeader("Content-Type", "text/plain"); return res.end(url.searchParams.get("hub.challenge") || "");
    }
    res.statusCode = verify ? 403 : 503; return res.end(verify ? "forbidden" : "WHATSAPP_VERIFY_TOKEN is not set");
  }
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) { res.statusCode = 503; return res.end("WhatsApp is not configured"); }

  const body = await raw(req);
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const sig = String(req.headers["x-hub-signature-256"] || "");
    const good = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) { res.statusCode = 403; return res.end("bad signature"); }
  }
  let data = {}; try { data = JSON.parse(body); } catch (e) { /* пустой запрос */ }
  try {
    for (const entry of data.entry || []) for (const ch of entry.changes || []) for (const m of (ch.value && ch.value.messages) || []) await handleMessage(m, origin);
  } catch (e) { console.error(e); }
  res.statusCode = 200; res.end("ok");
};
module.exports.config = { api: { bodyParser: false } };
