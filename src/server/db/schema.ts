import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

// Timestamps from ClickUp are stored as epoch milliseconds, exactly as ClickUp
// sends them. Bucketing into days happens at query time using TZ.

// The ClickUp workspaces in CLICKUP_TEAM_ID. A workspace gets a full pass
// the first time it's seen, then incremental runs like the rest.
export const workspaces = sqliteTable("workspaces", {
	id: text().primaryKey(),
	name: text().notNull(),
	// Set once a full pass of the workspace has succeeded.
	backfilledAt: integer(),
	syncedAt: integer().notNull(),
});

// IDs are unique across workspaces, except task types'. team_id is null on
// rows from before several workspaces were synced, until a sync fills it in.
export const spaces = sqliteTable("spaces", {
	id: text().primaryKey(),
	teamId: text(),
	name: text().notNull(),
	color: text(),
	archived: integer({ mode: "boolean" }).notNull().default(false),
	syncedAt: integer().notNull(),
});

export const folders = sqliteTable("folders", {
	id: text().primaryKey(),
	spaceId: text().notNull(),
	name: text().notNull(),
	archived: integer({ mode: "boolean" }).notNull().default(false),
	syncedAt: integer().notNull(),
});

export const lists = sqliteTable("lists", {
	id: text().primaryKey(),
	spaceId: text().notNull(),
	// Null for lists that live directly in a space.
	folderId: text(),
	name: text().notNull(),
	archived: integer({ mode: "boolean" }).notNull().default(false),
	syncedAt: integer().notNull(),
});

export type CustomFieldValue = {
	id: string;
	name: string;
	type: string;
	value: unknown;
	// Drop-downs: the chosen option, resolved at sync time.
	option?: FieldOption;
};

export const tasks = sqliteTable(
	"tasks",
	{
		id: text().primaryKey(),
		teamId: text(),
		name: text().notNull(),
		url: text().notNull(),
		spaceId: text().notNull(),
		folderId: text(),
		listId: text().notNull(),
		parentId: text(),
		status: text().notNull(),
		// "open" | "custom" | "done" | "closed"
		statusType: text().notNull(),
		statusColor: text(),
		priority: text(),
		tags: text({ mode: "json" }).$type<string[]>().notNull(),
		assigneeIds: text({ mode: "json" }).$type<number[]>().notNull(),
		// Assigned to the token's user, or to nobody. Stats only count these.
		isMine: integer({ mode: "boolean" }).notNull(),
		archived: integer({ mode: "boolean" }).notNull().default(false),
		dateCreated: integer().notNull(),
		dateUpdated: integer().notNull(),
		dateDone: integer(),
		dateClosed: integer(),
		dueDate: integer(),
		startDate: integer(),
		timeEstimate: integer(),
		// ClickUp's task type: 0 or null for a plain task, else an id from
		// task_types (Meeting, Milestone, ...).
		customItemId: integer(),
		customFields: text({ mode: "json" }).$type<CustomFieldValue[]>().notNull(),
		syncedAt: integer().notNull(),
		// Set by the nightly reconcile when ClickUp no longer returns the task.
		deletedAt: integer(),
	},
	(t) => [
		index("tasks_date_done_idx").on(t.dateDone),
		index("tasks_date_closed_idx").on(t.dateClosed),
		index("tasks_due_date_idx").on(t.dueDate),
		index("tasks_list_idx").on(t.listId),
		index("tasks_space_idx").on(t.spaceId),
	],
);

// ClickUp's API has no task history, so due-date changes are recorded as the
// sync observes them. History starts at the first sync.
export const taskDueChanges = sqliteTable(
	"task_due_changes",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		taskId: text().notNull(),
		oldDueDate: integer(),
		newDueDate: integer(),
		// The task's status when the change was seen. Null on older rows.
		status: text(),
		seenAt: integer().notNull(),
	},
	(t) => [index("task_due_changes_task_idx").on(t.taskId)],
);

// Workspace custom field definitions, for drop-down option names and colors.
// Each workspace's task types, replaced on every run like custom_fields.
// Their ids repeat across workspaces (1001 is each one's first own type).
export const taskTypes = sqliteTable(
	"task_types",
	{
		teamId: text().notNull(),
		id: integer().notNull(),
		name: text().notNull(),
		syncedAt: integer().notNull(),
	},
	(t) => [primaryKey({ columns: [t.teamId, t.id] })],
);

export type FieldOption = {
	// ClickUp's id for the option, needed to set it. Missing on rows from
	// before it was kept.
	id?: string;
	name: string;
	color: string | null;
	order: number;
};
export const customFields = sqliteTable("custom_fields", {
	id: text().primaryKey(),
	teamId: text(),
	name: text().notNull(),
	type: text().notNull(),
	options: text({ mode: "json" }).$type<FieldOption[]>().notNull(),
	syncedAt: integer().notNull(),
});

// Status changes, recorded the same way: from the first sync that sees them.
export const taskStatusChanges = sqliteTable(
	"task_status_changes",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		taskId: text().notNull(),
		oldStatus: text().notNull(),
		newStatus: text().notNull(),
		seenAt: integer().notNull(),
	},
	(t) => [index("task_status_changes_task_idx").on(t.taskId)],
);

export const timeEntries = sqliteTable(
	"time_entries",
	{
		id: text().primaryKey(),
		teamId: text(),
		taskId: text(),
		start: integer().notNull(),
		// Milliseconds. Running timers are skipped until they stop.
		duration: integer().notNull(),
		billable: integer({ mode: "boolean" }).notNull().default(false),
		syncedAt: integer().notNull(),
	},
	(t) => [index("time_entries_start_idx").on(t.start)],
);

export const syncRuns = sqliteTable("sync_runs", {
	id: integer().primaryKey({ autoIncrement: true }),
	kind: text({ enum: ["backfill", "incremental", "reconcile"] }).notNull(),
	status: text({ enum: ["running", "ok", "error"] }).notNull(),
	startedAt: integer({ mode: "timestamp_ms" }).notNull(),
	finishedAt: integer({ mode: "timestamp_ms" }),
	// Refreshed while the run is in progress; a stale heartbeat means the
	// process running it died.
	heartbeatAt: integer({ mode: "timestamp_ms" }),
	tasksUpserted: integer().notNull().default(0),
	requests: integer().notNull().default(0),
	error: text(),
});
