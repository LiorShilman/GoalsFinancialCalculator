// ui.kpis.js
import { Derived } from '../state.derived.js';
import { Money } from '../core.money.js';

export const UIKPIs = {
  refreshFreeMonthlyDepositBadge() {
    const el = document.getElementById('freeMonthlyDeposit');
    if (el) el.textContent = Money.format(Derived.monthlyUnassigned());
  }
};
