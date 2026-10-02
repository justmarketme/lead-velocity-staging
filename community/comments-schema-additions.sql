-- Schema additions requested by community-response-lead for W30 and W31.
-- Owner of the migration: platform-architect (this file is a request, not applied).
-- Extends the `comments` and `escalations` tables from build/crm-gap.md and the existing `conversations` table.
-- Idempotent: safe to run twice. No personal data beyond Meta-scoped IDs held only while a reply is queued.

alter table comments add column if not exists status text default 'received';        -- received | queued | retry | done | skipped | failed
alter table comments add column if not exists due_at timestamptz;                    -- next 07:15 SAST for queued, now()+10 min for retry
alter table comments add column if not exists attempts int default 0;
alter table comments add column if not exists decision jsonb;                        -- the W30 plan while queued or retrying; nulled when done
alter table comments add column if not exists created_at timestamptz default now();
create unique index if not exists comments_comment_id_uq on comments (comment_id);
create index if not exists comments_queue_idx on comments (status, due_at) where status in ('queued', 'retry');
create index if not exists comments_ad_class_idx on comments (ad_id, class, created_at);
create index if not exists comments_author_post_idx on comments (author_hash, parent_post_id);

-- W30 reads these from the ads table written by ads-api-engineer; if the column names differ, edit the Context lookup query only.
-- ads.effective_object_story_id (FB), ads.ig_media_id (IG), ads.launched_at

create table if not exists comment_ad_sentiment (
  day date not null,
  ad_id text not null,
  sentiment text not null,              -- positive | neutral | negative
  themes jsonb not null default '[]',   -- [{theme, count}], objection themes seen 3+ times go to creative-strategist
  flag_media_buyer boolean not null default false,
  created_at timestamptz default now(),
  primary key (day, ad_id)
);

-- W31 queue of replies that arrived outside 07:00-22:00 SAST (reply decided at receipt, sent at release).
create table if not exists dm_queue (
  id bigserial primary key,
  channel text not null,                -- messenger | instagram
  external_id text not null,            -- PSID or IGSID
  owner_id text not null,               -- Page id or IG business id
  reply_text text not null,
  quick_replies jsonb,
  window_expires_at timestamptz not null,   -- last_user_message_at + 24 h: never send after this
  due_at timestamptz not null,
  status text not null default 'queued',    -- queued | sent | expired | failed
  attempts int not null default 0,
  created_at timestamptz default now()
);
create index if not exists dm_queue_due_idx on dm_queue (status, due_at);

-- W31 conversation state (columns added only if missing on the existing conversations table).
alter table conversations add column if not exists external_id text;
alter table conversations add column if not exists state jsonb default '{}'::jsonb;  -- {step, faq_count, cta_count, age_band, lang, origin_ref}
alter table conversations add column if not exists paused boolean default false;      -- true after a human handoff
alter table conversations add column if not exists opted_out boolean default false;
alter table conversations add column if not exists last_user_message_at timestamptz;
create unique index if not exists conversations_channel_ext_uq on conversations (channel, external_id);

-- escalations.ref_id is written as text (comment_id or ad_id); cast in the console if the column is uuid.
