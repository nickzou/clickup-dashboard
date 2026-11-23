import { createServerFn } from "@tanstack/react-start";
import { count, desc, isNull, ne, or } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getDb } from "./db/client";
import { syncRuns, tasks } from "./db/schema";
import {
	clearTokenRejected,
	INTERRUPTED,
	lastRun,
	startSync,
	syncState,
} from "./sync/runner";

export type SyncStatus = Awaited<ReturnType<typeof getSyncStatus>>;

export const getSyncStatus = createServerFn({ method: "GET" })
	.middleware([requireAuth])
	.handler(() => {
		const db = getDb();
		const { running, tokenRejected } = syncState();
		// A run cut short by a restart isn't a failure worth showing; the data
		// from the last good run is still there.
		const last = db
			.select()
			.from(syncRuns)
			.where(
				or(
					ne(syncRuns.status, "error"),
					isNull(syncRuns.error),
					ne(syncRuns.error, INTERRUPTED),
				),
			)
			.orderBy(desc(syncRuns.startedAt))
			.limit(1)
			.get();
		const lastOk = lastRun(db, undefined, "ok");
		const taskCount =
			db.select({ n: count() }).from(tasks).where(isNull(tasks.deletedAt)).get()
				?.n ?? 0;
		return {
			running,
			tokenRejected,
			taskCount,
			lastSuccessAt: lastOk?.finishedAt?.getTime() ?? null,
			lastError:
				last?.status === "error"
					? {
							at: last.startedAt.getTime(),
							message: last.error ?? "Unknown error",
						}
					: null,
		};
	});

export const triggerSync = createServerFn({ method: "POST" })
	.middleware([requireAuth])
	.handler(() => {
		clearTokenRejected();
		return { started: startSync() };
	});
