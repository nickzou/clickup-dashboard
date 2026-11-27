import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import type { ClickUpClient } from "./clickup/client";
import { getMeId, tokenClient } from "./clickup/me";
import { listStatusesResponse, task } from "./clickup/schemas";
import { getDb } from "./db/client";
import { tasks, taskTypes } from "./db/schema";
import { env } from "./env";
import { clockTime, dayKey, zonedMs } from "./stats/dates";
import { saveTask } from "./sync/tasks";
import { openLists, timeOfDayField } from "./task-options";

const taskId = z.string().regex(/^[A-Za-z0-9]+$/);

// A day, and optionally a time on it, in the dashboard's time zone.
const when = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
});
type When = z.infer<typeof when>;

const detailResponse = task.extend({
	markdown_description: z.string().nullish(),
	description: z.string().nullish(),
});

function knownTask(id: string) {
	const row = getDb()
		.select({ id: tasks.id, teamId: tasks.teamId })
		.from(tasks)
		.where(eq(tasks.id, id))
		.get();
	if (!row) throw new Error("That task isn't synced.");
	return row;
}

// Reads the task back in the shape the sync stores, so the dashboard
// reflects a change at once (and the change is recorded like a sync's).
async function refresh(c: ClickUpClient, id: string) {
	const full = await c.find(`/task/${id}`, task);
	if (full) saveTask(getDb(), full, await getMeId(c));
}

// Task types worth picking: Task itself (0), Milestone, and the workspace's
// own (ids from 1000). ClickUp's system types (form responses, AI skills,
// ...) are left out.
function pickableTypes(teamId: string) {
	const custom = getDb()
		.select({ id: taskTypes.id, name: taskTypes.name })
		.from(taskTypes)
		.where(eq(taskTypes.teamId, teamId))
		.all()
		.filter((t) => t.id === 1 || t.id >= 1000)
		.map((t) => ({
			id: t.id,
			name: t.name.replace(/^\w/, (c) => c.toUpperCase()),
		}));
	return [{ id: 0, name: "Task" }, ...custom];
}

function fromMs(ms: number | null, tz: string): When | null {
	return ms === null ? null : { date: dayKey(ms, tz), time: clockTime(ms, tz) };
}

// ClickUp keeps a date without a time as 4:00 AM local; the stats rely on
// that to tell the two apart.
function toMs(w: When, tz: string) {
	return zonedMs(w.date, w.time ?? "04:00", tz);
}

// Everything the edit modal shows, fresh from ClickUp: the task (with its
// description, which the sync doesn't keep), its list's statuses, and the
// Time of Day options.
export const getTaskDetail = createServerFn({ method: "GET" })
	.middleware([requireAuth])
	.validator(z.object({ taskId }))
	.handler(async ({ data }) => {
		const { TZ } = env();
		const { id } = knownTask(data.taskId);
		const c = tokenClient();
		const t = await c.get(`/task/${id}`, detailResponse, {
			include_markdown_description: true,
		});
		saveTask(getDb(), t, await getMeId(c));
		const teamId = t.team_id ?? null;
		const { statuses } = await c.get(
			`/list/${t.list.id}`,
			listStatusesResponse,
		);

		const field = timeOfDayField(teamId);
		const value = field
			? t.custom_fields.find((f) => f.id === field.id)
			: undefined;
		const option =
			value === undefined || value.value === undefined || value.value === null
				? undefined
				: value.type_config?.options?.find(
						(o) => o.orderindex === value.value || o.id === value.value,
					);
		return {
			id: t.id,
			name: t.name,
			url: t.url,
			status: t.status.status,
			description: t.markdown_description ?? t.description ?? "",
			start: fromMs(t.start_date, TZ),
			due: fromMs(t.due_date, TZ),
			timeOfDay: option?.id ?? "",
			// null and 0 both mean a plain task.
			typeId: t.custom_item_id ?? 0,
			types: teamId ? pickableTypes(teamId) : [{ id: 0, name: "Task" }],
			listId: t.list.id,
			// Tasks move within their workspace only.
			lists: openLists().filter((l) => l.teamId === teamId),
			timeOfDayOptions: field?.options ?? [],
			statuses: statuses
				.sort((a, b) => a.orderindex - b.orderindex)
				.map((s) => ({
					name: s.status,
					color: s.color ?? null,
					type: s.type,
				})),
			today: dayKey(Date.now(), TZ),
		};
	});

export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

// Only the fields that changed. null clears a date or the Time of Day.
const changes = z.object({
	name: z.string().trim().min(1).max(500).optional(),
	description: z.string().max(50_000).optional(),
	status: z.string().min(1).max(100).optional(),
	start: when.nullable().optional(),
	due: when.nullable().optional(),
	timeOfDay: z.string().nullable().optional(),
	typeId: z.number().int().min(0).optional(),
	// Moves the task to this list (its home list). With it, status is the
	// status to have in the new list.
	listId: z.string().regex(/^\d+$/).optional(),
});

export const updateTask = createServerFn({ method: "POST" })
	.middleware([requireAuth])
	.validator(z.object({ taskId, changes }))
	.handler(async ({ data }) => {
		const { TZ } = env();
		const { id, teamId } = knownTask(data.taskId);
		const ch = data.changes;
		const c = tokenClient();

		if (ch.listId !== undefined) {
			await moveTask(c, id, teamId, ch.listId, ch.status);
		}

		const body: Record<string, unknown> = {};
		if (ch.name !== undefined) body.name = ch.name;
		if (ch.description !== undefined) body.markdown_content = ch.description;
		if (ch.status !== undefined) body.status = ch.status;
		if (ch.typeId !== undefined) body.custom_item_id = ch.typeId;
		if (ch.start !== undefined) {
			body.start_date = ch.start ? toMs(ch.start, TZ) : null;
			body.start_date_time = Boolean(ch.start?.time);
		}
		if (ch.due !== undefined) {
			body.due_date = ch.due ? toMs(ch.due, TZ) : null;
			body.due_date_time = Boolean(ch.due?.time);
		}
		if (Object.keys(body).length) {
			await c.put(`/task/${id}`, z.unknown(), body);
		}

		if (ch.timeOfDay !== undefined) {
			const field = timeOfDayField(teamId);
			if (!field) throw new Error("The Time of Day field isn't synced.");
			if (ch.timeOfDay === null) {
				await c.delete(`/task/${id}/field/${field.id}`);
			} else {
				if (!field.options.some((o) => o.id === ch.timeOfDay)) {
					throw new Error("That Time of Day option isn't synced.");
				}
				await c.post(`/task/${id}/field/${field.id}`, z.unknown(), {
					value: ch.timeOfDay,
				});
			}
		}

		await refresh(c, id);
		return { ok: true };
	});

// Moves a task to another home list (a v3-only endpoint). When its current
// status doesn't exist there, ClickUp needs it mapped to one that does: the
// status picked for the new list.
async function moveTask(
	c: ClickUpClient,
	id: string,
	teamId: string | null,
	listId: string,
	status: string | undefined,
) {
	if (!teamId) throw new Error("That task's workspace isn't synced yet.");
	if (!openLists().some((l) => l.id === listId && l.teamId === teamId)) {
		throw new Error("That list isn't in the task's workspace.");
	}
	const current = await c.get(`/task/${id}`, task);
	const { statuses } = await c.get(`/list/${listId}`, listStatusesResponse);
	const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
	const target = statuses.find((s) =>
		same(s.status, status ?? current.status.status),
	);
	if (!target) {
		throw new Error(`Pick a status that exists in the new list.`);
	}
	const kept = statuses.some((s) => same(s.status, current.status.status));
	if (!kept && (!current.status.id || !target.id)) {
		throw new Error("ClickUp didn't return status ids to map.");
	}
	await c.put(
		`/v3/workspaces/${teamId}/tasks/${id}/home_list/${listId}`,
		z.unknown(),
		kept
			? {}
			: {
					status_mappings: [
						{
							source_status_id: current.status.id,
							destination_status_id: target.id,
						},
					],
				},
	);
}

// Deletes the task in ClickUp and marks it deleted here, as the nightly
// reconcile would.
export const deleteTask = createServerFn({ method: "POST" })
	.middleware([requireAuth])
	.validator(z.object({ taskId }))
	.handler(async ({ data }) => {
		const { id } = knownTask(data.taskId);
		await tokenClient().delete(`/task/${id}`);
		getDb()
			.update(tasks)
			.set({ deletedAt: Date.now() })
			.where(eq(tasks.id, id))
			.run();
		return { ok: true };
	});
