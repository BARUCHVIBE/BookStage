export const guardedOpportunityInsertSql = `INSERT INTO opportunities (id,organization_id,artist_id,customer_id,assigned_user_id,originator_user_id,commercial_validator_user_id,stage,source,event_date,city,state,venue,event_type,estimated_audience,budget,notes)
SELECT ?,request.organization_id,request.artist_id,?,?,?,?,'NEW','PUBLIC_CATALOG',request.event_date,request.city,request.state,request.venue,request.event_type,request.estimated_audience,request.budget,request.notes
FROM commercial_requests request
WHERE request.id=? AND request.organization_id=? AND request.status='ACCEPTED' AND request.opportunity_id IS NULL`;

export const guardedRequestConversionSql = `UPDATE commercial_requests SET status='CONVERTED',opportunity_id=?,updated_at=CURRENT_TIMESTAMP
WHERE id=? AND organization_id=? AND status='ACCEPTED' AND opportunity_id IS NULL
AND EXISTS (SELECT 1 FROM opportunities WHERE opportunities.id=? AND opportunities.organization_id=?)`;
