ALTER TABLE `artists` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `photo_url` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `cover_url` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `genre` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `description` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `base_city` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `show_formats` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `video_urls` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `instagram` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `spotify` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `youtube` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `public_materials` text;--> statement-breakpoint
ALTER TABLE `artists` ADD `is_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artists_organization_slug` ON `artists` (`organization_id`,`slug`) WHERE "artists"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_artists_organization_public` ON `artists` (`organization_id`,`is_public`,`status`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `description` text;--> statement-breakpoint
PRAGMA optimize;
