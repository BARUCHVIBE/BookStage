UPDATE `commercial_referral_links` SET `status`='REVOKED',`revoked_at`=COALESCE(`revoked_at`,CURRENT_TIMESTAMP),`updated_at`=CURRENT_TIMESTAMP
WHERE `status`='ACTIVE' AND NOT EXISTS (
  SELECT 1 FROM `memberships` membership
  WHERE membership.`organization_id`=`commercial_referral_links`.`organization_id`
    AND membership.`user_id`=`commercial_referral_links`.`user_id`
    AND membership.`status`='ACTIVE'
    AND membership.`role`='SALES'
    AND membership.`professional_role`='BOOKING_AGENT'
);--> statement-breakpoint
UPDATE `commercial_referral_links` SET `status`='REVOKED',`revoked_at`=COALESCE(`revoked_at`,CURRENT_TIMESTAMP),`updated_at`=CURRENT_TIMESTAMP
WHERE `status`='ACTIVE' AND EXISTS (
  SELECT 1 FROM `commercial_referral_links` newer
  WHERE newer.`organization_id`=`commercial_referral_links`.`organization_id`
    AND newer.`artist_id`=`commercial_referral_links`.`artist_id`
    AND newer.`user_id`=`commercial_referral_links`.`user_id`
    AND newer.`status`='ACTIVE'
    AND (newer.`created_at`>`commercial_referral_links`.`created_at` OR (newer.`created_at`=`commercial_referral_links`.`created_at` AND newer.`id`>`commercial_referral_links`.`id`))
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_commercial_referral_links_one_active` ON `commercial_referral_links` (`organization_id`,`artist_id`,`user_id`) WHERE "commercial_referral_links"."status" = 'ACTIVE';
