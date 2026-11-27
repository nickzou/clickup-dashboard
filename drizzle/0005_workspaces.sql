CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`backfilled_at` integer,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task_types` (
	`team_id` text NOT NULL,
	`id` integer NOT NULL,
	`name` text NOT NULL,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`team_id`, `id`)
);
--> statement-breakpoint
DROP TABLE `task_types`;--> statement-breakpoint
ALTER TABLE `__new_task_types` RENAME TO `task_types`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `custom_fields` ADD `team_id` text;--> statement-breakpoint
ALTER TABLE `spaces` ADD `team_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `team_id` text;--> statement-breakpoint
ALTER TABLE `time_entries` ADD `team_id` text;