import { env } from "cloudflare:workers";

let initialized: Promise<void> | null = null;

async function ensureColumn(
  db: D1Database,
  table: string,
  column: string,
  definition: string,
) {
  const columns = await db
    .prepare(`PRAGMA table_info(${table})`)
    .all<{ name: string }>();
  if (!columns.results.some((item) => item.name === column))
    await db
      .prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
      .run();
}

async function migrateCommissions(db: D1Database) {
  const columns = await db
    .prepare(`PRAGMA table_info(show_commissions)`)
    .all<{ name: string }>();
  if (columns.results.some((item) => item.name === "method")) return;
  await db.prepare(`DROP TRIGGER IF EXISTS trg_commission_amount_insert`).run();
  await db.prepare(`DROP TRIGGER IF EXISTS trg_commission_amount_update`).run();
  await db
    .prepare(`DROP TRIGGER IF EXISTS trg_show_fee_commission_consistency`)
    .run();
  await db
    .prepare(
      `CREATE TABLE show_commissions_next (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, show_id TEXT, opportunity_id TEXT, user_id TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'SALES' CHECK(type IN ('REFERRAL','SALES','CLOSING','PARTNER','OTHER')), method TEXT NOT NULL DEFAULT 'PERCENTAGE' CHECK(method IN ('PERCENTAGE','FIXED')), calculation_base TEXT NOT NULL DEFAULT 'GROSS_REVENUE' CHECK(calculation_base IN ('GROSS_REVENUE','NET_REVENUE','PROFIT','CUSTOM')), percentage INTEGER, base_amount INTEGER NOT NULL DEFAULT 0, amount INTEGER NOT NULL CHECK(amount>=0), status TEXT NOT NULL DEFAULT 'ESTIMATED' CHECK(status IN ('ESTIMATED','APPROVED','PAYABLE','PAID','CANCELLED')), source TEXT, notes TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), UNIQUE(organization_id,show_id,user_id,type), UNIQUE(organization_id,opportunity_id,user_id,type), CONSTRAINT fk_commission_show_tenant FOREIGN KEY(show_id,organization_id) REFERENCES shows(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_commission_opportunity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id), CONSTRAINT fk_commission_user_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id), CONSTRAINT fk_commission_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO show_commissions_next (id,organization_id,show_id,opportunity_id,user_id,type,method,calculation_base,percentage,base_amount,amount,status,source,created_at,updated_at) SELECT commission.id,commission.organization_id,commission.show_id,show.opportunity_id,commission.user_id,'SALES','PERCENTAGE','GROSS_REVENUE',commission.percentage,COALESCE(show.fee,0),commission.amount,CASE commission.status WHEN 'PAID' THEN 'PAID' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'ESTIMATED' END,'LEGACY',commission.created_at,commission.updated_at FROM show_commissions commission JOIN shows show ON show.id=commission.show_id AND show.organization_id=commission.organization_id`,
    )
    .run();
  await db.prepare(`DROP TABLE show_commissions`).run();
  await db
    .prepare(`ALTER TABLE show_commissions_next RENAME TO show_commissions`)
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_show_commissions_status ON show_commissions(organization_id,status)`,
    )
    .run();
}

export function ensureDatabase() {
  // Production databases are prepared by versioned D1 migrations during
  // deployment. Running DDL in request handlers is unsafe because multiple
  // Worker isolates can initialize concurrently and create the same objects.
  if (
    process.env.NODE_ENV === "production" ||
    (env as unknown as Record<string, unknown>)
      .BOOKSTAGE_SKIP_RUNTIME_BOOTSTRAP === "true"
  )
    return Promise.resolve();
  initialized ??= initialize();
  return initialized;
}

async function initialize() {
  const db = env.DB;
  const legacyRequests = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='booking_requests'`,
    )
    .first();
  const opportunityTable = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='opportunities'`,
    )
    .first();
  if (legacyRequests && !opportunityTable) {
    await db
      .prepare(
        `CREATE TABLE opportunities (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, artist_id TEXT NOT NULL, customer_id TEXT NOT NULL, assigned_user_id TEXT, stage TEXT NOT NULL DEFAULT 'NEW', source TEXT NOT NULL DEFAULT 'PUBLIC_CATALOG', event_date TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, venue TEXT, event_type TEXT NOT NULL, estimated_audience INTEGER, budget TEXT, proposed_value INTEGER, notes TEXT, next_action TEXT, next_action_at TEXT, lost_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_opportunity_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id), CONSTRAINT fk_opportunity_customer_tenant FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id), CONSTRAINT fk_opportunity_assignee_tenant FOREIGN KEY(organization_id,assigned_user_id) REFERENCES memberships(organization_id,user_id))`,
      )
      .run();
    await db
      .prepare(
        `INSERT INTO opportunities (id,organization_id,artist_id,customer_id,assigned_user_id,stage,source,event_date,city,state,venue,event_type,estimated_audience,budget,notes,created_at,updated_at) SELECT id,organization_id,artist_id,customer_id,assigned_to,status,source,event_date,city,state,venue,event_type,estimated_audience,budget,notes,created_at,updated_at FROM booking_requests`,
      )
      .run();
  }
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL, logo TEXT, email TEXT NOT NULL, phone TEXT, document TEXT, website TEXT, instagram TEXT, description TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS memberships (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('OWNER','MANAGER','SALES','PRODUCTION','FINANCE')), professional_role TEXT CHECK(professional_role IS NULL OR professional_role='BOOKING_AGENT'), department TEXT NOT NULL DEFAULT 'COMMERCIAL' CHECK(department IN ('MANAGEMENT','COMMERCIAL','PRODUCTION','FINANCE')), artist_access_scope TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(artist_access_scope IN ('ALL','ASSIGNED')), status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','INVITED')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON memberships(user_id,status)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_memberships_organization_status ON memberships(organization_id,status)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS auth_credentials (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS auth_login_attempts (id TEXT PRIMARY KEY NOT NULL, fingerprint_hash TEXT NOT NULL, email_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_auth_attempts_fingerprint_created ON auth_login_attempts(fingerprint_hash,created_at)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_auth_attempts_email_created ON auth_login_attempts(email_hash,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, slug TEXT, photo_url TEXT, cover_url TEXT, genre TEXT, description TEXT, base_city TEXT, show_formats TEXT, video_urls TEXT, instagram TEXT, spotify TEXT, youtube TEXT, public_materials TEXT, is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)), status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_artists_organization_name ON artists(organization_id,name)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS artist_sales_assignments (organization_id TEXT NOT NULL, artist_id TEXT NOT NULL, user_id TEXT NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(artist_id,user_id), CONSTRAINT fk_artist_sales_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_artist_sales_membership_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_sales_one_primary ON artist_sales_assignments(artist_id) WHERE is_primary=1`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_artist_sales_organization_user ON artist_sales_assignments(organization_id,user_id)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS booking_collaborator_artist_access (organization_id TEXT NOT NULL, artist_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(artist_id,user_id), CONSTRAINT fk_booking_access_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_booking_access_member_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE, CONSTRAINT fk_booking_access_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_booking_access_member_status ON booking_collaborator_artist_access(organization_id,user_id,status)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_booking_access_artist_status ON booking_collaborator_artist_access(organization_id,artist_id,status)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS calendar_entries (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, artist_id TEXT NOT NULL, start_datetime TEXT NOT NULL, end_datetime TEXT, status TEXT NOT NULL CHECK(status IN ('AVAILABLE','INQUIRY','OPTION','CONFIRMED','BLOCKED')), title TEXT NOT NULL, internal_notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_calendar_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_calendar_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_calendar_organization_start ON calendar_entries(organization_id,start_datetime)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_calendar_organization_artist_start ON calendar_entries(organization_id,artist_id,start_datetime)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_calendar_organization_status_start ON calendar_entries(organization_id,status,start_datetime)`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_calendar_blocking_insert BEFORE INSERT ON calendar_entries WHEN NEW.status IN ('CONFIRMED','BLOCKED') AND EXISTS (SELECT 1 FROM calendar_entries existing WHERE existing.organization_id=NEW.organization_id AND existing.artist_id=NEW.artist_id AND existing.status IN ('CONFIRMED','BLOCKED') AND existing.start_datetime<=COALESCE(NEW.end_datetime,NEW.start_datetime) AND COALESCE(existing.end_datetime,existing.start_datetime)>=NEW.start_datetime) BEGIN SELECT RAISE(ABORT,'CALENDAR_CONFLICT'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_calendar_blocking_update BEFORE UPDATE ON calendar_entries WHEN NEW.status IN ('CONFIRMED','BLOCKED') AND EXISTS (SELECT 1 FROM calendar_entries existing WHERE existing.id<>NEW.id AND existing.organization_id=NEW.organization_id AND existing.artist_id=NEW.artist_id AND existing.status IN ('CONFIRMED','BLOCKED') AND existing.start_datetime<=COALESCE(NEW.end_datetime,NEW.start_datetime) AND COALESCE(existing.end_datetime,existing.start_datetime)>=NEW.start_datetime) BEGIN SELECT RAISE(ABORT,'CALENDAR_CONFLICT'); END`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name TEXT NOT NULL, company_name TEXT, email TEXT NOT NULL, normalized_email TEXT NOT NULL, phone TEXT NOT NULL, normalized_phone TEXT NOT NULL, document TEXT, city TEXT, state TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id))`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_organization_email ON customers(organization_id,normalized_email)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_organization_phone ON customers(organization_id,normalized_phone)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS opportunities (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, artist_id TEXT NOT NULL, customer_id TEXT NOT NULL, assigned_user_id TEXT, stage TEXT NOT NULL DEFAULT 'NEW', source TEXT NOT NULL DEFAULT 'PUBLIC_CATALOG', event_date TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, venue TEXT, event_type TEXT NOT NULL, estimated_audience INTEGER, budget TEXT, proposed_value INTEGER, notes TEXT, next_action TEXT, next_action_at TEXT, lost_reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_opportunity_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id), CONSTRAINT fk_opportunity_customer_tenant FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id), CONSTRAINT fk_opportunity_assignee_tenant FOREIGN KEY(organization_id,assigned_user_id) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunities_organization_created ON opportunities(organization_id,created_at)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunities_organization_assignee_stage ON opportunities(organization_id,assigned_user_id,stage)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunities_organization_stage_updated ON opportunities(organization_id,stage,updated_at)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunities_organization_next_action ON opportunities(organization_id,next_action_at,stage)`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_calendar_status_insert BEFORE INSERT ON calendar_entries WHEN NEW.status NOT IN ('AVAILABLE','INQUIRY','OPTION','CONFIRMED','BLOCKED') BEGIN SELECT RAISE(ABORT,'INVALID_CALENDAR_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_calendar_status_update BEFORE UPDATE OF status ON calendar_entries WHEN NEW.status NOT IN ('AVAILABLE','INQUIRY','OPTION','CONFIRMED','BLOCKED') BEGIN SELECT RAISE(ABORT,'INVALID_CALENDAR_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_opportunity_stage_insert BEFORE INSERT ON opportunities WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_opportunity_stage_update BEFORE UPDATE OF stage,source ON opportunities WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS opportunity_activities (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, from_value TEXT, to_value TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_opportunity_activity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_opportunity_activity_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_activities_timeline ON opportunity_activities(organization_id,opportunity_id,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS opportunity_calendar_entries (organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, calendar_entry_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(organization_id,opportunity_id), CONSTRAINT fk_opportunity_calendar_opportunity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_opportunity_calendar_entry_tenant FOREIGN KEY(calendar_entry_id,organization_id) REFERENCES calendar_entries(id,organization_id) ON DELETE CASCADE)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_calendar_entry ON opportunity_calendar_entries(organization_id,calendar_entry_id)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shows (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, artist_id TEXT NOT NULL, customer_id TEXT NOT NULL, calendar_entry_id TEXT NOT NULL, event_name TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '', show_time TEXT, venue TEXT, city TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT '', address TEXT, fee INTEGER, status TEXT NOT NULL DEFAULT 'CONFIRMED', local_contact_name TEXT, local_contact_phone TEXT, producer_user_id TEXT, soundcheck_at TEXT, hotel TEXT, transportation TEXT, airport TEXT, dressing_room TEXT, technical_info TEXT, production_notes TEXT, rider_file_key TEXT, rider_file_name TEXT, rider_file_type TEXT, rider_file_size INTEGER, stage_map_file_key TEXT, stage_map_file_name TEXT, stage_map_file_type TEXT, stage_map_file_size INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_show_opportunity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id), CONSTRAINT fk_show_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id), CONSTRAINT fk_show_customer_tenant FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id), CONSTRAINT fk_show_calendar_entry_tenant FOREIGN KEY(calendar_entry_id,organization_id) REFERENCES calendar_entries(id,organization_id), CONSTRAINT fk_show_producer_tenant FOREIGN KEY(organization_id,producer_user_id) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_shows_opportunity_tenant ON shows(organization_id,opportunity_id)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS show_activities (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, show_id TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, from_value TEXT, to_value TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_show_activity_tenant FOREIGN KEY(show_id,organization_id) REFERENCES shows(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_show_activity_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_show_activities_timeline ON show_activities(organization_id,show_id,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, show_id TEXT NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), due_date TEXT NOT NULL, paid_at TEXT, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','OVERDUE','CANCELLED')), notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CHECK((status='PAID' AND paid_at IS NOT NULL) OR (status<>'PAID' AND paid_at IS NULL)), CONSTRAINT fk_payment_show_tenant FOREIGN KEY(show_id,organization_id) REFERENCES shows(id,organization_id) ON DELETE CASCADE)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_payments_show_status_due ON payments(organization_id,show_id,status,due_date)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_payments_status_due ON payments(organization_id,status,due_date)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS show_commissions (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, show_id TEXT NOT NULL, user_id TEXT NOT NULL, percentage INTEGER NOT NULL CHECK(percentage>0 AND percentage<=10000), amount INTEGER NOT NULL CHECK(amount>=0), status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','CANCELLED')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), UNIQUE(organization_id,show_id,user_id), CONSTRAINT fk_commission_show_tenant FOREIGN KEY(show_id,organization_id) REFERENCES shows(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_commission_user_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_show_commissions_status ON show_commissions(organization_id,status)`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_commission_amount_insert BEFORE INSERT ON show_commissions WHEN NEW.amount<>ROUND(COALESCE((SELECT fee FROM shows WHERE id=NEW.show_id AND organization_id=NEW.organization_id),0)*NEW.percentage/10000.0) BEGIN SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_commission_amount_update BEFORE UPDATE OF percentage,amount,show_id,organization_id ON show_commissions WHEN NEW.amount<>ROUND(COALESCE((SELECT fee FROM shows WHERE id=NEW.show_id AND organization_id=NEW.organization_id),0)*NEW.percentage/10000.0) BEGIN SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_show_fee_commission_consistency BEFORE UPDATE OF fee ON shows WHEN EXISTS (SELECT 1 FROM show_commissions commission WHERE commission.show_id=NEW.id AND commission.organization_id=NEW.organization_id AND commission.status<>'CANCELLED' AND commission.amount<>ROUND(COALESCE(NEW.fee,0)*commission.percentage/10000.0)) BEGIN SELECT RAISE(ABORT,'COMMISSION_AMOUNT_MISMATCH'); END`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS proposal_sequences (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, year INTEGER NOT NULL, next_number INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(organization_id,year))`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, artist_id TEXT NOT NULL, customer_id TEXT NOT NULL, proposal_number TEXT NOT NULL, value INTEGER NOT NULL, payment_terms TEXT NOT NULL, transportation_terms TEXT, accommodation_terms TEXT, technical_terms TEXT, additional_terms TEXT, validity_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_proposal_opportunity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_proposal_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id), CONSTRAINT fk_proposal_customer_tenant FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id), CONSTRAINT fk_proposal_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_number_tenant ON proposals(organization_id,proposal_number)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_proposals_opportunity_created ON proposals(organization_id,opportunity_id,created_at)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_proposals_status_validity ON proposals(organization_id,status,validity_date)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS contract_sequences (organization_id TEXT NOT NULL, year INTEGER NOT NULL, next_number INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(organization_id,year), FOREIGN KEY(organization_id) REFERENCES organizations(id) ON DELETE CASCADE)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS contract_templates (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, template_key TEXT NOT NULL, name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'ACTIVE', is_default INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), UNIQUE(organization_id,template_key,version), CONSTRAINT fk_contract_template_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_templates_one_default ON contract_templates(organization_id) WHERE is_default=1 AND status='ACTIVE'`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_contract_templates_organization_status ON contract_templates(organization_id,status,updated_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, show_id TEXT, customer_id TEXT NOT NULL, artist_id TEXT NOT NULL, contract_number TEXT NOT NULL, template_id TEXT, template_body_snapshot TEXT, field_values TEXT NOT NULL DEFAULT '{}', generated_at TEXT, status TEXT NOT NULL DEFAULT 'DRAFT', file_key TEXT, file_name TEXT, file_type TEXT, file_size INTEGER, file_uploaded_at TEXT, sent_at TEXT, signed_at TEXT, notes TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_contract_template_tenant FOREIGN KEY(template_id,organization_id) REFERENCES contract_templates(id,organization_id), CONSTRAINT fk_contract_opportunity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_contract_show_tenant FOREIGN KEY(show_id,organization_id) REFERENCES shows(id,organization_id), CONSTRAINT fk_contract_customer_tenant FOREIGN KEY(customer_id,organization_id) REFERENCES customers(id,organization_id), CONSTRAINT fk_contract_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id), CONSTRAINT fk_contract_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_number_tenant ON contracts(organization_id,contract_number)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_contracts_opportunity_created ON contracts(organization_id,opportunity_id,created_at)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_contracts_show ON contracts(organization_id,show_id)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_contracts_status_updated ON contracts(organization_id,status,updated_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS contract_activities (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, contract_id TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, from_value TEXT, to_value TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_contract_activity_tenant FOREIGN KEY(contract_id,organization_id) REFERENCES contracts(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_contract_activity_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_contract_activities_timeline ON contract_activities(organization_id,contract_id,created_at)`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_proposal_status_insert BEFORE INSERT ON proposals WHEN NEW.status NOT IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED') BEGIN SELECT RAISE(ABORT,'INVALID_PROPOSAL_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_proposal_status_update BEFORE UPDATE OF status ON proposals WHEN NEW.status NOT IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED') BEGIN SELECT RAISE(ABORT,'INVALID_PROPOSAL_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_contract_status_insert BEFORE INSERT ON contracts WHEN NEW.status NOT IN ('DRAFT','SENT','SIGNED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_contract_status_update BEFORE UPDATE OF status ON contracts WHEN NEW.status NOT IN ('DRAFT','SENT','SIGNED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_contract_template_status_insert BEFORE INSERT ON contract_templates WHEN NEW.status NOT IN ('ACTIVE','ARCHIVED') OR NEW.version<1 OR length(NEW.body)>50000 BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_contract_template_status_update BEFORE UPDATE OF status,version,body ON contract_templates WHEN NEW.status NOT IN ('ACTIVE','ARCHIVED') OR NEW.version<1 OR length(NEW.body)>50000 BEGIN SELECT RAISE(ABORT,'INVALID_CONTRACT_TEMPLATE'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_show_status_insert BEFORE INSERT ON shows WHEN NEW.status NOT IN ('CONFIRMED','IN_PREPARATION','COMPLETED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_SHOW_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TRIGGER IF NOT EXISTS trg_show_status_update BEFORE UPDATE OF status ON shows WHEN NEW.status NOT IN ('CONFIRMED','IN_PREPARATION','COMPLETED','CANCELLED') BEGIN SELECT RAISE(ABORT,'INVALID_SHOW_STATUS'); END`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS public_request_attempts (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, fingerprint_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_public_attempts_organization_hash_created ON public_request_attempts(organization_id,fingerprint_hash,created_at)`,
    ),
    db.prepare(`PRAGMA optimize`),
  ]);
  await ensureColumn(db, "organizations", "description", "TEXT");
  await ensureColumn(db, "memberships", "professional_role", "TEXT");
  await ensureColumn(
    db,
    "memberships",
    "department",
    "TEXT NOT NULL DEFAULT 'COMMERCIAL'",
  );
  await ensureColumn(
    db,
    "memberships",
    "artist_access_scope",
    "TEXT NOT NULL DEFAULT 'ASSIGNED'",
  );
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_memberships_organization_department ON memberships(organization_id,department,status)`,
    )
    .run();
  await db
    .prepare(
      `UPDATE memberships SET department=CASE role WHEN 'OWNER' THEN 'MANAGEMENT' WHEN 'MANAGER' THEN 'MANAGEMENT' WHEN 'PRODUCTION' THEN 'PRODUCTION' WHEN 'FINANCE' THEN 'FINANCE' ELSE 'COMMERCIAL' END WHERE department IS NULL OR department='' OR (department='COMMERCIAL' AND role IN ('OWNER','MANAGER','PRODUCTION','FINANCE'))`,
    )
    .run();
  await db
    .prepare(
      `UPDATE memberships SET artist_access_scope=CASE WHEN role IN ('OWNER','MANAGER','PRODUCTION','FINANCE') THEN 'ALL' ELSE 'ASSIGNED' END WHERE artist_access_scope IS NULL OR artist_access_scope=''`,
    )
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO booking_collaborator_artist_access (organization_id,artist_id,user_id,status,created_by,created_at,updated_at) SELECT assignment.organization_id,assignment.artist_id,assignment.user_id,'ACTIVE',COALESCE((SELECT owner.user_id FROM memberships owner WHERE owner.organization_id=assignment.organization_id AND owner.role='OWNER' AND owner.status='ACTIVE' LIMIT 1),assignment.user_id),assignment.created_at,assignment.updated_at FROM artist_sales_assignments assignment JOIN memberships membership ON membership.organization_id=assignment.organization_id AND membership.user_id=assignment.user_id WHERE membership.professional_role='BOOKING_AGENT'`,
    )
    .run();
  await db
    .prepare(
      `DELETE FROM artist_sales_assignments WHERE EXISTS (SELECT 1 FROM memberships membership WHERE membership.organization_id=artist_sales_assignments.organization_id AND membership.user_id=artist_sales_assignments.user_id AND membership.professional_role='BOOKING_AGENT')`,
    )
    .run();
  await ensureColumn(db, "artists", "slug", "TEXT");
  await ensureColumn(db, "artists", "photo_url", "TEXT");
  await ensureColumn(db, "artists", "cover_url", "TEXT");
  await ensureColumn(db, "artists", "genre", "TEXT");
  await ensureColumn(db, "artists", "description", "TEXT");
  await ensureColumn(db, "artists", "base_city", "TEXT");
  await ensureColumn(db, "artists", "show_formats", "TEXT");
  await ensureColumn(db, "artists", "video_urls", "TEXT");
  await ensureColumn(db, "artists", "instagram", "TEXT");
  await ensureColumn(db, "artists", "spotify", "TEXT");
  await ensureColumn(db, "artists", "youtube", "TEXT");
  await ensureColumn(db, "artists", "public_materials", "TEXT");
  await ensureColumn(
    db,
    "artists",
    "is_public",
    "INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1))",
  );
  await ensureColumn(db, "opportunities", "proposed_value", "INTEGER");
  await ensureColumn(db, "opportunities", "next_action", "TEXT");
  await ensureColumn(db, "opportunities", "next_action_at", "TEXT");
  await ensureColumn(db, "opportunities", "lost_reason", "TEXT");
  await ensureColumn(db, "opportunities", "originator_user_id", "TEXT");
  await ensureColumn(
    db,
    "opportunities",
    "commercial_validator_user_id",
    "TEXT",
  );
  await ensureColumn(db, "opportunities", "referral_link_id", "TEXT");
  await ensureColumn(db, "opportunities", "referred_at", "TEXT");
  await ensureColumn(
    db,
    "opportunities",
    "commercial_approval_status",
    "TEXT NOT NULL DEFAULT 'NOT_REQUESTED'",
  );
  await ensureColumn(
    db,
    "opportunities",
    "financial_approval_status",
    "TEXT NOT NULL DEFAULT 'NOT_REQUESTED'",
  );
  await db
    .prepare(
      `UPDATE opportunities SET commercial_validator_user_id=(SELECT assignment.user_id FROM artist_sales_assignments assignment JOIN memberships membership ON membership.organization_id=assignment.organization_id AND membership.user_id=assignment.user_id WHERE assignment.organization_id=opportunities.organization_id AND assignment.artist_id=opportunities.artist_id AND assignment.is_primary=1 AND membership.status='ACTIVE' AND membership.professional_role IS NULL LIMIT 1) WHERE commercial_validator_user_id IS NULL`,
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunities_organization_validator_approval ON opportunities(organization_id,commercial_validator_user_id,commercial_approval_status)`,
    )
    .run();
  await db.prepare(`DROP TRIGGER IF EXISTS trg_opportunity_stage_insert`).run();
  await db.prepare(`DROP TRIGGER IF EXISTS trg_opportunity_stage_update`).run();
  await db
    .prepare(
      `CREATE TRIGGER trg_opportunity_stage_insert BEFORE INSERT ON opportunities WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG','INTERNAL') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END`,
    )
    .run();
  await db
    .prepare(
      `CREATE TRIGGER trg_opportunity_stage_update BEFORE UPDATE OF stage,source ON opportunities WHEN NEW.stage NOT IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION','CONTRACT','CLOSED_WON','CLOSED_LOST') OR NEW.source NOT IN ('PUBLIC_CATALOG','INTERNAL') BEGIN SELECT RAISE(ABORT,'INVALID_OPPORTUNITY_STATUS'); END`,
    )
    .run();
  await ensureColumn(db, "calendar_entries", "option_expires_at", "TEXT");
  await ensureColumn(db, "contracts", "template_id", "TEXT");
  await ensureColumn(db, "contracts", "template_body_snapshot", "TEXT");
  await ensureColumn(
    db,
    "contracts",
    "field_values",
    "TEXT NOT NULL DEFAULT '{}'",
  );
  await ensureColumn(db, "contracts", "generated_at", "TEXT");
  await migrateCommissions(db);
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS membership_activities (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL, from_value TEXT, to_value TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_membership_activity_target_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE, CONSTRAINT fk_membership_activity_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_membership_activities_timeline ON membership_activities(organization_id,user_id,created_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS opportunity_approvals (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('COMMERCIAL','FINANCIAL')), status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')), requested_by TEXT NOT NULL, requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_by TEXT, reviewed_at TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_opportunity_approval_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_opportunity_approval_requester_tenant FOREIGN KEY(organization_id,requested_by) REFERENCES memberships(organization_id,user_id), CONSTRAINT fk_opportunity_approval_reviewer_tenant FOREIGN KEY(organization_id,reviewed_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_approvals_one_pending ON opportunity_approvals(organization_id,opportunity_id,kind) WHERE status='PENDING'`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_approvals_queue ON opportunity_approvals(organization_id,kind,status,requested_at)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS opportunity_financial_items (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('REVENUE','COST')), category TEXT NOT NULL, description TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 100 CHECK(quantity>0), unit_amount INTEGER NOT NULL CHECK(unit_amount>=0), total_amount INTEGER NOT NULL CHECK(total_amount>=0), notes TEXT, responsible_user_id TEXT, status TEXT NOT NULL DEFAULT 'ESTIMATED' CHECK(status IN ('ESTIMATED','CONFIRMED','CANCELLED')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), CONSTRAINT fk_opportunity_financial_item_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_opportunity_financial_responsible_tenant FOREIGN KEY(organization_id,responsible_user_id) REFERENCES memberships(organization_id,user_id), CONSTRAINT fk_opportunity_financial_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_financial_items_opportunity ON opportunity_financial_items(organization_id,opportunity_id,kind,status)`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS commercial_referral_links (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, artist_id TEXT NOT NULL, user_id TEXT NOT NULL, token_hash TEXT NOT NULL, token_prefix TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')), created_by TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,organization_id), UNIQUE(token_hash), CONSTRAINT fk_referral_link_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_referral_link_member_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id) ON DELETE CASCADE, CONSTRAINT fk_referral_link_creator_tenant FOREIGN KEY(organization_id,created_by) REFERENCES memberships(organization_id,user_id))`,
    ),
    db.prepare(
      `UPDATE commercial_referral_links SET status='REVOKED',revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM memberships membership WHERE membership.organization_id=commercial_referral_links.organization_id AND membership.user_id=commercial_referral_links.user_id AND membership.status='ACTIVE' AND membership.role='SALES' AND membership.professional_role='BOOKING_AGENT')`,
    ),
    db.prepare(
      `UPDATE commercial_referral_links SET status='REVOKED',revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE status='ACTIVE' AND EXISTS (SELECT 1 FROM commercial_referral_links newer WHERE newer.organization_id=commercial_referral_links.organization_id AND newer.artist_id=commercial_referral_links.artist_id AND newer.user_id=commercial_referral_links.user_id AND newer.status='ACTIVE' AND (newer.created_at>commercial_referral_links.created_at OR (newer.created_at=commercial_referral_links.created_at AND newer.id>commercial_referral_links.id)))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_commercial_referral_links_member ON commercial_referral_links(organization_id,user_id,status)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_commercial_referral_links_artist ON commercial_referral_links(organization_id,artist_id,status)`,
    ),
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_referral_links_one_active ON commercial_referral_links(organization_id,artist_id,user_id) WHERE status='ACTIVE'`,
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS referral_events (id TEXT PRIMARY KEY NOT NULL, organization_id TEXT NOT NULL, referral_link_id TEXT NOT NULL, artist_id TEXT NOT NULL, user_id TEXT NOT NULL, opportunity_id TEXT, type TEXT NOT NULL, session_hash TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_referral_event_link_tenant FOREIGN KEY(referral_link_id,organization_id) REFERENCES commercial_referral_links(id,organization_id) ON DELETE CASCADE, CONSTRAINT fk_referral_event_artist_tenant FOREIGN KEY(artist_id,organization_id) REFERENCES artists(id,organization_id), CONSTRAINT fk_referral_event_member_tenant FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id), CONSTRAINT fk_referral_event_opportunity_tenant FOREIGN KEY(opportunity_id,organization_id) REFERENCES opportunities(id,organization_id))`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_referral_events_link_type_created ON referral_events(organization_id,referral_link_id,type,created_at)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_referral_events_session_type_created ON referral_events(referral_link_id,session_hash,type,created_at)`,
    ),
  ]);
  await ensureColumn(db, "shows", "event_name", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "shows", "date", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "shows", "show_time", "TEXT");
  await ensureColumn(db, "shows", "venue", "TEXT");
  await ensureColumn(db, "shows", "city", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "shows", "state", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "shows", "address", "TEXT");
  await ensureColumn(db, "shows", "fee", "INTEGER");
  await ensureColumn(db, "shows", "local_contact_name", "TEXT");
  await ensureColumn(db, "shows", "local_contact_phone", "TEXT");
  await ensureColumn(db, "shows", "producer_user_id", "TEXT");
  await ensureColumn(db, "shows", "soundcheck_at", "TEXT");
  await ensureColumn(db, "shows", "hotel", "TEXT");
  await ensureColumn(db, "shows", "transportation", "TEXT");
  await ensureColumn(db, "shows", "airport", "TEXT");
  await ensureColumn(db, "shows", "dressing_room", "TEXT");
  await ensureColumn(db, "shows", "technical_info", "TEXT");
  await ensureColumn(db, "shows", "production_notes", "TEXT");
  await ensureColumn(db, "shows", "rider_file_key", "TEXT");
  await ensureColumn(db, "shows", "rider_file_name", "TEXT");
  await ensureColumn(db, "shows", "rider_file_type", "TEXT");
  await ensureColumn(db, "shows", "rider_file_size", "INTEGER");
  await ensureColumn(db, "shows", "stage_map_file_key", "TEXT");
  await ensureColumn(db, "shows", "stage_map_file_name", "TEXT");
  await ensureColumn(db, "shows", "stage_map_file_type", "TEXT");
  await ensureColumn(db, "shows", "stage_map_file_size", "INTEGER");
  await db
    .prepare(
      `UPDATE shows SET status='IN_PREPARATION' WHERE status='PREPARING'`,
    )
    .run();
  await db
    .prepare(
      `UPDATE shows SET status='IN_PREPARATION',updated_at=CURRENT_TIMESTAMP WHERE status='COMPLETED' AND date>date('now')`,
    )
    .run();
  await db
    .prepare(
      `UPDATE shows SET event_name=COALESCE(NULLIF(event_name,''),(SELECT artist.name || ' · ' || opportunity.event_type FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id WHERE opportunity.id=shows.opportunity_id AND opportunity.organization_id=shows.organization_id)),date=COALESCE(NULLIF(date,''),(SELECT event_date FROM opportunities WHERE id=shows.opportunity_id AND organization_id=shows.organization_id)),venue=COALESCE(venue,(SELECT venue FROM opportunities WHERE id=shows.opportunity_id AND organization_id=shows.organization_id)),city=COALESCE(NULLIF(city,''),(SELECT city FROM opportunities WHERE id=shows.opportunity_id AND organization_id=shows.organization_id)),state=COALESCE(NULLIF(state,''),(SELECT state FROM opportunities WHERE id=shows.opportunity_id AND organization_id=shows.organization_id)),fee=COALESCE(fee,(SELECT proposed_value FROM opportunities WHERE id=shows.opportunity_id AND organization_id=shows.organization_id)) WHERE event_name='' OR date='' OR city='' OR state='' OR fee IS NULL`,
    )
    .run();
  await db.batch([
    db.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_organization_slug ON artists(organization_id,slug) WHERE slug IS NOT NULL`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_artists_organization_public ON artists(organization_id,is_public,status)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_shows_organization_date ON shows(organization_id,date)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_shows_organization_status_date ON shows(organization_id,status,date)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_shows_producer_date ON shows(organization_id,producer_user_id,date)`,
    ),
    db.prepare(`PRAGMA optimize`),
  ]);
  await db
    .prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_at) SELECT lower(hex(randomblob(16))),opportunity.organization_id,opportunity.id,'CREATED','Oportunidade migrada da caixa de solicitações.',opportunity.source,opportunity.created_at FROM opportunities opportunity WHERE NOT EXISTS (SELECT 1 FROM opportunity_activities activity WHERE activity.organization_id=opportunity.organization_id AND activity.opportunity_id=opportunity.id)`,
    )
    .run();
}
