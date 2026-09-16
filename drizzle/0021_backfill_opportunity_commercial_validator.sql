UPDATE opportunities
SET commercial_validator_user_id = (
  SELECT assignment.user_id
  FROM artist_sales_assignments assignment
  JOIN memberships membership
    ON membership.organization_id = assignment.organization_id
   AND membership.user_id = assignment.user_id
  WHERE assignment.organization_id = opportunities.organization_id
    AND assignment.artist_id = opportunities.artist_id
    AND assignment.is_primary = 1
    AND membership.status = 'ACTIVE'
    AND membership.professional_role IS NULL
    AND membership.role IN ('OWNER', 'MANAGER', 'SALES')
  LIMIT 1
),
updated_at = CURRENT_TIMESTAMP
WHERE commercial_validator_user_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM artist_sales_assignments assignment
    JOIN memberships membership
      ON membership.organization_id = assignment.organization_id
     AND membership.user_id = assignment.user_id
    WHERE assignment.organization_id = opportunities.organization_id
      AND assignment.artist_id = opportunities.artist_id
      AND assignment.is_primary = 1
      AND membership.status = 'ACTIVE'
      AND membership.professional_role IS NULL
      AND membership.role IN ('OWNER', 'MANAGER', 'SALES')
  );
