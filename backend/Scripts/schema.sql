-- Misaina Cognition - Schéma PostgreSQL (compatible PostgreSQL 16 standard, sans pgvector)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "Users" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "Email" varchar(255) UNIQUE NOT NULL,
    "FullName" varchar(255) NOT NULL,
    "PasswordHash" text NOT NULL,
    "Role" integer NOT NULL DEFAULT 2, -- 0 ADMIN, 1 MANAGER, 2 EMPLOYEE, 3 GUEST
    "Department" varchar(100) NOT NULL DEFAULT 'General',
    "RefreshToken" text NULL,
    "RefreshTokenExpiry" timestamptz NOT NULL DEFAULT now(),
    "EmailConfirmed" boolean NOT NULL DEFAULT false,
    "IsActive" boolean NOT NULL DEFAULT true,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "Documents" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "Title" varchar(500) NOT NULL,
    "FileName" varchar(500) NOT NULL,
    "FileType" varchar(20) NOT NULL,
    "Size" bigint NOT NULL DEFAULT 0,
    "UploadedById" uuid NOT NULL REFERENCES "Users"("Id") ON DELETE RESTRICT,
    "Department" varchar(100) NOT NULL DEFAULT 'General',
    "Version" integer NOT NULL DEFAULT 1,
    "ParentDocumentId" uuid NULL,
    "Category" varchar(200) NULL,
    "Tags" text NULL,
    "Status" integer NOT NULL DEFAULT 0,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_owner ON "Documents"("UploadedById");

CREATE TABLE "DocumentChunks" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "DocumentId" uuid NOT NULL REFERENCES "Documents"("Id") ON DELETE CASCADE,
    "Content" text NOT NULL,
    "PageNumber" integer NOT NULL DEFAULT 1,
    "ChunkIndex" integer NOT NULL DEFAULT 0,
    "Metadata" text NULL,
    "Embedding" real[] NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_chunks_doc ON "DocumentChunks"("DocumentId");

CREATE TABLE "DocumentPermissions" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" uuid NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
    "DocumentId" uuid NOT NULL REFERENCES "Documents"("Id") ON DELETE CASCADE,
    "AccessLevel" integer NOT NULL DEFAULT 1,
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE("UserId","DocumentId")
);

CREATE TABLE "Conversations" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" uuid NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
    "Title" varchar(255) NOT NULL DEFAULT 'Nouvelle conversation',
    "CreatedAt" timestamptz NOT NULL DEFAULT now(),
    "UpdatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_user ON "Conversations"("UserId");

CREATE TABLE "Messages" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "ConversationId" uuid NOT NULL REFERENCES "Conversations"("Id") ON DELETE CASCADE,
    "Role" varchar(20) NOT NULL,
    "Content" text NOT NULL,
    "Confidence" real NOT NULL DEFAULT 0,
    "Sources" text NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "AuditLogs" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "DocumentId" uuid NULL REFERENCES "Documents"("Id"),
    "UserId" uuid NULL REFERENCES "Users"("Id"),
    "Action" varchar(100) NOT NULL,
    "Details" text NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "GeneratedDocuments" (
    "Id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "UserId" uuid NOT NULL REFERENCES "Users"("Id") ON DELETE CASCADE,
    "Question" text NOT NULL,
    "Answer" text NOT NULL,
    "SourcesJson" text NULL,
    "FileName" varchar(255) NOT NULL,
    "Size" bigint NOT NULL DEFAULT 0,
    "CreatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gen_user ON "GeneratedDocuments"("UserId");
