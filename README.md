# Cooking Book

Личная кулинарная книга: рецепты в YAML, единый шаблон отображения и общие инструменты приготовления.

## Структура

- `recipes/` — отдельные YAML-файлы рецептов.
- `data/categories.yaml` — централизованный список категорий и подкатегорий.
- `scripts/validate_recipes.py` — проверка структуры рецептов и ссылок.
- `scripts/build_site.py` — сборка статического сайта из YAML.
- `assets/` — общий интерфейс сайта и стили.
- `docs/recipe-schema-v1.md` — описание формата YAML-рецептов.
- `.github/workflows/validate-recipes.yml` — автоматическая проверка рецептов при изменениях.
- `.github/workflows/deploy-pages.yml` — сборка и публикация на GitHub Pages.

## Проверить рецепты локально

```bash
python -m pip install -r requirements.txt
python scripts/validate_recipes.py
```

Полное описание формата: [docs/recipe-schema-v1.md](docs/recipe-schema-v1.md).

## Сборка сайта локально

После установки зависимостей выполни:

```bash
python scripts/validate_recipes.py
python scripts/build_site.py
```

Готовые статические файлы будут в папке `dist/`. Публикация запускается автоматически при push в `main`; в настройках репозитория GitHub Pages должен использовать источник **GitHub Actions**.
