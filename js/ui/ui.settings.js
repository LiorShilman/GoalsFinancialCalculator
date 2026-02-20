// ui.settings.js
import { SettingsStore } from '../state.settings.js';
import { GoalsStore }    from '../state.goals.js';
import { Bus }           from '../core.bus.js';
import { Money, MoneyInput } from '../core.money.js';

export const UISettings = {
  mounted: false,

  mount() {
    if (this.mounted) return;
    this.cache();
    this.bind();
    this.render();                 // רענון ראשוני מה־Store
    // כמו עם המטרות: כל שינוי בהגדרות → לרנדר מחדש
    Bus.on('settings:changed', () => {
      this.render();
      if (typeof window.updateDisplay === 'function') window.updateDisplay();
    });
    // ואם מטרות משתנות, נרענן אינדיקציות תלויות (למשל הפקדה פנויה)
    Bus.on('goals:changed', () => {
      if (typeof window.updateFreeMonthlyDepositUI === 'function') window.updateFreeMonthlyDepositUI();
    });
    this.mounted = true;
  },

  cache() {
    this.els = {
      inflationPct:           document.getElementById('inflationPct'),           // ← UI id
      globalAnnualRate:       document.getElementById('globalAnnualRate'),
      generalMonthlyDeposit:  document.getElementById('generalMonthlyDeposit'),
      monthlyIncome:          document.getElementById('monthlyIncome'),
      globalSaved:            document.getElementById('globalSaved'),
      computeReal:            document.getElementById('computeReal'),
    };
  },

  // עוזר לפורמט מספרים עם פסיקים בלי ₪
  fmtPlain(n) {
    try { return MoneyInput.formatWithCommasPlain(String(n ?? '')); }
    catch { return String(n ?? ''); }
  },
  parseMoneyInput(el) {
    return Money.toNumber(el?.value);
  },

  render() {
    const s = SettingsStore.get();
    const E = this.els;

    if (E.inflationPct)          E.inflationPct.value          = (s.inflationAnnualPct ?? 0);
    if (E.globalAnnualRate)      E.globalAnnualRate.value      = (s.globalAnnualRate ?? 0);
    if (E.generalMonthlyDeposit) E.generalMonthlyDeposit.value = this.fmtPlain(s.generalMonthlyDeposit ?? '');
    if (E.monthlyIncome)         E.monthlyIncome.value         = this.fmtPlain(s.monthlyIncome ?? '');
    if (E.globalSaved)           E.globalSaved.value           = this.fmtPlain(s.globalSaved ?? '');
    if (E.computeReal)           E.computeReal.checked         = !!s.computeReal;

    // אם יש לך באדג' של "הפקדה פנויה" – תרענן אותו כאן
    if (typeof window.updateFreeMonthlyDepositUI === 'function') window.updateFreeMonthlyDepositUI();
  },

  bind() {
    const E = this.els;
    if (this.bound) return;

    // שדות מספריים פשוטים
    E.inflationPct?.addEventListener('change', () => {
      SettingsStore.set({ inflationAnnualPct: Number(E.inflationPct.value) || 0 });
    });
    E.globalAnnualRate?.addEventListener('change', () => {
      SettingsStore.set({ globalAnnualRate: Number(E.globalAnnualRate.value) || 0 });
    });
    E.computeReal?.addEventListener('change', () => {
      SettingsStore.set({ computeReal: !!E.computeReal.checked });
    });

    // שדות כסף (עם פסיקים, בלי ₪) – נשמור מספר נקי ל־Store, ונחזיר תצוגה מעוצבת
    const moneyHandlers = (inputEl, key) => {
      if (!inputEl) return;
      inputEl.addEventListener('blur', () => {
        const v = this.parseMoneyInput(inputEl);
        SettingsStore.set({ [key]: v || 0 });
        inputEl.value = this.fmtPlain(v || 0);
      });
      // אופציונלי: תוך כדי הקלדה מנקים תווים זרים
      inputEl.addEventListener('input', () => {
        // לא נעדכן Store בכל הקשה – רק מנקים תווים להצגה חלקה
        const caret = inputEl.selectionStart;
        inputEl.value = MoneyInput.formatWithCommasPlain(inputEl.value);
        try { inputEl.setSelectionRange(caret, caret); } catch {}
      });
    };

    moneyHandlers(E.generalMonthlyDeposit, 'generalMonthlyDeposit');
    moneyHandlers(E.monthlyIncome,         'monthlyIncome');
    moneyHandlers(E.globalSaved,           'globalSaved');

    this.bound = true;
  }
};
