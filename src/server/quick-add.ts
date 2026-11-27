import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { createClickUpClient } from "./clickup/client";
import { getMeId } from "./clickup/me";
import { task } from "./clickup/schemas";
import { getDb } from "./db/client";
import { lists, spaces } from "./db/schema";
import { env } from "./env";
import { INBOX } from "./inbox";
import { dayKey, zonedMs } from "./stats/dates";
import { saveTask } from "./sync/tasks";
import {
	type OpenList,
	openLists,
	timeOfDayByTeam,
	timeOfDayField,
} from "./task-options";

export type CaptureList = OpenList;

export const getCaptureLists = createServerFn({ method: "GET" })
	.middleware([requireAuth])
	.handler(() => {
		const rows = openLists();
		// Captures land in Inbox › Inbox unless another list is picked.
		const inbox = rows.find(
			(l) => l.space.toLowerCase() === INBOX && l.name.toLowerCase() === INBOX,
		);
		return {
			inboxId: inbox?.id ?? null,
			lists: rows,
			defaultId: inbox?.id ?? rows[0]?.id ?? null,
			// Keyed by workspace: the picker offers the chosen list's.
			timeOfDay: timeOfDayByTeam(rows),
			// Due today by default, except in the inbox (see the form).
			today: dayKey(Date.now(), env().TZ),
		};
	});

// A day, and optionally a time on it, in the dashboard's time zone.
const when = z.object({
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
});

// ClickUp keeps a date without a time as 4:00 AM local; the stats rely on
// that to tell the two apart.
function toClickUp(w: z.infer<typeof when> | undefined, tz: string) {
	if (!w) return undefined;
	return { ms: zonedMs(w.date, w.time ?? "04:00", tz), hasTime: !!w.time };
}

const captureInput = z.object({
	name: z.string().trim().min(1).max(500),
	notes: z.string().trim().max(10_000).optional(),
	listId: z.string().regex(/^\d+$/),
	timeOfDay: z.string().optional(),
	start: when.optional(),
	due: when.optional(),
});

const createdTask = z.object({ id: z.string(), url: z.string() });

// Creates the task in ClickUp, assigned to me, and saves it locally so the
// dashboard shows it before the next sync.
export const createTask = createServerFn({ method: "POST" })
	.middleware([requireAuth])
	.validator(captureInput)
	.handler(async ({ data }) => {
		const { CLICKUP_TOKEN, TZ } = env();
		const start = toClickUp(data.start, TZ);
		const due = toClickUp(data.due, TZ);
		if (start && due && start.ms > due.ms) {
			throw new Error("The start is after the due date.");
		}
		if (!CLICKUP_TOKEN) throw new Error("CLICKUP_TOKEN is not set.");
		const db = getDb();
		const list = db
			.select({ id: lists.id, teamId: spaces.teamId })
			.from(lists)
			.innerJoin(spaces, eq(spaces.id, lists.spaceId))
			.where(eq(lists.id, data.listId))
			.get();
		if (!list) throw new Error("That list isn't synced.");

		const field = data.timeOfDay ? timeOfDayField(list.teamId) : null;
		if (
			data.timeOfDay &&
			!field?.options.some((o) => o.id === data.timeOfDay)
		) {
			throw new Error("That Time of Day option isn't synced.");
		}

		const client = createClickUpClient(CLICKUP_TOKEN);
		const meId = await getMeId(client);
		const created = await client.post(`/list/${list.id}/task`, createdTask, {
			name: data.name,
			...(data.notes && { markdown_content: data.notes }),
			assignees: [meId],
			...(start && {
				start_date: start.ms,
				start_date_time: start.hasTime,
			}),
			...(due && { due_date: due.ms, due_date_time: due.hasTime }),
			...(field && {
				custom_fields: [{ id: field.id, value: data.timeOfDay }],
			}),
		});
		// Read back in the shape the sync stores. If that fails, the task
		// exists anyway and the next sync picks it up.
		try {
			const full = await client.find(`/task/${created.id}`, task);
			if (full) saveTask(db, full, meId);
		} catch (err) {
			console.warn(`[quick-add] saved ${created.id} in ClickUp only: ${err}`);
		}
		return created;
	});
