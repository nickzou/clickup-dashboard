import "@tanstack/react-start/server-only";
import { and, desc, eq, gt, isNull, lt, min, ne, or } from "drizzle-orm";
import {
	ClickUpAuthError,
	type ClickUpClient,
	createClickUpClient,
} from "../clickup/client";
import { teamsResponse, userResponse } from "../clickup/schemas";
import { type Db, getDb } from "../db/client";
import { syncRuns, tasks, workspaces } from "../db/schema";
import { env, teamIds } from "../env";
import { syncCustomFields, syncTaskTypes } from "./fields";
import { syncHierarchy, syncMissingParents } from "./hierarchy";
import { syncTasks } from "./tasks";
import { syncTimeEntries } from "./time-entries";

export type SyncKind = "backfill" | "incremental" | "reconcile";

// Overlap between incremental windows, to absorb clock skew with ClickUp.
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// A running sync refreshes its heartbeat this often. A "running" row whose
// heartbeat is older than the lease belongs to a process that died; a fresh
// one may be another server on the same database file.
const HEARTBEAT_MS = 15_000;
const LEASE_MS = 60_000;
export const INTERRUPTED = "Interrupted";

let running: { kind: SyncKind; progress: number } | null = null;
let currentRunId: number | null = null;
let currentAbort: AbortController | null = null;
// Set on a 401 so the scheduler stops retrying a bad token every interval.
// A manual sync clears it.
let tokenRejected = false;

export function syncState() {
	return { running, tokenRejected };
}

export function clearTokenRejected() {
	tokenRejected = false;
}

// The latest run, optionally of one kind or only successful ones. Runs cut
// short by a restart are skipped: they say nothing about the data.
export function lastRun(db: Db, kind?: SyncKind, status?: "ok") {
	return db
		.select()
		.from(syncRuns)
		.where(
			and(
				kind ? eq(syncRuns.kind, kind) : undefined,
				status ? eq(syncRuns.status, status) : undefined,
				or(isNull(syncRuns.error), ne(syncRuns.error, INTERRUPTED)),
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
	markDeadRuns(db);
	if (runningElsewhere(db)) return false;
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
	const { CLICKUP_TOKEN } = env();
	const teams = teamIds();
	const startedAt = new Date();
	const { id: runId } = db
		.insert(syncRuns)
		.values({ kind, status: "running", startedAt, heartbeatAt: startedAt })
		.returning({ id: syncRuns.id })
		.get();
	currentRunId = runId;
	currentAbort = new AbortController();
	const { signal } = currentAbort;
	// Final status writes only apply while the row is still "running": a run
	// cancelled at shutdown keeps its "Interrupted" mark.
	const stillRunning = and(
		eq(syncRuns.id, runId),
		eq(syncRuns.status, "running"),
	);
	const heartbeat = setInterval(() => {
		db.update(syncRuns)
			.set({ heartbeatAt: new Date() })
			.where(and(eq(syncRuns.id, runId), eq(syncRuns.status, "running")))
			.run();
	}, HEARTBEAT_MS).unref();

	let client: ClickUpClient | undefined;
	try {
		if (!CLICKUP_TOKEN || teams.length === 0) {
			throw new Error("CLICKUP_TOKEN and CLICKUP_TEAM_ID must be set.");
		}
		client = createClickUpClient(CLICKUP_TOKEN, signal);
		const c = client;
		const meId = (await c.get("/user", userResponse)).user.id;
		const names = new Map(
			(await c.get("/team", teamsResponse)).teams.map((t) => [t.id, t.name]),
		);

		let upserted = 0;
		for (const teamId of teams) {
			if (!names.has(teamId)) {
				throw new Error(`The token can't see workspace ${teamId}.`);
			}
			const known = db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, teamId))
				.get();
			// A workspace new to the dashboard gets a full pass whatever the
			// run's kind, like the first backfill.
			const full = kind !== "incremental" || !known?.backfilledAt;
			const row = {
				id: teamId,
				name: names.get(teamId) ?? teamId,
				syncedAt: Date.now(),
			};
			db.insert(workspaces)
				.values(row)
				.onConflictDoUpdate({ target: workspaces.id, set: row })
				.run();

			await syncHierarchy(db, c, teamId, { includeArchived: full });

			await syncCustomFields(db, c, teamId);
			await syncTaskTypes(db, c, teamId);

			const cursor = full
				? undefined
				: (lastRun(db, undefined, "ok")?.startedAt.getTime() ?? 0) -
					CURSOR_OVERLAP_MS;
			upserted += await syncTasks(db, c, teamId, {
				meId,
				updatedAfter: cursor,
				onProgress: (n) => {
					if (running) running.progress = upserted + n;
				},
			});

			// A backfill reaches back to the workspace's first task.
			const timeFrom =
				kind === "backfill" || !known?.backfilledAt
					? (db
							.select({ first: min(tasks.dateCreated) })
							.from(tasks)
							.where(eq(tasks.teamId, teamId))
							.get()?.first ?? Date.now() - 30 * DAY_MS)
					: Date.now() - (kind === "reconcile" ? 90 : 7) * DAY_MS;
			await syncTimeEntries(db, c, teamId, timeFrom);

			if (!known?.backfilledAt) {
				db.update(workspaces)
					.set({ backfilledAt: Date.now() })
					.where(eq(workspaces.id, teamId))
					.run();
			}
		}

		await syncMissingParents(db, c);

		db.update(syncRuns)
			.set({
				status: "ok",
				finishedAt: new Date(),
				tasksUpserted: upserted,
				requests: c.requestCount,
				error: null,
			})
			.where(stillRunning)
			.run();
		console.info(
			`[sync] ${kind} ok: ${upserted} tasks, ${c.requestCount} requests`,
		);
	} catch (err) {
		if (signal.aborted) {
			console.info(`[sync] ${kind} stopped for shutdown`);
			return;
		}
		if (err instanceof ClickUpAuthError) tokenRejected = true;
		const message = err instanceof Error ? err.message : String(err);
		db.update(syncRuns)
			.set({
				status: "error",
				finishedAt: new Date(),
				requests: client?.requestCount ?? 0,
				error: message,
			})
			.where(stillRunning)
			.run();
		console.error(`[sync] ${kind} failed: ${message}`);
	} finally {
		clearInterval(heartbeat);
		currentRunId = null;
		currentAbort = null;
	}
}

function runningElsewhere(db: Db) {
	return Boolean(
		db
			.select({ id: syncRuns.id })
			.from(syncRuns)
			.where(
				and(
					eq(syncRuns.status, "running"),
					gt(syncRuns.heartbeatAt, new Date(Date.now() - LEASE_MS)),
				),
			)
			.get(),
	);
}

// A "running" row whose heartbeat has lapsed means a process died mid-sync.
export function markDeadRuns(db: Db) {
	db.update(syncRuns)
		.set({ status: "error", finishedAt: new Date(), error: INTERRUPTED })
		.where(
			and(
				eq(syncRuns.status, "running"),
				or(
					isNull(syncRuns.heartbeatAt),
					lt(syncRuns.heartbeatAt, new Date(Date.now() - LEASE_MS)),
				),
			),
		)
		.run();
}

// Called on shutdown: cancels the in-flight run's requests and marks it, so
// the next process can sync straight away instead of waiting for the
// heartbeat to lapse. Task writes are all-or-nothing per page, so stopping
// mid-run loses nothing.
export function interruptCurrentRun() {
	if (currentRunId === null) return;
	currentAbort?.abort();
	getDb()
		.update(syncRuns)
		.set({ status: "error", finishedAt: new Date(), error: INTERRUPTED })
		.where(and(eq(syncRuns.id, currentRunId), eq(syncRuns.status, "running")))
		.run();
	console.info("[sync] marked the in-progress run as interrupted");
}
