// Данные справочника для функций Vercel: js/data.js + свежие рейтинги агентов из js/live.js.
// Читаются с того же сайта, кэшируются на 10 минут.
"use strict";

let cache = null, cacheAt = 0;

function extract(src, name) {
  const start = src.indexOf("window." + name + " = ");
  if (start < 0) return null;
  let body = src.slice(start + name.length + 10);
  const next = body.indexOf("\nwindow.");
  if (next >= 0) body = body.slice(0, next);
  body = body.trim().replace(/;$/, "");
  try { return JSON.parse(body); } catch (e) { return null; }
}

async function getJS(origin, path) {
  try {
    const r = await fetch(origin + path);
    return r.ok ? await r.text() : "";
  } catch (e) {
    return "";
  }
}

async function loadCafes(origin) {
  if (cache && Date.now() - cacheAt < 600e3) return cache;
  const [data, live] = await Promise.all([getJS(origin, "/js/data.js"), getJS(origin, "/js/live.js")]);
  const cafes = extract(data, "CAFES") || [];
  const L = extract(live, "LIVE") || {};
  cafes.forEach((c) => {
    const l = L[c.id];
    if (!l) return;
    if (l.rating != null) { c.rating = l.rating; c.ratingApprox = false; if (l.votes) c.votes = l.votes; c.closed = !!l.closed; }
    if (l.hours) c.hours = l.hours;
  });
  if (cafes.length) { cache = cafes; cacheAt = Date.now(); }
  return cafes;
}

function originOf(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  return proto + "://" + (req.headers["x-forwarded-host"] || req.headers.host);
}

module.exports = { loadCafes, originOf };
