import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "UNIT_MANAGER", "SECTOR_MANAGER", "ANALYST"]);
export const questionType = pgEnum("question_type", ["STARS", "NPS", "YES_NO", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "SHORT_TEXT", "LONG_TEXT"]);
export const surveyVersionStatus = pgEnum("survey_version_status", ["DRAFT", "PUBLISHED", "SUPERSEDED"]);
export const publicationStatus = pgEnum("publication_status", ["SCHEDULED", "ACTIVE", "ENDED"]);
export const identificationMode = pgEnum("identification_mode", ["ANONYMOUS", "OPTIONAL", "REQUIRED"]);
export const alertStatus = pgEnum("alert_status", ["NEW", "VIEWED", "RESOLVED"]);

export const hospitals = pgTable("hospitals", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const units = pgTable("units", {
  id: uuid("id").defaultRandom().primaryKey(),
  hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("units_hospital_name_uq").on(table.hospitalId, table.name)]);

export const serviceTypes = pgTable("service_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("service_types_hospital_name_uq").on(table.hospitalId, table.name)]);

export const sectors = pgTable("sectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
  serviceTypeId: uuid("service_type_id").references(() => serviceTypes.id, { onDelete: "set null" }),
  name: varchar("name", { length: 160 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("sectors_unit_name_uq").on(table.unitId, table.name), index("sectors_service_type_idx").on(table.serviceTypeId)]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  active: boolean("active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("users_hospital_email_uq").on(table.hospitalId, table.email)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("sessions_token_hash_uq").on(table.tokenHash), index("sessions_user_expires_idx").on(table.userId, table.expiresAt)]);

export const loginAttempts = pgTable("login_attempts", {
  emailHash: varchar("email_hash", { length: 64 }).primaryKey(),
  failureCount: integer("failure_count").default(0).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userUnitScopes = pgTable("user_unit_scopes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  unitId: uuid("unit_id").notNull().references(() => units.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.userId, table.unitId] })]);

export const userSectorScopes = pgTable("user_sector_scopes", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").notNull().references(() => sectors.id, { onDelete: "cascade" }),
}, (table) => [primaryKey({ columns: [table.userId, table.sectorId] })]);

export const questionBank = pgTable("question_bank", {
  id: uuid("id").defaultRandom().primaryKey(),
  hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  sourceQuestionId: uuid("source_question_id"),
  category: varchar("category", { length: 80 }).notNull(),
  title: text("title").notNull(),
  type: questionType("type").notNull(),
  options: jsonb("options").$type<string[]>(),
  shared: boolean("shared").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("question_bank_hospital_category_idx").on(table.hospitalId, table.category)]);

export const surveys = pgTable("surveys", {
  id: uuid("id").defaultRandom().primaryKey(),
  hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const surveyVersions = pgTable("survey_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyId: uuid("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: surveyVersionStatus("status").default("DRAFT").notNull(),
  identificationMode: identificationMode("identification_mode").default("ANONYMOUS").notNull(),
  identificationFields: jsonb("identification_fields").$type<string[]>(),
  consentText: text("consent_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [uniqueIndex("survey_versions_survey_version_uq").on(table.surveyId, table.version)]);

export const surveyQuestions = pgTable("survey_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyVersionId: uuid("survey_version_id").notNull().references(() => surveyVersions.id, { onDelete: "cascade" }),
  sourceQuestionId: uuid("source_question_id").references(() => questionBank.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  type: questionType("type").notNull(),
  required: boolean("required").default(false).notNull(),
  options: jsonb("options").$type<string[]>(),
  rules: jsonb("rules").$type<Record<string, unknown>>(),
}, (table) => [uniqueIndex("survey_questions_version_position_uq").on(table.surveyVersionId, table.position)]);

export const publications = pgTable("publications", {
  id: uuid("id").defaultRandom().primaryKey(),
  surveyVersionId: uuid("survey_version_id").notNull().references(() => surveyVersions.id),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  status: publicationStatus("status").default("SCHEDULED").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  alertThreshold: integer("alert_threshold").default(2).notNull(),
  duplicateWindowHours: integer("duplicate_window_hours").default(12).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("publications_status_dates_idx").on(table.status, table.startsAt, table.endsAt)]);

export const publicationTargets = pgTable("publication_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicationId: uuid("publication_id").notNull().references(() => publications.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").notNull().references(() => sectors.id),
  publicToken: varchar("public_token", { length: 96 }).notNull(),
  qrLabel: varchar("qr_label", { length: 120 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("publication_targets_token_uq").on(table.publicToken), uniqueIndex("publication_targets_publication_sector_uq").on(table.publicationId, table.sectorId)]);

export const responses = pgTable("responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicationTargetId: uuid("publication_target_id").notNull().references(() => publicationTargets.id),
  identified: boolean("identified").default(false).notNull(),
  overallScore: integer("overall_score"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("responses_target_submitted_idx").on(table.publicationTargetId, table.submittedAt)]);

export const responseIdentities = pgTable("response_identities", {
  responseId: uuid("response_id").primaryKey().references(() => responses.id, { onDelete: "cascade" }),
  nameCiphertext: text("name_ciphertext"),
  contactCiphertext: text("contact_ciphertext"),
  demographicsCiphertext: text("demographics_ciphertext"),
  encryptionKeyVersion: integer("encryption_key_version").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
});

export const answers = pgTable("answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  responseId: uuid("response_id").notNull().references(() => responses.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => surveyQuestions.id),
  value: jsonb("value").notNull(),
}, (table) => [uniqueIndex("answers_response_question_uq").on(table.responseId, table.questionId)]);

export const responseGuards = pgTable("response_guards", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicationTargetId: uuid("publication_target_id").notNull().references(() => publicationTargets.id, { onDelete: "cascade" }),
  deviceFingerprintHash: varchar("device_fingerprint_hash", { length: 128 }).notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("response_guards_target_fingerprint_uq").on(table.publicationTargetId, table.deviceFingerprintHash), index("response_guards_blocked_until_idx").on(table.blockedUntil)]);

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  responseId: uuid("response_id").notNull().references(() => responses.id, { onDelete: "cascade" }),
  sectorId: uuid("sector_id").notNull().references(() => sectors.id),
  status: alertStatus("status").default("NEW").notNull(),
  reason: text("reason").notNull(),
  resolvedById: uuid("resolved_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [index("alerts_sector_status_created_idx").on(table.sectorId, table.status, table.createdAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("audit_logs_hospital_created_idx").on(table.hospitalId, table.createdAt)]);
