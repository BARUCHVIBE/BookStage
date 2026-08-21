CREATE TABLE `artist_sales_assignments` (
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`artist_id`, `user_id`),
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artist_sales_one_primary` ON `artist_sales_assignments` (`artist_id`) WHERE "artist_sales_assignments"."is_primary" = 1;--> statement-breakpoint
CREATE INDEX `idx_artist_sales_organization_user` ON `artist_sales_assignments` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artists_id_organization` ON `artists` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_artists_organization_name` ON `artists` (`organization_id`,`name`);