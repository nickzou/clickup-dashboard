import "@tanstack/react-start/server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "../env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

let db: Db | undefined;

// Opens the database and applies pending migrations on first use.
export function getDb(): Db {
	if (!db) {
		const { DATABASE_PATH, MIGRATIONS_DIR } = env();
		mkdirSync(dirname(DATABASE_PATH), { recursive: true });
		const sqlite = new Database(DATABASE_PATH);
		sqlite.pragma("journal_mode = WAL");
		// Wait for another connection's write instead of failing at once.
		sqlite.pragma("busy_timeout = 5000");
		sqlite.pragma("foreign_keys = ON");
		db = drizzle(sqlite, { schema, casing: "snake_case" });
		migrate(db, { migrationsFolder: MIGRATIONS_DIR });
	}
	return db;
}
