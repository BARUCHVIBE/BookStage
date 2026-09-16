CREATE TRIGGER IF NOT EXISTS `trg_commission_amount_insert`
BEFORE INSERT ON `show_commissions`
WHEN (
  NEW.method='PERCENTAGE'
  AND (
    NEW.percentage IS NULL
    OR NEW.percentage<=0
    OR NEW.percentage>10000
    OR NEW.base_amount<=0
    OR NEW.amount<>ROUND(NEW.base_amount*NEW.percentage/10000.0)
  )
) OR (
  NEW.method='FIXED'
  AND (
    NEW.percentage IS NOT NULL
    OR NEW.base_amount<>0
    OR NEW.amount<=0
  )
)
BEGIN
  SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `trg_commission_amount_update`
BEFORE UPDATE OF method,percentage,base_amount,amount ON `show_commissions`
WHEN (
  NEW.method='PERCENTAGE'
  AND (
    NEW.percentage IS NULL
    OR NEW.percentage<=0
    OR NEW.percentage>10000
    OR NEW.base_amount<=0
    OR NEW.amount<>ROUND(NEW.base_amount*NEW.percentage/10000.0)
  )
) OR (
  NEW.method='FIXED'
  AND (
    NEW.percentage IS NOT NULL
    OR NEW.base_amount<>0
    OR NEW.amount<=0
  )
)
BEGIN
  SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH');
END;
