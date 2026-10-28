# Общий модуль ИИ для агентов OnlyGuests: бесплатные модели и веб-поиск.
#
# Модели (подключаются, если задан ключ или адрес):
#   OPENROUTER_API_KEY  — бесплатные модели OpenRouter (id с суффиксом :free); модель можно задать
#                         в OPENROUTER_MODEL, иначе берётся лучшая бесплатная из списка OpenRouter.
#   OLLAMA_HOST         — локальная Ollama (например http://localhost:11434), модель OLLAMA_MODEL.
#   GEMINI_API_KEY      — бесплатный тариф Gemini; умеет сам искать в Google.
# Веб-поиск для моделей без доступа в интернет (бесплатные тарифы):
#   TAVILY_API_KEY или BRAVE_API_KEY.
#
# Агент, которому нужны свежие факты, получает «маршрут»: либо Gemini с поиском Google,
# либо выдачу поисковика + любую модель для чтения. Разные агенты по возможности получают
# разные маршруты, чтобы проверка была независимой.
import json, os, re, time, urllib.error, urllib.parse, urllib.request

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
TAVILY_KEY = os.environ.get("TAVILY_API_KEY", "")
BRAVE_KEY = os.environ.get("BRAVE_API_KEY", "")
PAUSE = float(os.environ.get("AGENT_PAUSE", "4"))  # бесплатные тарифы ограничивают частоту запросов

# порядок предпочтения среди бесплатных моделей OpenRouter
OR_PREFER = ["deepseek", "qwen3", "llama-3.3-70b", "llama-4", "gemini", "mistral-small", "gemma-3-27b", "gpt-oss"]


def http_json(url, body=None, headers=None, timeout=120):
    h = {"Content-Type": "application/json", "User-Agent": "OnlyGuests-agents/1.0"}
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def retrying(fn, tries=3):
    for attempt in range(tries):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            body = e.read()[:300]
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(20 * (attempt + 1))
                continue
            raise RuntimeError("HTTP %s: %s" % (e.code, body))
        finally:
            time.sleep(PAUSE)


# ——— модели ———
_or_models = None


def openrouter_models():
    global _or_models
    if _or_models is None:
        if os.environ.get("OPENROUTER_MODEL"):
            _or_models = [m.strip() for m in os.environ["OPENROUTER_MODEL"].split(",") if m.strip()]
        else:
            try:
                data = http_json("https://openrouter.ai/api/v1/models").get("data", [])
            except Exception as e:
                print("OpenRouter: список моделей недоступен:", e)
                data = []
            free = [m["id"] for m in data if m["id"].endswith(":free")
                    and str((m.get("pricing") or {}).get("prompt", "0")) in ("0", "0.0")]
            rank = lambda mid: next((i for i, k in enumerate(OR_PREFER) if k in mid), len(OR_PREFER))
            _or_models = sorted(free, key=rank)[:6]
    return _or_models


def chat_openrouter(prompt, model):
    res = retrying(lambda: http_json("https://openrouter.ai/api/v1/chat/completions",
        {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0},
        {"Authorization": "Bearer " + OPENROUTER_KEY, "HTTP-Referer": "https://onlyguests.vercel.app", "X-Title": "OnlyGuests"}))
    return res["choices"][0]["message"]["content"]


def chat_ollama(prompt):
    res = retrying(lambda: http_json(OLLAMA_HOST + "/api/chat",
        {"model": OLLAMA_MODEL, "messages": [{"role": "user", "content": prompt}], "stream": False,
         "options": {"temperature": 0}}, timeout=600))
    return res["message"]["content"]


def chat_gemini(prompt, search=False):
    url = ("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL +
           ":generateContent?key=" + urllib.parse.quote(GEMINI_KEY))
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0}}
    if search:
        body["tools"] = [{"google_search": {}}]
    res = retrying(lambda: http_json(url, body))
    return "".join(p.get("text", "") for p in res["candidates"][0]["content"]["parts"])


class Model:
    def __init__(self, name, fn):
        self.name, self.fn = name, fn

    def __call__(self, prompt):
        return self.fn(prompt)


def chat_models():
    """Все доступные модели без собственного поиска, в порядке предпочтения."""
    out = []
    if OPENROUTER_KEY:
        for m in openrouter_models():
            out.append(Model("openrouter:" + m, lambda p, m=m: chat_openrouter(p, m)))
    if OLLAMA_HOST:
        out.append(Model("ollama:" + OLLAMA_MODEL, chat_ollama))
    if GEMINI_KEY:
        out.append(Model("gemini:" + GEMINI_MODEL, lambda p: chat_gemini(p)))
    return out


def chat(prompt, models=None):
    """Отвечает первая модель, которая сработала. Возвращает (текст, имя модели)."""
    for m in models or chat_models():
        try:
            return m(prompt), m.name
        except Exception as e:
            print("  %s: %s" % (m.name, e))
    return None, None


# ——— веб-поиск ———
def search_tavily(query, domains=None):
    body = {"api_key": TAVILY_KEY, "query": query, "max_results": 6, "search_depth": "basic"}
    if domains:
        body["include_domains"] = domains
    res = retrying(lambda: http_json("https://api.tavily.com/search", body))
    return [{"title": r.get("title", ""), "url": r.get("url", ""), "text": r.get("content", "")} for r in res.get("results", [])]


def search_brave(query, domains=None):
    q = query + "".join(" site:" + d for d in (domains or [])[:1])
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": q, "count": 8, "search_lang": "ru"})
    res = retrying(lambda: http_json(url, headers={"X-Subscription-Token": BRAVE_KEY, "Accept": "application/json"}))
    return [{"title": r.get("title", ""), "url": r.get("url", ""),
             "text": re.sub(r"<[^>]+>", "", r.get("description", "") + " " + " ".join(r.get("extra_snippets") or []))}
            for r in (res.get("web") or {}).get("results", [])]


def search(query, domains=None):
    for name, fn, ok in (("tavily", search_tavily, TAVILY_KEY), ("brave", search_brave, BRAVE_KEY)):
        if ok:
            try:
                return fn(query, domains)
            except Exception as e:
                print("  поиск %s: %s" % (name, e))
    return None


def has_search():
    return bool(TAVILY_KEY or BRAVE_KEY)


class WebRoute:
    """Способ ответить на вопрос о свежих фактах из интернета."""

    def __init__(self, name, fn):
        self.name, self.fn = name, fn

    def __call__(self, prompt, query, domains=None):
        return self.fn(prompt, query, domains)


def _search_then_read(model):
    def run(prompt, query, domains=None):
        results = search(query, domains)
        if not results:
            return None
        ctx = "\n\n".join("[%d] %s\n%s\n%s" % (i + 1, r["title"], r["url"], r["text"][:1200]) for i, r in enumerate(results))
        return model(prompt + "\n\nОпирайся только на эти результаты поиска (они свежие):\n" + ctx)
    return run


def web_routes():
    routes = []
    if GEMINI_KEY:
        routes.append(WebRoute("gemini+google:" + GEMINI_MODEL, lambda p, q, d=None: chat_gemini(p, search=True)))
    if has_search():
        for m in chat_models():
            if not m.name.startswith("gemini"):
                routes.append(WebRoute("search+" + m.name, _search_then_read(m)))
    return routes


def ask_web(prompt, query, routes, domains=None):
    """Пробует маршруты по очереди. Возвращает (текст, имя маршрута)."""
    for r in routes:
        try:
            text = r(prompt, query, domains)
            if text:
                return text, r.name
        except Exception as e:
            print("  %s: %s" % (r.name, e))
    return None, None


def status():
    return {"openrouter": bool(OPENROUTER_KEY), "ollama": bool(OLLAMA_HOST), "gemini": bool(GEMINI_KEY),
            "search": "tavily" if TAVILY_KEY else "brave" if BRAVE_KEY else None}


# ——— разбор ответов ———
def parse_json(text, want=dict):
    """Достаёт первый JSON-объект или массив из ответа модели."""
    if not text:
        return None
    text = re.sub(r"```(?:json)?", "", text)
    opener = "{" if want is dict else "["
    start = text.find(opener)
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] in "{[":
                depth += 1
            elif text[i] in "}]":
                depth -= 1
                if depth == 0:
                    try:
                        val = json.loads(text[start:i + 1])
                        if isinstance(val, want):
                            return val
                    except ValueError:
                        pass
                    break
        start = text.find(opener, start + 1)
    return None


# ——— общие файлы данных ———
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_js(name, var):
    path = os.path.join(ROOT, "js", name)
    if not os.path.exists(path):
        return None
    m = re.search(r"window\." + var + r"\s*=\s*(.*?);\s*$", open(path, encoding="utf-8").read(), re.S | re.M)
    return json.loads(m.group(1)) if m else None


def save_js(name, header, values):
    path = os.path.join(ROOT, "js", name)
    js = "// " + header + "\n" + "".join(
        "window.%s = %s;\n" % (k, json.dumps(v, ensure_ascii=False, indent=1 if isinstance(v, (dict, list)) and len(v) > 3 else None, sort_keys=True))
        for k, v in values.items())
    open(path, "w", encoding="utf-8").write(js)


def cafes():
    return load_js("data.js", "CAFES") or []


def now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
