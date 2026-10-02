-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'fee_collector';

-- CreateTable
CREATE TABLE "fee_settings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "display_name" TEXT,
    "tagline" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo_data" BYTEA,
    "logo_mime" TEXT,
    "header_fields" JSONB NOT NULL DEFAULT '[]',
    "gst_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gstin" TEXT,
    "pan_number" TEXT,
    "bank_name" TEXT,
    "account_name" TEXT,
    "account_number" TEXT,
    "ifsc_code" TEXT,
    "bank_branch" TEXT,
    "upi_id" TEXT,
    "show_bank_on_receipt" BOOLEAN NOT NULL DEFAULT false,
    "receipt_prefix" TEXT NOT NULL DEFAULT 'RCP',
    "copies_per_receipt" INTEGER NOT NULL DEFAULT 2,
    "show_balance_on_receipt" BOOLEAN NOT NULL DEFAULT true,
    "terms_text" TEXT,
    "signature_label" TEXT NOT NULL DEFAULT 'Authorised Signatory',
    "enabled_modes" JSONB NOT NULL DEFAULT '["cash","upi","card","cheque","bank_transfer","dd"]',
    "late_fee_mode" TEXT NOT NULL DEFAULT 'none',
    "late_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "late_fee_grace_days" INTEGER NOT NULL DEFAULT 0,
    "late_fee_max_amount" DECIMAL(10,2),
    "collector_can_concede" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_items" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "fee_head_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "installments" INTEGER NOT NULL DEFAULT 1,
    "first_due_date" DATE NOT NULL,
    "applies_to" TEXT NOT NULL DEFAULT 'all',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_charges" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "fee_head_id" TEXT NOT NULL,
    "structure_item_id" TEXT,
    "installment_no" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "late_fee_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "late_fee_waived" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_fee_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_receipts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "receipt_seq" INTEGER NOT NULL,
    "student_id" TEXT,
    "enrollment_id" TEXT,
    "class_id" TEXT,
    "student_name" TEXT NOT NULL,
    "enrollment_number" TEXT NOT NULL,
    "class_name" TEXT,
    "section_name" TEXT,
    "roll_number" TEXT,
    "parent_name" TEXT,
    "parent_phone" TEXT,
    "session_label" TEXT NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" TEXT NOT NULL,
    "reference_no" TEXT,
    "bank_name" TEXT,
    "instrument_date" DATE,
    "sub_total" DECIMAL(12,2) NOT NULL,
    "late_fee_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "tax_included" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance_after" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "collected_by_id" TEXT,
    "collected_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_receipt_items" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "charge_id" TEXT,
    "fee_head_id" TEXT,
    "head_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "late_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gst_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fee_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_receipt_counters" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fee_receipt_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fee_settings_school_id_key" ON "fee_settings"("school_id");

-- CreateIndex
CREATE INDEX "fee_heads_school_id_idx" ON "fee_heads"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_school_id_name_key" ON "fee_heads"("school_id", "name");

-- CreateIndex
CREATE INDEX "fee_structure_items_school_id_session_id_idx" ON "fee_structure_items"("school_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_items_session_id_class_id_fee_head_id_key" ON "fee_structure_items"("session_id", "class_id", "fee_head_id");

-- CreateIndex
CREATE INDEX "student_fee_charges_school_id_status_due_date_idx" ON "student_fee_charges"("school_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "student_fee_charges_enrollment_id_idx" ON "student_fee_charges"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_charges_enrollment_id_structure_item_id_install_key" ON "student_fee_charges"("enrollment_id", "structure_item_id", "installment_no");

-- CreateIndex
CREATE INDEX "fee_receipts_school_id_payment_date_idx" ON "fee_receipts"("school_id", "payment_date");

-- CreateIndex
CREATE INDEX "fee_receipts_student_id_idx" ON "fee_receipts"("student_id");

-- CreateIndex
CREATE INDEX "fee_receipts_collected_by_id_idx" ON "fee_receipts"("collected_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_receipts_school_id_receipt_no_key" ON "fee_receipts"("school_id", "receipt_no");

-- CreateIndex
CREATE INDEX "fee_receipt_items_receipt_id_idx" ON "fee_receipt_items"("receipt_id");

-- CreateIndex
CREATE INDEX "fee_receipt_items_charge_id_idx" ON "fee_receipt_items"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_receipt_counters_school_id_session_id_key" ON "fee_receipt_counters"("school_id", "session_id");

-- AddForeignKey
ALTER TABLE "fee_settings" ADD CONSTRAINT "fee_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_charges" ADD CONSTRAINT "student_fee_charges_structure_item_id_fkey" FOREIGN KEY ("structure_item_id") REFERENCES "fee_structure_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_receipts" ADD CONSTRAINT "fee_receipts_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_receipts" ADD CONSTRAINT "fee_receipts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_receipts" ADD CONSTRAINT "fee_receipts_collected_by_id_fkey" FOREIGN KEY ("collected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_receipt_items" ADD CONSTRAINT "fee_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "fee_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_receipt_items" ADD CONSTRAINT "fee_receipt_items_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "student_fee_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
