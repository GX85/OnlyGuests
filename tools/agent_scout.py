# Агент «Разведчик»: раз в неделю ищет в интернете новые кафе, бары, донерные и магазины Алматы,
# которых ещё нет в справочнике. Второй агент проверяет каждую находку по 2ГИС.
# Подтверждённые находки попадают в js/scout.js (блок «На радаре» на сайте),
# а при наличии GITHUB_TOKEN — в issue репозитория, чтобы разработчик добавил их в справочник.
#
# Запуск: python3 tools/agent_scout.py [--mock]
import json, os, re, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai

QUERIES = [
    "новое кафе открылось в Алматы",
    "открытие нового ресторана Алматы",
    "новый бар Алматы открылся",
    "новая кофейня Алматы",
    "новая донерная или бургерная Алматы",
    "открылся новый супермаркет Алматы",
]

FIND = ("Ты агент-разведчик справочника OnlyGuests. Найди заведения в Алматы, которые открылись "
        "за последние 2–3 месяца: {q}. Не включай заведения из этого списка, они уже есть в справочнике: {known}. "
        "Для каждого найденного укажи название, тип (Ресторан, Кафе, Кофейня, Бар, Бистро, Донерная, "
        "Бургерная, Магазин), адрес и ссылку на источник. "
        'Ответ — только JSON-массив: [{{"name": "...", "type": "Кафе", "address": "...", "source": "https://...", "note": "чем интересно, до 12 слов"}}]. '
        "Если ничего надёжного нет — пустой массив [].")

VERIFY = ("Проверь по 2ГИС (2gis.kz), существует ли в Алматы «{name}» по адресу {address} и работает ли сейчас. "
          'Ответ — только JSON: {{"exists": true, "rating": 4.8 или null, "votes": 120 или null, "gis": "ссылка на карточку 2ГИС или null"}}.')


def norm(s):
    return re.sub(r"[^a-zа-яё0-9әғқңөұүһі]+", "", s.lower())


def mock_routes():
    def fake(p, q, d=None):
        if "разведчик" in p:
            return '[{"name": "Test Bistro", "type": "Бистро", "address": "ул. Абая, 1", "source": "https://example.com", "note": "новое бистро"}]'
        return '{"exists": true, "rating": 4.9, "votes": 12, "gis": null}'
    return [ai.WebRoute("mock-a", fake), ai.WebRoute("mock-b", fake)]


def open_issue(items):
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not (token and repo and items):
        return
    body = "Разведчик нашёл новые места, которых нет в справочнике. Проверьте и добавьте в `tools/build_data.py`:\n\n" + "\n".join(
        "- **%s** (%s), %s%s — %s%s" % (i["name"], i["type"], i["address"],
                                       ", 2ГИС %.1f" % i["rating"] if i.get("rating") else "",
                                       i.get("note", ""), " — [источник](%s)" % i["source"] if i.get("source") else "")
        for i in items) + "\n\n_Создано агентом-разведчиком OnlyGuests._"
    req = urllib.request.Request("https://api.github.com/repos/%s/issues" % repo,
                                 data=json.dumps({"title": "Разведчик: %d новых мест" % len(items), "body": body, "labels": ["scout"]}).encode(),
                                 headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})
    try:
        urllib.request.urlopen(req, timeout=30)
        print("Создан issue с находками")
    except Exception as e:
        print("Issue не создан:", e)


def main(argv):
    mock = "--mock" in argv
    routes = mock_routes() if mock else ai.web_routes()
    print("Маршруты:", [r.name for r in routes] or "нет")
    if not routes:
        print("Нет моделей с доступом к поиску — выход.")
        return 0
    cafes = ai.cafes()
    scout = ai.load_js("scout.js", "SCOUT") or {"items": []}
    known = {norm(c["name"].split(" · ")[0]) for c in cafes} | {norm(i["name"]) for i in scout["items"]}
    known_text = ", ".join(sorted({c["name"].split(" · ")[0] for c in cafes}))[:3000]

    found = []
    for q in QUERIES:
        print("Ищу:", q)
        text, route = ai.ask_web(FIND.format(q=q, known=known_text), q + " 2026", routes)
        for it in ai.parse_json(text, list) or []:
            if not isinstance(it, dict) or not it.get("name") or not it.get("address"):
                continue
            if norm(it["name"]) in known:
                continue
            known.add(norm(it["name"]))
            it["foundBy"] = route
            found.append(it)
    print("Кандидатов:", len(found))

    confirmed = []
    for it in found[:15]:
        rest = [r for r in routes if r.name != it.get("foundBy")] or routes
        text, route = ai.ask_web(VERIFY.format(**it), "%s %s Алматы 2ГИС" % (it["name"], it["address"]), rest, ["2gis.kz"])
        v = ai.parse_json(text)
        if not (isinstance(v, dict) and v.get("exists") is True):
            print("  не подтвердилось:", it["name"])
            continue
        item = {k: str(it.get(k, ""))[:160] for k in ("name", "type", "address", "source", "note")}
        try:
            item["rating"] = round(float(v["rating"]), 1) if v.get("rating") else None
        except (TypeError, ValueError):
            item["rating"] = None
        item["gis"] = v.get("gis") if isinstance(v.get("gis"), str) and "2gis" in v.get("gis", "") else None
        item["foundAt"] = ai.now_iso()
        confirmed.append(item)
        print("  +", item["name"], item["address"])

    scout["items"] = (confirmed + scout["items"])[:40]
    scout["updatedAt"] = ai.now_iso()
    ai.save_js("scout.js", "Находки агента-разведчика (tools/agent_scout.py). Ещё не в справочнике, ждут проверки.", {"SCOUT": scout})
    if not mock:
        open_issue(confirmed)
    print("Подтверждено новых мест:", len(confirmed))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
