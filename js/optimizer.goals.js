import { effectiveAnnualRate, annualToMonthlyRate } from './engine.rates.js';
import { computeGoalViewModel } from './ui/ui.goalsRichList.js';
import { SettingsStore } from './state.settings.js';
import { GoalsStore } from './state.goals.js';
import { Money } from './core.money.js';

let lastOptimization = null;

// === חישוב זמן עד יעד ===
function computeTimeToGoal(goal, settings, payment, today = new Date()) {
  const nominalAnnual = (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
  const effAnnual = effectiveAnnualRate(
    nominalAnnual,
    !!settings?.computeReal,
    Number(settings?.inflationAnnualPct) || 0
  );
  const r = annualToMonthlyRate(effAnnual);

  const amount    = Math.max(0, Number(goal.amount) || 0);
  const existing0 = Math.max(0, Number(goal.existingCapital) || 0);
  const d         = Math.max(0, Number(goal.monthlyIncrease) || 0);
  const P         = Math.max(0, Number(payment) || 0);

  const fvFor = (n) => {
    const pow = Math.pow(1 + r, n);
    const fvExisting = existing0 * pow;

    let fvBonuses = 0;
    if (Array.isArray(goal.bonuses)) {
      const bucket = {};
      for (const b of goal.bonuses) {
        const m   = Math.max(1, Math.floor(Number(b?.month) || 0));
        const amt = Number(b?.amount) || 0;
        if (amt > 0 && m <= n) bucket[m] = (bucket[m] || 0) + amt;
      }
      for (const [mStr, amt] of Object.entries(bucket)) {
        const m = Number(mStr) | 0;
        fvBonuses += amt * Math.pow(1 + r, n - m);
      }
    }

    let fvPayments = 0;
    if (String(goal.savingsType) === 'progressive') {
      if (Math.abs(r) < 1e-12) {
        fvPayments = P * n + d * (n * (n - 1) / 2);
      } else {
        const s = (pow - 1) / r;
        fvPayments = P * s + d * ((s - n) / r);
      }
    } else {
      if (Math.abs(r) < 1e-12) {
        fvPayments = P * n;
      } else {
        fvPayments = P * ((pow - 1) / r);
      }
    }
    return fvExisting + fvBonuses + fvPayments;
  };

  let lo = 1, hi = 1;
  while (fvFor(hi) < amount && hi < 2400) hi *= 2;
  if (fvFor(hi) < amount) return null;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fvFor(mid) >= amount) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// === אופטימיזציה בפועל ===
export function optimizeMonthlyAllocation(settings, goals, options = {}) {
  const roundTo = Number(options.roundTo ?? 1);
  const budgetMode = options.budgetMode || 'general';
  const mode = options.mode || 'surplus';

  const budget =
    budgetMode === 'sumOfGoals'
      ? goals.reduce((s, g) => s + (Number(g.monthlyPayment) || 0), 0)
      : (Number(settings?.generalMonthlyDeposit) || 0);

  if (!Array.isArray(goals) || goals.length === 0) {
    return { feasible: true, budget, allocations: [], note: 'אין מטרות' };
  }

  const analyzed = goals.map((g) => {
    const vm = computeGoalViewModel(g, settings, new Date());
    const pMin = vm.displayPayment || 0;

    return { goal: g, vm, pMin };
  });

  const sumMin = analyzed.reduce((s, x) => s + x.pMin, 0);
  if (sumMin > budget) {
    return { feasible: false, budget, shortfall: sumMin - budget };
  }

  const leftover = Math.max(0, budget - sumMin);
  const generalRate = Number(settings?.generalInterestRate) || 0;

  let idxTarget = -1;
  if (mode === 'time') {
  // מוצאים יעד עם הזמן הארוך ביותר
  let bestIdx = analyzed.reduce((best, x, i) =>
    analyzed[i].vm.monthsUntil > analyzed[best].vm.monthsUntil ? i : best, 0);

  // בדיקת ריבית מול ריבית כללית
  const goalRate = Number(analyzed[bestIdx].goal.rateAnnual) || 0;
  if (goalRate > generalRate) {
    idxTarget = bestIdx;
  } else {
    idxTarget = -1; // לא משתלם פיננסית, נשאיר ביתרה כללית
  }
} else {
    let bestIdx = -1;
	let bestInterest = generalRate;
	analyzed.forEach((x, i) => {
	  const goalRate = Number(x.goal.rateAnnual) || 0;
	  if (goalRate > bestInterest) {
		bestInterest = goalRate;
		bestIdx = i;
	  }
	});
	idxTarget = bestIdx;

  }

  const allocations = analyzed.map((x, i) => ({
    id: x.goal.id,
    name: x.goal.name,
    paymentNew: x.pMin + ((i === idxTarget) ? leftover : 0),
  }));

  if (idxTarget === -1 && leftover > 0) {
    allocations.push({ id: 'general', name: 'יתרה כללית', paymentNew: leftover });
  }

  const diagnostics = allocations.map(al => ({
    id: al.id,
    name: al.name,
    paymentNew: al.paymentNew,
    interestRate: al.id === 'general'
      ? generalRate
      : (analyzed.find(a => a.goal.id === al.id)?.goal.rateAnnual || 0)
  }));

  return { feasible: true, budget, allocations, diagnostics };
}

// === הצגת תוצאות ===
export function applyOptimization(result, mode, settings, goalsRaw) {
  const resultsEl   = document.getElementById('optimizationResults');
  const currentEl   = document.getElementById('currentPlan');
  const optimizedEl = document.getElementById('optimizedPlan');
  const benefitsEl  = document.getElementById('optimizationBenefits');
  const badgesEl    = document.getElementById('optimizationBadges');
  if (!resultsEl) return;

  // איפוס
  currentEl.innerHTML = '';
  optimizedEl.innerHTML = '';
  benefitsEl.innerHTML = '';
  badgesEl.innerHTML = '';
  const oldTable = resultsEl.querySelector('.opt-table');
  if (oldTable) oldTable.remove();

  if (!result.feasible) {
    resultsEl.style.display = 'block';
    currentEl.innerHTML = `<p>❌ אין אפשרות לעמוד בכל היעדים עם התקציב הנוכחי.</p>`;
    benefitsEl.innerHTML =
      `<p>דרוש תוספת של ${Money.format(result.shortfall)} ₪ לפחות, או התאמת מועדים/תשואות.</p>`;
    badgesEl.innerHTML = `<span class="badge bg-danger">חסר תקציב</span>`;
    return;
  }

  // מצב נוכחי
  currentEl.innerHTML = goalsRaw.map(g => {
    const vm = computeGoalViewModel(g, settings, new Date());
    return `<div class="goal-line"><strong>${g.name}</strong> – ${Money.format(vm.displayPayment || 0)} לחודש</div>`;
  }).join('');

  // מצב מומלץ
  optimizedEl.innerHTML = result.allocations.map(a => {
    return `<div class="goal-line"><strong>${a.name}</strong> – ${Money.format(a.paymentNew)} לחודש</div>`;
  }).join('');

  // טבלה עם עמודת ריבית
  const table = document.createElement('table');
  table.className = 'opt-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>יעד</th>
        <th>ריבית שנתית</th>
        <th>תשלום נוכחי</th>
        <th>תשלום מומלץ</th>
        <th>ערך עתידי צפוי</th>
        <th>סכום יעד</th>
        <th>עודף / חסר</th>
        <th>משך זמן נוכחי</th>
        <th>משך זמן מומלץ</th>
      </tr>
    </thead>
    <tbody>
      ${result.diagnostics.map(d => {
        if (d.id === 'general') {
          return `
            <tr>
              <td>${d.name}</td>
              <td>${d.interestRate}%</td>
              <td colspan="7"><em>${Money.format(d.paymentNew)} בחודש (יתרה כללית)</em></td>
            </tr>
          `;
        }
        const g = goalsRaw.find(x => x.id === d.id);
        const today = new Date();
        const vmRealCurr = computeGoalViewModel(g, { ...settings, computeReal: true }, today);
        const timeCurr = vmRealCurr.monthsUntil;
        const timeOpt  = (mode === 'time')
          ? computeTimeToGoal(g, { ...settings, computeReal: true }, d.paymentNew)
          : timeCurr;

        let vmOptReal = computeGoalViewModel(
          { ...g, monthlyPayment: d.paymentNew, calculationMode: 'amount_payment' },
          { ...settings, computeReal: true },
          today
        );

        const surplusVal = vmOptReal.calculatedFutureValue - vmOptReal.goalAmount;
        const surplusHtml = surplusVal >= 0
          ? `<span style="color:lime;">+${Money.format(surplusVal)}</span>`
          : `<span style="color:red;">${Money.format(surplusVal)}</span>`;

        const formatTime = m => m ? `${m} חוד׳ (~${(m/12).toFixed(1)} שנים)` : 'לא אפשרי';

        return `
          <tr>
            <td>${d.name}</td>
            <td>${d.interestRate}%</td>
            <td>${Money.format(vmRealCurr.displayPayment || 0)}</td>
            <td>${Money.format(d.paymentNew)}</td>
            <td>${Money.format(vmOptReal.calculatedFutureValue)}</td>
            <td>${Money.format(vmOptReal.goalAmount)}</td>
            <td>${surplusHtml}</td>
            <td>${formatTime(timeCurr)}</td>
            <td>${formatTime(timeOpt)}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;

  benefitsEl.insertAdjacentElement('afterend', table);
  requestAnimationFrame(() => table.classList.add('fade-in'));

  badgesEl.innerHTML = `<span class="badge bg-success">עמיד ביעדים</span>
                        <span class="badge bg-info">${mode === 'time' ? 'קיצור זמן יעד' : 'מקסימום רווחיות'}</span>`;
  resultsEl.style.display = 'block';
}

export function hideOptimization() {
  const resultsEl   = document.getElementById('optimizationResults');
  const currentEl   = document.getElementById('currentPlan');
  const optimizedEl = document.getElementById('optimizedPlan');
  const benefitsEl  = document.getElementById('optimizationBenefits');
  const badgesEl    = document.getElementById('optimizationBadges');

  if (resultsEl) resultsEl.style.display = 'none';
  if (currentEl) currentEl.innerHTML = '';
  if (optimizedEl) optimizedEl.innerHTML = '';
  if (benefitsEl) benefitsEl.innerHTML = '';
  if (badgesEl) badgesEl.innerHTML = '';

  const oldTable = resultsEl?.querySelector('.opt-table');
  if (oldTable) oldTable.remove();
}

// === מעטפת להרצה ===
export function runImprovedOptimization(mode = 'surplus') {
  const settings  = SettingsStore.get();
  const goalsRaw  = GoalsStore.list();

  const result = optimizeMonthlyAllocation(settings, goalsRaw, {
    budgetMode: 'general',
    roundTo: 1,
    mode,
  });

  lastOptimization = result;
  applyOptimization(result, mode, settings, goalsRaw);
}
