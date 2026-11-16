-- Better Auth after 1.7.2 no longer writes issuer, so a required column blocks every account insert.
-- Kept rather than dropped so existing values survive. Re-runnable: DROP NOT NULL is a no-op when already nullable.
ALTER TABLE auth_accounts ALTER COLUMN issuer DROP NOT NULL;
