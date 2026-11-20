# FlavorForge — FridgeRescue (v1.2.0)

Zero-waste recipe discovery web app built with **HTML5, CSS3, Vanilla JavaScript, Node.js, Express, and native SQLite (`node:sqlite`)**.

## Features
- **One-Tap Demo & Smart Ingredient Selector:** Categorized kitchen staples plus custom ingredient input with plural/alias normalization (`eggs` → `egg`, `capsicum` → `bell pepper`, `dahi` → `yogurt`).
- **Staple-Aware Match Scoring:** `Match % = (Owned Required Ingredients ÷ Total Required Ingredients) × 100`, automatically excluding assumed staples (`salt`, `oil`, `water`) from the denominator.
- **SQLite Persistence:** Automatically initializes and seeds `data/flavorforge.db` (40 recipes) inside a single SQL transaction on startup with indexed queries and graceful `SIGINT`/`SIGTERM` shutdown.
- **Kitchen-Counter Walkthrough:** Serving scaler (1–6 people) with culinary fraction formatting (`½`, `¼`, `¾`, `⅓`), ingredient substitution hints, `localStorage` bookmarks, and Web Speech step narration.

## Prerequisites & Setup
1. Install **Node.js 22.5+** (required for built-in `node:sqlite` `DatabaseSync` and `node --test`).
2. Extract the project folder and run:
   ```bash
   npm install
   npm start
   ```
3. Open `http://localhost:3000`.

## API Endpoints
- `GET /api/health` — Returns server status, SQLite engine info, and seeded recipe count.
- `GET /api/recipes` — Returns all 40 recipes hydrated from SQLite.
- `GET /api/recipes/:id` — Returns a single recipe by integer ID.
- `GET /api/search?ingredients=egg,onion,bread&vegetarian=true&quick=true` — Validates query parameters and returns ranked matches.

## Run Automated Tests
```bash
npm test
```
Runs unit and HTTP integration tests covering normalization, staple exclusion, fraction scaling, SQLite seeding, input validation, and error handling.
