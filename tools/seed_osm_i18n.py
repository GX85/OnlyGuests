# Ручные переводы (kk/en) для мест из OpenStreetMap: общий текст «о заведении», названия кухонь и позиции меню.
# Дописывает их в tools/i18n_seed.json и js/i18n-data.js, не трогая уже существующие переводы. Запуск: python3 tools/seed_osm_i18n.py
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPES = {"kk": {"Ресторан": "Мейрамхана", "Кафе": "Кафе", "Кофейня": "Кофехана", "Бар": "Бар", "Бургерная": "Бургерхана", "Донерная": "Донерхана", "Магазин": "Дүкен",
                "Кондитерская": "Кондитерлік", "Бистро": "Бистро", "Фастфуд": "Фастфуд"},
         "en": {"Ресторан": "Restaurant", "Кафе": "Café", "Кофейня": "Coffee shop", "Бар": "Bar", "Бургерная": "Burgers", "Донерная": "Doner", "Магазин": "Store",
                "Кондитерская": "Patisserie", "Бистро": "Bistro", "Фастфуд": "Fast food"}}
ABOUT = {"kk": "{t}. Мекенжай мен жұмыс уақыты — OpenStreetMap деректері бойынша; қонақтардың бағасын 2ГИС, Яндекс Карталар немесе Google Maps-тан қараңыз.",
         "en": "{t}. Address and hours come from OpenStreetMap; check guest ratings on 2GIS, Yandex Maps or Google Maps."}
WORDS = [  # русский, kk, en
    ("Казахская", "Қазақ", "Kazakh"), ("Узбекская", "Өзбек", "Uzbek"), ("Уйгурская", "Ұйғыр", "Uyghur"), ("Грузинская", "Грузин", "Georgian"),
    ("Итальянская", "Итальян", "Italian"), ("Пицца", "Пицца", "Pizza"), ("Японская", "Жапон", "Japanese"), ("Китайская", "Қытай", "Chinese"),
    ("Паназиатская", "Паназиялық", "Pan-Asian"), ("Корейская", "Корей", "Korean"), ("Турецкая", "Түрік", "Turkish"), ("Стейк-хаус", "Стейк-хаус", "Steakhouse"),
    ("Гриль, шашлык", "Гриль, кәуап", "Grill, kebabs"), ("Фастфуд", "Фастфуд", "Fast food"), ("Морепродукты", "Теңіз өнімдері", "Seafood"),
    ("Средиземноморская", "Жерорта теңізі", "Mediterranean"), ("Индийская", "Үнді", "Indian"), ("Русская", "Орыс", "Russian"), ("Европейская", "Еуропалық", "European"),
    ("Кофе", "Кофе", "Coffee"), ("Пекарня-кондитерская", "Наубайхана-кондитерлік", "Bakery & patisserie"), ("Бистро", "Бистро", "Bistro"),
    ("Разная кухня", "Аралас ас мәзірі", "Mixed menu"), ("Столовая", "Асхана", "Canteen"), ("Донер, шаурма", "Донер, шаурма", "Doner, shawarma"), ("Паб", "Паб", "Pub"),
    ("Бар", "Бар", "Bar"), ("Магазин", "Дүкен", "Store"), ("Супермаркет", "Супермаркет", "Supermarket"), ("Магазин у дома", "Үй жанындағы дүкен", "Convenience store"),
    ("Фудкорт", "Фудкорт", "Food court"), ("Пивной бар", "Сыра бары", "Beer bar"), ("Бургеры", "Бургерлер", "Burgers"),
    # меню шаблонов bistro / mixed
    ("Комплексный обед", "Кешкі/түскі кешенді ас", "Set lunch"), ("Суп дня", "Күн сорпасы", "Soup of the day"), ("Паста с курицей", "Тауық етті паста", "Chicken pasta"),
    ("Сэндвич с индейкой", "Күркетауықты сэндвич", "Turkey sandwich"), ("Салат с тунцом", "Тунец салаты", "Tuna salad"), ("Американо", "Американо", "Americano"),
    ("Салат овощной", "Көкөніс салаты", "Vegetable salad"), ("Горячее блюдо дня", "Күн ыстық тағамы", "Hot dish of the day"), ("Десерт дня", "Күн десерті", "Dessert of the day"),
    ("Чай / кофе", "Шай / кофе", "Tea / coffee"),
]
tr = {"kk": {}, "en": {}}
for lang in tr:
    for t, v in TYPES[lang].items():
        tr[lang][t + ". Адрес и часы — по данным OpenStreetMap; оценки гостей смотрите в 2ГИС, Яндекс Картах или Google Maps."] = ABOUT[lang].format(t=v)
    for ru, kk, en in WORDS:
        tr[lang][ru] = kk if lang == "kk" else en

seed_p = os.path.join(ROOT, "tools", "i18n_seed.json")
seed = json.load(open(seed_p, encoding="utf-8"))
data_p = os.path.join(ROOT, "js", "i18n-data.js")
src = open(data_p, encoding="utf-8").read()
m = re.search(r"window\.I18N_DATA\s*=\s*(.*?);\s*$", src, re.S | re.M)
data = json.loads(m.group(1))
for lang in tr:
    for k, v in tr[lang].items():
        seed.setdefault(lang, {}).setdefault(k, v)
        data.setdefault(lang, {}).setdefault(k, v)
json.dump(seed, open(seed_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
head = src[:m.start()]
open(data_p, "w", encoding="utf-8").write(head + "window.I18N_DATA = " + json.dumps(data, ensure_ascii=False, sort_keys=True) + ";\n")
print("добавлено переводов:", sum(len(v) for v in tr.values()))
