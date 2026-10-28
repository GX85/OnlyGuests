# Координаты, район и часы работы заведений OnlyGuests.
#
# Запуск: python3 tools/geocode.py [osm.json ...]
#
# 1. Адрес геокодируется через Nominatim (OpenStreetMap), не чаще 1 запроса в секунду.
# 2. Если рядом с этой точкой (до 400 м) в выгрузке OSM есть объект с тем же названием,
#    берём его точные координаты и часы работы (тег opening_hours).
# 3. Район берётся обратным геокодированием (city_district).
# Результат кэшируется в tools/geo_cache.json; build_data.py подмешивает его в js/data.js.
# Уже найденные заведения повторно не запрашиваются.
import json, math, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "geo_cache.json")
DATA = os.path.join(ROOT, "js", "data.js")
UA = "OnlyGuests/1.0 (+https://onlyguests.vercel.app)"
VIEWBOX = "76.70,43.42,77.15,43.05"  # Алматы с предгорьями

# Точки, которые по адресу не находятся (горы, курорты)
MANUAL = {
    "chalet": (43.1284, 77.0794),
    "la-skala": (43.1284, 77.0794),
    "medeu-visit-center": (43.1576, 77.0590),
    "auyl": (43.1598, 77.0585),
    "gogra": (43.1570, 77.0560),
    "abay-kok-tobe": (43.2326, 76.9765),
}

DISTRICTS = ["Алмалинский", "Ауэзовский", "Бостандыкский", "Жетысуский", "Медеуский", "Наурызбайский", "Турксибский", "Алатауский"]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ru"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            print("  ошибка:", e)
            time.sleep(5 * (attempt + 1))
        finally:
            time.sleep(1.1)
    return None


def norm(s):
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[«»\"'’`.,!&\-·()]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def address_queries(addr):
    parts = [p.strip() for p in addr.split(",") if not re.search(r"этаж|блок|офис", p)]
    # отбрасываем ТЦ/ЖК/БЦ и прочие названия зданий в начале
    while len(parts) > 2 and not re.search(r"\d", parts[0]):
        parts.pop(0)
    street = ", ".join(parts[-2:]) if len(parts) >= 2 else addr
    street = (street.replace("пр. ", "проспект ").replace("ул. ", "улица ").replace("мкр ", "микрорайон ")
              .replace("пр-т ", "проспект "))
    street = re.sub(r"\s*(к\d+|блок\s*\S+|/\d+\s*к\d+)$", "", street)
    plain = re.sub(r"^(проспект|улица|микрорайон)\s+", "", street)
    short = re.sub(r"(\d+)[/а-яa-z]\S*$", r"\1", plain)  # «292/9а» → «292»
    return [street + ", Алматы", plain + ", Алматы"] + ([short + ", Алматы"] if short != plain else [])


def geocode(c):
    for q in address_queries(c["address"]) + [c["name"].split(" · ")[0] + ", Алматы"]:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "viewbox": VIEWBOX, "bounded": 1})
        res = get(url)
        if res:
            return float(res[0]["lat"]), float(res[0]["lon"]), q
    return None


def district(lat, lon):
    res = get("https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "format": "json", "zoom": 14, "addressdetails": 1}))
    if not res:
        return None
    a = res.get("address", {})
    text = " ".join(str(a.get(k, "")) for k in ("city_district", "suburb", "district", "county"))
    for d in DISTRICTS:
        if d[:6].lower() in text.lower() or d[:5].lower() in text.lower():
            return d
    # казахские названия районов
    kz = {"Алмалы": "Алмалинский", "Әуезов": "Ауэзовский", "Бостандық": "Бостандыкский", "Жетісу": "Жетысуский",
          "Медеу": "Медеуский", "Наурызбай": "Наурызбайский", "Түрксіб": "Турксибский", "Алатау": "Алатауский"}
    for k, v in kz.items():
        if k.lower() in text.lower():
            return v
    return None


def dist_m(a, b):
    dlat = math.radians(b[0] - a[0]); dlon = math.radians(b[1] - a[1])
    x = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(x))


def load_osm(paths):
    out = []
    for p in paths:
        try:
            for e in json.load(open(p)).get("elements", []):
                t = e.get("tags", {})
                lat = e.get("lat") or (e.get("center") or {}).get("lat")
                lon = e.get("lon") or (e.get("center") or {}).get("lon")
                if lat and t.get("name"):
                    names = {norm(t[k]) for k in ("name", "name:ru", "name:en", "name:kk", "brand") if t.get(k)}
                    out.append({"lat": lat, "lon": lon, "names": names, "hours": t.get("opening_hours")})
        except (ValueError, OSError):
            pass
    return out


def name_keys(c):
    base = c["name"].split(" · ")[0]
    keys = {norm(base)}
    keys.add(norm(re.sub(r"\(.*?\)", "", base)))
    return {k for k in keys if len(k) >= 3}


def main(argv):
    cafes = json.loads(re.search(r"window\.CAFES = (.*);", open(DATA, encoding="utf-8").read(), re.S).group(1))
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    osm = load_osm(argv)
    print("OSM объектов:", len(osm))
    for i, c in enumerate(cafes):
        e = cache.get(c["id"], {})
        if e.get("lat") and e.get("district") and (e.get("osmChecked") or not osm):
            continue
        print(i, c["name"], "|", c["address"])
        if not e.get("lat"):
            if c["id"] in MANUAL:
                e.update(lat=MANUAL[c["id"]][0], lon=MANUAL[c["id"]][1], src="manual")
            else:
                g = geocode(c)
                if g:
                    e.update(lat=round(g[0], 6), lon=round(g[1], 6), src="nominatim")
        if e.get("lat") and osm and not e.get("osmChecked"):
            keys = name_keys(c)
            best = None
            for o in osm:
                if keys & o["names"] or any(k in n or n in k for k in keys for n in o["names"] if min(len(k), len(n)) >= 5):
                    d = dist_m((e["lat"], e["lon"]), (o["lat"], o["lon"]))
                    if d < 400 and (best is None or d < best[0]):
                        best = (d, o)
            if best:
                e.update(lat=round(best[1]["lat"], 6), lon=round(best[1]["lon"], 6), src="osm")
                if best[1]["hours"]:
                    e["hours"] = best[1]["hours"]
                print("  OSM совпадение, %d м%s" % (best[0], ", часы: " + best[1]["hours"] if best[1]["hours"] else ""))
            e["osmChecked"] = True
        if e.get("lat") and not e.get("district"):
            e["district"] = district(e["lat"], e["lon"])
        cache[c["id"]] = e
        if i % 10 == 0:
            json.dump(cache, open(CACHE, "w"), ensure_ascii=False, indent=1, sort_keys=True)
    json.dump(cache, open(CACHE, "w"), ensure_ascii=False, indent=1, sort_keys=True)
    found = sum(1 for c in cafes if cache.get(c["id"], {}).get("lat"))
    print("Координаты: %d из %d; часы: %d; районы: %d" % (
        found, len(cafes), sum(1 for v in cache.values() if v.get("hours")), sum(1 for v in cache.values() if v.get("district"))))


if __name__ == "__main__":
    main(sys.argv[1:])
