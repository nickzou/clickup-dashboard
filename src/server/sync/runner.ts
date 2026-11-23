import "@tanstack/react-start/server-only";
import { and, desc, eq, min } from "drizzle-orm";
import {
	ClickUpAuthError,
	type ClickUpClient,
	createClickUpClient,
} from "../clickup/client";
import { userResponse } from "../clickup/schemas";
import { type Db, getDb } from "../db/client";
import { syncRuns, tasks } from "../db/schema";
import { env } from "../env";
import { syncHierarchy, syncMissingParents } from "./hierarchy";
import { syncTasks } from "./tasks";
import { syncTimeEntries } from "./time-entries";

export type SyncKind = "backfill" | "incremental" | "reconcile";

// Overlap between incremental windows, to absorb clock skew with ClickUp.
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let running: { kind: SyncKind; progress: number } | null = null;
// Set on a 401 so the scheduler stops retrying a bad token every interval.
// A manual sync clears it.
let tokenRejected = false;

export function syncState() {
	return { running, tokenRejected };
}

export function clearTokenRejected() {
	tokenRejected = false;
}

export function lastRun(db: Db, kind?: SyncKind, status?: "ok") {
	return db
		.select()
		.from(syncRuns)
		.where(
			and(
				kind ? eq(syncRuns.kind, kind) : undefined,
				status ? eq(syncRuns.status, status) : undefined,
			),
		)
		.orderBy(desc(syncRuns.startedAt))
		.limit(1)
		.get();
}

// Picks backfill until one has succeeded, then incremental unless told
// otherwise. Returns false if a sync is already running.
export function startSync(requested?: SyncKind): boolean {
	if (running) return false;
	const db = getDb();
	const kind: SyncKind = !lastRun(db, "backfill", "ok")
		? "backfill"
		: (requested ?? "incremental");
	running = { kind, progress: 0 };
	void run(db, kind).finally(() => {
		running = null;
	});
	return true;
}

async function run(db: Db, kind: SyncKind) {
	const { CLICKUP_TOKEN, CLICKUP_TEAM_ID } = env();
	const startedAt = new Date();
	const { id: runId } = db
		.insert(syncRuns)
		.values({ kind, status: "running", startedAt })
		.returning({ id: syncRuns.id })
		.get();

	let client: ClickUpClient | undefined;
	try {
		if (!CLICKUP_TOKEN || !CLICKUP_TEAM_ID) {
			throw new Error("CLICKUP_TOKEN and CLICKUP_TEAM_ID must be set.");
		}
		client = createClickUpClient(CLICKUP_TOKEN);
		const c = client;
		const meId = (await c.get("/user", userResponse)).user.id;

		await syncHierarchy(db, c, CLICKUP_TEAM_ID, {
			includeArchived: kind !== "incremental",
		});

		const cursor =
			kind === "incremental"
				? (lastRun(db, undefined, "ok")?.startedAt.getTime() ?? 0) -
					CURSOR_OVERLAP_MS
				: undefined;
		const upserted = await syncTasks(db, c, CLICKUP_TEAM_ID, {
			meId,
			updatedAfter: cursor,
			onProgress: (n) => {
				if (running) running.progress = n;
			},
		});

		await syncMissingParents(db, c);

		const timeFrom =
			kind === "backfill"
				? (db
						.select({ first: min(tasks.dateCreated) })
						.from(tasks)
						.get()?.first ?? Date.now() - 30 * DAY_MS)
				: Date.now() - (kind === "reconcile" ? 90 : 7) * DAY_MS;
		await syncTimeEntries(db, c, CLICKUP_TEAM_ID, timeFrom);

		db.update(syncRuns)
			.set({
				status: "ok",
				finishedAt: new Date(),
				tasksUpserted: upserted,
				requests: c.requestCount,
			})
			.where(eq(syncRuns.id, runId))
			.run();
		console.info(
			`[sync] ${kind} ok: ${upserted} tasks, ${c.requestCount} requests`,
		);
	} catch (err) {
		if (err instanceof ClickUpAuthError) tokenRejected = true;
		const message = err instanceof Error ? err.message : String(err);
		db.update(syncRuns)
			.set({
				status: "error",
				finishedAt: new Date(),
				requests: client?.requestCount ?? 0,
				error: message,
			})
			.where(eq(syncRuns.id, runId))
			.run();
		console.error(`[sync] ${kind} failed: ${message}`);
	}
}

// A run left as "running" means the process died mid-sync.
export function markInterruptedRuns(db: Db) {
	db.update(syncRuns)
		.set({ status: "error", finishedAt: new Date(), error: "Interrupted" })
		.where(eq(syncRuns.status, "running"))
		.run();
}
