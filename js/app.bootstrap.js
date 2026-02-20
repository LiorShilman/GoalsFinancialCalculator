console.info('[bootstrap] module loaded');


// app.bootstrap.js
import { Storage } from './core.storage.js';
import { Bus } from './core.bus.js';
import { SettingsStore } from './state.settings.js';
import { GoalsStore } from './state.goals.js';
import { UIBindings } from './ui/ui.bindings.js';
import { UIMessages } from './ui/ui.messages.js';
import { UIBonusesModal } from './ui/ui.bonusesModal.js';
import { UIKaTeX } from './ui/ui.katex.js';
import { mountGoalsPieChart } from './ui/ui.goalsPieChart.js';
import { mountSensitivity } from './ui/ui.sensitivity.js';
import { mountWarnings } from './ui/ui.warnings.js';

window.showSystemMessage = (o) => UIMessages.show(o);
window.showAdvancedMessage = (msg, level='info', opts={}) => UIMessages.showAdvancedMessage(msg, level, opts);


function persist() {
  Storage.save({ settings: SettingsStore.get(), goals: GoalsStore.list() });
}

window.addEventListener('DOMContentLoaded', () => {
  const persisted = Storage.migrate(Storage.load());
  if (persisted.settings) SettingsStore.set(persisted.settings);
  if (Array.isArray(persisted.goals)) persisted.goals.forEach(g => GoalsStore.upsert(g));

  UIKaTeX.render(document.body); // רינדור ראשוני
  
  UIBindings.init();

  Bus.on('settings:changed', persist);
  Bus.on('goals:changed', persist);
  
  const sel = document.getElementById('bonusMonthInput');
  if (!sel || sel.options.length) return;
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= 120; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = i;
    frag.appendChild(opt);
  }
  sel.appendChild(frag);
  
  mountGoalsPieChart('goalsPieChart');
  
  mountSensitivity();
  
  mountWarnings('warningsContainer'); // ודא שיש div עם id זה ב-HTML
  
  
  
});
