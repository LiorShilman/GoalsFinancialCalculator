// js/engine.rates.js
export function effectiveAnnualRate(nominalAnnualRatePct, computeRealMode = false, inflationAnnualPct = 0) {
  const i  = (Number(nominalAnnualRatePct) || 0) / 100;
  if (!computeRealMode) return i;
  const pi = Math.max(0, (Number(inflationAnnualPct) || 0) / 100);
  return (1 + i) / (1 + pi) - 1;
}

export function annualToMonthlyRate(annualEffectiveAsDecimal) {
  return Math.pow(1 + (Number(annualEffectiveAsDecimal) || 0), 1 / 12) - 1;
}

// תאימות לקוד שקורא ל-Rates.annualEffective / Rates.toMonthly
export const Rates = {
  annualEffective: (nominalAnnualRatePct, computeReal, inflationAnnualPct) =>
    effectiveAnnualRate(nominalAnnualRatePct, computeReal, inflationAnnualPct),
  toMonthly: annualToMonthlyRate,
};