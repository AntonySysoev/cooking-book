#!/usr/bin/env python3
"""Validate Cooking Book recipe YAML files.

Usage:
  python scripts/validate_recipes.py
  python scripts/validate_recipes.py recipes/tiramisu.yaml
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RECIPES_DIR = ROOT / "recipes"


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_recipe(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        return [f"{path}: cannot read YAML: {exc}"]

    if not isinstance(data, dict):
        return [f"{path}: recipe must be a YAML mapping"]

    def error(message: str) -> None:
        errors.append(f"{path}: {message}")

    for field in ("id", "title", "category", "yield", "ingredients", "steps"):
        if field not in data:
            error(f"missing required field '{field}'")

    if not isinstance(data.get("id"), str) or not data.get("id", "").strip():
        error("'id' must be a non-empty string")
    if not isinstance(data.get("title"), str) or not data.get("title", "").strip():
        error("'title' must be a non-empty string")
    if not isinstance(data.get("category"), str) or not data.get("category", "").strip():
        error("'category' must be a non-empty category ID")
    categories_path = ROOT / "data" / "categories.yaml"
    known_categories: dict[str, set[str]] = {}
    if categories_path.exists():
        try:
            category_data = yaml.safe_load(categories_path.read_text(encoding="utf-8")) or {}
            for item in category_data.get("categories", []):
                if isinstance(item, dict) and item.get("id"):
                    known_categories[str(item["id"])] = {
                        str(sub["id"]) for sub in item.get("subcategories", [])
                        if isinstance(sub, dict) and sub.get("id")
                    }
        except (OSError, yaml.YAMLError):
            error("cannot parse data/categories.yaml")
    category_id = data.get("category")
    if known_categories and category_id not in known_categories:
        error(f"unknown category ID '{category_id}' in data/categories.yaml")
    subcategory_id = data.get("subcategory")
    if subcategory_id and category_id in known_categories and subcategory_id not in known_categories[category_id]:
        error(f"unknown subcategory ID '{subcategory_id}' for category '{category_id}'")

    groups = data.get("ingredient_groups", [])
    group_ids: set[str] = set()
    if groups is not None:
        if not isinstance(groups, list):
            error("'ingredient_groups' must be a list")
            groups = []
        for index, group in enumerate(groups):
            if not isinstance(group, dict) or not group.get("id"):
                error(f"ingredient_groups[{index}] must have an ID")
                continue
            gid = str(group["id"])
            if gid in group_ids:
                error(f"duplicate ingredient group ID '{gid}'")
            group_ids.add(gid)

    ingredients = data.get("ingredients", [])
    ingredient_by_id: dict[str, dict[str, Any]] = {}
    if not isinstance(ingredients, list):
        error("'ingredients' must be a list")
        ingredients = []

    for index, ingredient in enumerate(ingredients):
        if not isinstance(ingredient, dict):
            error(f"ingredients[{index}] must be a mapping")
            continue
        iid = ingredient.get("id")
        if not isinstance(iid, str) or not iid.strip():
            error(f"ingredients[{index}] must have a non-empty ID")
            continue
        if iid in ingredient_by_id:
            error(f"duplicate ingredient ID '{iid}'")
        ingredient_by_id[iid] = ingredient

        has_exact = "quantity" in ingredient
        has_min = "quantity_min" in ingredient
        has_max = "quantity_max" in ingredient
        if has_exact and (has_min or has_max):
            error(f"ingredient '{iid}' cannot combine quantity with quantity_min/quantity_max")
        if has_min != has_max:
            error(f"ingredient '{iid}' must provide both quantity_min and quantity_max")
        for key in ("quantity", "quantity_min", "quantity_max"):
            if key in ingredient:
                value = ingredient[key]
                if not is_number(value) or value < 0:
                    error(f"ingredient '{iid}' field '{key}' must be a non-negative number")
        if has_min and has_max and is_number(ingredient["quantity_min"]) and is_number(ingredient["quantity_max"]):
            if ingredient["quantity_min"] > ingredient["quantity_max"]:
                error(f"ingredient '{iid}' has quantity_min greater than quantity_max")
        if has_exact or has_min or has_max:
            if not isinstance(ingredient.get("unit"), str) or not ingredient.get("unit", "").strip():
                error(f"ingredient '{iid}' has a quantity but no unit")

        group = ingredient.get("group")
        if group is not None and group_ids and group not in group_ids:
            error(f"ingredient '{iid}' refers to unknown group '{group}'")

        parts = ingredient.get("parts", [])
        if parts is not None and not isinstance(parts, list):
            error(f"ingredient '{iid}' parts must be a list")
            parts = []
        part_ids: set[str] = set()
        part_quantities: list[float] = []
        all_parts_have_exact_quantity = bool(parts)
        for pindex, part in enumerate(parts):
            if not isinstance(part, dict) or not part.get("id"):
                error(f"ingredient '{iid}' part {pindex} must have an ID")
                all_parts_have_exact_quantity = False
                continue
            pid = str(part["id"])
            if pid in part_ids:
                error(f"ingredient '{iid}' has duplicate part ID '{pid}'")
            part_ids.add(pid)
            if "quantity" not in part:
                all_parts_have_exact_quantity = False
            else:
                q = part["quantity"]
                if not is_number(q) or q < 0:
                    error(f"ingredient '{iid}' part '{pid}' quantity must be a non-negative number")
                    all_parts_have_exact_quantity = False
                else:
                    part_quantities.append(float(q))
            pgroup = part.get("group")
            if pgroup is not None and group_ids and pgroup not in group_ids:
                error(f"ingredient '{iid}' part '{pid}' refers to unknown group '{pgroup}'")

        if parts and ingredient.get("parts_mode", "allocation") != "components":
            if "quantity" in ingredient and all_parts_have_exact_quantity and len(part_quantities) == len(parts):
                if abs(sum(part_quantities) - float(ingredient["quantity"])) > 1e-6:
                    error(
                        f"ingredient '{iid}' parts sum to {sum(part_quantities):g}, "
                        f"but total quantity is {ingredient['quantity']}"
                    )
            elif "quantity_min" in ingredient or "quantity_max" in ingredient:
                error(f"ingredient '{iid}' uses ranged total with parts; this needs an explicit supported rule")

    steps = data.get("steps", [])
    if not isinstance(steps, list):
        error("'steps' must be a list")
        steps = []
    step_ids: set[str] = set()
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            error(f"steps[{index}] must be a mapping")
            continue
        sid = step.get("id")
        if not isinstance(sid, str) or not sid.strip():
            error(f"steps[{index}] must have a non-empty ID")
        elif sid in step_ids:
            error(f"duplicate step ID '{sid}'")
        else:
            step_ids.add(sid)
        if not isinstance(step.get("title"), str) or not step.get("title", "").strip():
            error(f"step '{sid or index}' must have a title")
        if not isinstance(step.get("instructions"), str) or not step.get("instructions", "").strip():
            error(f"step '{sid or index}' must have non-empty instructions")
        refs = step.get("ingredients", [])
        if refs is not None and not isinstance(refs, list):
            error(f"step '{sid or index}' ingredients must be a list")
            continue
        for ref_index, ref in enumerate(refs or []):
            if not isinstance(ref, dict) or not ref.get("ingredient"):
                error(f"step '{sid or index}' ingredient reference {ref_index} must specify ingredient")
                continue
            iid = ref["ingredient"]
            if iid not in ingredient_by_id:
                error(f"step '{sid or index}' references unknown ingredient '{iid}'")
                continue
            if "part" in ref:
                parts = ingredient_by_id[iid].get("parts", []) or []
                part_ids = {str(p.get("id")) for p in parts if isinstance(p, dict) and p.get("id")}
                if ref["part"] not in part_ids:
                    error(f"step '{sid or index}' references unknown part '{ref['part']}' of ingredient '{iid}'")

    yield_data = data.get("yield")
    if not isinstance(yield_data, dict):
        error("'yield' must be a mapping")
    else:
        if not any(key in yield_data for key in ("quantity", "quantity_min", "quantity_max")):
            error("'yield' must specify quantity or a quantity range")
        if "quantity_min" in yield_data and "quantity_max" not in yield_data:
            error("'yield' must include quantity_max when quantity_min is set")
        if "quantity_max" in yield_data and "quantity_min" not in yield_data:
            error("'yield' must include quantity_min when quantity_max is set")
        if "unit" not in yield_data:
            error("'yield' must specify a unit")

    time_data = data.get("time", {})
    if time_data is not None:
        if not isinstance(time_data, dict):
            error("'time' must be a mapping")
        else:
            for key, value in time_data.items():
                if not (key.endswith("_minutes") or key in {
                    "active_minutes_min", "active_minutes_max",
                    "total_minutes_min", "total_minutes_max",
                }):
                    error(f"time field '{key}' must be a supported minute field")
                if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                    error(f"time field '{key}' must be a non-negative integer")
            for prefix in ("active", "total"):
                low, high = f"{prefix}_minutes_min", f"{prefix}_minutes_max"
                if low in time_data and high in time_data and time_data[low] > time_data[high]:
                    error(f"time field '{low}' cannot exceed '{high}'")

    return errors


def main() -> int:
    args = [Path(arg) for arg in sys.argv[1:]]
    if args:
        paths = [p if p.is_absolute() else (Path.cwd() / p).resolve() for p in args]
    else:
        paths = sorted(DEFAULT_RECIPES_DIR.glob("*.yaml")) + sorted(DEFAULT_RECIPES_DIR.glob("*.yml"))

    if not paths:
        print("No recipe YAML files found.")
        return 1

    all_errors: list[str] = []
    for path in paths:
        all_errors.extend(validate_recipe(path))

    if all_errors:
        print("Recipe validation failed:")
        for item in all_errors:
            print(f"  - {item}")
        return 1

    print(f"Validated {len(paths)} recipe file(s): no errors found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
