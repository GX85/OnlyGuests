# ИИ-агенты OnlyGuests: перепроверяют рейтинг 2ГИС и число оценок и пишут свежие значения в js/live.js.
#
# Запуск: python3 tools/agent_update.py [--limit 40] [--dry-run] [--mock]
#
# Источники по порядку:
#   1. Официальный API 2ГИС (если задан DGIS_API_KEY): точные цифры из каталога.
#   2. Бесплатная модель Gemini с поиском Google (GEMINI_API_KEY, ключ бесплатно в Google AI Studio).
#      Два агента работают независимо: «Искатель» находит рейтинг, «Проверяющий» перепроверяет его
#      другим запросом. Значение принимается, только если они сошлись (разница не больше 0.1).
# Защита от ошибок модели: скачок рейтинга больше 0.5 или заметное падение числа оценок отбрасываются.
#
# js/data.js не меняется: это базовые данные из build_data.py. Агенты пишут только js/live.js,
# а сайт при загрузке накладывает свежие значения поверх базовых.
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "js", "data.js")
LIVE = os.path.join(ROOT, "js", "live.js")

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
DGIS_KEY = os.environ.get("DGIS_API_KEY", "")
PAUSE = float(os.environ.get("AGENT_PAUSE", "7"))  # бесплатный тариф Gemini: ~10 запросов в минуту

MAX_JUMP = 0.5     # больше — считаем ошибкой агента
AGREE = 0.1        # насколько могут расходиться «Искатель» и «Проверяющий»


def now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_js(path, var):
    if not os.path.exists(path):
        return None
    src = open(path, encoding="utf-8").read()
    m = re.search(r"window\." + var + r"\s*=\s*(.*?);\s*$", src, re.S | re.M)
    return json.loads(m.group(1)) if m else None


def save_live(live, meta):
    js = ("// Свежие рейтинги от ИИ-агентов OnlyGuests (tools/agent_update.py). Файл обновляется автоматически.\n"
          "window.LIVE_META = " + json.dumps(meta, ensure_ascii=False) + ";\n"
          "window.LIVE = " + json.dumps(live, ensure_ascii=False, indent=1, sort_keys=True) + ";\n")
    open(LIVE, "w", encoding="utf-8").write(js)


def http_json(url, body=None, timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


# ——— источник 1: API 2ГИС ———
def firm_id(gis_url):
    m = re.search(r"/(?:firm|branches)/(\d+)", gis_url)
    return m.group(1) if m else None


def from_2gis(cafe):
    fid = firm_id(cafe["gis"])
    if not (DGIS_KEY and fid):
        return None
    url = "https://catalog.api.2gis.com/3.0/items/byid?" + urllib.parse.urlencode(
        {"id": fid, "fields": "items.reviews", "key": DGIS_KEY})
    try:
        items = http_json(url).get("result", {}).get("items") or []
    except Exception as e:
        print("  2ГИС API:", e)
        return None
    rev = (items[0].get("reviews") or {}) if items else {}
    rating = rev.get("general_rating")
    votes = rev.get("general_review_count_with_stars") or rev.get("general_review_count")
    if rating is None:
        return None
    return {"rating": round(float(rating), 1), "votes": int(votes) if votes else None, "source": "2gis-api"}


# ——— источник 2: агенты на Gemini ———
FINDER = ("Ты агент справочника OnlyGuests. Найди в интернете карточку заведения «{name}» в Алматы "
          "по адресу {address} в 2ГИС (2gis.kz). Ссылка на карточку: {gis}. "
          "Выпиши текущий рейтинг 2ГИС и число оценок именно этого филиала. "
          "Если заведение закрылось навсегда, укажи closed: true. "
          "Ответь одной строкой JSON без пояснений: "
          '{{"rating": 4.8, "votes": 1234, "closed": false}}. '
          'Если надёжных данных нет, ответь {{"rating": null, "votes": null, "closed": false}}.')
VERIFIER = ("Ты агент-проверяющий. Независимо перепроверь по свежим данным 2gis.kz, какой сейчас рейтинг "
            "(по пятибалльной шкале) и сколько оценок у заведения «{name}», Алматы, {address}. "
            "Не путай с другими филиалами сети и с другими городами. Работает ли оно сейчас? "
            'Ответ — только JSON: {{"rating": число или null, "votes": число или null, "closed": true/false}}.')


def ask_gemini(prompt):
    url = ("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL +
           ":generateContent?key=" + urllib.parse.quote(GEMINI_KEY))
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"temperature": 0}}
    for attempt in range(3):
        try:
            res = http_json(url, body, timeout=120)
            parts = res["candidates"][0]["content"]["parts"]
            return parse_answer("".join(p.get("text", "") for p in parts))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 2:
                time.sleep(30 * (attempt + 1))
                continue
            print("  Gemini:", e.code, e.read()[:200])
            return None
        except Exception as e:
            print("  Gemini:", e)
            return None
        finally:
            time.sleep(PAUSE)


def parse_answer(text):
    m = re.search(r"\{[^{}]*\}", text or "")
    if not m:
        return None
    try:
        a = json.loads(m.group(0))
    except ValueError:
        return None
    r, v = a.get("rating"), a.get("votes")
    try:
        r = round(float(r), 1) if r is not None else None
        v = int(str(v).replace(" ", "").replace(" ", "")) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None
    if r is not None and not (1 <= r <= 5):
        r = None
    return {"rating": r, "votes": v, "closed": a.get("closed") is True}


def from_agents(cafe, ask):
    fmt = dict(name=cafe["name"], address=cafe["address"], gis=cafe["gis"])
    a = ask(FINDER.format(**fmt))
    if not a or a["rating"] is None:
        return None, "Искатель не нашёл данных"
    b = ask(VERIFIER.format(**fmt))
    if not b or b["rating"] is None:
        return None, "Проверяющий не подтвердил"
    if abs(a["rating"] - b["rating"]) > AGREE + 1e-9:
        return None, "агенты разошлись: %.1f и %.1f" % (a["rating"], b["rating"])
    # из двух близких ответов берём тот, где больше оценок: он свежее
    best = max((a, b), key=lambda x: x["votes"] or 0)
    return {"rating": best["rating"], "votes": best["votes"], "closed": a["closed"] and b["closed"],
            "source": "gemini-agents"}, None


def plausible(cur, new):
    if abs(new["rating"] - cur["rating"]) > MAX_JUMP:
        return "слишком резкий скачок %.1f → %.1f" % (cur["rating"], new["rating"])
    if cur.get("votes") and new.get("votes") and new["votes"] < cur["votes"] * 0.8:
        return "число оценок упало %d → %d" % (cur["votes"], new["votes"])
    return None


def mock_ask(prompt):  # для --mock: имитация агентов без сети
    m = re.search(r"«(.+?)»", prompt)
    h = sum(map(ord, m.group(1))) if m else 0
    return {"rating": [4.9, 4.8, 4.7, 4.6][h % 4], "votes": 1000 + h % 500, "closed": False}


def main(argv):
    limit = 40
    if "--limit" in argv:
        limit = int(argv[argv.index("--limit") + 1])
    dry, mock = "--dry-run" in argv, "--mock" in argv

    cafes = load_js(DATA, "CAFES") or []
    live = load_js(LIVE, "LIVE") or {}
    ask = mock_ask if mock else ask_gemini
    if not (mock or GEMINI_KEY or DGIS_KEY):
        print("Нет ключей GEMINI_API_KEY / DGIS_API_KEY — агентам нечем проверять. Выход.")
        return 0

    known = {c["id"] for c in cafes}
    live = {k: v for k, v in live.items() if k in known}
    # сначала те, кого дольше всего не проверяли
    queue = sorted(cafes, key=lambda c: (live.get(c["id"], {}).get("checkedAt") or ""))[:limit]

    changed = checked = 0
    for c in queue:
        cur = dict(rating=c["rating"], votes=c["votes"])
        cur.update({k: v for k, v in live.get(c["id"], {}).items() if k in ("rating", "votes") and v is not None})
        print("•", c["name"], "| сейчас", cur["rating"], cur["votes"])

        new = None if mock else from_2gis(c)
        why = None
        if new is None and (GEMINI_KEY or mock):
            new, why = from_agents(c, ask)
        entry = live.setdefault(c["id"], {})
        entry["checkedAt"] = now()
        if new is None:
            print("  пропуск:", why or "нет источника")
            continue
        bad = plausible(cur, new) if new["source"] != "2gis-api" else None
        if bad:
            print("  отклонено:", bad)
            continue
        checked += 1
        if new["rating"] != cur["rating"] or (new["votes"] and new["votes"] != cur["votes"]):
            if new["rating"] != cur["rating"]:
                entry["prev"] = cur["rating"]
                entry["changedAt"] = entry["checkedAt"]
            changed += 1
            print("  обновлено:", cur["rating"], "→", new["rating"], "| оценок", cur["votes"], "→", new["votes"])
        entry.update(rating=new["rating"], source=new["source"])
        if new["votes"]:
            entry["votes"] = new["votes"]
        entry["closed"] = bool(new.get("closed"))
        entry["confirmedAt"] = entry["checkedAt"]

    meta = {"updatedAt": now(), "checked": checked, "changed": changed,
            "model": "2ГИС API" if DGIS_KEY else GEMINI_MODEL, "total": len(cafes)}
    print("Итого: подтверждено %d, изменилось %d из %d проверенных" % (checked, changed, len(queue)))
    if dry:
        print(json.dumps(meta, ensure_ascii=False))
    else:
        save_live(live, meta)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
