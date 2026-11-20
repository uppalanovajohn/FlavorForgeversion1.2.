"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server/server");
const {
  normalizeIngredient,
  normalizeIngredientList,
  scoreRecipe,
  rankRecipes,
  formatFraction
} = require("../shared/matcher");

describe("Shared Ingredient Matcher & Scoring Engine", () => {
  it("normalizes plurals, casing, whitespace, and culinary aliases", () => {
    assert.equal(normalizeIngredient("  Eggs "), "egg");
    assert.equal(normalizeIngredient("TOMATOES"), "tomato");
    assert.equal(normalizeIngredient("Capsicum"), "bell pepper");
    assert.equal(normalizeIngredient("Dahi"), "yogurt");
    assert.equal(normalizeIngredient("Scallions"), "spring onion");
    assert.deepEqual(normalizeIngredientList(["Eggs", "egg", "  ONIONS "]), ["egg", "onion"]);
  });

  it("excludes assumed staples (salt, oil, water) from match score denominator", () => {
    const eggToast = {
      id: 1,
      name: "Egg Toast",
      ingredients: ["egg", "onion", "bread", "salt", "oil"],
      time: 10,
      vegetarian: false
    };

    const result = scoreRecipe(eggToast, ["egg", "onion", "bread"]);
    assert.equal(result.matchScore, 100);
    assert.equal(result.requiredCount, 3);
    assert.deepEqual(result.missingIngredients, []);
    assert.deepEqual(result.staplesAssumed, ["salt", "oil"]);
  });

  it("formats serving scaler decimals into clean culinary fractions", () => {
    assert.equal(formatFraction(0.5), "½");
    assert.equal(formatFraction(0.25), "¼");
    assert.equal(formatFraction(0.75), "¾");
    assert.equal(formatFraction(1.5), "1 ½");
    assert.equal(formatFraction(2), "2");
  });

  it("ranks recipes by descending match score and fewer missing ingredients", () => {
    const sample = [
      { id: 1, name: "A", ingredients: ["egg", "onion", "bread"], time: 10, vegetarian: false },
      { id: 2, name: "B", ingredients: ["egg", "tomato", "cheese", "bread"], time: 8, vegetarian: false }
    ];
    const ranked = rankRecipes(sample, ["egg", "onion", "bread"]);
    assert.equal(ranked[0].name, "A");
    assert.equal(ranked[0].matchScore, 100);
    assert.equal(ranked[1].name, "B");
    assert.equal(ranked[1].matchScore, 50);
  });
});

describe("Express + SQLite API Integration & Security", () => {
  let app;
  let server;
  let baseUrl;

  before(async () => {
    process.env.NODE_ENV = "test";
    app = createApp({ dbPath: ":memory:" });
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    app.locals.closeDb();
  });

  it("GET /api/health confirms SQLite database initialized with 40 recipes", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.engine, "node:sqlite");
    assert.equal(body.recipeCount, 40);
  });

  it("GET /api/search returns 100% match for Egg, Onion, Bread", async () => {
    const res = await fetch(`${baseUrl}/api/search?ingredients=eggs,ONION,bread`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.matches[0].name, "Egg Toast");
    assert.equal(body.matches[0].matchScore, 100);
  });

  it("GET /api/recipes/:id validates ID format and returns 404 when missing", async () => {
    const badRes = await fetch(`${baseUrl}/api/recipes/abc`);
    assert.equal(badRes.status, 400);

    const missingRes = await fetch(`${baseUrl}/api/recipes/9999`);
    assert.equal(missingRes.status, 404);
  });

  it("GET /api/search rejects missing, overly long, or invalid characters", async () => {
    const emptyRes = await fetch(`${baseUrl}/api/search`);
    assert.equal(emptyRes.status, 400);

    const xssRes = await fetch(`${baseUrl}/api/search?ingredients=${encodeURIComponent("<script>alert(1)</script>")}`);
    assert.equal(xssRes.status, 400);

    const tooMany = Array.from({ length: 35 }, (_, i) => `item${i}`).join(",");
    const capRes = await fetch(`${baseUrl}/api/search?ingredients=${tooMany}`);
    assert.equal(capRes.status, 400);
  });

  it("returns JSON 404 for unknown /api routes", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /not found/i);
  });
});
