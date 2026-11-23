import "@tanstack/react-start/server-only";
import { and, gte, lt } from "drizzle-orm";
import type { ClickUpClient } from "../clickup/client";
import { timeEntriesResponse } from "../clickup/schemas";
import type { Db } from "../db/client";
import { timeEntries } from "../db/schema";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Fetches the token user's time entries between `from` and now in 30-day
// windows. Each window replaces what's stored for it, so edits and deletions
// in ClickUp are picked up.
export async function syncTimeEntries(
	db: Db,
	client: ClickUpClient,
	teamId: string,
	from: number,
) {
	const now = Date.now();
	for (let start = from; start < now; start += WINDOW_MS) {
		const end = Math.min(start + WINDOW_MS, now);
		const { data } = await client.get(
			`/team/${teamId}/time_entries`,
			timeEntriesResponse,
			{ start_date: start, end_date: end },
		);
		db.transaction((tx) => {
			tx.delete(timeEntries)
				.where(and(gte(timeEntries.start, start), lt(timeEntries.start, end)))
				.run();
			for (const e of data) {
				// A negative duration is a timer that's still running.
				if (e.duration < 0) continue;
				tx.insert(timeEntries)
					.values({
						id: e.id,
						taskId: e.task?.id ?? null,
						start: e.start,
						duration: e.duration,
						billable: e.billable,
						syncedAt: now,
					})
					.onConflictDoNothing()
					.run();
			}
		});
	}
}
