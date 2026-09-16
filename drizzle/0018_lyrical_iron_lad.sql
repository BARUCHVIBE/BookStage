CREATE TABLE `booking_commercial_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_code` text NOT NULL,
	`title` text DEFAULT 'Booking Agent' NOT NULL,
	`avatar_url` text,
	`phone` text,
	`whatsapp` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_booking_commercial_profiles_code` ON `booking_commercial_profiles` (`public_code`);--> statement-breakpoint
CREATE INDEX `idx_booking_commercial_profiles_status` ON `booking_commercial_profiles` (`status`);