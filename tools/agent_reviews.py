# Агент «Аналитик отзывов»: читает свежие отзывы о заведении и пишет короткую выжимку
# (что хвалят, на что жалуются) и метки для подборок. Результат — js/insights.js.
#
# Запуск: python3 tools/agent_reviews.py [--limit 15] [--days 30] [--mock]
# Выжимка обновляется не чаще раза в --days дней; сначала заведения без выжимки.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai

TAGS = {
    "date": "подходит для свидания",
    "breakfast": "хорошие завтраки",
    "view": "красивый вид (горы, панорама)",
    "laptop": "удобно поработать с ноутбуком (розетки, Wi-Fi, тихо)",
    "lunch": "есть недорогой бизнес-ланч",
    "kids": "удобно с детьми",
    "late": "работает поздно ночью",
    "quick": "быстро обслуживают",
}

PROMPT = ("Ты агент справочника OnlyGuests. Прочитай свежие отзывы гостей о заведении «{name}» "
          "({type}, {cuisine}) в Алматы, адрес {address}. Отзывы ищи в 2ГИС и других открытых источниках. "
          "Напиши честную выжимку на русском: до 3 пунктов, что хвалят, и до 3 пунктов, на что жалуются; "
          "каждый пункт — 2–6 слов, без выдумок. Отметь метки, которые явно подтверждаются отзывами: {tags}. "
          'Ответ — только JSON: {{"pros": ["..."], "cons": ["..."], "tags": ["date"], "reviews": 25}}, '
          'где reviews — сколько отзывов ты прочитал. Если отзывов не нашлось, ответь {{"pros": [], "cons": [], "tags": [], "reviews": 0}}.')


def mock_routes():
    return [ai.WebRoute("mock", lambda p, q, d=None:
                        '{"pros": ["вкусная кухня", "уютный зал"], "cons": ["долго ждать заказ"], "tags": ["date"], "reviews": 12}')]


def main(argv):
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 15
    days = int(argv[argv.index("--days") + 1]) if "--days" in argv else 30
    mock = "--mock" in argv
    routes = mock_routes() if mock else ai.web_routes()
    print("Маршруты:", [r.name for r in routes] or "нет")
    if not routes:
        print("Нет моделей с доступом к поиску — выход.")
        return 0

    from datetime import datetime, timedelta, timezone
    fresh = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    cafes = ai.cafes()
    ins = ai.load_js("insights.js", "INSIGHTS") or {}
    queue = sorted((c for c in cafes if (ins.get(c["id"], {}).get("at") or "") < fresh),
                   key=lambda c: ins.get(c["id"], {}).get("at") or "")[:limit]
    tags_text = "; ".join("%s — %s" % kv for kv in TAGS.items())
    done = 0
    for c in queue:
        name = c["name"].split(" · ")[0]
        print("•", c["name"])
        text, route = ai.ask_web(PROMPT.format(name=name, type=c["type"].lower(), cuisine=c["cuisine"], address=c["address"], tags=tags_text),
                                 "%s %s Алматы отзывы" % (name, c["address"]), routes)
        a = ai.parse_json(text)
        if not isinstance(a, dict):
            print("  нет ответа")
            continue
        pros = [str(x)[:60] for x in (a.get("pros") or []) if str(x).strip()][:3]
        cons = [str(x)[:60] for x in (a.get("cons") or []) if str(x).strip()][:3]
        tags = [t for t in (a.get("tags") or []) if t in TAGS]
        try:
            n = int(a.get("reviews") or 0)
        except (TypeError, ValueError):
            n = 0
        if not (pros or cons):
            print("  отзывов не нашлось")
            ins[c["id"]] = {"at": ai.now_iso(), "empty": True}
            continue
        ins[c["id"]] = {"at": ai.now_iso(), "pros": pros, "cons": cons, "tags": tags, "reviews": n, "by": route}
        done += 1
        print("  +", pros, "−", cons, tags)
    ai.save_js("insights.js", "Выжимки отзывов от агента «Аналитик» (tools/agent_reviews.py). Обновляется автоматически.",
               {"INSIGHTS": ins})
    print("Готово: %d выжимок" % done)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
