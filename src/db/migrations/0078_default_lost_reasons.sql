-- Marking an opportunity Lost now requires a loss reason, but there is no Settings page for them
-- yet and only the development seed created any. Every organization without loss reasons gets the
-- starter list (the same as src/db/seeds/lost-reasons.ts). Safe to run again.
INSERT INTO "lost_reasons" ("organization_id", "name", "description")
SELECT o."id", r.name, r.description
FROM "organizations" o
CROSS JOIN (VALUES
  ('Price too high', 'The client considered the property or offer outside their budget.'),
  ('Financing declined', 'The buyer or tenant could not secure the required financing.'),
  ('Chose another property', 'The client selected a competing property.'),
  ('Chose another agent', 'The client continued the transaction with another agent or brokerage.'),
  ('Property unavailable', 'The property was sold, rented, withdrawn, or otherwise became unavailable.'),
  ('Terms not accepted', 'The parties could not agree on price, contingencies, or other terms.'),
  ('Client unresponsive', 'The client stopped responding after reasonable follow-up attempts.'),
  ('Timeline changed', 'The client postponed or cancelled their real-estate plans.'),
  ('Location mismatch', 'The available property location did not meet the client''s requirements.'),
  ('Property condition', 'The property condition did not meet the client''s expectations.'),
  ('Duplicate or invalid lead', 'The opportunity originated from a duplicate or invalid lead.'),
  ('Other', 'A reason not represented by the standard options; explain it in the loss notes.')
) AS r(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "lost_reasons" lr WHERE lr."organization_id" = o."id")
ON CONFLICT DO NOTHING;
