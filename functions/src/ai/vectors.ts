import type { AiNeighbor } from '../model.js';

type Vecs = Map<string, number[]>;

const sortedIds = (v: Vecs): string[] => [...v.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const dot = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function cosine(a: number[], b: number[]): number {
  const na = Math.sqrt(dot(a, a));
  const nb = Math.sqrt(dot(b, b));
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function clusterCount(n: number): number {
  return Math.min(10, Math.max(1, Math.round(Math.sqrt(n / 2))));
}

export function nearest(vectors: Vecs, k: number): Map<string, AiNeighbor[]> {
  const ids = sortedIds(vectors);
  const out = new Map<string, AiNeighbor[]>();
  for (const id of ids) {
    const a = vectors.get(id)!;
    const list: AiNeighbor[] = [];
    for (const other of ids) {
      if (other === id) continue;
      list.push({ id: other, score: cosine(a, vectors.get(other)!) });
    }
    list.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    out.set(id, list.slice(0, Math.max(0, k)));
  }
  return out;
}

const ITERATIONS = 200;

function normalize(v: number[]): number {
  const n = Math.sqrt(dot(v, v));
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return n;
}

/** Top eigenvector of XᵀX by power iteration, kept orthogonal to `against`. Null if degenerate. */
function topComponent(X: number[][], d: number, against: number[] | null): number[] | null {
  // Fixed, non-uniform start so it is not orthogonal to the target by accident.
  const v = Array.from({ length: d }, (_, i) => 1 + Math.sin(i + 1));
  const orth = () => {
    if (!against) return;
    const p = dot(v, against);
    for (let i = 0; i < d; i++) v[i] -= p * against[i];
  };
  orth();
  if (normalize(v) === 0) return null;
  for (let it = 0; it < ITERATIONS; it++) {
    const w = new Array<number>(d).fill(0);
    for (const row of X) {
      const s = dot(row, v);
      for (let i = 0; i < d; i++) w[i] += row[i] * s;
    }
    for (let i = 0; i < d; i++) v[i] = w[i];
    orth();
    if (normalize(v) === 0) return null;
  }
  return v;
}

export function project2d(vectors: Vecs): Map<string, { x: number; y: number }> {
  const ids = sortedIds(vectors);
  const out = new Map<string, { x: number; y: number }>();
  const n = ids.length;
  if (n === 0) return out;
  const d = vectors.get(ids[0])!.length;
  const mean = new Array<number>(d).fill(0);
  for (const id of ids) vectors.get(id)!.forEach((x, i) => (mean[i] += x / n));
  const X = ids.map((id) => vectors.get(id)!.map((x, i) => x - mean[i]));

  const pc1 = d > 0 ? topComponent(X, d, null) : null;
  const pc2 = pc1 ? topComponent(X, d, pc1) : null;
  const raw = X.map((row) => [pc1 ? dot(row, pc1) : 0, pc2 ? dot(row, pc2) : 0]);

  // Sign: the point with the largest-magnitude score on each axis is positive (first id wins ties).
  // Fixing the sign on scores rather than loadings keeps the output identical when every vector is negated.
  for (let axis = 0; axis < 2; axis++) {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(raw[i][axis]) > Math.abs(raw[best][axis]) + 1e-9) best = i;
    if (raw[best][axis] < 0) for (const r of raw) r[axis] = -r[axis];
  }

  for (let axis = 0; axis < 2; axis++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of raw) { lo = Math.min(lo, r[axis]); hi = Math.max(hi, r[axis]); }
    const range = hi - lo;
    for (const r of raw) r[axis] = range > 1e-12 ? (r[axis] - lo) / range : 0.5;
  }
  ids.forEach((id, i) => out.set(id, { x: raw[i][0], y: raw[i][1] }));
  return out;
}

export function kmeans(vectors: Vecs, k: number): Map<string, number> {
  const ids = sortedIds(vectors);
  const out = new Map<string, number>();
  const n = ids.length;
  if (n === 0) return out;
  k = Math.max(1, Math.min(Math.floor(k), n));
  const unit = ids.map((id) => {
    const v = [...vectors.get(id)!];
    normalize(v);
    return v;
  });
  const dist = (a: number[], b: number[]) => 1 - dot(a, b);

  // Farthest-point init from the first id in sorted order; ties go to the lowest index.
  const centers: number[][] = [unit[0]];
  const chosen = new Set<number>([0]);
  while (centers.length < k) {
    let bestI = -1;
    let bestD = -Infinity;
    for (let i = 0; i < n; i++) {
      if (chosen.has(i)) continue;
      const dmin = Math.min(...centers.map((c) => dist(unit[i], c)));
      if (dmin > bestD + 1e-12) { bestD = dmin; bestI = i; }
    }
    chosen.add(bestI);
    centers.push(unit[bestI]);
  }

  const assign = new Array<number>(n).fill(-1);
  for (let it = 0; it < 50; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bc = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = dist(unit[i], centers[c]);
        if (dd < bd - 1e-12) { bd = dd; bc = c; }
      }
      if (assign[i] !== bc) { assign[i] = bc; changed = true; }
    }
    if (!changed) break;
    const dim = unit[0].length;
    for (let c = 0; c < k; c++) {
      const sum = new Array<number>(dim).fill(0);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assign[i] !== c) continue;
        count++;
        for (let j = 0; j < dim; j++) sum[j] += unit[i][j];
      }
      if (count > 0 && normalize(sum) > 0) centers[c] = sum;
    }
  }
  ids.forEach((id, i) => out.set(id, assign[i]));
  return out;
}
