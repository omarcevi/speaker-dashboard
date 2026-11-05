import { describe, it, expect } from 'vitest';
import { cosine, nearest, project2d, kmeans, clusterCount } from '../src/ai/vectors.js';

const m = (o: Record<string, number[]>) => new Map(Object.entries(o));

describe('vectors', () => {
  it('cosine of identical is 1 and orthogonal is 0', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });

  it('nearest excludes self, sorts desc, caps at k', () => {
    const r = nearest(m({ a: [1, 0], b: [0.9, 0.1], c: [0.5, 0.5], d: [0, 1] }), 2);
    for (const [id, ns] of r) {
      expect(ns).toHaveLength(2);
      expect(ns.some((n) => n.id === id)).toBe(false);
      expect(ns[0].score).toBeGreaterThanOrEqual(ns[1].score);
    }
    expect(r.get('a')![0].id).toBe('b');
    expect(r.get('d')![0].id).toBe('c');
  });

  it('project2d is deterministic and sign-stable', () => {
    const v = m({ a: [1, 0, 0], b: [0.8, 0.3, 0.1], c: [0, 1, 0.2], d: [0.1, 0.9, 0.5], e: [0.3, 0.2, 1] });
    const p1 = project2d(v);
    const p2 = project2d(v);
    expect([...p1]).toEqual([...p2]);
    const neg = new Map([...v].map(([k, x]) => [k, x.map((n) => -n)]));
    const p3 = project2d(neg);
    for (const [id, p] of p1) {
      expect(p3.get(id)!.x).toBeCloseTo(p.x, 6);
      expect(p3.get(id)!.y).toBeCloseTo(p.y, 6);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });

  it('kmeans separates two obvious groups', () => {
    const r = kmeans(m({ a1: [1, 0.05], a2: [1, 0.1], a3: [0.95, 0], b1: [0.05, 1], b2: [0.1, 1], b3: [0, 0.95] }), 2);
    expect(r.get('a1')).toBe(r.get('a2'));
    expect(r.get('a1')).toBe(r.get('a3'));
    expect(r.get('b1')).toBe(r.get('b2'));
    expect(r.get('b1')).toBe(r.get('b3'));
    expect(r.get('a1')).not.toBe(r.get('b1'));
  });

  it('tiny corpora do not crash', () => {
    for (const n of [0, 1, 2]) {
      const v = new Map(Array.from({ length: n }, (_, i) => [`id${i}`, [i + 1, 1, 0.5 * i]] as [string, number[]]));
      expect(nearest(v, 3).size).toBe(n);
      expect(project2d(v).size).toBe(n);
      expect(kmeans(v, 5).size).toBe(n);
      for (const p of project2d(v).values()) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
    }
    expect(nearest(m({ a: [1, 0] }), 3).get('a')).toEqual([]);
  });

  it('clusterCount clamps', () => {
    expect(clusterCount(0)).toBe(1);
    expect(clusterCount(150)).toBe(9);
    expect(clusterCount(1000)).toBe(10);
  });
});
