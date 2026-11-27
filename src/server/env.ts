import "@tanstack/react-start/server-only";
import { z } from "zod";

const schema = z.object({
	SESSION_SECRET: z
		.string()
		.min(32, "SESSION_SECRET must be at least 32 characters"),
	// argon2 hash from `pnpm hash-password`.
	DASHBOARD_PASSWORD_HASH: z
		.string()
		.startsWith("$argon2", "DASHBOARD_PASSWORD_HASH must be an argon2 hash"),
	DATABASE_PATH: z.string().default("./data/clickup.db"),
	MIGRATIONS_DIR: z.string().default("./drizzle"),
	CLICKUP_TOKEN: z.string().optional(),
	// One workspace id, or several separated by commas.
	CLICKUP_TEAM_ID: z.string().optional(),
	// Day and week boundaries for stats, and the nightly reconcile hour.
	TZ: z.string().default("UTC"),
	SYNC_ENABLED: z
		.enum(["true", "false"])
		.default("true")
		.transform((v) => v === "true"),
	SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(15),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

// Parsed lazily so a missing variable fails the first request with a clear
// message instead of crashing the build.
export function env(): Env {
	cached ??= schema.parse(process.env);
	return cached;
}

// The workspaces to sync, from CLICKUP_TEAM_ID.
export function teamIds(): string[] {
	return (env().CLICKUP_TEAM_ID ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
}
