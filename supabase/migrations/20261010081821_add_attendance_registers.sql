CREATE TABLE "attendance_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"date" date NOT NULL,
	"notes" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "attendance_registers_class_id_date_key" UNIQUE("class_id","date")
);
--> statement-breakpoint
ALTER TABLE "attendance_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD CONSTRAINT "attendance_registers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;