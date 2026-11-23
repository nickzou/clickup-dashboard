import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { getDb } from "#/server/db/client";

// Unauthenticated on purpose: used by the container healthcheck and the deploy
// smoke test. Reveals nothing beyond "up".
export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: () => {
				getDb().run(sql`select 1`);
				return Response.json({ ok: true });
			},
		},
	},
});
