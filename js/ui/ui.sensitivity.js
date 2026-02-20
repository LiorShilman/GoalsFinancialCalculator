// js/ui/ui.sensitivity.js
import { GoalsStore } from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { monthsBetween } from '../core.time.js';
import { Rates } from '../engine.rates.js';
import { computeGoalDisplayPayment } from '../engine.calculator.js';

let __sensitivityBusy = false;

// סימולציה כללית: כמה חודשים נדרשים להגיע ליעד עם schedule נתון (base + progressive)
function simulateMonthsToTarget(goal, settings, effMonthlyRate, basePayment, monthlyIncrease) {
  const target = Math.max(0, Number(goal.amount) || 0);
  const today  = new Date();
  const maxCap = 1200; // מקסימום חודשים בסימולציה (בטיחות)

  // הכנה: הון קיים + מיפוי בונוסים
  const existing = Math.max(0, Number(goal.existingCapital) || 0);
  const monthsBaseline = Math.max(1, monthsBetween(today, goal.targetDate, 'ceil'));
  const bonusesByMonth = {};
  for (const b of (goal.bonuses || [])) {
    const m = Math.max(1, Math.floor(Number(b?.month) || 0));
    const amt = Math.max(0, Number(b?.amount) || 0);
    if (amt) bonusesByMonth[m] = (bonusesByMonth[m] || 0) + amt;
  }

  let value = existing;
  for (let m = 1; m <= maxCap; m++) {
    // ריבית על היתרה
    value *= (1 + effMonthlyRate);

    // הפקדה בסוף חודש
    const pay = (goal.savingsType === 'progressive')
      ? Math.max(0, basePayment + (m - 1) * monthlyIncrease)
      : basePayment;

    value += pay + (bonusesByMonth[m] || 0);

    if (value + 1e-6 >= target) {
      return m; // מספר חודשים נדרש
    }
  }
  // אם לא הגענו — נחזיר את הבייסליין לפחות כדי לא להפיל UI
  return monthsBaseline;
}

// חישוב ניתוח רגישות: שינוי ריבית גלובלי (באחוזי-נק׳) והבדל בחודשים לכל מטרה
export function performSensitivityAnalysis(deltaPct = 0) {
  const settings = SettingsStore.get();
  const goals = GoalsStore.list();

  const today = new Date();
  const results = [];

  for (const g of goals) {
    const baseMonths = Math.max(1, monthsBetween(today, g.targetDate, 'ceil'));

    // ריבית אפקטיבית חודשית תחת דלתא
    const effAnnual = Rates.annualEffective(
      (Number(g.rateAnnual) || 0) + (Number(deltaPct) || 0),
      !!settings?.computeReal,
      Number(settings?.inflationAnnualPct) || 0
    );
    const rMonthly = Rates.toMonthly(effAnnual);

    // בסיס התשלומים לפי הארכיטקטורה האחידה (אותו schedule כמו היום)
    const basePayment = Math.max(0, computeGoalDisplayPayment(g, settings));
    const monthlyIncrease = Math.max(0, Number(g.monthlyIncrease) || 0);

    // כמה חודשים נדרשים להגיע ליעד תחת הדלתא (עם אותו schedule)
    const newMonths = simulateMonthsToTarget(g, settings, rMonthly, basePayment, monthlyIncrease);

    results.push({
      goalId: g.id,
      goalName: g.name || 'מטרה',
      baseMonths,
      newMonths,
      timeDifferenceMonths: newMonths - baseMonths
    });
  }

  return { differences: results, delta: Number(deltaPct) || 0, at: Date.now() };
}

// --- UI ---

export function updateSensitivityDisplay(rateChange, analysisOptional) {
  const analysis = analysisOptional || performSensitivityAnalysis(rateChange);

  const box = document.getElementById('sensitivityResults');
  if (!box) return;

  if (!analysis.differences?.length) {
    box.innerHTML = '<div class="muted">אין מטרות להצגה</div>';
    return;
  }

  box.innerHTML = analysis.differences.map(diff => {
    const cls = diff.timeDifferenceMonths > 0 
      ? 'negative' 
      : (diff.timeDifferenceMonths < 0 ? 'positive' : 'neutral');

    // אין פלוס, רק מינוס אם צריך
    const val = diff.timeDifferenceMonths;


    return `
      <div class="sensitivity-item">
        <span class="goal-name">${diff.goalName}</span>
        <span class="time-change ${cls}">
          ${val} חודשים
        </span>
      </div>
    `;
  }).join('');
}


// מנקה כפילויות, שומר תוצאות, מפעיל רענון מסך מלא אם צריך
export function updateSensitivityAnalysis(value, opts = { triggerFullUpdate: true }) {
  if (__sensitivityBusy) return;
  __sensitivityBusy = true;

  const v = Number(value) || 0;
  window.currentRateChange = v;

  // עדכון התווית של הדלתא (גם אם לא דרך mountSensitivity)
  const label = document.getElementById('rateChangeDisplay');
  if (label) {
    label.style.direction = 'ltr'; // לשמור על המינוס בצד שמאל גם ב־RTL
    const txt = v < 0 
      ? ('\u2212' + Math.abs(v).toFixed(1))  // מינוס טיפוגרפי
      : v.toFixed(1);                         // חיובי בלי פלוס
    label.textContent = txt + '%';
  }

  const results = performSensitivityAnalysis(v);
  window.__lastSensitivityResults = results;

  updateSensitivityDisplay(v, results);

  __sensitivityBusy = false;

  if (opts?.triggerFullUpdate) {
    try { window.updateDisplay && window.updateDisplay(); } catch {}
  }
}

export function mountSensitivity() {
  const slider = document.getElementById('sensitivitySlider');
  const label  = document.getElementById('rateChangeDisplay');
  if (!slider) return;

  const renderLabel = (v) => {
    if (!label) return;
    // שמור על סימן המינוס משמאל גם ב־RTL
    label.style.direction = 'ltr';
    // בלי פלוס עבור ערכים חיוביים
    const num = Number(v) || 0;
    // אופציונלי: מינוס טיפוגרפי יפה U+2212
    const txt = num < 0 ? ('\u2212' + Math.abs(num).toFixed(1)) : num.toFixed(1);
    label.textContent = txt + '%';
  };

  const onChange = () => {
    const v = Number(slider.value) || 0;
    renderLabel(v);
    updateSensitivityAnalysis(v, { triggerFullUpdate: true });
  };

  slider.addEventListener('input', onChange);
  slider.addEventListener('change', onChange);

  const initial = (typeof window.currentRateChange === 'number')
    ? Number(window.currentRateChange) || 0
    : Number(slider.value) || 0;

  slider.value = String(initial);
  renderLabel(initial);
  updateSensitivityAnalysis(initial, { triggerFullUpdate: false });
}
