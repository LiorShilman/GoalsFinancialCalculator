// js/ui/ui.rule72.js
import { formatRule72 } from '../engine.roi.js';

// חישוב שנים לפי כלל 72
function computeRule72Years(ratePct) {
  const r = Number(String(ratePct).replace(/[^\d.]/g, '')) || 0;
  return r > 0 ? (72 / r).toFixed(1) : 'N/A';
}

// רינדור התוצאה (אם יש לך formatRule72 מוכן – עדיף לייבא ולהשתמש בו)
function renderRule72(outPretty, outInput, years) {
  const pretty = formatRule72(years);
  const plain  = years === 'N/A' ? 'לא רלוונטי' : `${years} שנים`;
  if (outPretty) outPretty.innerHTML = pretty;
  if (outInput)  outInput.value = plain;
}

// קלאסיפיקציה לאפקט עיצובי על ה-input (אופציונלי)
function classifyRule72(years) {
  if (years === 'N/A') return { cls: 'rule72--na', icon: 'ℹ️' };
  const y = parseFloat(years);
  if (!Number.isFinite(y)) return { cls: 'rule72--na', icon: 'ℹ️' };
  if (y <= 8)  return { cls: 'rule72--excellent', icon: '🚀' };
  if (y <= 15) return { cls: 'rule72--ok',        icon: '⏳' };
  if (y <= 30) return { cls: 'rule72--weak',      icon: '📊' };
  return { cls: 'rule72--bad', icon: '🐌' };
}

export function updateRule72() {
  const rateInput       = document.getElementById('rule72Rate');
  const resultInput     = document.getElementById('rule72Result');
  // אלמנטים אופציונליים – יעדכנו רק אם קיימים:
  const yearsSpan       = document.getElementById('rule72Years');
  const displayRateSpan = document.getElementById('rule72DisplayRate');

  // דרישות חובה: יש קלט לריבית ויש שדה תוצאה
  if (!rateInput || !resultInput) return;

  const rate = Number(String(rateInput.value).replace(/[^\d.]/g, '')) || 0;

  if (rate > 0) {
    const years = (72 / rate).toFixed(1);

    // מציגים בטקסט ה-input (כולל אמוג׳י אם רוצים עיצוב עשיר)
    const { cls, icon } = classifyRule72(years);
    resultInput.value = `${icon} ${years} שנים`;

    // נקה מחלקות ישנות והוסף החדשה (אם הגדרת CSS למצבים)
    resultInput.classList.remove('rule72--excellent','rule72--ok','rule72--weak','rule72--bad','rule72--na');
    resultInput.classList.add(cls);

    // עדכון אופציונלי של ה-spanים, רק אם קיימים בדף
    if (yearsSpan)       yearsSpan.textContent       = years;
    if (displayRateSpan) displayRateSpan.textContent = rate.toFixed(1) + '%';

  } else {
    // אין ריבית → איפוס
    resultInput.value = 'לא רלוונטי';
    resultInput.classList.remove('rule72--excellent','rule72--ok','rule72--weak','rule72--bad');
    resultInput.classList.add('rule72--na');

    if (yearsSpan)       yearsSpan.textContent       = '0';
    if (displayRateSpan) displayRateSpan.textContent = '0%';
  }
}

// חיבור מאזינים
export function setupNewEventListeners() {
  const rule72Input = document.getElementById('rule72Rate');
  if (!rule72Input) return;

  const handler = () => updateRule72();
  rule72Input.addEventListener('input', handler);
  rule72Input.addEventListener('change', handler);

  // חישוב ראשוני בעת טעינה
  handler();
}
