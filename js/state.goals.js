// state.goals.js
import { Bus } from './core.bus.js';

const STORAGE_KEY = 'goals.v1';

function genId() {
  return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

// המרה מה־storage לאובייקט "חי"
function reviveGoal(raw) {
  const g = { ...(raw || {}) };
  g.id              = g.id || genId();
  g.name            = String(g.name || 'מטרה');
  g.amount          = Number(g.amount) || 0;
  g.rateAnnual      = Number(g.rateAnnual) || 0;
  g.monthlyPayment  = Number(g.monthlyPayment) || 0;
  g.savingsType     = g.savingsType || 'fixed';         // 'fixed' | 'progressive'
  g.monthlyIncrease = Number(g.monthlyIncrease) || 0;
  g.existingCapital = Number(g.existingCapital) || 0;
  g.calculationMode = g.calculationMode || 'standard';  // 'standard'|'amount_payment'|'date_payment'

  // תאריך יעד
  if (g.targetDate instanceof Date) {
    // ok
  } else if (typeof g.targetDate === 'string' || typeof g.targetDate === 'number') {
    const d = new Date(g.targetDate);
    g.targetDate = isNaN(d) ? new Date() : d;
  } else {
    g.targetDate = new Date();
  }

  // בונוסים
  g.bonuses = Array.isArray(g.bonuses) ? g.bonuses.map(b => ({
    month:  Math.max(1, parseInt(b?.month, 10) || 0),
    amount: Number(b?.amount) || 0,
    desc:   b?.desc ? String(b.desc) : ''
  })) : [];

  return g;
}

// המרה ל־storage (ללא אובייקטי Date)
function serializeGoal(g) {
  return {
    id: g.id,
    name: g.name,
    amount: g.amount,
    rateAnnual: g.rateAnnual,
    monthlyPayment: g.monthlyPayment,
    savingsType: g.savingsType,
    monthlyIncrease: g.monthlyIncrease,
    existingCapital: g.existingCapital,
    calculationMode: g.calculationMode,
    targetDate: (g.targetDate instanceof Date) ? g.targetDate.toISOString() : g.targetDate,
    bonuses: Array.isArray(g.bonuses) ? g.bonuses.map(b => ({
      month: b.month, amount: b.amount, desc: b.desc || ''
    })) : []
  };
}

let goals = [];

  const clone = g => ({ ...g });

  function normalizeId(id) {
    return String(id ?? '').trim();
  }
  
// קריאה ושמירה
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals.map(serializeGoal)));
  } catch {}
}

function load() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const arr = s ? JSON.parse(s) : [];
    goals = Array.isArray(arr) ? arr.map(reviveGoal) : [];
  } catch {
    goals = [];
  }
}

// טען מיד עם ייבוא המודול
load();

// סנכרון בין טאבים
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      load();
      Bus.emit('goals:changed', goals.map(g => ({ ...g })));
    }
  });
}

export const GoalsStore = {
	

  init() { load(); return this.list(); },

  list() {
    // החזר העתק “קר” לעולם החיצון
    return goals.map(g => ({ ...g, targetDate: new Date(g.targetDate) }));
  },

  getById(id) {
      const key = normalizeId(id);
      const g = goals.find(x => normalizeId(x.id) === key);
      return g ? clone(g) : null;
    },

  upsert(gIn) {
    const g = reviveGoal({ ...gIn, id: gIn?.id || genId() });
    const i = goals.findIndex(x => x.id === g.id);
    if (i >= 0) goals[i] = { ...goals[i], ...g };
    else goals.push(g);
    save();
    Bus.emit('goals:changed', goals.map(x => ({ ...x })));
    return this.getById(g.id);
  },

  remove(id) {
    goals = goals.filter(g => g.id !== id);
    save();
    Bus.emit('goals:changed', goals.map(x => ({ ...x })));
  },

  clear() {
    goals = [];
    save();
    Bus.emit('goals:changed', []);
    return [];
  },

  replaceAll(newGoals) {
    goals = Array.isArray(newGoals) ? newGoals.map(reviveGoal) : [];
    save();
    Bus.emit('goals:changed', goals.map(x => ({ ...x })));
    return this.list();
  },

  export() {
    return goals.map(serializeGoal);
  },

  import(jsonArray, { replace = false } = {}) {
    const arr = Array.isArray(jsonArray) ? jsonArray : [];
    if (replace) goals = arr.map(reviveGoal);
    else goals = goals.concat(arr.map(reviveGoal));
    save();
    Bus.emit('goals:changed', goals.map(x => ({ ...x })));
    return this.list();
  }
};
