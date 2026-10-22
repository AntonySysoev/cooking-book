# Cooking Book

Личная кулинарная книга: рецепты в YAML, единый шаблон отображения и общие инструменты приготовления.

## Структура

- `recipes/` — отдельные YAML-файлы рецептов.
- `data/categories.yaml` — централизованный список категорий и подкатегорий.
- `scripts/validate_recipes.py` — проверка структуры рецептов и ссылок.
- `docs/recipe-schema-v1.md` — описание формата YAML-рецептов.
- `.github/workflows/validate-recipes.yml` — автоматическая проверка рецептов при изменениях.

## Проверить рецепты локально

```bash
python -m pip install -r requirements.txt
python scripts/validate_recipes.py
```

Полное описание формата: [docs/recipe-schema-v1.md](docs/recipe-schema-v1.md).
