import { definePlugin } from "nitro";
import { env } from "../env";
import { interruptCurrentRun } from "../sync/runner";
import { startScheduler } from "../sync/scheduler";

// Starts the background ClickUp sync with the server. SYNC_ENABLED=false turns
// it off (e.g. while working on UI against an existing database).
export default definePlugin((nitroApp) => {
	let config: ReturnType<typeof env>;
	try {
		config = env();
	} catch (err) {
		console.error("[sync] not started, invalid environment:", err);
		return;
	}
	if (!config.SYNC_ENABLED) {
		console.info("[sync] disabled by SYNC_ENABLED=false");
		return;
	}

	const stop = startScheduler();
	let stopped = false;
	const shutdown = () => {
		if (stopped) return;
		stopped = true;
		stop();
		interruptCurrentRun();
	};
	// Nitro's node server closes on these signals without firing its "close"
	// hook, so listen for them directly. A run still in flight may finish if
	// the process lives long enough; its row is already marked, so the next
	// server syncs straight away either way.
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
	nitroApp.hooks.hook("close", shutdown);
});
