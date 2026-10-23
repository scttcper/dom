export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export interface Summary {
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  n: number;
}

export function summarize(xs: number[]): Summary {
  return {
    median: median(xs),
    min: Math.min(...xs),
    max: Math.max(...xs),
    q1: quantile(xs, 0.25),
    q3: quantile(xs, 0.75),
    n: xs.length,
  };
}

/** Compact number formatting: 3 significant-ish digits. */
export function fmt(x: number): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  if (a >= 1) return x.toFixed(2);
  return x.toFixed(3);
}
