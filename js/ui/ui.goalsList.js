// ui.goalsList.js
import { GoalsStore }   from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { Money }         from '../core.money.js';
import { Bus }           from '../core.bus.js';
// עדכן את הנתיב לפי מיקום הפונקציה אצלך:
import { formatDateDDMMYYYY,computeGoalViewModel } from './ui.goalsRichList.js';

const fmt = (n) => Money.format(n);

export const UIGoalsList = {
  el: null,

  mount(id = 'goalsList') {
    this.el = document.getElementById(id);
    if (!this.el) return;

    // רינדור ראשוני
    this.render();

    // רענון אוטומטי כשמטרות/הגדרות משתנות
    Bus.on('goals:changed',   () => this.render());
    Bus.on('settings:changed',() => this.render());

    // האזנה ללחצני עריכה/מחיקה
    this.el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const id  = Number(btn.dataset.goalId);
      const act = btn.dataset.action;

      if (act === 'delete') {
        GoalsStore.remove(id);
      } else if (act === 'edit') {
        // אירוע אפליקטיבי (עורך מאזין אליו)
        Bus.emit('ui:goal:edit', { id });
        // תאימות לאחור אם יש פונקציה גלובלית
        if (typeof window.openGoalEditorUpdated === 'function') {
          window.openGoalEditorUpdated(id);
        } else if (typeof window.openGoalEditor === 'function') {
          window.openGoalEditor(id);
        }
      }
    });
  },

  render() {
    const el = this.el;
    if (!el) return;

    const goals    = GoalsStore.list();
    const settings = SettingsStore.get();

    if (!goals?.length) {
      el.innerHTML = `
        <div class="empty-state animate-in">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">טרם הוגדרו מטרות — הוסיפו את המטרה הראשונה</div>
        </div>`;
      return;
    }

    const today = new Date();

    const cardsHtml = goals.map((goal, idx) => {
      // מודל תצוגה אחד ויחיד — אותו משתמשים גם בסיכום
      const vm = computeGoalViewModel(goal, settings, today);

      // תיבות מידע (ממוחזרות בסגנון שלך)
      const interestBox = `
        <div class="info-box" style="background:rgba(96,125,139,.10);border:1px solid rgba(96,125,139,.25);border-radius:8px;padding:12px;margin:12px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--text-muted);font-weight:600;">💡 ריבית מינימלית (חזויה):</span>
            <span style="color:var(--text-muted);font-weight:700">${fmt(vm.expectedInterest)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="color:var(--text-muted);font-size:.9rem">ערך עתידי להצגה</span>
            <span style="color:var(--text-muted);font-weight:600">${fmt(vm.calculatedFutureValue)}</span>
          </div>
        </div>`;

      const finalBox = `
        <div class="final-box" style="background:linear-gradient(135deg, rgba(16,185,129,.15), rgba(5,150,105,.10));
                                    border:2px solid rgba(16,185,129,.35);border-radius:12px;padding:16px;margin:16px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="color:var(--success);font-weight:700;display:flex;align-items:center;gap:8px">🎯 ערך סופי צפוי בתום התקופה</span>
            <span style="color:var(--success);font-weight:800;font-size:1.15rem">${fmt(vm.calculatedFutureValue)}</span>
          </div>
          <div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
            <div style="background:rgba(16,185,129,.10);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:10px">
              <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:4px">💰 סך השקעות נומינליות</div>
              <div style="font-weight:700">${fmt(vm.totalNominalInvestment)}</div>
            </div>
            <div style="background:rgba(251,191,36,.10);border:1px solid rgba(251,191,36,.25);border-radius:8px;padding:10px">
              <div style="color:var(--text-muted);font-size:.9rem;margin-bottom:4px">📈 רווח מריבית דריבית</div>
              <div style="font-weight:700;color:var(--gold-primary)">${fmt(vm.expectedInterest)}</div>
            </div>
          </div>
          ${vm.calculatedFutureValue > vm.goalAmount ? `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding-top:10px;border-top:1px solid rgba(16,185,129,.25)">
              <span style="color:var(--text-muted)">עודף מעל היעד</span>
              <span style="font-weight:700;color:var(--success)">${fmt(vm.calculatedFutureValue - vm.goalAmount)}</span>
            </div>` : ''}
        </div>`;

      const bonusesHtml = (Array.isArray(goal.bonuses) && goal.bonuses.length)
        ? `
          <div class="bonuses" style="background:rgba(156,39,176,.08);border:1px solid rgba(156,39,176,.25);border-radius:10px;padding:12px;margin-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <span style="color:#ab47bc;font-weight:700">🎁 בונוסים</span>
              <span style="color:#ab47bc;font-weight:700">${fmt(vm.bonusesSum)}</span>
            </div>
            <div style="display:grid;gap:8px">
              ${goal.bonuses.map((b, i) => {
                const m  = Math.max(1, parseInt(b.month || 0, 10));
                const bd = new Date(today); bd.setMonth(bd.getMonth() + m);
                const when = isFinite(bd) ? formatDateDDMMYYYY(bd) : `חודש ${m}`;
                const name = b.description ? String(b.description) : `בונוס ${i+1}`;
                return `
                  <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(156,39,176,.06);border:1px solid rgba(156,39,176,.2);border-radius:6px;padding:8px">
                    <div style="display:flex;flex-direction:column">
                      <span style="color:#ab47bc;font-weight:600">${name}</span>
                      <small style="color:var(--text-muted)">📅 ${when} (חודש ${m})</small>
                    </div>
                    <span style="color:#ab47bc;font-weight:700">${fmt(Number(b.amount)||0)}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>`
        : '';

      // שורת מטא
      const meta = `
        <div class="goal-meta" style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:8px">
          <div class="meta-item"><div class="goal-meta-label">יעד</div><div class="goal-meta-value">${formatDateDDMMYYYY(goal.targetDate)}</div></div>
          <div class="meta-item"><div class="goal-meta-label">זמן נותר</div><div class="goal-meta-value">${vm.monthsUntil} חודשים</div></div>
          <div class="meta-item"><div class="goal-meta-label">ריבית שנתית</div><div class="goal-meta-value">${(Number(goal.rateAnnual)||0).toFixed(2)}%</div></div>
          <div class="meta-item"><div class="goal-meta-label">חיסכון חודשי נדרש</div><div class="goal-meta-value success">${fmt(vm.displayPayment)}${settings?.computeReal ? ' (ריאלי)' : ' (נומינלי)'}</div></div>
          <div class="meta-item"><div class="goal-meta-label">סך השקעה כוללת</div><div class="goal-meta-value">${fmt(vm.totalNominalInvestment)}</div></div>
        </div>`;

      // כפתורי פעולה
      const actions = `
        <div style="text-align:left;margin-top:16px">
          <button class="btn btn-secondary" data-action="edit" data-goal-id="${goal.id}">✏️ ערוך</button>
          <button class="btn btn-danger"    data-action="delete" data-goal-id="${goal.id}">🗑️ מחק</button>
        </div>`;

      return `
        <div class="goal-card animate-slide" style="animation-delay:${idx*0.08}s">
          <div class="goal-head" style="display:flex;justify-content:space-between;align-items:center">
            <div class="goal-name" style="font-weight:700">${goal.name || 'ללא שם'}</div>
            <div class="goal-amount" style="font-weight:800">${fmt(vm.goalAmount)}</div>
          </div>

          ${interestBox}
          ${finalBox}
          ${meta}
          ${goal.savingsType === 'progressive'
            ? `<div class="meta-line" style="margin-top:6px;color:var(--text-muted)">סוג חיסכון: הדרגתי (+${fmt(vm.monthlyIncrease || 0)}/חודש)</div>`
            : ''}

          ${bonusesHtml}
          ${actions}
        </div>`;
    }).join('');

    el.innerHTML = cardsHtml;
  }
};
