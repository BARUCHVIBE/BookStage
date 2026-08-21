CREATE TABLE `opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`assigned_user_id` text,
	`stage` text DEFAULT 'NEW' NOT NULL,
	`source` text DEFAULT 'PUBLIC_CATALOG' NOT NULL,
	`event_date` text NOT NULL,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`venue` text,
	`event_type` text NOT NULL,
	`estimated_audience` integer,
	`budget` text,
	`proposed_value` integer,
	`notes` text,
	`next_action` text,
	`next_action_at` text,
	`lost_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`),
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`),
	FOREIGN KEY (`organization_id`,`assigned_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`)
);
--> statement-breakpoint
INSERT INTO `opportunities` (`id`,`organization_id`,`artist_id`,`customer_id`,`assigned_user_id`,`stage`,`source`,`event_date`,`city`,`state`,`venue`,`event_type`,`estimated_audience`,`budget`,`notes`,`created_at`,`updated_at`) SELECT `id`,`organization_id`,`artist_id`,`customer_id`,`assigned_to`,`status`,`source`,`event_date`,`city`,`state`,`venue`,`event_type`,`estimated_audience`,`budget`,`notes`,`created_at`,`updated_at` FROM `booking_requests`;
--> statement-breakpoint
DROP TABLE `booking_requests`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunities_id_organization` ON `opportunities` (`id`,`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_created` ON `opportunities` (`organization_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_assignee_stage` ON `opportunities` (`organization_id`,`assigned_user_id`,`stage`);
--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_stage_updated` ON `opportunities` (`organization_id`,`stage`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `opportunity_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_opportunity_activities_timeline` ON `opportunity_activities` (`organization_id`,`opportunity_id`,`created_at`);
--> statement-breakpoint
INSERT INTO `opportunity_activities` (`id`,`organization_id`,`opportunity_id`,`type`,`description`,`to_value`,`created_at`) SELECT lower(hex(randomblob(16))),`organization_id`,`id`,'CREATED','Oportunidade migrada da caixa de solicitações.',`source`,`created_at` FROM `opportunities`;
--> statement-breakpoint
PRAGMA optimize;
