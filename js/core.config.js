// core.config.js
export const Config = {
  appName: 'Financial Goals Pro',
  locale: 'he-IL',
  ROI_BANDS: [
    { min: -Infinity, max: 0, cls: 'roi-bad',       label: 'שלילי' },  // < 0%
    { min: 0,         max: 2, cls: 'roi-weak',      label: 'נמוך'  },  // 0–2%
    { min: 2,         max: 5, cls: 'roi-ok',        label: 'סביר'  },  // 2–5%
    { min: 5,         max: 8, cls: 'roi-good',      label: 'טוב'   },  // 5–8%
    { min: 8,         max: Infinity, cls: 'roi-excellent', label: 'מצוין' } // ≥8%
  ]
};