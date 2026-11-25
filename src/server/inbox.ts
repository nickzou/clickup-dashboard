import "@tanstack/react-start/server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { spaces } from "./db/schema";

// The Inbox space holds quick captures that haven't been processed yet. It's
// left out of every stat; a task counts once it moves to a real list. Quick
// capture files into its Inbox list by default.
export const INBOX = "inbox";

export function inboxSpaceIds(db: Db): string[] {
	return db
		.select({ id: spaces.id })
		.from(spaces)
		.where(eq(sql`lower(${spaces.name})`, INBOX))
		.all()
		.map((s) => s.id);
}
