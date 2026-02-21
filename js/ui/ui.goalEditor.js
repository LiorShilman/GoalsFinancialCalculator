// ui.goalEditor.js
// ============================================================================
// עורך מטרות – פתיחה/סגירה/שמירה + UI בונוסים מקצועי
// תלות: GoalsStore, SettingsStore, Money, Bus, computeGoalDisplayPayment, monthsBetween
// HTML: ראה המודאל כפי שסיפקת (עם האלמנטים בעלי ה-IDs שציינת)
// ============================================================================
import { GoalsStore } from '../state.goals.js';
import { UIMoneyInputs } from './ui.moneyInputs.js';

  // ===== Utilities =====
  const qs  = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const MoneyUtil = {
    format(n) {
      if (window.Money?.format) return Money.format(Number(n) || 0);
      return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
        .format(Number(n) || 0);
    },
    parse(s) {
      if (typeof s === 'number') return s;
      const v = Number(String(s || '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(v) ? v : 0;
    }
  };

  function parseTargetDate(str) {
    // dd/mm/yyyy
    const m = String(str || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function monthsBetweenCeil(from, to) {
    if (!from || !to) return 0;
    const y = to.getFullYear() - from.getFullYear();
    const m = to.getMonth() - from.getMonth();
    let total = y * 12 + m;
    if (to.getDate() > from.getDate()) total += 1;
    return Math.max(0, total);
  }

  function uid() {
    return 'g_' + Math.random().toString(36).slice(2, 10);
  }

  // ===== DOM refs (lazily filled on mount/open) =====
  let $modal, $name, $mode, $amount, $date, $mpGroup, $mp, $rate, $existing, $type, $progRow, $inc, $bonWrap, $save, $close;
  let $computedBadge; // תצוגה קטנה של "חיסכון חודשי נדרש"

  // ===== Core Editor API =====
  const UIGoalEditor = {
    _goal: null, // copy of the goal being edited (or null for new)
    mounted: false,

    mount() {
      if (this.mounted) return;

      $modal    = qs('#goalEditor');
      $name     = qs('#editGoalName');
      $mode     = qs('#editCalculationMode');
      $amount   = qs('#editGoalAmount');
      $date     = qs('#editGoalDate');
      $mpGroup  = qs('#editMonthlyPaymentGroup');
      $mp       = qs('#editMonthlyPayment');
      $rate     = qs('#editGoalRate');
      $existing = qs('#editExistingCapital');
      $type     = qs('#editSavingsType');
      $progRow  = qs('#editProgressiveRow');
      $inc      = qs('#editMonthlyIncrease');
      $bonWrap  = qs('#editBonusesContainer');
      $save     = qs('#saveGoalEditBtn');
      $close    = qs('#closeGoalEditorBtn');

      if (!$modal) return console.warn('[UIGoalEditor] modal not found');

      // צריבה של תגית “חיסכון חודשי נדרש”
      $computedBadge = document.createElement('div');
      $computedBadge.id = 'computedMonthlyBadge';
      $computedBadge.style.cssText =
        'margin:8px 0 0 0; font-size:13px; color:#a3e635; display:none;';
      // נשתול את התגית מתחת לשורת תאריך / סכום יעד (אחרי $date או $amount)
      const anchor = $date?.parentElement || $amount?.parentElement || $modal;
      anchor?.appendChild($computedBadge);

      // שגרות UI
      $mode?.addEventListener('change', () => {
        toggleCalculationMode();
        renderComputedMonthly();
      });
      $type?.addEventListener('change', () => {
        toggleSavingsType();
        renderComputedMonthly();
      });

      [$name, $amount, $date, $rate, $existing, $inc, $mp].forEach(inp => {
        inp?.addEventListener('input', () => {
          if (inp === $existing) {
            // השאר פורמט חכם – לא נכפה פורמט בזמן הקלדה
          }
          renderComputedMonthly();
        });
      });

      // סגירה
      $close?.addEventListener('click', () => this.close());
      $modal?.addEventListener('click', (e) => {
        if (e.target === $modal) this.close();
      });
      window.addEventListener('keydown', (e) => {
        if (!$modal || $modal.classList.contains('hidden')) return;
        if (e.key === 'Escape') this.close();
      });

      // שמירה
      $save?.addEventListener('click', () => this.save());

      // הסתרת כפתור הוספה ישן אם קיים
      document.getElementById('quickAddBonusBtn')?.remove();

      this.mounted = true;
    },

    open(goalOrId) {
	  // ודא שיש רפרנסים לדום והמאזינים מוטענים
	  if (!this.mounted) this.mount();

	  // שלוף/נרמל מטרה (ע"פ id/אובייקט/אירוע) או טמפלט חדש
	  const goalRaw = this._resolveGoal(goalOrId) || this._blankGoal();

	  // החזק עותק עבודה מקומי (לא נוגעים ב־store עד save)
	  const goal = { ...goalRaw };
	  this._goal = goal;

	  // --- מילוי טפסים ---
	  // שדות בסיס
	  if ($name)     $name.value     = goal.name || '';
	  if ($mode)     $mode.value     = (goal.calculationMode || 'standard');
	  if ($amount)   $amount.value   = Number(goal.amount || 0) || 0;

	  // תאריך יעד (תומך Date/ISO/מספר טיימסטמפ)
	  const toDate = goal.targetDate ? new Date(goal.targetDate) : null;
	  if ($date)     $date.value     = toDate && !isNaN(+toDate) ? formatDateDDMMYYYY(toDate) : '';

	  if ($rate)     $rate.value     = Number(goal.rateAnnual || 0) || 0;

	  // הון קיים — מציגים יפה, נשמרים במספר
	  if ($existing) $existing.value = MoneyUtil.format(goal.existingCapital || 0);

	  // סוג החיסכון + פרוגרסיבי
	  if ($type)     $type.value     = (goal.savingsType || 'fixed');
	  if ($inc)      $inc.value      = Number(goal.monthlyIncrease || 0) || 0;

	  // חיסכון חודשי קיים — מוצג רק במצבים ידניים (amount_payment/date_payment)
	  if ($mp)       $mp.value       = Number(goal.monthlyPayment || 0) || 0;

	  // עדכן מצב ה-UI לפי מצב חישוב/סוג חיסכון
	  toggleCalculationMode();
	  toggleSavingsType();

	  // --- בונוסים ---
	  const bonuses = Array.isArray(goal.bonuses) ? goal.bonuses : [];
	  window.GoalEditorBonuses?.mount('editBonusesContainer', bonuses);

	  // --- חישוב “חיסכון חודשי נדרש” לתצוגה ---
	  renderComputedMonthly();

	  // --- הצג מודאל ---
	  showModal(true);
	},

	// עזר: שליפה בטוחה של מזהה מדאטאסט / אירוע / אלמנט
_extractIdFromInput(input) {
  // 1) אם זה אירוע – נחפש אלמנט קרוב עם data-goal-id או data-id
  if (input && typeof input === 'object' && ('target' in input || 'currentTarget' in input)) {
    const root = input.target || input.currentTarget;
    const host = root?.closest?.('[data-goal-id],[data-id]') || root;
    const ds = host?.dataset || {};
    const raw = ds.goalId ?? ds.goalid ?? ds.id ?? null;
    if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  }

  // 2) אם זה אלמנט DOM
  if (input && input.nodeType === 1) {
    const host = input.closest?.('[data-goal-id],[data-id]') || input;
    const ds = host?.dataset || {};
    const raw = ds.goalId ?? ds.goalid ?? ds.id ?? null;
    if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  }

  // 3) אם זה מחרוזת/מספר – נרמול למחרוזת
  if (typeof input === 'string' || typeof input === 'number') {
    const s = String(input).trim();
    if (s) return s;
  }

  // 4) אם זה אובייקט מטרה
  if (input && typeof input === 'object' && input.id != null) {
    const s = String(input.id).trim();
    if (s) return s;
  }

  return null;
},

_resolveGoal(input) {
  // אין קלט → מטרה חדשה
  if (!input) return null;

  // נסה לחלץ מזהה
  const id = this._extractIdFromInput(input);
  if (id) {
    const g = this._fetchById(id);
    if (g) return g;
  }

  // אם זה אובייקט מטרה בלי id – נחזיר עותק שלו
  if (input && typeof input === 'object' && input.id == null) {
    return { ...input };
  }

  return null;
},

_fetchById(id) {
  const key = String(id).trim();

  // אם קיים getById – נשתמש בו
  if (typeof GoalsStore?.getById === 'function') {
    const got = GoalsStore.getById(key);
    if (got) return { ...got };
  }

  // נפילה: חיפוש ברשימה – נשווה כמחרוזות (כדי לא ליפול על סוג מספרי/מחרוזת)
  const list = (typeof GoalsStore?.list === 'function') ? GoalsStore.list() : [];
  if (Array.isArray(list) && list.length) {
    const found = list.find(g => String(g.id) === key);
    if (found) return { ...found };
  }

  // דיבאג — עוזר להבין למה לא נמצא
  console.warn('[UIGoalEditor] Goal not found by id:', key, 'existing ids:', (Array.isArray(list) ? list.map(g => String(g.id)) : '[]'));
  return null;
}

	,

    createNew() { this.open(null); },

    close() {
      showModal(false);
      this._goal = null;
    },

    save() {
      if (!this._goal) this._goal = this._blankGoal();

      const g = readGoalFromForm(this._goal.id || uid());
      // ולידציות בסיסיות
      if (!g.name || !g.targetDate || !g.amount) {
        alert('בדוק שם מטרה, סכום יעד ותאריך יעד'); return;
      }
      const from = new Date();
      const n = monthsBetweenCeil(from, g.targetDate);
      if (n <= 0) {
        alert('תאריך היעד חייב להיות בעתיד'); return;
      }

      // persist
      try {
        // נסיונות מתונים להתאמה לחנות שלך:
        if (GoalsStore?.upsert) {
          GoalsStore.upsert(g);
        } else if (GoalsStore?.update && GoalsStore?.getById?.(g.id)) {
          GoalsStore.update(g.id, g);
        } else if (GoalsStore?.save) {
          GoalsStore.save(g);
        } else if (GoalsStore?.add) {
          if (GoalsStore.getById?.(g.id)) GoalsStore.update?.(g.id, g);
          else GoalsStore.add(g);
        } else {
          // Fallback: נזרוק לאיבנט כדי שמאזין חיצוני ישמור
          document.dispatchEvent(new CustomEvent('goal:save', { detail: g }));
        }

        Bus?.emit?.('goals:changed', g);
        if (window.updateChart) window.updateChart();
        this.close();
      } catch (e) {
        console.error('Failed to save goal', e);
        alert('שגיאה בשמירה');
      }
    },

    _blankGoal() {
      return {
        id: uid(),
        name: '',
        calculationMode: 'standard', // standard | amount_payment | date_payment
        amount: 0,
        targetDate: null,
        monthlyPayment: 0,          // בשימוש רק במצבי user-fixed
        rateAnnual: 0,
        existingCapital: 0,
        savingsType: 'fixed',       // fixed | progressive
        monthlyIncrease: 0,
        bonuses: []
      };
    },

    _findById(id) {
      const list = GoalsStore?.list?.() || [];
      return list.find(x => x.id === id);
    }
  };

  // ===== Helpers for Editor behavior =====
  function showModal(show) {
    if (!$modal) return;
    $modal.classList.toggle('hidden', !show);
    $modal.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function formatDateDDMMYYYY(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function toggleCalculationMode() {
    const mode = ($mode?.value || 'standard').toLowerCase();
    const isUserFixed = (mode === 'amount_payment' || mode === 'date_payment');

    if ($mpGroup) {
      $mpGroup.style.display = isUserFixed ? '' : 'none';
      $mp.disabled = !isUserFixed;
    }

    // כשלא ידני – נציג תגית "חיסכון חודשי נדרש (מחושב)"
    $computedBadge.style.display = isUserFixed ? 'none' : '';
  }

  function toggleSavingsType() {
    const t = ($type?.value || 'fixed').toLowerCase();
    const isProg = (t === 'progressive');
    if ($progRow) $progRow.style.display = isProg ? '' : 'none';
  }

  function readGoalFromForm(existingId) {
    const g = {
      id: existingId,
      name: ($name?.value || '').trim(),
      calculationMode: String($mode?.value || 'standard'),
      amount: Number($amount?.value || 0),
      targetDate: parseTargetDate($date?.value),
      rateAnnual: Number($rate?.value || 0),
      existingCapital: MoneyUtil.parse($existing?.value || 0),
      savingsType: String($type?.value || 'fixed'),
      monthlyIncrease: Number($inc?.value || 0),
      bonuses: (window.GoalEditorBonuses?.value?.() || [])
    };

    // תשלום חודשי נשמר רק במצבי user-fixed
    const isUserFixed = (g.calculationMode === 'amount_payment' || g.calculationMode === 'date_payment');
    if (isUserFixed) {
      g.monthlyPayment = Number($mp?.value || 0);
    } else {
      g.monthlyPayment = 0; // או undefined – לפי הסכמה שלך
    }

    return g;
  }

  function renderComputedMonthly() {
    // הצגת "חיסכון חודשי נדרש" לפי computeGoalDisplayPayment – לשימוש תצוגתי בלבד
    try {
      const settings = SettingsStore?.get?.() || {};
      const tempGoal = readGoalFromForm(UIGoalEditor._goal?.id || uid());

      // אם המצב הוא user-fixed – אין מה לחשב; נסתיר תגית
      const isUserFixed = (tempGoal.calculationMode === 'amount_payment' || tempGoal.calculationMode === 'date_payment');
      if (isUserFixed) {
        $computedBadge.style.display = 'none';
        return;
      }

      // compute
      const p = Number(computeGoalDisplayPayment?.(tempGoal, settings)) || 0;
      if (Number.isFinite(p) && p > 0) {
        $computedBadge.textContent = `חיסכון חודשי נדרש (מחושב): ${MoneyUtil.format(Math.ceil(p))}` +
          (settings?.computeReal ? ' — מצב ריאלי' : ' — מצב נומינלי');
        $computedBadge.style.display = '';
      } else {
        $computedBadge.textContent = 'חיסכון חודשי נדרש (מחושב): 0';
        $computedBadge.style.display = '';
      }
    } catch (err) {
      console.warn('renderComputedMonthly failed', err);
      $computedBadge.style.display = 'none';
    }
  }

  // ===== Bonuses UI component (clean) =====
  // Exposes: window.GoalEditorBonuses.mount(containerId, bonuses?), .value(), .set(), .clear()
  (function () {
    const MONEY = {
      format: (n) => MoneyUtil.format(n),
      parse:  (s) => MoneyUtil.parse(s)
    };

    let _bonuses = [];  // [{month, amount, desc?}]
    let _el = null;
    let _mounted = false;

    function ensureStyles() {
      if (document.getElementById('bonuses-ui-styles')) return;
      const css = `
        .bon-toolbar{display:flex;align-items:center;justify-content:space-between;margin:6px 0 10px}
        .bon-toolbar h4{margin:0;font-size:1.05rem;font-weight:700;color:var(--text-primary,#e5e7eb)}
        .bon-add-btn{display:inline-flex;gap:8px;align-items:center;padding:10px 14px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.05));border:1px solid rgba(255,255,255,0.12);color:#fff;cursor:pointer}
        .bon-add-btn:hover{background:rgba(255,255,255,0.12)}
        .bon-list{display:grid;grid-template-columns:1fr;gap:8px}
        .bon-card{display:grid;grid-template-columns:84px 1fr auto;gap:14px;align-items:center;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}
        .bon-badge{display:flex;flex-direction:column;align-items:center;justify-content:center;width:74px;height:74px;border-radius:12px;background:linear-gradient(180deg,#0ea5e90d,#0ea5e904);border:1px solid rgba(14,165,233,0.28);color:#7dd3fc}
        .bon-badge .m{font-weight:800;font-size:16px;line-height:1}
        .bon-badge .cap{opacity:.8;font-size:11px}
        .bon-amt{font-weight:800;color:#e5e7eb;font-size:15px}
        .bon-desc{opacity:.9;color:#9ca3af;font-size:13px}
        .bon-actions{display:flex;gap:8px}
        .bon-actions .btn{padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer}
        .bon-actions .btn:hover{background:rgba(255,255,255,0.12)}
        .bon-actions .danger{border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.12)}
        .bon-empty{opacity:.75;padding:8px 2px}
        .bon-edit{display:grid;grid-template-columns:84px 1fr auto;gap:14px;align-items:center;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px dashed rgba(255,255,255,0.18)}
        .bon-edit .flds{display:flex;gap:10px;flex-wrap:wrap}
        .bon-input{background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:#fff;padding:8px 10px;min-width:120px}
        .bon-input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 2px rgba(56,189,248,0.25)}
        .bon-small{font-size:12px;opacity:.8;margin-top:2px}
      `;
      const style = document.createElement('style');
      style.id = 'bonuses-ui-styles';
      style.textContent = css;
      document.head.appendChild(style);
    }

    function monthsToTarget() {
      const inp = document.getElementById('editGoalDate');
      const val = inp ? String(inp.value).trim() : '';
      const end = parseTargetDate(val);
      const now = new Date();
      if (!end) return 600;
      return Math.max(1, monthsBetweenCeil(now, end));
    }

    function normalize(arr) {
      return (Array.isArray(arr) ? arr : [])
        .map(b => ({ month: Math.max(1, Math.floor(Number(b.month)||0)), amount: Math.max(0, Number(b.amount)||0), desc: (b.desc||'').trim() }))
        .filter(b => b.amount > 0 && b.month >= 1)
        .sort((a, b) => a.month - b.month);
    }

    function hideLegacyAround(el) {
      document.getElementById('quickAddBonusBtn')?.remove();
      // הסתרת כותרת כפולה אם קיימת לפני הקונטיינר
      const prev = el.previousElementSibling;
      if (prev && /בונוס/i.test(prev.textContent || '')) prev.style.display = 'none';
    }

    function render() {
      if (!_el) return;
      ensureStyles();
      hideLegacyAround(_el);

      const header = `
        <div class="bon-toolbar">
          <h4>בונוסים</h4>
          <button type="button" class="bon-add-btn" data-action="add"><span><i data-lucide="plus-circle"></i></span><span>הוסף בונוס</span></button>
        </div>
      `;

      const list = _bonuses.length
        ? _bonuses.map((b, i) => `
            <div class="bon-card" data-i="${i}">
              <div class="bon-badge"><div class="m">${b.month}</div><div class="cap">חודש</div></div>
              <div><div class="bon-amt">${MONEY.format(b.amount)}</div>${b.desc?`<div class="bon-desc">${escapeHtml(b.desc)}</div>`:'<div class="bon-desc">ללא תיאור</div>'}</div>
              <div class="bon-actions">
                <button class="btn" data-action="edit" data-index="${i}">ערוך</button>
                <button class="btn danger" data-action="delete" data-index="${i}">מחק</button>
              </div>
            </div>
          `).join('')
        : `<div class="bon-empty">אין בונוסים למטרה זו.</div>`;

      _el.innerHTML = header + `<div class="bon-list">${list}</div>`;

      _el.querySelector('[data-action="add"]')?.addEventListener('click', () => openEditor());
      _el.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.getAttribute('data-index'));
        openEditor(i);
      }));
      _el.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.getAttribute('data-index'));
        if (!Number.isFinite(i)) return;
        if (confirm('למחוק את הבונוס?')) {
          _bonuses.splice(i, 1);
          _bonuses = normalize(_bonuses);
          render();
        }
      }));

      function openEditor(index = null) {
		  // === Fallback helpers (לא שוברים אם אין הגדרות גלובליות) ===
		  const clampFn = (x, a, b) => Math.min(b, Math.max(a, x));
		  const parseMoney = (v) =>
			(window.MONEY?.parse ? window.MONEY.parse(v) :
			  (Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0));
		  const formatMoney = (n) =>
			(window.MONEY?.format ? window.MONEY.format(n) :
			  (Number(n) || 0).toLocaleString('he-IL'));

		  const nMax = Math.max(1, Number(monthsToTarget?.() || 1));
		  const editing = (index !== null && _bonuses[index])
			? { ..._bonuses[index] }
			: { month: 1, amount: 0, desc: '' };

		  const listEl = _el.querySelector('.bon-list');
		  if (!listEl) return;

		  // סגור עורך קיים (אם יש)
		  const prevEditor = listEl.querySelector('.bon-edit');
		  if (prevEditor) prevEditor.remove();

		  // הכנת שורה לעריכה
		  const row = document.createElement('div');
		  row.className = 'bon-edit';
		  row.style.cssText = `
			display:grid; grid-template-columns:repeat(12,1fr); gap:12px; align-items:end;
			padding:14px; border:1px solid rgba(255,255,255,.1); border-radius:14px;
			background:rgba(255,255,255,.03); margin-bottom:12px;
		  `;

		  row.innerHTML = `
			<div class="bon-badge" style="grid-column:span 12; display:flex; align-items:center; gap:8px; color:#aee;">
			  <div class="m" style="width:28px;height:28px;border-radius:999px;display:grid;place-items:center;border:1px solid rgba(6,182,212,.4);background:rgba(6,182,212,.12)">✎</div>
			  <div class="cap" style="font-weight:700">עריכת בונוס</div>
			</div>

			<div class="field sm" style="grid-column:span 2">
			  <label class="bon-small" style="display:block;color:#9ca3af;margin-bottom:6px">חודש (1–${nMax})</label>
			  <input type="number" min="1" max="${nMax}" step="1"
					 class="bon-input" data-f="month" value="${editing.month}"
					 aria-label="חודש בונוס" />
			</div>

			<div class="field md" style="grid-column:span 3">
			  <label class="bon-small" style="display:block;color:#9ca3af;margin-bottom:6px">סכום (₪)</label>
			  <input type="text" inputmode="decimal" data-format="money"
					 class="bon-input" data-f="amount" value="${formatMoney(editing.amount)}"
					 placeholder="10,000" aria-label="סכום בונוס" />
			</div>

			<div class="field lg" style="grid-column:span 6">
			  <label class="bon-small" style="display:block;color:#9ca3af;margin-bottom:6px">תיאור (אופציונלי)</label>
			  <input type="text" class="bon-input" data-f="desc"
					 placeholder="למשל: בונוס שנתי" value="${(editing.desc ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]))}"
					 aria-label="תיאור בונוס" />
			</div>

			<div class="bon-actions">
			  <button class="btn btn-primary" data-action="save">שמור</button>
			  <button class="btn" data-action="cancel">בטל</button>
			</div>
		  `;

		  // היכן לשתול: מחליף כרטיס קיים או מקדים לרשימה
		  if (index !== null) {
			const card = listEl.querySelector(`.bon-card[data-i="${index}"]`);
			card ? card.replaceWith(row) : listEl.prepend(row);
		  } else {
			listEl.prepend(row);
		  }

		  // מסיכת כסף (תומך גם בלי UIMoneyInputs)
		  const wireMoneyMask = (root) => {
			const inputs = root.querySelectorAll('[data-format="money"]');
			inputs.forEach(inp => {
			  if (inp.__wired) return; inp.__wired = true;
			  const fmt = () => { const v = parseMoney(inp.value); inp.value = inp.value.trim()==='' ? '' : formatMoney(v); };
			  inp.addEventListener('input', fmt);
			  inp.addEventListener('blur', fmt);
			  inp.addEventListener('focus', () => { try { inp.select(); } catch {} });
			  fmt();
			});
		  };
		  if (window.UIMoneyInputs?.attachMoneyFormatter) {
			window.UIMoneyInputs.attachMoneyFormatter('[data-format="money"]');
		  } else {
			wireMoneyMask(row);
		  }

		  // שמור / בטל
		  const onCancel = () => render();
		  const onSave = () => {
			const mEl = row.querySelector('[data-f="month"]');
			const aEl = row.querySelector('[data-f="amount"]');
			const dEl = row.querySelector('[data-f="desc"]');

			let m = clampFn(Math.floor(Number(mEl?.value || 1)), 1, nMax);
			const amt = Math.max(0, parseMoney(aEl?.value));
			const desc = String(dEl?.value || '').trim();

			if (!Number.isFinite(m)) m = 1;
			if (amt <= 0) { alert('סכום חייב להיות גדול מאפס'); return; }

			const item = { month: m, amount: amt, desc };
			if (index !== null) _bonuses[index] = item; else _bonuses.push(item);

			// נרמל (לפי חודש), אם יש normalize השתמש בו; אחרת מיון בסיסי
			if (typeof normalize === 'function') {
			  _bonuses = normalize(_bonuses);
			} else {
			  _bonuses.sort((a,b)=> (a.month||0) - (b.month||0));
			}

			render();
			try { renderComputedMonthly?.(); } catch {}
		  };

		  row.querySelector('[data-action="cancel"]').addEventListener('click', onCancel);
		  row.querySelector('[data-action="save"]').addEventListener('click', onSave);

		  // ולידציה קלה + קיצורי מקשים
		  const monthInput = row.querySelector('[data-f="month"]');
		  monthInput?.addEventListener('blur', () => {
			monthInput.value = clampFn(Math.floor(Number(monthInput.value || 1)), 1, nMax);
		  });

		  row.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); onSave(); }
			if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
		  });

		  // פוקוס על סכום
		  const amountInput = row.querySelector('[data-f="amount"]');
		  if (amountInput) { amountInput.focus(); try { amountInput.select(); } catch {} }
		}

    }

    function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
    function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
    function escapeAttr(s){return escapeHtml(s).replace(/"/g,'&quot;');}

    window.GoalEditorBonuses = {
      mount(containerId = 'editBonusesContainer', bonuses = []) {
        _el = document.getElementById(containerId);
        if (!_el) return;
        _bonuses = normalize(bonuses);
        _mounted = true;
        render();
      },
      set(bonuses = []) { _bonuses = normalize(bonuses); if (_mounted) render(); },
      clear(){ _bonuses = []; if (_mounted) render(); },
      value(){ return normalize(_bonuses); }
    };
  })();

  export { UIGoalEditor };
  
  // ===== expose editor globally =====
  window.UIGoalEditor = UIGoalEditor;




