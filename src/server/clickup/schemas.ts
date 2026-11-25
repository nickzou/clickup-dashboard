import { z } from "zod";

// ClickUp sends timestamps as millisecond strings.
const ms = z.coerce.number().int();
const msOrNull = z
	.union([z.string(), z.number(), z.null()])
	.optional()
	.transform((v) =>
		v === null || v === undefined || v === "" ? null : Number(v),
	);

export const userResponse = z.object({
	user: z.object({ id: z.number() }),
});

export const space = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string().nullish(),
	archived: z.boolean().optional().default(false),
});
export const spacesResponse = z.object({ spaces: z.array(space) });

export const list = z.object({
	id: z.string(),
	name: z.string(),
	archived: z.boolean().optional().default(false),
});
export const listsResponse = z.object({ lists: z.array(list) });

// GET /list/{id}, for lists the space listings don't return (e.g. the
// personal "Personal List", whose space is hidden from /team/{id}/space).
export const listDetail = list.extend({
	folder: z.object({ id: z.string(), hidden: z.boolean().optional() }),
	space: z.object({ id: z.string() }),
});

export const folder = z.object({
	id: z.string(),
	name: z.string(),
	archived: z.boolean().optional().default(false),
	lists: z.array(list).default([]),
});
export const foldersResponse = z.object({ folders: z.array(folder) });

// Drop-down options; other field types' config is ignored.
const fieldTypeConfig = z
	.object({
		options: z
			.array(
				z.object({
					id: z.string(),
					name: z.string().optional(),
					color: z.string().nullish(),
					orderindex: z.coerce.number().optional(),
				}),
			)
			.optional(),
	})
	.optional()
	.catch(undefined);

export const task = z.object({
	id: z.string(),
	name: z.string(),
	url: z.string(),
	status: z.object({
		id: z.string().optional(),
		status: z.string(),
		type: z.string(),
		color: z.string().nullish(),
	}),
	archived: z.boolean().optional().default(false),
	date_created: ms,
	date_updated: ms,
	date_done: msOrNull,
	date_closed: msOrNull,
	due_date: msOrNull,
	start_date: msOrNull,
	time_estimate: z.number().nullish(),
	custom_item_id: z.number().nullish(),
	priority: z.object({ priority: z.string() }).nullish(),
	tags: z.array(z.object({ name: z.string() })).default([]),
	assignees: z.array(z.object({ id: z.number() })).default([]),
	parent: z.string().nullish(),
	list: z.object({ id: z.string() }),
	// `hidden` marks the placeholder folder of a list that lives in a space.
	folder: z.object({ id: z.string(), hidden: z.boolean().optional() }),
	space: z.object({ id: z.string() }),
	custom_fields: z
		.array(
			z.object({
				id: z.string(),
				name: z.string(),
				type: z.string(),
				value: z.unknown().optional(),
				type_config: fieldTypeConfig,
			}),
		)
		.default([]),
});
export type ClickUpTask = z.infer<typeof task>;

export const tasksResponse = z.object({
	tasks: z.array(task),
	last_page: z.boolean().optional(),
});

export const timeEntry = z.object({
	id: z.string(),
	task: z.object({ id: z.string() }).nullish().catch(null),
	start: ms,
	duration: ms,
	billable: z.boolean().optional().default(false),
});
export const timeEntriesResponse = z.object({
	data: z.array(timeEntry).default([]),
});

// Workspace-level custom field definitions.
export const fieldsResponse = z.object({
	fields: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			type: z.string(),
			type_config: fieldTypeConfig,
		}),
	),
});

export const taskTypesResponse = z.object({
	custom_items: z.array(z.object({ id: z.number(), name: z.string() })),
});

// A list's statuses, its own or inherited from its folder or space.
export const listStatusesResponse = z.object({
	statuses: z.array(
		z.object({
			id: z.string().optional(),
			status: z.string(),
			color: z.string().nullish(),
			type: z.string(),
			orderindex: z.coerce.number(),
		}),
	),
});
