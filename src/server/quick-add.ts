import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { createClickUpClient } from "./clickup/client";
import { task, userResponse } from "./clickup/schemas";
import { getDb } from "./db/client";
import { customFields, folders, lists, spaces } from "./db/schema";
import { env } from "./env";
import { INBOX } from "./inbox";
import { dayKey, zonedMs } from "./stats/dates";
import { saveTask } from "./sync/tasks";

export type CaptureList = Awaited<
	ReturnType<typeof getCaptureLists>
>["lists"][number];

const TIME_OF_DAY = "time of day";

// The workspace's Time of Day field and its settable options, if synced.
function timeOfDayField() {
	const field = getDb()
		.select()
		.from(customFields)
		.all()
		.find((f) => f.name.toLowerCase() === TIME_OF_DAY);
	if (!field) return null;
	const options = field.options
		.filter((o) => o.id)
		.sort((a, b) => a.order - b.order)
		.map((o) => ({ id: o.id as string, name: o.name, color: o.color }));
	return options.length ? { id: field.id, options } : null;
}

// Every open list, by space then folder, for the modal's list picker.
export const getCaptureLists = createServerFn({ method: "GET" })
	.middleware([requireAuth])
	.handler(() => {
		const rows = getDb()
			.select({
				id: lists.id,
				name: lists.name,
				space: spaces.name,
				folder: folders.name,
			})
			.from(lists)
			.innerJoin(spaces, eq(spaces.id, lists.spaceId))
			.leftJoin(folders, eq(folders.id, lists.folderId))
			.where(
				and(
					eq(lists.archived, false),
					eq(spaces.archived, false),
					// Every sync stamps each active list it finds with that run's
					// time, and never removes the ones it doesn't: anything older
					// than the latest stamp was deleted in ClickUp.
					gte(
						lists.syncedAt,
						sql`(select max(${lists.syncedAt}) from ${lists} where ${lists.archived} = 0)`,
					),
				),
			)
			.orderBy(asc(spaces.name), asc(folders.name), asc(lists.name))
			.all();
		// Captures land in Inbox › Inbox unless another list is picked.
		const inbox = rows.find(
			(l) => l.space.toLowerCase() === INBOX && l.name.toLowerCase() === INBOX,
		);
		return {
			inboxId: inbox?.id ?? null,
			lists: rows,
			defaultId: inbox?.id ?? rows[0]?.id ?? null,
			timeOfDay: timeOfDayField()?.options ?? [],
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

let meId: number | undefined;

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
			.select({ id: lists.id })
			.from(lists)
			.where(eq(lists.id, data.listId))
			.get();
		if (!list) throw new Error("That list isn't synced.");

		const field = data.timeOfDay ? timeOfDayField() : null;
		if (
			data.timeOfDay &&
			!field?.options.some((o) => o.id === data.timeOfDay)
		) {
			throw new Error("That Time of Day option isn't synced.");
		}

		const client = createClickUpClient(CLICKUP_TOKEN);
		meId ??= (await client.get("/user", userResponse)).user.id;
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
