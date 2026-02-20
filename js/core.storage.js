// core.storage.js
const KEY = 'financial-calculator/v1';
export const Storage = {
  load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
  },
  save(state) { localStorage.setItem(KEY, JSON.stringify(state)); },
  migrate(state) {
    // Place for schema migrations when bumping KEY
    return state;
  }
};
