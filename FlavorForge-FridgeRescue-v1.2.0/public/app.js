(function () {
  "use strict";

  const {
    normalizeIngredient,
    rankRecipes,
    formatFraction
  } = window.FlavorMatcher;

  const CATEGORIES = {
    "Everyday Staples": ["egg", "bread", "rice", "pasta", "oats", "tortilla"],
    "Fresh Vegetables": ["onion", "tomato", "potato", "garlic", "carrot", "spinach", "bell pepper", "cabbage", "cucumber", "mushroom"],
    "Proteins & Dairy": ["cheese", "milk", "yogurt", "paneer", "chicken", "tuna", "chickpeas", "beans", "dal"],
    "Pantry & Flavor": ["butter", "soy sauce", "cumin", "turmeric", "chili", "lemon", "coriander", "spring onion", "banana", "peanut butter"]
  };

  const STORAGE_KEY = "flavorforge_saved_recipes_v1";

  const state = {
    recipes: [],
    selected: new Set(["egg", "onion", "bread"]),
    savedIds: new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")),
    filters: {
      quick: false,
      vegetarian: false,
      saved: false
    }
  };

  // Safe HTML escaper to prevent XSS
  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function persistSaved() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(state.savedIds)));
    document.getElementById("savedCount").textContent = String(state.savedIds.size);
  }

  function toggleIngredient(raw) {
    const norm = normalizeIngredient(raw);
    if (!norm) return;
    if (state.selected.has(norm)) {
      state.selected.delete(norm);
    } else {
      state.selected.add(norm);
    }
    renderPantry();
    renderRecipes();
  }

  function renderPantry() {
    const tray = document.getElementById("selectedTray");
    const catContainer = document.getElementById("categoryContainer");

    if (state.selected.size === 0) {
      tray.innerHTML = `<span class="hint" style="margin:0;">No ingredients selected yet.</span>`;
    } else {
      tray.innerHTML = Array.from(state.selected)
        .map(
          (item) =>
            `<button type="button" class="selected-pill" data-remove="${esc(item)}" title="Remove ${esc(item)}">
              ${esc(item)} <span aria-hidden="true">×</span>
            </button>`
        )
        .join("");
    }

    catContainer.innerHTML = Object.entries(CATEGORIES)
      .map(([cat, items]) => {
        const chips = items
          .map((ing) => {
            const active = state.selected.has(ing) ? "active" : "";
            return `<button type="button" class="ing-chip ${active}" data-ing="${esc(ing)}">${esc(ing)}</button>`;
          })
          .join("");
        return `<div class="cat-group"><h3 class="cat-title">${esc(cat)}</h3><div class="chip-wrap">${chips}</div></div>`;
      })
      .join("");
  }

  function renderRecipes() {
    const grid = document.getElementById("recipeGrid");
    const subheading = document.getElementById("resultsSubheading");

    const owned = Array.from(state.selected);
    const ranked = rankRecipes(state.recipes, owned, {
      minScore: owned.length > 0 ? 1 : 0,
      vegetarianOnly: state.filters.vegetarian,
      quickOnly: state.filters.quick,
      maxTime: 15,
      savedIds: state.filters.saved ? Array.from(state.savedIds) : null
    });

    if (owned.length === 0 && !state.filters.saved) {
      subheading.textContent = "Showing all recipes — tap ingredients on the left to rank by match score.";
    } else {
      subheading.textContent = `Found ${ranked.length} matching recipe${ranked.length === 1 ? "" : "s"} for ${owned.length} selected ingredient${owned.length === 1 ? "" : "s"}.`;
    }

    if (ranked.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>No matching recipes found</h3>
          <p>Try adding another staple ingredient or clearing active filters.</p>
        </div>`;
      return;
    }

    grid.innerHTML = ranked
      .map((r) => {
        const isSaved = state.savedIds.has(r.id);
        const badgeClass = r.matchScore >= 75 ? "score-high" : "score-mid";
        const ownedTags = r.matchedIngredients
          .map((i) => `<span class="tag-owned">✓ ${esc(i)}</span>`)
          .join("");
        const missingTags = r.missingIngredients
          .map((i) => `<span class="tag-missing">+ ${esc(i)}</span>`)
          .join("");

        return `
          <article class="recipe-card">
            <div>
              <div class="card-top">
                <h3 class="card-title">${esc(r.emoji)} ${esc(r.name)}</h3>
                <span class="score-badge ${badgeClass}">${r.matchScore}% Match</span>
              </div>
              <div class="meta-row" style="margin:6px 0 10px;">
                <span>⏱ ${esc(r.time)} min</span>
                <span>🍽 ${esc(r.servings)} servings</span>
                <span>${r.vegetarian ? "🌱 Veg" : "🍳 Non-Veg"}</span>
              </div>
              <p class="hint" style="margin-bottom:10px;">${esc(r.description)}</p>
              <div class="tag-row">${ownedTags}${missingTags}</div>
            </div>
            <div class="card-actions">
              <button type="button" class="btn btn-primary" data-open="${r.id}">Cook &amp; Substitutes</button>
              <button type="button" class="icon-btn" data-save="${r.id}" aria-label="Save recipe" title="Bookmark recipe">
                ${isSaved ? "❤️" : "🤍"}
              </button>
            </div>
          </article>`;
      })
      .join("");
  }

  function openRecipeModal(recipeId, targetServings = null) {
    const recipe = state.recipes.find((r) => r.id === Number(recipeId));
    if (!recipe) return;

    const modal = document.getElementById("recipeModal");
    const content = document.getElementById("modalContent");
    const servings = targetServings || recipe.servings || 2;
    const ratio = servings / (recipe.servings || 1);

    const ingItems = recipe.ingredients
      .map((rawIng) => {
        const norm = normalizeIngredient(rawIng);
        const owned = state.selected.has(norm) || ["salt", "oil", "water"].includes(norm);
        const baseQty = recipe.quantities?.[rawIng];
        const unit = recipe.units?.[rawIng] || "";
        const scaledQty = typeof baseQty === "number" ? formatFraction(baseQty * ratio) : "";
        const sub = !owned && recipe.substitutions?.[rawIng] ? recipe.substitutions[rawIng] : "";

        return `
          <li>
            <div>
              <strong>${owned ? "✓" : "○"} ${esc(rawIng)}</strong>
              ${sub ? `<div class="sub-note">Substitute: ${esc(sub)}</div>` : ""}
            </div>
            <span>${esc(scaledQty)} ${esc(unit)}</span>
          </li>`;
      })
      .join("");

    const stepItems = recipe.steps
      .map((step, idx) => `<li data-step-idx="${idx}">${esc(step)}</li>`)
      .join("");

    const scaleButtons = [1, 2, 3, 4, 6]
      .map(
        (n) =>
          `<button type="button" class="scale-btn ${n === servings ? "active" : ""}" data-scale-recipe="${recipe.id}" data-servings="${n}">${n}</button>`
      )
      .join("");

    content.innerHTML = `
      <div class="modal-header">
        <div>
          <h2 style="margin:0;">${esc(recipe.emoji)} ${esc(recipe.name)}</h2>
          <p class="hint" style="margin:4px 0 0;">⏱ ${esc(recipe.time)} min · Difficulty: ${esc(recipe.difficulty)}</p>
        </div>
        <button type="button" class="btn" id="closeModalBtn">Close ✕</button>
      </div>

      <div class="scaler-bar">
        <strong>Serving Scaler (people):</strong>
        <div class="scaler-controls">${scaleButtons}</div>
      </div>

      <h3>Ingredients &amp; Kitchen Substitutes</h3>
      <ul class="ing-list">${ingItems}</ul>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;">Cooking Steps</h3>
        <button type="button" class="btn btn-accent" id="readAloudBtn">🔊 Read Steps Aloud</button>
      </div>
      <ol class="steps-list" id="modalStepsList">${stepItems}</ol>
    `;

    if (!modal.open) modal.showModal();

    document.getElementById("closeModalBtn").onclick = () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      modal.close();
    };

    document.getElementById("readAloudBtn").onclick = () => {
      if (!("speechSynthesis" in window)) {
        alert("Web Speech synthesis is not supported in this browser.");
        return;
      }
      window.speechSynthesis.cancel();
      const stepEls = Array.from(document.querySelectorAll("#modalStepsList li"));
      recipe.steps.forEach((text, idx) => {
        const utter = new SpeechSynthesisUtterance(`Step ${idx + 1}. ${text}`);
        utter.onstart = () => {
          stepEls.forEach((el) => el.classList.remove("speaking"));
          if (stepEls[idx]) stepEls[idx].classList.add("speaking");
        };
        utter.onend = () => {
          if (idx === recipe.steps.length - 1 && stepEls[idx]) {
            stepEls[idx].classList.remove("speaking");
          }
        };
        window.speechSynthesis.speak(utter);
      });
    };
  }

  async function init() {
    persistSaved();
    renderPantry();

    const badge = document.getElementById("dbStatusBadge");
    try {
      const [healthRes, recipesRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/recipes")
      ]);
      if (!healthRes.ok || !recipesRes.ok) throw new Error("API unavailable");
      const health = await healthRes.json();
      const data = await recipesRes.json();
      state.recipes = data.recipes || [];
      badge.textContent = `SQLite Ready · ${health.recipeCount} Recipes`;
    } catch (err) {
      badge.textContent = "Offline Mode";
      badge.style.background = "#fff4df";
      badge.style.color = "#9a5b00";
    }

    renderRecipes();
  }

  // Event delegation
  document.addEventListener("click", (e) => {
    const ingBtn = e.target.closest("[data-ing]");
    if (ingBtn) return toggleIngredient(ingBtn.dataset.ing);

    const remBtn = e.target.closest("[data-remove]");
    if (remBtn) return toggleIngredient(remBtn.dataset.remove);

    const openBtn = e.target.closest("[data-open]");
    if (openBtn) return openRecipeModal(openBtn.dataset.open);

    const saveBtn = e.target.closest("[data-save]");
    if (saveBtn) {
      const id = Number(saveBtn.dataset.save);
      if (state.savedIds.has(id)) state.savedIds.delete(id);
      else state.savedIds.add(id);
      persistSaved();
      renderRecipes();
      return;
    }

    const scaleBtn = e.target.closest("[data-scale-recipe]");
    if (scaleBtn) {
      return openRecipeModal(scaleBtn.dataset.scaleRecipe, Number(scaleBtn.dataset.servings));
    }

    const filterBtn = e.target.closest("[data-filter]");
    if (filterBtn) {
      const key = filterBtn.dataset.filter;
      state.filters[key] = !state.filters[key];
      filterBtn.setAttribute("aria-pressed", String(state.filters[key]));
      renderRecipes();
    }
  });

  document.getElementById("customIngredientForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("customInput");
    if (input.value.trim()) {
      toggleIngredient(input.value);
      input.value = "";
    }
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    state.selected.clear();
    renderPantry();
    renderRecipes();
  });

  document.getElementById("demoBtn").addEventListener("click", () => {
    state.selected = new Set(["egg", "onion", "bread"]);
    state.filters = { quick: false, vegetarian: false, saved: false };
    document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", "false"));
    renderPantry();
    renderRecipes();
  });

  init();
})();
