-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('holiday', 'exam', 'event', 'working_day');

-- CreateEnum
CREATE TYPE "CalendarAudience" AS ENUM ('all', 'staff');

-- CreateTable
CREATE TABLE "calendar_categories" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CalendarEventKind" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#f97316',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "kind" "CalendarEventKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "location" TEXT,
    "audience" "CalendarAudience" NOT NULL DEFAULT 'all',
    "class_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_settings" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "weekly_off_days" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "off_saturdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_categories_school_id_name_key" ON "calendar_categories"("school_id", "name");

-- CreateIndex
CREATE INDEX "calendar_events_school_id_session_id_start_date_idx" ON "calendar_events"("school_id", "session_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_settings_session_id_key" ON "calendar_settings"("session_id");

-- CreateIndex
CREATE INDEX "calendar_settings_school_id_idx" ON "calendar_settings"("school_id");

-- AddForeignKey
ALTER TABLE "calendar_categories" ADD CONSTRAINT "calendar_categories_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "calendar_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_settings" ADD CONSTRAINT "calendar_settings_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_settings" ADD CONSTRAINT "calendar_settings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the default categories for every existing school
INSERT INTO "calendar_categories" ("id", "school_id", "name", "kind", "color", "sort_order", "is_active", "created_at")
SELECT md5(random()::text || clock_timestamp()::text || s."id" || v.name)::uuid::text,
       s."id", v.name, v.kind::"CalendarEventKind", v.color, v.sort_order, true, CURRENT_TIMESTAMP
FROM "schools" s
CROSS JOIN (VALUES
  ('Public Holiday', 'holiday', '#ef4444', 0),
  ('Festival', 'holiday', '#f97316', 1),
  ('Vacation', 'holiday', '#0ea5e9', 2),
  ('Examination', 'exam', '#6366f1', 3),
  ('Parent-Teacher Meeting', 'event', '#14b8a6', 4),
  ('Sports & Cultural', 'event', '#a855f7', 5),
  ('School Event', 'event', '#3b82f6', 6),
  ('Working Day', 'working_day', '#16a34a', 7)
) AS v(name, kind, color, sort_order);

-- Move existing holidays into the new calendar so nothing is lost
INSERT INTO "calendar_events" ("id", "school_id", "session_id", "category_id", "kind", "title", "start_date", "end_date", "audience", "class_ids", "needs_review", "created_at", "updated_at")
SELECT md5(random()::text || clock_timestamp()::text || h."id")::uuid::text,
       h."school_id", h."session_id", c."id", 'holiday'::"CalendarEventKind",
       COALESCE(NULLIF(TRIM(h."description"), ''), 'Holiday'),
       h."date", h."date", 'all'::"CalendarAudience", ARRAY[]::TEXT[], false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "holidays" h
JOIN "calendar_categories" c ON c."school_id" = h."school_id" AND c."name" = 'Public Holiday';