import "@tanstack/react-start/server-only";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { ClickUpClient } from "../clickup/client";
import { type ClickUpTask, task, tasksResponse } from "../clickup/schemas";
import type { Db } from "../db/client";
import { taskDueChanges, taskStatusChanges, tasks } from "../db/schema";

type Options = {
	meId: number;
	// Only tasks updated after this time (incremental). Omit for a full pass.
	updatedAfter?: number;
	onProgress?: (upserted: number) => void;
};

// Pages through the workspace's tasks, active and archived, and upserts them.
// Returns the number of tasks written.
export async function syncTasks(
	db: Db,
	client: ClickUpClient,
	teamId: string,
	{ meId, updatedAfter, onProgress }: Options,
): Promise<number> {
	const runStartedAt = Date.now();
	let upserted = 0;

	for (const archived of [false, true]) {
		for (let page = 0; ; page++) {
			const res = await client.get(`/team/${teamId}/task`, tasksResponse, {
				page,
				archived,
				include_closed: true,
				subtasks: true,
				// Incremental runs order by update time so the newest changes come
				// first; full passes order by creation, which shifts less while
				// paging.
				order_by: updatedAfter === undefined ? "created" : "updated",
				date_updated_gt: updatedAfter,
			});
			if (res.tasks.length) {
				writePage(db, res.tasks, meId, runStartedAt);
				upserted += res.tasks.length;
				onProgress?.(upserted);
			}
			if (res.last_page !== false || res.tasks.length === 0) break;
		}
	}

	// A full pass should see every live task, so anything it didn't touch is a
	// deletion candidate. Pages can shift while paging, so confirm each one
	// before marking it. Incremental runs can't tell, so they skip this.
	if (updatedAfter === undefined) {
		const candidates = db
			.select({ id: tasks.id })
			.from(tasks)
			.where(and(lt(tasks.syncedAt, runStartedAt), isNull(tasks.deletedAt)))
			.limit(MAX_DELETE_CHECKS)
			.all();
		for (const { id } of candidates) {
			const found = await client.find(`/task/${id}`, task);
			if (found) {
				writePage(db, [found], meId, Date.now());
			} else {
				db.update(tasks)
					.set({ deletedAt: Date.now() })
					.where(eq(tasks.id, id))
					.run();
			}
		}
	}

	return upserted;
}

// Caps the per-task checks in one reconcile; any left over wait for the next.
const MAX_DELETE_CHECKS = 200;

function writePage(db: Db, page: ClickUpTask[], meId: number, now: number) {
	db.transaction((tx) => {
		const previous = new Map(
			tx
				.select({ id: tasks.id, dueDate: tasks.dueDate, status: tasks.status })
				.from(tasks)
				.where(
					inArray(
						tasks.id,
						page.map((t) => t.id),
					),
				)
				.all()
				.map((r) => [r.id, r]),
		);

		for (const t of page) {
			const row = toRow(t, meId, now);
			const before = previous.get(t.id);
			if (before && before.dueDate !== row.dueDate) {
				tx.insert(taskDueChanges)
					.values({
						taskId: t.id,
						oldDueDate: before.dueDate,
						newDueDate: row.dueDate,
						status: row.status,
						seenAt: now,
					})
					.run();
			}
			if (before && before.status !== row.status) {
				tx.insert(taskStatusChanges)
					.values({
						taskId: t.id,
						oldStatus: before.status,
						newStatus: row.status,
						seenAt: now,
					})
					.run();
			}
			tx.insert(tasks)
				.values(row)
				.onConflictDoUpdate({ target: tasks.id, set: row })
				.run();
		}
	});
}

function toRow(t: ClickUpTask, meId: number, now: number) {
	const assigneeIds = t.assignees.map((a) => a.id);
	return {
		id: t.id,
		name: t.name,
		url: t.url,
		spaceId: t.space.id,
		folderId: t.folder.hidden ? null : t.folder.id,
		listId: t.list.id,
		parentId: t.parent ?? null,
		status: t.status.status,
		statusType: t.status.type,
		statusColor: t.status.color ?? null,
		priority: t.priority?.priority ?? null,
		tags: t.tags.map((tag) => tag.name),
		assigneeIds,
		isMine: assigneeIds.length === 0 || assigneeIds.includes(meId),
		archived: t.archived,
		dateCreated: t.date_created,
		dateUpdated: t.date_updated,
		dateDone: t.date_done,
		dateClosed: t.date_closed,
		dueDate: t.due_date,
		startDate: t.start_date,
		timeEstimate: t.time_estimate ?? null,
		// Lists attach every field to every task; keep only the ones set.
		customFields: t.custom_fields
			.filter((f) => f.value !== undefined && f.value !== null)
			.map((f) => ({ id: f.id, name: f.name, type: f.type, value: f.value })),
		syncedAt: now,
		deletedAt: null,
	};
}
