CREATE TABLE `show_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`show_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_show_activities_timeline` ON `show_activities` (`organization_id`,`show_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shows` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`calendar_entry_id` text NOT NULL,
	`event_name` text DEFAULT '' NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`show_time` text,
	`venue` text,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`address` text,
	`fee` integer,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`local_contact_name` text,
	`local_contact_phone` text,
	`producer_user_id` text,
	`soundcheck_at` text,
	`hotel` text,
	`transportation` text,
	`airport` text,
	`dressing_room` text,
	`technical_info` text,
	`production_notes` text,
	`rider_file_key` text,
	`rider_file_name` text,
	`rider_file_type` text,
	`rider_file_size` integer,
	`stage_map_file_key` text,
	`stage_map_file_name` text,
	`stage_map_file_type` text,
	`stage_map_file_size` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`calendar_entry_id`,`organization_id`) REFERENCES `calendar_entries`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`producer_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_shows`("id", "organization_id", "opportunity_id", "artist_id", "customer_id", "calendar_entry_id", "event_name", "date", "show_time", "venue", "city", "state", "address", "fee", "status", "created_at", "updated_at") SELECT show.id,show.organization_id,show.opportunity_id,show.artist_id,show.customer_id,show.calendar_entry_id,COALESCE(artist.name || ' · ' || opportunity.event_type,'Show'),COALESCE(opportunity.event_date,''),substr(calendar.start_datetime,12,5),opportunity.venue,COALESCE(opportunity.city,''),COALESCE(opportunity.state,''),NULL,opportunity.proposed_value,CASE WHEN show.status='PREPARING' THEN 'IN_PREPARATION' ELSE 'CONFIRMED' END,show.created_at,show.updated_at FROM `shows` show LEFT JOIN opportunities opportunity ON opportunity.id=show.opportunity_id AND opportunity.organization_id=show.organization_id LEFT JOIN artists artist ON artist.id=show.artist_id AND artist.organization_id=show.organization_id LEFT JOIN calendar_entries calendar ON calendar.id=show.calendar_entry_id AND calendar.organization_id=show.organization_id;--> statement-breakpoint
DROP TABLE `shows`;--> statement-breakpoint
ALTER TABLE `__new_shows` RENAME TO `shows`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shows_id_organization` ON `shows` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_shows_opportunity_tenant` ON `shows` (`organization_id`,`opportunity_id`);--> statement-breakpoint
CREATE INDEX `idx_shows_organization_date` ON `shows` (`organization_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_shows_organization_status_date` ON `shows` (`organization_id`,`status`,`date`);--> statement-breakpoint
CREATE INDEX `idx_shows_producer_date` ON `shows` (`organization_id`,`producer_user_id`,`date`);
