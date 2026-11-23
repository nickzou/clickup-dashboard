CREATE TABLE `task_status_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`old_status` text NOT NULL,
	`new_status` text NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_status_changes_task_idx` ON `task_status_changes` (`task_id`);--> statement-breakpoint
ALTER TABLE `task_due_changes` ADD `status` text;