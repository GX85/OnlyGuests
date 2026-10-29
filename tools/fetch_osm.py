# Выгрузка заведений Алматы из OpenStreetMap → tools/osm_places.json (источник для tools/expand_data.py).
# Используем Nominatim (поиск по категории внутри рамки, не больше 50 ответов на запрос): город режется на ячейки,
# а ячейки, где ответов ровно 50, делятся на четыре. Запросов не чаще 1 в секунду (правила OSM).
# Запуск: python3 -u tools/fetch_osm.py   (около 10–20 минут; можно прервать и запустить снова — прогресс сохраняется)
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "osm_places.json")
UA = "OnlyGuests/1.0 (+https://onlyguests.vercel.app)"
W, S, E, N = 76.78, 43.16, 77.08, 43.34          # Алматы без дальних предгорий
QUERIES = ["bar", "pub", "fast food", "restaurant", "supermarket", "bakery", "convenience", "cafe", "food court"]   # сначала то, чего в справочнике мало
MIN_CELL = 0.0035                                  # не делим ячейки мельче ~300 м


def call(q, box):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": q, "viewbox": "%.5f,%.5f,%.5f,%.5f" % (box[0], box[3], box[2], box[1]), "bounded": 1, "limit": 50,
        "format": "jsonv2", "extratags": 1, "addressdetails": 1, "accept-language": "ru"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40) as r:
                data = json.loads(r.read().decode())
            time.sleep(1.1)
            return data
        except Exception as e:
            print("  ошибка:", e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    return None


def main():
    res = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    done = set(res.pop("_done", []))
    # стартовая сетка 4×4
    cells = [(W + (E - W) * j / 4, S + (N - S) * i / 4, W + (E - W) * (j + 1) / 4, S + (N - S) * (i + 1) / 4) for i in range(4) for j in range(4)]
    n_req = 0
    for q in QUERIES:
        queue = list(cells)
        while queue:
            box = queue.pop()
            key = q + "|%.5f,%.5f,%.5f,%.5f" % box
            if key in done:
                continue
            data = call(q, box)
            n_req += 1
            if data is None:
                continue
            for x in data:
                if x.get("category") not in ("amenity", "shop") or not x.get("name"):
                    continue
                res[x["osm_type"][0] + str(x["osm_id"])] = {"lat": round(float(x["lat"]), 6), "lon": round(float(x["lon"]), 6), "cat": x["category"],
                    "type": x["type"], "name": x["name"], "addr": x.get("address", {}), "tags": x.get("extratags") or {}}
            if len(data) >= 50 and (box[2] - box[0]) > MIN_CELL * 2:
                mx, my = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                queue += [(box[0], box[1], mx, my), (mx, box[1], box[2], my), (box[0], my, mx, box[3]), (mx, my, box[2], box[3])]
            done.add(key)
            if n_req % 15 == 0:
                json.dump(dict(res, _done=sorted(done)), open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
                print("%s: запросов %d, мест %d, очередь %d" % (q, n_req, len(res), len(queue)))
    json.dump(dict(res, _done=sorted(done)), open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print("готово, мест:", len(res))


if __name__ == "__main__":
    main()
