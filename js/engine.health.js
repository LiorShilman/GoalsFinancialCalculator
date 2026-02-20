// js/engine.health.js
import { monthsBetween } from './core.time.js';
import { computeGoalDisplayPayment } from './engine.calculator.js';

const fmtPct = (x) => `${(x*100).toFixed(1)}%`;

export function validateFinancialHealth(goals = [], settings = {}) {
  const warnings = [];
  if (!Array.isArray(goals) || goals.length === 0) return warnings;

  // 1) עומס חודשי נוכחי (ה"נטל" שהמשתמש ירגיש עכשיו)
  let totalMonthlySavings = 0;
  for (const goal of goals) {
    let perGoalNow = 0;
    try { perGoalNow = Math.max(0, computeGoalDisplayPayment(goal, settings)); }
    catch { perGoalNow = Math.max(0, Number(goal.monthlyPayment) || 0); }
    totalMonthlySavings += perGoalNow;
  }

  // 2) יחס חיסכון להכנסה
  const income = Number(settings?.monthlyIncome) || 0;
  if (income > 0) {
    const ratio = totalMonthlySavings / income;
    if (ratio > 0.5) {
      warnings.push({
        type: 'danger',
        title: 'עומס חיסכון קיצוני',
        message: `החיסכון החודשי (${totalMonthlySavings.toLocaleString('he-IL', {style:'currency', currency:'ILS', maximumFractionDigits:0})}) הוא ${fmtPct(ratio)} מההכנסה.`,
        suggestion: 'זה לא בר-קיימא! הארך מועדי יעד או הקטן סכומי מטרות.',
        severity: 'high'
      });
    } else if (ratio > 0.3) {
      warnings.push({
        type: 'warning',
        title: 'עומס חיסכון גבוה',
        message: `החיסכון החודשי הוא ${fmtPct(ratio)} מההכנסה.`,
        suggestion: 'שקול אם זה בר-קיימא לטווח ארוך. במטרות הדרגתיות העומס יגדל עם הזמן.',
        severity: 'medium'
      });
    }
  }

  // 3) ריבית נמוכה מאינפלציה (נומינלי < אינפלציה)
  const infl = Number(settings?.inflationAnnualPct) || 0;
  for (const goal of goals) {
    const r = Number(goal?.rateAnnual) || 0;
    if (r > 0 && infl > 0 && r < infl) {
      warnings.push({
        type: 'warning',
        title: `ריבית נמוכה מאינפלציה — ${goal.name || 'מטרה'}`,
        message: `ריבית ${r.toFixed(2)}% נמוכה מאינפלציה ${infl.toFixed(2)}%.`,
        suggestion: 'הכסף נשחק ריאלית. שקול אפיק בתשואה גבוהה יותר או מעבר למצב ריאלי.',
        severity: 'medium'
      });
    }
  }

  // 4) מטרות דחופות (<= 6 חודשים)
  const today = new Date();
  for (const goal of goals) {
    const m = Math.max(1, monthsBetween(today, goal.targetDate, 'ceil'));
    if (m <= 6) {
      // לטובת "דחופה" נחשב לינארית (ללא ריבית): סכום שנותר אחרי הון קיים, חלקי חודשים
      const target = Math.max(0, Number(goal.amount) || 0);
      const existing = Math.max(0, Number(goal.existingCapital) || 0);
      const remaining = Math.max(0, target - existing);
      const monthlyNeeded = remaining / m;

      warnings.push({
        type: 'info',
        title: `מטרה דחופה: ${goal.name || 'מטרה'}`,
        message: `נדרש חיסכון של ${(monthlyNeeded).toLocaleString('he-IL', {style:'currency', currency:'ILS', maximumFractionDigits:0})} לחודש למשך ${m} חודשים.`,
        suggestion: 'שקול הארכת מועד היעד אם הסכום גבוה מדי.',
        severity: 'low'
      });
    }
  }

  return warnings;
}
