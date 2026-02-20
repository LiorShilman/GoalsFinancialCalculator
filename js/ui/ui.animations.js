// js/ui/ui.animations.js
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

/** אנימציה כללית עם מפַרְמֵט (formatter) */
export function animateValue(el, from, to, durationMs, formatter = (v)=>String(v)) {
  if (!el) return;
  const start = performance.now();
  const total = to - from;

  function frame(now) {
    const p = Math.min(1, (now - start) / durationMs);
    const cur = from + total * easeOutCubic(p);
    el.textContent = formatter(cur);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** בונוס: מפעיל אנימציה על כל .stat-number לפי הטקסט הקיים (אופציונלי) */
export function animateStatNumbers() {
  document.querySelectorAll('.stat-number').forEach((stat, index) => {
    const finalText = stat.textContent.trim();
    stat.textContent = '0';
    setTimeout(() => {
      const isPct = finalText.includes('%');
      const isBillions = /B\b/.test(finalText);
      const hasSlash = finalText.includes('/');

      if (hasSlash) { stat.textContent = finalText; return; }

      const num = parseFloat(finalText.replace(/[^\d.]/g, '')) || 0;
      const suffix = isPct ? '%' : (isBillions ? 'B' : '');

      animateValue(stat, 0, num, 2000, (v) => {
        const rounded = Math.round(v * 10) / 10;
        return `${rounded}${suffix}`;
      });
    }, index * 200);
  });
}
