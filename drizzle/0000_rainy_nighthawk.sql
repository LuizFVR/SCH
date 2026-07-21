CREATE TYPE "public"."alert_status" AS ENUM('NEW', 'VIEWED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."identification_mode" AS ENUM('ANONYMOUS', 'OPTIONAL', 'REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('SCHEDULED', 'ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('STARS', 'NPS', 'YES_NO', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_TEXT', 'LONG_TEXT');--> statement-breakpoint
CREATE TYPE "public"."survey_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'UNIT_MANAGER', 'SECTOR_MANAGER', 'ANALYST');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"status" "alert_status" DEFAULT 'NEW' NOT NULL,
	"reason" text NOT NULL,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	"public_token" varchar(96) NOT NULL,
	"qr_label" varchar(120),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_version_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"status" "publication_status" DEFAULT 'SCHEDULED' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"alert_threshold" integer DEFAULT 2 NOT NULL,
	"duplicate_window_hours" integer DEFAULT 12 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"source_question_id" uuid,
	"category" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"type" "question_type" NOT NULL,
	"options" jsonb,
	"shared" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_guards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_target_id" uuid NOT NULL,
	"device_fingerprint_hash" varchar(128) NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_identities" (
	"response_id" uuid PRIMARY KEY NOT NULL,
	"name_ciphertext" text,
	"contact_ciphertext" text,
	"demographics_ciphertext" text,
	"encryption_key_version" integer NOT NULL,
	"consent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_target_id" uuid NOT NULL,
	"identified" boolean DEFAULT false NOT NULL,
	"overall_score" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"service_type_id" uuid,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_version_id" uuid NOT NULL,
	"source_question_id" uuid,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"type" "question_type" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"rules" jsonb
);
--> statement-breakpoint
CREATE TABLE "survey_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "survey_version_status" DEFAULT 'DRAFT' NOT NULL,
	"identification_mode" "identification_mode" DEFAULT 'ANONYMOUS' NOT NULL,
	"identification_fields" jsonb,
	"consent_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sector_scopes" (
	"user_id" uuid NOT NULL,
	"sector_id" uuid NOT NULL,
	CONSTRAINT "user_sector_scopes_user_id_sector_id_pk" PRIMARY KEY("user_id","sector_id")
);
--> statement-breakpoint
CREATE TABLE "user_unit_scopes" (
	"user_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	CONSTRAINT "user_unit_scopes_user_id_unit_id_pk" PRIMARY KEY("user_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_targets" ADD CONSTRAINT "publication_targets_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_targets" ADD CONSTRAINT "publication_targets_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_survey_version_id_survey_versions_id_fk" FOREIGN KEY ("survey_version_id") REFERENCES "public"."survey_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_guards" ADD CONSTRAINT "response_guards_publication_target_id_publication_targets_id_fk" FOREIGN KEY ("publication_target_id") REFERENCES "public"."publication_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_identities" ADD CONSTRAINT "response_identities_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_publication_target_id_publication_targets_id_fk" FOREIGN KEY ("publication_target_id") REFERENCES "public"."publication_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sectors" ADD CONSTRAINT "sectors_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_types" ADD CONSTRAINT "service_types_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_version_id_survey_versions_id_fk" FOREIGN KEY ("survey_version_id") REFERENCES "public"."survey_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_source_question_id_question_bank_id_fk" FOREIGN KEY ("source_question_id") REFERENCES "public"."question_bank"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_versions" ADD CONSTRAINT "survey_versions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sector_scopes" ADD CONSTRAINT "user_sector_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sector_scopes" ADD CONSTRAINT "user_sector_scopes_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unit_scopes" ADD CONSTRAINT "user_unit_scopes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unit_scopes" ADD CONSTRAINT "user_unit_scopes_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_sector_status_created_idx" ON "alerts" USING btree ("sector_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "answers_response_question_uq" ON "answers" USING btree ("response_id","question_id");--> statement-breakpoint
CREATE INDEX "audit_logs_hospital_created_idx" ON "audit_logs" USING btree ("hospital_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_targets_token_uq" ON "publication_targets" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_targets_publication_sector_uq" ON "publication_targets" USING btree ("publication_id","sector_id");--> statement-breakpoint
CREATE INDEX "publications_status_dates_idx" ON "publications" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "question_bank_hospital_category_idx" ON "question_bank" USING btree ("hospital_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "response_guards_target_fingerprint_uq" ON "response_guards" USING btree ("publication_target_id","device_fingerprint_hash");--> statement-breakpoint
CREATE INDEX "response_guards_blocked_until_idx" ON "response_guards" USING btree ("blocked_until");--> statement-breakpoint
CREATE INDEX "responses_target_submitted_idx" ON "responses" USING btree ("publication_target_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sectors_unit_name_uq" ON "sectors" USING btree ("unit_id","name");--> statement-breakpoint
CREATE INDEX "sectors_service_type_idx" ON "sectors" USING btree ("service_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_hospital_name_uq" ON "service_types" USING btree ("hospital_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_questions_version_position_uq" ON "survey_questions" USING btree ("survey_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_versions_survey_version_uq" ON "survey_versions" USING btree ("survey_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "units_hospital_name_uq" ON "units" USING btree ("hospital_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_hospital_email_uq" ON "users" USING btree ("hospital_id","email");