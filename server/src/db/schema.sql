-- Supabase pgvector schema for DocAgent.
--
-- STEP 1 (Dashboard — do NOT use SQL for this):
--   Database → Extensions → search "vector" → Enable
--   (CREATE EXTENSION fails in Supabase SQL editor: read-only transaction)
--
-- STEP 2: Run everything below in SQL Editor (New query → Run).
--
-- LEARNING: pgvector stores embeddings as fixed-dimension vectors; similarity
-- search uses cosine distance. See LEARNING.md § Vector store.
--
-- Multi-user upgrade: enable RLS on documents/chunks and scope by user_id.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  page_count int not null,
  chunk_count int not null,
  char_count int not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  filename text not null,
  page int not null,
  chunk_index int not null,
  content text not null,
  embedding vector(768) not null
);

create index if not exists document_chunks_embedding_idx
  on document_chunks using hnsw (embedding vector_cosine_ops);

create or replace function match_document_chunks(
  query_embedding vector(768),
  match_count int default 5,
  filter_document_ids uuid[] default null,
  min_score float default 0.35
)
returns table (
  id uuid,
  document_id uuid,
  filename text,
  page int,
  chunk_index int,
  content text,
  score float
)
language sql stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.filename,
    dc.page,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as score
  from document_chunks dc
  where (filter_document_ids is null or dc.document_id = any(filter_document_ids))
    and 1 - (dc.embedding <=> query_embedding) >= min_score
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;
