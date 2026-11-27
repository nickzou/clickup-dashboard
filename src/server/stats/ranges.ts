// Shared by the server stats and the UI (labels, search-param validation), so
// it must stay free of server-only imports.
import { addDays, weekdayName, weekdayShort, weekStart } from "./dates";

export type RangeDef = {
	label: string;
	// "over {text}" in chart descriptions
	text: string;
	// "vs {prevText}" under the Completed tile, given today's key
	prevText: string | ((today: string) => string);
	// The Completions chart: by space (today), per day, or per week.
	bucket: "space" | "day" | "week";
	// First day of the range and the comparison period, given today's key.
	bounds: (today: string) => { from: string; prevFrom: string; prevTo: string };
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
		bucket: "space",
		bounds: (today) => {
			const prev = addDays(today, -7);
			return { from: today, prevFrom: prev, prevTo: prev };
		},
	},
	// Sunday to now, compared with last Sunday through the same weekday: a
	// whole previous week would always look ahead. Whole days, not times of
	// day, since tasks are often ticked off later than they're done.
	week: {
		label: "This week",
		text: "this week",
		prevText: (today) => {
			const day = weekdayShort(today);
			return day === "Sun" ? "last Sunday" : `last Sun–${day}`;
		},
		bucket: "day",
		bounds: (today) => {
			const from = weekStart(today);
			return {
				from,
				prevFrom: addDays(from, -7),
				prevTo: addDays(today, -7),
			};
		},
	},
	"7d": {
		label: "7 days",
		text: "the last 7 days",
		prevText: "previous 7 days",
		bucket: "day",
		bounds: lastDays(7),
	},
	// This week and the three whole weeks before it, one bar per week, for
	// week over week. Compared with the four weeks before, cut at the same
	// weekday as This week is (too long to spell out under the tile).
	"4w": {
		label: "4 weeks",
		text: "the last 4 weeks",
		prevText: "previous 4 weeks",
		bucket: "week",
		bounds: (today) => {
			const from = addDays(weekStart(today), -21);
			return {
				from,
				prevFrom: addDays(from, -28),
				prevTo: addDays(today, -28),
			};
		},
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
