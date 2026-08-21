CREATE TABLE `auth_login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint_hash` text NOT NULL,
	`email_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_attempts_fingerprint_created` ON `auth_login_attempts` (`fingerprint_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_attempts_email_created` ON `auth_login_attempts` (`email_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_opportunities_organization_next_action` ON `opportunities` (`organization_id`,`next_action_at`,`stage`);
--> statement-breakpoint
CREATE TRIGGER `trg_calendar_status_insert` BEFORE INSERT ON `calendar_entries` WHEN NEW.status NOT IN ('AVAILABLE','INQUIRY','OPTION','CONFIRMED','BLOCKED') BEGIN SELECT RAISE(ABORT,'INVALID_CALENDAR_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_calendar_status_update` BEFORE UPDATE OF status ON `calendar_entries` WHEN NEW.status NOT IN ('AVAILABLE','INQUIRY','OPTION','CONFIRMED','BLOCKED') BEGIN SELECT RAISE(ABORT,'INVALID_CALENDAR_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_opportunity_stage_insert` BEFORE INSERT ON `opportunities` WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_opportunity_stage_update` BEFORE UPDATE OF stage,source ON `opportunities` WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_proposal_status_insert` BEFORE INSERT ON `proposals` WHEN NEW.status NOT IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED') BEGIN SELECT RAISE(ABORT,'INVALID_PROPOSAL_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_proposal_status_update` BEFORE UPDATE OF status ON `proposals` WHEN NEW.status NOT IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED') BEGIN SELECT RAISE(ABORT,'INVALID_PROPOSAL_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_contract_status_insert` BEFORE INSERT ON `contracts` WHEN NEW.status NOT IN ('DRAFT','SENT','SIGNED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_contract_status_update` BEFORE UPDATE OF status ON `contracts` WHEN NEW.status NOT IN ('DRAFT','SENT','SIGNED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_show_status_insert` BEFORE INSERT ON `shows` WHEN NEW.status NOT IN ('CONFIRMED','IN_PREPARATION','COMPLETED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_SHOW_STATUS'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_show_status_update` BEFORE UPDATE OF status ON `shows` WHEN NEW.status NOT IN ('CONFIRMED','IN_PREPARATION','COMPLETED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_SHOW_STATUS'); END;
--> statement-breakpoint
UPDATE `shows` SET `status`='IN_PREPARATION',`updated_at`=CURRENT_TIMESTAMP WHERE `status`='COMPLETED' AND `date`>date('now');
