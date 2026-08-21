CREATE TABLE `proposal_sequences` (
	`organization_id` text NOT NULL,
	`year` integer NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`organization_id`, `year`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`proposal_number` text NOT NULL,
	`value` integer NOT NULL,
	`payment_terms` text NOT NULL,
	`transportation_terms` text,
	`accommodation_terms` text,
	`technical_terms` text,
	`additional_terms` text,
	`validity_date` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proposals_id_organization` ON `proposals` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proposals_number_tenant` ON `proposals` (`organization_id`,`proposal_number`);--> statement-breakpoint
CREATE INDEX `idx_proposals_opportunity_created` ON `proposals` (`organization_id`,`opportunity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_proposals_status_validity` ON `proposals` (`organization_id`,`status`,`validity_date`);