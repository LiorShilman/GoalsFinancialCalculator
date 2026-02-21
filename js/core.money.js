// core.money.js
export const Money = {
  // המרה למספר (מנקה תווים לא רלוונטיים) – שימושית לחישובים כלליים/Storage
  toNumber(x, d = 0) {
    const v = Number(String(x ?? '').replace(/[^\d.\-]/g, ''));
    return Number.isFinite(v) ? v : d;
  },

  // פורמט להצגה רשמית עם ₪ (ל־UI תצוגתי, לא למסכת קלט חיה)
  format(n) {
    const val = Number(n) || 0;
    const formatted = val.toLocaleString('he-IL', {
      style: 'currency',
      currency: 'ILS',
      maximumFractionDigits: 0
    });
    // LRM (\u200E) ensures minus sign stays on the left in RTL layout
    return val < 0 ? '\u200E' + formatted : formatted;
  }
};

// Namespace נפרד למסכות קלט בשדות כסף
export const MoneyInput = {
	
  // מחרוזת מספר "גולמית" (רק ספרות/מינוס/נקודה)
  toRawNumberString(s = "") {
    return String(s).replace(/[^\d\-\.]/g, "");
  },

  // פרסינג "רופף" – מחזיר NaN אם לא תקין (למשל "-" או ".")
  parseNumberLoose(s = "") {
    const v = MoneyInput.toRawNumberString(s);
    if (v === "" || v === "-" || v === "." || v === "-.") return NaN;
    return Number(v);
  },

  // פורמט עם פסיקים אלפיים בלי ₪ (שומר חלק עשרוני אם הוזן)
  formatWithCommasPlain(s = "") {
    const neg = String(s).trim().startsWith("-");
    const raw = MoneyInput.toRawNumberString(s).replace(/^-/, "");
    if (!raw) return neg ? "-" : "";
    const [intPart, decPart] = raw.split(".");
    const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + (decPart !== undefined ? `${intFmt}.${decPart}` : intFmt);
  }
};

// עטיפה כללית לשימוש ב־UI/Forms
export const MoneyUtil = {
  /**
   * מקבל מספר | מחרוזת | אלמנט קלט DOM ומחזיר מספר נקי.
   * d = ערך ברירת מחדל אם לא ניתן להמיר.
   */
  coerce(x, d = 0) {
    // אם התקבל אלמנט DOM עם value
    if (x && typeof x === 'object' && 'value' in x) x = x.value;
    return Money.toNumber(x, d);
  }
};


