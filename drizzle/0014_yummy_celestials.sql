CREATE TABLE `booking_collaborator_artist_access` (
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL CHECK (`status` IN ('ACTIVE','SUSPENDED')),
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`artist_id`, `user_id`),
	FOREIGN KEY (`artist_id`,`organization_id`) REFERENCES `artists`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`created_by`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_booking_access_member_status` ON `booking_collaborator_artist_access` (`organization_id`,`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_booking_access_artist_status` ON `booking_collaborator_artist_access` (`organization_id`,`artist_id`,`status`);--> statement-breakpoint
INSERT INTO `booking_collaborator_artist_access` (`organization_id`,`artist_id`,`user_id`,`status`,`created_by`,`created_at`,`updated_at`)
SELECT assignment.organization_id,assignment.artist_id,assignment.user_id,'ACTIVE',
       COALESCE((SELECT owner.user_id FROM memberships owner WHERE owner.organization_id=assignment.organization_id AND owner.role='OWNER' AND owner.status='ACTIVE' LIMIT 1),assignment.user_id),
       assignment.created_at,assignment.updated_at
FROM artist_sales_assignments assignment
JOIN memberships membership ON membership.organization_id=assignment.organization_id AND membership.user_id=assignment.user_id
WHERE membership.professional_role='BOOKING_AGENT';--> statement-breakpoint
DELETE FROM artist_sales_assignments
WHERE EXISTS (
  SELECT 1 FROM memberships membership
  WHERE membership.organization_id=artist_sales_assignments.organization_id
    AND membership.user_id=artist_sales_assignments.user_id
    AND membership.professional_role='BOOKING_AGENT'
);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`assigned_user_id` text,
	`originator_user_id` text,
	`commercial_validator_user_id` text,
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
	FOREIGN KEY (`organization_id`,`originator_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`,`commercial_validator_user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_opportunities`("id", "organization_id", "artist_id", "customer_id", "assigned_user_id", "originator_user_id", "commercial_validator_user_id", "referral_link_id", "referred_at", "commercial_approval_status", "financial_approval_status", "stage", "source", "event_date", "city", "state", "venue", "event_type", "estimated_audience", "budget", "proposed_value", "notes", "next_action", "next_action_at", "lost_reason", "created_at", "updated_at")
SELECT opportunity."id",opportunity."organization_id",opportunity."artist_id",opportunity."customer_id",opportunity."assigned_user_id",opportunity."originator_user_id",
       (SELECT assignment.user_id FROM artist_sales_assignments assignment JOIN memberships membership ON membership.organization_id=assignment.organization_id AND membership.user_id=assignment.user_id WHERE assignment.organization_id=opportunity.organization_id AND assignment.artist_id=opportunity.artist_id AND assignment.is_primary=1 AND membership.status='ACTIVE' AND membership.professional_role IS NULL LIMIT 1),
       opportunity."referral_link_id",opportunity."referred_at",opportunity."commercial_approval_status",opportunity."financial_approval_status",opportunity."stage",opportunity."source",opportunity."event_date",opportunity."city",opportunity."state",opportunity."venue",opportunity."event_type",opportunity."estimated_audience",opportunity."budget",opportunity."proposed_value",opportunity."notes",opportunity."next_action",opportunity."next_action_at",opportunity."lost_reason",opportunity."created_at",opportunity."updated_at"
FROM `opportunities` opportunity;--> statement-breakpoint
DROP TABLE `opportunities`;--> statement-breakpoint
ALTER TABLE `__new_opportunities` RENAME TO `opportunities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_opportunities_id_organization` ON `opportunities` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_created` ON `opportunities` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_assignee_stage` ON `opportunities` (`organization_id`,`assigned_user_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_validator_approval` ON `opportunities` (`organization_id`,`commercial_validator_user_id`,`commercial_approval_status`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_stage_updated` ON `opportunities` (`organization_id`,`stage`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_next_action` ON `opportunities` (`organization_id`,`next_action_at`,`stage`);
--> statement-breakpoint
CREATE TRIGGER trg_opportunity_stage_insert BEFORE INSERT ON opportunities WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG','INTERNAL') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END;--> statement-breakpoint
CREATE TRIGGER trg_opportunity_stage_update BEFORE UPDATE OF stage,source ON opportunities WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG','INTERNAL') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END;--> statement-breakpoint
PRAGMA optimize;
