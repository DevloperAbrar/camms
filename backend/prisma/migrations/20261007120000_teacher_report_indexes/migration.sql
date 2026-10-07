CREATE INDEX IF NOT EXISTS "attendance_date_idx" ON "attendance"("date");
CREATE INDEX IF NOT EXISTS "audit_logs_school_id_action_created_at_idx" ON "audit_logs"("school_id", "action", "created_at");