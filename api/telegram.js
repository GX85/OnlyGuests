// Telegram-бот OnlyGuests (вебхук для Vercel).
//
// Что умеет:
//   • свободный текст: «грузинская кухня с детской комнатой до 8000», «халал рядом», «донер ночью»
//     (на русском, казахском и английском); если модель доступна, она выбирает лучшие места и объясняет выбор
//   • меню-кнопки: рядом (геопозиция), топ, открыто сейчас, бары, донер, кофе, магазины, мне повезёт
//   • карточка места с фото, часами, меню, кнопками 2ГИС / сайт / «на карте», листание «Ещё»
//   • инлайн-режим: @бот запрос в любом чате
//   • кнопка «Сайт» в меню бота (мини-приложение)
//
// Переменные окружения Vercel:
//   TELEGRAM_BOT_TOKEN        — токен от @BotFather
//   TELEGRAM_WEBHOOK_SECRET   — любая длинная строка (буквы, цифры, _ и -)
//   OPENROUTER_API_KEY / GEMINI_API_KEY — по желанию; без них ИИ-ответы даёт бесплатная модель Pollinations
//
// Включение: открыть один раз  https://<сайт>/api/telegram?setup=<TELEGRAM_WEBHOOK_SECRET>
// Проверка:  https://<сайт>/api/telegram?info=<TELEGRAM_WEBHOOK_SECRET>
"use strict";
const OG = require("../js/core.js");
const llm = require("./_llm");
const { loadCafes, originOf } = require("./_data");

const PAGE = 5;

const TXT = {
  ru: {
    hello: "Привет! Я бот <b>OnlyGuests</b> — подскажу, куда сходить в Алматы: кафе, бары, донерные и магазины.\n\nПросто напишите, что хотите:\n• <i>грузинская кухня с детской комнатой до 8000</i>\n• <i>халал рядом</i>\n• <i>донер ночью</i>\n• <i>кофейня поработать с ноутбуком</i>\n\nИли нажмите кнопку ниже. Отправьте геопозицию 📍 — покажу ближайшие места.",
    help: "Команды:\n/top — лучшие по рейтингу 2ГИС\n/open — открыто сейчас\n/bars — бары\n/doner — донерные\n/coffee — кофейни\n/shops — магазины\n/random — мне повезёт\n/near — ближайшие (по геопозиции)\n\nИли пишите словами: «бар с верандой», «magnum открыт сейчас», «детская комната до 6000».",
    none: "Ничего не нашлось. Попробуйте убрать одно из условий или напишите иначе.",
    found: "Нашёл {n}. Лучшие:", top: "🏆 Лучшие по рейтингу 2ГИС:", open: "🕒 Открыто сейчас:", random: "🎲 Мне повезёт:",
    near: "📍 Ближайшие к вам:", bars: "🍸 Бары:", doner: "🌯 Донерные:", coffee: "☕ Кофейни:", shops: "🛒 Магазины:",
    more: "Ещё ▶", back: "◀ Назад", site: "Сайт", gis: "Открыть в 2ГИС", map: "📍 На карте", allSite: "Все результаты на сайте",
    sendLoc: "📍 Рядом со мной", needLoc: "Чтобы показать ближайшие, нажмите кнопку «Рядом со мной» или отправьте геопозицию 📍",
    choice: "Выбор OnlyGuests", understood: "Понял так", bill: "чек", open24: "круглосуточно", openUntil: "открыто до {t}", closed: "закрыто", km: "{d} км",
    hours: "Часы", menu: "В меню", noHours: "часы уточняйте в 2ГИС", partner: "Партнёр", ad: "реклама",
    btn: { near: "📍 Рядом со мной", top: "🏆 Топ", open: "🕒 Открыто", bars: "🍸 Бары", doner: "🌯 Донер", coffee: "☕ Кофе", shops: "🛒 Магазины", random: "🎲 Повезёт" }
  },
  kk: {
    hello: "Сәлем! Мен <b>OnlyGuests</b> ботымын — Алматыда қайда баруға болатынын айтамын: кафе, бар, донерхана және дүкендер.\n\nНе қалайтыныңызды жазыңыз:\n• <i>балалар бөлмесі бар грузин асханасы 8000-ға дейін</i>\n• <i>жақын жердегі халал</i>\n• <i>түнде донер</i>\n\nНемесе төмендегі батырманы басыңыз. Геолокация жіберіңіз 📍 — ең жақын орындарды көрсетемін.",
    help: "Командалар:\n/top — 2ГИС рейтингі бойынша үздіктер\n/open — қазір ашық\n/bars — барлар\n/doner — донерханалар\n/coffee — кофеханалар\n/shops — дүкендер\n/random — сәттілік\n/near — ең жақындары",
    none: "Ештеңе табылмады. Бір шартты алып тастап көріңіз.",
    found: "{n} орын табылды. Үздіктері:", top: "🏆 2ГИС рейтингі бойынша үздіктер:", open: "🕒 Қазір ашық:", random: "🎲 Сәттілік:",
    near: "📍 Сізге ең жақын:", bars: "🍸 Барлар:", doner: "🌯 Донерханалар:", coffee: "☕ Кофеханалар:", shops: "🛒 Дүкендер:",
    more: "Тағы ▶", back: "◀ Артқа", site: "Сайт", gis: "2ГИС-те ашу", map: "📍 Картада", allSite: "Барлық нәтиже сайтта",
    sendLoc: "📍 Маған жақын", needLoc: "Ең жақындарын көру үшін «Маған жақын» батырмасын басыңыз немесе геолокация жіберіңіз 📍",
    choice: "OnlyGuests таңдауы", understood: "Былай түсіндім", bill: "чек", open24: "тәулік бойы", openUntil: "{t} дейін ашық", closed: "жабық", km: "{d} км",
    hours: "Жұмыс уақыты", menu: "Мәзірде", noHours: "жұмыс уақытын 2ГИС-тен қараңыз", partner: "Серіктес", ad: "жарнама",
    btn: { near: "📍 Маған жақын", top: "🏆 Үздіктер", open: "🕒 Ашық", bars: "🍸 Барлар", doner: "🌯 Донер", coffee: "☕ Кофе", shops: "🛒 Дүкендер", random: "🎲 Сәттілік" }
  },
  en: {
    hello: "Hi! I'm the <b>OnlyGuests</b> bot — I'll help you choose where to go in Almaty: cafés, bars, doner shops and stores.\n\nJust tell me what you want:\n• <i>Georgian food with a kids' room under 8000</i>\n• <i>halal near me</i>\n• <i>doner late at night</i>\n\nOr tap a button below. Send your location 📍 to see the nearest places.",
    help: "Commands:\n/top — best rated on 2GIS\n/open — open now\n/bars — bars\n/doner — doner shops\n/coffee — coffee shops\n/shops — stores\n/random — feeling lucky\n/near — nearest to you",
    none: "Nothing found. Try dropping one of the conditions.",
    found: "Found {n}. The best:", top: "🏆 Best rated on 2GIS:", open: "🕒 Open now:", random: "🎲 Feeling lucky:",
    near: "📍 Nearest to you:", bars: "🍸 Bars:", doner: "🌯 Doner shops:", coffee: "☕ Coffee shops:", shops: "🛒 Stores:",
    more: "More ▶", back: "◀ Back", site: "Website", gis: "Open on 2GIS", map: "📍 On the map", allSite: "All results on the website",
    sendLoc: "📍 Near me", needLoc: "To see the nearest places tap Near me or send your location 📍",
    choice: "OnlyGuests Choice", understood: "I understood", bill: "bill", open24: "open 24/7", openUntil: "open until {t}", closed: "closed", km: "{d} km",
    hours: "Hours", menu: "On the menu", noHours: "see 2GIS for opening hours", partner: "Partner", ad: "ad",
    btn: { near: "📍 Near me", top: "🏆 Top", open: "🕒 Open now", bars: "🍸 Bars", doner: "🌯 Doner", coffee: "☕ Coffee", shops: "🛒 Stores", random: "🎲 Lucky" }
  }
};

// пресеты: ключ → условия поиска и заголовок
const PRESETS = {
  top: {}, open: { openNow: true }, bars: { types: ["Бар"] }, doner: { kitchens: ["doner"] },
  coffee: { types: ["Кофейня"] }, shops: { types: ["Магазин"] }
};

function T(lang, key, vars) {
  let s = (TXT[lang] || TXT.ru)[key];
  if (s == null) s = TXT.ru[key];
  if (vars && typeof s === "string") s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
  return s;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const num = (n) => Number(n).toLocaleString("ru-RU").replace(/ /g, " ");
const q = (o) => Object.assign({ kitchens: [], types: [], feats: [], collections: [], district: null, maxCheck: null, near: false, openNow: false }, o);

async function tg(method, payload) {
  try {
    const r = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/" + method, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    return await r.json();
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ——— оформление ———
function statusText(c, lang) {
  const st = OG.openState(c);
  if (!st.known) return "";
  return st.always ? T(lang, "open24") : st.open ? T(lang, "openUntil", { t: st.until }) : T(lang, "closed");
}
function line(c, lang, pos, why) {
  const open = statusText(c, lang);
  const km = pos && c.lat ? T(lang, "km", { d: OG.distanceKm(pos, c).toFixed(1) }) : "";
  return (OG.isChoice(c) ? "✦ <i>" + T(lang, "choice") + "</i>\n" : "") + "<b>" + esc(c.name) + "</b>" + (c.partner ? " · " + T(lang, "ad") : "") + " — " + esc(c.type) + ", " + esc(c.cuisine) + "\n" +
    "★ " + c.rating.toFixed(1) + (c.votes ? " (" + num(c.votes) + ")" : "") + " · " + T(lang, "bill") + " " + (c.checkApprox ? "≈" : "") + num(c.check) + " ₸" +
    (open ? " · " + open : "") + (km ? " · " + km : "") + "\n📍 " + esc(c.address) + (why ? "\n💬 " + esc(why) : "");
}
function ranked(list) {
  const s = (c) => c.rating * 10 + Math.log10((c.votes || 50) + 1) * 2 + (c.partner ? 1.5 : 0);
  return list.slice().sort((a, b) => s(b) - s(a));
}
function weighted(list) {
  const w = list.map((c) => Math.pow(c.rating, 4));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
  while (r > w[i]) { r -= w[i]; i++; }
  return list[Math.min(i, list.length - 1)];
}

function keyboard(lang) {
  const b = TXT[lang].btn;
  return { keyboard: [
    [{ text: b.near, request_location: true }, { text: b.top }, { text: b.open }],
    [{ text: b.bars }, { text: b.doner }, { text: b.coffee }],
    [{ text: b.shops }, { text: b.random }]
  ], resize_keyboard: true, is_persistent: true };
}
// текст нажатой кнопки → команда (на любом из языков)
function buttonCommand(text) {
  for (const lang of Object.keys(TXT)) for (const [cmd, label] of Object.entries(TXT[lang].btn)) if (label === text) return cmd;
  return null;
}
function detectLang(msg, text) {
  if (/[әғқңөұүһі]/i.test(text || "")) return "kk";
  const code = (msg.from && msg.from.language_code) || "ru";
  return code.startsWith("kk") ? "kk" : code.startsWith("en") ? "en" : "ru";
}

function listKeyboard(items, lang, origin, nav, qs) {
  const rows = items.map((it, i) => [{ text: (nav.offset + i + 1) + ". " + it.c.name, callback_data: "d:" + it.c.id }]);
  const navRow = [];
  if (nav.prev != null) navRow.push({ text: T(lang, "back"), callback_data: nav.prefix + nav.prev });
  if (nav.next != null) navRow.push({ text: T(lang, "more"), callback_data: nav.prefix + nav.next });
  if (navRow.length) rows.push(navRow);
  if (qs) rows.push([{ text: T(lang, "allSite"), url: origin + "/?q=" + encodeURIComponent(qs) }]);
  return { inline_keyboard: rows };
}

// отправка/правка списка
async function sendList(ctx, title, list, opts) {
  opts = opts || {};
  const { chat, lang, origin, pos } = ctx;
  const offset = opts.offset || 0;
  const slice = (opts.items || list.slice(offset, offset + PAGE).map((c) => ({ c })));
  const nav = { offset, prefix: opts.prefix || "", prev: offset > 0 ? Math.max(0, offset - PAGE) : null,
    next: opts.prefix && offset + PAGE < list.length ? offset + PAGE : null };
  const text = title + "\n\n" + slice.map((it, i) => (offset + i + 1) + ". " + line(it.c, lang, pos, it.why)).join("\n\n") + (opts.extra ? "\n\n" + opts.extra : "");
  const reply_markup = listKeyboard(slice, lang, origin, nav, opts.qs);
  if (opts.edit) return tg("editMessageText", { chat_id: chat, message_id: opts.edit, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup });
  return tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup });
}

async function sendDetails(ctx, c) {
  const { chat, lang, origin } = ctx;
  const st = statusText(c, lang);
  const hours = c.hours ? (c.features.includes("allday") || c.hours === "24/7" ? T(lang, "open24") : c.hours) : (c.features.includes("allday") ? T(lang, "open24") : T(lang, "noHours"));
  const menu = c.menu.slice(0, 4).map((m) => esc(m.name) + " " + num(m.price) + " ₸").join(", ");
  const caption = line(c, lang, ctx.pos) + "\n\n🕒 " + (c.hours || c.features.includes("allday") ? T(lang, "hours") + ": " : "") + esc(hours) + (st ? " (" + st + ")" : "") +
    (c.district ? "\n🏙 " + esc(c.district) : "") + "\n\n" + esc(c.about) + "\n\n🍽 " + T(lang, "menu") + ": " + menu;
  const rows = [[{ text: T(lang, "gis"), url: c.gis }, { text: T(lang, "site"), url: origin + "/place/" + c.id }]];
  if (c.lat) rows.push([{ text: T(lang, "map"), callback_data: "l:" + c.id }]);
  const photo = origin + "/" + c.photos[0];
  const body = { chat_id: chat, reply_markup: { inline_keyboard: rows }, parse_mode: "HTML" };
  const r = await tg("sendPhoto", Object.assign({ photo, caption: caption.slice(0, 1020) }, body));
  if (!r.ok) await tg("sendMessage", Object.assign({ text: caption.slice(0, 4000), disable_web_page_preview: true }, body));
}

// ——— запросы ———
async function runPreset(ctx, key, offset, editId) {
  const list = ranked(OG.search(ctx.cafes, q(PRESETS[key])));
  if (!list.length) return tg("sendMessage", { chat_id: ctx.chat, text: T(ctx.lang, "none") });
  return sendList(ctx, T(ctx.lang, key), list, { offset, prefix: "c:" + key + ":", edit: editId });
}
async function runNear(ctx, pos, offset, editId) {
  const ctx2 = Object.assign({}, ctx, { pos });
  const list = ctx.cafes.filter((c) => c.lat).sort((a, b) => OG.distanceKm(pos, a) - OG.distanceKm(pos, b)).slice(0, 25);
  return sendList(ctx2, T(ctx.lang, "near"), list, { offset, prefix: "n:" + pos.lat.toFixed(3) + ":" + pos.lon.toFixed(3) + ":", edit: editId });
}
async function runText(ctx, text) {
  const query = OG.parseQuery(text);
  let list = OG.isEmpty(query) ? ctx.cafes.filter((c) => {
    const hay = (c.name + " " + c.cuisine + " " + c.type + " " + c.address + " " + c.menu.map((m) => m.name).join(" ")).toLowerCase();
    return text.toLowerCase().split(/\s+/).filter((w) => w.length > 2).some((w) => hay.includes(w));
  }) : OG.search(ctx.cafes, query, { pos: ctx.pos });
  list = OG.isEmpty(query) ? ranked(list) : list;
  if (!list.length) {
    return tg("sendMessage", { chat_id: ctx.chat, text: T(ctx.lang, "none") });
  }
  if (query.near && !ctx.pos) {
    // «рядом» без геопозиции: просим её, но всё равно показываем лучшие
    await tg("sendMessage", { chat_id: ctx.chat, text: T(ctx.lang, "needLoc") });
  }
  let items = list.slice(0, 3).map((c) => ({ c })), intro = T(ctx.lang, "found", { n: list.length });
  if (list.length > 1) {
    tg("sendChatAction", { chat_id: ctx.chat, action: "typing" });
    const ai = await llm.pick(text, ctx.lang, list.slice(0, 20).map((c) => ({
      id: c.id, name: c.name, type: c.type, cuisine: c.cuisine, rating: c.rating, votes: c.votes, check: c.check, features: c.features,
      district: c.district || null, open: (() => { const s = OG.openState(c); return s.known ? s.open : null; })(), about: c.about
    })), [], { timeout: 12000 });
    if (ai) {
      const byId = new Map(list.map((c) => [c.id, c]));
      const picked = ai.picks.map((p) => ({ c: byId.get(p.id), why: p.why })).filter((x) => x.c);
      if (picked.length) { items = picked; if (ai.text) intro = esc(ai.text); }
    }
  }
  return sendList(ctx, intro, list, { items, qs: list.length > items.length ? text : null });
}

function inlineResult(c, lang, origin) {
  return {
    type: "article", id: c.id, title: c.name + " · ★ " + c.rating.toFixed(1),
    description: c.type + " · " + (c.checkApprox ? "≈" : "") + num(c.check) + " ₸ · " + c.address,
    thumbnail_url: origin + "/" + c.photos[0],
    input_message_content: { message_text: line(c, lang) + "\n\n" + origin + "/place/" + c.id, parse_mode: "HTML", disable_web_page_preview: false }
  };
}

async function setup(origin, secret) {
  const hook = await tg("setWebhook", { url: origin + "/api/telegram", secret_token: secret, allowed_updates: ["message", "callback_query", "inline_query"] });
  const cmds = { ru: [["top", "Лучшие места"], ["open", "Открыто сейчас"], ["near", "Рядом со мной"], ["bars", "Бары"], ["doner", "Донерные"], ["coffee", "Кофейни"], ["shops", "Магазины"], ["random", "Мне повезёт"], ["help", "Как пользоваться"]],
    kk: [["top", "Үздіктер"], ["open", "Қазір ашық"], ["near", "Маған жақын"], ["bars", "Барлар"], ["doner", "Донерханалар"], ["coffee", "Кофеханалар"], ["shops", "Дүкендер"], ["random", "Сәттілік"], ["help", "Көмек"]],
    en: [["top", "Best rated"], ["open", "Open now"], ["near", "Near me"], ["bars", "Bars"], ["doner", "Doner"], ["coffee", "Coffee"], ["shops", "Stores"], ["random", "Feeling lucky"], ["help", "How to use"]] };
  const res = { webhook: hook };
  for (const [lang, list] of Object.entries(cmds)) {
    const payload = { commands: list.map(([command, description]) => ({ command, description })) };
    if (lang !== "ru") payload.language_code = lang;
    res["commands_" + lang] = (await tg("setMyCommands", payload)).ok;
  }
  res.menu = (await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "Сайт", web_app: { url: origin + "/" } } })).ok;
  res.description = (await tg("setMyDescription", { description: "Справочник кафе, баров, донерных и магазинов Алматы: рейтинг 2ГИС, часы работы, меню, карта. Напишите, что хотите, например «халал рядом» или «донер ночью»." })).ok;
  res.short = (await tg("setMyShortDescription", { short_description: "Куда пойти в Алматы: кафе, бары, донер, магазины" })).ok;
  return res;
}

module.exports = async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const origin = originOf(req);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (!token) { res.statusCode = 503; return res.end(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN is not set" })); }

  if (req.method === "GET") {
    const url = new URL(req.url, origin);
    if (!secret || (url.searchParams.get("setup") !== secret && url.searchParams.get("info") !== secret)) { res.statusCode = 403; return res.end('{"error":"forbidden"}'); }
    if (url.searchParams.get("info")) return res.end(JSON.stringify({ me: await tg("getMe", {}), webhook: await tg("getWebhookInfo", {}) }));
    return res.end(JSON.stringify(await setup(origin, secret)));
  }

  if (req.method !== "POST" || (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret)) {
    res.statusCode = 403; return res.end('{"error":"forbidden"}');
  }
  const update = req.body && typeof req.body === "object" ? req.body : {};
  res.statusCode = 200;

  try {
    const cafes = (await loadCafes(origin)).filter((c) => !c.closed);

    // инлайн-режим: @бот запрос
    if (update.inline_query) {
      const iq = update.inline_query, text = (iq.query || "").trim();
      const lang = detectLang({ from: iq.from }, text);
      const query = OG.parseQuery(text);
      const list = text ? (OG.isEmpty(query) ? cafes.filter((c) => (c.name + " " + c.cuisine).toLowerCase().includes(text.toLowerCase())) : OG.search(cafes, query)) : cafes;
      await tg("answerInlineQuery", { inline_query_id: iq.id, cache_time: 60, is_personal: false,
        results: ranked(list).slice(0, 10).map((c) => inlineResult(c, lang, origin)) });
      return res.end('{"ok":true}');
    }

    // нажатия на inline-кнопки
    if (update.callback_query) {
      const cq = update.callback_query, msg = cq.message || {};
      const lang = detectLang({ from: cq.from }, "");
      const ctx = { chat: msg.chat && msg.chat.id, lang, origin, cafes, pos: null };
      const [kind, ...rest] = String(cq.data || "").split(":");
      tg("answerCallbackQuery", { callback_query_id: cq.id });
      if (ctx.chat) {
        if (kind === "d") { const c = cafes.find((x) => x.id === rest[0]); if (c) await sendDetails(ctx, c); }
        else if (kind === "l") { const c = cafes.find((x) => x.id === rest[0]); if (c && c.lat) await tg("sendVenue", { chat_id: ctx.chat, latitude: c.lat, longitude: c.lon, title: c.name, address: c.address + ", Алматы" }); }
        else if (kind === "c" && PRESETS[rest[0]]) await runPreset(ctx, rest[0], Math.max(0, parseInt(rest[1], 10) || 0), msg.message_id);
        else if (kind === "n") await runNear(ctx, { lat: parseFloat(rest[0]), lon: parseFloat(rest[1]) }, Math.max(0, parseInt(rest[2], 10) || 0), msg.message_id);
      }
      return res.end('{"ok":true}');
    }

    const msg = update.message;
    if (!msg || !msg.chat) return res.end('{"ok":true}');
    const text = (msg.text || "").trim();
    const lang = detectLang(msg, text);
    const ctx = { chat: msg.chat.id, lang, origin, cafes, pos: null };

    if (msg.location) {
      await runNear(ctx, { lat: msg.location.latitude, lon: msg.location.longitude }, 0);
      return res.end('{"ok":true}');
    }
    const cmd = (text.match(/^\/(\w+)/) || [])[1] || buttonCommand(text);
    if (!text || cmd === "start") {
      await tg("sendMessage", { chat_id: ctx.chat, text: T(lang, "hello"), parse_mode: "HTML", reply_markup: keyboard(lang) });
    } else if (cmd === "help") {
      await tg("sendMessage", { chat_id: ctx.chat, text: T(lang, "help"), reply_markup: keyboard(lang) });
    } else if (cmd === "near") {
      await tg("sendMessage", { chat_id: ctx.chat, text: T(lang, "needLoc"), reply_markup: keyboard(lang) });
    } else if (PRESETS[cmd]) {
      await runPreset(ctx, cmd, 0);
    } else if (cmd === "random") {
      const pool = cafes.filter((c) => c.rating >= 4.5);
      await sendList(ctx, T(lang, "random"), pool, { items: [{ c: weighted(pool) }] });
    } else {
      await runText(ctx, text);
    }
  } catch (e) {
    console.error(e);
  }
  res.end('{"ok":true}');
};
