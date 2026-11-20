"use strict";

const express = require("express");
const path = require("path");
const { initializeDatabase, getRecipes, getRecipeById } = require("./database");
const { normalizeIngredientList, rankRecipes } = require("../shared/matcher");

const MAX_QUERY_LENGTH = 500;
const MAX_INGREDIENTS = 30;
const ALLOWED_INGREDIENT_REGEX = /^[a-zA-Z0-9\s,\-]+$/;

function createApp(options = {}) {
  const db = options.db || initializeDatabase(options.dbPath, options.recipesPath);
  const ownsDb = !options.db;
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  // Security headers without external dependencies
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  // Structured lightweight request logging
  app.use((req, res, next) => {
    if (process.env.NODE_ENV !== "test") {
      const start = Date.now();
      res.on("finish", () => {
        const ms = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${ms}ms)`);
      });
    }
    next();
  });

  // Serve static frontend & shared matcher module
  app.use(express.static(path.join(__dirname, "../public")));
  app.use("/shared", express.static(path.join(__dirname, "../shared")));

  // Health endpoint
  app.get("/api/health", (req, res) => {
    const count = db.prepare("SELECT COUNT(*) AS count FROM recipes").get().count;
    res.json({
      status: "ok",
      engine: "node:sqlite",
      recipeCount: count,
      timestamp: new Date().toISOString()
    });
  });

  // Get all recipes
  app.get("/api/recipes", (req, res, next) => {
    try {
      const recipes = getRecipes(db);
      res.json({ count: recipes.length, recipes });
    } catch (err) {
      next(err);
    }
  });

  // Get single recipe by ID
  app.get("/api/recipes/:id", (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Recipe ID must be a positive integer." });
      }
      const recipe = getRecipeById(db, id);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found." });
      }
      res.json({ recipe });
    } catch (err) {
      next(err);
    }
  });

  // Search and rank recipes by owned ingredients
  app.get("/api/search", (req, res, next) => {
    try {
      const raw = req.query.ingredients;
      if (typeof raw !== "string" || !raw.trim()) {
        return res.status(400).json({
          error: "Query parameter 'ingredients' is required (e.g., ?ingredients=egg,onion,bread)."
        });
      }

      if (raw.length > MAX_QUERY_LENGTH) {
        return res.status(400).json({
          error: `Query parameter 'ingredients' exceeds maximum length of ${MAX_QUERY_LENGTH} characters.`
        });
      }

      if (!ALLOWED_INGREDIENT_REGEX.test(raw)) {
        return res.status(400).json({
          error: "Invalid characters in 'ingredients'. Only letters, numbers, spaces, hyphens, and commas are allowed."
        });
      }

      const items = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (items.length === 0) {
        return res.status(400).json({ error: "Provide at least one valid ingredient." });
      }

      if (items.length > MAX_INGREDIENTS) {
        return res.status(400).json({
          error: `Too many ingredients. Maximum allowed is ${MAX_INGREDIENTS}.`
        });
      }

      const normalizedOwned = normalizeIngredientList(items);
      const vegetarianOnly = req.query.vegetarian === "true";
      const quickOnly = req.query.quick === "true";

      const allRecipes = getRecipes(db);
      const matches = rankRecipes(allRecipes, normalizedOwned, {
        minScore: 1,
        vegetarianOnly,
        quickOnly
      });

      res.json({
        query: normalizedOwned,
        count: matches.length,
        matches
      });
    } catch (err) {
      next(err);
    }
  });

  // JSON 404 for unknown API endpoints
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Centralized error handler
  app.use((err, req, res, next) => {
    if (process.env.NODE_ENV !== "test") {
      console.error("[Server Error]", err);
    }
    const status = err.status || 500;
    res.status(status).json({
      error: status === 500 ? "Internal server error." : err.message
    });
  });

  app.locals.db = db;
  app.locals.closeDb = () => {
    if (ownsDb && db) {
      try {
        db.close();
      } catch (_) {
        // already closed
      }
    }
  };

  return app;
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`FlavorForge FridgeRescue running at http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`\nReceived ${signal}. Closing HTTP server and SQLite database...`);
    server.close(() => {
      app.locals.closeDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

module.exports = { createApp };
