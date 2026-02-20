// js/engine.projections.js
import { monthsBetween } from './core.time.js';
import { effectiveAnnualRate, annualToMonthlyRate } from './engine.rates.js';
import { monthlyPaymentForFV } from './engine.calculator.js';

export function calculateAdvancedSavings(goal, settings) {
  const today = new Date();
  const months = Math.max(1, monthsBetween(today, goal.targetDate, 'ceil'));

  const effAnnual = effectiveAnnualRate(
    (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0),
    !!settings?.computeReal,
    Number(settings?.inflationAnnualPct) || 0
  );
  const r = annualToMonthlyRate(effAnnual);

  const isProgressive   = String(goal.savingsType) === 'progressive';
  const inc             = Math.max(0, Number(goal.monthlyIncrease) || 0);
  const existing        = Math.max(0, Number(goal.existingCapital) || 0);
  const targetFV        = Math.max(0, Number(goal.amount) || 0);

  // מיפוי בונוסים לפי חודש + FV שלהם
  const bonusesByMonth = {};
  let bonusesSum = 0;
  let fvBonuses  = 0;
  for (const b of (goal.bonuses || [])) {
    const m   = Math.max(1, Math.min(months, Number(b?.month) || 1));
    const amt = Math.max(0, Number(b?.amount) || 0);
    if (!amt) continue;
    bonusesSum += amt;
    bonusesByMonth[m] = (bonusesByMonth[m] || 0) + amt;
    fvBonuses += amt * Math.pow(1 + r, months - m);
  }

  // FV של ההון הקיים
  const fvExisting = existing * Math.pow(1 + r, months);

  // פונקציית עזר: FV של תשלומים עבור base p0
  function FV_givenInitial(p0) {
    let fv = 0;
    for (let m = 1; m <= months; m++) {
      const pay = isProgressive ? Math.max(0, p0 + (m - 1) * inc) : p0;
      const rem = months - m;
      fv += pay * Math.pow(1 + r, rem);
    }
    return fv;
  }

  // פתרון ל-PMT קבוע
  function solveFixedPayment(needFromPayments) {
    if (months <= 0) return 0;
    if (Math.abs(r) < 1e-12) return needFromPayments / months;
    const factor = (Math.pow(1 + r, months) - 1) / r;
    return needFromPayments / factor;
  }

  // חישוב basePayment "מדויק ליעד" (ללא עיגול)
  let basePayment;
  if (!isProgressive) {
    // חשוב: מפחיתים גם FV(existing) וגם FV(bonuses) מהיעד
    const needFromPayments = Math.max(0, targetFV - fvExisting - fvBonuses);
    basePayment = solveFixedPayment(needFromPayments);
  } else {
    // Progressive: נפתור ב-binary search כך ש-FV(existing)+FV(bonuses)+FV(p0,inc) == targetFV
    const targetFromPayments = Math.max(0, targetFV - fvExisting - fvBonuses);
    let lo = 0;
    let hi = Math.max(Number(goal.initialAmount) || 0, targetFromPayments / months * 2 + inc * months);
    while (FV_givenInitial(hi) < targetFromPayments) {
      hi *= 2;
      if (hi > targetFV * 10 + 1e6) break;
    }
    basePayment = Math.max(0, Number(goal.initialAmount) || 0);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const fv  = FV_givenInitial(mid);
      if (fv >= targetFromPayments) hi = mid; else lo = mid;
    }
    basePayment = (lo + hi) / 2;
  }

  // סימולציה מלאה (כולל existing+bonuses) עם basePayment המדויק (ללא עיגול)
  let value = fvExisting;    // מתחילים עם FV ההון הקיים לאורך כל התקופה
  let sumPayments = 0;
  for (let m = 1; m <= months; m++) {
    // מודל עקבי: ריבית על היתרה עד סוף החודש
    // ואז הפקדה + בונוס בסוף החודש (לא נושאים ריבית באותו חודש)
    // לשם עקביות עם סגירת-צורה: נריץ קודם ריבית על value הגדול
    // ואז נוסיף את ההפקדה והבונוס
    value *= (1 + r);

    const pay = isProgressive ? Math.max(0, basePayment + (m - 1) * inc) : basePayment;
    sumPayments += pay;
    value += pay + (bonusesByMonth[m] || 0);
  }

  // value אמור להיות ~ targetFV (סטייה קטנה אפשרית מסיבות נומריות)
  return {
    finalAmount: Math.round(value),
    averageMonthlyPayment: sumPayments / months,
    sumPayments,          // ← חשוב ל-KPI
    fvExisting,
    fvBonuses,
    bonusesSum,
    r,
    months
  };
}
