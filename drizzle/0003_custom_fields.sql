CREATE TABLE `custom_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`options` text NOT NULL,
	`synced_at` integer NOT NULL
);
