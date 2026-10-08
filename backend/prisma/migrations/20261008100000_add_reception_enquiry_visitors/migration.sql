-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'receptionist';

-- CreateEnum
CREATE TYPE "EnquiryStage" AS ENUM ('new_lead', 'follow_up', 'interested', 'test_scheduled', 'interview', 'admitted', 'lost');

-- CreateEnum
CREATE TYPE "ReceptionFieldScope" AS ENUM ('enquiry', 'visitor');

-- CreateTable
CREATE TABLE "enquiries" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "enquiry_seq" INTEGER NOT NULL,
    "enquiry_no" TEXT NOT NULL,
    "student_name" TEXT NOT NULL,
    "dob" DATE,
    "gender" TEXT,
    "class_sought" TEXT NOT NULL,
    "academic_year" TEXT,
    "parent_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "previous_school" TEXT,
    "source" TEXT NOT NULL DEFAULT 'walk_in',
    "referred_by" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "stage" "EnquiryStage" NOT NULL DEFAULT 'new_lead',
    "lost_reason" TEXT,
    "notes" TEXT,
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "assigned_to_id" TEXT,
    "next_follow_up_on" DATE,
    "last_contacted_at" TIMESTAMP(3),
    "converted_student_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_follow_ups" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "enquiry_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "from_stage" "EnquiryStage",
    "to_stage" "EnquiryStage",
    "next_follow_up_on" DATE,
    "done_by_id" TEXT NOT NULL,
    "done_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "visit_seq" INTEGER NOT NULL,
    "pass_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "purpose_note" TEXT,
    "host_user_id" TEXT,
    "host_name" TEXT,
    "student_id" TEXT,
    "student_name" TEXT,
    "enquiry_id" TEXT,
    "head_count" INTEGER NOT NULL DEFAULT 1,
    "id_proof_type" TEXT,
    "id_proof_last4" TEXT,
    "vehicle_number" TEXT,
    "badge_number" TEXT,
    "remarks" TEXT,
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "check_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "check_out_at" TIMESTAMP(3),
    "auto_checked_out" BOOLEAN NOT NULL DEFAULT false,
    "check_in_by_id" TEXT NOT NULL,
    "check_in_by_name" TEXT NOT NULL,
    "check_out_by_id" TEXT,
    "check_out_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_fields" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "scope" "ReceptionFieldScope" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reception_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reception_counters" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reception_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_converted_student_id_key" ON "enquiries"("converted_student_id");

-- CreateIndex
CREATE INDEX "enquiries_school_id_stage_idx" ON "enquiries"("school_id", "stage");

-- CreateIndex
CREATE INDEX "enquiries_school_id_next_follow_up_on_idx" ON "enquiries"("school_id", "next_follow_up_on");

-- CreateIndex
CREATE INDEX "enquiries_school_id_phone_idx" ON "enquiries"("school_id", "phone");

-- CreateIndex
CREATE INDEX "enquiries_school_id_created_at_idx" ON "enquiries"("school_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_school_id_enquiry_seq_key" ON "enquiries"("school_id", "enquiry_seq");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_enquiry_id_created_at_idx" ON "enquiry_follow_ups"("enquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_school_id_idx" ON "enquiry_follow_ups"("school_id");

-- CreateIndex
CREATE INDEX "visitors_school_id_check_in_at_idx" ON "visitors"("school_id", "check_in_at");

-- CreateIndex
CREATE INDEX "visitors_school_id_check_out_at_idx" ON "visitors"("school_id", "check_out_at");

-- CreateIndex
CREATE INDEX "visitors_school_id_phone_idx" ON "visitors"("school_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "visitors_school_id_visit_seq_key" ON "visitors"("school_id", "visit_seq");

-- CreateIndex
CREATE INDEX "reception_fields_school_id_scope_idx" ON "reception_fields"("school_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "reception_fields_school_id_scope_key_key" ON "reception_fields"("school_id", "scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "reception_counters_school_id_kind_key" ON "reception_counters"("school_id", "kind");

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reception_fields" ADD CONSTRAINT "reception_fields_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;