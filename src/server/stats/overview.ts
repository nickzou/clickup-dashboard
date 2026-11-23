import "@tanstack/react-start/server-only";
import {
	and,
	asc,
	eq,
	gte,
	isNotNull,
	isNull,
	lte,
	notInArray,
	sql,
} from "drizzle-orm";
import type { Db } from "../db/client";
import { lists, spaces, taskDueChanges, tasks } from "../db/schema";
import { addDays, dayKey, dayRange, weekStart } from "./dates";
import { bridgesStreak, outcomeOf, POINTS } from "./outcomes";
import { RANGES, type RangeDef, type RangeKey } from "./ranges";

const DONE_TYPES = ["done", "closed"];
const HEATMAP_WEEKS = 53;
const DAY_MS = 24 * 60 * 60 * 1000;

type OutcomeCounts = {
	completed: number;
	partial: number;
	putOff: number;
	notDone: number;
};
const emptyOutcomeCounts = (): OutcomeCounts => ({
	completed: 0,
	partial: 0,
	putOff: 0,
	notDone: 0,
});

// Tasks due today by state, including ones put off to a later day. Excluded
// outcomes aren't counted at all.
type Due = {
	done: number;
	notDone: number;
	putOff: number;
	open: number;
	total: number;
};
const DUE_KEYS = ["done", "notDone", "putOff", "open", "total"] as const;
const emptyDue = (): Due => ({
	done: 0,
	notDone: 0,
	putOff: 0,
	open: 0,
	total: 0,
});

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
	const outcomes = {
		completed: 0,
		partial: 0,
		putOff: 0,
		notDone: 0,
		excluded: 0,
	};
	// Finished tasks per day by outcome, for the stacked Completions chart.
	const perDayOutcome = new Map<string, OutcomeCounts>();
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
		if (inRange) {
			resolvedInRange++;
			const day = perDayOutcome.get(key) ?? emptyOutcomeCounts();
			day[outcome]++;
			perDayOutcome.set(key, day);
		}
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

	// Put off: scores nothing and lowers the rate, like not done, on the day
	// the task was due.
	const putOffs = putOffEvents(db, scope, tz);
	for (const p of putOffs) {
		if (p.day < from || p.day > today) continue;
		outcomes.putOff++;
		resolvedInRange++;
		const day = perDayOutcome.get(p.day) ?? emptyOutcomeCounts();
		day.putOff++;
		perDayOutcome.set(p.day, day);
	}

	const rangeDays = dayRange(from, today);
	const completed = rangeDays.reduce((n, k) => n + (perDay.get(k) ?? 0), 0);
	const completionRate =
		resolvedInRange > 0 ? completed / resolvedInRange : null;

	// Finished tasks by outcome, daily up to 90 days, weekly beyond. Today has
	// no series: its chart is the by-space breakdown.
	const series: ({ date: string } & OutcomeCounts)[] = [];
	if (bucket === "day" || bucket === "week") {
		const buckets = new Map<string, OutcomeCounts>();
		for (const k of rangeDays) {
			const b = bucket === "week" ? weekStart(k) : k;
			const acc = buckets.get(b) ?? emptyOutcomeCounts();
			const day = perDayOutcome.get(k);
			if (day) {
				acc.completed += day.completed;
				acc.partial += day.partial;
				acc.putOff += day.putOff;
				acc.notDone += day.notDone;
			}
			buckets.set(b, acc);
		}
		for (const [date, counts] of buckets) series.push({ date, ...counts });
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
	for (const t of open) {
		if (t.due !== null && dayKey(t.due, tz) < today) overdue++;
	}

	// Tasks due today and how many are done (completed or partial, early
	// counts). Excluded outcomes (skipped, no action needed) drop out.
	const dueTodayRows = db
		.select({
			due: tasks.dueDate,
			status: tasks.status,
			statusType: tasks.statusType,
			spaceId: tasks.spaceId,
			listId: tasks.listId,
		})
		.from(tasks)
		.where(
			and(
				scope,
				// Two days either side covers any time zone; filtered by day below.
				gte(tasks.dueDate, now - 2 * DAY_MS),
				lte(tasks.dueDate, now + 2 * DAY_MS),
			),
		)
		.all();
	const dueToday = emptyDue();
	const dueTodayByList = new Map<string, Due & { spaceId: string }>();
	for (const t of dueTodayRows) {
		if (t.due === null || dayKey(t.due, tz) !== today) continue;
		const outcome = outcomeOf(t.status, t.statusType);
		if (outcome === "excluded") continue;
		const bucket =
			outcome === "completed" || outcome === "partial"
				? "done"
				: outcome === "notDone"
					? "notDone"
					: "open";
		const list = dueTodayByList.get(t.listId) ?? {
			...emptyDue(),
			spaceId: t.spaceId,
		};
		for (const d of [dueToday, list]) {
			d[bucket]++;
			d.total++;
		}
		dueTodayByList.set(t.listId, list);
	}
	// Put off today: no longer due today, but still part of today's plan.
	for (const p of putOffs) {
		if (p.day !== today) continue;
		const list = dueTodayByList.get(p.listId) ?? {
			...emptyDue(),
			spaceId: p.spaceId,
		};
		for (const d of [dueToday, list]) {
			d.putOff++;
			d.total++;
		}
		dueTodayByList.set(p.listId, list);
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
	// On Today, lists with tasks due today appear even before anything in
	// them is done, and every row carries its "done of due" count.
	const showDue = range === "today";
	const spaceIds = new Set(perSpaceInRange.keys());
	const listIds = new Set(perListInRange.keys());
	if (showDue) {
		for (const [listId, l] of dueTodayByList) {
			spaceIds.add(l.spaceId);
			listIds.add(listId);
		}
	}
	const listSpace = (listId: string) =>
		perListInRange.get(listId)?.spaceId ?? dueTodayByList.get(listId)?.spaceId;
	const dueOf = (d?: Due): Due | undefined => {
		if (!showDue) return undefined;
		const { done, notDone, putOff, open, total } = d ?? emptyDue();
		return { done, notDone, putOff, open, total };
	};

	const bySpace = [...spaceIds]
		.map((id) => {
			const spaceLists = [...listIds]
				.filter((listId) => listSpace(listId) === id)
				.map((listId) => ({
					id: listId,
					name: listNames.get(listId) ?? "Unknown list",
					count: perListInRange.get(listId)?.points ?? 0,
					due: dueOf(dueTodayByList.get(listId)),
				}))
				.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
			const spaceDue = emptyDue();
			for (const l of spaceLists) {
				for (const k of DUE_KEYS) {
					spaceDue[k] += l.due?.[k] ?? 0;
				}
			}
			return {
				id,
				name: spaceNames.get(id) ?? "Unknown",
				count: perSpaceInRange.get(id) ?? 0,
				due: dueOf(spaceDue),
				lists: spaceLists,
			};
		})
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

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

// A task put off: moved from its due day to a later one, on or after that
// day, without being finished. One per task and due day, however many moves.
// Not counted:
// - moves made before the due day (planning ahead), or earlier or within a day
// - tasks created the day they were moved, like a "partially completed"
//   task's copy, which may start on the original's date
// - tasks moved back and finished on the original due day anyway
// Due-date changes are only known from when the sync started recording them.
function putOffEvents(db: Db, scope: ReturnType<typeof and>, tz: string) {
	const rows = db
		.select({
			taskId: taskDueChanges.taskId,
			oldDue: taskDueChanges.oldDueDate,
			newDue: taskDueChanges.newDueDate,
			seenAt: taskDueChanges.seenAt,
			created: tasks.dateCreated,
			markedAt: markedDoneAt,
			due: tasks.dueDate,
			status: tasks.status,
			statusType: tasks.statusType,
			spaceId: tasks.spaceId,
			listId: tasks.listId,
		})
		.from(taskDueChanges)
		.innerJoin(tasks, eq(tasks.id, taskDueChanges.taskId))
		.where(
			and(
				scope,
				isNotNull(taskDueChanges.oldDueDate),
				isNotNull(taskDueChanges.newDueDate),
			),
		)
		.all();

	const events = new Map<
		string,
		{ day: string; spaceId: string; listId: string }
	>();
	for (const r of rows) {
		if (r.oldDue === null || r.newDue === null) continue;
		const day = dayKey(r.oldDue, tz);
		const movedOn = dayKey(r.seenAt, tz);
		if (dayKey(r.newDue, tz) <= day || movedOn < day) continue;
		if (dayKey(r.created, tz) === movedOn) continue;
		if (
			r.markedAt !== null &&
			outcomeOf(r.status, r.statusType) &&
			completionDay(r.markedAt, r.due, tz) === day
		) {
			continue;
		}
		events.set(`${r.taskId}:${day}`, {
			day,
			spaceId: r.spaceId,
			listId: r.listId,
		});
	}
	return [...events.values()];
}

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
