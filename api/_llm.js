// Общий клиент бесплатных моделей для функций Vercel (файлы с «_» не становятся отдельными эндпоинтами).
// OPENROUTER_API_KEY — бесплатные модели OpenRouter (id с «:free»), список можно задать в OPENROUTER_MODEL через запятую.
// GEMINI_API_KEY — запасной вариант, бесплатный тариф Gemini.
// Без ключей работает бесплатная модель Pollinations (без регистрации).
"use strict";

// порядок предпочтения среди бесплатных моделей OpenRouter (список у них меняется, поэтому ищем по подстроке)
const PREFER = ["nemotron-3-ultra", "laguna-s", "flint", "nemotron-3.5-lightning", "gemma-4-31b", "gemma-4-26b", "dots", "deepseek", "qwen", "llama-3.3-70b", "llama-4", "gpt-oss"];
const SKIP = /safety|guard|code|coder|embed|vl\b|omni|inkling|lfm/i;   // не чат-модели общего назначения или недоступные во всех регионах
let freeModels = null, freeModelsAt = 0;

async function openrouterModels() {
  if (process.env.OPENROUTER_MODEL) return process.env.OPENROUTER_MODEL.split(",").map((s) => s.trim()).filter(Boolean);
  if (freeModels && Date.now() - freeModelsAt < 6 * 3600e3) return freeModels;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const data = (await r.json()).data || [];
    const rank = (id) => { const i = PREFER.findIndex((k) => id.includes(k)); return i < 0 ? PREFER.length : i; };
    freeModels = data.filter((m) => m.id.endsWith(":free") && !SKIP.test(m.id)).map((m) => m.id).sort((a, b) => rank(a) - rank(b)).slice(0, 5);
    freeModelsAt = Date.now();
  } catch (e) {
    freeModels = freeModels || [];
  }
  return freeModels;
}

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// Возвращает { text, model } или null
// Общий бюджет времени (функция Vercel живёт до 30 с): бесплатные модели иногда отвечают медленно или
// с ошибкой 429, поэтому несколько моделей OpenRouter спрашиваем параллельно и берём первый годный ответ.
// validate(text) — проверка, что ответ нам подходит (например, это JSON с нужными полями).
async function openrouterOnce(model, prompt, ms) {
  const to = withTimeout(ms);
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: to.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "HTTP-Referer": "https://onlyguests.vercel.app", "X-Title": "OnlyGuests" },
      body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "user", content: prompt }] })
    });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) throw new Error("empty");
    return { text, model };
  } finally { to.done(); }
}

async function geminiOnce(prompt, ms) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const to = withTimeout(ms);
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(process.env.GEMINI_API_KEY), {
      method: "POST", signal: to.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
    });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const text = ((j.candidates || [])[0] || {}).content?.parts?.map((p) => p.text || "").join("");
    if (!text) throw new Error("empty");
    return { text, model };
  } finally { to.done(); }
}

async function pollinationsOnce(prompt, ms) {
  const to = withTimeout(ms);
  try {
    const r = await fetch("https://text.pollinations.ai/openai", {
      method: "POST", signal: to.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai-fast", temperature: 0.2, messages: [{ role: "user", content: prompt }] })
    });
    if (!r.ok) throw new Error("http " + r.status);
    const j = await r.json();
    const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text) throw new Error("empty");
    return { text, model: "pollinations/openai-fast" };
  } finally { to.done(); }
}

// Все доступные источники спрашиваем одновременно и берём первый годный ответ: так задержка равна
// самой быстрой модели, а 429 или тайм-аут одной из них не ломает ответ.
// Функция Vercel живёт до 30 с, поэтому общий бюджет по умолчанию 20 с.
async function chat(prompt, { timeout = 20000, validate = () => true } = {}) {
  const tasks = [];
  const wrap = (p) => p.then((r) => { if (!validate(r.text)) throw new Error("invalid"); return r; });
  if (process.env.OPENROUTER_API_KEY) for (const m of (await openrouterModels()).slice(0, 4)) tasks.push(wrap(openrouterOnce(m, prompt, timeout)));
  if (process.env.GEMINI_API_KEY) tasks.push(wrap(geminiOnce(prompt, timeout)));
  if (!process.env.NO_POLLINATIONS) tasks.push(wrap(pollinationsOnce(prompt, timeout)));
  if (!tasks.length) return null;
  try { return await Promise.any(tasks); } catch (e) {
    chat.errors = ((e && e.errors) || []).map((x) => String(x && x.message || x).slice(0, 80));
    return null;
  }
}

function parseJSON(text) {
  if (!text) return null;
  const s = text.replace(/```(?:json)?/g, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

function configured() {
  return !process.env.NO_POLLINATIONS || !!(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
}

const LANG_NAME = { ru: "русском", kk: "казахском", en: "английском" };

// Просит модель выбрать до 3 мест из кандидатов. Возвращает { text, picks: [{id, why}], model } или null
async function pick(query, lang, candidates, understood, opts) {
  const ids = new Set(candidates.map((c) => c.id));
  const prompt =
    "Ты ИИ-помощник справочника OnlyGuests (кафе, бары, рестораны и магазины Алматы). " +
    "Гость спрашивает: «" + query + "». " + (understood && understood.length ? "Система поняла условия так: " + understood.join(", ") + ". " : "") +
    "Выбери до 3 лучших мест ТОЛЬКО из списка кандидатов ниже (rating — рейтинг 2ГИС, check — средний чек в тенге, open — открыто ли сейчас, km — расстояние до гостя). " +
    "Кандидаты уже отфильтрованы системой по запросу: всегда выбирай лучшие из них, даже если совпадение неполное (тогда честно укажи в why, чего не хватает). Список picks не должен быть пустым. Не выдумывай места и факты. Ответь на " + (LANG_NAME[lang] || "русском") + " языке. " +
    'Формат — только JSON: {"text": "1–2 предложения для гостя", "picks": [{"id": "id из списка", "why": "почему подходит, до 12 слов"}]}.\n\n' +
    "Кандидаты:\n" + JSON.stringify(candidates);
  const res = await chat(prompt, Object.assign({ validate: (t) => { const j = parseJSON(t); return !!(j && Array.isArray(j.picks) && j.picks.length); } }, opts || {}));
  if (!res) return null;
  const j = parseJSON(res.text);
  if (!j || !Array.isArray(j.picks)) return null;
  const picks = j.picks.filter((p) => p && ids.has(p.id)).slice(0, 3).map((p) => ({ id: p.id, why: String(p.why || "").slice(0, 140) }));
  if (!picks.length) return null;
  return { text: String(j.text || "").slice(0, 400), picks, model: res.model };
}

module.exports = { chat, pick, parseJSON, configured, lastErrors: () => chat.errors || [], hasOpenRouter: () => !!process.env.OPENROUTER_API_KEY };
