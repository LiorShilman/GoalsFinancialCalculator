// ui.bindings.js
import { Bus } from '../core.bus.js';
import { SettingsStore } from '../state.settings.js';
import { UIKPIs } from './ui.kpis.js';
import { UIGoalsList } from './ui.goalsList.js';
import { UIMessages } from './ui.messages.js';
import { Money,MoneyInput, MoneyUtil } from '../core.money.js';
import { GoalsStore } from '../state.goals.js';
import { UIMoneyInputs } from './ui.moneyInputs.js';
import { UIBonusesEditor } from './ui.bonusesEditor.js';
import { UIBonusesModal } from './ui.bonusesModal.js';
import { UIGoalsRichList } from './ui.goalsRichList.js';
import { UISummary } from './ui.summary.js';
import { setupNewEventListeners } from './ui.rule72.js';
import { computeGoalDisplayPayment } from '../engine.calculator.js';
//import { openGoalEditor, closeGoalEditor, saveGoalEdit } from './ui.goalEditor.js';
import { parseDateDDMMYYYY,formatDateForInput} from '../core.time.js';
import { mountResetAll } from './ui.resetAll.js';
import { UISettings } from './ui.settings.js';
import { updateFreeMonthlyDepositUI } from './ui.kpis.freeMonthly.js';
import { UICharts } from './ui.charts.js';
import { applyOptimization, hideOptimization , optimizeMonthlyAllocation,runImprovedOptimization } from '../optimizer.goals.js';
import { exportCurrentReport } from '../export_to_elite_pdf_pro_drop_in_module.js';

import {Derived} from '../state.derived.js';

// escape פשוט לטקסט
function esc(s='') {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderBonusesList() {
  const bonusList = document.getElementById('bonusList');
  if (!bonusList) return;

  const arr = UIBonusesEditor.get(); // [{month, amount, description?}, ...]

  if (arr.length === 0) {
    bonusList.innerHTML = '<div style="color:#94a3b8;font-size:0.9rem;margin-top:8px">אין בונוסים</div>';
    return;
  }

  const rows = arr.map((b, i) => `
    <div class="bonus-item" data-index="${i}">
      <span>
        חודש ${Number(b.month)}: ${Money.format(Number(b.amount)||0)}
        ${b.description ? ` — <span style="opacity:.8">${esc(b.description)}</span>` : ''}
      </span>
      <div style="display:inline-flex;gap:6px;margin-inline-start:8px">
        <button type="button" class="btn-edit-bonus">ערוך</button>
        <button type="button" class="btn-del-bonus">מחק</button>
      </div>
    </div>
  `).join('');

  const total = arr.reduce((s, x) => s + (Number(x.amount)||0), 0);
  const summary = `
    <div style="margin-top:6px;font-weight:600;display:flex;justify-content:space-between">
      <span>סה"כ בונוסים: ${arr.length}</span>
      <span>${Money.format(total)}</span>
    </div>
  `;

  bonusList.innerHTML = rows + summary;
}

// האזנה גלובלית לשינויים בבונוסים → רענון
Bus.on('ui:bonuses:changed', renderBonusesList);

// האזנת delegate ללחצני עריכה/מחיקה
function bindBonusListActions() {
  const bonusList = document.getElementById('bonusList');
  if (!bonusList) return;

  bonusList.addEventListener('click', (ev) => {
    const row = ev.target.closest('.bonus-item');
    if (!row) return;
    const idx = Number(row.dataset.index);

    if (ev.target.classList.contains('btn-del-bonus')) {
      UIBonusesEditor.removeAt(idx);
      return;
    }
    if (ev.target.classList.contains('btn-edit-bonus')) {
      const current = UIBonusesEditor.get()[idx];
      if (!current) return;
      // דוגמת עריכה מהירה (החלף לדיאלוג/מודאל כרצונך)
      const m = prompt('חודש (מספר ≥1):', String(current.month ?? '')) ?? '';
      const a = prompt('סכום:', String(current.amount ?? '')) ?? '';
      const d = prompt('תיאור (רשות):', String(current.description ?? '')) ?? '';
      const month = Math.max(1, Math.floor(Number(m)||0));
      const amount = Number(a)||0;
      const edited = { month, amount, description: d.trim() };
      const list = UIBonusesEditor.get();
      list[idx] = edited;
      UIBonusesEditor.set(list); // יורה אירוע ורענון
    }
  });
}

function initBonusesUI() {
  bindBonusListActions();
  renderBonusesList(); // רנדר ראשון
}



function setupDateInput(offset) {
  const dateInput = document.getElementById('goalDate');
  if (!dateInput) return;

  const today = new Date();
  const defaultDate = new Date(today);
  defaultDate.setDate(today.getDate() + offset);
  dateInput.value = formatDateForInput(defaultDate);

  dateInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 3) value = value.substring(0, 2) + '/' + value.substring(2);
    if (value.length >= 6) value = value.substring(0, 5) + '/' + value.substring(5, 9);
    e.target.value = value;
  });

  dateInput.addEventListener('blur', (e) => {
    const value = e.target.value;
    if (value && !isValidDateFormat(value)) {
      e.target.style.borderColor = 'var(--danger)';
      e.target.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.3)';
    } else {
      e.target.style.borderColor = '';
      e.target.style.boxShadow = '';
    }
  });
}

function isValidDateFormat(dateString) {
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const match = dateString.match(regex);
  if (!match) return false;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < new Date().getFullYear()) return false;

  const date = new Date(year, month - 1, day);
  return date.getDate() === day && date.getMonth() === month - 1 && date.getFullYear() === year;
}



function toggleSavingsType() {
  const savingsType = document.getElementById('savingsType')?.value;
  const progressiveGroup = document.getElementById('progressiveGroup');
  if (progressiveGroup) {
    progressiveGroup.style.display = (savingsType === 'progressive') ? 'block' : 'none';
  }
}

function defaultTargetDate(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return formatDateForInput(d);
}

function clearGoalForm() {
  const form = document.getElementById('goalForm');
  if (form) form.reset();  // מחזיר לערכי ברירת־המחדל שב-HTML

  // תיקונים קטנים אחרי reset:
  const dateEl = document.getElementById('goalDate');
  if (dateEl) {            // תאריך יעד מחדש + ניקוי עיצוב שגיאה
    dateEl.value = defaultTargetDate(0);
    dateEl.style.borderColor = '';
    dateEl.style.boxShadow = '';
  }

  // עדכון תצוגת קבוצה מתקדמת לפי value נוכחי של select
  if (typeof toggleSavingsType === 'function') toggleSavingsType();

  // ניקוי רשימת בונוסים זמניים (אם אתה משתמש בה)
  if (typeof UIBonusesEditor !== 'undefined') UIBonusesEditor.clear();
}

function wireSettingsListeners() {
  const inflationEl     = document.getElementById('inflationPct');
  const realModeEl      = document.getElementById('computeReal');
  const incomeEl        = document.getElementById('monthlyIncome'); // שדה "הפקדה חודשית כללית"?
  const globalSavedEl   = document.getElementById('globalSaved');
  const annualRateEl    = document.getElementById('globalAnnualRate');
  const depositInputEl  = document.getElementById('generalMonthlyDeposit');
  
  // אינפלציה שנתית (%)
  if (inflationEl) {
	  // רק לעדכן תצוגה תוך כדי הקלדה (לא לשנות ערך באמצע)
	  inflationEl.addEventListener('input', () => {
		// כאן לא עושים parseFloat בכלל
	  });

	  // בעת סיום עריכה (change או blur) נשמור בהגדרות
	  inflationEl.addEventListener('change', () => {
		const raw = String(inflationEl.value).replace(/[^\d.\-\.]/g,'');
		const normalized = raw.replace(/(\..*)\./g, '$1'); // נקודה אחת בלבד
		const v = parseFloat(normalized);
		SettingsStore.set({ inflationAnnualPct: Number.isFinite(v) ? v : 0 });
		// אופציונלי: לעגל להצגה
		inflationEl.value = Number.isFinite(v) ? v.toFixed(2) : '';
	  });
	}

  // מצב ריאלי (חישוב ריאלי מול נומינלי)
  if (realModeEl) {
    realModeEl.addEventListener('change', () => {
      SettingsStore.set({ computeReal: !!realModeEl.checked });
    });
  }
  
  if (depositInputEl) {
	  UIMoneyInputs.attachMoneyFormatter('#generalMonthlyDeposit');
	  depositInputEl.addEventListener('input', () => {
		const v = MoneyInput.parseNumberLoose(depositInputEl.value);
		SettingsStore.set({
		  generalMonthlyDeposit: Number.isFinite(v) ? v : 0
		});
		// אופציונלי: הודעה קטנה
		// UIMessages.show({ type:'info', title:'מידע', message:'עודכנה ההפקדה החודשית הכללית' });
	  });
	}


  // הכנסה/הפקדה חודשית כללית
  // הכנסה/שכר חודשי (מידע בלבד – לא משפיע על freeMonthlyDeposit)
	if (incomeEl) {
	  UIMoneyInputs.attachMoneyFormatter('#monthlyIncome');
	  incomeEl.addEventListener('input', () => {
		const v = MoneyInput.parseNumberLoose(incomeEl.value);
		SettingsStore.set({
		  monthlyIncome: Number.isFinite(v) ? v : 0
		});
	  });
	}


  // הון גלובלי נוכחי (אם קיים אצלך כרעיון תצוגה/חישוב)
  if (globalSavedEl) {
    UIMoneyInputs.attachMoneyFormatter('#globalSaved');
    globalSavedEl.addEventListener('input', () => {
      const v = MoneyInput.parseNumberLoose(globalSavedEl.value);
      SettingsStore.set({ globalSaved: Number.isFinite(v) ? v : 0 });
    });
  }

  // ריבית שנתית גלובלית
  if (annualRateEl) {
    annualRateEl.value = String(SettingsStore.get().globalAnnualRate ?? 0);
    annualRateEl.addEventListener('input', (e) => {
      const raw = Number(String(e.target.value).replace(/[^\d.\-]/g,'')) || 0;
      // אופציונלי: הגבלת טווח 0–50%
      const clamped = Math.max(0, Math.min(50, raw));
      const v2 = +clamped.toFixed(2);
      SettingsStore.set({ globalAnnualRate: v2 });
      e.target.value = String(v2); // משקף חזרה לשדה
    });
  }

  // עריכת הפקדה חודשית למטרה בזמן אמת (inline edit)
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.matches('#editMonthlyPayment')) return;
    const goalId = window.__editingGoalId; // אם יש לך מזהה גלובלי של מטרה בעריכה
    const newValue = MoneyInput.parseNumberLoose(el.value);
    onUpdateGoalMonthlyPayment(goalId, Number.isFinite(newValue) ? newValue : 0);
  });
}

// מעדכן הפקדה חודשית של מטרה
function onUpdateGoalMonthlyPayment(goalId, value) {
  if (!goalId) {
    UIMessages.show({ type:'error', title:'שגיאה', message:'מטרה לעריכה לא נמצאה.' });
    return;
  }
  const v = Math.max(0, Number(value) || 0);
  GoalsStore.upsert({ id: goalId, monthlyPayment: v });
  UIMessages.show({ type:'info', title:'מידע', message:'הפקדה חודשית עודכנה.' });
}

function prefillSettingsForm() {
  const s = SettingsStore.get();

  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };

  setVal('inflationPct', String(s.inflationAnnualPct ?? 0));
  setChk('computeReal', !!s.computeReal);
  setVal('globalAnnualRate', String(s.globalAnnualRate ?? 0));

  // שדות כסף (ללא ₪ — פורמט עם פסיקים):
  const fmt = n => MoneyInput.formatWithCommasPlain(String(Number(n)||0));
  setVal('monthlyIncome', s.monthlyIncome ? fmt(s.monthlyIncome) : '');
  setVal('generalMonthlyDeposit', s.generalMonthlyDeposit ? fmt(s.generalMonthlyDeposit) : '');
  setVal('globalSaved', s.globalSaved ? fmt(s.globalSaved) : '');

  // אם יש תלות תצוגה (למשל progressiveGroup):
  if (typeof toggleSavingsType === 'function') toggleSavingsType();

  // הפעלת המסכות אחרי שמילאנו ערכים
  UIMoneyInputs.attachMoneyFormatter('#monthlyIncome');
  UIMoneyInputs.attachMoneyFormatter('#generalMonthlyDeposit');
  UIMoneyInputs.attachMoneyFormatter('#globalSaved');
}


async function collectFullReportData() {
  const data = {};

  // פרטי לקוח/יועץ (נשאר מה־DOM כי זה לא מאוחסן ב־Store)
  data.clientName = document.getElementById('clientName')?.value || '';
  data.advisorName = document.getElementById('advisorName')?.value || '';

  // מטרות מה־GoalsStore
  data.goals = GoalsStore.list();  // מחזיר את כל המטרות מה־localStorage

  // הגדרות כלליות מה־SettingsStore
  data.settings = SettingsStore.get();

  // נגזרות (Derived)
  data.derived = {
    monthlyAssigned: Derived.monthlyAssigned(),
    monthlyUnassigned: Derived.monthlyUnassigned(),
  };

  // טבלת בונוסים (אם קיימת ב־DOM)
  const bonusTable = document.getElementById('bonusTable');
  data.bonusTableHTML = bonusTable ? bonusTable.outerHTML : '';

  // טבלאות נוספות (אם יש באפליקציה)
  const extraTables = ['allocationTable', 'sensitivityTable', 'resultsTable'];
  data.extraTables = {};
  extraTables.forEach(id => {
    const el = document.getElementById(id);
    if (el) data.extraTables[id] = el.outerHTML;
  });

  // צילום גרפים
  const chartImages = {};
  const savingsCanvas = document.getElementById('savingsChart');
  if (savingsCanvas) chartImages.savingsChart = savingsCanvas.toDataURL('image/png');
  const cashflowCanvas = document.getElementById('cashflowChart');
  if (cashflowCanvas) chartImages.cashflowChart = cashflowCanvas.toDataURL('image/png');

  return { data, chartImages };
}



export const UIBindings = {
  init() {
    
    Bus.on('settings:changed', () => { UISettings.render() ; updateFreeMonthlyDepositUI(); UISummary.render();});
    Bus.on('goals:changed', () => { UIKPIs.refreshFreeMonthlyDepositBadge(); UIGoalsList.render(); updateFreeMonthlyDepositUI(); UISummary.render(); });

	prefillSettingsForm();   // ← מילוי ערכי settings לשדות

    UIGoalsList.mount('goalsList');
	
	UIMoneyInputs.attachMoneyFormatter('[data-format="money"]');
	
	// חדש: הפעלת שדה תאריך
    setupDateInput(0);
	
	// savingsType selector
    const typeSelect = document.getElementById('savingsType');
    typeSelect?.addEventListener('change', toggleSavingsType);

    // קריאה ראשונית כדי ליישר מצב ברירת מחדל
    toggleSavingsType();
	
	UICharts.init();
	
	// כפתור פתיחת מודאל
    const openBonusBtn = document.getElementById('openBonusModalBtn');
    if (openBonusBtn) {
      openBonusBtn.addEventListener('click', () => UIBonusesModal.open());
    }
	
	const closeGoalEditorBtn = document.getElementById('closeGoalEditorBtn');
    if (closeGoalEditorBtn) {
      closeGoalEditorBtn.addEventListener('click', () => UIGoalEditor.close());
    }
	
	const saveGoalEditBtn = document.getElementById('saveGoalEditBtn');
    if (saveGoalEditBtn) {
      saveGoalEditBtn.addEventListener('click', () => UIGoalEditor.save());
    }
	
	const quickAddBonusBtn = document.getElementById('quickAddBonusBtn');
    if (quickAddBonusBtn) {
	quickAddBonusBtn.addEventListener('click', () => UIBonusesModal.open({node: 'add'}));
    }
	
	const optimizeBtn = document.getElementById('optimizeBtn');
	if (optimizeBtn) {
	  optimizeBtn.addEventListener('click', () => {
		const modeSelect = document.getElementById('optimizeModeToggle');
		const mode = modeSelect ? modeSelect.value : 'surplus';

		// קריאה לפונקציה הראשית עם mode
		runImprovedOptimization(mode);
	  });
	}
	
	const applyOptimizationBtn = document.getElementById('applyOptimization');
	if (applyOptimizationBtn) {
	  applyOptimizationBtn.addEventListener('click', () => applyOptimization());
	}
	
	const hideOptimizationBtn = document.getElementById('hideOptimization');
	if (hideOptimizationBtn) {
	  hideOptimizationBtn.addEventListener('click', () => hideOptimization());
	}
	
	const exportPdfBtnBtn = document.getElementById('exportPdfBtn');
	if (exportPdfBtnBtn) {
	  exportPdfBtnBtn.addEventListener('click', () => {
		exportCurrentReport({ mode: 'html' });
	  });
	}
		
	// ... מאזינים אחרים ...
    initBonusesUI(); // מפעיל את רשימת הבונוסים
	
	// מודאל הבונוס
    UIBonusesModal.init();
	
	wireSettingsListeners();
	
	setupNewEventListeners();
	
	UIGoalsRichList.mount('goalsList');   // זהה ל־ID שב-HTML שלך
	UISettings.mount();
	
	UIKPIs.refreshFreeMonthlyDepositBadge();
	
	mountResetAll();
	
	updateFreeMonthlyDepositUI();
	
	// ... קוד קיים (מסכות, מאזינים, מודאלים, רשימות) ...
    UISummary.mount(); // ← ירנדר מיד, ויתעדכן על goals/settings change
	
	UICharts.mount();
	
	
	const addBtn = document.getElementById('addGoalBtn');
	if (!addBtn) return;

	addBtn.addEventListener('click', () => {
	const nameEl            = document.getElementById('goalName');
	const amountEl          = document.getElementById('goalAmount');
	const rateEl            = document.getElementById('goalRate');
	const existingEl        = document.getElementById('goalExistingCapital'); // <<< תיקון ה-ID
	const dateEl            = document.getElementById('goalDate');

	// שדות סוג חיסכון הדרגתי
	const savingsTypeEl     = document.getElementById('savingsType');
	const monthlyIncEl      = document.getElementById('monthlyIncrease');

	// קריאה נקייה מהשדות
	const name            = (nameEl?.value || '').trim() || 'מטרה חדשה';
	const amount          = MoneyUtil.coerce(amountEl);
    const monthlyIncrease = Math.max(0, MoneyUtil.coerce(monthlyIncEl));
	const rateAnnual      = Number(rateEl?.value) || 0;
    const existingCapital = MoneyUtil.coerce(existingEl);
	const dateStr         = (dateEl?.value || '').trim();

	const savingsType     = (savingsTypeEl?.value || 'fixed'); // 'fixed' | 'progressive'

	// ולידציה בסיסית
	if (!amount || amount <= 0) {
	  UIMessages.show({ type:'error', title:'שגיאה', message:'סכום יעד חייב להיות גדול מאפס.' });
	  amountEl?.focus();
	  return;
	}
	if (!Number.isFinite(rateAnnual)) {
	  UIMessages.show({ type:'error', title:'שגיאה', message:'יש להזין ריבית שנתית (אפשר גם 0).' });
	  rateEl?.focus();
	  return;
	}
	if (!dateStr || !isValidDateFormat(dateStr)) {
	  UIMessages.show({ type:'error', title:'שגיאה', message:'תאריך יעד לא תקין. פורמט נדרש: DD/MM/YYYY' });
	  if (dateEl) { dateEl.style.borderColor = 'var(--danger)'; dateEl.focus(); }
	  return;
	}

	const targetDate = parseDateDDMMYYYY(dateStr);
	if (!targetDate) {
	  UIMessages.show({ type:'error', title:'שגיאה', message:'לא ניתן לפרסר את התאריך. בדקו את היום/חודש/שנה.' });
	  dateEl?.focus();
	  return;
	}

	// בונוסים מה־UI
	const bonuses = UIBonusesEditor.get();
	const normBonuses = (Array.isArray(bonuses) ? bonuses : [])
	  .map(b => ({
		month: Math.max(1, Math.floor(Number(b?.month) || 0)),
		amount: Number(b?.amount) || 0
	  }))
	  .filter(b => b.month >= 1 && Number.isFinite(b.amount) && b.amount !== 0);

	// settings (למצב ריאלי/נומינלי, אינפלציה וכו')
	const settings = (window.SettingsStore?.get?.() || {});

	// אובייקט זמני לחישוב התשלום החודשי (כולל סוג חיסכון ועלייה חודשית!)
	const tempGoal = {
	  id: Date.now(),
	  name,
	  amount,
	  rateAnnual,
	  targetDate,
	  existingCapital,
	  bonuses: normBonuses,
	  savingsType,        // <<< נשמר
	  monthlyIncrease     // <<< נשמר
	  // אם בעתיד יתווסף initialAmount — שמור כאן גם אותו
	};

	// חישוב ושמירה של החיסכון החודשי בפועל
	let monthlyPayment = 0;
	try {
	  monthlyPayment = Math.ceil(computeGoalDisplayPayment(tempGoal, settings));
	} catch (e) {
	  console.warn('computeGoalDisplayPayment error:', e);
	  monthlyPayment = 0;
	}

	// יצירת המטרה ושמירה
	const goal = {
	  ...tempGoal,
	  monthlyPayment // נשמר הערך המחושב בפועל
	};

	GoalsStore.upsert(goal);

	UIMessages.show({
	  type: 'info',
	  title: 'מידע',
	  message: `המטרה נוספה${normBonuses.length ? ` (${normBonuses.length} בונוס/ים)` : ''}`
	});

	// ניקוי הבונוסים הזמניים והטופס
	UIBonusesEditor.clear();
	if (dateEl) dateEl.style.borderColor = '';
	clearGoalForm?.();

	// רענון תצוגה (אם יש לך פונקציה כזו)
	if (typeof updateDisplay === 'function') updateDisplay();
	});


		
  }
};
