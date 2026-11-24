import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { createClickUpClient } from "./clickup/client";
import { task, userResponse } from "./clickup/schemas";
import { getDb } from "./db/client";
import { folders, lists, spaces } from "./db/schema";
import { env } from "./env";
import { dayKey, zonedMs } from "./stats/dates";
import { saveTask } from "./sync/tasks";

// Where quick captures land unless another list is picked.
const DEFAULT_SPACE = "routines";
const DEFAULT_LIST = "inbox";

export type CaptureList = Awaited<
	ReturnType<typeof getCaptureLists>
>["lists"][number];

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
			.where(and(eq(lists.archived, false), eq(spaces.archived, false)))
			.orderBy(asc(spaces.name), asc(folders.name), asc(lists.name))
			.all();
		const inbox = rows.find(
			(l) =>
				l.space.toLowerCase() === DEFAULT_SPACE &&
				l.name.toLowerCase() === DEFAULT_LIST,
		);
		return {
			lists: rows,
			defaultId: inbox?.id ?? rows[0]?.id ?? null,
			// New tasks are due today unless changed.
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
