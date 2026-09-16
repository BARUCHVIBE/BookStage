CREATE TRIGGER IF NOT EXISTS `trg_opportunity_terminal_stage_update`
BEFORE UPDATE OF stage ON `opportunities`
WHEN OLD.stage IN ('CLOSED_WON','CLOSED_LOST') AND NEW.stage<>OLD.stage
BEGIN
  SELECT RAISE(ABORT,'OPPORTUNITY_CLOSED');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_opportunity_calendar_link_open`
BEFORE INSERT ON `opportunity_calendar_entries`
WHEN EXISTS (
  SELECT 1 FROM opportunities opportunity
  WHERE opportunity.id=NEW.opportunity_id
    AND opportunity.organization_id=NEW.organization_id
    AND opportunity.stage IN ('CLOSED_WON','CLOSED_LOST')
)
BEGIN
  SELECT RAISE(ABORT,'OPPORTUNITY_CLOSED');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_opportunity_calendar_activity_open`
BEFORE INSERT ON `opportunity_activities`
WHEN NEW.type IN ('CALENDAR_INQUIRY','CALENDAR_OPTION','CALENDAR_OPTION_CANCELLED','CALENDAR_CONFIRMED')
  AND EXISTS (
    SELECT 1 FROM opportunities opportunity
    WHERE opportunity.id=NEW.opportunity_id
      AND opportunity.organization_id=NEW.organization_id
      AND opportunity.stage IN ('CLOSED_WON','CLOSED_LOST')
  )
BEGIN
  SELECT RAISE(ABORT,'OPPORTUNITY_CLOSED');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_payment_total_insert`
BEFORE INSERT ON `payments`
WHEN NEW.status<>'CANCELLED' AND (
  COALESCE((
    SELECT SUM(payment.amount) FROM payments payment
    WHERE payment.organization_id=NEW.organization_id
      AND payment.show_id=NEW.show_id
      AND payment.status<>'CANCELLED'
  ),0) + NEW.amount
) > COALESCE((
  SELECT show.fee FROM shows show
  WHERE show.id=NEW.show_id AND show.organization_id=NEW.organization_id
),0)
BEGIN
  SELECT RAISE(ABORT,'PAYMENT_TOTAL_EXCEEDED');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_payment_total_update`
BEFORE UPDATE OF amount,status,show_id,organization_id ON `payments`
WHEN NEW.status<>'CANCELLED' AND (
  COALESCE((
    SELECT SUM(payment.amount) FROM payments payment
    WHERE payment.organization_id=NEW.organization_id
      AND payment.show_id=NEW.show_id
      AND payment.status<>'CANCELLED'
      AND payment.id<>OLD.id
  ),0) + NEW.amount
) > COALESCE((
  SELECT show.fee FROM shows show
  WHERE show.id=NEW.show_id AND show.organization_id=NEW.organization_id
),0)
BEGIN
  SELECT RAISE(ABORT,'PAYMENT_TOTAL_EXCEEDED');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_show_fee_payment_consistency`
BEFORE UPDATE OF fee ON `shows`
WHEN COALESCE((
  SELECT SUM(payment.amount) FROM payments payment
  WHERE payment.organization_id=NEW.organization_id
    AND payment.show_id=NEW.id
    AND payment.status<>'CANCELLED'
),0) > COALESCE(NEW.fee,0)
BEGIN
  SELECT RAISE(ABORT,'PAYMENT_TOTAL_EXCEEDED');
END;
--> statement-breakpoint
PRAGMA optimize;
