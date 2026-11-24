// Calendar-day helpers. Days are "YYYY-MM-DD" keys in the configured TZ;
// arithmetic on keys is pure calendar math (via UTC), so DST never skips or
// repeats a day.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
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
	return f;
}

function parts(ms: number, timeZone: string) {
	return Object.fromEntries(
		formatter(timeZone)
			.formatToParts(ms)
			.map((p) => [p.type, p.value]),
	);
}

export function dayKey(ms: number, timeZone: string): string {
	const p = parts(ms, timeZone);
	return `${p.year}-${p.month}-${p.day}`;
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

const weekdayFormat = new Intl.DateTimeFormat("en", {
	weekday: "long",
	timeZone: "UTC",
});

export function weekdayName(key: string): string {
	return weekdayFormat.format(toUtc(key));
}

const weekdayShortFormat = new Intl.DateTimeFormat("en", {
	weekday: "short",
	timeZone: "UTC",
});

export function weekdayShort(key: string): string {
	return weekdayShortFormat.format(toUtc(key));
}

// Sunday of the key's week.
export function weekStart(key: string): string {
	return addDays(key, -toUtc(key).getUTCDay());
}

export function dayRange(from: string, to: string): string[] {
	const out: string[] = [];
	for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
	return out;
}

const timeFormats = new Map<string, Intl.DateTimeFormat>();

// "h:mm AM" in the time zone, or null for 4:00 AM: ClickUp stores a date
// without a time as 4 AM local.
export function timeOfDay(ms: number, timeZone: string): string | null {
	const label = timeFormat(timeZone).format(ms);
	return label === "4:00 AM" ? null : label;
}

// "10:00 AM – 10:30 AM": AM/PM on both ends, even when they match, so
// ranges line up in a column.
export function timeRange(from: number, to: number, timeZone: string): string {
	const f = timeFormat(timeZone);
	return `${f.format(from)} – ${f.format(to)}`;
}

function timeFormat(timeZone: string) {
	let f = timeFormats.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "numeric",
			minute: "2-digit",
		});
		timeFormats.set(timeZone, f);
	}
	return f;
}
