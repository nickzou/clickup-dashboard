import "@tanstack/react-start/server-only";
import {
	and,
	asc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lte,
	notInArray,
	sql,
} from "drizzle-orm";
import type { Db } from "../db/client";
import type { FieldOption } from "../db/schema";
import {
	customFields,
	lists,
	spaces,
	taskDueChanges,
	taskStatusChanges,
	tasks,
	taskTypes,
} from "../db/schema";
import { inboxSpaceIds } from "../inbox";
import {
	addDays,
	dayKey,
	dayRange,
	timeOfDay,
	timeRange,
	weekStart,
} from "./dates";
import { isWaiting, outcomeOf, POINTS } from "./outcomes";
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
// outcomes and tasks waiting on someone else aren't counted at all.
// Waiting tasks are noted beside the count, never part of it.
type Due = {
	done: number;
	notDone: number;
	putOff: number;
	open: number;
	total: number;
	waiting: number;
};
const DUE_KEYS = [
	"done",
	"notDone",
	"putOff",
	"open",
	"total",
	"waiting",
] as const;
const emptyDue = (): Due => ({
	done: 0,
	notDone: 0,
	putOff: 0,
	open: 0,
	total: 0,
	waiting: 0,
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

	// Unprocessed captures in the Inbox space count toward nothing.
	const inbox = inboxSpaceIds(db);
	const scope = and(
		eq(tasks.isMine, true),
		isNull(tasks.deletedAt),
		spaceId ? eq(tasks.spaceId, spaceId) : undefined,
		inbox.length ? notInArray(tasks.spaceId, inbox) : undefined,
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
		if (outcome === "excluded") continue;
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

	// Finished tasks by outcome, per day or per week as the range says. Today has
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
		.select({
			id: tasks.id,
			name: tasks.name,
			url: tasks.url,
			status: tasks.status,
			statusColor: tasks.statusColor,
			listId: tasks.listId,
			due: tasks.dueDate,
			updated: tasks.dateUpdated,
		})
		.from(tasks)
		.where(and(scope, notInArray(tasks.statusType, DONE_TYPES)))
		.all();
	// Waiting on someone else isn't overdue work; the Waiting card tracks it.
	let overdue = 0;
	for (const t of open) {
		if (isWaiting(t.status)) continue;
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
		const list = dueTodayByList.get(t.listId) ?? {
			...emptyDue(),
			spaceId: t.spaceId,
		};
		dueTodayByList.set(t.listId, list);
		if (isWaiting(t.status)) {
			dueToday.waiting++;
			list.waiting++;
			continue;
		}
		const bucket =
			outcome === "completed" || outcome === "partial"
				? "done"
				: outcome === "notDone"
					? "notDone"
					: "open";
		for (const d of [dueToday, list]) {
			d[bucket]++;
			d.total++;
		}
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
		const { done, notDone, putOff, open, total, waiting } = d ?? emptyDue();
		return { done, notDone, putOff, open, total, waiting };
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
		},
		series,
		outcomes,
		heatmap,
		bySpace,
		waiting: waitingTasks(db, open, listNames, tz),
		upcoming: upcomingToday(db, scope, tz, today, now),
		spaces: [...spaceNames]
			.filter(([id]) => !inbox.includes(id))
			.map(([id, name]) => ({ id, name })),
	};
}

export type OverviewStats = ReturnType<typeof getOverviewStats>;

const TIME_OF_DAY = "time of day";

// Today's open tasks, in the order they'll happen: by the Time of Day field,
// then start time, then due time. Waiting tasks have their own card.
function upcomingToday(
	db: Db,
	scope: ReturnType<typeof and>,
	tz: string,
	today: string,
	now: number,
) {
	const rows = db
		.select({
			id: tasks.id,
			name: tasks.name,
			url: tasks.url,
			status: tasks.status,
			statusColor: tasks.statusColor,
			due: tasks.dueDate,
			start: tasks.startDate,
			customFields: tasks.customFields,
			typeId: tasks.customItemId,
			listId: tasks.listId,
		})
		.from(tasks)
		.where(
			and(
				scope,
				notInArray(tasks.statusType, DONE_TYPES),
				gte(tasks.dueDate, now - 2 * DAY_MS),
				lte(tasks.dueDate, now + 2 * DAY_MS),
			),
		)
		.all()
		.filter(
			(t) =>
				t.due !== null &&
				dayKey(t.due, tz) === today &&
				!isWaiting(t.status) &&
				!outcomeOf(t.status, "open"),
		);

	// Option names and colors from the field definitions; failing that, as
	// stored with any task that has the option.
	const knownOptions = new Map<string, FieldOption>();
	for (const r of db.all<{ key: string; option: string }>(
		sql`select distinct json_extract(f.value, '$.id') || ':' || json_extract(f.value, '$.value') as key, json_extract(f.value, '$.option') as option from ${tasks}, json_each(${tasks.customFields}) f where lower(json_extract(f.value, '$.name')) = ${TIME_OF_DAY} and json_extract(f.value, '$.option') is not null`,
	)) {
		knownOptions.set(r.key, JSON.parse(r.option));
	}
	for (const f of db.select().from(customFields).all()) {
		for (const o of f.options) knownOptions.set(`${f.id}:${o.order}`, o);
	}

	// Meetings get their own icon. Matched by the task type's name, like Time
	// of Day.
	const meetingTypes = new Set(
		db
			.select({ id: taskTypes.id, name: taskTypes.name })
			.from(taskTypes)
			.all()
			.filter((t) => t.name.toLowerCase() === "meeting")
			.map((t) => t.id),
	);

	return rows
		.map((t) => {
			const field = t.customFields.find(
				(f) => f.name.toLowerCase() === TIME_OF_DAY,
			);
			const order = typeof field?.value === "number" ? field.value : null;
			const option = field
				? (knownOptions.get(`${field.id}:${field.value}`) ?? field.option)
				: undefined;
			return {
				id: t.id,
				name: t.name,
				url: t.url,
				status: t.status,
				statusColor: t.statusColor,
				listId: t.listId,
				meeting: t.typeId !== null && meetingTypes.has(t.typeId),
				timeOfDay:
					order === null
						? null
						: {
								// Null until a sync has seen the option's name.
								name: option?.name ?? null,
								color: option?.color ?? null,
								order,
							},
				// Dates without a time (4 AM) sort after timed ones.
				start: t.start !== null && timeOfDay(t.start, tz) ? t.start : null,
				due: t.due !== null && timeOfDay(t.due, tz) ? t.due : null,
				time: timeLabel(t.start, t.due, tz),
			};
		})
		.sort(
			(a, b) =>
				last(a.timeOfDay?.order) - last(b.timeOfDay?.order) ||
				last(a.start) - last(b.start) ||
				last(a.due) - last(b.due) ||
				a.name.localeCompare(b.name),
		)
		.map(({ start, due, ...t }) => t);
}

// Start to due when both have a time, else whichever has one.
function timeLabel(start: number | null, due: number | null, tz: string) {
	const startTime = start !== null ? timeOfDay(start, tz) : null;
	const dueTime = due !== null ? timeOfDay(due, tz) : null;
	if (startTime && dueTime && start !== null && due !== null && due > start) {
		return timeRange(start, due, tz);
	}
	return startTime ?? dueTime;
}

// Missing values sort last.
const last = (n: number | null | undefined) => n ?? Number.MAX_SAFE_INTEGER;

// Open tasks waiting on someone else, soonest check-in (due date) first.
// Waiting since the last recorded move into the current status; for tasks
// already waiting before status changes were recorded, since their last
// update, which is a lower bound.
function waitingTasks(
	db: Db,
	open: {
		id: string;
		name: string;
		url: string;
		status: string;
		statusColor: string | null;
		listId: string;
		due: number | null;
		updated: number;
	}[],
	listNames: Map<string, string>,
	tz: string,
) {
	const waiting = open.filter((t) => isWaiting(t.status));
	const entered = new Map<string, number>();
	if (waiting.length) {
		const changes = db
			.select({
				taskId: taskStatusChanges.taskId,
				newStatus: taskStatusChanges.newStatus,
				seenAt: taskStatusChanges.seenAt,
			})
			.from(taskStatusChanges)
			.where(
				inArray(
					taskStatusChanges.taskId,
					waiting.map((t) => t.id),
				),
			)
			.all();
		const current = new Map(waiting.map((t) => [t.id, t.status]));
		for (const c of changes) {
			if (c.newStatus !== current.get(c.taskId)) continue;
			entered.set(c.taskId, Math.max(entered.get(c.taskId) ?? 0, c.seenAt));
		}
	}
	return waiting
		.map((t) => ({
			id: t.id,
			name: t.name,
			url: t.url,
			status: t.status,
			statusColor: t.statusColor,
			list: listNames.get(t.listId) ?? "Unknown list",
			since: dayKey(entered.get(t.id) ?? t.updated, tz),
			sinceExact: entered.has(t.id),
			checkIn: t.due === null ? null : dayKey(t.due, tz),
		}))
		.sort(
			(a, b) =>
				(a.checkIn ?? "9999").localeCompare(b.checkIn ?? "9999") ||
				a.since.localeCompare(b.since),
		);
}

// A task put off: moved from its due day to a later one, on or after that
// day, without being finished. One per task and due day, however many moves.
// Not counted:
// - moves made before the due day (planning ahead), or earlier or within a day
// - tasks created the day they were moved, like a "partially completed"
//   task's copy, which may start on the original's date
// - tasks moved back and finished on the original due day anyway
// - tasks waiting on someone else when moved (see isWaiting)
// Due-date changes are only known from when the sync started recording them.
function putOffEvents(db: Db, scope: ReturnType<typeof and>, tz: string) {
	const rows = db
		.select({
			taskId: taskDueChanges.taskId,
			oldDue: taskDueChanges.oldDueDate,
			newDue: taskDueChanges.newDueDate,
			seenAt: taskDueChanges.seenAt,
			statusThen: taskDueChanges.status,
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
		if (isWaiting(r.statusThen ?? r.status)) continue;
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
