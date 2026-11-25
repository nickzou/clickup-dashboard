CREATE TABLE `task_types` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `custom_item_id` integer;