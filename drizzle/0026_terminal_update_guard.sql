DROP TRIGGER IF EXISTS `trg_opportunity_terminal_stage_update`;
--> statement-breakpoint
CREATE TRIGGER `trg_opportunity_terminal_stage_update`
BEFORE UPDATE OF stage ON `opportunities`
WHEN OLD.stage IN ('CLOSED_WON','CLOSED_LOST')
BEGIN
  SELECT RAISE(ABORT,'OPPORTUNITY_CLOSED');
END;
--> statement-breakpoint
PRAGMA optimize;
