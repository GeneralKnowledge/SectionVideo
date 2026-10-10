type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function takeToken(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}
