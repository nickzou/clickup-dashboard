// Calendar-day helpers. Days are "YYYY-MM-DD" keys in the configured TZ;
// arithmetic on keys is pure calendar math (via UTC), so DST never skips or
// repeats a day.

const formatters = new Map<string, Intl.DateTimeFormat>();

export function dayKey(ms: number, timeZone: string): string {
	let f = formatters.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		formatters.set(timeZone, f);
	}
	return f.format(ms);
}

function toUtc(key: string): Date {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(key: string, days: number): string {
	const d = toUtc(key);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

// Monday of the key's week.
export function weekStart(key: string): string {
	const dow = (toUtc(key).getUTCDay() + 6) % 7;
	return addDays(key, -dow);
}

export function dayRange(from: string, to: string): string[] {
	const out: string[] = [];
	for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
	return out;
}
