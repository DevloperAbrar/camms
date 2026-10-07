-- CreateEnum
CREATE TYPE "SyllabusStatus" AS ENUM ('not_started', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "syllabus_chapters" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "unit_name" TEXT,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "planned_periods" INTEGER NOT NULL DEFAULT 1,
    "planned_start" DATE,
    "planned_end" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabus_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_progress" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "status" "SyllabusStatus" NOT NULL DEFAULT 'not_started',
    "percent_done" INTEGER NOT NULL DEFAULT 0,
    "started_on" DATE,
    "completed_on" DATE,
    "is_revised" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabus_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_exam_scopes" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,

    CONSTRAINT "syllabus_exam_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_templates" (
    "id" TEXT NOT NULL,
    "school_id" TEXT,
    "board" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "chapters" JSONB NOT NULL DEFAULT '[]',
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syllabus_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syllabus_chapters_school_id_session_id_class_id_subject_id_idx" ON "syllabus_chapters"("school_id", "session_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "syllabus_chapters_subject_id_idx" ON "syllabus_chapters"("subject_id");

-- CreateIndex
CREATE INDEX "syllabus_progress_school_id_section_id_idx" ON "syllabus_progress"("school_id", "section_id");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_progress_chapter_id_section_id_key" ON "syllabus_progress"("chapter_id", "section_id");

-- CreateIndex
CREATE INDEX "syllabus_exam_scopes_school_id_idx" ON "syllabus_exam_scopes"("school_id");

-- CreateIndex
CREATE INDEX "syllabus_exam_scopes_chapter_id_idx" ON "syllabus_exam_scopes"("chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_exam_scopes_exam_type_id_chapter_id_key" ON "syllabus_exam_scopes"("exam_type_id", "chapter_id");

-- CreateIndex
CREATE INDEX "syllabus_templates_school_id_idx" ON "syllabus_templates"("school_id");

-- CreateIndex
CREATE INDEX "syllabus_templates_class_name_subject_name_idx" ON "syllabus_templates"("class_name", "subject_name");

-- AddForeignKey
ALTER TABLE "syllabus_chapters" ADD CONSTRAINT "syllabus_chapters_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_chapters" ADD CONSTRAINT "syllabus_chapters_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_chapters" ADD CONSTRAINT "syllabus_chapters_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_chapters" ADD CONSTRAINT "syllabus_chapters_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_progress" ADD CONSTRAINT "syllabus_progress_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "syllabus_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_progress" ADD CONSTRAINT "syllabus_progress_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_exam_scopes" ADD CONSTRAINT "syllabus_exam_scopes_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_exam_scopes" ADD CONSTRAINT "syllabus_exam_scopes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "syllabus_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_templates" ADD CONSTRAINT "syllabus_templates_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;