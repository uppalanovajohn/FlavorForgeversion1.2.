"use strict";

const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_DB_PATH = path.join(__dirname, "../data/flavorforge.db");
const DEFAULT_RECIPES_PATH = path.join(__dirname, "../data/recipes.json");

function initializeDatabase(dbPath = DEFAULT_DB_PATH, recipesPath = DEFAULT_RECIPES_PATH) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '',
      ingredients TEXT NOT NULL,
      quantities TEXT NOT NULL,
      units TEXT NOT NULL,
      servings INTEGER DEFAULT 1,
      time INTEGER DEFAULT 0,
      difficulty TEXT DEFAULT 'Easy',
      vegetarian INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      steps TEXT NOT NULL,
      substitutions TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
    CREATE INDEX IF NOT EXISTS idx_recipes_veg_time ON recipes(vegetarian, time);
  `);

  const count = db.prepare("SELECT COUNT(*) AS count FROM recipes").get().count;

  if (count === 0) {
    const raw = fs.readFileSync(recipesPath, "utf8");
    const recipes = JSON.parse(raw);

    if (!Array.isArray(recipes)) {
      db.close();
      throw new Error("Recipe dataset must be an array.");
    }

    const insert = db.prepare(`
      INSERT INTO recipes (
        id, name, emoji, ingredients, quantities, units,
        servings, time, difficulty, vegetarian,
        description, steps, substitutions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec("BEGIN");
    try {
      for (const r of recipes) {
        insert.run(
          r.id,
          r.name,
          r.emoji ?? "",
          JSON.stringify(r.ingredients ?? []),
          JSON.stringify(r.quantities ?? {}),
          JSON.stringify(r.units ?? {}),
          r.servings ?? 1,
          r.time ?? 0,
          r.difficulty ?? "Easy",
          r.vegetarian ? 1 : 0,
          r.description ?? "",
          JSON.stringify(r.steps ?? []),
          JSON.stringify(r.substitutions ?? {})
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }

  return db;
}

function hydrateRow(row) {
  if (!row) return null;
  return {
    ...row,
    ingredients: JSON.parse(row.ingredients),
    quantities: JSON.parse(row.quantities),
    units: JSON.parse(row.units),
    steps: JSON.parse(row.steps),
    substitutions: JSON.parse(row.substitutions),
    vegetarian: Boolean(row.vegetarian)
  };
}

function getRecipes(db) {
  return db.prepare("SELECT * FROM recipes ORDER BY id ASC").all().map(hydrateRow);
}

function getRecipeById(db, id) {
  const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id);
  return hydrateRow(row);
}

module.exports = {
  initializeDatabase,
  getRecipes,
  getRecipeById
};
