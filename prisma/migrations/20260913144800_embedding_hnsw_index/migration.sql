-- Prisma cannot express pgvector index types, so the ANN index is declared here.
-- Cosine ops matches the `<=>` operator used by searchWorkspaceVectors.
CREATE INDEX "WorkspaceEmbedding_embedding_hnsw_idx"
    ON "WorkspaceEmbedding"
    USING hnsw ("embedding" vector_cosine_ops);
