import "@tanstack/react-start/server-only";
import type { ClickUpClient } from "../clickup/client";
import { fieldsResponse, taskTypesResponse } from "../clickup/schemas";
import type { Db } from "../db/client";
import { customFields, type FieldOption, taskTypes } from "../db/schema";

// Workspace custom fields, replaced on every run: one request, and option
// names and colors stay current when they're renamed or recolored in ClickUp.
export async function syncCustomFields(
	db: Db,
	client: ClickUpClient,
	teamId: string,
) {
	const { fields } = await client.get(`/team/${teamId}/field`, fieldsResponse);
	const now = Date.now();
	db.transaction((tx) => {
		tx.delete(customFields).run();
		for (const f of fields) {
			const options: FieldOption[] = (f.type_config?.options ?? []).flatMap(
				(o) =>
					o.name && o.orderindex !== undefined
						? [
								{
									id: o.id,
									name: o.name,
									color: o.color ?? null,
									order: o.orderindex,
								},
							]
						: [],
			);
			tx.insert(customFields)
				.values({
					id: f.id,
					name: f.name,
					type: f.type,
					options,
					syncedAt: now,
				})
				.run();
		}
	});
}

// Task types (Meeting, Milestone, ...), so a task's custom_item_id has a name.
export async function syncTaskTypes(
	db: Db,
	client: ClickUpClient,
	teamId: string,
) {
	const { custom_items } = await client.get(
		`/team/${teamId}/custom_item`,
		taskTypesResponse,
	);
	const now = Date.now();
	db.transaction((tx) => {
		tx.delete(taskTypes).run();
		for (const t of custom_items) {
			tx.insert(taskTypes)
				.values({ id: t.id, name: t.name, syncedAt: now })
				.run();
		}
	});
}
