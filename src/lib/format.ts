// Formatting for "YYYY-MM-DD" day keys. Parsed as UTC so the label is the
// calendar day the server bucketed, whatever the browser's time zone.

function parse(key: string) {
	return new Date(`${key}T00:00:00Z`);
}

const short = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const long = new Intl.DateTimeFormat("en", {
	weekday: "short",
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const month = new Intl.DateTimeFormat("en", {
	month: "short",
	timeZone: "UTC",
});

export const formatShortDay = (key: string) => short.format(parse(key));

// "YYYY-MM-DDTHH" hour keys from the hourly series.
const hourOfKey = (key: string) => Number(key.slice(11, 13));
const hourLabel = (h: number) =>
	`${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
export const formatHour = (key: string) => hourLabel(hourOfKey(key));
export const formatHourSpan = (key: string) => {
	const h = hourOfKey(key);
	return `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`;
};
export const formatLongDay = (key: string) => long.format(parse(key));
export const formatMonth = (key: string) => month.format(parse(key));

export const plural = (n: number, word: string) =>
	`${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
