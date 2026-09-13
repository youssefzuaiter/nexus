-- DropIndex
DROP INDEX "WorkspaceEmbedding_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "focusTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
