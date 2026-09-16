ALTER TABLE `contract_templates` ADD COLUMN `artist_id` text;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `category` text;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `description` text;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `template_type` text DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `file_key` text;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `file_name` text;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `file_type` text;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `file_size` integer;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `detected_fields` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `contract_templates` ADD COLUMN `field_mapping` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
DROP INDEX `idx_contract_templates_one_default`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_templates_one_default` ON `contract_templates` (`organization_id`,`artist_id`) WHERE `is_default` = 1 AND `status` = 'ACTIVE';--> statement-breakpoint
ALTER TABLE `contracts` ADD COLUMN `template_type` text DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD COLUMN `template_file_key_snapshot` text;--> statement-breakpoint
ALTER TABLE `contracts` ADD COLUMN `template_mapping_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD COLUMN `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `contracts` ADD COLUMN `generated_by` text;--> statement-breakpoint
CREATE TRIGGER `trg_contract_template_artist_insert` BEFORE INSERT ON `contract_templates` WHEN NEW.artist_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM artists WHERE id=NEW.artist_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE_ARTIST'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_template_artist_update` BEFORE UPDATE OF artist_id,organization_id ON `contract_templates` WHEN NEW.artist_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM artists WHERE id=NEW.artist_id AND organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE_ARTIST'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_template_type_insert` BEFORE INSERT ON `contract_templates` WHEN NEW.template_type NOT IN ('TEXT','PDF_ACROFORM','PDF_STATIC') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE_TYPE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_template_type_update` BEFORE UPDATE OF template_type ON `contract_templates` WHEN NEW.template_type NOT IN ('TEXT','PDF_ACROFORM','PDF_STATIC') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE_TYPE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_type_insert` BEFORE INSERT ON `contracts` WHEN NEW.template_type NOT IN ('TEXT','PDF_ACROFORM','PDF_STATIC') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TYPE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_type_update` BEFORE UPDATE OF template_type ON `contracts` WHEN NEW.template_type NOT IN ('TEXT','PDF_ACROFORM','PDF_STATIC') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TYPE'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_generator_insert` BEFORE INSERT ON `contracts` WHEN NEW.generated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.generated_by) BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_GENERATOR'); END;--> statement-breakpoint
CREATE TRIGGER `trg_contract_generator_update` BEFORE UPDATE OF generated_by,organization_id ON `contracts` WHEN NEW.generated_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.generated_by) BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_GENERATOR'); END;
