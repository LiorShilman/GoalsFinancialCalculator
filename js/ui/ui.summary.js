// ui.summary.js
import { GoalsStore } from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { Money } from '../core.money.js';
import { Bus } from '../core.bus.js';
import { computeGoalDisplayPayment ,goalPMT} from '../engine.calculator.js';
import { monthsBetween } from '../core.time.js';
import { UIKaTeX } from './ui.katex.js';
import { calculateROI, formatROI, formatRule72 } from '../engine.roi.js';
import { animateValue } from './ui.animations.js';
import { animateStatNumbers } from './ui.animations.js';
import { calculateAdvancedSavings } from '../engine.projections.js';
import { computeGoalViewModel } from './ui.goalsRichList.js';
import { effectiveAnnualRate, annualToMonthlyRate } from '../engine.rates.js';

const fmt = (v) => Money.format(v);

const ROI_BANDS = [
      { min: -Infinity, max: 0, cls: 'roi-bad', label: 'שלילי' }, // < 0%
      { min: 0, max: 2, cls: 'roi-weak', label: 'נמוך' }, // 0%–2%
      { min: 2, max: 5, cls: 'roi-ok', label: 'סביר' }, // 2%–5%
      { min: 5, max: 8, cls: 'roi-good', label: 'טוב' }, // 5%–8%
      { min: 8, max: Infinity, cls: 'roi-excellent', label: 'מצוין' } // ≥ 8%
    ];
	
// עיצוב כ-% עם 2 ספרות אחרי הנקודה ושמירה על סימן
function formatPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  // אם v=0.042 בתור "יחסי", שנה ל-4.2; אם v כבר באחוזים (4.2), השאר:
  const isFraction = Math.abs(n) <= 1 && String(v).includes('.');
  const pct = isFraction ? n * 100 : n;
  const sign = (pct > 0 ? '' : (pct < 0 ? '−' : ''));
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function pickBand(roiPercent) {
  const v = Number(roiPercent);
  if (!Number.isFinite(v)) return null;
  return ROI_BANDS.find(b => v >= b.min && v < b.max) || null;
}

function updateAverageROIUI(roiPercent, elId = 'averageROI') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.classList.remove('roi-bad','roi-weak','roi-ok','roi-good','roi-excellent');
  const band = pickBand(roiPercent);
  const pctStr = formatPercent(roiPercent);
  if (!band) { el.textContent = pctStr; return; }
  el.classList.add(band.cls);
  el.textContent = `${pctStr} · ${band.label}`;
  el.setAttribute('aria-label', `תשואה ממוצעת: ${pctStr} (${band.label})`);
}

// ─── עזרי חישוב עקביים עם מצב ריאלי/נומינלי ──────────────────────────────────
function seriesFactor(r, n) {
  const eps = 1e-12;
  if (Math.abs(r) < eps) return n;
  return (Math.pow(1 + r, n) - 1) / r;
}

function monthlyRate(goal, settings, realMode) {
  const nominalAnnual = (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
  const effAnnual = effectiveAnnualRate(nominalAnnual, !!realMode, Number(settings?.inflationAnnualPct) || 0);
  return annualToMonthlyRate(effAnnual); // (1+eff)^(1/12)-1
}

function fvOfBonusesAtEnd(bonuses, n, r) {
  if (!Array.isArray(bonuses) || !bonuses.length) return 0;
  const buckets = {};
  for (const b of bonuses) {
    const m = Math.floor(Number(b?.month) || 0);
    const amt = Number(b?.amount) || 0;
    if (m >= 1 && m <= n && amt) buckets[m] = (buckets[m] || 0) + amt;
  }
  let s = 0;
  for (const [mStr, amt] of Object.entries(buckets)) {
    const m = Number(mStr) | 0;           // הפקדה בסוף חודש m
    s += amt * Math.pow(1 + r, n - m);    // צבירה עד סוף התקופה
  }
  return s;
}
function sumBonusesNominal(bonuses) {
  if (!Array.isArray(bonuses)) return 0;
  return bonuses.reduce((acc, b) => acc + (Number(b?.amount) || 0), 0);
}

// PMT לתצוגה/חישוב – תמיד מהפונקציה המרכזית שלך
function pmtForGoal(goal, settings) {
  const v = Number(computeGoalDisplayPayment(goal, settings)) || 0;
  return Math.max(0, v);
}

/** מחזיר ROI שנתי (באחוזים) למטרה אחת — עקבי עם Summary; בוחר ריאלי/נומינלי לפי settings.computeReal */
function computeGoalROIForTable(goal, settings, today = new Date()) {
  const n = Math.max(1, monthsBetween(today, goal.targetDate));
  // חישוב גם נומינלי וגם ריאלי, נציג לפי מצב המשתמש
  const rNom = monthlyRate(goal, settings, /*realMode=*/false);
  const rReal = monthlyRate(goal, settings, /*realMode=*/true);

  const E = Math.max(0, Number(goal.existingCapital) || 0);
  const P = pmtForGoal(goal, settings);
  const Bsum = sumBonusesNominal(goal.bonuses);

  // FV עד סוף התקופה
  const FV_nom  = E * Math.pow(1 + rNom,  n) + fvOfBonusesAtEnd(goal.bonuses, n, rNom)  + P * seriesFactor(rNom,  n);
  const FV_real = E * Math.pow(1 + rReal, n) + fvOfBonusesAtEnd(goal.bonuses, n, rReal) + P * seriesFactor(rReal, n);

  // “השקעה נומינלית” (כמה הוזרם כספית): הון קיים + בונוסים + סך ההפקדות
  const Invest = E + Bsum + P * n;

  if (Invest <= 0) return 0; // אין מה להשוות – מציגים 0

  const years = Math.max(0.0001, n / 12);
  const cagrNom  = Math.pow(Math.max(0, FV_nom  / Invest), 1 / years) - 1;
  const cagrReal = Math.pow(Math.max(0, FV_real / Invest), 1 / years) - 1;

  // בוחרים איזה להציג בשורה בטבלה
  const showReal = !!settings?.computeReal;
  return (showReal ? cagrReal : cagrNom) * 100; // אחוזים
}


// FV ו"השקעה נומינלית" למטרה אחת, עבור מצב נומינלי/ריאלי (realMode)
function goalFVAndInvest(goal, settings, realMode, today = new Date()) {
  const n = Math.max(1, monthsBetween(today, goal.targetDate));
  const r = monthlyRate(goal, settings, realMode);
  const E = Math.max(0, Number(goal.existingCapital) || 0);
  const bonuses = Array.isArray(goal.bonuses) ? goal.bonuses : [];
  const Bsum = sumBonusesNominal(bonuses);
  const P = pmtForGoal(goal, settings);

  const FV_existing = E * Math.pow(1 + r, n);
  const FV_bonuses  = fvOfBonusesAtEnd(bonuses, n, r);
  const FV_payments = P * seriesFactor(r, n);

  const FV_total = FV_existing + FV_bonuses + FV_payments;
  const Invest   = E + Bsum + P * n; // סכום נומינלי שהוזרם

  return { FV_total, Invest, months: n };
}

// CAGR משוקלל (תיק מטרות): נומינלי וריאלי
function calculatePortfolioROI(goals, settings, today = new Date()) {
  let totInvest = 0, totFV_nom = 0, totFV_real = 0, maxMonths = 0;

  for (const g of (goals || [])) {
    const nom  = goalFVAndInvest(g, settings, /*realMode=*/false, today);
    const real = goalFVAndInvest(g, settings, /*realMode=*/true,  today);

    totInvest += nom.Invest;      // אותה "השקעה" בסיסית לשני המצבים
    totFV_nom += nom.FV_total;
    totFV_real+= real.FV_total;
    maxMonths  = Math.max(maxMonths, nom.months);
  }

  if (totInvest <= 0) {
    return { nominalAnnual: 0, realAnnual: 0, meta: { years: 0, invest: 0 } };
  }
  const years = Math.max(0.0001, maxMonths / 12);
  const multipleNom  = Math.max(0, totFV_nom  / totInvest);
  const multipleReal = Math.max(0, totFV_real / totInvest);

  const cagrNom  = Math.pow(multipleNom,  1 / years) - 1;
  const cagrReal = Math.pow(multipleReal, 1 / years) - 1;

  return {
    nominalAnnual: cagrNom * 100,
    realAnnual:    cagrReal * 100,
    meta: { years, invest: totInvest, multipleNom, multipleReal }
  };
}

function monthlyRateFromSettings(goal, settings) {
  const nominal = (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
  const effAnnual = effectiveAnnualRate(nominal, !!settings?.computeReal, Number(settings?.inflationAnnualPct) || 0);
  return annualToMonthlyRate(effAnnual); // (1+eff)^(1/12)-1
}
function fvOfBonuses(bonuses, n, r) {
  if (!Array.isArray(bonuses) || bonuses.length === 0) return 0;
  const buckets = {};
  for (const b of bonuses) {
    const m = Math.floor(Number(b?.month) || 0);
    const amt = Number(b?.amount) || 0;
    if (m >= 1 && m <= n && amt) buckets[m] = (buckets[m] || 0) + amt;
  }
  let s = 0;
  for (const [mStr, amt] of Object.entries(buckets)) {
    const m = Number(mStr) | 0; // סוף חודש m
    s += amt * Math.pow(1 + r, n - m);
  }
  return s;
}

	
export const UISummary = {
  mount() {
    this.render();
    Bus.on('goals:changed',    () => this.render());
    Bus.on('settings:changed', () => this.render());
  },

  render() {
    // --- DOM ---
    const totalAmountEl    = document.getElementById('totalAmount');
    const monthlySavingEl  = document.getElementById('monthlySaving');
    const timeToGoalEl     = document.getElementById('timeToGoal');
    const explainMonthlyEl = document.getElementById('explainMonthly');
    const breakdownSection = document.getElementById('breakdownSection');
    const warningMessage   = document.getElementById('warningMessage');
    const gainKpi          = document.getElementById('interestGainKpi');
    const targetGapKpi     = document.getElementById('targetGapKpi');
    const averageROIEl     = document.getElementById('averageROI');
    const tableBody        = document.getElementById('breakdownTableBody');

    // --- נתונים ---
    const goals    = GoalsStore.list() || [];
    const settings = SettingsStore.get() || {};
    const globalSaved = Math.max(0, Number(settings?.globalSaved) || 0);
    const today = new Date();

    // מצב ריק
    if (!Array.isArray(goals) || goals.length === 0) {
      if (totalAmountEl)    totalAmountEl.textContent    = fmt(0);
      if (monthlySavingEl)  monthlySavingEl.textContent  = fmt(0);
      if (timeToGoalEl)     timeToGoalEl.textContent     = 'זמן לסיום: 0 חודשים';
      if (explainMonthlyEl) explainMonthlyEl.textContent = '';
      if (breakdownSection) breakdownSection.style.display = 'none';
      if (warningMessage)   warningMessage.style.display   = 'none';
      if (gainKpi)          gainKpi.textContent           = fmt(0);
      if (targetGapKpi)     targetGapKpi.textContent      = fmt(0);
      if (averageROIEl)     averageROIEl.textContent      = '0.0%';
      if (tableBody)        tableBody.innerHTML           = '';
      // ערך עזר לדיבאג
      window.__summary = { goals: [], totals: {}, mode: settings?.computeReal ? 'real' : 'nominal' };
      return;
    }

    // --- אוגרים לכלל המטרות ---
    let totalAmount            = 0;   // Σ סכום יעד
    let totalExistingCapital   = 0;   // Σ הון קיים למטרות
    let totalMonthly           = 0;   // Σ PMT (מחושב עקבית)
    let maxMonths              = 0;   // האופק הרחוק ביותר
    let hasExpiredGoals        = false;
    let totalInterestGain      = 0;   // Σ רווחי ריבית לפי מודל התצוגה
    let totalDeficitToTargets  = 0;   // סכום חסרים (אינדיקציה)
    let remainingGlobalCapital = globalSaved; // לשדה "יתרה חופשית" — יורד סדרתית

    // --- בניית שורות טבלה (עשירה) ---
    const rows = goals.map((g, idx) => {
      const months = Math.max(1, monthsBetween(today, g.targetDate));
      maxMonths = Math.max(maxMonths, months);
      if (g.targetDate && new Date(g.targetDate) <= today) hasExpiredGoals = true;

      // PMT עקבי:
      const pmt = goalPMT(g, settings);

      // ViewModel לחישובי FV/ריבית/פער (הוא עשוי לכלול סימולציה מפורטת)
      const vm = computeGoalViewModel(g, settings, today);

      const amount   = Math.max(0, Number(g.amount) || 0);
      const existing = Math.max(0, Number(g.existingCapital) || 0);

      // רווח/פער לפי VM
      const interestGain = Math.max(0, Number(vm?.expectedInterest) || 0);
      const gapToTarget  = Number(vm?.calculatedFutureValue || 0) - Number(vm?.goalAmount || 0);

      // ROI ו"כלל 72"
      const roi = computeGoalROIForTable(g, settings, today);
      const rateNum     = Number(g.rateAnnual) || 0;
      const rule72Years = rateNum > 0 ? (72 / rateNum).toFixed(1) : 'N/A';

      // “יתרה חופשית” לפני מטרה זו — כמה נשאר מהחיסכון הכללי אחרי הקצאות קודמות
      const freeCapitalForRow = Math.max(0, remainingGlobalCapital - existing);
      remainingGlobalCapital  = Math.max(0, remainingGlobalCapital - existing); // מפחיתים הקצאה של המטרה הנוכחית

      // צבירה לאוגרים כלליים
      totalAmount          += amount;
      totalExistingCapital += existing;
      totalMonthly         += pmt;
      totalInterestGain    += interestGain;
      if (gapToTarget < 0) totalDeficitToTargets += Math.abs(gapToTarget);

      return {
        id: g.id,
        name: g.name || `מטרה ${idx + 1}`,
        amount,
        months,
        rate: rateNum,
        monthlyPayment: pmt,           // ← זה מהווה האמת היחידה (computeGoalDisplayPayment / user-fixed)
        roi,
        rule72Years,
        existingCapital: existing,
        freeCapital: freeCapitalForRow,
        interestGain,
        gapToTarget
      };
    });

    const freeExistingCapital = Math.max(0, globalSaved - totalExistingCapital);
    const remainingToSave     = Math.max(0, totalAmount - totalExistingCapital);

    // --- KPIs עיקריים ---
    if (totalAmountEl) {
      animateValue(totalAmountEl, 0, totalAmount, 900, v => fmt(v));
    }

    if (monthlySavingEl) {
      const label = settings?.computeReal ? ' (ריאלי)' : ' (נומינלי)';
      animateValue(monthlySavingEl, 0, totalMonthly, 900, v => fmt(v) + label);
    }

    if (timeToGoalEl) {
      timeToGoalEl.innerHTML = `
        זמן לסיום: ${maxMonths} חודשים
        <br><small style="color: var(--success);">
          הון מוקצה למטרות: ${fmt(totalExistingCapital)}
          • יתרה חופשית כוללת: ${fmt(freeExistingCapital)}
          • נותר לחסוך (נומינלי גס): ${fmt(remainingToSave)}
        </small>`;
    }

    // --- טקסט הסבר + KaTeX (אופציונלי) ---
    if (explainMonthlyEl) {
      explainMonthlyEl.innerHTML =
        `מצב ${settings?.computeReal ? 'ריאלי: $r_{\\text{real}} = \\frac{1+i}{1+\\pi} - 1$' : 'נומינלי'}.
         החישוב לפי אנואיטי (תשלום בסוף חודש):
         $$ P = \\frac{FV_{\\text{נדרש}} \\cdot r}{(1+r)^n - 1} $$
         כאשר $FV_{\\text{נדרש}} = \\max\\{0,\\ A - E(1+r)^n - \\sum\\limits_{m} B_m (1+r)^{n-m}\\}$,
         $A$ יעד סופי, $E$ הון קיים בתחילת הדרך, $B_m$ בונוס בחודש $m$, ו-$r$ ריבית חודשית אפקטיבית.`;
      if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(explainMonthlyEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
          ],
          throwOnError: false
        });
      } else if (window.UIKaTeX?.render) {
        window.UIKaTeX.render(explainMonthlyEl);
      }
    }

    // --- טבלת פירוט מלאה (מחזירה את כל השדות שהיו) ---
    if (tableBody) {
      tableBody.innerHTML = rows.map((row, i) => {
        const gapCls = row.gapToTarget < 0 ? 'var(--danger)' : 'var(--success)';
        return `
          <tr style="animation: fadeInUp .5s ease forwards; animation-delay: ${i * 0.05}s; opacity: 0;">
            <td style="font-weight:700;color:var(--text-primary)">${row.name}</td>
            <td>${fmt(row.amount)}</td>
            <td>${row.months} חודשים</td>
            <td>${row.rate.toFixed(2)}%</td>
            <td style="font-weight:700;color:var(--success)">${fmt(row.monthlyPayment)}</td>
            <td>${formatROI(row.roi, true)}</td>
            <td>${formatRule72(row.rule72Years)}</td>
            <td>${row.existingCapital > 0 ? fmt(row.existingCapital) : '-'}</td>
            <td>${row.freeCapital > 0 ? fmt(row.freeCapital) : '-'}</td>
            <td>${fmt(row.interestGain)}</td>
            <td style="font-weight:700;color:${gapCls}">${fmt(row.gapToTarget)}</td>
          </tr>
        `;
      }).join('');
    }

    // הצגה/הסתרה
    if (breakdownSection) breakdownSection.style.display = 'block';
    if (warningMessage)   warningMessage.style.display   = hasExpiredGoals ? 'block' : 'none';

    // ROI ממוצע (אינדיקטיבי)
	if (averageROIEl) {
	  const { nominalAnnual, realAnnual, meta } = calculatePortfolioROI(goals, settings);
	  const valueToShow = settings?.computeReal ? realAnnual : nominalAnnual;

	  // צבע + תווית לפי בנדים
	  updateAverageROIUI(valueToShow, 'averageROI');

	  // Tooltip עשיר לשני המצבים + מעט הקשר
	  averageROIEl.title =
		`CAGR משוקלל (${settings?.computeReal ? 'ריאלי' : 'נומינלי'})\n` +
		`נומינלי: ${formatPercent(nominalAnnual)}\n` +
		`ריאלי: ${formatPercent(realAnnual)}\n` +
		`השקעה כוללת: ${Money.format(meta.invest)} · תקופה: ~${meta.years.toFixed(1)} שנים`;
	}

    /* if (averageROIEl) {
      const avg = rows.length ? (rows.reduce((s, r) => s + (Number(r.rate) || 0), 0) / rows.length) : 0;
      animateValue(averageROIEl, 0, avg, 800, v => (Number.isFinite(v) ? v.toFixed(1) : '0.0') + '%');
    } */

    // KPI רווח ריבית כולל (סכום VM לכל המטרות)
    if (gainKpi) {
      animateValue(gainKpi, 0, totalInterestGain, 900, v => fmt(v));
    }

    // KPI חסרים ליעדים
    if (targetGapKpi) {
      animateValue(targetGapKpi, 0, totalDeficitToTargets, 900, v => fmt(v));
    }

    // לדיבאג/בדיקות
    window.__summary = {
      goals: rows,
      totals: {
        totalMonthly,
        totalAmount,
        existingAllocated: totalExistingCapital,
        freeExistingCapital,
        remainingToSave,
        maxMonths,
        totalInterestGain,
        totalDeficitToTargets
      },
      mode: settings?.computeReal ? 'real' : 'nominal'
    };
  }
};
