# SEO-страницы OnlyGuests: отдельная страница у каждого места (place/<id>.html), sitemap.xml и robots.txt,
# а в index.html — список ссылок на все места (между метками places:start / places:end).
# Учитывает свежие рейтинги агентов из js/live.js. Запуск: python3 tools/build_pages.py
import html, json, os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai

SITE = "https://onlyguests.vercel.app"
ROOT = ai.ROOT
SCHEMA_TYPE = {"Бар": "BarOrPub", "Кофейня": "CafeOrCoffeeShop", "Кафе": "CafeOrCoffeeShop", "Кондитерская": "Bakery",
               "Магазин": "GroceryStore", "Донерная": "FastFoodRestaurant", "Бургерная": "FastFoodRestaurant", "Фастфуд": "FastFoodRestaurant"}
DAYS = {"Mo": "Monday", "Tu": "Tuesday", "We": "Wednesday", "Th": "Thursday", "Fr": "Friday", "Sa": "Saturday", "Su": "Sunday"}
DAYS_RU = {"Mo": "пн", "Tu": "вт", "We": "ср", "Th": "чт", "Fr": "пт", "Sa": "сб", "Su": "вс"}
e = html.escape


def num(n):
    return "{:,}".format(int(n)).replace(",", " ")


def hours_ru(h):
    if not h:
        return None
    if h == "24/7":
        return "круглосуточно"
    out = h
    for k, v in DAYS_RU.items():
        out = out.replace(k, v)
    return out.replace("off", "выходной").replace("; ", "; ")


def is_choice(c):
    """«Выбор OnlyGuests»: то же правило, что в js/core.js."""
    return (c["type"] in ("Ресторан", "Кафе", "Бистро", "Бар") and not c.get("closed") and not c.get("ratingApprox")
            and c["rating"] >= 4.9 and (c.get("votes") or 0) >= 1000)


def page(c, all_ids):
    name = c["name"]
    t = c["type"]
    rating = ("%s%.1f" % ("≈" if c["ratingApprox"] else "", c["rating"])) if c["rating"] else "—"
    votes = (num(c["votes"]) + " оценок") if c.get("votes") else ("оценки гостей смотрите на картах" if not c["rating"] else "число оценок уточняется")
    q = urllib.parse.quote(c["name"])
    yandex = "https://yandex.kz/maps/162/almaty/search/" + q
    google = "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(c["name"] + " Алматы")
    check = ("≈" if c["checkApprox"] else "") + num(c["check"]) + " ₸"
    title = "%s — %s, %s · Алматы | OnlyGuests" % (name, t.lower(), c["cuisine"].lower())
    desc = "%s в Алматы: %sсредний чек %s, %s. Адрес: %s.%s" % (
        name, ("рейтинг 2ГИС %s (%s), " % (rating, votes)) if c["rating"] else "", check, c["cuisine"].lower(), c["address"],
        " Часы: " + hours_ru(c["hours"]) + "." if c.get("hours") else "")
    ld = {"@context": "https://schema.org", "@type": SCHEMA_TYPE.get(t, "Restaurant"), "name": name,
          "url": SITE + "/place/" + c["id"], "image": [SITE + "/" + p for p in c["photos"]],
          "address": {"@type": "PostalAddress", "streetAddress": c["address"], "addressLocality": "Алматы", "addressCountry": "KZ"},
          "description": c["about"], "sameAs": [c["gis"]]}
    if t != "Магазин":
        ld["servesCuisine"] = c["cuisine"]
    if c.get("lat"):
        ld["geo"] = {"@type": "GeoCoordinates", "latitude": c["lat"], "longitude": c["lon"]}
    if c.get("hours"):
        ld["openingHours"] = "Mo-Su 00:00-23:59" if c["hours"] == "24/7" else c["hours"].replace("; ", ", ")
    ld["priceRange"] = "₸" * (1 if c["check"] <= 3000 else 2 if c["check"] <= 8000 else 3 if c["check"] <= 15000 else 4)
    menu = "".join('<li><span class="menu__name">%s%s</span><span class="menu__price">%s ₸</span></li>' % (
        e(m["name"]), "<em>фирменное</em>" if m.get("signature") else "", num(m["price"])) for m in c["menu"])
    feats = {"kids": "Детская комната", "namaz": "Намазхана", "halal": "Халал", "veranda": "Летняя веранда",
             "music": "Живая музыка", "allday": "Круглосуточно", "pets": "Можно с питомцами"}
    tags = "".join('<span class="tag">%s</span>' % feats[f] for f in c["features"])
    i = all_ids.index(c["id"])
    nearby = [x for x in all_ids[max(0, i - 3):i + 4] if x != c["id"]]
    return f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{SITE}/place/{c['id']}">
<meta property="og:type" content="place">
<meta property="og:title" content="{e(name)} — OnlyGuests">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{SITE}/{c['photos'][0]}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%232b1b12'/%3E%3Ctext x='32' y='43' font-family='Georgia' font-style='italic' font-weight='700' font-size='30' text-anchor='middle' fill='%23d9b07a'%3EOG%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<div class="fogbg" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
<header class="top"><div class="wrap top__row">
  <a class="logo" href="../"><img class="logo__mark" src="../img/art/vangogh-oleanders-logo.jpg" alt="" width="44" height="44"><span class="logo__text">Only<i>Guests</i></span></a>
  <div class="top__actions"><a class="top__link" href="../#{c['id']}">Открыть в справочнике</a></div>
</div></header>
<main class="wrap place">
  <nav class="crumbs"><a href="../">OnlyGuests</a> › {e(t)} › {e(name)}</nav>
  <article class="panel">
    <img class="place__img" src="../{c['photos'][0]}" alt="{e(name)}" width="1000" height="750">
    <div class="m">
      <div class="m__head">{'<p class="choice choice--lg">✦ Выбор OnlyGuests <small>Рейтинг 4.9+ и больше 1000 оценок гостей в 2ГИС</small></p>' if is_choice(c) else ''}<h1>{e(name)}</h1><p>{e(t)} · {e(c['cuisine'])} · Алматы</p></div>
      <div class="facts">
        <div class="fact"><div class="fact__label">Рейтинг</div><div class="fact__value"><span class="star">★</span> {rating}</div><div class="fact__note">{votes}</div></div>
        <div class="fact"><div class="fact__label">Год открытия</div><div class="fact__value">{e(str(c['opened'])) if c.get('opened') else 'нет данных'}</div><div class="fact__note">{e(c.get('openedNote') or 'в открытых источниках не нашли')}</div></div>
        <div class="fact"><div class="fact__label">Средний чек</div><div class="fact__value">{check}</div><div class="fact__note">{'оценка по типу заведения' if c['checkApprox'] else 'по данным 2ГИС'}</div></div>
      </div>
      <div class="m__section"><h2>Адрес и часы</h2><p class="m__about">📍 {e(c['address'])}, Алматы{(' · ' + e(c['district']) + ' район') if c.get('district') else ''}</p>
        <p class="m__about">🕒 {e(hours_ru(c.get('hours')) or 'часы работы уточняются — смотрите в 2ГИС')}</p></div>
      {('<div class="m__section"><h2>Удобства</h2><div class="tags">' + tags + '</div></div>') if tags else ''}
      <div class="m__section"><h2>О заведении</h2><p class="m__about">{e(c['about'])}</p></div>
      <div class="m__section"><h2>{'Популярные товары' if t == 'Магазин' else 'Меню'}</h2><ul class="menu">{menu}</ul>
        <p class="menu-note">Популярные позиции, цены ориентировочные. Актуальное меню и цены — в 2ГИС.</p></div>
      <div class="actions">
        <a class="btn" href="../#{c['id']}">Открыть в OnlyGuests</a>
        <a class="btn btn--ghost" href="{e(c['gis'])}" rel="noopener" target="_blank">2ГИС ↗</a>
        <a class="btn btn--ghost" href="{e(yandex)}" rel="noopener" target="_blank">Яндекс Карты ↗</a>
        <a class="btn btn--ghost" href="{e(google)}" rel="noopener" target="_blank">Google Maps ↗</a>
      </div>
      <div class="m__section"><h2>Рядом в справочнике</h2><p class="m__about">{' · '.join('<a href="%s">%s</a>' % (x, e(NAMES[x])) for x in nearby)}</p></div>
    </div>
  </article>
</main>
<footer class="foot"><div class="wrap"><p><b>OnlyGuests</b> — независимый справочник кафе, баров и магазинов Алматы. Рейтинги — по карточкам 2ГИС, их перепроверяют ИИ-агенты. Фото иллюстративные. Разработчик: +7 700 683 02 47, ItsTeamSwift@proton.me.</p></div></footer>
</body>
</html>
"""


NAMES = {}


def main():
    cafes = ai.cafes()
    live = ai.load_js("live.js", "LIVE") or {}
    for c in cafes:
        l = live.get(c["id"]) or {}
        if l.get("rating") is not None:
            c["rating"], c["ratingApprox"] = l["rating"], False
            c["votes"] = l.get("votes") or c["votes"]
        if l.get("hours"):
            c["hours"] = l["hours"]
        if l.get("check"):
            c["check"], c["checkApprox"] = l["check"], False
        if l.get("lat") and l.get("lon"):
            c["lat"], c["lon"] = l["lat"], l["lon"]
            if l.get("address"):
                c["address"] = l["address"]
        NAMES[c["id"]] = c["name"]
    ids = sorted(NAMES, key=lambda i: NAMES[i].lower())
    os.makedirs(os.path.join(ROOT, "place"), exist_ok=True)
    keep = set()
    for c in cafes:
        fn = c["id"] + ".html"
        keep.add(fn)
        with open(os.path.join(ROOT, "place", fn), "w", encoding="utf-8") as f:
            f.write(page(c, ids))
    for fn in os.listdir(os.path.join(ROOT, "place")):
        if fn.endswith(".html") and fn not in keep:
            os.remove(os.path.join(ROOT, "place", fn))

    # lastmod меняется, только когда агенты действительно обновили данные — иначе не будет лишних коммитов
    base = "2026-10-28"
    meta = ai.load_js("live.js", "LIVE_META") or {}
    when = {i: ((live.get(i) or {}).get("confirmedAt") or base)[:10] for i in ids}
    urls = [(SITE + "/", (meta.get("updatedAt") or base)[:10])] + [(SITE + "/place/" + i, when[i]) for i in ids]
    sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "".join(
        "  <url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % u for u in urls) + "</urlset>\n"
    open(os.path.join(ROOT, "sitemap.xml"), "w").write(sm)
    open(os.path.join(ROOT, "robots.txt"), "w").write("User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: %s/sitemap.xml\n" % SITE)

    idx = os.path.join(ROOT, "index.html")
    src = open(idx, encoding="utf-8").read()
    links = "\n".join('        <a href="place/%s">%s</a>' % (i, e(NAMES[i])) for i in ids)
    src = re.sub(r"(<!-- places:start -->).*?(<!-- places:end -->)", lambda m: m.group(1) + "\n" + links + "\n        " + m.group(2), src, flags=re.S)
    open(idx, "w", encoding="utf-8").write(src)
    print("Страниц: %d, sitemap: %d адресов" % (len(cafes), len(urls)))


if __name__ == "__main__":
    main()
