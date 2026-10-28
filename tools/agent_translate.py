# Агент «Переводчик»: переводит тексты справочника (описания, кухни, меню) на казахский
# и английский. Интернет не нужен, подходит любая бесплатная модель (OpenRouter, Ollama, Gemini).
# Результат — js/i18n-data.js: словарь «русский текст → перевод» для каждого языка.
# Переводятся только новые строки; ручные переводы из tools/i18n_seed.json не перезаписываются.
#
# Запуск: python3 tools/agent_translate.py [--limit 400] [--mock]
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai

LANGS = {"kk": "казахский (кириллица, литературный)", "en": "английский"}
BATCH = 30
SEED = os.path.join(ai.ROOT, "tools", "i18n_seed.json")

PROMPT = ("Переведи строки справочника кафе Алматы на {lang}. Сохраняй смысл и краткость, названия блюд "
          "переводи так, как их пишут в меню; собственные названия заведений и брендов не переводи. "
          "Ответ — только JSON-объект, где ключ — исходная строка без изменений, значение — перевод.\n\n{items}")


def strings(cafes):
    out = []
    for c in cafes:
        out += [c["cuisine"], c["about"], c["type"]] + [m["name"] for m in c["menu"]]
        if c.get("openedNote"):
            out.append(c["openedNote"])
    seen, res = set(), []
    for s in out:
        if s and s not in seen:
            seen.add(s); res.append(s)
    return res


def main(argv):
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else 400
    mock = "--mock" in argv
    models = [ai.Model("mock", lambda p: json.dumps({s: "[%s]" % s for s in json.loads(p[p.index("\n\n") + 2:])}, ensure_ascii=False))] if mock else ai.chat_models()
    print("Модели:", [m.name for m in models] or "нет")
    if not models:
        print("Нет моделей: сохраняю только ручные переводы из tools/i18n_seed.json.")
    data = ai.load_js("i18n-data.js", "I18N_DATA") or {}
    seed = json.load(open(SEED, encoding="utf-8")) if os.path.exists(SEED) else {}
    todo_all = strings(ai.cafes())
    for lang, lang_name in LANGS.items():
        d = data.setdefault(lang, {})
        d.update(seed.get(lang, {}))
        todo = [s for s in todo_all if s not in d][:limit]
        print(lang, "к переводу:", len(todo))
        for i in range(0, len(todo) if models else 0, BATCH):
            chunk = todo[i:i + BATCH]
            text, name = ai.chat(PROMPT.format(lang=lang_name, items=json.dumps(chunk, ensure_ascii=False)), models)
            res = ai.parse_json(text)
            if not isinstance(res, dict):
                print("  пакет не переведён")
                continue
            for s in chunk:
                t = res.get(s)
                if isinstance(t, str) and t.strip() and len(t) < len(s) * 3 + 20:
                    d[s] = t.strip()
            print("  +%d (%s)" % (len(chunk), name))
    ai.save_js("i18n-data.js", "Переводы текстов справочника (tools/agent_translate.py + ручные из tools/i18n_seed.json).",
               {"I18N_DATA": data})
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
