// state.settings.js
import { Bus } from './core.bus.js';

const defaultSettings = {
  computeReal: false,
  inflationAnnualPct: 2.5,
  globalAnnualRate: 0,
  generalMonthlyDeposit: 0,
  monthlyIncome: 0,
  globalSaved: 0,
  ...(window.__BOOT?.settings || {})
};

export const SettingsStore = (() => {
  let settings = { ...defaultSettings };
  return {
    get() { return { ...settings }; },
    set(patch) {
      settings = { ...settings, ...patch };
      Bus.emit('settings:changed', { ...settings });
    },
    clear() {
      settings = { ...defaultSettings };
      Bus.emit('settings:changed', { ...settings });
      return { ...settings };
    }
  };
})();
