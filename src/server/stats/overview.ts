import "@tanstack/react-start/server-only";
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { spaces, tasks } from "../db/schema";
import { addDays, dayKey, dayRange, hourOf, weekStart } from "./dates";
import { RANGES, type RangeDef, type RangeKey } from "./ranges";

const DONE_TYPES = ["done", "closed"];
const HEATMAP_WEEKS = 53;
const DAY_MS = 24 * 60 * 60 * 1000;

// When a task was marked complete: when it entered a done status, else when
// it closed.
const markedDoneAt = sql<number>`coalesce(${tasks.dateDone}, ${tasks.dateClosed})`;

// The day a task counts as completed. Tasks are rescheduled to the day the
// work happened before being ticked off, sometimes days later, so a due date
// earlier than the day it was marked done wins. A later due date doesn't:
// work finished early can't count on a day that hasn't happened.
// Returns the day key and an instant within it (the real tick-off time when
// it's the same day, else the due timestamp).
function completionDay(
	markedAt: number,
	due: number | null,
	tz: string,
): { key: string; at: number; backfilled: boolean } {
	const markedKey = dayKey(markedAt, tz);
	if (due !== null) {
		const dueKey = dayKey(due, tz);
		if (dueKey < markedKey) return { key: dueKey, at: due, backfilled: true };
	}
	return { key: markedKey, at: markedAt, backfilled: false };
}

export function getOverviewStats(
	db: Db,
	opts: { range: RangeKey; spaceId?: string; timeZone: string },
) {
	const { range, spaceId, timeZone: tz } = opts;
	const now = Date.now();
	const today = dayKey(now, tz);
	const def: RangeDef = RANGES[range];
	const { from, prevFrom, prevTo } = def.bounds(today);
	const prevCutoff =
		def.prevCutoffDays === undefined
			? Number.POSITIVE_INFINITY
			: now - def.prevCutoffDays * DAY_MS;
	const { bucket } = def;

	const scope = and(
		eq(tasks.isMine, true),
		isNull(tasks.deletedAt),
		spaceId ? eq(tasks.spaceId, spaceId) : undefined,
	);

	// Every completion, bucketed by local day. A few thousand rows: cheaper to
	// bucket here than to teach SQLite about time zones.
	const completions = db
		.select({
			markedAt: markedDoneAt,
			due: tasks.dueDate,
			spaceId: tasks.spaceId,
		})
		.from(tasks)
		.where(and(scope, isNotNull(markedDoneAt)))
		.all();
	const perDay = new Map<string, number>();
	const perSpaceInRange = new Map<string, number>();
	const perHourToday = new Array<number>(24).fill(0);
	let completedPrev = 0;
	for (const c of completions) {
		const { key, at, backfilled } = completionDay(c.markedAt, c.due, tz);
		perDay.set(key, (perDay.get(key) ?? 0) + 1);
		if (key >= from && key <= today) {
			perSpaceInRange.set(c.spaceId, (perSpaceInRange.get(c.spaceId) ?? 0) + 1);
		} else if (key >= prevFrom && key <= prevTo && at <= prevCutoff) {
			completedPrev++;
		}
		// Backfilled tasks only have a placeholder time; hours use tick-offs.
		if (key === today && !backfilled) perHourToday[hourOf(at, tz)]++;
	}

	const rangeDays = dayRange(from, today);
	const completed = rangeDays.reduce((n, k) => n + (perDay.get(k) ?? 0), 0);

	// Hourly for today, daily up to 90 days, weekly beyond. `date` is a day
	// key, or "YYYY-MM-DDTHH" for hours.
	const series: { date: string; count: number }[] = [];
	if (bucket === "hour") {
		const hoursSoFar = hourOf(now, tz) + 1;
		for (let h = 0; h < hoursSoFar; h++) {
			series.push({
				date: `${today}T${String(h).padStart(2, "0")}`,
				count: perHourToday[h],
			});
		}
	} else if (bucket === "day") {
		for (const k of rangeDays)
			series.push({ date: k, count: perDay.get(k) ?? 0 });
	} else {
		const weeks = new Map<string, number>();
		for (const k of rangeDays) {
			const w = weekStart(k);
			weeks.set(w, (weeks.get(w) ?? 0) + (perDay.get(k) ?? 0));
		}
		for (const [date, count] of weeks) series.push({ date, count });
	}

	// Heatmap: whole weeks (Sun-Sat) ending with the current one.
	const heatStart = addDays(weekStart(today), -(HEATMAP_WEEKS - 1) * 7);
	const heatmap = dayRange(heatStart, today).map((date) => ({
		date,
		count: perDay.get(date) ?? 0,
	}));

	const open = db
		.select({ due: tasks.dueDate })
		.from(tasks)
		.where(and(scope, notInArray(tasks.statusType, DONE_TYPES)))
		.all();
	let overdue = 0;
	let dueToday = 0;
	for (const t of open) {
		if (t.due === null) continue;
		const key = dayKey(t.due, tz);
		if (key < today) overdue++;
		else if (key === today) dueToday++;
	}

	const spaceNames = new Map(
		db
			.select({ id: spaces.id, name: spaces.name })
			.from(spaces)
			.orderBy(asc(spaces.name))
			.all()
			.map((s) => [s.id, s.name]),
	);
	const bySpace = [...perSpaceInRange]
		.map(([id, count]) => ({
			id,
			name: spaceNames.get(id) ?? "Unknown",
			count,
		}))
		.sort((a, b) => b.count - a.count);

	return {
		today,
		from,
		bucket,
		kpis: {
			completed,
			completedPrev,
			open: open.length,
			overdue,
			dueToday,
			...streaks(perDay, today),
		},
		series,
		heatmap,
		bySpace,
		spaces: [...spaceNames].map(([id, name]) => ({ id, name })),
	};
}

export type OverviewStats = ReturnType<typeof getOverviewStats>;

// Current streak: consecutive days with a completion, ending today, or
// yesterday if nothing is done yet today (the streak isn't broken until the
// day ends).
function streaks(perDay: Map<string, number>, today: string) {
	let current = 0;
	let k = perDay.has(today) ? today : addDays(today, -1);
	while (perDay.has(k)) {
		current++;
		k = addDays(k, -1);
	}

	let best = 0;
	let run = 0;
	let prev: string | undefined;
	for (const key of [...perDay.keys()].sort()) {
		run = prev && addDays(prev, 1) === key ? run + 1 : 1;
		best = Math.max(best, run);
		prev = key;
	}
	return { streak: current, bestStreak: best };
}
