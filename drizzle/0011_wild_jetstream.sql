CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`show_id` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`due_date` text NOT NULL,
	`paid_at` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_id_organization` ON `payments` (`id`,`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_show_status_due` ON `payments` (`organization_id`,`show_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_payments_status_due` ON `payments` (`organization_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `show_commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`show_id` text NOT NULL,
	`user_id` text NOT NULL,
	`percentage` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`,`user_id`) REFERENCES `memberships`(`organization_id`,`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_show_commissions_id_organization` ON `show_commissions` (`id`,`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_show_commissions_user_tenant` ON `show_commissions` (`organization_id`,`show_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_show_commissions_status` ON `show_commissions` (`organization_id`,`status`);--> statement-breakpoint
CREATE TRIGGER `trg_commission_amount_insert` BEFORE INSERT ON `show_commissions` WHEN NEW.amount<>ROUND(COALESCE((SELECT fee FROM shows WHERE id=NEW.show_id AND organization_id=NEW.organization_id),0)*NEW.percentage/10000.0) BEGIN SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `trg_commission_amount_update` BEFORE UPDATE OF percentage,amount,show_id,organization_id ON `show_commissions` WHEN NEW.amount<>ROUND(COALESCE((SELECT fee FROM shows WHERE id=NEW.show_id AND organization_id=NEW.organization_id),0)*NEW.percentage/10000.0) BEGIN SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `trg_show_fee_commission_consistency` BEFORE UPDATE OF fee ON `shows` WHEN EXISTS (SELECT 1 FROM show_commissions commission WHERE commission.show_id=NEW.id AND commission.organization_id=NEW.organization_id AND commission.status<>'CANCELLED' AND commission.amount<>ROUND(COALESCE(NEW.fee,0)*commission.percentage/10000.0)) BEGIN SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH'); END;--> statement-breakpoint
PRAGMA optimize;
