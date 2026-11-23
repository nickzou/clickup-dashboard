// Shared by the server stats and the UI (labels, search-param validation), so
// it must stay free of server-only imports.
import { addDays, weekdayName, weekStart } from "./dates";

export type RangeDef = {
	label: string;
	// "over {text}" in chart descriptions
	text: string;
	// "vs {prevText}" under the Completed tile, given today's key
	prevText: string | ((today: string) => string);
	bucket: "hour" | "day" | "week";
	// First day of the range and the comparison period, given today's key.
	bounds: (today: string) => { from: string; prevFrom: string; prevTo: string };
	// When set, the comparison period also stops at this many days before the
	// current moment, so a partial period is matched to the same time of day.
	prevCutoffDays?: number;
};

// The last `n` days including today, compared with the `n` days before.
const lastDays = (n: number) => (today: string) => {
	const from = addDays(today, -(n - 1));
	return { from, prevFrom: addDays(from, -n), prevTo: addDays(from, -1) };
};

export const RANGES = {
	// Partial periods are compared with the whole previous one. Today is
	// compared with the same weekday last week, since days of the week differ
	// more than consecutive days do.
	today: {
		label: "Today",
		text: "today",
		prevText: (today) => `last ${weekdayName(today)}`,
		bucket: "hour",
		bounds: (today) => {
			const prev = addDays(today, -7);
			return { from: today, prevFrom: prev, prevTo: prev };
		},
	},
	// Sunday to now, compared with last Sunday up to the same weekday and
	// time: a whole previous week would always look ahead.
	week: {
		label: "This week",
		text: "this week",
		prevText: "this point last week",
		bucket: "day",
		bounds: (today) => {
			const from = weekStart(today);
			return {
				from,
				prevFrom: addDays(from, -7),
				prevTo: addDays(today, -7),
			};
		},
		prevCutoffDays: 7,
	},
	"7d": {
		label: "7 days",
		text: "the last 7 days",
		prevText: "previous 7 days",
		bucket: "day",
		bounds: lastDays(7),
	},
	"30d": {
		label: "30 days",
		text: "the last 30 days",
		prevText: "previous 30 days",
		bucket: "day",
		bounds: lastDays(30),
	},
	"90d": {
		label: "90 days",
		text: "the last 90 days",
		prevText: "previous 90 days",
		bucket: "day",
		bounds: lastDays(90),
	},
	"12m": {
		label: "12 months",
		text: "the last 12 months",
		prevText: "previous 12 months",
		bucket: "week",
		bounds: lastDays(365),
	},
} satisfies Record<string, RangeDef>;

export type RangeKey = keyof typeof RANGES;

export function comparisonLabel(range: RangeKey, today: string): string {
	const { prevText } = RANGES[range] as RangeDef;
	return typeof prevText === "function" ? prevText(today) : prevText;
}
export const RANGE_KEYS = Object.keys(RANGES) as [RangeKey, ...RangeKey[]];
