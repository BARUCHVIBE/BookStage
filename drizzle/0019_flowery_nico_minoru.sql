CREATE TABLE `commercial_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`booking_user_id` text NOT NULL,
	`opportunity_id` text,
	`source` text DEFAULT 'BOOKING_CATALOG' NOT NULL,
	`status` text DEFAULT 'NEW' NOT NULL,
	`customer_name` text NOT NULL,
	`company_name` text,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`document` text,
	`event_date` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`venue` text,
	`event_type` text NOT NULL,
	`estimated_audience` integer,
	`budget` text,
	`notes` text,
	`decision_notes` text,
	`decided_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`booking_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commercial_requests_id_tenant` ON `commercial_requests` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_commercial_requests_booking_status` ON `commercial_requests` (`booking_user_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_commercial_requests_tenant_status` ON `commercial_requests` (`organization_id`,`status`,`created_at`);