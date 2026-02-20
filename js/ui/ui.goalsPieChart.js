import { GoalsStore } from '../state.goals.js';
import { SettingsStore } from '../state.settings.js';
import { computeGoalDisplayPayment } from '../engine.calculator.js';
import { Bus } from '../core.bus.js'; // אם יש לך Bus לאירועים
import { Money } from '../core.money.js';
import { computeGoalViewModel } from './ui.goalsRichList.js';


let chart = null;
let currentMode = 'monthly';

function getGoalMonthly(g, settings) {
  const explicit = Number(g?.monthlyPayment);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  try {
    const computed = Number(computeGoalDisplayPayment?.(g, settings));
    if (Number.isFinite(computed) && computed > 0) return Math.ceil(computed);
  } catch {}
  return 0;
}

function buildChartData(goals, settings, mode) {
  const totalDeposit = Number(settings.generalMonthlyDeposit) || 0;

  const perGoal = goals.map(g => {
    const vm = computeGoalViewModel(g, settings, new Date());
    return {
      name: g?.name || 'מטרה',
      value: mode === 'future'
        ? Math.max(0, vm.calculatedFutureValue)
        : Math.max(0, vm.displayPayment)
    };
  });

  const sumGoals = perGoal.reduce((s, x) => s + x.value, 0);
  const baseForPct = (mode === 'monthly' && totalDeposit > 0) ? totalDeposit : sumGoals;
  const unassigned = (mode === 'monthly' && totalDeposit > 0)
    ? Math.max(0, totalDeposit - sumGoals)
    : 0;

  const labels = [];
  const data   = [];

  for (const x of perGoal) {
    if (x.value > 0) {
      const pct = baseForPct > 0 ? ((x.value / baseForPct) * 100).toFixed(1) : '0.0';
      labels.push(`${x.name} (${pct}%)`);
      data.push(x.value);
    }
  }

  if (unassigned > 0) {
    const pct = ((unassigned / baseForPct) * 100).toFixed(1);
    labels.push(`חופשי / לא מוקצה (${pct}%)`);
    data.push(unassigned);
  }

  return { labels, data, baseForPct, totalDeposit };
}

function toggleChartMode() {
  currentMode = currentMode === 'monthly' ? 'future' : 'monthly';
  renderGoalsPieChart('goalsPieChart', currentMode);

  const btn = document.getElementById('toggleModeBtn');
  if (btn) {
    btn.textContent = `מצב: ${currentMode === 'monthly' ? 'חודשי' : 'ערך עתידי'}`;
    btn.classList.toggle('future', currentMode === 'future');
  }
}

export function renderGoalsPieChart(canvasId = 'goalsPieChart', mode = 'monthly') {
  const el = document.getElementById(canvasId);
  if (!el || !window.Chart) return;

  const goals = GoalsStore.list() || [];
  const settings = SettingsStore.get() || {};

  if (!Array.isArray(goals) || goals.length === 0) {
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  const { labels, data, baseForPct, totalDeposit } = buildChartData(goals, settings, mode);

  if (!data.some(v => v > 0)) {
    if (chart) { chart.destroy(); chart = null; }
    return;
  }

  const palette = ["#06b6d4","#10b981","#f59e0b","#8b5cf6",
                   "#ef4444","#14b8a6","#22c55e","#f97316",
                   "#a855f7","#f43f5e","#9ca3af"];
  const colors = labels.map((_, i) => palette[i % palette.length]);

  if (!chart) {
    // יצירה ראשונית
    chart = new Chart(el.getContext('2d'), {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#222',
          offset: (ctx) => labels[ctx.dataIndex]?.includes('לא מוקצה') ? 25 : 0
        }]
      },
      options: {
        responsive: true,
        animation: {
          duration: 800,       // 🟢🔵 משך אנימציה
          easing: 'easeInOutCubic'
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#fff', font: { weight: 'bold' } }
          },
          title: {
            display: true,
            text: mode === 'future'
              ? 'חלוקת ערכים עתידיים למטרות'
              : 'חלוקת החיסכון החודשי למטרות' + (totalDeposit > 0 ? ' (כולל יתרה)' : ''),
            color: '#fff',
            font: { size: 20, weight: 'bold' }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = Number(ctx.raw) || 0;
                const pct = baseForPct > 0 ? ((value / baseForPct) * 100).toFixed(1) : '0.0';
                return `${ctx.label}: ${Money.format(value)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  } else {
    // עדכון עם אנימציה חלקה
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colors;
    chart.options.plugins.title.text =
      mode === 'future'
        ? 'חלוקת ערכים עתידיים למטרות'
        : 'חלוקת החיסכון החודשי למטרות' + (totalDeposit > 0 ? ' (כולל יתרה)' : '');
    chart.update({
      duration: 800,
      easing: 'easeInOutCubic'
    });
  }
}

export function mountGoalsPieChart(canvasId = 'goalsPieChart') {
  renderGoalsPieChart(canvasId, currentMode);

  const btn = document.getElementById('toggleModeBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      currentMode = currentMode === 'monthly' ? 'future' : 'monthly';
      btn.textContent = `מצב: ${currentMode === 'monthly' ? 'חודשי' : 'ערך עתידי'}`;
      btn.classList.toggle('future', currentMode === 'future');
      renderGoalsPieChart(canvasId, currentMode); // 🟢🔵 מתחלף עם אנימציה
    });
  }

  if (Bus?.on) {
    Bus.on('goals:changed',   () => renderGoalsPieChart(canvasId, currentMode));
    Bus.on('settings:changed', () => renderGoalsPieChart(canvasId, currentMode));
  } else {
    document.addEventListener('store:goals:changed',   () => renderGoalsPieChart(canvasId, currentMode));
    document.addEventListener('store:settings:changed', () => renderGoalsPieChart(canvasId, currentMode));
  }
}