CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`floor` integer DEFAULT 1,
	`initial_heading_deg` real DEFAULT 0,
	`proximity_radius_m` real DEFAULT 2.5,
	`waypoints_json` text NOT NULL,
	`edges_json` text NOT NULL,
	`destinations_json` text NOT NULL,
	`comment` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`role` text DEFAULT 'admin',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);