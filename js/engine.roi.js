// engine.roi.js
import { monthlyPaymentForFV } from './engine.calculator.js';
import { monthsBetween } from './core.time.js';

export function calculateROI(goal) {
  try {
    const today = new Date();
    const months = Math.max(1, monthsBetween(today, goal.targetDate, 'ceil'));
    if (months <= 0) return 0;

    const effectiveAnnualPercent =
      (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
    const r = Math.pow(1 + (effectiveAnnualPercent / 100), 1 / 12) - 1;

    const existing = Number(goal.existingCapital) || 0;
    const target   = Number(goal.amount) || 0;
    const adjustedTarget = Math.max(0, target - existing);

    // בסיס תשלום (כמו בגרף)
    let basePayment;
    if (goal.savingsType === 'progressive') {
      const pmt0 = monthlyPaymentForFV(adjustedTarget, months, effectiveAnnualPercent);
      basePayment = Number(goal.initialAmount) > 0 ? Number(goal.initialAmount) : pmt0;
    } else {
      basePayment = monthlyPaymentForFV(adjustedTarget, months, effectiveAnnualPercent);
    }
    const monthlyIncrease = Number(goal.monthlyIncrease) || 0;

    // סכום השקעה נומינלי
    let deposits = 0;
    if (goal.savingsType === 'progressive') {
      for (let m = 1; m <= months; m++) deposits += (basePayment + (m - 1) * monthlyIncrease);
    } else {
      deposits = basePayment * months;
    }

    let bonusesSum = 0;
    const bonusesByMonth = {};
    if (Array.isArray(goal.bonuses)) {
      for (const b of goal.bonuses) {
        const mm  = (Number(b.month) | 0);
        const amt = Number(b.amount) || 0;
        if (mm > 0 && mm <= months && amt) {
          bonusesSum += amt;
          bonusesByMonth[mm] = (bonusesByMonth[mm] || 0) + amt;
        }
      }
    }

    const totalInvestment = existing + deposits + bonusesSum;
    if (totalInvestment <= 0) return 0;

    // סימולציה: הפקדה/בונוס בסוף חודש ואז ריבית
    let fv = existing;
    for (let m = 1; m <= months; m++) {
      const pay = goal.savingsType === 'progressive'
        ? (basePayment + (m - 1) * monthlyIncrease)
        : basePayment;
      fv += Math.max(0, pay) + (bonusesByMonth[m] || 0);
      fv *= (1 + r);
    }

    const years = months / 12;
    if (years <= 0) return 0;
    const totalReturn = fv / totalInvestment;
    if (!Number.isFinite(totalReturn) || totalReturn <= 0) return 0;

    const annualCAGR = (Math.pow(totalReturn, 1 / years) - 1) * 100;
    return Number.isFinite(annualCAGR) ? annualCAGR : 0;
  } catch {
    return 0;
  }
}

// סיווג ROI
export function getROIClass(roi) {
  if (roi >= 6) return 'roi-excellent';
  if (roi >= 4) return 'roi-ok';
  if (roi >= 2) return 'roi-weak';
  return 'roi-bad';
}

// עיצוב חוק 72
export function formatRule72(years) {
  if (years === 'N/A') {
    return '<span style="color: var(--text-faded); font-style: italic;">לא רלוונטי</span>';
  }
  const numYears = parseFloat(years);
  let color = '', icon = '';
  if (numYears <= 8)       { color = 'var(--success)'; icon = '<i data-lucide="rocket"></i>'; }
  else if (numYears <= 15) { color = 'var(--warning)'; icon = '<i data-lucide="timer"></i>'; }
  else                     { color = 'var(--danger)';  icon = '<i data-lucide="snail"></i>'; }
  return `<span style="color:${color};font-weight:600;">${icon} ${years} שנים</span>`;
}

// פורמט ROI לתצוגה
export function formatROI(roi, showTooltip = false) {
  const cls = getROIClass(roi);
  const icons = { 'roi-excellent':'<i data-lucide="rocket"></i>', 'roi-ok':'<i data-lucide="trending-up"></i>', 'roi-weak':'<i data-lucide="minus"></i>', 'roi-bad':'<i data-lucide="alert-triangle"></i>' };
  const tips  = {
    'roi-excellent': 'מעולה - השקעה מצוינת לטווח ארוך',
    'roi-ok':        'טוב - תשואה סבירה ובטוחה',
    'roi-weak':      'בינוני - כמעט מכסה אינפלציה',
    'roi-bad':       'חלש - לא עוקב אחרי אינפלציה'
  };
  const icon = icons[cls] || '<i data-lucide="bar-chart-3"></i>';
  const tip  = showTooltip ? ` title="${tips[cls]}"` : '';
  return `<span class="roi-indicator ${cls}"${tip}>${icon} ${roi.toFixed(1)}%</span>`;
}
