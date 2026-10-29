# Автономная подложка карты: сшивает плитки OpenStreetMap (z14) в одну картинку img/map-almaty.jpg
# и пишет её границы в js/basemap.js. Нужна, чтобы карта работала там, где нельзя грузить внешние
# картинки (артефакт) и как запасной фон, если серверы плиток недоступны.
# Плитки качаются один раз, с паузой и честным User-Agent (политика tile.openstreetmap.org).
# Запуск: python3 tools/build_basemap.py [каталог_кэша_плиток]
import io, json, math, os, sys, time, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z = 13
BBOX = (43.10, 76.76, 43.37, 77.09)  # юг, запад, север, восток
UA = "OnlyGuests/1.0 (+https://onlyguests.vercel.app; ItsTeamSwift@proton.me)"
cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tools", "tiles_cache")
os.makedirs(cache, exist_ok=True)


def tile(lat, lon):
    n = 2 ** Z
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def corner(x, y):  # северо-западный угол плитки
    n = 2 ** Z
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))), x / n * 360 - 180


x0, y1 = tile(BBOX[0], BBOX[1])
x1, y0 = tile(BBOX[2], BBOX[3])
img = Image.new("RGB", ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256), "#e8e0d4")
for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
        p = os.path.join(cache, "%d_%d_%d.png" % (Z, x, y))
        if not os.path.exists(p):
            req = urllib.request.Request("https://tile.openstreetmap.org/%d/%d/%d.png" % (Z, x, y), headers={"User-Agent": UA})
            for attempt in range(3):
                try:
                    open(p, "wb").write(urllib.request.urlopen(req, timeout=30).read())
                    break
                except Exception as e:
                    print("  плитка", x, y, e)
                    time.sleep(3)
            time.sleep(0.3)
        if os.path.exists(p):
            img.paste(Image.open(p).convert("RGB"), ((x - x0) * 256, (y - y0) * 256))
out = os.path.join(ROOT, "img", "map-almaty.jpg")
img.save(out, quality=78, optimize=True, progressive=True)
n_lat, w_lon = corner(x0, y0)
s_lat, e_lon = corner(x1 + 1, y1 + 1)
open(os.path.join(ROOT, "js", "basemap.js"), "w").write(
    "// Границы автономной подложки карты (tools/build_basemap.py): [[юг, запад], [север, восток]].\n"
    "window.BASEMAP = %s;\n" % json.dumps({"src": "img/map-almaty.jpg", "bounds": [[round(s_lat, 6), round(w_lon, 6)], [round(n_lat, 6), round(e_lon, 6)]], "zoom": Z}))
print("плиток: %d, картинка %dx%d, %d КБ" % ((x1 - x0 + 1) * (y1 - y0 + 1), img.width, img.height, os.path.getsize(out) // 1024))
