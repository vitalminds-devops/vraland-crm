-- Drops columns nothing reads or writes any more. Safe to run again.
-- The reservation fee's paid date and payer: whether it is paid comes from the bill's payments.
ALTER TABLE "deals" DROP COLUMN IF EXISTS "reservation_fee_paid_at";
ALTER TABLE "deals" DROP COLUMN IF EXISTS "reservation_fee_paid_by";
-- Passwords live on the sign-in account (auth_users), never on users.
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
