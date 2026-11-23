import { definePlugin } from "nitro";
import { env } from "../env";
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
	nitroApp.hooks.hook("close", stop);
});
