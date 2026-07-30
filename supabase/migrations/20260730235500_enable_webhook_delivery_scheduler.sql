-- P3.2 production scheduler support.
--
-- Vercel Hobby projects cannot run a cron more than once per day. Supabase
-- Cron is the durable minute-level trigger for the existing idempotent webhook
-- delivery worker. The production configuration command stores the worker URL
-- and bearer token in Vault before it creates the named cron job.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
