#!/usr/bin/env python3
"""Verify that every source recipe is present in the generated site data."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "recipes"
BUILT_RECIPES = ROOT / "dist" / "data" / "recipes.json"


def main() -> int:
    source_by_id: dict[str, tuple[Path, str]] = {}

    for path in sorted(SOURCE_DIR.glob("*.yaml")):
        with path.open("r", encoding="utf-8") as handle:
            recipe = yaml.safe_load(handle)

        if not isinstance(recipe, dict) or not recipe.get("id"):
            print(f"ERROR: {path.relative_to(ROOT)} has no recipe ID.", file=sys.stderr)
            return 1

        recipe_id = str(recipe["id"])
        if recipe_id in source_by_id:
            other_path = source_by_id[recipe_id][0]
            print(
                f"ERROR: duplicate recipe ID '{recipe_id}' in "
                f"{other_path.relative_to(ROOT)} and {path.relative_to(ROOT)}.",
                file=sys.stderr,
            )
            return 1

        source_by_id[recipe_id] = (path, str(recipe.get("title") or recipe_id))

    if not BUILT_RECIPES.is_file():
        print(
            f"ERROR: built recipe data not found: {BUILT_RECIPES.relative_to(ROOT)}. "
            "Run scripts/build_site.py first.",
            file=sys.stderr,
        )
        return 1

    with BUILT_RECIPES.open("r", encoding="utf-8") as handle:
        built_recipes = json.load(handle)

    if not isinstance(built_recipes, list):
        print("ERROR: dist/data/recipes.json must contain a JSON array.", file=sys.stderr)
        return 1

    built_ids: list[str] = []
    built_titles: dict[str, str] = {}
    for index, recipe in enumerate(built_recipes):
        if not isinstance(recipe, dict) or not recipe.get("id"):
            print(f"ERROR: built recipe at index {index} has no ID.", file=sys.stderr)
            return 1
        recipe_id = str(recipe["id"])
        built_ids.append(recipe_id)
        built_titles[recipe_id] = str(recipe.get("title") or recipe_id)

    built_id_set = set(built_ids)
    source_id_set = set(source_by_id)
    missing = sorted(source_id_set - built_id_set)
    unexpected = sorted(built_id_set - source_id_set)
    duplicate_built = sorted({recipe_id for recipe_id in built_ids if built_ids.count(recipe_id) > 1})

    print(f"Source recipes: {len(source_by_id)}")
    print(f"Built recipes:  {len(built_recipes)}")

    if missing or unexpected or duplicate_built:
        if missing:
            print("\nERROR: source recipes missing from the built site:")
            for recipe_id in missing:
                path, title = source_by_id[recipe_id]
                print(f"  - {title} (ID: {recipe_id}; file: {path.relative_to(ROOT)})")
        if unexpected:
            print("\nERROR: built site contains recipes with no matching source YAML:")
            for recipe_id in unexpected:
                print(f"  - {built_titles[recipe_id]} (ID: {recipe_id})")
        if duplicate_built:
            print("\nERROR: duplicate recipe IDs in built site:")
            for recipe_id in duplicate_built:
                print(f"  - {recipe_id}")
        print("\nRecipe build check FAILED.", file=sys.stderr)
        return 1

    print("Recipe build check passed: every source recipe is present exactly once.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
