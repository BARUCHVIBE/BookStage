CREATE TABLE `contract_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contract_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`contract_id`,`organization_id`) REFERENCES `contracts`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_contract_activities_timeline` ON `contract_activities` (`organization_id`,`contract_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `contract_sequences` (
	`organization_id` text NOT NULL,
	`year` integer NOT NULL,
	`next_number` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`organization_id`, `year`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`show_id` text,
	`customer_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`contract_number` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`file_key` text,
	`file_name` text,
	`file_type` text,
	`file_size` integer,
	`file_uploaded_at` text,
	`sent_at` text,
	`signed_at` text,
	`notes` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contracts_id_organization` ON `contracts` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contracts_number_tenant` ON `contracts` (`organization_id`,`contract_number`);--> statement-breakpoint
CREATE INDEX `idx_contracts_opportunity_created` ON `contracts` (`organization_id`,`opportunity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contracts_show` ON `contracts` (`organization_id`,`show_id`);--> statement-breakpoint
CREATE INDEX `idx_contracts_status_updated` ON `contracts` (`organization_id`,`status`,`updated_at`);