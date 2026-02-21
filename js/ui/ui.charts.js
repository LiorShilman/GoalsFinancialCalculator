// ui.charts.js
import { GoalsStore }           from '../state.goals.js';
import { SettingsStore }        from '../state.settings.js';
import { monthsBetween }        from '../core.time.js';
import { Bus }                  from '../core.bus.js';
import { Money }                from '../core.money.js';
import { computeGoalDisplayPayment,goalPMT } from '../engine.calculator.js';
import { effectiveAnnualRate, annualToMonthlyRate } from '../engine.rates.js';

// ===== עזרי פורמט וצבעים =====
const formatCurrency = (n) => Money.format(n);
const PALETTE = [
  '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
  '#14b8a6', '#22c55e', '#f97316', '#a855f7', '#f43f5e',
  '#3b82f6', '#6366f1', '#84cc16', '#eab308', '#d946ef',
  '#0ea5e9', '#65a30d', '#dc2626', '#facc15', '#9333ea',
  '#0891b2', '#15803d', '#b91c1c', '#fb923c', '#7c3aed',
  '#1d4ed8', '#4ade80', '#ea580c', '#2563eb', '#be123c'
];

// ===== רישום תוספים (Zoom / Annotation) אם קיימים =====
function ensureChartPluginsRegistered() {
  if (!window.Chart || !window.Chart.register) return;

  // Zoom
  if (!ensureChartPluginsRegistered._zoom && window.ChartZoom) {
    try { window.Chart.register(window.ChartZoom); ensureChartPluginsRegistered._zoom = true; } catch {}
  }
  // Annotation – נסיונות שמות שונים
  if (!ensureChartPluginsRegistered._annot) {
    const cand = window['chartjs-plugin-annotation'] || window.ChartAnnotation || window['ChartAnnotation'] || window['chartjsPluginAnnotation'];
    if (cand) {
      try { window.Chart.register(cand); ensureChartPluginsRegistered._annot = true; } catch {}
    }
  }
}

// ===== בניית סדרת מטרה (מצטברת) =====
function buildGoalSeries(goal, settings, today, totalMonths) {
  const monthsToGoal = Math.max(1, monthsBetween(today, goal.targetDate));

  // ריביות – אפקטיבי שנתי → חודשי (ריאלי/נומינלי לפי settings)
  const baseAnnual = (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
  const effMid     = effectiveAnnualRate(baseAnnual, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
  const effLow     = effectiveAnnualRate(Math.max(0, baseAnnual - 2), !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
  const effHigh    = effectiveAnnualRate(baseAnnual + 2, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
  const rMid       = annualToMonthlyRate(effMid);
  const rLow       = annualToMonthlyRate(effLow);
  const rHigh      = annualToMonthlyRate(effHigh);

  // PMT אחיד (מחשב גם progressive בסיס P)
  const basePayment     = goalPMT(goal, settings);
  const monthlyIncrease = (String(goal.savingsType) === 'progressive') ? Math.max(0, Number(goal.monthlyIncrease) || 0) : 0;

  // בונוסים לחודשים
  const bonusesByMonth = {};
  if (Array.isArray(goal.bonuses)) {
    for (const b of goal.bonuses) {
      const m = Math.floor(Number(b?.month) || 0);
      const amt = Number(b?.amount) || 0;
      if (m >= 1 && m <= monthsToGoal && amt) {
        bonusesByMonth[m] = (bonusesByMonth[m] || 0) + amt;
      }
    }
  }

  const existing = Math.max(0, Number(goal.existingCapital) || 0);
  const goalAmount = Math.max(0, Number(goal.amount) || 0);

  const dataCapped      = [];
  const dataUncapped    = [];
  const dataPessimistic = [];
  const dataOptimistic  = [];

  // סימולציה קדימה
  let vMid = existing;
  let vLow = existing;
  let vHigh = existing;

  for (let m = 0; m <= totalMonths; m++) {
    if (m === 0) {
      dataCapped.push(existing);
      dataUncapped.push(existing);
      dataPessimistic.push(existing);
      dataOptimistic.push(existing);
      continue;
    }

    if (m <= monthsToGoal) {
      // ריבית
      vMid  *= (1 + rMid);
      vLow  *= (1 + rLow);
      vHigh *= (1 + rHigh);

      // תשלום חודשי
      const pay = (String(goal.savingsType) === 'progressive')
        ? (basePayment + (m - 1) * monthlyIncrease)
        : basePayment;
      const p = Math.max(0, pay);

      vMid  += p;
      vLow  += p;
      vHigh += p;

      // בונוס
      const b = bonusesByMonth[m] || 0;
      if (b) { vMid += b; vLow += b; vHigh += b; }
    } else {
      // אחרי סוף תקופת המטרה – רק צמיחה של מה שנשאר (בלי עוד הפקדות)
      vMid  *= (1 + rMid);
      vLow  *= (1 + rLow);
      vHigh *= (1 + rHigh);
    }

    const uncapped = Math.max(0, vMid);
    const capped   = Math.min(uncapped, goalAmount);

    dataUncapped.push(uncapped);
    dataCapped.push(m <= monthsToGoal ? capped : null);
    dataPessimistic.push(m <= monthsToGoal ? Math.max(0, vLow)  : null);
    dataOptimistic.push (m <= monthsToGoal ? Math.max(0, vHigh) : null);
  }

  // חיפוש רגע השגת יעד ב־uncapped
  let hitIndexOnChart = -1;
  const eps = 1e-6;
  for (let i = 0; i < dataUncapped.length; i++) {
    const v = Number(dataUncapped[i]);
    if (Number.isFinite(v) && v + eps >= goalAmount) { hitIndexOnChart = i; break; }
  }

  return {
    name: goal.name,
    monthsToGoal,
    pmtBase: basePayment,
    monthlyIncrease,
    dataCapped,
    dataUncapped,
    safetyZones: { pessimistic: dataPessimistic, optimistic: dataOptimistic },
    hitIndexOnChart
  };
}

// ===== ציור בפועל =====
let savingsChart = null;
function drawChart(labels, datasets, options, annotationsObj) {
  const canvas = document.getElementById('savingsChart');
  if (!canvas) return;

  if (window.Chart?.getChart) {
    const prev = window.Chart.getChart(canvas) || window.Chart.getChart('savingsChart');
    if (prev?.destroy) prev.destroy();
  }
  const ctx = canvas.getContext('2d');

  if (options?.plugins) {
    options.plugins.annotation = { annotations: annotationsObj || {} };
  }

  savingsChart = new Chart(ctx, { type: 'line', data: { labels, datasets }, options });
}

// ===== אופציות + Tooltip =====
function getChartOptions(labels, totalMonths, goalSeries, goals, totalsCtx) {
  // totalsCtx: { totalWithRateRaw, baselineNoRate }
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: {
          color: '#cbd5e1',
          font: { size: 11 },
          callback: (val, idx) => {
            if (idx === 0) return 'התחלה';
            if (idx === totalMonths) return 'סיום';
            if (idx % 6 === 0) {
              const d = new Date();
              d.setMonth(d.getMonth() + idx);
              return d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
            }
            return '';
          }
        },
        grid: { color: 'rgba(255,255,255,0.08)', drawBorder: false }
      },
      y: {
        ticks: {
          color: '#cbd5e1',
          font: { size: 11 },
          callback: (value) => {
            if (value >= 1_000_000) return '₪' + (value / 1_000_000).toFixed(1) + 'M';
            if (value >= 1_000)    return '₪' + (value / 1_000).toFixed(0) + 'K';
            return formatCurrency(value);
          }
        },
        grid: { color: 'rgba(255,255,255,0.08)', drawBorder: false }
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e2e8f0',
          font: { size: 13, weight: '600', family: 'Inter, system-ui, sans-serif' },
          filter: (item) => !item.text.includes('אזור בטחון')
            && !item.text.includes('תרחיש פסימי')
            && !item.text.includes('תרחיש אופטימי'),
          usePointStyle: true,
          pointStyle: 'line'
        }
      },
      annotation: {},
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(20, 20, 25, 0.95)',
        titleColor: '#ffffff',
        bodyColor: '#e2e8f0',
        borderColor: 'rgba(6, 182, 212, 0.6)',
        borderWidth: 1,
        cornerRadius: 12,
        callbacks: {
          label: (ctx) => {
            const name = ctx.dataset.label || '';
            if (name.includes('אזור בטחון') || name.includes('תרחיש')) return null;

            // סדרת מטרה
            const gi = goalSeries.findIndex(s => s.name === name);
            if (gi !== -1) {
              const s = goalSeries[gi];
              const i = ctx.dataIndex;
              const goalAmt = Math.round(Number(goals[gi]?.amount) || 0);

              const uncapped = Math.round((s.dataUncapped?.[i] ?? 0));
              const capped   = Math.round((s.dataCapped?.[i] ?? 0));
              const over     = Math.max(0, uncapped - goalAmt);

              const eps = 0.5;
              const showActual = Math.abs(uncapped - capped) > eps;

              const hitIdx = (typeof s.hitIndexOnChart === 'number') ? s.hitIndexOnChart : -1;
              const showHit = (hitIdx >= 0 && hitIdx < s.monthsToGoal);
              const hitText = (showHit && labels?.[hitIdx]) ? `היעד הושג: ${labels[hitIdx]}` : null;

              const lines = [`${name}: ${formatCurrency(capped)}`];
              if (showActual) {
                lines.push(`נצטבר בפועל: ${formatCurrency(uncapped)}${over > 0 ? ` (עודף: ${formatCurrency(over)})` : ''}`);
              }
              if (hitText) lines.push(hitText);
              return lines;
            }

            // ברירת־מחדל: סדרות כלליות
            const value = ctx.parsed?.y || 0;
            const formatted = formatCurrency(value);
            if (name.includes('רווח מריבית')) {
              const totalAtPoint = totalsCtx?.totalWithRateRaw?.[ctx.dataIndex] || 0;
              const pct = totalAtPoint > 0 ? ((value / totalAtPoint) * 100).toFixed(1) : '0.0';
              return `${name}: ${formatted} (${pct}% מתוך הסך בפועל)`;
            }
            return `${name}: ${formatted}`;
          },
          afterBody: (items) => {
            if (!items.length) return [];
            const i = items[0].dataIndex;

            if (i === totalMonths) {
              // נקודת סיום – מציג אינפו קצר לסיכום
              const tot = totalsCtx?.totalWithRateRaw?.[i] || 0;
              const base = totalsCtx?.baselineNoRate?.[i] || 0;
              const diff = tot - base;
              return [
                'סוף התוכנית',
                `סך בפועל: ${formatCurrency(tot)}`,
                `סך ללא ריבית: ${formatCurrency(base)}`,
                `${diff >= 0 ? 'תוספת מצטברת מריבית' : 'פער שלילי'}: ${formatCurrency(Math.abs(diff))}`
              ];
            }

            // זמן מההתחלה
            const years = Math.floor(i / 12), months = i % 12;
            let t = '';
            if (years > 0) t = `${years} שנים${months ? ` ו-${months} חודשים` : ''}`;
            else if (months > 0) t = `${months} חודשים`;
            return t ? [`זמן מההתחלה: ${t}`] : [];
          }
        }
      }
    },
    interaction: { mode: 'index', intersect: false, includeInvisible: false },
    animation: { duration: 1200, easing: 'easeInOutCubic' },
    elements: { point: { hoverBorderWidth: 3 }, line: { borderCapStyle: 'round', borderJoinStyle: 'round' } }
  };
}

// ===== ה־API הציבורי =====
export const UICharts = {
  _pluginsRegistered: false,

  init() {
    ensureChartPluginsRegistered();
    this._pluginsRegistered = true;
  },

  update() {
    const chartSection = document.getElementById('chartSection');
    const canvas = document.getElementById('savingsChart');
    if (!chartSection || !canvas) return;

    const goals    = GoalsStore.list() || [];
    const settings = SettingsStore.get() || {};
    const today    = new Date();

    // ===== אין מטרות =====
    if (!Array.isArray(goals) || goals.length === 0) {
      chartSection.style.display = 'block';
      ensureChartPluginsRegistered();

      const horizonYears = Number(settings?.horizonYears) > 0 ? Number(settings.horizonYears) : 30;
      const totalMonths  = horizonYears * 12;

      const labels = Array.from({ length: totalMonths + 1 }, (_, m) => {
        if (m === 0) return 'התחלה';
        const d = new Date();
        d.setMonth(d.getMonth() + m);
        return d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
      });

      const g0 = Math.max(0, Number(settings?.globalSaved) || 0);
      const eff = effectiveAnnualRate(Number(settings?.globalAnnualRate) || 0, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
      const rMonthly = annualToMonthlyRate(eff);

      const baseDeposit =
        (Number(settings?.generalMonthlyDeposit) || 0) ||
        (typeof window.toNumber === 'function'
          ? window.toNumber(document.getElementById('generalMonthlyDeposit')?.value, 0)
          : Number(String(document.getElementById('generalMonthlyDeposit')?.value ?? '').replace(/[^\d.-]/g, '')) || 0);

      const monthlyUnassigned = Math.max(0, baseDeposit);

      const totalSeries    = [];
      const baselineNoRate = [];
      const interestSeries = [];

      let bal = g0, baseline = g0, cumInterest = 0;

      for (let k = 0; k <= totalMonths; k++) {
        if (k > 0) {
          const prev = bal;
          bal      = bal * (1 + rMonthly) + monthlyUnassigned;
          baseline = baseline + monthlyUnassigned;

          const delta = bal - prev;
          const interestThisMonth = Math.max(0, delta - monthlyUnassigned);
          cumInterest += interestThisMonth;
        }
        totalSeries.push(Math.round(bal));
        baselineNoRate.push(Math.round(baseline));
        interestSeries.push(Math.round(cumInterest));
      }

      const datasets = [
        {
          label: `סך הכל עם ריבית (${settings?.computeReal ? 'ריאלי' : 'נומינלי'}, ${horizonYears}y)`,
          data: totalSeries,
          borderColor: '#38bdf8',
          backgroundColor: 'transparent',
          borderWidth: 4,
          borderDash: [10, 6],
          pointRadius: 0,
          tension: 0.25,
          fill: false
        },
        {
          label: 'חיסכון ללא ריבית (בסיס)',
          data: baselineNoRate,
          borderColor: '#94a3b8',
          backgroundColor: 'transparent',
          borderWidth: 3,
          borderDash: [5, 5],
          pointRadius: 0,
          tension: 0.15,
          fill: false
        },
        {
          label: 'רווח מריבית מצטבר',
          data: interestSeries,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.08)',
          borderWidth: 3,
          borderDash: [4, 3],
          pointRadius: 0,
          tension: 0.2,
          fill: 'origin'
        }
      ];

      const options = getChartOptions(labels, totalMonths, [], [], { totalWithRateRaw: totalSeries, baselineNoRate });
      drawChart(labels, datasets, options, {});
      return;
    }

    // ===== יש מטרות =====
    chartSection.style.display = 'block';
    ensureChartPluginsRegistered();

    const totalMonths = Math.max(...goals.map(g => Math.max(1, monthsBetween(today, g.targetDate))));
    if (!Number.isFinite(totalMonths) || totalMonths <= 0) return;

    const labels = Array.from({ length: totalMonths + 1 }, (_, i) => {
      if (i === 0) return 'התחלה';
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      return d.toLocaleDateString('he-IL', { month: 'short', year: '2-digit' });
    });

    // סדרות לכל מטרה
    const goalSeries = goals.map((g) => buildGoalSeries(g, settings, today, totalMonths));

    // === globalSaved נטו / ברוטו + baselineStart ===
    const allocatedToGoals = goals.reduce((s, g) => s + (Number(g.existingCapital) || 0), 0);
    const g0Gross = Math.max(0, Number(settings?.globalSaved) || 0);
    const g0Net   = Math.max(0, g0Gross - allocatedToGoals);

    // GlobalSeries צומח רק על מה שבאמת נשאר כחיסכון כללי
    const effG = effectiveAnnualRate(Number(settings?.globalAnnualRate) || 0, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
    const rG   = annualToMonthlyRate(effG);
    const globalSeries = Array.from({ length: totalMonths + 1 }, (_, k) => Math.round(g0Net * Math.pow(1 + rG, k)));

    // הפקדות כלליות שלא הוקצו (Unassigned)
    const baseGeneralMonthlyDeposit =
      (Number(settings?.generalMonthlyDeposit) || 0) ||
      (typeof window.toNumber === 'function'
        ? window.toNumber(document.getElementById('generalMonthlyDeposit')?.value, 0)
        : Number(String(document.getElementById('generalMonthlyDeposit')?.value ?? '').replace(/[^\d.-]/g, '')) || 0);

    const flows = goals.map((g) => {
      const pmtBase = goalPMT(g, settings); // PMT/בסיס P ל־progressive
      return {
        monthsToGoal: Math.max(1, monthsBetween(today, g.targetDate)),
        type: String(g.savingsType),
        base: (String(g.savingsType) === 'progressive') ? pmtBase : 0,
        inc:  (String(g.savingsType) === 'progressive') ? Math.max(0, Number(g.monthlyIncrease) || 0) : 0,
        pmt:  (String(g.savingsType) === 'progressive') ? null : pmtBase
      };
    });

    const unassignedSeries = (() => {
      const arr = [];
      let bal = 0;
      for (let k = 0; k <= totalMonths; k++) {
        let sumGoalsThisMonth = 0;
        if (k > 0) {
          for (const f of flows) {
            if (k <= f.monthsToGoal) {
              sumGoalsThisMonth += (f.type === 'progressive')
                ? Math.max(0, f.base + (k - 1) * f.inc)
                : Math.max(0, f.pmt || 0);
            }
          }
        }
        const monthlyUnassigned = Math.max(0, baseGeneralMonthlyDeposit - sumGoalsThisMonth);
        if (k > 0) bal = bal * (1 + rG) + monthlyUnassigned;
        arr.push(Math.round(bal));
      }
      return arr;
    })();

    // === סכימות גלובליות + Baseline (ללא ריבית) ===
    const totalWithRateRaw = [];
    const totalPessimistic = [];
    const totalOptimistic  = [];
    const baselineNoRate   = [];
    const interestBenefit  = [];

    let withdrawalsRunningNoRate    = 0;
    let withdrawalsRunningWithRate  = 0;
    let prevTotal                   = g0Net + allocatedToGoals; // נקודת פתיחה בפועל (ללא ספירה כפולה)
    let cumulativeInterest          = 0;

    for (let month = 0; month <= totalMonths; month++) {
      let sumRaw = 0, sumDisp = 0, sumPess = 0, sumOpt = 0;
      let monthWithdrawalsWithRate = 0;
      let monthWithdrawalsNoRate   = 0;
      let monthlyDeposits          = 0;
      let depositsSoFar            = 0;

      for (let gi = 0; gi < goalSeries.length; gi++) {
        const s    = goalSeries[gi];
        const goal = goals[gi];
        const goalAmount = Math.max(0, Number(goal.amount) || 0);
        const isFinalGoal = (s.monthsToGoal === totalMonths);
        const k = Math.min(month, s.monthsToGoal);

        // הפקדות עד k (ל־baseline)
        if (k > 0) {
          let goalDeposits = 0;
          if (String(goal.savingsType) === 'progressive') {
            const baseP = s.pmtBase || 0;
            const inc   = s.monthlyIncrease || 0;
            for (let m = 1; m <= k; m++) goalDeposits += (baseP + (m - 1) * inc);
          } else {
            goalDeposits += (s.pmtBase || 0) * k;
          }
          if (Array.isArray(goal.bonuses)) {
            for (const b of goal.bonuses) {
              const mm = (Number(b.month) | 0);
              if (mm > 0 && mm <= k) goalDeposits += Number(b.amount) || 0;
            }
          }
          depositsSoFar += goalDeposits;

          // הפקדת החודש (לריבית מצטברת)
          if (month > 0 && month <= s.monthsToGoal) {
            if (String(goal.savingsType) === 'progressive') {
              monthlyDeposits += (s.pmtBase || 0) + (month - 1) * (s.monthlyIncrease || 0);
            } else {
              monthlyDeposits += (s.pmtBase || 0);
            }
            if (Array.isArray(goal.bonuses)) {
              for (const b of goal.bonuses) {
                const mm = (Number(b.month) | 0);
                if (mm === month) monthlyDeposits += Number(b.amount) || 0;
              }
            }
          }
        }

        if (month < s.monthsToGoal) {
          sumRaw  += s.dataUncapped[month] || 0;
          sumDisp += s.dataCapped[month] || 0;
          sumPess += s.safetyZones.pessimistic[month] || 0;
          sumOpt  += s.safetyZones.optimistic[month]  || 0;

        } else if (month === s.monthsToGoal) {
          const finalUncapped = s.dataUncapped[month] || s.dataUncapped[s.monthsToGoal] || 0;

          if (isFinalGoal) {
            sumRaw  += finalUncapped;
            sumDisp += Math.min(finalUncapped, goalAmount);
            sumPess += s.safetyZones.pessimistic[s.monthsToGoal] || 0;
            sumOpt  += s.safetyZones.optimistic[s.monthsToGoal]  || 0;
          } else {
            const withdrawal = Math.min(goalAmount, finalUncapped);
            const remain     = Math.max(0, finalUncapped - withdrawal);

            sumRaw  += remain;
            sumDisp += remain;

            const pessRemain = Math.max(0, (s.safetyZones.pessimistic[s.monthsToGoal] || 0) - withdrawal);
            const optRemain  = Math.max(0, (s.safetyZones.optimistic[s.monthsToGoal]  || 0) - withdrawal);
            sumPess += pessRemain;
            sumOpt  += optRemain;

            monthWithdrawalsWithRate += withdrawal;
            monthWithdrawalsNoRate   += withdrawal;
          }

        } else {
          // אחרי סיום המטרה: צמיחת יתרה
          if (!isFinalGoal && month > s.monthsToGoal) {
            const monthsAfterGoal = month - s.monthsToGoal;

            const eff0  = effectiveAnnualRate((Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0), !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
            const effLo = effectiveAnnualRate(Math.max(0, (Number(goal.rateAnnual) || 0) - 2), !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
            const effHi = effectiveAnnualRate((Number(goal.rateAnnual) || 0) + 2,           !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
            const r0  = annualToMonthlyRate(eff0);
            const rLo = annualToMonthlyRate(effLo);
            const rHi = annualToMonthlyRate(effHi);

            const baseRemainReal = Math.max(0, (s.dataUncapped[s.monthsToGoal] || 0) - goalAmount);
            const baseRemainPess = Math.max(0, (s.safetyZones.pessimistic[s.monthsToGoal] || 0) - goalAmount);
            const baseRemainOpt  = Math.max(0, (s.safetyZones.optimistic[s.monthsToGoal]  || 0) - goalAmount);

            if (baseRemainReal > 0 || baseRemainPess > 0 || baseRemainOpt > 0) {
              sumRaw  += baseRemainReal * Math.pow(1 + r0,  monthsAfterGoal);
              sumDisp += baseRemainReal * Math.pow(1 + r0,  monthsAfterGoal);
              sumPess += baseRemainPess * Math.pow(1 + rLo, monthsAfterGoal);
              sumOpt  += baseRemainOpt  * Math.pow(1 + rHi, monthsAfterGoal);
            }
          }
        }
      } // end goals loop

      withdrawalsRunningWithRate += monthWithdrawalsWithRate;
      withdrawalsRunningNoRate   += monthWithdrawalsNoRate;

      // הוספת חיסכון כללי נטו + לא-מוקצה
      sumRaw  += globalSeries[month];
      sumDisp += globalSeries[month];
      sumPess += globalSeries[month];
      sumOpt  += globalSeries[month];

      sumRaw  += unassignedSeries[month];
      sumDisp += unassignedSeries[month];
      sumPess += unassignedSeries[month];
      sumOpt  += unassignedSeries[month];

      // ריבית מצטברת (הפרש תנועה פחות תזרים נטו)
      const currentTotal = sumRaw;
      if (month > 0) {
        const totalChange = currentTotal - prevTotal;
        const netFlow = monthlyDeposits - monthWithdrawalsWithRate;
        const interestThisMonth = totalChange - netFlow;
        cumulativeInterest += Math.max(0, interestThisMonth);
      }
      prevTotal = currentTotal;

      totalWithRateRaw.push(Math.round(sumRaw));
      totalPessimistic.push(Math.round(sumPess));
      totalOptimistic.push(Math.round(sumOpt));

      // Baseline (ללא ריבית): מתחיל ב-(g0Net + allocated) = g0Gross, מוסיף הפקדות, ומחסיר משיכות יעד
      const baselineNow = (g0Net + allocatedToGoals) + depositsSoFar - withdrawalsRunningNoRate;
      baselineNoRate.push(Math.round(Math.max(0, baselineNow)));

      interestBenefit.push(Math.round(cumulativeInterest));
    }

    // === בניית datasets ===
    const datasets = [];

    // מטרות
    goalSeries.forEach((s, i) => {
      const color = PALETTE[i % PALETTE.length];

      datasets.push({
        label: `${s.name} - אזור בטחון`,
        data: s.safetyZones.pessimistic,
        backgroundColor: color + '15',
        borderColor: 'transparent',
        borderWidth: 0,
        fill: '+1',
        pointRadius: 0,
        tension: 0.3,
        spanGaps: false,
        type: 'line'
      });

      datasets.push({
        label: `${s.name} - תרחיש אופטימי`,
        data: s.safetyZones.optimistic,
        backgroundColor: 'transparent',
        borderColor: color + '60',
        borderWidth: 1,
        borderDash: [8, 4],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        spanGaps: false,
        type: 'line'
      });

      datasets.push({
        label: `${s.name} - תרחיש פסימי`,
        data: s.safetyZones.pessimistic,
        borderColor: color + '60',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderDash: [4, 8],
        pointRadius: 0,
        tension: 0.3,
        fill: false,
        spanGaps: false,
        type: 'line'
      });

      datasets.push({
        label: s.name,
        data: s.dataCapped,
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 4,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 6,
        fill: false,
        spanGaps: false,
        type: 'line'
      });
    });

    // קווים כלליים
    datasets.push({
      label: 'חיסכון כללי (עם ריבית גלובלית)',
      data: globalSeries,
      borderColor: '#38bdf8',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [6, 6],
      pointRadius: 0,
      tension: 0.2,
      fill: false,
      type: 'line'
    });

    datasets.push({
      label: 'חיסכון כללי (לא מוקצה)',
      data: unassignedSeries,
      borderDash: [6, 4],
      borderWidth: 2,
      tension: 0.2,
      pointRadius: 0,
      borderColor: '#94a3b8',
      backgroundColor: 'transparent',
      fill: false,
      type: 'line'
    });

    datasets.push({
      label: 'חיסכון ללא ריבית (בסיס)',
      data: baselineNoRate,
      borderColor: '#94a3b8',
      backgroundColor: 'transparent',
      borderWidth: 3,
      borderDash: [5, 5],
      tension: 0.1,
      pointRadius: 0,
      fill: false,
      type: 'line'
    });

    datasets.push({
      label: 'סך הכל עם ריבית (ריאליסטי)',
      data: totalWithRateRaw,
      borderColor: '#ffffff',
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderWidth: 5,
      borderDash: [15, 10],
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 8,
      fill: false,
      type: 'line'
    });

    datasets.push({
      label: 'סך הכל - תרחיש פסימי',
      data: totalPessimistic,
      borderColor: '#ef4444',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [6, 6],
      tension: 0.2,
      pointRadius: 0,
      fill: false,
      type: 'line'
    });

    datasets.push({
      label: 'סך הכל - תרחיש אופטימי',
      data: totalOptimistic,
      borderColor: '#10b981',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [6, 6],
      tension: 0.2,
      pointRadius: 0,
      fill: false,
      type: 'line'
    });
	
	datasets.push({
	  label: 'רווח מריבית מצטבר',
	  data: interestBenefit,                 // כבר מחושב בלולאת החודשים
	  borderColor: '#fbbf24',
	  backgroundColor: 'rgba(251, 191, 36, 0.1)',
	  borderWidth: 4,
	  borderDash: [4, 3],
	  tension: 0.2,
	  pointRadius: 2,
	  pointHoverRadius: 6,
	  fill: 'origin',
	  type: 'line'
	});


    // אנוטציות
    const annotations = {};
    goalSeries.forEach((s, i) => {
      if (s.monthsToGoal > 0 && s.monthsToGoal <= totalMonths) {
        const xLabel = labels[s.monthsToGoal];
        const baseColor = PALETTE[i % PALETTE.length];
        annotations[`goal_${i}`] = {
          type: 'line',
          xMin: xLabel, xMax: xLabel,
          borderColor: baseColor,
          borderWidth: 2,
          borderDash: [10, 5],
          label: {
            enabled: true,
            content: s.name,
            position: 'start',
            yAdjust: 30,
            xAdjust: 6,
            backgroundColor: baseColor + '33',
            borderColor: baseColor,
            borderWidth: 1.5,
            borderRadius: 8,
            padding: 6,
            color: '#fff',
            font: { size: 12, weight: '700', family: 'Inter, system-ui, sans-serif' }
          }
        };
      }
    });

    const options = getChartOptions(labels, totalMonths, goalSeries, goals, { totalWithRateRaw, baselineNoRate });
    drawChart(labels, datasets, options, annotations);

    // KPI ריבית
    const kpiEl = document.getElementById('interestGainKpi');
    if (kpiEl) {
      const finalInterest = interestBenefit[interestBenefit.length - 1] || 0; // נשמר לשימוש עתידי אם תרצה
      const finalTotal    = totalWithRateRaw[totalWithRateRaw.length - 1] || 0;
      const pct = finalTotal > 0 ? ((finalInterest / finalTotal) * 100).toFixed(1) : '0';
      kpiEl.textContent = `${formatCurrency(finalInterest)} (${pct}%)`;
    }

    if (savingsChart?.canvas) {
      savingsChart.canvas.style.cursor = 'grab';
      savingsChart.canvas.style.transition = 'all 0.3s ease';
    }
  },

  mount() {
    this.init();
    this.update();
    Bus.on('goals:changed',    () => this.update());
    Bus.on('settings:changed', () => this.update());
    // תאימות לאחור
    window.updateChart = () => this.update();
  }
};
