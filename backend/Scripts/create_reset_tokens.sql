CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
  "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "UserId" uuid NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
  "Token" text NOT NULL,
  "Expiry" timestamptz NOT NULL,
  "Used" boolean NOT NULL DEFAULT false,
  "CreatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON "PasswordResetTokens"("Token");
