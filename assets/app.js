(() => {
  "use strict";
  const app = document.getElementById("app");
  const printMenuWrap = document.getElementById("print-menu-wrap");
  const printButton = document.getElementById("print-button");
  const printMenu = document.getElementById("print-menu");
  const printMenuPrint = document.getElementById("print-menu-print");
  const printMenuLink = document.getElementById("print-menu-link");
  const topButton = document.getElementById("top-button");
  const STORAGE_KEY = "cooking-book-user-state-v1";
  const COOKING_SESSION_KEY = "cooking-book-active-cooking-recipe";
  const state = { recipes: [], categories: [], activeCategory: "all", query: "", checkedIngredients: new Set(), wakeLock: null, wakeEnabled: false, currentRecipe: null, multiplier: 1, recentlyViewed: {}, recipeProgress: {}, fontScale: 100, readingMode: false, currentStepIndex: 0, cookingStageIndex: 0, cookingMode: false };
  function loadUserState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") {
        state.recentlyViewed = saved.recentlyViewed && typeof saved.recentlyViewed === "object" ? saved.recentlyViewed : {};
        state.recipeProgress = saved.recipeProgress && typeof saved.recipeProgress === "object" ? saved.recipeProgress : {};
        state.readingMode = typeof saved.readingMode === "boolean" ? saved.readingMode : Number(saved.fontScale) === 150;
        state.fontScale = state.readingMode ? 150 : 100;
      }
    } catch (_) {}
  }
  function saveUserState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ recentlyViewed: state.recentlyViewed, recipeProgress: state.recipeProgress, fontScale: state.fontScale, readingMode: state.readingMode })); } catch (_) {}
  }
  function recipeScaleSignature(recipe) {
    const ingredients = (recipe.ingredients || []).map(item => ({
      id: item.id,
      quantity: item.quantity,
      quantity_min: item.quantity_min,
      quantity_max: item.quantity_max,
      unit: item.unit,
      parts: (item.parts || []).map(part => ({ id: part.id, quantity: part.quantity, group: part.group }))
    }));
    const y = recipe.yield || {};
    return JSON.stringify({ ingredients, yield: { quantity: y.quantity, quantity_min: y.quantity_min, quantity_max: y.quantity_max, unit: y.unit } });
  }
  function saveCurrentRecipeState() {
    if (!state.currentRecipe) return;
    state.recipeProgress[state.currentRecipe.id] = { ...state.recipeProgress[state.currentRecipe.id], multiplier: state.multiplier, scaleSignature: recipeScaleSignature(state.currentRecipe), checkedIngredients: [...state.checkedIngredients], currentStepIndex: state.currentStepIndex, cookingStageIndex: state.cookingStageIndex, cookingMode: state.cookingMode, hasStepPosition: state.recipeProgress[state.currentRecipe.id]?.hasStepPosition || false };
    saveUserState();
  }
  loadUserState();
  function applyFontScale() {
    const scale = state.fontScale / 100;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty("--text-scale", String(scale));
    [10, 11, 12, 13, 14, 16, 18, 20, 21, 23, 26, 34, 48, 52].forEach(size => {
      rootStyle.setProperty("--font-size-" + size, (Math.round(size * scale * 100) / 100) + "px");
    });
    const width = document.documentElement.clientWidth || 800;
    rootStyle.setProperty("--font-size-heading", (Math.round(Math.max(34, Math.min(width * 0.05, 52)) * scale * 100) / 100) + "px");
    rootStyle.setProperty("--font-size-recipe-heading", (Math.round(Math.max(34, Math.min(width * 0.05, 48)) * scale * 100) / 100) + "px");
    document.documentElement.classList.toggle("high-contrast", state.readingMode);
    const fontSizeButton = document.getElementById("font-size-toggle");
    if (fontSizeButton) {
      fontSizeButton.setAttribute("aria-pressed", String(state.readingMode));
      fontSizeButton.setAttribute("aria-label", state.readingMode ? "Вернуть обычное оформление и размер текста 100%" : "Включить чёрно-белый режим чтения с размером текста 150%");
      fontSizeButton.title = state.readingMode ? "Обычный режим · 100%" : "Крупный текст и чёрно-белое оформление · 150%";
      const value = document.getElementById("font-size-value");
      if (value) value.textContent = state.readingMode ? "150%" : "100%";
    }
  }
  applyFontScale();
  const cookingModeHeaderButton = document.getElementById("cooking-mode-toggle");
  if (cookingModeHeaderButton) cookingModeHeaderButton.addEventListener("click", () => {
    if (!state.currentRecipe) return;
    state.cookingMode = !state.cookingMode;
    try { if (state.cookingMode) sessionStorage.setItem(COOKING_SESSION_KEY, state.currentRecipe.id); else sessionStorage.removeItem(COOKING_SESSION_KEY); } catch (_) {}
    if (state.cookingMode) {
      state.cookingStageIndex = 0;
      const wakeToggle = document.getElementById("wake-toggle");
      if (wakeToggle && !state.wakeEnabled) wakeToggle.click();
    } else if (state.wakeEnabled) {
      const wakeToggle = document.getElementById("wake-toggle");
      if (wakeToggle) wakeToggle.click();
    }
    saveCurrentRecipeState();
    applyCookingMode();
    updateCookingNavigation(state.currentRecipe);
    if (state.cookingMode) scrollToCurrentStage(false, state.currentRecipe);
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const numberText = value => {
    if (!Number.isFinite(Number(value))) return String(value ?? "");
    return String(Math.round(Number(value) * 10) / 10);
  };
  const unitText = unit => unit || "";
  function formatAmount(value, unit) {
    if (value === undefined || value === null) return "";
    if (typeof value === "object" && "min" in value && "max" in value) {
      return `${numberText(value.min)}–${numberText(value.max)} ${unitText(unit)}`.trim();
    }
    return `${numberText(value)} ${unitText(unit)}`.trim();
  }
  function scaleQuantity(item, factor) {
    if ("quantity" in item) return Math.round(item.quantity * factor * 10) / 10;
    if ("quantity_min" in item && "quantity_max" in item) {
      return { min: Math.round(item.quantity_min * factor * 10) / 10, max: Math.round(item.quantity_max * factor * 10) / 10 };
    }
    return null;
  }
  function pluralRu(n, one, few, many) {
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 14) return many;
    const last = n % 10;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }
  function formatMinutes(minutes) {
    if (!Number.isFinite(minutes)) return "";
    const n = Math.round(minutes);
    if (n < 60) return `${n} ${pluralRu(n, "минута", "минуты", "минут")}`;
    if (n > 180) {
      const hours = Math.ceil(n / 60);
      return `${hours} ${pluralRu(hours, "час", "часа", "часов")}`;
    }
    const hours = Math.floor(n / 60), mins = n % 60;
    const hourText = `${hours} ${pluralRu(hours, "час", "часа", "часов")}`;
    return mins ? `${hourText} ${mins} ${pluralRu(mins, "минута", "минуты", "минут")}` : hourText;
  }
  function timeLabel(recipe) {
    const t = recipe.time || {};
    const min = t.total_minutes_min ?? t.total_minutes;
    const max = t.total_minutes_max;
    if (min == null) return "";
    return max != null && max !== min ? `${formatMinutes(min)} – ${formatMinutes(max)}` : formatMinutes(min);
  }
  function yieldLabel(recipe) {
    const y = recipe.yield || {};
    const amount = y.quantity != null ? numberText(y.quantity)
      : y.quantity_min != null && y.quantity_max != null ? `${numberText(y.quantity_min)}–${numberText(y.quantity_max)}`
      : "";
    return [amount, y.unit].filter(Boolean).join(" ");
  }
  function contentText(item) {
    if (typeof item === "string" || typeof item === "number") return String(item);
    if (!item || typeof item !== "object") return "";
    for (const key of ["text", "description", "content", "title", "tip", "instruction"]) {
      if (typeof item[key] === "string" && item[key].trim()) return item[key];
    }
    return Object.values(item).filter(value => typeof value === "string" || typeof value === "number").join(" — ");
  }
  function interpolateRecipeText(text, recipe, factor = 1) {
    if (typeof text !== "string") return "";
    const quantity = recipe.yield?.quantity;
    return text.replace(/\{\{yield\.quantity\}\}/g, () => {
      if (!Number.isFinite(Number(quantity))) return "";
      return numberText(Number(quantity) * factor);
    });
  }
  function yieldHint(recipe, factor = 1) {
    const y = recipe.yield || {};
    const amount = y.quantity != null ? numberText(y.quantity * factor)
      : y.quantity_min != null && y.quantity_max != null
        ? `${numberText(y.quantity_min * factor)}–${numberText(y.quantity_max * factor)}`
        : "";
    const label = [amount, y.unit].filter(Boolean).join(" ");
    return label ? `Примерно ${label}` : "";
  }
  const multiplierText = value => Number(value).toFixed(2);
  const MIN_MULTIPLIER = 0.1;
  const MAX_MULTIPLIER = 5;
  function findCategory(id) {
    for (const category of state.categories) {
      if (category.id === id) return { item: category, parent: category };
      const child = (category.subcategories || []).find(item => item.id === id);
      if (child) return { item: child, parent: category };
    }
    return null;
  }
  function categoryName(id) {
    return findCategory(id)?.item.title || id || "Без категории";
  }
  function categoryClass(id) {
    const found = findCategory(id);
    return found ? `category-${found.parent.id}` : "category-neutral";
  }
  const categoryIconShapes = {
    "cake-slice": '<path d="M4 14h16l-2 7H6l-2-7Z"/><path d="M4 14 12 4l8 10M12 4v4M9 10h.01M15 10h.01"/>',
    "ice-cream-cone": '<path d="m7 12 5 10 5-10"/><path d="M17 12a5 5 0 1 0-10 0Z"/><path d="M9 5a3 3 0 0 1 6 0"/>',
    cookie: '<circle cx="12" cy="12" r="9"/><path d="M15 3.5a3 3 0 0 0 5 3.5 9 9 0 0 1-11 14"/><path d="M8 10h.01M13 15h.01M9 16h.01"/>',
    candy: '<path d="m7 9-4-3v12l4-3M17 9l4-3v12l-4-3"/><rect x="7" y="7" width="10" height="10" rx="3"/><path d="m10 10 4 4"/>',
    bread: '<path d="M4 11a8 8 0 0 1 16 0v8H4v-8Z"/><path d="M8 10v2M12 8v3M16 10v2"/>',
    croissant: '<path d="M4 15c2-7 14-10 16-3-2 6-11 9-16 3Z"/><path d="M4 15c4-1 5-5 5-7M20 12c-4-1-6 2-7 7"/>',
    layers: '<path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    pie: '<path d="M4 20a9 9 0 1 1 16-6H4Z"/><path d="m12 3 2 11 6 0M4 14l8 0"/>',
    pizza: '<path d="m3 5 18-2-8 18L3 5Z"/><path d="m3 5 10 16M9 8h.01M14 7h.01M12 13h.01"/>',
    beef: '<path d="M5 8c-2-2-1-5 2-5 2 0 3 2 5 2s3-2 5-2c3 0 4 3 2 5 3 2 3 7 0 10-4 4-12 3-15-1-2-3-1-7 1-9Z"/><path d="M9 12c1-2 5-2 6 0 1 2-1 4-3 4s-4-2-3-4Z"/>',
    drumstick: '<path d="M15 5a5 5 0 0 0-7 7l-4 4a2 2 0 0 0 3 3l4-4a5 5 0 0 0 7-7Z"/><path d="m5 16-2-2M8 19l-2 2"/>',
    fish: '<path d="M3 12s4-7 11-7c3 0 5 2 7 7-2 5-4 7-7 7-7 0-11-7-11-7Z"/><path d="m3 12-2-4v8l2-4ZM14 9h.01"/>',
    utensils: '<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M17 3v18M17 3c-3 3-3 7 0 9"/>',
    sandwich: '<path d="m3 10 9-6 9 6v2H3v-2ZM4 15h16l-2 5H6l-2-5Z"/><path d="M4 12v3M20 12v3"/>',
    bowl: '<path d="M3 12h18a9 9 0 0 1-18 0Z"/><path d="M6 7c1-2 2-2 3 0M11 7c1-2 2-2 3 0M16 7c1-2 2-2 3 0"/>',
    salad: '<path d="M3 12a9 9 0 0 0 18 0H3Z"/><path d="M7 10c0-3 3-5 5-5M12 10c1-4 4-5 6-4M10 12l2-4"/>',
    soup: '<path d="M3 12h18a9 9 0 0 1-18 0Z"/><path d="M5 20h14M8 7c-1-1 1-2 0-3M13 7c-1-1 1-2 0-3M18 7c-1-1 1-2 0-3"/>',
    coffee: '<path d="M4 8h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z"/><path d="M17 10h2a2 2 0 1 1 0 4h-2M8 3v2M12 3v2"/>',
    "cup-soda": '<path d="M5 4h14l-1 17H6L5 4Z"/><path d="M8 4 7 2M12 4l1-2M16 4l2-2M8 10h8"/>',
    "glass-water": '<path d="M5 3h14l-2 18H7L5 3Z"/><path d="M7 13c3-2 7 2 10 0"/>',
    martini: '<path d="M3 4h18l-9 9-9-9ZM12 13v8M8 21h8"/>',
    "cooking-pot": '<path d="M4 10h16v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-8ZM2 10h20M9 6h6M12 6V3"/>',
    carrot: '<path d="m5 7 12 12-5 2L3 12l2-5Z"/><path d="M5 7 3 3M7 6l1-4M9 8l4-3"/>',
    wheat: '<path d="M12 22V3M12 8c-4 0-6-2-6-5 4 0 6 2 6 5ZM12 13c4 0 6-2 6-5-4 0-6 2-6 5ZM12 18c-4 0-6-2-6-5 4 0 6 2 6 5Z"/>',
    bottle: '<path d="M9 3h6v4l2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-2V3Z"/><path d="M9 7h6M7 13h10"/>',
    droplet: '<path d="M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13Z"/>',
    jar: '<path d="M6 7h12l1 14H5L6 7ZM8 4h8v3H8z"/><path d="M8 12h8"/>',
    nut: '<path d="M12 3c5 0 8 5 8 10s-3 8-8 8-8-3-8-8 3-10 8-10Z"/><path d="M12 3c-2 4-2 12 0 18M8 8c2 1 6 1 8 0"/>',
    pasta: '<path d="M4 5c4-3 5 5 9 2s5-2 7 0M4 11c4-3 5 5 9 2s5-2 7 0M4 17c4-3 5 5 9 2s5-2 7 0"/>',
    dumpling: '<path d="M4 13a8 8 0 0 1 16 0c0 4-4 7-8 7s-8-3-8-7Z"/><path d="M4 13c3 2 5 2 8 0s5-2 8 0M8 8l1 2M12 7v2M16 8l-1 2"/>'
  };
  function categoryIcon(id) {
    const found = findCategory(id);
    const icon = found?.item.icon || found?.parent.icon || "utensils";
    const shape = categoryIconShapes[icon] || categoryIconShapes.utensils;
    return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
  }
  function recipeCategories(recipe) {
    return [...new Set([recipe.category, recipe.subcategory, ...(Array.isArray(recipe.also_in) ? recipe.also_in : [])].filter(Boolean))];
  }
  function categoryLabels(recipe) {
    return recipeCategories(recipe).map(id => `${categoryIcon(id)} <span>${escapeHtml(categoryName(id))}</span>`);
  }
  function categoryBreadcrumb(recipe, subcategory) {
    const links = recipeCategories(recipe).map(id =>
      `<a class="category-breadcrumb-link ${categoryClass(id)}" href="?category=${encodeURIComponent(id)}">${categoryIcon(id)} ${escapeHtml(categoryName(id))}</a>`
    );
    return links.join(' <span class="breadcrumb-separator">·</span> ');
  }
  function allSearchText(recipe) {
    return [recipe.title, recipe.description, ...(recipe.tags || []), ...recipeCategories(recipe).map(categoryName), recipe.subcategory,
      ...(recipe.ingredients || []).map(i => i.name)].join(" ").toLocaleLowerCase("ru");
  }
  function renderHome() {
    state.cookingMode = false;
    try { sessionStorage.removeItem(COOKING_SESSION_KEY); } catch (_) {}
    document.body.classList.remove("cooking-mode");
    document.title = "Cooking Book — кулинарная книга";
    printMenuWrap.hidden = false;
    closePrintMenu();
    $("#wake-toggle").hidden = true;
    $("#print-menu-print").hidden = true;
    $("#print-menu-link").hidden = true;
    $("#recipe-menu-separator").hidden = true;
    const cookingToggle = document.getElementById("cooking-mode-toggle");
    if (cookingToggle) cookingToggle.hidden = true;
    const selectedCategory = findCategory(state.activeCategory);
    const selectedParentId = selectedCategory?.parent.id;
    const categories = state.categories.map(c => `<button class="pill ${categoryClass(c.id)} ${state.activeCategory === c.id || selectedParentId === c.id ? "active" : ""}" data-category="${escapeHtml(c.id)}" type="button"><span class="category-icon" aria-hidden="true">${categoryIcon(c.id)}</span> ${escapeHtml(c.title)}</button>`).join("");
    const activeParent = selectedCategory?.parent;
    const subcategories = activeParent?.subcategories?.length
      ? `<div class="category-pills subcategory-pills" aria-label="Подкатегории ${escapeHtml(activeParent.title)}">${activeParent.subcategories.map(c => `<button class="pill ${categoryClass(c.id)} ${state.activeCategory === c.id ? "active" : ""}" data-category="${escapeHtml(c.id)}" type="button"><span class="category-icon" aria-hidden="true">${categoryIcon(c.id)}</span> ${escapeHtml(c.title)}</button>`).join("")}</div>`
      : "";
    const filtered = state.recipes.filter(r => (state.activeCategory === "all" || recipeCategories(r).includes(state.activeCategory)) &&
      allSearchText(r).includes(state.query.toLocaleLowerCase("ru")))
      .map((recipe, index) => ({ recipe, index, viewedAt: Number(state.recentlyViewed[recipe.id]) || 0 }))
      .sort((a, b) => b.viewedAt - a.viewedAt || a.index - b.index)
      .map(item => item.recipe);
    app.innerHTML = `
      <div class="toolbar">
        <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" class="search-input" type="search" placeholder="Найти рецепт или ингредиент…" value="${escapeHtml(state.query)}" autocomplete="off" aria-label="Поиск рецептов"></label>
      </div>
      <div class="category-pills"><button class="pill ${state.activeCategory === "all" ? "active" : ""}" data-category="all" type="button">Все</button>${categories}</div>${subcategories}
      <div class="section-heading"><h2>Рецепты</h2><span class="result-count">${filtered.length} ${pluralRu(filtered.length, "рецепт", "рецепта", "рецептов")}</span></div>
      ${filtered.length ? `<div class="recipe-grid">${filtered.map(r => `
        <a class="recipe-card ${categoryClass(r.category)}" href="?recipe=${encodeURIComponent(r.id)}">
          <span class="card-category">${categoryLabels(r).join(" · ")}</span>
          <h3>${escapeHtml(r.title)}</h3>
          <p class="card-description">${escapeHtml(r.description || "")}</p>
          <div class="card-meta"><span>◷ ${escapeHtml(timeLabel(r) || "Время не указано")}</span><span>♧ ${escapeHtml(yieldLabel(r) || "Выход не указан")}</span></div>
        </a>`).join("")}</div>` : `<div class="empty-state"><h3>Ничего не найдено</h3><p>Попробуй изменить запрос или выбрать другую категорию.</p></div>`}
    `;
    $("#search").addEventListener("input", e => { state.query = e.target.value; const pos = e.target.selectionStart; renderHome(); const input = $("#search"); input.focus(); input.setSelectionRange(pos, pos); });
    app.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => { state.activeCategory = button.dataset.category; renderHome(); }));
  }
  function ingredientById(recipe, id) { return (recipe.ingredients || []).find(item => item.id === id); }
  function displayRef(ref, recipe, factor) {
    const ingredient = ingredientById(recipe, ref.ingredient);
    if (!ingredient) return "";
    const part = ref.part && (ingredient.parts || []).find(p => p.id === ref.part);
    const amount = part ? (part.quantity == null ? null : Math.round(part.quantity * factor * 10) / 10) : scaleQuantity(ingredient, factor);
    const name = part?.name ? `${ingredient.name} — ${part.name.toLocaleLowerCase("ru")}` : ingredient.name;
    return `${name}${amount == null ? "" : " " + formatAmount(amount, ingredient.unit)}`;
  }
  function ingredientRows(recipe, factor, targetGroupId = null, onlyTarget = false) {
    const groups = (recipe.ingredient_groups || []).filter(group => !targetGroupId || group.id === targetGroupId);
    const rendered = new Set();
    const groupBlocks = [];
    for (const group of groups) {
      const rows = [];
      for (const item of recipe.ingredients || []) {
        if (item.parts_mode === "components") {
          const componentGroups = (item.parts || []).map(part => part.group).filter(Boolean);
          if ((item.group === group.id || componentGroups.includes(group.id)) && !rendered.has(item.id)) {
            rows.push(renderIngredientRow(item, null, factor, item.id));
            rendered.add(item.id);
          }
          continue;
        }
        const parts = (item.parts || []).filter(part => part.group === group.id);
        if (parts.length) {
          for (const part of parts) {
            const key = `${item.id}:${part.id}`;
            rows.push(renderIngredientRow(item, part, factor, key));
          }
          rendered.add(item.id);
        } else if (!item.parts?.length && item.group === group.id && !rendered.has(item.id)) {
          rows.push(renderIngredientRow(item, null, factor, item.id));
          rendered.add(item.id);
        }
      }
      if (rows.length) groupBlocks.push(`<section class="ingredient-group"><h3>${escapeHtml(group.title)}</h3><ul class="ingredient-list">${rows.join("")}</ul></section>`);
    }
    const other = [];
    for (const item of recipe.ingredients || []) {
      if (rendered.has(item.id)) continue;
      if (onlyTarget) continue;
      if (item.parts_mode === "components" || !item.parts?.length) {
        other.push(renderIngredientRow(item, null, factor, item.id));
      } else {
        for (const part of item.parts) other.push(renderIngredientRow(item, part, factor, `${item.id}:${part.id}`));
      }
    }
    if (other.length) groupBlocks.push(`<section class="ingredient-group"><h3>Дополнительно</h3><ul class="ingredient-list">${other.join("")}</ul></section>`);
    return groupBlocks.join("");
  }
  function renderIngredientRow(item, part, factor, key) {
    const amount = part ? (part.quantity == null ? null : Math.round(part.quantity * factor * 10) / 10) : scaleQuantity(item, factor);
    const label = part ? `${item.name} — ${part.name.toLocaleLowerCase("ru")}` : item.name;
    const note = item.note || (item.optional ? "По желанию" : "");
    const checked = state.checkedIngredients.has(key);
    return `<li class="ingredient-row ${checked ? "checked" : ""}" role="checkbox" aria-checked="${checked}" tabindex="0" data-ingredient-key="${escapeHtml(key)}">
      <span class="check-dot" aria-hidden="true">${checked ? "✓" : ""}</span><span class="ingredient-copy"><span class="ingredient-name">${escapeHtml(label)}${item.optional ? " (по желанию)" : ""}</span>${note ? `<span class="ingredient-note">${escapeHtml(note)}</span>` : ""}</span>
      <span class="ingredient-amount">${amount == null ? "" : escapeHtml(formatAmount(amount, item.unit))}</span>
    </li>`;
  }
  function renderSteps(recipe, factor) {
    return (recipe.steps || []).map((step, index) => {
      const chips = (step.ingredients || []).map(ref => displayRef(ref, recipe, factor)).filter(Boolean);
      return `<li class="step" data-step-id="${escapeHtml(step.id)}">
        <span class="step-number">${index + 1}</span><div><div class="step-title">${escapeHtml(step.title || `Шаг ${index + 1}`)}</div>
        ${chips.length ? `<div class="step-ingredients">${chips.map(chip => `<span class="step-ingredient-chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
        <p class="step-instructions">${escapeHtml(interpolateRecipeText(step.instructions || "", recipe, factor))}</p></div>
      </li>`;
    }).join("");
  }
  function renderRecipe(recipe) {
    document.body.className = document.body.className.replace(/\bcategory-[\w-]+\b/g, "").trim();
    document.body.classList.add(categoryClass(recipe.category));
    printMenuWrap.hidden = false;
    $("#wake-toggle").hidden = false;
    $("#print-menu-print").hidden = false;
    $("#print-menu-link").hidden = false;
    $("#recipe-menu-separator").hidden = false;
    const cookingToggle = document.getElementById("cooking-mode-toggle");
    if (cookingToggle) cookingToggle.hidden = false;
    document.title = `${recipe.title} — Cooking Book`;
    state.currentRecipe = recipe;
    state.recentlyViewed[recipe.id] = Date.now();
    saveUserState();
    const savedProgress = state.recipeProgress[recipe.id] || {};
    let resumeCookingMode = false;
    try { resumeCookingMode = sessionStorage.getItem(COOKING_SESSION_KEY) === recipe.id; } catch (_) {}
    state.cookingMode = resumeCookingMode;
    const currentScaleSignature = recipeScaleSignature(recipe);
    const scaleFormulaChanged = savedProgress.scaleSignature !== currentScaleSignature;
    state.multiplier = scaleFormulaChanged || savedProgress.multiplier == null || !Number.isFinite(Number(savedProgress.multiplier))
      ? 1 : Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Math.round(Number(savedProgress.multiplier) * 100) / 100));
    state.checkedIngredients = new Set(Array.isArray(savedProgress.checkedIngredients) ? savedProgress.checkedIngredients : []);
    state.currentStepIndex = Math.max(0, Math.min(Math.max(0, (recipe.steps || []).length - 1), Number.isInteger(savedProgress.currentStepIndex) ? savedProgress.currentStepIndex : 0));
    state.cookingStageIndex = Number.isInteger(savedProgress.cookingStageIndex) ? savedProgress.cookingStageIndex : 0;
    if (!Number.isInteger(savedProgress.cookingStageIndex)) {
      const savedStepStage = cookingStages(recipe).findIndex(stage => stage.type === "step" && stage.stepIndex === state.currentStepIndex);
      if (savedStepStage >= 0) state.cookingStageIndex = savedStepStage;
    }
    if (scaleFormulaChanged) saveCurrentRecipeState();
    const subcategory = findCategory(recipe.subcategory)?.item.title;
    app.innerHTML = `
      <section class="recipe-head">
        <div class="eyebrow">${categoryBreadcrumb(recipe, subcategory)}</div>
        <h1>${escapeHtml(recipe.title)}</h1>
        ${recipe.description ? `<p class="recipe-description">${escapeHtml(recipe.description)}</p>` : ""}
        <div class="recipe-meta">${timeLabel(recipe) ? `<span class="meta-chip">◷ ${escapeHtml(timeLabel(recipe))}</span>` : ""}${yieldHint(recipe) ? `<span class="meta-chip">♧ ${escapeHtml(yieldHint(recipe))}</span>` : ""}${(recipe.tags || []).slice(0,4).map(t => `<span class="meta-chip">${escapeHtml(t)}</span>`).join("")}</div>
      </section>
      <div class="recipe-layout">
        <div>
          <section class="panel">
            <h2 class="panel-title">Ингредиенты</h2>
            <div class="scale-box"><label for="multiplier-input">Множитель</label><div class="multiplier-control"><input id="multiplier-input" class="scale-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${multiplierText(state.multiplier)}" aria-label="Множитель количества ингредиентов от 0.10 до 5.00" title="От 0.10 до 5.00"><div class="multiplier-arrows"><button class="multiplier-arrow" id="multiplier-up" type="button" aria-label="Увеличить множитель на четверть">▲</button><button class="multiplier-arrow" id="multiplier-down" type="button" aria-label="Уменьшить множитель на четверть">▼</button></div></div><small class="scale-hint" id="multiplier-yield-hint">${escapeHtml(yieldHint(recipe, state.multiplier))}</small></div>
            <div id="ingredient-groups">${ingredientRows(recipe, state.multiplier)}</div>
            <div style="margin-top:14px"><button id="reset-checks" class="reset-button" type="button">Сбросить отметки</button></div>
          </section>
          ${recipe.equipment?.length ? `<section class="panel"><h2 class="panel-title">Оборудование</h2><ul class="tips-list">${recipe.equipment.map(item => `<li>${escapeHtml(contentText(item))}</li>`).join("")}</ul></section>` : ""}
          ${recipe.tips?.length ? `<section class="panel"><h2 class="panel-title">Советы</h2><ul class="tips-list">${recipe.tips.map(item => `<li>${escapeHtml(contentText(item))}</li>`).join("")}</ul></section>` : ""}
          ${recipe.storage?.length ? `<section class="panel"><h2 class="panel-title">Хранение</h2><ul class="storage-list">${recipe.storage.map(item => `<li>${escapeHtml(contentText(item))}</li>`).join("")}</ul></section>` : ""}
        </div>
        <section class="panel">
          <div class="panel-head-row cooking-panel-heading"><h2 class="panel-title" style="margin:0">Приготовление</h2></div>
          <div id="cooking-ingredient-screen" class="cooking-ingredient-screen" hidden></div>
          <ol class="step-list">${renderSteps(recipe, state.multiplier)}</ol>
          <div id="cooking-navigation" class="cooking-navigation" ${state.cookingMode ? "" : "hidden"} aria-label="Навигация по шагам"><button id="cooking-prev" class="cooking-nav-button" type="button" aria-label="Назад" title="Назад"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></button><span id="cooking-step-counter" class="cooking-step-counter"></span><button id="cooking-next" class="cooking-nav-button" type="button" aria-label="Вперёд" title="Вперёд"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button></div>
        </section>
      </div>
      <section class="reset-all-wrap" aria-label="Сброс прогресса рецепта">
        <button id="reset-recipe-progress" class="reset-button" type="button">Сбросить отметки ингредиентов</button>
        <p>Сбросит отметки ингредиентов и множитель только для этого рецепта.</p>
      </section>
    `;
    const wakeToggle = $("#wake-toggle");
    const updateWakeButton = () => {
      wakeToggle.setAttribute("aria-pressed", String(state.wakeEnabled));
      wakeToggle.classList.toggle("is-active", state.wakeEnabled);
      wakeToggle.title = state.wakeEnabled ? "Экран удерживается включённым — нажми, чтобы выключить" : "Не выключать экран во время готовки";
      wakeToggle.setAttribute("aria-label", wakeToggle.title);
      const status = document.getElementById("wake-status");
      if (status) status.textContent = state.wakeEnabled ? "Вкл." : "Выкл.";
    };
    updateWakeButton();
    applyCookingMode();
    updateCookingNavigation(recipe);
    wakeToggle.addEventListener("click", async () => {
      if (state.wakeEnabled) {
        state.wakeEnabled = false;
        try { if (state.wakeLock) await state.wakeLock.release(); } catch (_) {}
        state.wakeLock = null;
        updateWakeButton();
        return;
      }
      if (!("wakeLock" in navigator)) {
        wakeToggle.title = "Этот браузер не поддерживает удержание экрана";
        wakeToggle.setAttribute("aria-label", wakeToggle.title);
        return;
      }
      try {
        state.wakeLock = await navigator.wakeLock.request("screen");
        state.wakeEnabled = true;
        updateWakeButton();
        state.wakeLock.addEventListener("release", () => {
          state.wakeLock = null;
          if (state.wakeEnabled && document.visibilityState === "visible") {
            state.wakeEnabled = false;
            updateWakeButton();
          }
        });
      } catch (_) {
        state.wakeEnabled = false;
        updateWakeButton();
        wakeToggle.title = "Не удалось удержать экран — проверь разрешения браузера";
        wakeToggle.setAttribute("aria-label", wakeToggle.title);
      }
    });
    const multiplierInput = $("#multiplier-input");
    const parseMultiplier = value => {
      const normalized = String(value).trim().replace(",", ".");
      if (!normalized || /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) === false) return null;
      const amount = Number(normalized);
      return Number.isFinite(amount) ? amount : null;
    };
    const updateMultiplier = () => {
      const factor = state.multiplier;
      saveCurrentRecipeState();
      $("#multiplier-yield-hint").textContent = yieldHint(recipe, factor);
      $("#ingredient-groups").innerHTML = ingredientRows(recipe, factor);
      bindIngredientRows();
      $(".step-list").innerHTML = renderSteps(recipe, factor);
      
      updateCookingNavigation(recipe);
    };
    multiplierInput.addEventListener("input", e => {
      const amount = parseMultiplier(e.target.value);
      if (amount == null || amount < MIN_MULTIPLIER || amount > MAX_MULTIPLIER) return;
      state.multiplier = Math.round(amount * 100) / 100;
      saveCurrentRecipeState();
      updateMultiplier();
    });
    multiplierInput.addEventListener("change", e => {
      const amount = parseMultiplier(e.target.value);
      state.multiplier = amount == null ? 1 : Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Math.round(amount * 100) / 100));
      e.target.value = multiplierText(state.multiplier);
      saveCurrentRecipeState();
      updateMultiplier();
    });
    const stepMultiplier = direction => {
      const parsed = parseMultiplier(multiplierInput.value);
      const current = parsed == null ? state.multiplier : Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, parsed));
      const quarterPosition = current * 4;
      const onQuarter = Math.abs(quarterPosition - Math.round(quarterPosition)) < 1e-8;
      const next = onQuarter
        ? current + direction * 0.25
        : (direction > 0 ? Math.ceil(quarterPosition - 1e-8) : Math.floor(quarterPosition + 1e-8)) / 4;
      state.multiplier = Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Math.round(next * 100) / 100));
      multiplierInput.value = multiplierText(state.multiplier);
      saveCurrentRecipeState();
      updateMultiplier();
    };
    $("#cooking-prev").addEventListener("click", () => moveCookingStage(-1, recipe));
    $("#cooking-next").addEventListener("click", () => moveCookingStage(1, recipe));
    $("#multiplier-up").addEventListener("click", () => stepMultiplier(1));
    $("#multiplier-down").addEventListener("click", () => stepMultiplier(-1));
    $("#reset-checks").addEventListener("click", () => { state.checkedIngredients.clear(); saveCurrentRecipeState(); $("#ingredient-groups").innerHTML = ingredientRows(recipe, state.multiplier); bindIngredientRows(); updateCookingNavigation(recipe); });
    $("#reset-recipe-progress").addEventListener("click", () => {
      if (!window.confirm("Сбросить отметки ингредиентов и множитель только для этого рецепта?")) return;
      state.checkedIngredients.clear();
      state.multiplier = 1;
      multiplierInput.value = multiplierText(state.multiplier);
      saveCurrentRecipeState();
      updateMultiplier();
    });
    bindIngredientRows();
    
    window.setTimeout(() => {
      if (state.recipeProgress[recipe.id]?.hasStepPosition) scrollToCurrentStage(true, recipe);
      else if (state.cookingMode) scrollToCurrentStage(false, recipe);
    }, 250);
    let scrollSavePending = false;
    window.addEventListener("scroll", () => {
      if (scrollSavePending || state.currentRecipe?.id !== recipe.id) return;
      scrollSavePending = true;
      window.setTimeout(() => {
        scrollSavePending = false;
        const allSteps = [...app.querySelectorAll("[data-step-id]")];
        const steps = allSteps.filter(step => step.getClientRects().length > 0);
        if (!steps.length) return;
        let closestIndex = 0, closestDistance = Infinity;
        steps.forEach(step => {
          const index = allSteps.indexOf(step);
          const distance = Math.abs(step.getBoundingClientRect().top - 90);
          if (distance < closestDistance) { closestDistance = distance; closestIndex = index; }
        });
        if (closestIndex !== state.currentStepIndex) {
          state.currentStepIndex = closestIndex;
          const progress = state.recipeProgress[recipe.id] || {};
          progress.hasStepPosition = true;
          state.recipeProgress[recipe.id] = progress;
          saveCurrentRecipeState();
          updateCookingNavigation(recipe);
        }
      }, 180);
    }, { passive: true });
  }
  function cookingIngredientGroups(recipe) {
    const groups = recipe.ingredient_groups || [];
    const relevant = groups.filter(group => {
      const preview = ingredientRows(recipe, 1, group.id, true);
      return preview.trim().length > 0;
    });
    const assignedIds = new Set(groups.map(group => group.id));
    const hasUngrouped = (recipe.ingredients || []).some(item => {
      if (item.parts_mode === "components") return !(item.parts || []).some(part => assignedIds.has(part.group)) && !assignedIds.has(item.group);
      return !item.group && !(item.parts || []).some(part => assignedIds.has(part.group));
    });
    if (hasUngrouped) relevant.push({ id: "__other__", title: "Дополнительные ингредиенты" });
    return relevant;
  }
  function cookingStages(recipe) {
    return [
      ...cookingIngredientGroups(recipe).map(group => ({ type: "ingredients", id: group.id, title: group.title })),
      ...(recipe.steps || []).map((step, index) => ({ type: "step", id: step.id, title: step.title || `Шаг ${index + 1}`, stepIndex: index }))
    ];
  }
  function renderCookingIngredientScreen(recipe, group, factor) {
    const html = group.id === "__other__"
      ? ingredientRows(recipe, factor)
      : ingredientRows(recipe, factor, group.id, true);
    return `<h2 class="cooking-ingredient-title">${escapeHtml(group.title)}</h2><div class="cooking-ingredient-list">${html || "<p>Нет отдельных ингредиентов для этого этапа.</p>"}</div>`;
  }
  function applyCookingMode() {
    document.body.classList.toggle("cooking-mode", state.cookingMode);
    const brand = document.querySelector(".brand");
    const brandTitle = brand?.querySelector("strong");
    const brandSubtitle = brand?.querySelector("small");
    if (brandTitle) brandTitle.textContent = state.cookingMode && state.currentRecipe ? state.currentRecipe.title : "Cooking Book";
    if (brandSubtitle) brandSubtitle.hidden = state.cookingMode;
    if (brand) brand.setAttribute("aria-label", state.cookingMode && state.currentRecipe ? state.currentRecipe.title : "Cooking Book — главная");
    const toggle = document.getElementById("cooking-mode-toggle");
    const navigation = $("#cooking-navigation");
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(state.cookingMode));
      toggle.setAttribute("aria-label", state.cookingMode ? "Выйти из режима готовки" : "Включить режим готовки");
      toggle.title = state.cookingMode ? "Выйти из режима готовки" : "Режим готовки";
      toggle.classList.toggle("is-active", state.cookingMode);
    }
    if (navigation) navigation.hidden = !state.cookingMode;
    const recipe = state.currentRecipe;
    if (!recipe) return;
    const stages = cookingStages(recipe);
    state.cookingStageIndex = Math.max(0, Math.min(Math.max(0, stages.length - 1), state.cookingStageIndex));
    const current = stages[state.cookingStageIndex];
    const ingredientScreen = $("#cooking-ingredient-screen");
    const stepList = $(".step-list");
    if (ingredientScreen) {
      if (state.cookingMode && current?.type === "ingredients") {
        const group = cookingIngredientGroups(recipe).find(item => item.id === current.id);
        ingredientScreen.innerHTML = renderCookingIngredientScreen(recipe, group, state.multiplier);
        ingredientScreen.hidden = false;
        bindIngredientRows(ingredientScreen);
      } else {
        ingredientScreen.hidden = true;
        ingredientScreen.innerHTML = "";
      }
    }
    if (stepList) stepList.hidden = state.cookingMode && current?.type === "ingredients";
    const steps = [...app.querySelectorAll("[data-step-id]")];
    steps.forEach((step, index) => step.classList.toggle("current-cooking-step", index === state.currentStepIndex));
  }
  function updateCookingNavigation(recipe) {
    const stages = cookingStages(recipe);
    const total = stages.length;
    const counter = $("#cooking-step-counter");
    const previous = $("#cooking-prev");
    const next = $("#cooking-next");
    const current = stages[state.cookingStageIndex];
    if (counter) { const ingredientStages = stages.filter(stage => stage.type === "ingredients"); const ingredientIndex = current?.type === "ingredients" ? ingredientStages.findIndex(stage => stage.id === current.id) : -1; counter.textContent = !total ? "Нет этапов" : current?.type === "ingredients" ? (ingredientStages.length > 1 ? `Ингредиенты ${ingredientIndex + 1} из ${ingredientStages.length}` : "Ингредиенты") : `Шаг ${(current?.stepIndex ?? 0) + 1} из ${(recipe.steps || []).length}`; }
    if (previous) previous.disabled = state.cookingStageIndex <= 0;
    if (next) next.disabled = state.cookingStageIndex >= total - 1;
    applyCookingMode();
  }
  function scrollToCurrentStep(restore) {
    const steps = [...app.querySelectorAll("[data-step-id]")];
    const step = steps[state.currentStepIndex];
    if (!step) return;
    try { step.scrollIntoView({ behavior: "auto", block: "start" }); }
    catch (_) { step.scrollIntoView(true); }
    if (restore) window.scrollBy(0, -24);
  }
  function scrollToCurrentStage(restore, recipe) {
    if (!state.cookingMode) {
      scrollToCurrentStep(restore);
      return;
    }
    const stages = cookingStages(recipe);
    const current = stages[state.cookingStageIndex];
    if (current?.type === "step") {
      state.currentStepIndex = current.stepIndex;
      scrollToCurrentStep(restore);
    } else {
      const screen = $("#cooking-ingredient-screen");
      if (screen) screen.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }
  function moveCookingStage(direction, recipe) {
    const stages = cookingStages(recipe);
    state.cookingStageIndex = Math.max(0, Math.min(stages.length - 1, state.cookingStageIndex + direction));
    const current = stages[state.cookingStageIndex];
    if (current?.type === "step") state.currentStepIndex = current.stepIndex;
    const progress = state.recipeProgress[recipe.id] || {};
    progress.hasStepPosition = true;
    state.recipeProgress[recipe.id] = progress;
    saveCurrentRecipeState();
    updateCookingNavigation(recipe);
    scrollToCurrentStage(false, recipe);
  }
  function bindIngredientRows(root = app) {
    root.querySelectorAll("[data-ingredient-key]").forEach(row => {
      if (row.dataset.ingredientBound === "true") return;
      row.dataset.ingredientBound = "true";
      const toggle = () => {
        const key = row.dataset.ingredientKey;
        state.checkedIngredients.has(key) ? state.checkedIngredients.delete(key) : state.checkedIngredients.add(key);
        row.classList.toggle("checked", state.checkedIngredients.has(key));
        row.setAttribute("aria-checked", String(state.checkedIngredients.has(key)));
        $(".check-dot", row).textContent = state.checkedIngredients.has(key) ? "✓" : "";
        saveCurrentRecipeState();
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
  }
  async function init() {
    try {
      const [recipesResponse, categoriesResponse] = await Promise.all([
        fetch("./data/recipes.json"), fetch("./data/categories.json")
      ]);
      if (!recipesResponse.ok || !categoriesResponse.ok) throw new Error("Не удалось загрузить данные.");
      state.recipes = await recipesResponse.json();
      state.categories = (await categoriesResponse.json()).categories || [];
      const params = new URLSearchParams(location.search);
      const id = params.get("recipe");
      const requestedCategory = params.get("category");
      if (requestedCategory && (requestedCategory === "all" || findCategory(requestedCategory))) state.activeCategory = requestedCategory;
      const recipe = id ? state.recipes.find(r => r.id === id) : null;
      if (id && !recipe) {
        app.innerHTML = `<div class="error-state"><h2>Рецепт не найден</h2><p>Возможно, ссылка устарела или рецепт ещё не опубликован.</p><a class="back-link" href="./">← Вернуться к рецептам</a></div>`;
      } else if (recipe) renderRecipe(recipe);
      else renderHome();
    } catch (error) {
      app.innerHTML = `<div class="error-state"><h2>Не удалось загрузить кулинарную книгу</h2><p>${escapeHtml(error.message || "Проверь соединение и попробуй ещё раз.")}</p></div>`;
    }
  }
  const fontSizeButton = document.getElementById("font-size-toggle");
  if (fontSizeButton) {
    applyFontScale();
    fontSizeButton.addEventListener("click", () => {
      state.readingMode = !state.readingMode;
      state.fontScale = state.readingMode ? 150 : 100;
      applyFontScale();
      saveUserState();
    });
  }
  function closePrintMenu() {
    if (!printMenu || !printButton) return;
    printMenu.hidden = true;
    printButton.setAttribute("aria-expanded", "false");
  }
  printButton.addEventListener("click", event => {
    event.stopPropagation();
    const opening = printMenu.hidden;
    printMenu.hidden = !opening;
    printButton.setAttribute("aria-expanded", String(opening));
  });
  printMenuPrint.addEventListener("click", () => {
    closePrintMenu();
    window.print();
  });
  printMenuLink.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("copy failed");
      }
      printMenuLink.textContent = "Ссылка скопирована";
      window.setTimeout(() => { printMenuLink.textContent = "Скопировать ссылку"; }, 1800);
    } catch (_) {
      window.prompt("Скопируй ссылку на рецепт:", url);
    }
  });
  document.querySelector(".brand")?.addEventListener("click", () => { try { sessionStorage.removeItem(COOKING_SESSION_KEY); } catch (_) {} });
  window.addEventListener("pageshow", () => { if (!new URLSearchParams(location.search).has("recipe")) { try { sessionStorage.removeItem(COOKING_SESSION_KEY); } catch (_) {} } });
  document.addEventListener("click", event => {
    const backLink = event.target.closest(".back-link");
    if (backLink) { try { sessionStorage.removeItem(COOKING_SESSION_KEY); } catch (_) {} }
    if (!printMenuWrap.contains(event.target)) closePrintMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePrintMenu();
  });
  const updateTopButton = () => {
    const shouldShow = window.scrollY > window.innerHeight && !state.cookingMode;
    topButton.hidden = !shouldShow;
    topButton.classList.toggle("is-visible", shouldShow);
  };
  window.addEventListener("scroll", updateTopButton, { passive: true });
  window.addEventListener("resize", updateTopButton);
  window.addEventListener("resize", applyFontScale);
  topButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  updateTopButton();
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && state.wakeEnabled && !state.wakeLock && "wakeLock" in navigator) {
      try {
        state.wakeLock = await navigator.wakeLock.request("screen");
      } catch (_) {
        state.wakeEnabled = false;
        updateWakeButton();
      }
    }
  });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
  init();
})();
