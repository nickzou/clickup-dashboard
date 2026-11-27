import "@tanstack/react-start/server-only";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "./db/client";
import { customFields, folders, lists, spaces } from "./db/schema";

// Lookups the add and edit task server functions share. Kept apart from
// those modules: client code imports them for their server functions, and a
// plain export here would drag the database into the client bundle.

const TIME_OF_DAY = "time of day";

// A workspace's Time of Day field and its settable options, if it has one.
export function timeOfDayField(teamId: string | null) {
	const field = getDb()
		.select()
		.from(customFields)
		.all()
		.find((f) => f.teamId === teamId && f.name.toLowerCase() === TIME_OF_DAY);
	if (!field) return null;
	const options = field.options
		.filter((o) => o.id)
		.sort((a, b) => a.order - b.order)
		.map((o) => ({ id: o.id as string, name: o.name, color: o.color }));
	return options.length ? { id: field.id, options } : null;
}

const otherLists = alias(lists, "other_lists");
const otherSpaces = alias(spaces, "other_spaces");

// Every open list, by space then folder: where a task can be filed or moved.
export function openLists() {
	return getDb()
		.select({
			id: lists.id,
			name: lists.name,
			space: spaces.name,
			folder: folders.name,
			teamId: spaces.teamId,
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
				// than its workspace's latest stamp was deleted in ClickUp.
				gte(
					lists.syncedAt,
					sql`(select max(${otherLists.syncedAt}) from ${otherLists} join ${otherSpaces} on ${otherSpaces.id} = ${otherLists.spaceId} where ${otherLists.archived} = 0 and ${otherSpaces.teamId} is ${spaces.teamId})`,
				),
			),
		)
		.orderBy(asc(spaces.name), asc(folders.name), asc(lists.name))
		.all();
}

export type OpenList = ReturnType<typeof openLists>[number];

// Each workspace's Time of Day options, for the lists' workspaces.
export function timeOfDayByTeam(rows: OpenList[]) {
	const byTeam: Record<
		string,
		{ id: string; name: string; color: string | null }[]
	> = {};
	for (const teamId of new Set(rows.map((l) => l.teamId ?? ""))) {
		const field = timeOfDayField(teamId || null);
		if (field) byTeam[teamId] = field.options;
	}
	return byTeam;
}
