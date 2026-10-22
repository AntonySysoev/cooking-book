#!/usr/bin/env python3
"""Build the static Cooking Book site from YAML source files."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def load_yaml(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def main() -> int:
    categories_path = ROOT / "data" / "categories.yaml"
    categories = load_yaml(categories_path)
    recipe_paths = sorted((ROOT / "recipes").glob("*.yaml"))
    recipes = [load_yaml(path) for path in recipe_paths]

    if not recipes:
        raise SystemExit("No recipes found in recipes/*.yaml")

    ids = [recipe.get("id") for recipe in recipes]
    if len(ids) != len(set(ids)):
        raise SystemExit("Duplicate recipe IDs found; run scripts/validate_recipes.py")

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)
    (DIST / "data").mkdir()
    shutil.copy2(ROOT / "index.html", DIST / "index.html")
    shutil.copytree(ROOT / "assets", DIST / "assets")
    (DIST / "data" / "categories.json").write_text(
        json.dumps(categories, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (DIST / "data" / "recipes.json").write_text(
        json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (DIST / "manifest.webmanifest").write_text(
        json.dumps({
            "name": "Cooking Book",
            "short_name": "Cooking Book",
            "lang": "ru",
            "start_url": "./",
            "scope": "./",
            "display": "standalone",
            "background_color": "#f7f1e7",
            "theme_color": "#f7f1e7",
            "description": "Личная кулинарная книга"
        }, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (DIST / "sw.js").write_text(
        """const CACHE_NAME = "cooking-book-v2";
const FILES = ["./", "./index.html", "./assets/styles.css", "./assets/app.js",
  "./data/categories.json", "./data/recipes.json", "./manifest.webmanifest"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).catch(() => {
      if (event.request.mode === "navigate") return caches.match("./index.html");
      throw new Error("Offline and resource is not cached");
    });
  }));
});
""",
        encoding="utf-8",
    )
    print(f"Built site with {len(recipes)} recipe(s) into {DIST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
