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

export const formatLongDay = (key: string) => long.format(parse(key));
export const formatMonth = (key: string) => month.format(parse(key));

export const plural = (n: number, word: string) =>
	`${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
