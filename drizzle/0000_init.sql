CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`folder_id` text,
	`name` text NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`archived` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`tasks_upserted` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `task_due_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`old_due_date` integer,
	`new_due_date` integer,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_due_changes_task_idx` ON `task_due_changes` (`task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`space_id` text NOT NULL,
	`folder_id` text,
	`list_id` text NOT NULL,
	`parent_id` text,
	`status` text NOT NULL,
	`status_type` text NOT NULL,
	`status_color` text,
	`priority` text,
	`tags` text NOT NULL,
	`assignee_ids` text NOT NULL,
	`is_mine` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`date_created` integer NOT NULL,
	`date_updated` integer NOT NULL,
	`date_done` integer,
	`date_closed` integer,
	`due_date` integer,
	`start_date` integer,
	`time_estimate` integer,
	`custom_fields` text NOT NULL,
	`synced_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `tasks_date_done_idx` ON `tasks` (`date_done`);--> statement-breakpoint
CREATE INDEX `tasks_date_closed_idx` ON `tasks` (`date_closed`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_list_idx` ON `tasks` (`list_id`);--> statement-breakpoint
CREATE INDEX `tasks_space_idx` ON `tasks` (`space_id`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`start` integer NOT NULL,
	`duration` integer NOT NULL,
	`billable` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `time_entries_start_idx` ON `time_entries` (`start`);