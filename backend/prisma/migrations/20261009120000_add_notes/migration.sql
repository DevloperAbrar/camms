-- CreateTable
CREATE TABLE "school_notes_settings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "quota_mb" INTEGER NOT NULL DEFAULT 2048,
    "max_file_mb" INTEGER NOT NULL DEFAULT 10,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_notes_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "chapter_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'note',
    "title" TEXT NOT NULL,
    "content_html" TEXT NOT NULL DEFAULT '',
    "content_text" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),
    "allow_download" BOOLEAN NOT NULL DEFAULT true,
    "takedown_reason" TEXT,
    "takedown_by_id" TEXT,
    "takedown_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_audiences" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "section_id" TEXT,
    "student_id" TEXT,

    CONSTRAINT "note_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_attachments" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "storage_key" TEXT,
    "file_name" TEXT NOT NULL,
    "mime" TEXT,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "note_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_views" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_notes_settings_school_id_key" ON "school_notes_settings"("school_id");

-- CreateIndex
CREATE INDEX "notes_school_class_status_idx" ON "notes"("school_id", "class_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "notes_school_author_idx" ON "notes"("school_id", "author_id", "status");

-- CreateIndex
CREATE INDEX "notes_status_publish_at_idx" ON "notes"("status", "publish_at");

-- CreateIndex
CREATE INDEX "notes_deleted_at_idx" ON "notes"("deleted_at");

-- CreateIndex
CREATE INDEX "note_audiences_note_idx" ON "note_audiences"("note_id");

-- CreateIndex
CREATE INDEX "note_audiences_section_idx" ON "note_audiences"("section_id");

-- CreateIndex
CREATE INDEX "note_audiences_student_idx" ON "note_audiences"("student_id");

-- CreateIndex
CREATE INDEX "note_attachments_note_idx" ON "note_attachments"("note_id");

-- CreateIndex
CREATE INDEX "note_attachments_status_created_idx" ON "note_attachments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "note_views_note_student_key" ON "note_views"("note_id", "student_id");

-- CreateIndex
CREATE INDEX "note_views_student_idx" ON "note_views"("student_id");

-- AddForeignKey
ALTER TABLE "school_notes_settings" ADD CONSTRAINT "school_notes_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_audiences" ADD CONSTRAINT "note_audiences_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_views" ADD CONSTRAINT "note_views_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;