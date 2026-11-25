import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "./auth";
import { createClickUpClient } from "./clickup/client";
import { getMeId } from "./clickup/me";
import { listStatusesResponse, task } from "./clickup/schemas";
import { getDb } from "./db/client";
import { tasks } from "./db/schema";
import { env } from "./env";
import { saveTask } from "./sync/tasks";

function client() {
	const { CLICKUP_TOKEN } = env();
	if (!CLICKUP_TOKEN) throw new Error("CLICKUP_TOKEN is not set.");
	return createClickUpClient(CLICKUP_TOKEN);
}

const id = z.string().regex(/^[A-Za-z0-9]+$/);

// The statuses a task in this list can move to, in ClickUp's order. Fetched
// when a status menu opens; the sync doesn't keep them.
export const getListStatuses = createServerFn({ method: "GET" })
	.middleware([requireAuth])
	.validator(z.object({ listId: id }))
	.handler(async ({ data }) => {
		const { statuses } = await client().get(
			`/list/${data.listId}`,
			listStatusesResponse,
		);
		return statuses
			.sort((a, b) => a.orderindex - b.orderindex)
			.map((s) => ({ name: s.status, color: s.color ?? null, type: s.type }));
	});

// Moves a task to another status in ClickUp, then saves it locally (which
// records the change, like a sync would) so the stats update at once.
export const setTaskStatus = createServerFn({ method: "POST" })
	.middleware([requireAuth])
	.validator(z.object({ taskId: id, status: z.string().min(1).max(100) }))
	.handler(async ({ data }) => {
		const db = getDb();
		const known = db
			.select({ id: tasks.id })
			.from(tasks)
			.where(eq(tasks.id, data.taskId))
			.get();
		if (!known) throw new Error("That task isn't synced.");

		const c = client();
		await c.put(`/task/${known.id}`, z.unknown(), { status: data.status });
		const full = await c.find(`/task/${known.id}`, task);
		if (full) saveTask(db, full, await getMeId(c));
		return { status: data.status };
	});
