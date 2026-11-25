import "@tanstack/react-start/server-only";
import type { ClickUpClient } from "./client";
import { userResponse } from "./schemas";

let meId: number | undefined;

// The token's user id, fetched once per process.
export async function getMeId(client: ClickUpClient): Promise<number> {
	meId ??= (await client.get("/user", userResponse)).user.id;
	return meId;
}
