// ИИ-помощник «Куда пойти?»: сайт присылает запрос и до 30 кандидатов, отобранных локально,
// бесплатная модель OpenRouter выбирает 3 места и объясняет выбор.
// Без ключей отвечает бесплатная модель Pollinations; если модели недоступны, сайт показывает свой подбор.
"use strict";
const llm = require("./_llm");

const hits = new Map(); // простой лимит: 20 запросов за 10 минут с одного адреса

function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter((t) => now - t < 600e3);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 20;
}

function body(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (d) => { s += d; if (s.length > 64e3) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch (e) { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  // CORS: помощником можно пользоваться и со встроенных копий сайта (например, из артефакта)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  if (!llm.configured()) { res.statusCode = 503; return res.end(JSON.stringify({ error: "no model key" })); }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0] || "?";
  if (limited(ip)) { res.statusCode = 429; return res.end(JSON.stringify({ error: "too many requests" })); }

  const b = await body(req);
  const q = String(b.q || "").slice(0, 300).trim();
  const lang = ["ru", "kk", "en"].includes(b.lang) ? b.lang : "ru";
  const candidates = (Array.isArray(b.candidates) ? b.candidates : []).slice(0, 30).map((c) => ({
    id: String(c.id || "").slice(0, 80), name: String(c.name || "").slice(0, 80), type: String(c.type || "").slice(0, 30),
    cuisine: String(c.cuisine || "").slice(0, 60), rating: Number(c.rating) || null, votes: Number(c.votes) || null,
    check: Number(c.check) || null, features: Array.isArray(c.features) ? c.features.slice(0, 8).map(String) : [],
    district: c.district ? String(c.district).slice(0, 30) : null, open: typeof c.open === "boolean" ? c.open : null,
    km: Number.isFinite(c.km) ? c.km : null, about: String(c.about || "").slice(0, 160),
    pros: Array.isArray(c.pros) ? c.pros.slice(0, 3).map((x) => String(x).slice(0, 60)) : undefined
  })).filter((c) => c.id);
  if (!q || !candidates.length) { res.statusCode = 400; return res.end(JSON.stringify({ error: "bad request" })); }

  const understood = Array.isArray(b.understood) ? b.understood.slice(0, 10).map((x) => String(x).slice(0, 40)) : [];
  const out = await llm.pick(q, lang, candidates, understood);
  if (!out) { res.statusCode = 502; return res.end(JSON.stringify({ error: "model unavailable" })); }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(out));
};
