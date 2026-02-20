// js/ui/ui.warnings.js
import { GoalsStore } from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { validateFinancialHealth } from '../engine.health.js';
import { Bus } from '../core.bus.js';

function getWarningIcon(type) {
  return ({ danger: '🚨', warning: '⚠️', info: 'ℹ️' }[type] || 'ℹ️');
}

export function displayWarnings(warnings, mountId = 'warningsContainer') {
  const container = document.getElementById(mountId);
  if (!container) return;

  if (!warnings || warnings.length === 0) {
    container.innerHTML = `
      <div class="success-message">
        <div class="success-icon">✅</div>
        <div>הכל נראה בסדר! התכנון הפיננסי שלך מאוזן.</div>
      </div>`;
    return;
  }

  container.innerHTML = warnings.map(w => `
    <div class="warning-item ${w.type} severity-${w.severity}">
      <div class="warning-header">
        <span class="warning-icon">${getWarningIcon(w.type)}</span>
        <strong>${w.title}</strong>
      </div>
      <div class="warning-message">${w.message}</div>
      <div class="warning-suggestion">💡 ${w.suggestion}</div>
    </div>
  `).join('');
}

export function refreshWarnings(mountId = 'warningsContainer') {
  const goals = GoalsStore.list();
  const settings = SettingsStore.get();
  const warnings = validateFinancialHealth(goals, settings);
  displayWarnings(warnings, mountId);
}

// התחברות לאירועים ורענון
export function mountWarnings(mountId = 'warningsContainer') {
  // רינדור ראשון
  refreshWarnings(mountId);

  // רענון אוטומטי כשמשתנה משהו
  if (Bus?.on) {
    Bus.on('goals:changed', () => refreshWarnings(mountId));
    Bus.on('settings:changed', () => refreshWarnings(mountId));
  } else {
    document.addEventListener('store:goals:changed', () => refreshWarnings(mountId));
    document.addEventListener('store:settings:changed', () => refreshWarnings(mountId));
  }
}
