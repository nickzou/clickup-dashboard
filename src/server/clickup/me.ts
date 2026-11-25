import "@tanstack/react-start/server-only";
import { env } from "../env";
import { type ClickUpClient, createClickUpClient } from "./client";
import { userResponse } from "./schemas";

let meId: number | undefined;

// The token's user id, fetched once per process.
export async function getMeId(client: ClickUpClient): Promise<number> {
	meId ??= (await client.get("/user", userResponse)).user.id;
	return meId;
}

// A client for one request handler, on the configured token.
export function tokenClient(): ClickUpClient {
	const { CLICKUP_TOKEN } = env();
	if (!CLICKUP_TOKEN) throw new Error("CLICKUP_TOKEN is not set.");
	return createClickUpClient(CLICKUP_TOKEN);
}
