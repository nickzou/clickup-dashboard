// Nightly consistent copy of the SQLite database into BACKUP_DIR, so the
// server-level snapshots always contain a usable file. Keeps 7 days.
// Runs as the `backup` service in compose.prod.yaml, using the app image.
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// better-sqlite3 ships inside the Nitro build output.
const require = createRequire("/app/.output/server/index.mjs");
const Database = require("better-sqlite3");

const source = process.env.DATABASE_PATH ?? "/data/clickup.db";
const dir = process.env.BACKUP_DIR ?? "/backups";
const KEEP_DAYS = 7;

async function backupOnce() {
	mkdirSync(dir, { recursive: true });
	const day = new Date().toISOString().slice(0, 10);
	const out = join(dir, `clickup-dashboard-${day}.db`);
	const db = new Database(source, { readonly: true, fileMustExist: true });
	try {
		await db.backup(`${out}.tmp`);
	} finally {
		db.close();
	}
	// Rename only after the copy is complete.
	renameSync(`${out}.tmp`, out);

	const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
	for (const name of readdirSync(dir)) {
		const m = name.match(/^clickup-dashboard-(\d{4}-\d{2}-\d{2})\.db$/);
		if (m && Date.parse(m[1]) < cutoff) rmSync(join(dir, name));
	}
	console.info(`[backup] wrote ${out}`);
}

const HOUR = 60 * 60 * 1000;
for (;;) {
	let wait = 24 * HOUR;
	try {
		await backupOnce();
	} catch (err) {
		// The database won't exist until the app's first start; retry sooner.
		console.error("[backup] failed:", err.message);
		wait = HOUR;
	}
	await new Promise((r) => setTimeout(r, wait));
}
