# Расширение каталога OnlyGuests: из выгрузки OpenStreetMap (tools/osm_places.json, см. fetch_osm.py) выбирает
# заведения, которых ещё нет в справочнике, определяет тип и кухню, район, часы и удобства и пишет
# tools/extra_places.json. Затем tools/build_data.py добавляет их в js/data.js.
#
# Рейтинги у таких мест не придумываются: rating = 0, на сайте «—», а настоящие оценки подтягивают
# агенты (tools/agent_update.py, нужен ключ) или владельцы. Ссылки на 2ГИС, Яндекс Карты и Google Maps — поиск по названию.
# Запуск: python3 tools/expand_data.py [--limit 500]
import json, math, os, re, sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OSM = os.path.join(ROOT, "tools", "osm_places.json")
OUT = os.path.join(ROOT, "tools", "extra_places.json")
GEO = os.path.join(ROOT, "tools", "geo_cache.json")
DATA = os.path.join(ROOT, "js", "data.js")
LIMIT = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 500
HOURS_RE = re.compile(r"^(24/7|((Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?(,(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?)* "
                      r"(\d\d:\d\d-\d\d:\d\d(,\d\d:\d\d-\d\d:\d\d)*|off)(; )?)+)$")
DISTRICTS = {"Алмалин": "Алмалинский", "Ауэзов": "Ауэзовский", "Бостандык": "Бостандыкский", "Жетысу": "Жетысуский", "Медеу": "Медеуский",
             "Наурызбай": "Наурызбайский", "Турксиб": "Турксибский", "Алатау": "Алатауский"}

TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюяәғқңөұүһі", ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya", "a", "g", "k", "n", "o", "u", "u", "h", "i"]))


def norm(s):
    s = s.lower().replace("ё", "е")
    s = "".join(TR.get(c, c) for c in s)
    return re.sub(r"[^a-z0-9]+", "", s)


def dist_m(a, b):
    dlat = math.radians(b[0] - a[0]); dlon = math.radians(b[1] - a[1])
    x = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(x))


# ——— классификация ———
NAME = {
    "doner": re.compile(r"донер|шаурм|шаверм|doner|döner|kebab|кебаб|shawarma|дюрюм|durum|şaurma", re.I),
    "burger": re.compile(r"бургер|burger", re.I),
    "bistro": re.compile(r"bistro|бистро", re.I),
    "bakery": re.compile(r"пекарн|булоч|выпечк|bakery|кондитер|patisserie|bake\b|торт|десерт|dessert|cake|pastry|круассан|хлеб", re.I),
    "coffee": re.compile(r"кофе|coffee|кофейн|espresso|latte|coffeeshop|\bcoffe\b|чайхана кофе", re.I),
    "canteen": re.compile(r"столов|canteen|буфет|асхана|аспаз|ас үй", re.I),
    "pizza": re.compile(r"пицц|pizza", re.I),
    "sushi": re.compile(r"суши|sushi|ролл|ramen|рамен|wok|вок", re.I),
    "uyghur": re.compile(r"лагман|lagman|лагмон|уйгур", re.I),
    "uzbek": re.compile(r"плов|plov|самса|samsa|чайхан|chaihan|узбек|ош\b", re.I),
    "kazakh": re.compile(r"бешбармак|қазақ|казах|kazakh|бауырсак|куырдак|қымыз|кумыс", re.I),
    "georgian": re.compile(r"хинкал|хачапури|грузин|tbilisi|тбилиси|georgia", re.I),
    "steak": re.compile(r"стейк|steak|стэйк", re.I),
    "grill": re.compile(r"шашлык|мангал|гриль|grill|bbq|барбекю|kazan|казан", re.I),
    "korean": re.compile(r"корей|korean|кимчи|kimchi", re.I),
    "turkish": re.compile(r"турец|turkish|istanbul|стамбул|анкара|ankara", re.I),
    "chain_fast": re.compile(r"kfc|кфс|mcdonald|макдоналдс|burger king|бургер кинг|subway|сабвэй|hardee|dodo|додо|domino|папа джонс|papa john|pizza hut|popeyes", re.I),
}
CUISINE_TAG = {
    "kazakh": "kazakh", "uzbek": "uzbek", "uyghur": "uyghur", "georgian": "georgian", "italian": "italian", "pizza": "pizza", "pasta": "italian",
    "japanese": "japanese", "sushi": "japanese", "ramen": "japanese", "chinese": "chinese", "thai": "panasian", "vietnamese": "panasian", "asian": "panasian",
    "korean": "korean", "turkish": "turkish", "kebab": "grill", "steak_house": "steak", "grill": "grill", "barbecue": "grill", "burger": "burger",
    "seafood": "seafood", "fish": "seafood", "mediterranean": "mediterranean", "greek": "mediterranean", "indian": "indian", "russian": "russian",
    "european": "european", "french": "european", "german": "pub", "american": "european", "regional": "european", "coffee_shop": "coffee", "coffee": "coffee",
    "cake": "bakery", "bakery": "bakery", "ice_cream": "bakery", "dessert": "bakery", "sandwich": "bistro", "salad": "bistro", "soup": "bistro",
    "chicken": "burger", "fried_chicken": "burger", "fast_food": "burger", "tea": "coffee", "crepe": "bakery", "donut": "bakery",
}
LABEL = {"kazakh": "Казахская", "uzbek": "Узбекская", "uyghur": "Уйгурская", "georgian": "Грузинская", "italian": "Итальянская", "pizza": "Пицца",
         "japanese": "Японская", "chinese": "Китайская", "panasian": "Паназиатская", "korean": "Корейская", "turkish": "Турецкая", "steak": "Стейк-хаус",
         "grill": "Гриль, шашлык", "burger": "Фастфуд", "seafood": "Морепродукты", "mediterranean": "Средиземноморская", "indian": "Индийская",
         "russian": "Русская", "european": "Европейская", "coffee": "Кофе", "bakery": "Пекарня-кондитерская", "bistro": "Бистро", "mixed": "Разная кухня",
         "canteen": "Столовая", "doner": "Донер, шаурма", "pub": "Паб", "cocktail": "Бар", "store": "Магазин"}
CHECK = {"coffee": 2500, "bakery": 2500, "bistro": 2800, "mixed": 4500, "canteen": 2000, "doner": 2000, "burger": 2500, "pizza": 3000, "pub": 7000,
         "cocktail": 9000, "grill": 5000, "european": 8000, "seafood": 10000, "steak": 15000}


def classify(p):
    t, name, cat = p["tags"], p["name"], p["cat"]
    kind = p["type"]
    cuis = (t.get("cuisine") or "").lower().replace(" ", "").split(";")
    cuis = [c for c in re.split(r"[;,]", ";".join(cuis)) if c]
    ktag = next((CUISINE_TAG[c] for c in cuis if c in CUISINE_TAG), None)
    nm = lambda k: bool(NAME[k].search(name))

    if cat == "shop":
        if kind in ("supermarket", "convenience"):
            return "Магазин", "store", "Супермаркет" if kind == "supermarket" else "Магазин у дома"
        return "Кондитерская", "bakery", "Пекарня-кондитерская"
    if kind in ("bar", "pub", "biergarten"):
        return ("Бар", "pub", "Паб" if kind != "bar" else "Пивной бар") if (kind != "bar" or "beer" in cuis) else ("Бар", "cocktail", "Бар")
    if kind == "food_court":
        return "Кафе", "canteen", "Фудкорт"
    if kind == "fast_food":
        if nm("doner") or ktag == "grill" and "kebab" in cuis:
            return "Донерная", "doner", LABEL["doner"]
        if nm("burger") or "burger" in cuis:
            return "Бургерная", "burger", "Бургеры"
        if nm("pizza") or ktag == "pizza":
            return "Фастфуд", "pizza", "Пицца"
        if nm("chain_fast") or ktag == "burger":
            return "Фастфуд", "burger", "Фастфуд"
        if nm("coffee") or ktag == "coffee":
            return "Кофейня", "coffee", LABEL["coffee"]
        if nm("bakery") or ktag == "bakery":
            return "Кондитерская", "bakery", LABEL["bakery"]
        if nm("sushi") or ktag in ("japanese", "chinese", "panasian", "korean"):
            return "Фастфуд", ktag if ktag in ("japanese", "chinese", "panasian", "korean") else "japanese", LABEL.get(ktag, "Японская")
        return "Бистро", "bistro", LABEL["bistro"]
    # cafe / restaurant
    if nm("bistro"):
        return "Бистро", "bistro", LABEL["bistro"]
    if kind == "cafe":
        if ktag == "coffee" or (nm("coffee") and not ktag):
            return "Кофейня", "coffee", LABEL["coffee"]
        if ktag == "bakery" or nm("bakery"):
            return "Кондитерская", "bakery", LABEL["bakery"]
        if nm("canteen"):
            return "Кафе", "canteen", LABEL["canteen"]
        if nm("doner"):
            return "Донерная", "doner", LABEL["doner"]
        if nm("burger") or ktag == "burger":
            return "Бургерная", "burger", "Бургеры"
        for k in ("pizza", "sushi", "uyghur", "uzbek", "kazakh", "georgian", "steak", "grill", "korean", "turkish"):
            if nm(k) or ktag == k:
                kk = {"sushi": "japanese"}.get(k, k)
                return "Кафе", kk, LABEL[kk]
        if ktag and ktag not in ("coffee", "bakery"):
            return "Кафе", ktag, LABEL.get(ktag, "Кафе")
        return "Кафе", "mixed", LABEL["mixed"]
    # restaurant
    if nm("canteen"):
        return "Кафе", "canteen", LABEL["canteen"]
    if nm("doner"):
        return "Донерная", "doner", LABEL["doner"]
    if nm("burger") or ktag == "burger":
        return "Бургерная", "burger", "Бургеры"
    for k in ("pizza", "sushi", "uyghur", "uzbek", "kazakh", "georgian", "steak", "grill", "korean", "turkish"):
        if nm(k) or ktag == k:
            kk = {"sushi": "japanese"}.get(k, k)
            return "Ресторан", kk, LABEL[kk]
    if ktag and ktag not in ("coffee", "bakery", "bistro"):
        return "Ресторан", ktag, LABEL.get(ktag, "Европейская")
    return "Ресторан", "mixed", LABEL["mixed"]


def features(t):
    f = []
    if t.get("outdoor_seating") == "yes": f.append("veranda")
    if t.get("diet:halal") in ("yes", "only"): f.append("halal")
    if t.get("opening_hours") == "24/7": f.append("allday")
    if t.get("dog") == "yes": f.append("pets")
    return f


def address(a):
    road, house = a.get("road"), a.get("house_number")
    if road:
        return road + (", " + house if house else "")
    return (a.get("suburb") or a.get("neighbourhood") or "адрес уточняется на карте")


def district_of(a, lat, lon, known):
    text = " ".join(str(a.get(k, "")) for k in ("city_district", "suburb", "district", "county", "state_district"))
    for key, d in DISTRICTS.items():
        if key.lower() in text.lower():
            return d
    near = sorted(known, key=lambda k: dist_m((lat, lon), (k[0], k[1])))[:5]
    return Counter(k[2] for k in near).most_common(1)[0][0] if near else None


def score(p):
    t, a = p["tags"], p["addr"]
    s = 0
    if t.get("opening_hours") and HOURS_RE.match(t["opening_hours"]): s += 3
    if a.get("road"): s += 2
    if a.get("house_number"): s += 1
    if t.get("cuisine"): s += 1
    if t.get("phone") or t.get("contact:phone"): s += 1
    if t.get("website") or t.get("contact:website"): s += 1
    if t.get("check_date") or t.get("survey:date"): s += 1
    if t.get("outdoor_seating") or t.get("diet:halal") or t.get("internet_access"): s += 1
    return s


def main():
    osm = json.load(open(OSM, encoding="utf-8"))
    osm.pop("_done", None)
    m = re.search(r"window\.CAFES\s*=\s*(.*?);\s*$", open(DATA, encoding="utf-8").read(), re.S | re.M)
    base = [c for c in json.loads(m.group(1)) if c.get("src") != "osm"]
    geo = json.load(open(GEO, encoding="utf-8"))
    known = [(g["lat"], g["lon"], g["district"]) for g in geo.values() if g.get("lat") and g.get("district")]
    have = [(norm(c["name"]), c.get("lat"), c.get("lon")) for c in base]

    cands, skipped = [], Counter()
    for oid, p in osm.items():
        name = (p["tags"].get("name:ru") or p["name"]).strip()
        p["name"] = name
        key = norm(name)
        if len(key) < 2 or key.isdigit():
            skipped["junk"] += 1
            continue
        if any(h[0] == key and (h[1] is None or dist_m((p["lat"], p["lon"]), (h[1], h[2])) < 700) for h in have):
            skipped["already"] += 1
            continue
        if p["tags"].get("disused") or p["tags"].get("abandoned") or p["tags"].get("opening_hours") == "off":
            skipped["closed"] += 1
            continue
        typ, kitchen, cuisine = classify(p)
        cands.append(dict(oid=oid, key=key, name=name, type=typ, kitchen=kitchen, cuisine=cuisine, score=score(p), p=p))
    print("кандидатов:", len(cands), dict(skipped))
    print("по типам:", dict(Counter(c["type"] for c in cands)))

    # отбор: не больше 2 точек одной сети, квоты на «редкие» типы, остальное — по полноте данных
    cands.sort(key=lambda c: (-c["score"], c["name"]))
    per_name, picked, per_type = Counter(), [], Counter()
    QUOTA = {"Магазин": 45, "Кафе": 130, "Ресторан": 120, "Кофейня": 80, "Кондитерская": 35}
    FLOOR = ["Бистро", "Бар", "Донерная", "Бургерная", "Фастфуд"]       # этих типов берём как можно больше — их в справочнике мало

    def take(c):
        if per_name[c["key"]] >= 2 or any(d["key"] == c["key"] and dist_m((d["p"]["lat"], d["p"]["lon"]), (c["p"]["lat"], c["p"]["lon"])) < 150 for d in picked):
            return False
        per_name[c["key"]] += 1; per_type[c["type"]] += 1; picked.append(c)
        return True
    for t in FLOOR:
        for c in [c for c in cands if c["type"] == t]:
            if len(picked) >= LIMIT: break
            take(c)
    done = {c["oid"] for c in picked}
    for c in cands:
        if len(picked) >= LIMIT: break
        if c["oid"] in done or per_type[c["type"]] >= QUOTA.get(c["type"], 999):
            continue
        take(c)
    for c in cands:                                                    # если квоты не набрали лимит — добираем без квот
        if len(picked) >= LIMIT: break
        if c["oid"] not in {x["oid"] for x in picked}:
            take(c)

    out = []
    for c in sorted(picked, key=lambda c: (c["type"], c["name"].lower())):
        p, t = c["p"], c["p"]["tags"]
        rec = {"name": c["name"], "type": c["type"], "kitchen": c["kitchen"], "cuisine": c["cuisine"], "address": address(p["addr"]),
               "lat": p["lat"], "lon": p["lon"], "features": features(t), "osm": c["oid"]}
        d = district_of(p["addr"], p["lat"], p["lon"], known)
        if d: rec["district"] = d
        if t.get("opening_hours") and HOURS_RE.match(t["opening_hours"]): rec["hours"] = t["opening_hours"]
        out.append(rec)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("выбрано:", len(out), dict(Counter(o["type"] for o in out)))


if __name__ == "__main__":
    main()
