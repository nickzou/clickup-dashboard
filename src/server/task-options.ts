import "@tanstack/react-start/server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "./db/client";
import { customFields, folders, lists, spaces } from "./db/schema";

// Lookups the add and edit task server functions share. Kept apart from
// those modules: client code imports them for their server functions, and a
// plain export here would drag the database into the client bundle.

const TIME_OF_DAY = "time of day";

// The workspace's Time of Day field and its settable options, if synced.
export function timeOfDayField() {
	const field = getDb()
		.select()
		.from(customFields)
		.all()
		.find((f) => f.name.toLowerCase() === TIME_OF_DAY);
	if (!field) return null;
	const options = field.options
		.filter((o) => o.id)
		.sort((a, b) => a.order - b.order)
		.map((o) => ({ id: o.id as string, name: o.name, color: o.color }));
	return options.length ? { id: field.id, options } : null;
}

// Every open list, by space then folder: where a task can be filed or moved.
export function openLists() {
	return getDb()
		.select({
			id: lists.id,
			name: lists.name,
			space: spaces.name,
			folder: folders.name,
		})
		.from(lists)
		.innerJoin(spaces, eq(spaces.id, lists.spaceId))
		.leftJoin(folders, eq(folders.id, lists.folderId))
		.where(
			and(
				eq(lists.archived, false),
				eq(spaces.archived, false),
				// Every sync stamps each active list it finds with that run's
				// time, and never removes the ones it doesn't: anything older
				// than the latest stamp was deleted in ClickUp.
				gte(
					lists.syncedAt,
					sql`(select max(${lists.syncedAt}) from ${lists} where ${lists.archived} = 0)`,
				),
			),
		)
		.orderBy(asc(spaces.name), asc(folders.name), asc(lists.name))
		.all();
}

export type OpenList = ReturnType<typeof openLists>[number];
