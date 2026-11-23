// Shared by the server stats and the UI (labels, search-param validation), so
// it must stay free of server-only imports.
import { addDays, weekStart } from "./dates";

type RangeDef = {
	label: string;
	// "over {text}" in chart descriptions
	text: string;
	// "vs {prevText}" under the Completed tile
	prevText: string;
	bucket: "hour" | "day" | "week";
	// First day of the range and the comparison period, given today's key.
	bounds: (today: string) => { from: string; prevFrom: string; prevTo: string };
};

// The last `n` days including today, compared with the `n` days before.
const lastDays = (n: number) => (today: string) => {
	const from = addDays(today, -(n - 1));
	return { from, prevFrom: addDays(from, -n), prevTo: addDays(from, -1) };
};

export const RANGES = {
	// Partial periods are compared with the whole previous one.
	today: {
		label: "Today",
		text: "today",
		prevText: "yesterday",
		bucket: "hour",
		bounds: (today) => {
			const prev = addDays(today, -1);
			return { from: today, prevFrom: prev, prevTo: prev };
		},
	},
	week: {
		label: "This week",
		text: "this week",
		prevText: "last week",
		bucket: "day",
		bounds: (today) => {
			const from = weekStart(today);
			return { from, prevFrom: addDays(from, -7), prevTo: addDays(from, -1) };
		},
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
export const RANGE_KEYS = Object.keys(RANGES) as [RangeKey, ...RangeKey[]];
