CREATE TABLE `contract_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`template_key` text NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`body` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_templates_id_organization` ON `contract_templates` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_templates_key_version` ON `contract_templates` (`organization_id`,`template_key`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_templates_one_default` ON `contract_templates` (`organization_id`) WHERE "contract_templates"."is_default" = 1 AND "contract_templates"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX `idx_contract_templates_organization_status` ON `contract_templates` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`show_id` text,
	`customer_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`contract_number` text NOT NULL,
	`template_id` text,
	`template_body_snapshot` text,
	`field_values` text DEFAULT '{}' NOT NULL,
	`generated_at` text,
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
	FOREIGN KEY (`template_id`,`organization_id`) REFERENCES `contract_templates`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_contracts`("id", "organization_id", "opportunity_id", "show_id", "customer_id", "artist_id", "contract_number", "template_id", "template_body_snapshot", "field_values", "generated_at", "status", "file_key", "file_name", "file_type", "file_size", "file_uploaded_at", "sent_at", "signed_at", "notes", "created_by", "created_at", "updated_at") SELECT "id", "organization_id", "opportunity_id", "show_id", "customer_id", "artist_id", "contract_number", NULL, NULL, '{}', NULL, "status", "file_key", "file_name", "file_type", "file_size", "file_uploaded_at", "sent_at", "signed_at", "notes", "created_by", "created_at", "updated_at" FROM `contracts`;--> statement-breakpoint
DROP TABLE `contracts`;--> statement-breakpoint
ALTER TABLE `__new_contracts` RENAME TO `contracts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contracts_id_organization` ON `contracts` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contracts_number_tenant` ON `contracts` (`organization_id`,`contract_number`);--> statement-breakpoint
CREATE INDEX `idx_contracts_opportunity_created` ON `contracts` (`organization_id`,`opportunity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_contracts_show` ON `contracts` (`organization_id`,`show_id`);--> statement-breakpoint
CREATE INDEX `idx_contracts_status_updated` ON `contracts` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TRIGGER `trg_contract_status_insert` BEFORE INSERT ON `contracts` WHEN NEW.status NOT IN ('DRAFT','SENT','SIGNED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_STATUS'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_status_update` BEFORE UPDATE OF status ON `contracts` WHEN NEW.status NOT IN ('DRAFT','SENT','SIGNED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_STATUS'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_template_status_insert` BEFORE INSERT ON `contract_templates` WHEN NEW.status NOT IN ('ACTIVE','ARCHIVED') OR NEW.version<1 OR length(NEW.body)>50000 BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_template_status_update` BEFORE UPDATE OF status,version,body ON `contract_templates` WHEN NEW.status NOT IN ('ACTIVE','ARCHIVED') OR NEW.version<1 OR length(NEW.body)>50000 BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE'); END;--> statement-breakpoint
PRAGMA optimize;
