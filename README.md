# Modular Calculator Scaffold

This folder contains an ES-module based refactor scaffold for your financial goals calculator.

## Usage

1. Copy the `js/` folder next to your HTML.
2. In your HTML, include:
   ```html
   <script type="module" src="./js/app.bootstrap.js"></script>
   ```
3. Ensure the page defines or allows `window.__BOOT = { settings: {...}, goals: [...] }` prior to the script tag if you wish to bootstrap from existing state.

## Migration notes

- Put DOM-only code inside `js/ui/*` files.
- Put math/finance logic inside `js/engine.*` files.
- All state (settings/goals) flows through `SettingsStore` and `GoalsStore`.
- Persisting happens centrally in `app.bootstrap.js` after `settings:changed` / `goals:changed` events.
- Add your Chart.js implementation in `ui.chart.js` (kept pure UI).
