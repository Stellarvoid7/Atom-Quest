-- Supabase Storage Bucket Configuration
-- Run this in the Supabase SQL Editor to create and configure the shared_files bucket.

-- Create the shared_files storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shared_files',
  'shared_files',
  false,
  5242880,  -- 5 MB; Supabase returns 413 on violation
  ARRAY['image/jpeg', 'image/png', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create the recordings storage bucket (for egress output)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recordings',
  'recordings',
  false,
  null,  -- No size limit for recordings
  null   -- Any MIME type
)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: allow service_role (our API routes) full access
-- The presigned URLs minted by the service_role bypass RLS,
-- so no additional policies are needed for download links.
