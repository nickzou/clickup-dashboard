import { createServerFn } from "@tanstack/react-start";
import { count, isNull } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getDb } from "./db/client";
import { tasks } from "./db/schema";
import {
	clearTokenRejected,
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
		const last = lastRun(db);
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
