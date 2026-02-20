// state.derived.js
import { SettingsStore } from './state.settings.js';
import { GoalsStore } from './state.goals.js';

export const Derived = {
  monthlyAssigned() {
    return GoalsStore.list().reduce((s, g) => s + (Number(g?.monthlyPayment) || 0), 0);
  },
  monthlyUnassigned() {
    const s = SettingsStore.get();
    return Math.max(0, (s.generalMonthlyDeposit || 0) - Derived.monthlyAssigned());
  }
};
