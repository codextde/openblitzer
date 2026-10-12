export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  retryAfter(key: string, now: number): number {
    const list = this.recent(key, now);
    if (list.length < this.limit) return 0;
    return Math.max(1, Math.ceil((list[list.length - this.limit]! + this.windowMs - now) / 1000));
  }

  hit(key: string, now: number): void {
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
  }

  prune(now: number): void {
    for (const key of [...this.hits.keys()]) this.recent(key, now);
  }
}

export function checkLimits(checks: [RateLimiter, string][], now: number): number {
  const wait = Math.max(0, ...checks.map(([l, k]) => l.retryAfter(k, now)));
  if (!wait) for (const [l, k] of checks) l.hit(k, now);
  return wait;
}
