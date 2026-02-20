// ui.moneyInputs.js
import { MoneyInput } from '../core.money.js';

function restoreCaret(el, prevValue, prevStart) {
  const digitsLeftOfCaret = (str, caret) =>
    (str.slice(0, caret).match(/\d/g) || []).length +
    (str.slice(0, caret).includes("-") ? 1 : 0) +
    (str.slice(0, caret).includes(".") ? 1 : 0);

  const targetDigits = digitsLeftOfCaret(prevValue, prevStart);
  const newVal = el.value;

  let seen = 0, pos = 0;
  for (; pos < newVal.length; pos++) {
    const ch = newVal[pos];
    if (/\d/.test(ch) || ch === "-" || ch === ".") seen++;
    if (seen >= targetDigits) { pos++; break; }
  }
  pos = Math.max(0, Math.min(pos, newVal.length));
  try { el.setSelectionRange(pos, pos); } catch (_) {}
}

function attachMoneyFormatter(selector = '[data-format="money"]') {
  document.querySelectorAll(selector).forEach(el => {
    if (el.type !== "text") el.type = "text";

    const reformat = (keepCaret = true) => {
      const prevVal = el.value;
      const prevStart = el.selectionStart ?? prevVal.length;

      let raw = MoneyInput.toRawNumberString(prevVal);
      raw = raw.replace(/(?!^)-/g, "");                 // רק מינוס אחד בתחילה
      const firstDot = raw.indexOf(".");
      if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");

      const formatted = MoneyInput.formatWithCommasPlain(raw);
      if (formatted !== prevVal) {
        el.value = formatted;
        if (keepCaret) restoreCaret(el, prevVal, prevStart);
      }
    };

    el.addEventListener("input", () => reformat(true));
    el.addEventListener("blur", () => {
      const n = MoneyInput.parseNumberLoose(el.value);
      el.value = Number.isFinite(n) ? MoneyInput.formatWithCommasPlain(String(n)) : "";
    });

    if (el.value) reformat(false);
    if (!el.placeholder) el.placeholder = "100,000";
  });
}

export const UIMoneyInputs = { attachMoneyFormatter };
