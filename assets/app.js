(() => {
  "use strict";
  const app = document.getElementById("app");
  const printButton = document.getElementById("print-button");
  const topButton = document.getElementById("top-button");
  const STORAGE_KEY = "cooking-book-user-state-v1";
  const state = { recipes: [], categories: [], activeCategory: "all", query: "", checkedIngredients: new Set(), doneSteps: new Set(), wakeLock: null, wakeEnabled: false, currentRecipe: null, multiplier: 1, recentlyViewed: {}, recipeProgress: {}, fontScale: 100, readingMode: false };
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
  function saveCurrentRecipeState() {
    if (!state.currentRecipe) return;
    state.recipeProgress[state.currentRecipe.id] = { multiplier: state.multiplier, checkedIngredients: [...state.checkedIngredients], doneSteps: [...state.doneSteps] };
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
      const value = fontSizeButton.querySelector(".font-size-value");
      if (value) value.textContent = state.readingMode ? "150%" : "100%";
    }
  }
  applyFontScale();
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
  function categoryName(id) {
    const c = state.categories.find(item => item.id === id);
    return c ? c.title : id || "Без категории";
  }
  function categoryClass(id) {
    const allowed = ["desserts", "ice-cream", "baking-and-dough", "main-dishes", "snacks-and-light-meals", "drinks", "soups", "salads-and-sides", "sauces-and-preserves"];
    return allowed.includes(id) ? `category-${id}` : "category-neutral";
  }
  function categoryIcon(id) {
    return ({
      desserts: "🍰",
      "ice-cream": "🍨",
      "baking-and-dough": "🥐",
      "main-dishes": "🍽️",
      "snacks-and-light-meals": "🥑",
      drinks: "🥤",
      soups: "🍲",
      "salads-and-sides": "🥗",
      "sauces-and-preserves": "🫙"
    })[id] || "🍴";
  }
  function recipeCategories(recipe) {
    return [...new Set([recipe.category, ...(Array.isArray(recipe.also_in) ? recipe.also_in : [])].filter(Boolean))];
  }
  function categoryLabels(recipe) {
    return recipeCategories(recipe).map(id => `${categoryIcon(id)} ${categoryName(id)}`);
  }
  function allSearchText(recipe) {
    return [recipe.title, recipe.description, ...(recipe.tags || []), ...recipeCategories(recipe).map(categoryName), recipe.subcategory,
      ...(recipe.ingredients || []).map(i => i.name)].join(" ").toLocaleLowerCase("ru");
  }
  function renderHome() {
    document.title = "Cooking Book — кулинарная книга";
    printButton.hidden = true;
    $("#wake-toggle").hidden = true;
    const categories = state.categories.map(c => `<button class="pill ${categoryClass(c.id)} ${state.activeCategory === c.id ? "active" : ""}" data-category="${escapeHtml(c.id)}" type="button"><span class="category-icon" aria-hidden="true">${categoryIcon(c.id)}</span> ${escapeHtml(c.title)}</button>`).join("");
    const filtered = state.recipes.filter(r => (state.activeCategory === "all" || recipeCategories(r).includes(state.activeCategory)) &&
      allSearchText(r).includes(state.query.toLocaleLowerCase("ru")))
      .map((recipe, index) => ({ recipe, index, viewedAt: Number(state.recentlyViewed[recipe.id]) || 0 }))
      .sort((a, b) => b.viewedAt - a.viewedAt || a.index - b.index)
      .map(item => item.recipe);
    app.innerHTML = `
      <div class="toolbar">
        <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" class="search-input" type="search" placeholder="Найти рецепт или ингредиент…" value="${escapeHtml(state.query)}" autocomplete="off" aria-label="Поиск рецептов"></label>
        <select id="category-select" class="category-select" aria-label="Фильтр по категории">
          <option value="all">Все категории</option>
          ${state.categories.map(c => `<option value="${escapeHtml(c.id)}" ${state.activeCategory === c.id ? "selected" : ""}>${categoryIcon(c.id)} ${escapeHtml(c.title)}</option>`).join("")}
        </select>
      </div>
      <div class="category-pills"><button class="pill ${state.activeCategory === "all" ? "active" : ""}" data-category="all" type="button">Все</button>${categories}</div>
      <div class="section-heading"><h2>Рецепты</h2><span class="result-count">${filtered.length} ${filtered.length === 1 ? "рецепт" : filtered.length > 1 && filtered.length < 5 ? "рецепта" : "рецептов"}</span></div>
      ${filtered.length ? `<div class="recipe-grid">${filtered.map(r => `
        <a class="recipe-card ${categoryClass(r.category)}" href="?recipe=${encodeURIComponent(r.id)}">
          <span class="card-category">${categoryLabels(r).map(label => escapeHtml(label)).join(" · ")}${r.subcategory ? " · " + escapeHtml((state.categories.find(c => c.id === r.category)?.subcategories || []).find(s => s.id === r.subcategory)?.title || "") : ""}</span>
          <h3>${escapeHtml(r.title)}</h3>
          <p class="card-description">${escapeHtml(r.description || "")}</p>
          <div class="card-meta"><span>◷ ${escapeHtml(timeLabel(r) || "Время не указано")}</span><span>♧ ${escapeHtml(yieldLabel(r) || "Выход не указан")}</span></div>
        </a>`).join("")}</div>` : `<div class="empty-state"><h3>Ничего не найдено</h3><p>Попробуй изменить запрос или выбрать другую категорию.</p></div>`}
    `;
    $("#search").addEventListener("input", e => { state.query = e.target.value; const pos = e.target.selectionStart; renderHome(); const input = $("#search"); input.focus(); input.setSelectionRange(pos, pos); });
    $("#category-select").addEventListener("change", e => { state.activeCategory = e.target.value; renderHome(); });
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
  function ingredientRows(recipe, factor) {
    const groups = recipe.ingredient_groups || [];
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
      const done = state.doneSteps.has(step.id);
      const chips = (step.ingredients || []).map(ref => displayRef(ref, recipe, factor)).filter(Boolean);
      return `<li class="step ${done ? "done" : ""}" data-step-id="${escapeHtml(step.id)}" tabindex="0" role="checkbox" aria-checked="${done}">
        <span class="step-number">${done ? "✓" : index + 1}</span><div><div class="step-title">${escapeHtml(step.title || `Шаг ${index + 1}`)}</div>
        ${chips.length ? `<div class="step-ingredients">${chips.map(chip => `<span class="step-ingredient-chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
        <p class="step-instructions">${escapeHtml(step.instructions || "")}</p></div>
      </li>`;
    }).join("");
  }
  function renderRecipe(recipe) {
    document.body.className = document.body.className.replace(/\bcategory-[\w-]+\b/g, "").trim();
    document.body.classList.add(categoryClass(recipe.category));
    printButton.hidden = false;
    $("#wake-toggle").hidden = false;
    document.title = `${recipe.title} — Cooking Book`;
    state.currentRecipe = recipe;
    state.recentlyViewed[recipe.id] = Date.now();
    saveUserState();
    const savedProgress = state.recipeProgress[recipe.id] || {};
    state.multiplier = savedProgress.multiplier == null || !Number.isFinite(Number(savedProgress.multiplier))
      ? 1 : Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, Math.round(Number(savedProgress.multiplier) * 100) / 100));
    state.checkedIngredients = new Set(Array.isArray(savedProgress.checkedIngredients) ? savedProgress.checkedIngredients : []);
    state.doneSteps = new Set(Array.isArray(savedProgress.doneSteps) ? savedProgress.doneSteps : []);
    const subcategory = (state.categories.find(c => c.id === recipe.category)?.subcategories || []).find(s => s.id === recipe.subcategory)?.title;
    app.innerHTML = `
      <a class="back-link" href="./">← Все рецепты</a>
      <section class="recipe-head">
        <div class="eyebrow">${categoryLabels(recipe).map(label => escapeHtml(label)).join(" · ")}${subcategory ? " / " + escapeHtml(subcategory) : ""}</div>
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
          <div class="panel-head-row"><h2 class="panel-title" style="margin:0">Приготовление</h2><button id="reset-steps" class="reset-button" type="button">Сбросить шаги</button></div>
          <ol class="step-list">${renderSteps(recipe, state.multiplier)}</ol>
        </section>
      </div>
      <section class="reset-all-wrap" aria-label="Сброс прогресса рецепта">
        <button id="reset-recipe-progress" class="reset-button" type="button">Сбросить все отметки и шаги</button>
        <p>Сбросит отметки ингредиентов, выполненные шаги и множитель только для этого рецепта.</p>
      </section>
    `;
    const wakeToggle = $("#wake-toggle");
    const updateWakeButton = () => {
      wakeToggle.setAttribute("aria-pressed", String(state.wakeEnabled));
      wakeToggle.classList.toggle("is-active", state.wakeEnabled);
      wakeToggle.title = state.wakeEnabled ? "Экран удерживается включённым — нажми, чтобы выключить" : "Не выключать экран во время готовки";
      wakeToggle.setAttribute("aria-label", wakeToggle.title);
    };
    updateWakeButton();
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
      bindSteps();
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
    $("#multiplier-up").addEventListener("click", () => stepMultiplier(1));
    $("#multiplier-down").addEventListener("click", () => stepMultiplier(-1));
    $("#reset-checks").addEventListener("click", () => { state.checkedIngredients.clear(); saveCurrentRecipeState(); $("#ingredient-groups").innerHTML = ingredientRows(recipe, state.multiplier); bindIngredientRows(); });
    $("#reset-steps").addEventListener("click", () => { state.doneSteps.clear(); saveCurrentRecipeState(); $(".step-list").innerHTML = renderSteps(recipe, state.multiplier); bindSteps(); });
    $("#reset-recipe-progress").addEventListener("click", () => {
      if (!window.confirm("Сбросить все отметки ингредиентов, выполненные шаги и множитель только для этого рецепта?")) return;
      state.checkedIngredients.clear();
      state.doneSteps.clear();
      state.multiplier = 1;
      multiplierInput.value = multiplierText(state.multiplier);
      saveCurrentRecipeState();
      updateMultiplier();
    });
    bindIngredientRows();
    bindSteps();
  }
  function bindIngredientRows() {
    app.querySelectorAll("[data-ingredient-key]").forEach(row => {
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
  function bindSteps() {
    app.querySelectorAll("[data-step-id]").forEach(row => {
      const toggle = () => {
        const id = row.dataset.stepId;
        state.doneSteps.has(id) ? state.doneSteps.delete(id) : state.doneSteps.add(id);
        saveCurrentRecipeState();
        const recipe = state.currentRecipe;
        const factor = state.multiplier;
        $(".step-list").innerHTML = renderSteps(recipe, factor);
        bindSteps();
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
      const id = new URLSearchParams(location.search).get("recipe");
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
  printButton.addEventListener("click", () => window.print());
  const updateTopButton = () => {
    const shouldShow = window.scrollY > window.innerHeight;
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
