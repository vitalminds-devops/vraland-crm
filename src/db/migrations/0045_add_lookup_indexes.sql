-- Indexes for the pipeline board, lead expiry, first-deal checks, document lists and calendar ranges.
-- Re-runnable: IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS deal_stage_history_deal_changed_idx ON deal_stage_history (deal_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS deal_contacts_contact_id_idx ON deal_contacts (contact_id);
CREATE INDEX IF NOT EXISTS documents_org_created_idx ON documents (organization_id, created_at);
CREATE INDEX IF NOT EXISTS documents_contact_id_idx ON documents (contact_id);
CREATE INDEX IF NOT EXISTS documents_deal_id_idx ON documents (deal_id);
CREATE INDEX IF NOT EXISTS calendar_events_org_start_idx ON calendar_events (organization_id, start_at);
