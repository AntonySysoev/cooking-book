(() => {
  "use strict";
  const app = document.getElementById("app");
  const printButton = document.getElementById("print-button");
  const state = { recipes: [], categories: [], activeCategory: "all", query: "", checkedIngredients: new Set(), doneSteps: new Set(), wakeLock: null, wakeEnabled: false, currentRecipe: null, servings: 1 };
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
  function formatMinutes(minutes) {
    if (!Number.isFinite(minutes)) return "";
    const n = Math.round(minutes);
    if (n < 60) return `${n} мин`;
    const hours = Math.floor(n / 60), mins = n % 60;
    const hWord = hours % 10 === 1 && hours % 100 !== 11 ? "ч" : "ч";
    return mins ? `${hours} ${hWord} ${mins} мин` : `${hours} ${hWord}`;
  }
  function timeLabel(recipe) {
    const t = recipe.time || {};
    const min = t.total_minutes_min ?? t.total_minutes;
    const max = t.total_minutes_max;
    if (min == null) return "";
    return max != null && max !== min ? `${formatMinutes(min)} – ${formatMinutes(max)}` : formatMinutes(min);
  }
  function yieldBase(recipe) {
    const y = recipe.yield || {};
    return Number(y.quantity ?? y.quantity_min ?? 1) || 1;
  }
  function yieldLabel(recipe) {
    const y = recipe.yield || {};
    const amount = y.quantity != null ? numberText(y.quantity)
      : y.quantity_min != null && y.quantity_max != null ? `${numberText(y.quantity_min)}–${numberText(y.quantity_max)}`
      : "";
    return [amount, y.unit].filter(Boolean).join(" ");
  }
  function categoryName(id) {
    const c = state.categories.find(item => item.id === id);
    return c ? c.title : id || "Без категории";
  }
  function allSearchText(recipe) {
    return [recipe.title, recipe.description, ...(recipe.tags || []), categoryName(recipe.category), recipe.subcategory,
      ...(recipe.ingredients || []).map(i => i.name)].join(" ").toLocaleLowerCase("ru");
  }
  function renderHome() {
    printButton.hidden = true;
    const categories = state.categories.map(c => `<button class="pill ${state.activeCategory === c.id ? "active" : ""}" data-category="${escapeHtml(c.id)}" type="button">${escapeHtml(c.title)}</button>`).join("");
    const filtered = state.recipes.filter(r => (state.activeCategory === "all" || r.category === state.activeCategory) &&
      allSearchText(r).includes(state.query.toLocaleLowerCase("ru")));
    app.innerHTML = `
      <section class="hero">
        <div class="eyebrow">Собрано и проверено на собственной кухне</div>
        <h1>Что приготовим<br>сегодня?</h1>
        <p class="lead">Любимые рецепты в одном месте — с понятными шагами, точными количествами и удобным режимом готовки.</p>
      </section>
      <div class="toolbar">
        <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" class="search-input" type="search" placeholder="Найти рецепт или ингредиент…" value="${escapeHtml(state.query)}" autocomplete="off" aria-label="Поиск рецептов"></label>
        <select id="category-select" class="category-select" aria-label="Фильтр по категории">
          <option value="all">Все категории</option>
          ${state.categories.map(c => `<option value="${escapeHtml(c.id)}" ${state.activeCategory === c.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`).join("")}
        </select>
      </div>
      <div class="category-pills"><button class="pill ${state.activeCategory === "all" ? "active" : ""}" data-category="all" type="button">Все</button>${categories}</div>
      <div class="section-heading"><h2>Рецепты</h2><span class="result-count">${filtered.length} ${filtered.length === 1 ? "рецепт" : filtered.length > 1 && filtered.length < 5 ? "рецепта" : "рецептов"}</span></div>
      ${filtered.length ? `<div class="recipe-grid">${filtered.map(r => `
        <a class="recipe-card" href="?recipe=${encodeURIComponent(r.id)}">
          <span class="card-category">${escapeHtml(categoryName(r.category))}${r.subcategory ? " · " + escapeHtml((state.categories.find(c => c.id === r.category)?.subcategories || []).find(s => s.id === r.subcategory)?.title || "") : ""}</span>
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
    printButton.hidden = false;
    state.currentRecipe = recipe;
    state.servings = yieldBase(recipe);
    state.checkedIngredients.clear();
    state.doneSteps.clear();
    const subcategory = (state.categories.find(c => c.id === recipe.category)?.subcategories || []).find(s => s.id === recipe.subcategory)?.title;
    app.innerHTML = `
      <a class="back-link" href="./">← Все рецепты</a>
      <section class="recipe-head">
        <div class="eyebrow">${escapeHtml(categoryName(recipe.category))}${subcategory ? " / " + escapeHtml(subcategory) : ""}</div>
        <h1>${escapeHtml(recipe.title)}</h1>
        ${recipe.description ? `<p class="recipe-description">${escapeHtml(recipe.description)}</p>` : ""}
        <div class="recipe-meta">${timeLabel(recipe) ? `<span class="meta-chip">◷ ${escapeHtml(timeLabel(recipe))}</span>` : ""}${yieldLabel(recipe) ? `<span class="meta-chip">♧ ${escapeHtml(yieldLabel(recipe))}</span>` : ""}${(recipe.tags || []).slice(0,4).map(t => `<span class="meta-chip">${escapeHtml(t)}</span>`).join("")}</div>
      </section>
      <div class="recipe-layout">
        <div>
          <section class="panel">
            <h2 class="panel-title">Ингредиенты</h2>
            <div class="wake-card">
              <div><strong>Не выключать экран</strong><p id="wake-status">Экран может выключаться автоматически.</p></div>
              <label class="switch" aria-label="Не выключать экран во время готовки"><input id="wake-toggle" type="checkbox"><span class="switch-track"></span></label>
            </div>
            <div class="scale-box"><label for="servings-input">Выход рецепта</label><input id="servings-input" class="scale-input" type="number" min="0.1" step="any" value="${numberText(state.servings)}" aria-label="Количество порций или изделий"></div>
            <div id="ingredient-groups">${ingredientRows(recipe, 1)}</div>
            <div style="margin-top:14px"><button id="reset-checks" class="reset-button" type="button">Сбросить отметки</button></div>
          </section>
          ${recipe.equipment?.length ? `<section class="panel"><h2 class="panel-title">Оборудование</h2><ul class="tips-list">${recipe.equipment.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
          ${recipe.tips?.length ? `<section class="panel"><h2 class="panel-title">Советы</h2><ul class="tips-list">${recipe.tips.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
          ${recipe.storage?.length ? `<section class="panel"><h2 class="panel-title">Хранение</h2><ul class="storage-list">${recipe.storage.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
        </div>
        <section class="panel">
          <div class="panel-head-row"><h2 class="panel-title" style="margin:0">Приготовление</h2><button id="reset-steps" class="reset-button" type="button">Сбросить шаги</button></div>
          <ol class="step-list">${renderSteps(recipe, 1)}</ol>
        </section>
      </div>
    `;
    const wakeToggle = $("#wake-toggle");
    wakeToggle.checked = state.wakeEnabled;
    wakeToggle.addEventListener("change", async () => {
      state.wakeEnabled = wakeToggle.checked;
      const status = $("#wake-status");
      if (!state.wakeEnabled) {
        try { if (state.wakeLock) await state.wakeLock.release(); } catch (_) {}
        state.wakeLock = null;
        status.textContent = "Экран может выключаться автоматически.";
        return;
      }
      if (!("wakeLock" in navigator)) {
        status.textContent = "Браузер не поддерживает удержание экрана.";
        wakeToggle.checked = false;
        state.wakeEnabled = false;
        return;
      }
      try {
        state.wakeLock = await navigator.wakeLock.request("screen");
        status.textContent = "Экран останется включённым во время готовки.";
        state.wakeLock.addEventListener("release", () => {
          state.wakeLock = null;
          if (state.wakeEnabled) status.textContent = "Экран снова может выключиться. Включи переключатель ещё раз.";
        });
      } catch (_) {
        status.textContent = "Не удалось удержать экран. Проверь разрешения браузера.";
        wakeToggle.checked = false;
        state.wakeEnabled = false;
      }
    });
    $("#servings-input").addEventListener("input", e => {
      const amount = Number(e.target.value);
      if (!Number.isFinite(amount) || amount <= 0) return;
      state.servings = amount;
      const factor = amount / yieldBase(recipe);
      $("#ingredient-groups").innerHTML = ingredientRows(recipe, factor);
      bindIngredientRows();
      const active = document.activeElement;
      if (active && active.id === "servings-input") active.focus();
      $(".step-list").innerHTML = renderSteps(recipe, factor);
      bindSteps();
    });
    $("#reset-checks").addEventListener("click", () => { state.checkedIngredients.clear(); $("#ingredient-groups").innerHTML = ingredientRows(recipe, state.servings / yieldBase(recipe)); bindIngredientRows(); });
    $("#reset-steps").addEventListener("click", () => { state.doneSteps.clear(); $(".step-list").innerHTML = renderSteps(recipe, state.servings / yieldBase(recipe)); bindSteps(); });
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
        const recipe = state.currentRecipe;
        const factor = state.servings / yieldBase(recipe);
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
  printButton.addEventListener("click", () => window.print());
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && state.wakeEnabled && !state.wakeLock && "wakeLock" in navigator) {
      try { state.wakeLock = await navigator.wakeLock.request("screen"); } catch (_) {}
    }
  });
  init();
})();
