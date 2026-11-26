ALTER TABLE "students" ADD COLUMN "primary_guardian_collection_allowed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "secondary_guardian_collection_allowed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "additional_contact_1_collection_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "additional_contact_2_collection_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "collection_adults" jsonb DEFAULT '[]'::jsonb NOT NULL;