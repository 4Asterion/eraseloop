CREATE TABLE IF NOT EXISTS public.synthetic_users (
  subject TEXT PRIMARY KEY,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
