-- ─── Documents & Records ──────────────────────────────────────────────────────
-- One row = one item attached to exactly one owner (student OR staff).
-- `source` distinguishes the three kinds:
--   upload → a file stored in the external backend (storage_key)
--   link   → an externally-hosted file (external_url)
--   record → no file; an ordered list of FIELD:VALUE pairs (fields JSONB)
-- `type` is a free-text catalog value resolved in code (src/lib/documentTypes.ts);
-- the DB stays generic and has no knowledge of which types exist.
-- Soft delete: deleted_at/deleted_by are set on delete; the row and the stored
-- bytes are retained for admin records (no hard delete in this flow).

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES students(id) ON DELETE CASCADE,
  staff_id      UUID REFERENCES staff(id)    ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  expires_at    DATE,                                  -- NULL = "Never"
  other         TEXT,                                  -- free-text notes
  source        TEXT NOT NULL CHECK (source IN ('upload','link','record')),
  storage_key   TEXT,                                  -- source='upload'
  external_url  TEXT,                                  -- source='link'
  fields        JSONB,                                 -- source='record'
  file_name     TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  created_by    UUID NOT NULL REFERENCES staff(id),
  updated_by    UUID REFERENCES staff(id),
  deleted_at    TIMESTAMPTZ,
  deleted_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_one_owner CHECK (
    (student_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT documents_source_target CHECK (
    (source = 'upload' AND storage_key  IS NOT NULL) OR
    (source = 'link'   AND external_url IS NOT NULL) OR
    (source = 'record' AND fields       IS NOT NULL AND jsonb_array_length(fields) > 0)
  )
);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX documents_student_idx ON documents(student_id) WHERE deleted_at IS NULL;
CREATE INDEX documents_staff_idx   ON documents(staff_id)   WHERE deleted_at IS NULL;
CREATE INDEX documents_deleted_idx ON documents(deleted_at) WHERE deleted_at IS NOT NULL;
