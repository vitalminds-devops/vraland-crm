ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "transaction_slip_document_id" uuid
  REFERENCES "documents"("id") ON DELETE SET NULL;
