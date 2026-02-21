// ui.goalsRichList.js
import { GoalsStore } from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { Money } from '../core.money.js';
import { Bus } from '../core.bus.js';
import { Calculator } from '../engine.calculator.js';   // נשתמש חלקית (למקרה עתידי)
import { monthsBetween } from '../core.time.js';        // אם אין — ראה fallback למטה
import { computeGoalDisplayPayment, futureValueOfPayments } from '../engine.calculator.js';
import { effectiveAnnualRate, annualToMonthlyRate, Rates } from '../engine.rates.js';
import { UIGoalEditor } from './ui.goalEditor.js';

// --- אם לא קיים לך formatDate ב-core.time.js, שמור כאן (או הסר שימוש) ---
export const formatDateDDMMYYYY = (dLike) => {
  const d = new Date(dLike);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const formatCurrency = (n) => Money.format(n);

// נוסחות עזר
function pmtForFV({ fv, n, r }) {
  // גזירה סטנדרטית לתשלום קבוע ל-FV: p = FV * r / ((1+r)^n - 1)
  if (fv <= 0) return 0;
  if (r > 0) return fv * (r / (Math.pow(1 + r, n) - 1));
  return fv / n;
}

function fvOfAnnuity({ p, n, r }) {
  if (r > 0) return p * ((Math.pow(1 + r, n) - 1) / r);
  return p * n;
}

// דלתא ריבית “גלובלית” (אם יש לך משהו חיצוני/פיצ'ר ניסוי)
const currentRateDelta = () => Number(window.currentRateChange || 0);

// מחשוב פר־מטרה (שומר על הלוגיקה המקורית שלך)
export function computeGoalViewModel(goal, settings, today = new Date()) {
  const n = Math.max(1, monthsBetween(today, goal.targetDate, 'ceil'));

  // --- ריבית אפקטיבית (ריאלי/נומינלי) → חודשית אפקטיבית ---
  const nominalAnnual =
    (Number(goal.rateAnnual) || 0) + (Number(window.currentRateChange) || 0);
  const effAnnual = effectiveAnnualRate(
    nominalAnnual,
    !!settings?.computeReal,
    Number(settings?.inflationAnnualPct) || 0
  );
  const r = annualToMonthlyRate(effAnnual); // (1+eff)^(1/12)-1

  // --- נתונים בסיסיים ---
  const EPS       = 0.01; // 1 אגורה
  const toCent    = (x) => Math.round((Number(x) || 0) * 100) / 100;

  const amount    = Math.max(0, Number(goal.amount) || 0);
  const existing0 = Math.max(0, Number(goal.existingCapital) || 0);

  // --- FV של בונוסים עד סוף התקופה (בונוס בסוף חודש m ⇒ צובר n-m חודשים) ---
  let fvBonuses = 0, bonusesSum = 0;
  if (Array.isArray(goal.bonuses)) {
    const bucket = {};
    for (const b of goal.bonuses) {
      const m   = Math.max(1, Math.floor(Number(b?.month) || 0));
      const amt = Number(b?.amount) || 0;
      if (amt > 0 && m <= n) {
        bonusesSum += amt;
        bucket[m] = (bucket[m] || 0) + amt;
      }
    }
    for (const [mStr, amt] of Object.entries(bucket)) {
      const m = Number(mStr) | 0;
      fvBonuses += amt * Math.pow(1 + r, n - m);
    }
  }

  // --- FV של ההון הקיים עד סוף התקופה ---
  const fvExisting = existing0 * Math.pow(1 + r, n);

  // --- PMT: מקור אמת יחיד (כולל user-fixed, progressive, ריאלי/נומינלי, בונוסים, הון קיים) ---
  const basePayment = Math.max(
    0,
    Number(computeGoalDisplayPayment(goal, settings)) || 0
  );

  // --- FV של התשלומים ---
  let fvPayments = 0;
  if (String(goal.savingsType) === 'progressive') {
    // סדרה עם בסיס P = basePayment ועלייה חודשית d
    const d = Math.max(0, Number(goal.monthlyIncrease) || 0);

    // s_n|r = ((1+r)^n - 1)/r , עם טיפול בגבול r→0
    const seriesFactor = (rate, periods) => {
      const eps = 1e-12;
      if (Math.abs(rate) < eps) return periods;
      return (Math.pow(1 + rate, periods) - 1) / rate;
    };

    const s = seriesFactor(r, n);

    if (r === 0) {
      // ללא ריבית: Σ (P + (t-1)d) = n*P + d*n(n-1)/2
      fvPayments = basePayment * n + d * (n * (n - 1) / 2);
    } else {
      // FV = P*s + d * ((s - n) / r)
      fvPayments = basePayment * s + d * ((s - n) / r);
    }
  } else {
    // תשלום קבוע (אנואיטי רגילה, סוף-חודש)
    if (r === 0) {
      fvPayments = basePayment * n;
    } else {
      fvPayments = basePayment * ((Math.pow(1 + r, n) - 1) / r);
    }
  }

  // --- סכום עתידי מחושב, השקעה נומינלית, ריבית צפויה ---
  const goalAmount             = toCent(amount);
  const fvExistingCents        = toCent(fvExisting);
  const fvBonusesCents         = toCent(fvBonuses);
  const fvPaymentsCents        = toCent(fvPayments);
  const calculatedFutureValue  = toCent(
    fvExistingCents + fvBonusesCents + fvPaymentsCents
  );

  // השקעה נומינלית: הון קיים + סכום בונוסים + סכום תשלומים נומינלי
  let nominalPayments;
  if (String(goal.savingsType) === 'progressive') {
    const d = Math.max(0, Number(goal.monthlyIncrease) || 0);
    // סך תשלומים נומינלי בסדרה אריתמטית: n*P + d*n(n-1)/2
    nominalPayments = basePayment * n + d * (n * (n - 1) / 2);
  } else {
    nominalPayments = basePayment * n;
  }

  const nominalInvestment = toCent(existing0 + bonusesSum + nominalPayments);
  const expectedInterest  = Math.max(0, toCent(calculatedFutureValue - nominalInvestment));

  // --- חסר/עומד ביעד (עם סבולת אגורה) ---
  const deficitRaw = toCent(goalAmount - calculatedFutureValue);
  const achievable = deficitRaw <= EPS; // “מספיק קרוב”
  const shortfall  = achievable ? 0 : deficitRaw; // אם עדיין חסר – ערך חיובי

  return {
    goalAmount,
    existingCapital: existing0,
    monthsUntil: n,

    fvExisting,
    fvBonuses,
    fvPayments,

    basePayment,                    // PMT גולמי (מ-computeGoalDisplayPayment)
    displayPayment: Math.ceil(basePayment), // לשכבת UI – עיגול כלפי מעלה

    bonusesSum,
    totalNominalInvestment: nominalInvestment,
    expectedInterest: Math.max(0, expectedInterest),
    calculatedFutureValue,

    achievable: calculatedFutureValue + 1e-9 >= goalAmount,
    shortfall: Math.max(0, goalAmount - calculatedFutureValue),

    monthlyIncrease: Math.max(0, Number(goal.monthlyIncrease) || 0)
  };
}



export const UIGoalsRichList = {
  mount(id = 'goalsList') {
    this.el = document.getElementById(id);
    if (!this.el) return;

    this.render();

    // רענון אוטומטי
    Bus.on('goals:changed', () => this.render());
    Bus.on('settings:changed', () => this.render());

    // האזנת פעולות (עריכה/מחיקה) בלי onclick אינליין
    this.el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.goalId);
      const act = btn.dataset.action;
      if (act === 'delete') {
        GoalsStore.remove(id);
      } else if (act === 'edit') {
        // העדפה: אירוע Bus — שהעורך שלך יאזין לו
        Bus.emit('ui:goal:edit', { id });
		UIGoalEditor.open(id);
      }
    });
  },

  render() {
    const el = this.el;
    if (!el) return;

    const goals = GoalsStore.list();
    if (!Array.isArray(goals) || goals.length === 0) {
      el.innerHTML = `
        <div class="empty-state animate-in">
          <div class="empty-state-icon"><i data-lucide="clipboard-list"></i></div>
          <div class="empty-state-text">טרם הוגדרו מטרות — הוסיפו את המטרה הראשונה</div>
        </div>
      `;
      return;
    }

    const settings = SettingsStore.get();
    const today = new Date();

    const html = goals.map((goal, index) => {
      const vm = computeGoalViewModel(goal, settings, today);
      const investmentStartDate = new Date(goal.startDate || today);

      // קטעי “תיבות מידע” (נשמרים בדיוק רוח ה-HTML שלך)
      const existingBox = vm.existingCapital > 0 ? `
        <div class="existing-capital-display" style="background: rgba(16,185,129,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; border: 1px solid rgba(16,185,129,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color: var(--success); font-weight: 600;">💰 הון קיים:</span>
            <span style="color: var(--success); font-weight: 700; font-size: 1.1rem;">${formatCurrency(vm.existingCapital)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="color: var(--text-muted); font-size: 0.9rem;">אחוז השלמה:</span>
            <span style="color: var(--success); font-weight: 600;">${(vm.goalAmount>0 ? (vm.existingCapital/vm.goalAmount*100).toFixed(1) : 0)}%</span>
          </div>
        </div>` : '';

      const interestBox = vm.expectedInterest > 1000
        ? `
        <div class="interest-forecast-display" style="background: rgba(251,191,36,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; border: 1px solid rgba(251,191,36,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color: var(--gold-primary); font-weight: 600;">📈 ריבית צפויה:</span>
            <span style="color: var(--gold-primary); font-weight: 700; font-size: 1.1rem;">${formatCurrency(vm.expectedInterest)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="color: var(--text-muted); font-size: 0.9rem;">ריבית על ההשקעה:</span>
            <span style="color: var(--gold-primary); font-weight: 600;">${(vm.totalNominalInvestment>0 ? (vm.expectedInterest/vm.totalNominalInvestment*100).toFixed(1) : 0)}%</span>
          </div>
        </div>`
        : (vm.expectedInterest > 0 ? `
        <div class="interest-forecast-display" style="background: rgba(96, 125, 139, 0.1); padding: 12px; border-radius: 8px; margin: 12px 0; border: 1px solid rgba(96, 125, 139, 0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color: var(--text-muted); font-weight: 600;">💡 ריבית מינימלית:</span>
            <span style="color: var(--text-muted); font-weight: 600;">${formatCurrency(vm.expectedInterest)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="color: var(--text-muted); font-size: 0.9rem;">ערך עתידי צפוי:</span>
            <span style="color: var(--text-muted); font-weight: 600;">${formatCurrency(vm.calculatedFutureValue)}</span>
          </div>
        </div>` : '');

      const shortfallBox = vm.shortfall > 0 ? `
        <div class="warning-display" style="background: rgba(244,67,54,0.1); padding: 12px; border-radius: 8px; margin: 12px 0; border: 1px solid rgba(244,67,54,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:#f44336;font-weight:600;">⚠️ חסר לעמידה במטרה:</span>
            <span style="color:#f44336;font-weight:700;font-size:1.1rem;">${formatCurrency(vm.shortfall)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="color: var(--text-muted); font-size: 0.9rem;">יושג בפועל:</span>
            <span style="color:#f44336;font-weight:600;">${formatCurrency(vm.calculatedFutureValue)}</span>
          </div>
        </div>` : '';

      // bonuses list
      const bonusesHtml = (Array.isArray(goal.bonuses) && goal.bonuses.length>0) ? `
        <div class="bonuses-section" style="background: rgba(156,39,176,0.1); padding: 15px; border-radius: 10px; margin: 15px 0; border: 1px solid rgba(156,39,176,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span style="color:#ab47bc;font-weight:600;font-size:1.05rem;">🎁 בונוסים מתוכננים</span>
            <span style="color:#ab47bc;font-weight:700;font-size:1.1rem;">${formatCurrency(vm.bonusesSum)}</span>
          </div>
          <div class="bonuses-list" style="display:grid;gap:8px;">
            ${goal.bonuses.map((bonus, i) => {
              let when = '';
              if (bonus.month) {
                const bd = new Date(investmentStartDate);
                bd.setMonth(bd.getMonth() + parseInt(bonus.month));
                when = `<span style="color:var(--text-muted);font-size:.85rem;">📅 ${formatDateDDMMYYYY(bd)} (חודש ${bonus.month})</span>`;
              }
              const name = bonus.description ? String(bonus.description) : `בונוס ${i+1}`;
              return `
                <div class="bonus-item" style="background: rgba(156,39,176,0.05); padding:10px; border-radius:6px; border:1px solid rgba(156,39,176,0.2); display:flex; justify-content:space-between; align-items:center;">
                  <div style="display:flex;flex-direction:column;">
                    <span style="color:#ab47bc;font-weight:600;font-size:.95rem;">${name}</span>
                    ${when}
                  </div>
                  <span style="color:#ab47bc;font-weight:700;font-size:1rem;">${formatCurrency(bonus.amount)}</span>
                </div>`;
            }).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:8px;border-top:1px solid rgba(156,39,176,0.2);">
            <span style="color:var(--text-muted);font-size:.9rem;">${goal.bonuses.length} בונוסים סה"כ</span>
            <span style="color:var(--text-muted);font-size:.9rem;">💰 כולל ריבית דריבית</span>
          </div>
        </div>` : '';

      const finalBox = vm.achievable ? `
        <div class="final-value-display" style="background:linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1)); padding:18px; border-radius:12px; margin:20px 0; border:2px solid rgba(16,185,129,0.4); box-shadow:0 4px 20px rgba(16,185,129,0.15);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
            <span style="color:var(--success);font-weight:700;font-size:1.2rem;display:flex;align-items:center;gap:8px;">🎯 ערך סופי כולל בתום התקופה</span>
            <span style="color:var(--success);font-weight:800;font-size:1.4rem;">${formatCurrency(vm.calculatedFutureValue)}</span>
          </div>
          <div class="breakdown-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            <div style="background:rgba(16,185,129,0.1);padding:12px;border-radius:8px;border:1px solid rgba(16,185,129,0.2);">
              <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:4px;">💰 סך השקעות נומינליות</div>
              <div style="color:var(--success);font-weight:600;font-size:1.1rem;">${formatCurrency(vm.totalNominalInvestment)}</div>
            </div>
            <div style="background:rgba(251,191,36,0.1);padding:12px;border-radius:8px;border:1px solid rgba(251,191,36,0.2);">
              <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:4px;">📈 רווח מריבית דריבית</div>
              <div style="color:var(--gold-primary);font-weight:600;font-size:1.1rem;">${formatCurrency(vm.expectedInterest)}</div>
            </div>
          </div>
          ${vm.calculatedFutureValue > vm.goalAmount ? `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid rgba(16,185,129,0.3);">
              <span style="color:var(--text-muted);font-size:.95rem;">💎 עודף מעבר ליעד:</span>
              <span style="color:var(--success);font-weight:700;font-size:1.1rem;">${formatCurrency(vm.calculatedFutureValue - vm.goalAmount)}</span>
            </div>` : ''}
        </div>`
        : `
        <div class="final-value-display" style="background:linear-gradient(135deg, rgba(96,125,139,0.15), rgba(69,90,120,0.1)); padding:18px; border-radius:12px; margin:20px 0; border:2px solid rgba(96,125,139,0.4);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
            <span style="color:var(--text-muted);font-weight:700;font-size:1.2rem;display:flex;align-items:center;gap:8px;">📊 ערך סופי צפוי בתום התקופה</span>
            <span style="color:var(--text-muted);font-weight:800;font-size:1.4rem;">${formatCurrency(vm.calculatedFutureValue)}</span>
          </div>
          <div class="breakdown-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
            <div style="background:rgba(96,125,139,0.1);padding:12px;border-radius:8px;border:1px solid rgba(96,125,139,0.2);">
              <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:4px;">💰 סך השקעות נומינליות</div>
              <div style="color:var(--text-muted);font-weight:600;font-size:1.1rem;">${formatCurrency(vm.totalNominalInvestment)}</div>
            </div>
            <div style="background:rgba(251,191,36,0.1);padding:12px;border-radius:8px;border:1px solid rgba(251,191,36,0.2);">
              <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:4px;">📈 רווח מריבית דריבית</div>
              <div style="color:var(--text-muted);font-weight:600;font-size:1.1rem;">${formatCurrency(vm.expectedInterest)}</div>
            </div>
          </div>
        </div>`;

      // כפתורי פעולה — בלי onclick, עם data-*
      const actions = `
        <div style="text-align:left;margin-top:20px;">
          <button class="btn btn-secondary interactive" data-action="edit" data-goal-id="${goal.id}" title="עריכת מטרה"><i data-lucide="pencil"></i> ערוך</button>
          <button class="btn btn-danger interactive" data-action="delete" data-goal-id="${goal.id}" title="מחיקת מטרה"><i data-lucide="trash-2"></i> מחק</button>
        </div>`;

      return `
        <div class="goal-item animate-slide interactive" style="animation-delay:${index*0.1}s">
          <div class="goal-header">
            <div class="goal-name">${goal.name}</div>
            <div class="goal-amount">${formatCurrency(vm.goalAmount)}</div>
          </div>

          ${existingBox}
          ${interestBox}
          ${shortfallBox}
          ${finalBox}

          <div class="goal-meta">
            <div class="goal-meta-item">
              <div class="goal-meta-label">יעד</div>
              <div class="goal-meta-value">${formatDateDDMMYYYY(goal.targetDate)}</div>
            </div>
            <div class="goal-meta-item">
              <div class="goal-meta-label">זמן נותר</div>
              <div class="goal-meta-value">${vm.monthsUntil} חודשים</div>
            </div>
            <div class="goal-meta-item">
              <div class="goal-meta-label">ריבית שנתית</div>
              <div class="goal-meta-value">${(Number(goal.rateAnnual)||0).toFixed(2)}%</div>
            </div>
            <div class="goal-meta-item">
              <div class="goal-meta-label">חיסכון חודשי נדרש</div>
              <div class="goal-meta-value success">${formatCurrency(vm.displayPayment)}</div>
            </div>
            ${vm.existingCapital>0 ? `
            <div class="goal-meta-item">
              <div class="goal-meta-label">סכום נותר לחסוך</div>
              <div class="goal-meta-value">${formatCurrency(Math.max(0, vm.goalAmount - vm.existingCapital))}</div>
            </div>` : ''}
            <div class="goal-meta-item">
              <div class="goal-meta-label">סך השקעה כוללת</div>
              <div class="goal-meta-value">${formatCurrency(vm.totalNominalInvestment)}</div>
            </div>
            ${goal.savingsType === 'progressive' ? `
			  <div class="goal-meta-item">
				<div class="goal-meta-label">סוג חיסכון</div>
				<div class="goal-meta-value">
				  הדרגתי (+${formatCurrency(vm.monthlyIncrease)}/חודש)
				</div>
			  </div>` : ''}

          </div>

          ${bonusesHtml}
          ${actions}
        </div>`;
    }).join('');

    el.innerHTML = html;
  }
};
