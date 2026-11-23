import "@tanstack/react-start/server-only";

// In-memory failed-login limiter. Single process, single user: no need for a
// shared store. Resets on restart, which is fine.
const WINDOW_MS = 60_000;
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_TOTAL = 20;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const TOTAL = "__total__";

function bucket(key: string): Bucket {
	const now = Date.now();
	let b = buckets.get(key);
	if (!b || b.resetAt <= now) {
		b = { count: 0, resetAt: now + WINDOW_MS };
		buckets.set(key, b);
	}
	return b;
}

export function isLoginBlocked(ip: string): boolean {
	return (
		bucket(ip).count >= MAX_FAILURES_PER_IP ||
		bucket(TOTAL).count >= MAX_FAILURES_TOTAL
	);
}

export function recordLoginFailure(ip: string): void {
	bucket(ip).count++;
	bucket(TOTAL).count++;
}
