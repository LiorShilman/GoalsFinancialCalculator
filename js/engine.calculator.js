// js/engine.calculator.js
import { monthsBetween } from './core.time.js';
import { effectiveAnnualRate, annualToMonthlyRate, Rates } from './engine.rates.js';
import { MathEng } from './engine.math.js';

// PMT אחיד לכל ה־UI (מכבד user-fixed אם הוגדר)
export function goalPMT(goal, settings) {
  const mode = String(goal.calculationMode || '').toLowerCase();
  const userFixed = (mode === 'amount_payment' || mode === 'date_payment') && Number(goal.monthlyPayment) > 0;
  if (userFixed) return Math.max(0, Number(goal.monthlyPayment));
  const p = Number(computeGoalDisplayPayment(goal, settings)) || 0;
  return Math.max(0, p);
}

// PMT עבור FV אנואיטי קבוע
export function monthlyPaymentForFV(targetFV, nMonths, annualNominalPct, settings) {
  const eff = effectiveAnnualRate(annualNominalPct, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
  const r = annualToMonthlyRate(eff);
  if (nMonths <= 0) return 0;
  if (r <= 0) return targetFV / nMonths;
  const denom = Math.pow(1 + r, nMonths) - 1;
  if (denom <= 0) return targetFV / nMonths;
  return targetFV * (r / denom);
}

export function futureValueOfPayments(monthlyPayment, nMonths, annualNominalPct, settings) {
  const eff = effectiveAnnualRate(annualNominalPct, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
  const r = annualToMonthlyRate(eff);
  if (nMonths <= 0) return 0;
  if (r <= 0) return monthlyPayment * nMonths;
  return monthlyPayment * ((Math.pow(1 + r, nMonths) - 1) / r);
}

// --- helpers ---
function monthlyRateFromAnnual(annualNominalPct, settings) {
  const a = Number(annualNominalPct) || 0;
  // אם קיימות פונקציות ריביות "רשמיות" במערכת – נשתמש בהן
  if (typeof effectiveAnnualRate === 'function' && typeof annualToMonthlyRate === 'function') {
    const eff = effectiveAnnualRate(a, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
    return annualToMonthlyRate(eff);
  }
  // fallback: המרה שנתית→חודשית כ-Effective
  return Math.pow(1 + a/100, 1/12) - 1;
}

/**
 * כמה תשלום חודשי צריך כדי להגיע ל-Target תוך n חודשים
 * בהינתן הון קיים שמניב ריבית חודשית r.
 * נוסחה: A = E*(1+r)^n + P * ((1+r)^n - 1)/r  ⇒  P = [A - E*(1+r)^n] * r / ((1+r)^n - 1)
 */
export function monthlyPaymentForFVWithExisting(targetAmount, existingCapital, nMonths, annualNominalPct, settings) {
  const A = Math.max(0, Number(targetAmount) || 0);
  const E = Math.max(0, Number(existingCapital) || 0);
  const n = Math.max(0, Number(nMonths) || 0);
  if (n <= 0) return 0;

  const r = monthlyRateFromAnnual(annualNominalPct, settings);

  // ללא ריבית: פשטני
  if (r <= 0) {
    const need = Math.max(0, A - E);
    return need / n;
  }

  const x = Math.pow(1 + r, n);
  const fvExisting = E * x;
  const needFromPayments = Math.max(0, A - fvExisting);
  if (needFromPayments <= 0) return 0;

  const denom = (x - 1) / r; // סגור-צורה ל־Σ (1+r)^{n-m}
  if (denom <= 0) return needFromPayments / n;

  return needFromPayments / denom;
}

/**
 * כמה חודשים נדרשים כדי להגיע ל-Target בהינתן:
 * - הון קיים E
 * - תשלום חודשי קבוע P (בסוף חודש)
 * - ריבית חודשית r שמקורה בריבית שנתית
 *
 * פתרון לוגאריתמי כש-P>0 והריבית>0:
 *   A = E*(1+r)^n + P*((1+r)^n - 1)/r
 *   ⇒ (1+r)^n = (A + P/r) / (E + P/r)
 *   ⇒ n = ln( (A + P/r) / (E + P/r) ) / ln(1+r)
 *
 * כולל טיפולים בשוליים + נפילה לסימולציה איטרטיבית כגיבוי.
 */
export function calculateMonthsNeededWithExistingCapital(targetAmount, monthlyPayment, existingCapital, annualNominalPct, settings) {
  const A = Math.max(0, Number(targetAmount) || 0);
  const P = Math.max(0, Number(monthlyPayment) || 0);
  const E = Math.max(0, Number(existingCapital) || 0);

  if (A <= E) return 0; // כבר הושג

  const r = monthlyRateFromAnnual(annualNominalPct, settings);

  // ללא ריבית:
  if (r <= 0) {
    if (P <= 0) return Infinity; // לא ניתן להגיע
    return Math.max(1, Math.ceil((A - E) / P));
  }

  // ניסיון פתרון אנליטי כש-P>0
  if (P > 0) {
    const pr = P / r;
    const top = A + pr;
    const bot = E + pr;
    if (top > 0 && bot > 0 && top > bot) {
      const n = Math.log(top / bot) / Math.log(1 + r);
      if (Number.isFinite(n) && n > 0) return Math.ceil(n);
    }
  }

  // אם אין תשלום חודשי אבל יש הון קיים וצמיחה
  if (P === 0 && E > 0) {
    const n = Math.log(A / E) / Math.log(1 + r);
    if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  }

  // גיבוי: סימולציה עד תקרה סבירה (למשל 1200 חודשים = 100 שנים)
  let value = E;
  const cap = 1200;
  for (let m = 1; m <= cap; m++) {
    value *= (1 + r); // ריבית על היתרה
    value += P;       // תשלום בסוף-חודש
    if (value + 1e-6 >= A) return m;
  }
  return cap; // לא הושג במסגרת התקרה
}


// תשלום חודשי "נדרש" להצגה
/**
 * מחזיר את סכום ההפקדה החודשית הנדרש כדי להגיע ליעד.
 * תומך:
 * - fixed (תשלום קבוע)
 * - progressive (תשלום בסיס P + עלייה חודשית d)
 * מכבד calculationMode=user-fixed אם הוזן תשלום חודשי ידני.
 * לא מעגל — מחזיר מספר גולמי (שתוכל לעגל בשכבת ה־UI/שמירה).
 */
// תשלום חודשי "נדרש" להצגה (ערך גולמי, ללא עיגול UI)
export function computeGoalDisplayPayment(goal, settings) {
  const today = new Date();
  const n = Math.max(1, monthsBetween(today, goal.targetDate));

  // --- ריבית חודשית אפקטיבית (ריאלי/נומינלי) ---
  const nominalAnnual = (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
  const effAnnual = effectiveAnnualRate(
    nominalAnnual,
    !!settings?.computeReal,
    Number(settings?.inflationAnnualPct) || 0
  );
  const r = annualToMonthlyRate(effAnnual); // (1+eff)^(1/12)-1

  // --- נתוני יעד והון קיים ---
  const FV_target = Math.max(0, Number(goal.amount) || 0);
  const existing0 = Math.max(0, Number(goal.existingCapital) || 0);

  // FV של ההון הקיים עד סוף התקופה
  const FV_existing = existing0 * Math.pow(1 + r, n);

  // FV של בונוסים עד סוף התקופה (בונוס בסוף חודש m -> צובר (n-m) חודשי ריבית)
  let FV_bonuses = 0;
  if (Array.isArray(goal.bonuses)) {
    const buckets = {};
    for (const b of goal.bonuses) {
      const m = Math.floor(Number(b?.month) || 0);
      const amt = Number(b?.amount) || 0;
      if (m >= 1 && m <= n && amt) buckets[m] = (buckets[m] || 0) + amt;
    }
    for (const [mStr, amt] of Object.entries(buckets)) {
      const m = Number(mStr) | 0;
      FV_bonuses += amt * Math.pow(1 + r, n - m);
    }
  }

  // כמה חייב להגיע מתשלומים בלבד
  const FV_from_payments = Math.max(0, FV_target - FV_existing - FV_bonuses);
  if (FV_from_payments <= 0) return 0;

  // אם המשתמש קבע תשלום ידני (calculationMode), מחזירים אותו
  const calcMode = String(goal.calculationMode || '').toLowerCase();
  const userFixed =
    (calcMode === 'date_payment' || calcMode === 'amount_payment') &&
    Number(goal.monthlyPayment) > 0;
  if (userFixed) return Math.max(0, Number(goal.monthlyPayment));

  // עזר לסכום סדרה אחידה (s_n|r)
  const seriesFactor = (rate, periods) => {
    const eps = 1e-12;
    if (Math.abs(rate) < eps) return periods; // גבול r->0: s = n
    return (Math.pow(1 + rate, periods) - 1) / rate;
  };

  // --- מסלול progressive: P בסיס + d עלייה חודשית ---
  if (String(goal.savingsType) === 'progressive') {
    const d = Math.max(0, Number(goal.monthlyIncrease) || 0);
    const s = seriesFactor(r, n); // s_n|r

    // FV לגרדיאנט אריתמטי: FV_grad = d * ((s - n) / r)
    // FV_total = P*s + d*((s - n)/r)  =>  P = (FV - d*((s - n)/r)) / s
    let P;
    const eps = 1e-12;
    if (Math.abs(r) < eps) {
      // ללא ריבית: sum_{t=1..n} (P + (t-1)d) = n*P + d*n(n-1)/2
      P = (FV_from_payments - d * (n * (n - 1) / 2)) / n;
    } else {
      P = (FV_from_payments - d * ((s - n) / r)) / s;
    }

    // אם הוגדר initialAmount – אפשר לכבד אותו כבסיס התחלתי
    if (Number(goal.initialAmount) > 0) return Math.max(0, Number(goal.initialAmount));
    return Math.max(0, P || 0);
  }

  // --- מסלול fixed (תשלום קבוע) ---
  if (r <= 0) {
    return FV_from_payments / n;
  }
  // PMT לרכיב FV של אנואיטי רגילה
  return FV_from_payments * (r / (Math.pow(1 + r, n) - 1));
}


// “צילום מצב” למטרה (משתמש ב-Rates וב- MathEng הקיימים אצלך)
export const Calculator = {
  goalSnapshot(goal, settings) {
    const months = Math.max(1, monthsBetween(new Date(), goal.targetDate));
    const eff = Rates.annualEffective(Number(goal.rateAnnual) || 0, !!settings.computeReal, Number(settings.inflationAnnualPct) || 0);
    const r = Rates.toMonthly(eff);

    const existing = Number(goal.existingCapital) || 0;
    const fvExisting = existing * Math.pow(1 + r, months);

    const bonusesByMonth = {};
    for (const b of (goal.bonuses || [])) {
      const m = Math.floor(Number(b?.month) || 0);
      const amt = Number(b?.amount) || 0;
      if (m >= 1 && m <= months) bonusesByMonth[m] = (bonusesByMonth[m] || 0) + amt;
    }
    const fvBonuses = Object.entries(bonusesByMonth)
      .reduce((s, [m, amt]) => s + amt * Math.pow(1 + r, months - Number(m)), 0);

    const target = Math.max(0, (Number(goal.amount) || 0) - fvExisting - fvBonuses);
    const requiredPayment = MathEng.solvePayment({ targetFV: target, months, r });

    const series = MathEng.FV_series({ pmt: requiredPayment, r, months, initial: fvExisting, bonusesByMonth });
    return { months, r, fvExisting, fvBonuses, requiredPayment, finalAmount: series.final, series: series.progression };
  }
};
