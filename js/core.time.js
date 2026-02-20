// core.time.js
function normalizeLocalDate(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 12, 0, 0, 0);
}

// פרסר בטוח ל-DD/MM/YYYY
export function toDateSafe(x) {
  if (x instanceof Date) return isNaN(x) ? null : x;

  if (typeof x === 'string') {
    const s = x.trim();
    // פורמט dd/mm/yyyy (או dd-mm-yyyy / dd.mm.yyyy)
    const m = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      return isNaN(d) ? null : d;
    }
    // ניסיון פרס סטנדרטי (ISO או מקומי)
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  if (typeof x === 'number') {
    const d = new Date(x);
    return isNaN(d) ? null : d;
  }

  return null;
}

export function formatDateForInput(d) {
  const dt = toDateSafe(d);
  if (!dt) return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ui.bindings.js (תוספות למעלה, ליד ה-helpers הקיימים)
export function parseDateDDMMYYYY(dateStr) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dateStr||''));
  if (!m) return null;
  const [_, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm)-1, Number(dd), 12, 0, 0); // 12:00 למניעת הטיות אזור זמן
  // אימות שלא "התגלגל" (למשל 31/02)
  if (d.getFullYear() !== Number(yyyy) || (d.getMonth()+1) !== Number(mm) || d.getDate() !== Number(dd)) return null;
  return d;
}

// חודשים: 'ceil' ברירת מחדל (כל חלק חודש נספר)
export function monthsBetween(fromDate, toDate, mode = 'ceil') {
  const d1 = normalizeLocalDate(fromDate);
  const d2 = normalizeLocalDate(toDate);
  if (isNaN(d1) || isNaN(d2) || d2 <= d1) return 0;

  let m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());

  if (mode === 'floor') {
    if (d2.getDate() < d1.getDate()) m -= 1;      // חודשים מלאים בלבד
  } else {
    if (d2.getDate() > d1.getDate()) m += 1;      // שים לב: '>' ולא '>='
  }
  return Math.max(0, m);
}
