import "@tanstack/react-start/server-only";
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { lists, spaces, tasks } from "../db/schema";
import { addDays, dayKey, dayRange, weekStart } from "./dates";
import { bridgesStreak, outcomeOf, POINTS } from "./outcomes";
import { RANGES, type RangeDef, type RangeKey } from "./ranges";

const DONE_TYPES = ["done", "closed"];
const HEATMAP_WEEKS = 53;

// When a task was marked complete: when it entered a done status, else when
// it closed.
const markedDoneAt = sql<number>`coalesce(${tasks.dateDone}, ${tasks.dateClosed})`;

// The day a task counts as completed. Tasks are rescheduled to the day the
// work happened before being ticked off, sometimes days later, so a due date
// earlier than the day it was marked done wins. A later due date doesn't:
// work finished early can't count on a day that hasn't happened.
function completionDay(markedAt: number, due: number | null, tz: string) {
	const markedKey = dayKey(markedAt, tz);
	if (due === null) return markedKey;
	const dueKey = dayKey(due, tz);
	return dueKey < markedKey ? dueKey : markedKey;
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
			listId: tasks.listId,
			status: tasks.status,
			statusType: tasks.statusType,
		})
		.from(tasks)
		.where(and(scope, isNotNull(markedDoneAt)))
		.all();
	// Points per day: 1 per completed task, ½ per partial (see outcomes.ts).
	const perDay = new Map<string, number>();
	const perSpaceInRange = new Map<string, number>();
	const perListInRange = new Map<string, { spaceId: string; points: number }>();
	// Days with a skipped task, which keep a streak alive.
	const bridgeDays = new Set<string>();
	let completedPrev = 0;
	// Completed + partial + not done in range: the completion rate's base.
	let resolvedInRange = 0;
	// Finished tasks in range by outcome (task counts, not points).
	const outcomes = { completed: 0, partial: 0, notDone: 0, excluded: 0 };
	for (const c of completions) {
		const outcome = outcomeOf(c.status, c.statusType);
		if (!outcome) continue;
		const key = completionDay(c.markedAt, c.due, tz);
		const inRange = key >= from && key <= today;
		if (inRange) outcomes[outcome]++;
		if (outcome === "excluded") {
			if (bridgesStreak(c.status)) bridgeDays.add(key);
			continue;
		}
		const points = POINTS[outcome];
		if (inRange) resolvedInRange++;
		if (points === 0) continue;

		perDay.set(key, (perDay.get(key) ?? 0) + points);
		if (inRange) {
			perSpaceInRange.set(
				c.spaceId,
				(perSpaceInRange.get(c.spaceId) ?? 0) + points,
			);
			const list = perListInRange.get(c.listId);
			if (list) list.points += points;
			else perListInRange.set(c.listId, { spaceId: c.spaceId, points });
		} else if (key >= prevFrom && key <= prevTo) {
			completedPrev += points;
		}
	}

	const rangeDays = dayRange(from, today);
	const completed = rangeDays.reduce((n, k) => n + (perDay.get(k) ?? 0), 0);
	const completionRate =
		resolvedInRange > 0 ? completed / resolvedInRange : null;

	// Daily up to 90 days, weekly beyond. Today has no series: its chart is
	// the by-space breakdown.
	const series: { date: string; count: number }[] = [];
	if (bucket === "day") {
		for (const k of rangeDays)
			series.push({ date: k, count: perDay.get(k) ?? 0 });
	} else if (bucket === "week") {
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
	const listNames = new Map(
		db
			.select({ id: lists.id, name: lists.name })
			.from(lists)
			.all()
			.map((l) => [l.id, l.name]),
	);
	const bySpace = [...perSpaceInRange]
		.map(([id, count]) => ({
			id,
			name: spaceNames.get(id) ?? "Unknown",
			count,
			lists: [...perListInRange]
				.filter(([, l]) => l.spaceId === id)
				.map(([listId, l]) => ({
					id: listId,
					name: listNames.get(listId) ?? "Unknown list",
					count: l.points,
				}))
				.sort((a, b) => b.count - a.count),
		}))
		.sort((a, b) => b.count - a.count);

	return {
		today,
		from,
		bucket,
		kpis: {
			completed,
			completedPrev,
			completionRate,
			open: open.length,
			overdue,
			dueToday,
			...streaks(perDay, bridgeDays, today),
		},
		series,
		outcomes,
		heatmap,
		bySpace,
		spaces: [...spaceNames].map(([id, name]) => ({ id, name })),
	};
}

export type OverviewStats = ReturnType<typeof getOverviewStats>;

// A streak is consecutive days with points. A skipped day (illness,
// vacation…) with no points bridges it: the streak survives but doesn't grow.
// The current streak ends today, or yesterday if nothing is done yet today
// (it isn't broken until the day ends).
function streaks(
	perDay: Map<string, number>,
	bridgeDays: Set<string>,
	today: string,
) {
	const counts = (k: string) => (perDay.get(k) ?? 0) > 0;
	const keeps = (k: string) => counts(k) || bridgeDays.has(k);

	let current = 0;
	let k = counts(today) ? today : addDays(today, -1);
	while (keeps(k)) {
		if (counts(k)) current++;
		k = addDays(k, -1);
	}

	const days = [...perDay.keys(), ...bridgeDays].sort();
	let best = 0;
	let run = 0;
	if (days.length) {
		for (const key of dayRange(days[0], today)) {
			if (counts(key)) run++;
			else if (!bridgeDays.has(key)) run = 0;
			best = Math.max(best, run);
		}
	}
	return { streak: current, bestStreak: best };
}
