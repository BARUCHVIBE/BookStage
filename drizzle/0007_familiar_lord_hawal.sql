CREATE TABLE `opportunity_calendar_entries` (
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`calendar_entry_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`organization_id`, `opportunity_id`),
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`calendar_entry_id`,`organization_id`) REFERENCES `calendar_entries`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunity_calendar_entry` ON `opportunity_calendar_entries` (`organization_id`,`calendar_entry_id`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`calendar_entry_id` text NOT NULL,
	`status` text DEFAULT 'PREPARING' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`calendar_entry_id`,`organization_id`) REFERENCES `calendar_entries`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shows_id_organization` ON `shows` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shows_opportunity_tenant` ON `shows` (`organization_id`,`opportunity_id`);