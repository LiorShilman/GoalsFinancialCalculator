// ui.bonusesModal.js
import { UIBonusesEditor } from './ui.bonusesEditor.js';
import { UIMoneyInputs } from './ui.moneyInputs.js';
import { MoneyInput } from '../core.money.js';
import { UIMessages } from './ui.messages.js';

export const UIBonusesModal = (() => {
  let modal, form, amountEl, monthEl, descEl, errEl;

  function open() {
    if (!modal) return;
    if (errEl) errEl.textContent = '';
    if (amountEl) amountEl.value = '';
    if (descEl) descEl.value = '';
    if (monthEl) monthEl.value = '1';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { if (amountEl) amountEl.focus(); }, 0);
  }

  function close() {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function onOverlayClick(e) {
    const t = e.target;
    if (t && t.dataset && t.dataset.close !== undefined) {
      close();
    }
  }

  function onKeydown(e) {
    if (!modal || modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (errEl) errEl.textContent = '';

    const amountStr = amountEl ? String(amountEl.value).trim() : '';
    const monthStr  = monthEl  ? String(monthEl.value).trim()  : '';
    const descStr   = descEl   ? String(descEl.value).trim()   : '';
    const description = descStr || 'בונוס';

    const amount = MoneyInput.parseNumberLoose(amountStr);
    const month  = parseInt(monthStr, 10);

    if (!Number.isFinite(amount) || amount <= 0) {
      if (errEl) errEl.textContent = 'אנא הזן סכום חוקי (גדול מ־0).';
      if (amountEl) amountEl.focus();
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 120) {
      if (errEl) errEl.textContent = 'מספר חודש חייב להיות בין 1 ל־120.';
      if (monthEl) monthEl.focus();
      return;
    }

    // במקום window.temporaryBonuses.push(...)
    UIBonusesEditor.add({ month, amount, description });
    UIMessages.show({ type: 'info', title: 'מידע', message: 'בונוס נוסף' });

    // אין צורך לקרוא render ידנית — ה־Bus יפעיל את הרענון דרך ui:bonuses:changed
    close();
  }

  function init() {
    modal    = document.getElementById('bonusModal');
    form     = document.getElementById('bonusForm');
    errEl    = document.getElementById('bonusError');
    amountEl = document.getElementById('bonusAmountInput');
    monthEl  = document.getElementById('bonusMonthInput');
    descEl   = document.getElementById('bonusDescInput');

    if (!modal || !form) return;

    // מסכת כסף לשדה הסכום במודאל
    UIMoneyInputs.attachMoneyFormatter('#bonusAmountInput');

    modal.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
    form.addEventListener('submit', onSubmit);
  }

  return { init, open, close };
})();
