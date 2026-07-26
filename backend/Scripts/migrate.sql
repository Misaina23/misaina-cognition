-- Migration incrémentale (idempotente) pour aligner le schéma existant
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Users' AND column_name='EmailConfirmed') THEN
        ALTER TABLE "Users" ADD COLUMN "EmailConfirmed" boolean NOT NULL DEFAULT false;
    END IF;
END $$;

-- Conversion de l'embedding en real[] si besoin (compatible sans pgvector)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='DocumentChunks' AND column_name='Embedding'
               AND udt_name <> 'real') THEN
        ALTER TABLE "DocumentChunks" ALTER COLUMN "Embedding" TYPE real[] USING NULL;
    END IF;
END $$;

-- Index pour accès par utilisateur (performances)
CREATE INDEX IF NOT EXISTS idx_documents_owner ON "Documents"("UploadedById");
CREATE INDEX IF NOT EXISTS idx_conv_user ON "Conversations"("UserId");
CREATE INDEX IF NOT EXISTS idx_gen_user ON "GeneratedDocuments"("UserId");
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON "DocumentChunks"("DocumentId");
