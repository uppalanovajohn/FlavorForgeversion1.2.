(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FlavorMatcher = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ASSUMED_STAPLES = new Set(["salt", "oil", "water"]);

  const ALIASES = Object.freeze({
    eggs: "egg",
    onions: "onion",
    tomatoes: "tomato",
    potatoes: "potato",
    carrots: "carrot",
    chilies: "chili",
    chillies: "chili",
    "green chili": "chili",
    "green chilies": "chili",
    "bell peppers": "bell pepper",
    peppers: "bell pepper",
    capsicum: "bell pepper",
    cloves: "garlic",
    "garlic cloves": "garlic",
    scallions: "spring onion",
    "green onion": "spring onion",
    "green onions": "spring onion",
    cilantro: "coriander",
    "coriander leaves": "coriander",
    "olive oil": "oil",
    "vegetable oil": "oil",
    "cooking oil": "oil",
    "sea salt": "salt",
    "table salt": "salt",
    "cheddar cheese": "cheese",
    "mozzarella cheese": "cheese",
    "white bread": "bread",
    "brown bread": "bread",
    "whole wheat bread": "bread",
    toast: "bread",
    "white rice": "rice",
    "cooked rice": "rice",
    "leftover rice": "rice",
    spaghetti: "pasta",
    penne: "pasta",
    macaroni: "pasta",
    noodles: "pasta",
    curd: "yogurt",
    dahi: "yogurt",
    "greek yogurt": "yogurt",
    "chick peas": "chickpeas",
    garbanzo: "chickpeas",
    "garbanzo beans": "chickpeas",
    "kidney beans": "beans",
    "black beans": "beans",
    lentils: "dal",
    "red lentils": "dal",
    "yellow lentils": "dal"
  });

  function normalizeIngredient(raw) {
    if (typeof raw !== "string") return "";
    let cleaned = raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, " ");
    if (!cleaned) return "";
    if (ALIASES[cleaned]) return ALIASES[cleaned];
    if (cleaned.endsWith("ies") && cleaned.length > 4) {
      const singular = cleaned.slice(0, -3) + "y";
      if (ALIASES[singular]) return ALIASES[singular];
      return singular;
    }
    if (cleaned.endsWith("es") && cleaned.length > 4 && !cleaned.endsWith("cheese")) {
      const singular = cleaned.slice(0, -2);
      if (ALIASES[singular]) return ALIASES[singular];
    }
    if (cleaned.endsWith("s") && cleaned.length > 3 && !cleaned.endsWith("ss")) {
      const singular = cleaned.slice(0, -1);
      if (ALIASES[singular]) return ALIASES[singular];
      return singular;
    }
    return cleaned;
  }

  function normalizeIngredientList(list) {
    if (!Array.isArray(list)) return [];
    const unique = new Set();
    for (const item of list) {
      const norm = normalizeIngredient(item);
      if (norm) unique.add(norm);
    }
    return Array.from(unique);
  }

  function scoreRecipe(recipe, ownedIngredients) {
    const ownedSet = new Set(normalizeIngredientList(ownedIngredients));
    const required = (recipe.ingredients || [])
      .map(normalizeIngredient)
      .filter((ing) => ing && !ASSUMED_STAPLES.has(ing));

    const uniqueRequired = Array.from(new Set(required));
    const denominator = uniqueRequired.length;

    if (denominator === 0) {
      return {
        ...recipe,
        matchScore: 100,
        matchedCount: 0,
        requiredCount: 0,
        matchedIngredients: [],
        missingIngredients: [],
        staplesAssumed: (recipe.ingredients || []).filter((i) =>
          ASSUMED_STAPLES.has(normalizeIngredient(i))
        )
      };
    }

    const matchedIngredients = [];
    const missingIngredients = [];

    for (const ing of uniqueRequired) {
      if (ownedSet.has(ing)) {
        matchedIngredients.push(ing);
      } else {
        missingIngredients.push(ing);
      }
    }

    const matchScore = Math.round((matchedIngredients.length / denominator) * 100);
    const staplesAssumed = (recipe.ingredients || []).filter((i) =>
      ASSUMED_STAPLES.has(normalizeIngredient(i))
    );

    return {
      ...recipe,
      matchScore,
      matchedCount: matchedIngredients.length,
      requiredCount: denominator,
      matchedIngredients,
      missingIngredients,
      staplesAssumed
    };
  }

  function rankRecipes(recipes, ownedIngredients, options = {}) {
    const {
      minScore = 1,
      vegetarianOnly = false,
      quickOnly = false,
      maxTime = 20,
      savedIds = null
    } = options;

    const savedSet = savedIds ? new Set(savedIds.map(Number)) : null;

    return (recipes || [])
      .filter((r) => {
        if (vegetarianOnly && !r.vegetarian) return false;
        if (quickOnly && Number(r.time) > maxTime) return false;
        if (savedSet && !savedSet.has(Number(r.id))) return false;
        return true;
      })
      .map((r) => scoreRecipe(r, ownedIngredients))
      .filter((r) => r.matchScore >= minScore)
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (a.missingIngredients.length !== b.missingIngredients.length) {
          return a.missingIngredients.length - b.missingIngredients.length;
        }
        return Number(a.time || 999) - Number(b.time || 999);
      });
  }

  function formatFraction(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return "";
    const whole = Math.floor(num);
    const rem = num - whole;
    const fractions = [
      [0.125, "⅛"],
      [0.25, "¼"],
      [1 / 3, "⅓"],
      [0.375, "⅜"],
      [0.5, "½"],
      [0.625, "⅝"],
      [2 / 3, "⅔"],
      [0.75, "¾"],
      [0.875, "⅞"]
    ];
    let bestFrac = "";
    let minDiff = 0.06;
    for (const [target, symbol] of fractions) {
      const diff = Math.abs(rem - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestFrac = symbol;
      }
    }
    if (rem < 0.06) return String(whole || "");
    if (rem > 0.94) return String(whole + 1);
    if (bestFrac) return whole > 0 ? `${whole} ${bestFrac}` : bestFrac;
    return Number(num.toFixed(2)).toString();
  }

  return {
    ASSUMED_STAPLES,
    ALIASES,
    normalizeIngredient,
    normalizeIngredientList,
    scoreRecipe,
    rankRecipes,
    formatFraction
  };
});
