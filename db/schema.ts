import { sql } from "drizzle-orm";
import { foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_users_email").on(table.email)]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  email: text("email").notNull(),
  phone: text("phone"),
  document: text("document"),
  website: text("website"),
  instagram: text("instagram"),
  description: text("description"),
  status: text("status", { enum: ["ACTIVE", "INACTIVE"] }).notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_organizations_slug").on(table.slug)]);

export const memberships = sqliteTable("memberships", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["OWNER", "MANAGER", "SALES", "PRODUCTION", "FINANCE"] }).notNull(),
  status: text("status", { enum: ["ACTIVE", "INACTIVE", "INVITED"] }).notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index("idx_memberships_user_status").on(table.userId, table.status),
  index("idx_memberships_organization_status").on(table.organizationId, table.status),
]);

export const artists = sqliteTable("artists", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug"),
  photoUrl: text("photo_url"),
  coverUrl: text("cover_url"),
  genre: text("genre"),
  description: text("description"),
  baseCity: text("base_city"),
  showFormats: text("show_formats"),
  videoUrls: text("video_urls"),
  instagram: text("instagram"),
  spotify: text("spotify"),
  youtube: text("youtube"),
  publicMaterials: text("public_materials"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["ACTIVE", "INACTIVE"] }).notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_artists_id_organization").on(table.id, table.organizationId),
  index("idx_artists_organization_name").on(table.organizationId, table.name),
  uniqueIndex("idx_artists_organization_slug").on(table.organizationId, table.slug).where(sql`${table.slug} IS NOT NULL`),
  index("idx_artists_organization_public").on(table.organizationId, table.isPublic, table.status),
]);

export const artistSalesAssignments = sqliteTable("artist_sales_assignments", {
  organizationId: text("organization_id").notNull(),
  artistId: text("artist_id").notNull(),
  userId: text("user_id").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.artistId, table.userId] }),
  foreignKey({ columns: [table.artistId, table.organizationId], foreignColumns: [artists.id, artists.organizationId], name: "fk_artist_sales_artist_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId, table.userId], foreignColumns: [memberships.organizationId, memberships.userId], name: "fk_artist_sales_membership_tenant" }).onDelete("cascade"),
  uniqueIndex("idx_artist_sales_one_primary").on(table.artistId).where(sql`${table.isPrimary} = 1`),
  index("idx_artist_sales_organization_user").on(table.organizationId, table.userId),
]);

export const calendarEntries = sqliteTable("calendar_entries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  artistId: text("artist_id").notNull(),
  startDatetime: text("start_datetime").notNull(),
  endDatetime: text("end_datetime"),
  status: text("status", { enum: ["AVAILABLE", "INQUIRY", "OPTION", "CONFIRMED", "BLOCKED"] }).notNull(),
  title: text("title").notNull(),
  internalNotes: text("internal_notes"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_calendar_entries_id_organization").on(table.id, table.organizationId),
  foreignKey({ columns: [table.artistId, table.organizationId], foreignColumns: [artists.id, artists.organizationId], name: "fk_calendar_artist_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId, table.createdBy], foreignColumns: [memberships.organizationId, memberships.userId], name: "fk_calendar_creator_tenant" }),
  index("idx_calendar_organization_start").on(table.organizationId, table.startDatetime),
  index("idx_calendar_organization_artist_start").on(table.organizationId, table.artistId, table.startDatetime),
  index("idx_calendar_organization_status_start").on(table.organizationId, table.status, table.startDatetime),
]);

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  companyName: text("company_name"),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  phone: text("phone").notNull(),
  normalizedPhone: text("normalized_phone").notNull(),
  document: text("document"),
  city: text("city"),
  state: text("state"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_customers_id_organization").on(table.id, table.organizationId),
  uniqueIndex("idx_customers_organization_email").on(table.organizationId, table.normalizedEmail),
  uniqueIndex("idx_customers_organization_phone").on(table.organizationId, table.normalizedPhone),
]);

export const opportunities = sqliteTable("opportunities", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  artistId: text("artist_id").notNull(),
  customerId: text("customer_id").notNull(),
  assignedUserId: text("assigned_user_id"),
  stage: text("stage", { enum: ["NEW","CONTACTED","QUALIFIED","PROPOSAL","NEGOTIATION","DATE_OPTION","CONTRACT","CLOSED_WON","CLOSED_LOST"] }).notNull().default("NEW"),
  source: text("source", { enum: ["PUBLIC_CATALOG"] }).notNull().default("PUBLIC_CATALOG"),
  eventDate: text("event_date").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  venue: text("venue"),
  eventType: text("event_type").notNull(),
  estimatedAudience: integer("estimated_audience"),
  budget: text("budget"),
  proposedValue: integer("proposed_value"),
  notes: text("notes"),
  nextAction: text("next_action"),
  nextActionAt: text("next_action_at"),
  lostReason: text("lost_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ columns: [table.artistId, table.organizationId], foreignColumns: [artists.id, artists.organizationId], name: "fk_booking_request_artist_tenant" }),
  foreignKey({ columns: [table.customerId, table.organizationId], foreignColumns: [customers.id, customers.organizationId], name: "fk_booking_request_customer_tenant" }),
  uniqueIndex("idx_opportunities_id_organization").on(table.id,table.organizationId),
  foreignKey({ columns: [table.organizationId, table.assignedUserId], foreignColumns: [memberships.organizationId, memberships.userId], name: "fk_opportunity_assignee_tenant" }),
  index("idx_opportunities_organization_created").on(table.organizationId, table.createdAt),
  index("idx_opportunities_organization_assignee_stage").on(table.organizationId, table.assignedUserId, table.stage),
  index("idx_opportunities_organization_stage_updated").on(table.organizationId, table.stage, table.updatedAt),
  index("idx_opportunities_organization_next_action").on(table.organizationId, table.nextActionAt, table.stage),
]);

export const opportunityActivities = sqliteTable("opportunity_activities", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  type: text("type", { enum: ["CREATED","STAGE_CHANGED","ASSIGNEE_CHANGED","VALUE_CHANGED","NOTE_UPDATED","CALENDAR_INQUIRY","CALENDAR_OPTION","CALENDAR_OPTION_CANCELLED","CALENDAR_CONFIRMED","SHOW_PREPARED","SHOW_STATUS_CHANGED","SHOW_PRODUCTION_UPDATED","PROPOSAL_CREATED","PROPOSAL_SENT","PROPOSAL_ACCEPTED","PROPOSAL_REJECTED","PROPOSAL_EXPIRED","CONTRACT_CREATED","CONTRACT_FILE_UPLOADED","CONTRACT_FILE_REPLACED","CONTRACT_SENT","CONTRACT_SIGNED","CONTRACT_CANCELLED","CLOSED_WON","CLOSED_LOST"] }).notNull(),
  description: text("description").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ columns: [table.opportunityId,table.organizationId], foreignColumns: [opportunities.id,opportunities.organizationId], name: "fk_opportunity_activity_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId,table.createdBy], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_opportunity_activity_creator_tenant" }),
  index("idx_opportunity_activities_timeline").on(table.organizationId,table.opportunityId,table.createdAt),
]);

export const opportunityCalendarEntries = sqliteTable("opportunity_calendar_entries", {
  organizationId: text("organization_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  calendarEntryId: text("calendar_entry_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.organizationId,table.opportunityId] }),
  uniqueIndex("idx_opportunity_calendar_entry").on(table.organizationId,table.calendarEntryId),
  foreignKey({ columns: [table.opportunityId,table.organizationId], foreignColumns: [opportunities.id,opportunities.organizationId], name: "fk_opportunity_calendar_opportunity_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.calendarEntryId,table.organizationId], foreignColumns: [calendarEntries.id,calendarEntries.organizationId], name: "fk_opportunity_calendar_entry_tenant" }).onDelete("cascade"),
]);

export const shows = sqliteTable("shows", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  artistId: text("artist_id").notNull(),
  customerId: text("customer_id").notNull(),
  calendarEntryId: text("calendar_entry_id").notNull(),
  eventName: text("event_name").notNull().default(""),
  date: text("date").notNull().default(""),
  showTime: text("show_time"),
  venue: text("venue"),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  address: text("address"),
  fee: integer("fee"),
  status: text("status", { enum: ["CONFIRMED","IN_PREPARATION","COMPLETED","CANCELLED"] }).notNull().default("CONFIRMED"),
  localContactName: text("local_contact_name"),
  localContactPhone: text("local_contact_phone"),
  producerUserId: text("producer_user_id"),
  soundcheckAt: text("soundcheck_at"),
  hotel: text("hotel"),
  transportation: text("transportation"),
  airport: text("airport"),
  dressingRoom: text("dressing_room"),
  technicalInfo: text("technical_info"),
  productionNotes: text("production_notes"),
  riderFileKey: text("rider_file_key"),
  riderFileName: text("rider_file_name"),
  riderFileType: text("rider_file_type"),
  riderFileSize: integer("rider_file_size"),
  stageMapFileKey: text("stage_map_file_key"),
  stageMapFileName: text("stage_map_file_name"),
  stageMapFileType: text("stage_map_file_type"),
  stageMapFileSize: integer("stage_map_file_size"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_shows_id_organization").on(table.id,table.organizationId),
  uniqueIndex("idx_shows_opportunity_tenant").on(table.organizationId,table.opportunityId),
  foreignKey({ columns: [table.opportunityId,table.organizationId], foreignColumns: [opportunities.id,opportunities.organizationId], name: "fk_show_opportunity_tenant" }),
  foreignKey({ columns: [table.artistId,table.organizationId], foreignColumns: [artists.id,artists.organizationId], name: "fk_show_artist_tenant" }),
  foreignKey({ columns: [table.customerId,table.organizationId], foreignColumns: [customers.id,customers.organizationId], name: "fk_show_customer_tenant" }),
  foreignKey({ columns: [table.calendarEntryId,table.organizationId], foreignColumns: [calendarEntries.id,calendarEntries.organizationId], name: "fk_show_calendar_entry_tenant" }),
  foreignKey({ columns: [table.organizationId,table.producerUserId], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_show_producer_tenant" }),
  index("idx_shows_organization_date").on(table.organizationId,table.date),
  index("idx_shows_organization_status_date").on(table.organizationId,table.status,table.date),
  index("idx_shows_producer_date").on(table.organizationId,table.producerUserId,table.date),
]);

export const showActivities = sqliteTable("show_activities", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  showId: text("show_id").notNull(),
  type: text("type", { enum: ["CREATED","STATUS_CHANGED","PRODUCTION_UPDATED","RIDER_UPLOADED","RIDER_REPLACED","STAGE_MAP_UPLOADED","STAGE_MAP_REPLACED","PAYMENT_CREATED","PAYMENT_UPDATED","PAYMENT_STATUS_CHANGED","COMMISSION_CREATED","COMMISSION_UPDATED","COMMISSION_STATUS_CHANGED"] }).notNull(),
  description: text("description").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ columns: [table.showId,table.organizationId], foreignColumns: [shows.id,shows.organizationId], name: "fk_show_activity_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId,table.createdBy], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_show_activity_creator_tenant" }),
  index("idx_show_activities_timeline").on(table.organizationId,table.showId,table.createdAt),
]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  showId: text("show_id").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  dueDate: text("due_date").notNull(),
  paidAt: text("paid_at"),
  status: text("status", { enum: ["PENDING","PAID","OVERDUE","CANCELLED"] }).notNull().default("PENDING"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_payments_id_organization").on(table.id,table.organizationId),
  foreignKey({ columns: [table.showId,table.organizationId], foreignColumns: [shows.id,shows.organizationId], name: "fk_payment_show_tenant" }).onDelete("cascade"),
  index("idx_payments_show_status_due").on(table.organizationId,table.showId,table.status,table.dueDate),
  index("idx_payments_status_due").on(table.organizationId,table.status,table.dueDate),
]);

export const showCommissions = sqliteTable("show_commissions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  showId: text("show_id").notNull(),
  userId: text("user_id").notNull(),
  percentage: integer("percentage").notNull(),
  amount: integer("amount").notNull(),
  status: text("status", { enum: ["PENDING","PAID","CANCELLED"] }).notNull().default("PENDING"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_show_commissions_id_organization").on(table.id,table.organizationId),
  uniqueIndex("idx_show_commissions_user_tenant").on(table.organizationId,table.showId,table.userId),
  foreignKey({ columns: [table.showId,table.organizationId], foreignColumns: [shows.id,shows.organizationId], name: "fk_commission_show_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId,table.userId], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_commission_user_tenant" }),
  index("idx_show_commissions_status").on(table.organizationId,table.status),
]);

export const proposalSequences = sqliteTable("proposal_sequences", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
}, (table) => [primaryKey({ columns: [table.organizationId,table.year] })]);

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  artistId: text("artist_id").notNull(),
  customerId: text("customer_id").notNull(),
  proposalNumber: text("proposal_number").notNull(),
  value: integer("value").notNull(),
  paymentTerms: text("payment_terms").notNull(),
  transportationTerms: text("transportation_terms"),
  accommodationTerms: text("accommodation_terms"),
  technicalTerms: text("technical_terms"),
  additionalTerms: text("additional_terms"),
  validityDate: text("validity_date").notNull(),
  status: text("status", { enum: ["DRAFT","SENT","ACCEPTED","REJECTED","EXPIRED"] }).notNull().default("DRAFT"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_proposals_id_organization").on(table.id,table.organizationId),
  uniqueIndex("idx_proposals_number_tenant").on(table.organizationId,table.proposalNumber),
  foreignKey({ columns: [table.opportunityId,table.organizationId], foreignColumns: [opportunities.id,opportunities.organizationId], name: "fk_proposal_opportunity_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.artistId,table.organizationId], foreignColumns: [artists.id,artists.organizationId], name: "fk_proposal_artist_tenant" }),
  foreignKey({ columns: [table.customerId,table.organizationId], foreignColumns: [customers.id,customers.organizationId], name: "fk_proposal_customer_tenant" }),
  foreignKey({ columns: [table.organizationId,table.createdBy], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_proposal_creator_tenant" }),
  index("idx_proposals_opportunity_created").on(table.organizationId,table.opportunityId,table.createdAt),
  index("idx_proposals_status_validity").on(table.organizationId,table.status,table.validityDate),
]);

export const contractSequences = sqliteTable("contract_sequences", {
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
}, (table) => [primaryKey({ columns: [table.organizationId,table.year] })]);

export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  opportunityId: text("opportunity_id").notNull(),
  showId: text("show_id"),
  customerId: text("customer_id").notNull(),
  artistId: text("artist_id").notNull(),
  contractNumber: text("contract_number").notNull(),
  status: text("status", { enum: ["DRAFT","SENT","SIGNED","CANCELLED"] }).notNull().default("DRAFT"),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  fileType: text("file_type"),
  fileSize: integer("file_size"),
  fileUploadedAt: text("file_uploaded_at"),
  sentAt: text("sent_at"),
  signedAt: text("signed_at"),
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("idx_contracts_id_organization").on(table.id,table.organizationId),
  uniqueIndex("idx_contracts_number_tenant").on(table.organizationId,table.contractNumber),
  foreignKey({ columns: [table.opportunityId,table.organizationId], foreignColumns: [opportunities.id,opportunities.organizationId], name: "fk_contract_opportunity_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.showId,table.organizationId], foreignColumns: [shows.id,shows.organizationId], name: "fk_contract_show_tenant" }),
  foreignKey({ columns: [table.customerId,table.organizationId], foreignColumns: [customers.id,customers.organizationId], name: "fk_contract_customer_tenant" }),
  foreignKey({ columns: [table.artistId,table.organizationId], foreignColumns: [artists.id,artists.organizationId], name: "fk_contract_artist_tenant" }),
  foreignKey({ columns: [table.organizationId,table.createdBy], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_contract_creator_tenant" }),
  index("idx_contracts_opportunity_created").on(table.organizationId,table.opportunityId,table.createdAt),
  index("idx_contracts_show").on(table.organizationId,table.showId),
  index("idx_contracts_status_updated").on(table.organizationId,table.status,table.updatedAt),
]);

export const contractActivities = sqliteTable("contract_activities", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  contractId: text("contract_id").notNull(),
  type: text("type", { enum: ["CREATED","FILE_UPLOADED","FILE_REPLACED","SENT","SIGNED","CANCELLED","NOTES_UPDATED"] }).notNull(),
  description: text("description").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  foreignKey({ columns: [table.contractId,table.organizationId], foreignColumns: [contracts.id,contracts.organizationId], name: "fk_contract_activity_tenant" }).onDelete("cascade"),
  foreignKey({ columns: [table.organizationId,table.createdBy], foreignColumns: [memberships.organizationId,memberships.userId], name: "fk_contract_activity_creator_tenant" }),
  index("idx_contract_activities_timeline").on(table.organizationId,table.contractId,table.createdAt),
]);

export const publicRequestAttempts = sqliteTable("public_request_attempts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  fingerprintHash: text("fingerprint_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_public_attempts_organization_hash_created").on(table.organizationId, table.fingerprintHash, table.createdAt)]);

export const authCredentials = sqliteTable("auth_credentials", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_sessions_user_id").on(table.userId), index("idx_sessions_expires_at").on(table.expiresAt)]);

export const authLoginAttempts = sqliteTable("auth_login_attempts", {
  id: text("id").primaryKey(),
  fingerprintHash: text("fingerprint_hash").notNull(),
  emailHash: text("email_hash").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_auth_attempts_fingerprint_created").on(table.fingerprintHash,table.createdAt),
  index("idx_auth_attempts_email_created").on(table.emailHash,table.createdAt),
]);
