# Агент «Обходчик»: раз в неделю обходит OpenStreetMap и ищет новые кафе, бары, бистро, донерные и магазины Алматы,
# которых ещё нет в справочнике. Ключи не нужны. Найденное добавляется в каталог сразу (без оценок: «—», пока их
# не подтвердят агенты рейтингов), а в репозитории открывается issue со списком новинок.
#
# Шаги: tools/fetch_osm.py --fresh (обход города через Nominatim, ограничен по времени) →
#       tools/expand_data.py --incremental (отбор новых мест, уже добавленные не трогаем) → tools/build_data.py.
# Запуск: python3 tools/agent_osm.py [--budget 45] [--add 40] [--dry-run]
import json, os, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRA = os.path.join(ROOT, "tools", "extra_places.json")
PY = sys.executable


def run(*args):
    print("$", " ".join(args))
    return subprocess.run([PY, "-u"] + list(args), cwd=ROOT).returncode


def open_issue(items):
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not (token and repo and items):
        return
    body = "Агент-обходчик нашёл в OpenStreetMap новые места и добавил их в справочник (оценок пока нет, рейтинги подтянут агенты):\n\n" + "\n".join(
        "- **%s** (%s), %s%s" % (i["name"], i["type"], i["address"], ", " + i["district"] + " район" if i.get("district") else "") for i in items
    ) + "\n\n_Создано агентом-обходчиком OnlyGuests._"
    req = urllib.request.Request("https://api.github.com/repos/%s/issues" % repo,
                                 data=json.dumps({"title": "Обходчик: %d новых мест" % len(items), "body": body, "labels": ["scout"]}).encode(),
                                 headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json"})
    try:
        urllib.request.urlopen(req, timeout=30)
        print("Создан issue с новинками")
    except Exception as e:
        print("Issue не создан:", e)


def main(argv):
    budget = argv[argv.index("--budget") + 1] if "--budget" in argv else "45"
    add = argv[argv.index("--add") + 1] if "--add" in argv else "40"
    dry = "--dry-run" in argv
    before = json.load(open(EXTRA, encoding="utf-8")) if os.path.exists(EXTRA) else []
    if run("tools/fetch_osm.py", "--fresh", "--budget", budget):
        print("Обход OpenStreetMap не удался.")
        return 1
    if run("tools/expand_data.py", "--incremental", "--add", add):
        return 1
    after = json.load(open(EXTRA, encoding="utf-8")) if os.path.exists(EXTRA) else []
    new = after[len(before):]
    print("Новых мест за неделю:", len(new))
    for x in new:
        print("  +", x["name"], "|", x["type"], "|", x["address"])
    if new and not dry:
        run("tools/build_data.py", "js/data.js")
        open_issue(new)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
