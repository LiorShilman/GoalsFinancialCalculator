// ui.resetAll.js
import { GoalsStore } from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { UIMessages } from '../ui/ui.messages.js';

export function mountResetAll() {
  const btn = document.getElementById('resetBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const ok = confirm('בטוח/ה? זה ימחק את כל הנתונים המקומיים (מטרות, הגדרות, בונוסים, רגישות). הפעולה בלתי הפיכה.');
    if (!ok) return;

    try {
      // איפוס stores (ישגרו אירועים שיגררו עדכון UI)
      GoalsStore.clear?.();
      SettingsStore.clear?.();

      // מחיקת מפתחות מה־localStorage
      const knownKeys = [
        'goals','goals:v2','settings','settings:v2',
        '__lastSensitivityResults','currentRateChange','appState'
      ];
      knownKeys.forEach(k => localStorage.removeItem(k));

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (/^(finapp:|goals|settings|sensitivity|calc:)/.test(key)) {
          localStorage.removeItem(key);
        }
      }

      // איפוס sessionStorage
      sessionStorage?.clear?.();

      // מחיקת IndexedDB (אופציונלי)
      if (indexedDB?.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all((dbs || []).map(db => db?.name && new Promise(res => {
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = req.onerror = req.onblocked = () => res();
        })));
      }

      // ניקוי state זמני
      window.currentRateChange = 0;
      window.__lastSensitivityResults = null;

      // איפוס תצוגה נקודתית
      if (window.goalsPie?.destroy) { window.goalsPie.destroy(); window.goalsPie = null; }
      if (typeof UIBonusesEditor?.clear === 'function') UIBonusesEditor.clear();
      if (typeof clearGoalForm === 'function') clearGoalForm();

      const goalsList = document.getElementById('goalsList');
      if (goalsList) {
        goalsList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-text">טרם הוגדרו מטרות — הוסף/י את המטרה הראשונה שלך</div>
          </div>`;
      }

      // הודעה למשתמש
      UIMessages?.show?.({ type:'info', title:'איפוס בוצע', message:'כל הנתונים נמחקו ממכשיר זה.' })
        ?? alert('איפוס בוצע: כל הנתונים נמחקו.');
    } catch (err) {
      console.error(err);
      UIMessages?.show?.({ type:'error', title:'שגיאה', message:'אירעה שגיאה במחיקת הנתונים. ראו קונסול.' })
        ?? alert('שגיאה במחיקת הנתונים. ראה קונסול.');
    }
  });
}
