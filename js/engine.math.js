// engine.math.js
export const MathEng = {
  FV_series({ pmt, r, months, initial = 0, bonusesByMonth = {} }) {
    let v = initial, prog = [];
    for (let m = 1; m <= months; m++) {
      v *= (1 + r);
      v += pmt;
      if (bonusesByMonth[m]) v += bonusesByMonth[m];
      prog.push(v);
    }
    return { final: v, progression: prog };
  },
  solvePayment({ targetFV, months, r, initial = 0, bonusesByMonth = {} }) {
    // הרחבת חסם עליון ואז חיפוש בינארי
    const FVgiven = p => MathEng.FV_series({ pmt: p, r, months, initial, bonusesByMonth }).final;
    let lo = 0, hi = Math.max(targetFV / Math.max(1, months), 1000);
    while (FVgiven(hi) < targetFV) {
      hi *= 2;
      if (hi > targetFV * 10 + 1e7) break;
    }
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const val = FVgiven(mid);
      if (val >= targetFV) {
        hi = mid;   // ← במקום (FVgiven(mid) >= targetFV ? hi : lo) = mid
      } else {
        lo = mid;
      }
    }
    return (lo + hi) / 2;
  }
};
