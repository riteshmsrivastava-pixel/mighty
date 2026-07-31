-- Mighty migration 4, 31 Jul 2026. Passive activity detection - the schema half.
--
-- Paste into the Supabase SQL editor for hplyyywdftnvjajyncvj. Idempotent.
--
-- Extends outreach_inbox.kind with three new values so the extension can push
-- what it reads off LinkedIn's own messaging list, notifications feed, and
-- (Premium-only) "who's viewed your profile" page - only ever pages the user
-- is already on, never one the extension opens itself. Full design and the
-- confirmed DOM selectors live in mighty-plan/reply-detection-spec.md.
--
--   reply_detected       - an unread "sent you a message" notification, or an
--                           unread thread in the messaging list. Certain
--                           (profile-URL matched) from notifications; name-only
--                           (confidence-checked) from the messaging list.
--   connection_accepted  - "X accepted your invitation to connect." Logged as
--                           a context flag on the outreach_log row, not a new
--                           pipeline stage - see the spec's "Decided" section.
--   profile_viewed       - a named row on /analytics/profile-views/. Soft
--                           context only (timingSignals), never an event.
--
-- Same shape as the profile_context fix already in supabase-setup.sql: this
-- also updates the master file directly, this migration is just the paste-in
-- form for an existing install.

alter table public.outreach_inbox drop constraint if exists outreach_inbox_kind_check;
alter table public.outreach_inbox add constraint outreach_inbox_kind_check
  check (kind in ('profile','sent_confirmation','profile_context',
                   'reply_detected','connection_accepted','profile_viewed'));

-- Proof. Should list all six.
select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.outreach_inbox'::regclass
   and conname = 'outreach_inbox_kind_check';
