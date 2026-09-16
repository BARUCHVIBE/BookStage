PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_payment_total_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_payment_total_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_show_fee_payment_consistency`;
--> statement-breakpoint
CREATE TABLE `__new_payments` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `opportunity_id` text NOT NULL,
  `show_id` text,
  `description` text NOT NULL,
  `amount` integer NOT NULL,
  `due_date` text NOT NULL,
  `paid_at` text,
  `status` text DEFAULT 'PENDING' NOT NULL,
  `notes` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `fk_payment_opportunity_tenant` FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `fk_payment_show_tenant` FOREIGN KEY (`show_id`,`organization_id`) REFERENCES `shows`(`id`,`organization_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_payments` (`id`,`organization_id`,`opportunity_id`,`show_id`,`description`,`amount`,`due_date`,`paid_at`,`status`,`notes`,`created_at`,`updated_at`)
SELECT payment.id,payment.organization_id,show.opportunity_id,payment.show_id,payment.description,payment.amount,payment.due_date,payment.paid_at,payment.status,payment.notes,payment.created_at,payment.updated_at
FROM `payments` payment JOIN `shows` show ON show.id=payment.show_id AND show.organization_id=payment.organization_id;
--> statement-breakpoint
DROP TABLE `payments`;
--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_id_organization` ON `payments` (`id`,`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_payments_opportunity_due` ON `payments` (`organization_id`,`opportunity_id`,`due_date`);
--> statement-breakpoint
CREATE INDEX `idx_payments_show_status_due` ON `payments` (`organization_id`,`show_id`,`status`,`due_date`);
--> statement-breakpoint
CREATE INDEX `idx_payments_status_due` ON `payments` (`organization_id`,`status`,`due_date`);
--> statement-breakpoint
CREATE TABLE `payment_receipts` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL,
  `payment_id` text NOT NULL,
  `opportunity_id` text NOT NULL,
  `amount` integer NOT NULL,
  `received_at` text NOT NULL,
  `method` text NOT NULL,
  `notes` text,
  `idempotency_key` text NOT NULL,
  `created_by` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT `fk_receipt_payment_tenant` FOREIGN KEY (`payment_id`,`organization_id`) REFERENCES `payments`(`id`,`organization_id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `fk_receipt_opportunity_tenant` FOREIGN KEY (`opportunity_id`,`organization_id`) REFERENCES `opportunities`(`id`,`organization_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_receipt_id_org` ON `payment_receipts` (`id`,`organization_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_receipt_idempotency` ON `payment_receipts` (`organization_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_receipts_opportunity_date` ON `payment_receipts` (`organization_id`,`opportunity_id`,`received_at`);
--> statement-breakpoint
INSERT INTO `payment_receipts` (`id`,`organization_id`,`payment_id`,`opportunity_id`,`amount`,`received_at`,`method`,`notes`,`idempotency_key`,`created_by`,`created_at`)
SELECT lower(hex(randomblob(16))),organization_id,id,opportunity_id,amount,COALESCE(paid_at,updated_at),'LEGACY','Recebimento preservado pela migração','legacy:' || id,NULL,COALESCE(paid_at,updated_at)
FROM `payments` WHERE status='PAID';
--> statement-breakpoint
CREATE TRIGGER `trg_payment_total_insert` BEFORE INSERT ON `payments`
WHEN NEW.status<>'CANCELLED' AND COALESCE((SELECT SUM(amount) FROM payments WHERE organization_id=NEW.organization_id AND opportunity_id=NEW.opportunity_id AND status<>'CANCELLED'),0)+NEW.amount>COALESCE((SELECT proposed_value FROM opportunities WHERE id=NEW.opportunity_id AND organization_id=NEW.organization_id),0)
BEGIN SELECT RAISE(ABORT,'PAYMENT_TOTAL_EXCEEDED'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_payment_total_update` BEFORE UPDATE OF amount,status,opportunity_id,organization_id ON `payments`
WHEN NEW.status<>'CANCELLED' AND COALESCE((SELECT SUM(amount) FROM payments WHERE organization_id=NEW.organization_id AND opportunity_id=NEW.opportunity_id AND status<>'CANCELLED' AND id<>OLD.id),0)+NEW.amount>COALESCE((SELECT proposed_value FROM opportunities WHERE id=NEW.opportunity_id AND organization_id=NEW.organization_id),0)
BEGIN SELECT RAISE(ABORT,'PAYMENT_TOTAL_EXCEEDED'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_receipt_balance_insert` BEFORE INSERT ON `payment_receipts`
WHEN NEW.amount<=0 OR COALESCE((SELECT SUM(amount) FROM payment_receipts WHERE organization_id=NEW.organization_id AND payment_id=NEW.payment_id),0)+NEW.amount>COALESCE((SELECT amount FROM payments WHERE id=NEW.payment_id AND organization_id=NEW.organization_id),0)
BEGIN SELECT RAISE(ABORT,'PAYMENT_RECEIPT_TOTAL_EXCEEDED'); END;
--> statement-breakpoint
CREATE TRIGGER `trg_receipt_payment_status` AFTER INSERT ON `payment_receipts`
BEGIN
  UPDATE payments SET status=CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payment_receipts WHERE organization_id=NEW.organization_id AND payment_id=NEW.payment_id)>=amount THEN 'PAID' WHEN due_date<date('now') THEN 'OVERDUE' ELSE 'PENDING' END,paid_at=CASE WHEN (SELECT COALESCE(SUM(amount),0) FROM payment_receipts WHERE organization_id=NEW.organization_id AND payment_id=NEW.payment_id)>=amount THEN NEW.received_at ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.payment_id AND organization_id=NEW.organization_id;
END;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
PRAGMA optimize;
