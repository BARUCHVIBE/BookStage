-- These triggers belonged to the original Show-only commission model. The
-- current model also supports Opportunity commissions, fixed values and custom
-- bases, so forcing every amount to derive from shows.fee is no longer valid.
DROP TRIGGER IF EXISTS `trg_commission_amount_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_commission_amount_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `trg_show_fee_commission_consistency`;
