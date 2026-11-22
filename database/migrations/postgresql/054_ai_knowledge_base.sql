DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  -- Full text retrieval remains available when pgvector is not installed or
  -- the managed database role cannot create extensions.
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
  source_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_module TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal','private')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ai_knowledge_sources (source_key,label,description,source_module) VALUES
  ('published_news_updates','Published News & Updates','Published news articles and announcements.','news'),
  ('published_events_meetings','Published Events & Meetings','Published events and meeting notices.','news'),
  ('municipal_services','Municipal Services','Published service descriptions, requirements, fees, and steps.','services'),
  ('municipal_departments','Municipal Offices','Published department profiles and contact information.','departments'),
  ('barangay_profiles','Barangay Profiles','Public barangay profile information.','barangays'),
  ('public_open_data','Public Open Data','Public dataset catalogue entries and topic descriptions.','open_data'),
  ('official_faqs','Official FAQs','Published FAQ and help content approved for public use.','managed_content'),
  ('ordinances_resolutions','Ordinances & Resolutions','Approved, published ordinance and resolution materials.','manual_documents'),
  ('approved_municipal_documents','Approved Municipal Documents','Approved public municipal documents.','manual_documents'),
  ('official_forms','Official Downloadable Forms','Approved public municipal forms and instructions.','manual_documents'),
  ('approved_website_pages','Approved Website Pages','Published pages approved for public AI retrieval.','managed_content')
ON CONFLICT (source_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL REFERENCES ai_knowledge_sources(source_key) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal','private')),
  publication_status TEXT NOT NULL CHECK (publication_status IN ('draft','published','unpublished','deleted')),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  content_hash TEXT NOT NULL,
  embedding_model_version TEXT,
  indexing_status TEXT NOT NULL DEFAULT 'pending' CHECK (indexing_status IN ('pending','indexed','failed','removed')),
  sync_run_id UUID,
  search_vector TSVECTOR GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title,'')), 'A') || to_tsvector('simple', coalesce(content,''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  indexed_at TIMESTAMPTZ,
  UNIQUE (source_key, source_record_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ai_knowledge_documents_search_idx ON ai_knowledge_documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS ai_knowledge_documents_public_idx ON ai_knowledge_documents (source_key, visibility, publication_status, indexing_status, approved);
CREATE INDEX IF NOT EXISTS ai_knowledge_documents_source_idx ON ai_knowledge_documents (source_module, source_record_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    BEGIN
      ALTER TABLE ai_knowledge_documents ADD COLUMN IF NOT EXISTS embedding vector(1536);
    EXCEPTION WHEN OTHERS THEN
      -- Keep full-text search available if this provider does not expose vector.
      NULL;
    END;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_knowledge_documents' AND column_name='embedding') THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS ai_knowledge_documents_embedding_idx ON ai_knowledge_documents USING hnsw (embedding vector_cosine_ops);
    EXCEPTION WHEN OTHERS THEN
      -- Vector similarity can still run as a bounded table scan without HNSW.
      NULL;
    END;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ai_knowledge_jobs (
  id BIGSERIAL PRIMARY KEY,
  source_key TEXT NOT NULL REFERENCES ai_knowledge_sources(source_key) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'sync' CHECK (operation IN ('sync','rebuild')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_knowledge_jobs_pending_idx ON ai_knowledge_jobs (status, requested_at, id);
CREATE INDEX IF NOT EXISTS ai_knowledge_jobs_source_idx ON ai_knowledge_jobs (source_key, source_record_id, status);
WITH ranked_active_jobs AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY source_key,source_record_id ORDER BY requested_at,id) AS position
  FROM ai_knowledge_jobs WHERE status IN ('pending','processing')
)
UPDATE ai_knowledge_jobs SET status='failed',attempts=GREATEST(attempts,3),last_error='Superseded by a duplicate active job during worker setup.',completed_at=CURRENT_TIMESTAMP
WHERE id IN (SELECT id FROM ranked_active_jobs WHERE position > 1);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_jobs_one_active_source_idx ON ai_knowledge_jobs (source_key, source_record_id) WHERE status IN ('pending','processing');

CREATE TABLE IF NOT EXISTS ai_knowledge_manual_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL REFERENCES ai_knowledge_sources(source_key),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal','private')),
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft','published','unpublished')),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_key IN ('ordinances_resolutions','approved_municipal_documents','official_forms'))
);
CREATE INDEX IF NOT EXISTS ai_knowledge_manual_source_idx ON ai_knowledge_manual_documents (source_key, publication_status, approved, visibility);

CREATE OR REPLACE FUNCTION ai_knowledge_enqueue(source_name TEXT, record_id TEXT) RETURNS VOID AS $$
BEGIN
  IF source_name IS NULL OR record_id IS NULL THEN RETURN; END IF;
  DELETE FROM ai_knowledge_jobs WHERE source_key=source_name AND source_record_id=record_id AND status='pending';
  INSERT INTO ai_knowledge_jobs (source_key, source_record_id, operation, status)
  VALUES (source_name, record_id, 'sync', 'pending')
  ON CONFLICT (source_key,source_record_id) WHERE status IN ('pending','processing') DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_news_changed() RETURNS TRIGGER AS $$
DECLARE old_key TEXT; new_key TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_key := CASE WHEN OLD.content_type IN ('event','meeting') THEN 'published_events_meetings' ELSE 'published_news_updates' END;
    DELETE FROM ai_knowledge_documents WHERE source_key=old_key AND source_record_id=OLD.id::text;
    PERFORM ai_knowledge_enqueue(old_key, OLD.id::text);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_key := CASE WHEN NEW.content_type IN ('event','meeting') THEN 'published_events_meetings' ELSE 'published_news_updates' END;
    DELETE FROM ai_knowledge_documents WHERE source_key=new_key AND source_record_id=NEW.id::text;
    PERFORM ai_knowledge_enqueue(new_key, NEW.id::text);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_service_changed() RETURNS TRIGGER AS $$
DECLARE record_id TEXT;
BEGIN
  record_id := CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  DELETE FROM ai_knowledge_documents WHERE source_key='municipal_services' AND source_record_id=record_id;
  PERFORM ai_knowledge_enqueue('municipal_services', record_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_department_changed() RETURNS TRIGGER AS $$
DECLARE record_id TEXT;
BEGIN
  record_id := CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  DELETE FROM ai_knowledge_documents WHERE source_key='municipal_departments' AND source_record_id=record_id;
  PERFORM ai_knowledge_enqueue('municipal_departments', record_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_service_child_changed() RETURNS TRIGGER AS $$
DECLARE record_id TEXT;
BEGIN
  record_id := CASE WHEN TG_OP='DELETE' THEN OLD.service_id::text ELSE NEW.service_id::text END;
  DELETE FROM ai_knowledge_documents WHERE source_key='municipal_services' AND source_record_id=record_id;
  PERFORM ai_knowledge_enqueue('municipal_services', record_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_department_service_changed() RETURNS TRIGGER AS $$
DECLARE department_id TEXT; service_id TEXT;
BEGIN
  department_id := CASE WHEN TG_OP='DELETE' THEN OLD.department_id::text ELSE NEW.department_id::text END;
  service_id := CASE WHEN TG_OP='DELETE' THEN OLD.service_id::text ELSE NEW.service_id::text END;
  DELETE FROM ai_knowledge_documents WHERE (source_key='municipal_departments' AND source_record_id=department_id) OR (source_key='municipal_services' AND source_record_id=service_id);
  PERFORM ai_knowledge_enqueue('municipal_departments', department_id);
  PERFORM ai_knowledge_enqueue('municipal_services', service_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_barangay_changed() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.slug, OLD.slug)='barangays' THEN
    DELETE FROM ai_knowledge_documents WHERE source_key='barangay_profiles' AND source_record_id='barangays';
    PERFORM ai_knowledge_enqueue('barangay_profiles', 'barangays');
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_managed_content_changed() RETURNS TRIGGER AS $$
DECLARE old_key TEXT; new_key TEXT;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_key := CASE WHEN OLD.kind='help' THEN 'official_faqs' WHEN OLD.kind='page' THEN 'approved_website_pages' ELSE NULL END;
    IF old_key IS NOT NULL THEN
      DELETE FROM ai_knowledge_documents WHERE source_key=old_key AND source_record_id=OLD.key;
      PERFORM ai_knowledge_enqueue(old_key, OLD.key);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_key := CASE WHEN NEW.kind='help' THEN 'official_faqs' WHEN NEW.kind='page' THEN 'approved_website_pages' ELSE NULL END;
    IF new_key IS NOT NULL THEN
      DELETE FROM ai_knowledge_documents WHERE source_key=new_key AND source_record_id=NEW.key;
      PERFORM ai_knowledge_enqueue(new_key, NEW.key);
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_knowledge_manual_document_changed() RETURNS TRIGGER AS $$
DECLARE record_id TEXT; source_name TEXT;
BEGIN
  record_id := CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  source_name := CASE WHEN TG_OP='DELETE' THEN OLD.source_key ELSE NEW.source_key END;
  DELETE FROM ai_knowledge_documents WHERE source_key=source_name AND source_record_id=record_id;
  PERFORM ai_knowledge_enqueue(source_name, record_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_knowledge_news_sync ON news;
CREATE TRIGGER ai_knowledge_news_sync AFTER INSERT OR UPDATE OR DELETE ON news FOR EACH ROW EXECUTE FUNCTION ai_knowledge_news_changed();
DROP TRIGGER IF EXISTS ai_knowledge_services_sync ON services;
CREATE TRIGGER ai_knowledge_services_sync AFTER INSERT OR UPDATE OR DELETE ON services FOR EACH ROW EXECUTE FUNCTION ai_knowledge_service_changed();
DROP TRIGGER IF EXISTS ai_knowledge_service_requirements_sync ON service_requirements;
CREATE TRIGGER ai_knowledge_service_requirements_sync AFTER INSERT OR UPDATE OR DELETE ON service_requirements FOR EACH ROW EXECUTE FUNCTION ai_knowledge_service_child_changed();
DROP TRIGGER IF EXISTS ai_knowledge_service_fees_sync ON service_fees;
CREATE TRIGGER ai_knowledge_service_fees_sync AFTER INSERT OR UPDATE OR DELETE ON service_fees FOR EACH ROW EXECUTE FUNCTION ai_knowledge_service_child_changed();
DROP TRIGGER IF EXISTS ai_knowledge_departments_sync ON departments;
CREATE TRIGGER ai_knowledge_departments_sync AFTER INSERT OR UPDATE OR DELETE ON departments FOR EACH ROW EXECUTE FUNCTION ai_knowledge_department_changed();
DROP TRIGGER IF EXISTS ai_knowledge_department_services_sync ON department_services;
CREATE TRIGGER ai_knowledge_department_services_sync AFTER INSERT OR UPDATE OR DELETE ON department_services FOR EACH ROW EXECUTE FUNCTION ai_knowledge_department_service_changed();
DROP TRIGGER IF EXISTS ai_knowledge_barangays_sync ON site_pages;
CREATE TRIGGER ai_knowledge_barangays_sync AFTER INSERT OR UPDATE OR DELETE ON site_pages FOR EACH ROW EXECUTE FUNCTION ai_knowledge_barangay_changed();
DROP TRIGGER IF EXISTS ai_knowledge_managed_sync ON managed_public_content;
CREATE TRIGGER ai_knowledge_managed_sync AFTER INSERT OR UPDATE OR DELETE ON managed_public_content FOR EACH ROW EXECUTE FUNCTION ai_knowledge_managed_content_changed();
DROP TRIGGER IF EXISTS ai_knowledge_manual_sync ON ai_knowledge_manual_documents;
CREATE TRIGGER ai_knowledge_manual_sync AFTER INSERT OR UPDATE OR DELETE ON ai_knowledge_manual_documents FOR EACH ROW EXECUTE FUNCTION ai_knowledge_manual_document_changed();

