import "@tanstack/react-start/server-only";
import { eq, notInArray } from "drizzle-orm";
import type { ClickUpClient } from "../clickup/client";
import {
	foldersResponse,
	listDetail,
	listsResponse,
	space,
	spacesResponse,
} from "../clickup/schemas";
import type { Db } from "../db/client";
import { folders, lists, spaces, tasks } from "../db/schema";

// Spaces, folders and lists, for names and grouping in charts. Incremental
// runs skip archived ones; backfill and reconcile include them.
export async function syncHierarchy(
	db: Db,
	client: ClickUpClient,
	teamId: string,
	{ includeArchived }: { includeArchived: boolean },
) {
	const now = Date.now();
	const passes = includeArchived ? [false, true] : [false];

	for (const archived of passes) {
		const { spaces: spaceRows } = await client.get(
			`/team/${teamId}/space`,
			spacesResponse,
			{ archived },
		);
		for (const s of spaceRows) {
			upsertSpace(db, { ...s, teamId, archived: s.archived || archived }, now);
		}
	}

	// Lists can be archived inside an active space, so walk every known space
	// of the workspace.
	const allSpaces = db
		.select({ id: spaces.id })
		.from(spaces)
		.where(eq(spaces.teamId, teamId))
		.all();
	for (const { id: spaceId } of allSpaces) {
		for (const archived of passes) {
			const { folders: folderRows } = await client.get(
				`/space/${spaceId}/folder`,
				foldersResponse,
				{ archived },
			);
			const { lists: listRows } = await client.get(
				`/space/${spaceId}/list`,
				listsResponse,
				{ archived },
			);
			db.transaction((tx) => {
				for (const f of folderRows) {
					const row = {
						id: f.id,
						spaceId,
						name: f.name,
						archived: f.archived || archived,
						syncedAt: now,
					};
					tx.insert(folders)
						.values(row)
						.onConflictDoUpdate({ target: folders.id, set: row })
						.run();
					for (const l of f.lists) {
						upsertList(tx, { ...l, spaceId, folderId: f.id }, now);
					}
				}
				for (const l of listRows) {
					upsertList(
						tx,
						{ ...l, spaceId, folderId: null, archived: l.archived || archived },
						now,
					);
				}
			});
		}
	}
}

// Fetches lists and spaces that tasks reference but the listings above didn't
// return. Run after the task sync.
export async function syncMissingParents(db: Db, client: ClickUpClient) {
	const now = Date.now();
	const missingLists = db
		.selectDistinct({ id: tasks.listId })
		.from(tasks)
		.where(notInArray(tasks.listId, db.select({ id: lists.id }).from(lists)))
		.all();
	for (const { id } of missingLists) {
		const l = await client.find(`/list/${id}`, listDetail);
		if (!l) continue;
		upsertList(
			db,
			{
				id: l.id,
				name: l.name,
				archived: l.archived,
				spaceId: l.space.id,
				folderId: l.folder.hidden ? null : l.folder.id,
			},
			now,
		);
	}

	const missingSpaces = db
		.selectDistinct({ id: lists.spaceId })
		.from(lists)
		.where(notInArray(lists.spaceId, db.select({ id: spaces.id }).from(spaces)))
		.all();
	for (const { id } of missingSpaces) {
		const s = await client.find(`/space/${id}`, space);
		// The space's workspace, from its tasks.
		const teamId =
			db
				.select({ teamId: tasks.teamId })
				.from(tasks)
				.where(eq(tasks.spaceId, id))
				.get()?.teamId ?? null;
		if (s) upsertSpace(db, { ...s, teamId }, now);
	}
}

function upsertSpace(
	db: Db,
	s: {
		id: string;
		teamId: string | null;
		name: string;
		color?: string | null;
		archived: boolean;
	},
	now: number,
) {
	const row = {
		id: s.id,
		teamId: s.teamId,
		name: s.name,
		color: s.color ?? null,
		archived: s.archived,
		syncedAt: now,
	};
	db.insert(spaces)
		.values(row)
		.onConflictDoUpdate({ target: spaces.id, set: row })
		.run();
}

function upsertList(
	db: Pick<Db, "insert">,
	l: {
		id: string;
		name: string;
		archived: boolean;
		spaceId: string;
		folderId: string | null;
	},
	now: number,
) {
	const row = { ...l, syncedAt: now };
	db.insert(lists)
		.values(row)
		.onConflictDoUpdate({ target: lists.id, set: row })
		.run();
}
