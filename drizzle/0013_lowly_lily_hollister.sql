CREATE TABLE `commercial_referral_links` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commercial_referral_links_token` ON `commercial_referral_links` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commercial_referral_links_id_tenant` ON `commercial_referral_links` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_commercial_referral_links_member` ON `commercial_referral_links` (`organization_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_commercial_referral_links_artist` ON `commercial_referral_links` (`organization_id`,`artist_id`,`status`);--> statement-breakpoint
CREATE TABLE `membership_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_membership_activities_timeline` ON `membership_activities` (`organization_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `opportunity_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text NOT NULL,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`requested_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`reviewed_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunity_approvals_one_pending` ON `opportunity_approvals` (`organization_id`,`opportunity_id`,`kind`) WHERE "opportunity_approvals"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX `idx_opportunity_approvals_queue` ON `opportunity_approvals` (`organization_id`,`kind`,`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `opportunity_financial_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`opportunity_id` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 100 NOT NULL,
	`unit_amount` integer NOT NULL,
	`total_amount` integer NOT NULL,
	`notes` text,
	`responsible_user_id` text,
	`status` text DEFAULT 'ESTIMATED' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`responsible_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunity_financial_items_id_tenant` ON `opportunity_financial_items` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_opportunity_financial_items_opportunity` ON `opportunity_financial_items` (`organization_id`,`opportunity_id`,`kind`,`status`);--> statement-breakpoint
CREATE TABLE `referral_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`referral_link_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`opportunity_id` text,
	`type` text NOT NULL,
	`session_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`referral_link_id`,`organization_id`) REFERENCES `commercial_referral_links`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_referral_events_link_type_created` ON `referral_events` (`organization_id`,`referral_link_id`,`type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_referral_events_session_type_created` ON `referral_events` (`referral_link_id`,`session_hash`,`type`,`created_at`);--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_commission_amount_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_commission_amount_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_show_fee_commission_consistency`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_show_commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`show_id` text,
	`opportunity_id` text,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'SALES' NOT NULL,
	`method` text DEFAULT 'PERCENTAGE' NOT NULL,
	`calculation_base` text DEFAULT 'GROSS_REVENUE' NOT NULL,
	`percentage` integer,
	`base_amount` integer DEFAULT 0 NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'ESTIMATED' NOT NULL,
	`source` text,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_show_commissions`("id", "organization_id", "show_id", "opportunity_id", "user_id", "type", "method", "calculation_base", "percentage", "base_amount", "amount", "status", "source", "notes", "created_by", "created_at", "updated_at") SELECT commission.id,commission.organization_id,commission.show_id,show.opportunity_id,commission.user_id,'SALES','PERCENTAGE','GROSS_REVENUE',commission.percentage,COALESCE(show.fee,0),commission.amount,CASE commission.status WHEN 'PAID' THEN 'PAID' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'ESTIMATED' END,'LEGACY',NULL,NULL,commission.created_at,commission.updated_at FROM `show_commissions` commission JOIN `shows` show ON show.id=commission.show_id AND show.organization_id=commission.organization_id;--> statement-breakpoint
DROP TABLE `show_commissions`;--> statement-breakpoint
ALTER TABLE `__new_show_commissions` RENAME TO `show_commissions`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_show_commissions_id_organization` ON `show_commissions` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_show_commissions_participant_tenant` ON `show_commissions` (`organization_id`,`show_id`,`user_id`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_show_commissions_opportunity_participant` ON `show_commissions` (`organization_id`,`opportunity_id`,`user_id`,`type`) WHERE "show_commissions"."opportunity_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_show_commissions_status` ON `show_commissions` (`organization_id`,`status`);--> statement-breakpoint
ALTER TABLE `calendar_entries` ADD `option_expires_at` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `professional_role` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `department` text DEFAULT 'COMMERCIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `artist_access_scope` text DEFAULT 'ASSIGNED' NOT NULL;--> statement-breakpoint
UPDATE `memberships` SET `department`=CASE `role` WHEN 'OWNER' THEN 'MANAGEMENT' WHEN 'MANAGER' THEN 'MANAGEMENT' WHEN 'PRODUCTION' THEN 'PRODUCTION' WHEN 'FINANCE' THEN 'FINANCE' ELSE 'COMMERCIAL' END,`artist_access_scope`=CASE WHEN `role` IN ('OWNER','MANAGER','PRODUCTION','FINANCE') THEN 'ALL' ELSE 'ASSIGNED' END;--> statement-breakpoint
CREATE INDEX `idx_memberships_organization_department` ON `memberships` (`organization_id`,`department`,`status`);--> statement-breakpoint
CREATE TABLE `__new_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`assigned_user_id` text,
	`originator_user_id` text,
	`referral_link_id` text,
	`referred_at` text,
	`commercial_approval_status` text DEFAULT 'NOT_REQUESTED' NOT NULL,
	`financial_approval_status` text DEFAULT 'NOT_REQUESTED' NOT NULL,
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
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`,`organization_id`) REFERENCES `customers`(`id`,`organization_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`assigned_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`originator_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_opportunities`("id", "organization_id", "artist_id", "customer_id", "assigned_user_id", "originator_user_id", "referral_link_id", "referred_at", "commercial_approval_status", "financial_approval_status", "stage", "source", "event_date", "city", "state", "venue", "event_type", "estimated_audience", "budget", "proposed_value", "notes", "next_action", "next_action_at", "lost_reason", "created_at", "updated_at") SELECT "id","organization_id","artist_id","customer_id","assigned_user_id","assigned_user_id",NULL,NULL,'NOT_REQUESTED','NOT_REQUESTED',"stage","source","event_date","city","state","venue","event_type","estimated_audience","budget","proposed_value","notes","next_action","next_action_at","lost_reason","created_at","updated_at" FROM `opportunities`;--> statement-breakpoint
DROP TABLE `opportunities`;--> statement-breakpoint
ALTER TABLE `__new_opportunities` RENAME TO `opportunities`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunities_id_organization` ON `opportunities` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_created` ON `opportunities` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_assignee_stage` ON `opportunities` (`organization_id`,`assigned_user_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_stage_updated` ON `opportunities` (`organization_id`,`stage`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_next_action` ON `opportunities` (`organization_id`,`next_action_at`,`stage`);
--> statement-breakpoint
CREATE TRIGGER `trg_opportunity_stage_insert` BEFORE INSERT ON `opportunities` WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG','INTERNAL') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END;--> statement-breakpoint
CREATE TRIGGER `trg_opportunity_stage_update` BEFORE UPDATE OF stage,source ON `opportunities` WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG','INTERNAL') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA optimize;
