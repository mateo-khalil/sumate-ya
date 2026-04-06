ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone" text NULL,
  ADD COLUMN IF NOT EXISTS "address" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "servicesOffered" jsonb NOT NULL DEFAULT '[]'::jsonb;
