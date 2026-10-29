# Агент «Картограф»: раз в сутки сверяет местоположение мест с OpenStreetMap и без всяких ключей.
# Для каждого места ищет заведение с таким же названием в рамке Алматы (Nominatim). Если рядом (до 150 м) оно
# найдено, координаты подтверждены. Если единственное совпадение по названию оказалось дальше (до 5 км),
# место переехало или координаты были неточными, и агент пишет новые координаты, район и адрес в js/live.js.
# У сети филиалов (несколько совпадений) координаты не трогаем: непонятно, какой филиал какой.
# Новые данные накладываются на сайт поверх js/data.js, сам data.js не меняется.
#
# Запуск: python3 tools/agent_geo.py [--limit 150] [--dry-run]
# Проверяются места, которые дольше всего не сверяли; весь справочник обходится за несколько суток.
import json, math, os, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai

UA = "OnlyGuests/1.0 (+https://onlyguests.vercel.app)"
VIEWBOX = (76.78, 43.34, 77.08, 43.16)       # запад, север, восток, юг — Алматы
OK_M, MAX_MOVE_M = 150, 5000
DISTRICTS = {"алмалин": "Алмалинский", "ауэзов": "Ауэзовский", "бостандык": "Бостандыкский", "жетысу": "Жетысуский", "медеу": "Медеуский",
             "наурызбай": "Наурызбайский", "турксиб": "Турксибский", "алатау": "Алатауский"}
TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюяәғқңөұүһі", ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya", "a", "g", "k", "n", "o", "u", "u", "h", "i"]))


def norm(s):
    s = "".join(TR.get(c, c) for c in s.lower().replace("ё", "е"))
    return re.sub(r"[^a-z0-9]+", "", s)


def dist_m(a, b):
    dlat = math.radians(b[0] - a[0]); dlon = math.radians(b[1] - a[1])
    x = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(x))


def search(name):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": name, "viewbox": "%.4f,%.4f,%.4f,%.4f" % VIEWBOX, "bounded": 1, "limit": 20, "format": "jsonv2", "addressdetails": 1, "accept-language": "ru"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
                data = json.loads(r.read().decode())
            time.sleep(1.1)
            return data
        except Exception as e:
            print("  Nominatim:", e)
            time.sleep(5 * (attempt + 1))
    return None


def district_of(a):
    text = " ".join(str(a.get(k, "")) for k in ("city_district", "suburb", "district", "county")).lower()
    return next((d for k, d in DISTRICTS.items() if k in text), None)


def check_place(c, e):
    """Возвращает (статус, данные): confirmed | moved | unknown | ambiguous."""
    name = c["name"].split(" · ")[0]
    res = search(name)
    if res is None:
        return "error", None
    key = norm(name)
    hits = [x for x in res if x.get("category") in ("amenity", "shop") and key and norm(x.get("name", "")) == key]
    if not hits:
        return "unknown", None
    here = (e.get("lat") or c.get("lat"), e.get("lon") or c.get("lon"))
    if here[0] is None:                               # координат не было совсем — берём единственное совпадение
        if len(hits) == 1:
            return "moved", hits[0]
        return "ambiguous", None
    near = min(hits, key=lambda x: dist_m(here, (float(x["lat"]), float(x["lon"]))))
    d = dist_m(here, (float(near["lat"]), float(near["lon"])))
    if d <= OK_M:
        return "confirmed", near
    if len(hits) == 1 and d <= MAX_MOVE_M:
        return "moved", hits[0]
    return "ambiguous", None


def main(argv):
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 150
    dry = "--dry-run" in argv
    cafes = ai.cafes()
    live = ai.load_js("live.js", "LIVE") or {}
    meta = ai.load_js("live.js", "LIVE_META")
    known = {c["id"] for c in cafes}
    live = {k: v for k, v in live.items() if k in known}
    queue = sorted(cafes, key=lambda c: live.get(c["id"], {}).get("geoAt") or "")[:limit]
    stat = {"confirmed": 0, "moved": 0, "unknown": 0, "ambiguous": 0, "error": 0}
    for c in queue:
        e = live.setdefault(c["id"], {})
        status, hit = check_place(c, e)
        stat[status] += 1
        if status == "error":
            continue
        e["geoAt"] = ai.now_iso()
        if status == "moved":
            e["lat"], e["lon"] = round(float(hit["lat"]), 6), round(float(hit["lon"]), 6)
            d = district_of(hit.get("address", {}))
            if d:
                e["district"] = d
            a = hit.get("address", {})
            if a.get("road") and a.get("house_number"):
                e["address"] = a["road"] + ", " + a["house_number"]
            e["movedAt"] = e["geoAt"]
            print("• %s: координаты обновлены → %.5f, %.5f" % (c["name"], e["lat"], e["lon"]))
        elif status == "confirmed":
            print("• %s: на месте" % c["name"])
        else:
            print("• %s: %s" % (c["name"], status))
    for k in [k for k, v in live.items() if not v]:
        live.pop(k)
    print("Итого:", stat)
    if not dry:
        values = {"LIVE_META": dict(meta or {}, geoAt=ai.now_iso(), geoChecked=len(queue), geoMoved=stat["moved"]), "LIVE": live}
        ai.save_js("live.js", "Свежие рейтинги от ИИ-агентов OnlyGuests (tools/agent_update.py). Обновляется автоматически.", values)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
