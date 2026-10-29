// Общий клиент бесплатных моделей для функций Vercel (файлы с «_» не становятся отдельными эндпоинтами).
// OPENROUTER_API_KEY — бесплатные модели OpenRouter (id с «:free»), список можно задать в OPENROUTER_MODEL через запятую.
// GEMINI_API_KEY — запасной вариант, бесплатный тариф Gemini.
// Без ключей работает бесплатная модель Pollinations (без регистрации).
"use strict";

const PREFER = ["deepseek", "qwen3", "llama-3.3-70b", "llama-4", "gemini", "mistral-small", "gemma-3-27b", "gpt-oss"];
let freeModels = null, freeModelsAt = 0;

async function openrouterModels() {
  if (process.env.OPENROUTER_MODEL) return process.env.OPENROUTER_MODEL.split(",").map((s) => s.trim()).filter(Boolean);
  if (freeModels && Date.now() - freeModelsAt < 6 * 3600e3) return freeModels;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/models");
    const data = (await r.json()).data || [];
    const rank = (id) => { const i = PREFER.findIndex((k) => id.includes(k)); return i < 0 ? PREFER.length : i; };
    freeModels = data.filter((m) => m.id.endsWith(":free")).map((m) => m.id).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
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
async function chat(prompt, { timeout = 18000 } = {}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (key) {
    for (const model of await openrouterModels()) {
      const to = withTimeout(timeout);
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST", signal: to.signal,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + key,
            "HTTP-Referer": "https://onlyguests.vercel.app", "X-Title": "OnlyGuests" },
          body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: "user", content: prompt }] })
        });
        if (!r.ok) continue;
        const j = await r.json();
        const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (text) return { text, model };
      } catch (e) { /* пробуем следующую модель */ } finally { to.done(); }
    }
  }
  const gkey = process.env.GEMINI_API_KEY;
  if (gkey) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const to = withTimeout(timeout);
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(gkey), {
        method: "POST", signal: to.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
      });
      if (r.ok) {
        const j = await r.json();
        const text = ((j.candidates || [])[0] || {}).content?.parts?.map((p) => p.text || "").join("");
        if (text) return { text, model };
      }
    } catch (e) { /* нет ответа */ } finally { to.done(); }
  }
  // Запасной вариант без ключа: бесплатная модель Pollinations (без доступа в интернет, но для выбора из списка достаточно).
  // Бесплатный тариф иногда отвечает 429/5xx, поэтому одна повторная попытка.
  if (!process.env.NO_POLLINATIONS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const to = withTimeout(timeout);
      try {
        const r = await fetch("https://text.pollinations.ai/openai", {
          method: "POST", signal: to.signal, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "openai-fast", temperature: 0.2, messages: [{ role: "user", content: prompt }] })
        });
        if (r.ok) {
          const j = await r.json();
          const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (text) return { text, model: "pollinations/openai-fast" };
        }
      } catch (e) { /* нет ответа */ } finally { to.done(); }
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
  return null;
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
  const res = await chat(prompt, opts || {});
  if (!res) return null;
  const j = parseJSON(res.text);
  if (!j || !Array.isArray(j.picks)) return null;
  const picks = j.picks.filter((p) => p && ids.has(p.id)).slice(0, 3).map((p) => ({ id: p.id, why: String(p.why || "").slice(0, 140) }));
  if (!picks.length) return null;
  return { text: String(j.text || "").slice(0, 400), picks, model: res.model };
}

module.exports = { chat, pick, parseJSON, configured };
