// Telegram-бот OnlyGuests (вебхук). Понимает запросы вроде «халал рядом», «донер ночью», «свидание с видом»,
// умеет искать по геопозиции и выдаёт случайное место. Если задан ключ бесплатной модели, ИИ выбирает
// 3 лучших места из найденных и объясняет выбор.
//
// Переменные окружения Vercel:
//   TELEGRAM_BOT_TOKEN        — токен от @BotFather
//   TELEGRAM_WEBHOOK_SECRET   — любая длинная строка; ею же включается вебхук: GET /api/telegram?setup=<секрет>
//   OPENROUTER_API_KEY / GEMINI_API_KEY — по желанию, для ИИ-ответов
"use strict";
const OG = require("../js/core.js");
const llm = require("./_llm");
const { loadCafes, originOf } = require("./_data");

const TXT = {
  ru: {
    hello: "Привет! Я бот <b>OnlyGuests</b> — подскажу, куда сходить в Алматы.\n\nНапишите, что хотите, например:\n• <i>грузинская кухня с детской комнатой до 8000</i>\n• <i>халал рядом</i>\n• <i>донер ночью</i>\n• <i>кофейня поработать с ноутбуком</i>\n\nИли отправьте геопозицию 📍 — покажу ближайшие места.\nКоманды: /top — лучшие, /open — открыто сейчас, /random — мне повезёт.",
    none: "Ничего не нашлось. Попробуйте убрать одно из условий или напишите иначе.",
    found: "Нашёл {n}. Лучшие:", top: "Лучшие места по рейтингу 2ГИС:", open: "Открыто сейчас:", random: "🎲 Мне повезёт:",
    near: "Ближайшие к вам:", site: "Открыть на сайте", more: "Все результаты на сайте", sendLoc: "📍 Отправить геопозицию",
    sendLocHint: "Чтобы показать ближайшие, отправьте геопозицию 📍", understood: "Понял так", check: "чек", open24: "круглосуточно", openUntil: "открыто до {t}", closed: "закрыто", km: "{d} км"
  },
  kk: {
    hello: "Сәлем! Мен <b>OnlyGuests</b> ботымын — Алматыда қайда баруға болатынын айтамын.\n\nНе қалайтыныңызды жазыңыз, мысалы:\n• <i>балалар бөлмесі бар грузин асханасы 8000-ға дейін</i>\n• <i>жақын жердегі халал</i>\n• <i>түнде донер</i>\n\nНемесе геолокация жіберіңіз 📍 — ең жақын орындарды көрсетемін.\nКомандалар: /top — үздіктер, /open — қазір ашық, /random — сәттілік.",
    none: "Ештеңе табылмады. Бір шартты алып тастап көріңіз.",
    found: "{n} орын табылды. Үздіктері:", top: "2ГИС рейтингі бойынша үздік орындар:", open: "Қазір ашық:", random: "🎲 Сәттілік:",
    near: "Сізге ең жақын:", site: "Сайтта ашу", more: "Барлық нәтиже сайтта", sendLoc: "📍 Геолокация жіберу",
    sendLocHint: "Ең жақындарын көрсету үшін геолокация жіберіңіз 📍", understood: "Былай түсіндім", check: "чек", open24: "тәулік бойы", openUntil: "{t} дейін ашық", closed: "жабық", km: "{d} км"
  },
  en: {
    hello: "Hi! I'm the <b>OnlyGuests</b> bot — I'll help you choose where to go in Almaty.\n\nTell me what you want, for example:\n• <i>Georgian food with a kids' room under 8000</i>\n• <i>halal near me</i>\n• <i>doner late at night</i>\n\nOr send your location 📍 and I'll show the nearest places.\nCommands: /top — best rated, /open — open now, /random — feeling lucky.",
    none: "Nothing found. Try dropping one of the conditions.",
    found: "Found {n}. The best:", top: "Best places by 2GIS rating:", open: "Open now:", random: "🎲 Feeling lucky:",
    near: "Nearest to you:", site: "Open on the website", more: "All results on the website", sendLoc: "📍 Send location",
    sendLocHint: "Send your location 📍 to see the nearest ones", understood: "I understood", check: "bill", open24: "open 24/7", openUntil: "open until {t}", closed: "closed", km: "{d} km"
  }
};

function T(lang, key, vars) {
  let s = (TXT[lang] || TXT.ru)[key] || TXT.ru[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
  return s;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
function num(n) { return Number(n).toLocaleString("ru-RU").replace(/ /g, " "); }

async function tg(method, payload) {
  const r = await fetch("https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  });
  return r.json().catch(() => ({}));
}

function line(c, lang, pos, why) {
  const st = OG.openState(c);
  const open = !st.known ? "" : st.always ? T(lang, "open24") : st.open ? T(lang, "openUntil", { t: st.until }) : T(lang, "closed");
  const km = pos && c.lat ? T(lang, "km", { d: OG.distanceKm(pos, c).toFixed(1) }) : "";
  return "<b>" + esc(c.name) + "</b> — " + esc(c.type) + ", " + esc(c.cuisine) + "\n" +
    "★ " + c.rating.toFixed(1) + (c.votes ? " (" + num(c.votes) + ")" : "") + " · " + T(lang, "check") + " " + (c.checkApprox ? "≈" : "") + num(c.check) + " ₸" +
    (open ? " · " + open : "") + (km ? " · " + km : "") + "\n📍 " + esc(c.address) + (why ? "\n💬 " + esc(why) : "");
}

async function reply(chat, lang, origin, title, items, pos, extra) {
  const text = title + "\n\n" + items.map((it, i) => (i + 1) + ". " + line(it.c, lang, pos, it.why)).join("\n\n") + (extra ? "\n\n" + extra : "");
  const buttons = items.map((it) => [{ text: it.c.name + " — " + T(lang, "site"), url: origin + "/#" + it.c.id }]);
  return tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons.slice(0, 5) } });
}

function weighted(list) {
  const w = list.map((c) => Math.pow(c.rating, 4));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
  while (r > w[i]) { r -= w[i]; i++; }
  return list[Math.min(i, list.length - 1)];
}

module.exports = async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN, secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const origin = originOf(req);
  if (!token) { res.statusCode = 503; return res.end("TELEGRAM_BOT_TOKEN is not set"); }

  // Включение вебхука: открыть /api/telegram?setup=<TELEGRAM_WEBHOOK_SECRET>
  if (req.method === "GET") {
    const url = new URL(req.url, origin);
    if (!secret || url.searchParams.get("setup") !== secret) { res.statusCode = 403; return res.end("forbidden"); }
    const hook = await tg("setWebhook", { url: origin + "/api/telegram", secret_token: secret, allowed_updates: ["message"] });
    for (const lang of ["ru", "kk", "en"]) {
      await tg("setMyCommands", { language_code: lang === "ru" ? undefined : lang, commands: [
        { command: "top", description: lang === "en" ? "Best rated" : lang === "kk" ? "Үздіктер" : "Лучшие места" },
        { command: "open", description: lang === "en" ? "Open now" : lang === "kk" ? "Қазір ашық" : "Открыто сейчас" },
        { command: "random", description: lang === "en" ? "Feeling lucky" : lang === "kk" ? "Сәттілік" : "Мне повезёт" },
        { command: "help", description: lang === "en" ? "How to use" : lang === "kk" ? "Қалай қолдану" : "Как пользоваться" }
      ] });
    }
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(hook));
  }

  if (req.method !== "POST" || (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret)) {
    res.statusCode = 403; return res.end("forbidden");
  }
  const update = req.body && typeof req.body === "object" ? req.body : {};
  const msg = update.message;
  res.statusCode = 200;
  if (!msg || !msg.chat) return res.end("ok");

  const chat = msg.chat.id;
  const code = (msg.from && msg.from.language_code) || "ru";
  const lang = code.startsWith("kk") ? "kk" : code.startsWith("en") ? "en" : "ru";
  try {
    const cafes = (await loadCafes(origin)).filter((c) => !c.closed);
    const text = (msg.text || "").trim();
    const top = (list) => list.slice().sort((a, b) => b.rating * 10 + Math.log10((b.votes || 50) + 1) * 2 - a.rating * 10 - Math.log10((a.votes || 50) + 1) * 2);

    if (msg.location) {
      const pos = { lat: msg.location.latitude, lon: msg.location.longitude };
      const near = cafes.filter((c) => c.lat).sort((a, b) => OG.distanceKm(pos, a) - OG.distanceKm(pos, b)).slice(0, 5);
      await reply(chat, lang, origin, T(lang, "near"), near.map((c) => ({ c })), pos);
    } else if (!text || /^\/(start|help)/.test(text)) {
      await tg("sendMessage", { chat_id: chat, text: T(lang, "hello"), parse_mode: "HTML",
        reply_markup: { keyboard: [[{ text: T(lang, "sendLoc"), request_location: true }]], resize_keyboard: true } });
    } else if (/^\/top/.test(text)) {
      await reply(chat, lang, origin, T(lang, "top"), top(cafes).slice(0, 5).map((c) => ({ c })));
    } else if (/^\/open/.test(text)) {
      const open = top(cafes.filter((c) => { const s = OG.openState(c); return s.known && s.open; })).slice(0, 5);
      if (open.length) await reply(chat, lang, origin, T(lang, "open"), open.map((c) => ({ c })));
      else await tg("sendMessage", { chat_id: chat, text: T(lang, "none") });
    } else if (/^\/random/.test(text)) {
      await reply(chat, lang, origin, T(lang, "random"), [{ c: weighted(cafes.filter((c) => c.rating >= 4.5)) }]);
    } else {
      const q = OG.parseQuery(text);
      let list = OG.isEmpty(q) ? cafes.filter((c) => {
        const hay = (c.name + " " + c.cuisine + " " + c.type + " " + c.address + " " + c.menu.map((m) => m.name).join(" ")).toLowerCase();
        return text.toLowerCase().split(/\s+/).filter((w) => w.length > 2).some((w) => hay.includes(w));
      }) : OG.search(cafes, q);
      if (OG.isEmpty(q)) list = top(list);
      if (!list.length) {
        await tg("sendMessage", { chat_id: chat, text: T(lang, "none") });
      } else {
        let items = list.slice(0, 3).map((c) => ({ c })), intro = T(lang, "found", { n: list.length });
        if (llm.configured()) {
          const ai = await llm.pick(text, lang, list.slice(0, 20).map((c) => ({ id: c.id, name: c.name, type: c.type, cuisine: c.cuisine,
            rating: c.rating, votes: c.votes, check: c.check, features: c.features, district: c.district || null,
            open: (() => { const s = OG.openState(c); return s.known ? s.open : null; })(), about: c.about })), []);
          if (ai) {
            const byId = new Map(list.map((c) => [c.id, c]));
            items = ai.picks.map((p) => ({ c: byId.get(p.id), why: p.why })).filter((x) => x.c);
            if (ai.text) intro = esc(ai.text);
          }
        }
        const qs = origin + "/?q=" + encodeURIComponent(text);
        const extra = [list.length > items.length ? '<a href="' + qs + '">' + T(lang, "more") + "</a>" : "", q.near ? T(lang, "sendLocHint") : ""].filter(Boolean).join("\n");
        await reply(chat, lang, origin, intro, items, null, extra);
      }
    }
  } catch (e) {
    console.error(e);
  }
  res.end("ok");
};
