import "@tanstack/react-start/server-only";
import { getDb } from "../db/client";
import { env } from "../env";
import { lastRun, markInterruptedRuns, startSync, syncState } from "./runner";

const TICK_MS = 60_000;
const RECONCILE_HOUR = 3;

// Every minute, decide whether a sync is due:
// - nightly reconcile once the local clock passes 03:00 and none ran today
// - otherwise incremental once the interval has passed since the last attempt
// The first tick runs a backfill if none has succeeded (see startSync).
export function startScheduler(): () => void {
	const { SYNC_INTERVAL_MINUTES, TZ } = env();
	const db = getDb();
	markInterruptedRuns(db);

	const tick = () => {
		try {
			const { running, tokenRejected } = syncState();
			if (running || tokenRejected) return;

			const now = new Date();
			const local = localParts(now, TZ);
			const lastReconcile =
				lastRun(db, "reconcile", "ok") ?? lastRun(db, "backfill", "ok");
			if (
				local.hour >= RECONCILE_HOUR &&
				lastReconcile &&
				localParts(lastReconcile.startedAt, TZ).date !== local.date
			) {
				startSync("reconcile");
				return;
			}

			const last = lastRun(db);
			const due =
				!last ||
				now.getTime() - last.startedAt.getTime() >=
					SYNC_INTERVAL_MINUTES * 60_000;
			if (due) startSync("incremental");
		} catch (err) {
			console.error("[sync] scheduler tick failed:", err);
		}
	};

	const first = setTimeout(tick, 5_000);
	const interval = setInterval(tick, TICK_MS);
	console.info(
		`[sync] scheduler started: every ${SYNC_INTERVAL_MINUTES} min, reconcile at ${RECONCILE_HOUR}:00 ${TZ}`,
	);
	return () => {
		clearTimeout(first);
		clearInterval(interval);
	};
}

function localParts(d: Date, timeZone: string) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(d)
			.map((p) => [p.type, p.value]),
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		hour: Number(parts.hour),
	};
}
