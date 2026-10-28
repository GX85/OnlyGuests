# Агенты рейтингов OnlyGuests: перепроверяют рейтинг 2ГИС, число оценок и часы работы,
# ведут историю рейтинга и пишут всё в js/live.js.
#
# Запуск: python3 tools/agent_update.py [--limit 40] [--dry-run] [--mock]
#
# Источники по порядку:
#   1. Официальный API 2ГИС (DGIS_API_KEY) — точные цифры из каталога.
#   2. Два агента на бесплатных моделях (см. tools/ai.py): «Искатель» находит рейтинг,
#      «Проверяющий» независимо перепроверяет его другим маршрутом (другая модель или поиск).
#      Значение принимается, только если они сошлись (разница не больше 0.1).
# Скачок рейтинга больше 0.5 или заметное падение числа оценок отбрасываются как ошибка модели.
# js/data.js не меняется: сайт накладывает js/live.js поверх базовых данных.
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai

DGIS_KEY = os.environ.get("DGIS_API_KEY", "")
MAX_JUMP = 0.5
AGREE = 0.1
HIST_MAX = 120
HOURS_RE = re.compile(r"^(24/7|((Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?(,(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?)* "
                      r"(\d\d:\d\d-\d\d:\d\d(,\d\d:\d\d-\d\d:\d\d)*|off)(; )?)+)$")


# ——— API 2ГИС ———
def from_2gis(cafe):
    m = re.search(r"/(?:firm|branches)/(\d+)", cafe["gis"])
    if not (DGIS_KEY and m):
        return None
    url = "https://catalog.api.2gis.com/3.0/items/byid?" + urllib.parse.urlencode(
        {"id": m.group(1), "fields": "items.reviews,items.schedule", "key": DGIS_KEY})
    try:
        items = ai.http_json(url).get("result", {}).get("items") or []
    except Exception as e:
        print("  2ГИС API:", e)
        return None
    rev = (items[0].get("reviews") or {}) if items else {}
    rating = rev.get("general_rating")
    votes = rev.get("general_review_count_with_stars") or rev.get("general_review_count")
    if rating is None:
        return None
    return {"rating": round(float(rating), 1), "votes": int(votes) if votes else None, "closed": False,
            "hours": schedule_to_osm((items[0].get("schedule") or {})), "source": "2gis-api"}


def schedule_to_osm(sch):
    if not sch:
        return None
    if sch.get("is_24x7"):
        return "24/7"
    days = [("Mon", "Mo"), ("Tue", "Tu"), ("Wed", "We"), ("Thu", "Th"), ("Fri", "Fr"), ("Sat", "Sa"), ("Sun", "Su")]
    parts = []
    for k, d in days:
        wh = (sch.get(k) or {}).get("working_hours") or []
        parts.append((d, ",".join("%s-%s" % (w["from"], w["to"]) for w in wh) or "off"))
    # склеиваем одинаковые соседние дни
    out, i = [], 0
    while i < 7:
        j = i
        while j + 1 < 7 and parts[j + 1][1] == parts[i][1]:
            j += 1
        out.append(("%s-%s" % (parts[i][0], parts[j][0]) if j > i else parts[i][0]) + " " + parts[i][1])
        i = j + 1
    return "; ".join(out)


# ——— агенты ———
FINDER = ("Ты агент справочника OnlyGuests. Найди карточку «{name}» ({type}) в Алматы по адресу {address} "
          "в 2ГИС (2gis.kz). Ссылка: {gis}. Выпиши текущий рейтинг 2ГИС, число оценок и часы работы "
          "именно этого филиала. Часы запиши в формате OpenStreetMap, например \"Mo-Su 10:00-23:00\" "
          "или \"24/7\". Если заведение закрылось навсегда, укажи closed: true. "
          "Ответь одной строкой JSON без пояснений: "
          '{{"rating": 4.8, "votes": 1234, "hours": "Mo-Su 10:00-23:00", "closed": false}}. '
          "Если надёжных данных нет, ставь null.")
VERIFIER = ("Ты агент-проверяющий. Независимо перепроверь по свежим данным 2gis.kz рейтинг "
            "(по пятибалльной шкале) и число оценок у «{name}», Алматы, {address}. "
            "Не путай с другими филиалами сети и с другими городами. Работает ли оно сейчас? "
            'Ответ — только JSON: {{"rating": число или null, "votes": число или null, "closed": true/false}}.')


def clean(a):
    if not isinstance(a, dict):
        return None
    r, v = a.get("rating"), a.get("votes")
    try:
        r = round(float(r), 1) if r not in (None, "") else None
        v = int(re.sub(r"\D", "", str(v))) if v not in (None, "") and re.search(r"\d", str(v)) else None
    except (TypeError, ValueError):
        return None
    if r is not None and not (1 <= r <= 5):
        r = None
    h = a.get("hours")
    h = h.strip() if isinstance(h, str) and HOURS_RE.match(h.strip()) else None
    return {"rating": r, "votes": v, "hours": h, "closed": a.get("closed") is True}


def from_agents(cafe, routes):
    fmt = dict(name=cafe["name"].split(" · ")[0], type=cafe["type"].lower(), address=cafe["address"], gis=cafe["gis"])
    query = "%s %s Алматы 2ГИС рейтинг оценок" % (fmt["name"], cafe["address"])
    text, r1 = ai.ask_web(ai_prompt(FINDER, fmt), query, routes, ["2gis.kz"])
    a = clean(ai.parse_json(text))
    if not a or a["rating"] is None:
        return None, "Искатель не нашёл данных"
    # Проверяющий идёт другим маршрутом, если он есть
    rest = [r for r in routes if r.name != r1] or routes
    text, r2 = ai.ask_web(ai_prompt(VERIFIER, fmt), "%s Алматы %s отзывы 2ГИС" % (fmt["name"], cafe["address"]), rest, ["2gis.kz"])
    b = clean(ai.parse_json(text))
    if not b or b["rating"] is None:
        return None, "Проверяющий не подтвердил"
    if abs(a["rating"] - b["rating"]) > AGREE + 1e-9:
        return None, "агенты разошлись: %.1f и %.1f" % (a["rating"], b["rating"])
    best = max((a, b), key=lambda x: x["votes"] or 0)
    return {"rating": best["rating"], "votes": best["votes"], "hours": a["hours"],
            "closed": a["closed"] and b["closed"], "source": "agents", "by": [r1, r2]}, None


def ai_prompt(t, fmt):
    return t.format(**fmt)


def plausible(cur, new):
    if abs(new["rating"] - cur["rating"]) > MAX_JUMP:
        return "слишком резкий скачок %.1f → %.1f" % (cur["rating"], new["rating"])
    if cur.get("votes") and new.get("votes") and new["votes"] < cur["votes"] * 0.8:
        return "число оценок упало %d → %d" % (cur["votes"], new["votes"])
    return None


def mock_routes():  # --mock: имитация двух агентов без сети
    def fake(prompt, query, domains=None):
        m = re.search(r"«(.+?)»", prompt)
        h = sum(map(ord, m.group(1))) if m else 0
        return '{"rating": %s, "votes": %d, "hours": "Mo-Su 10:00-23:00", "closed": false}' % ([4.9, 4.8, 4.7, 4.6][h % 4], 1000 + h % 500)
    return [ai.WebRoute("mock-a", fake), ai.WebRoute("mock-b", fake)]


def main(argv):
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 40
    dry, mock = "--dry-run" in argv, "--mock" in argv

    cafes = ai.cafes()
    live = ai.load_js("live.js", "LIVE") or {}
    routes = mock_routes() if mock else ai.web_routes()
    print("Маршруты агентов:", [r.name for r in routes] or "нет", "| API 2ГИС:", bool(DGIS_KEY))
    if not (routes or DGIS_KEY):
        print("Нет ключей моделей и поиска — агентам нечем проверять. См. README, раздел «ИИ-агенты».")
        return 0

    known = {c["id"] for c in cafes}
    live = {k: v for k, v in live.items() if k in known}
    queue = sorted(cafes, key=lambda c: (live.get(c["id"], {}).get("checkedAt") or ""))[:limit]
    today = ai.now_iso()[:10]

    changed = checked = 0
    for c in queue:
        e = live.setdefault(c["id"], {})
        cur = {"rating": e.get("rating", c["rating"]), "votes": e.get("votes", c["votes"])}
        print("•", c["name"], "| сейчас", cur["rating"], cur["votes"])
        new = None if mock else from_2gis(c)
        why = None
        if new is None and routes:
            new, why = from_agents(c, routes)
        e["checkedAt"] = ai.now_iso()
        if new is None:
            print("  пропуск:", why or "нет источника")
            continue
        bad = plausible(cur, new) if new["source"] != "2gis-api" else None
        if bad:
            print("  отклонено:", bad)
            continue
        checked += 1
        if new["rating"] != cur["rating"]:
            e["prev"] = cur["rating"]
            e["changedAt"] = e["checkedAt"]
            changed += 1
            print("  рейтинг:", cur["rating"], "→", new["rating"])
        e["rating"] = new["rating"]
        if new.get("votes"):
            e["votes"] = new["votes"]
        if new.get("hours"):
            e["hours"] = new["hours"]
        e["closed"] = bool(new.get("closed"))
        e["source"] = new["source"]
        e["confirmedAt"] = e["checkedAt"]
        hist = e.setdefault("hist", [])
        if not hist:
            hist.append([c.get("baseDate", "2026-10-28"), c["rating"], c["votes"]])
        point = [today, e["rating"], e.get("votes")]
        if hist[-1][0] == today:
            hist[-1] = point
        elif hist[-1][1:] != point[1:]:
            hist.append(point)
        del hist[:-HIST_MAX]

    meta = {"updatedAt": ai.now_iso(), "checked": checked, "changed": changed, "total": len(cafes),
            "model": "2ГИС API" if DGIS_KEY else ", ".join(r.name for r in routes[:2])}
    print("Итого: подтверждено %d, рейтинг изменился у %d из %d проверенных" % (checked, changed, len(queue)))
    if not dry:
        ai.save_js("live.js", "Свежие рейтинги от ИИ-агентов OnlyGuests (tools/agent_update.py). Обновляется автоматически.",
                   {"LIVE_META": meta, "LIVE": live})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
