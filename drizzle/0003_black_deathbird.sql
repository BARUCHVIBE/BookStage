CREATE TABLE `calendar_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`start_datetime` text NOT NULL,
	`end_datetime` text,
	`status` text NOT NULL,
	`title` text NOT NULL,
	`internal_notes` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_entries_id_organization` ON `calendar_entries` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_calendar_organization_start` ON `calendar_entries` (`organization_id`,`start_datetime`);--> statement-breakpoint
CREATE INDEX `idx_calendar_organization_artist_start` ON `calendar_entries` (`organization_id`,`artist_id`,`start_datetime`);--> statement-breakpoint
CREATE INDEX `idx_calendar_organization_status_start` ON `calendar_entries` (`organization_id`,`status`,`start_datetime`);--> statement-breakpoint
CREATE TRIGGER `trg_calendar_blocking_insert` BEFORE INSERT ON `calendar_entries`
WHEN NEW.status IN ('CONFIRMED','BLOCKED') AND EXISTS (
	SELECT 1 FROM `calendar_entries` existing
	WHERE existing.organization_id=NEW.organization_id
		AND existing.artist_id=NEW.artist_id
		AND existing.status IN ('CONFIRMED','BLOCKED')
		AND existing.start_datetime<=COALESCE(NEW.end_datetime,NEW.start_datetime)
		AND COALESCE(existing.end_datetime,existing.start_datetime)>=NEW.start_datetime
)
BEGIN SELECT RAISE(ABORT,'CALENDAR_CONFLICT'); END;--> statement-breakpoint
CREATE TRIGGER `trg_calendar_blocking_update` BEFORE UPDATE ON `calendar_entries`
WHEN NEW.status IN ('CONFIRMED','BLOCKED') AND EXISTS (
	SELECT 1 FROM `calendar_entries` existing
	WHERE existing.id<>NEW.id
		AND existing.organization_id=NEW.organization_id
		AND existing.artist_id=NEW.artist_id
		AND existing.status IN ('CONFIRMED','BLOCKED')
		AND existing.start_datetime<=COALESCE(NEW.end_datetime,NEW.start_datetime)
		AND COALESCE(existing.end_datetime,existing.start_datetime)>=NEW.start_datetime
)
BEGIN SELECT RAISE(ABORT,'CALENDAR_CONFLICT'); END;--> statement-breakpoint
PRAGMA optimize;
