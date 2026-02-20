// ui.kpis.freeMonthly.js
import { SettingsStore } from '../state.settings.js';
import { GoalsStore }   from '../state.goals.js';
import { Money }        from '../core.money.js';
import { computeGoalDisplayPayment } from '../engine.calculator.js';

// כמה מתוך ההפקדה החודשית הכללית מוגדר בהגדרות
function getGeneralMonthlyDeposit() {
  const s = SettingsStore.get();
  return Number(s?.generalMonthlyDeposit) || 0;
}

// כמה כבר הוקצה לכל המטרות – לפי מצב התצוגה (נומינלי/ריאלי)
function computeMonthlyAssignedNow() {
  const settings = SettingsStore.get() || {};
  const goals = GoalsStore.list();
  return goals.reduce((sum, g) => {
    const pmt = Number(computeGoalDisplayPayment(g, settings)) || 0;
    return sum + pmt;
  }, 0);
}

// עדכון הטקסט בפאנל
export function updateFreeMonthlyDepositUI() {
  const el = document.getElementById('freeMonthlyDeposit');
  if (!el) return;
  const base     = getGeneralMonthlyDeposit();
  const assigned = computeMonthlyAssignedNow();
  const free     = Math.max(0, base - assigned);
  el.textContent = Money.format(free);
}

// אופציונלי: לחשוף ל־window כי יש מקומות שבודקים כך
if (typeof window !== 'undefined') {
  window.updateFreeMonthlyDepositUI = updateFreeMonthlyDepositUI;
}
