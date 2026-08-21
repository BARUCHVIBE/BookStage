CREATE TABLE `booking_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`assigned_to` text,
	`status` text DEFAULT 'NEW' NOT NULL,
	`source` text DEFAULT 'PUBLIC_CATALOG' NOT NULL,
	`event_date` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`venue` text,
	`event_type` text NOT NULL,
	`estimated_audience` integer,
	`budget` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`assigned_to`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_booking_requests_organization_created` ON `booking_requests` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_booking_requests_organization_assignee` ON `booking_requests` (`organization_id`,`assigned_to`,`status`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`company_name` text,
	`email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`phone` text NOT NULL,
	`normalized_phone` text NOT NULL,
	`document` text,
	`city` text,
	`state` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_id_organization` ON `customers` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_organization_email` ON `customers` (`organization_id`,`normalized_email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_organization_phone` ON `customers` (`organization_id`,`normalized_phone`);--> statement-breakpoint
CREATE TABLE `public_request_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`fingerprint_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_public_attempts_organization_hash_created` ON `public_request_attempts` (`organization_id`,`fingerprint_hash`,`created_at`);--> statement-breakpoint
PRAGMA optimize;
