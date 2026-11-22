BEGIN;
ALTER TABLE public.telebot_subscribers ADD COLUMN app_id text;

-- Reset legacy subscriptions so users can opt in again within their app.
DELETE FROM public.telebot_subscribers;

ALTER TABLE public.telebot_subscribers
  ALTER COLUMN app_id SET NOT NULL,
  DROP CONSTRAINT telebot_subscribers_pkey,
  ADD PRIMARY KEY (app_id, chat_id);

CREATE INDEX telebot_subscribers_active_user_idx
  ON public.telebot_subscribers (app_id, user_id)
  WHERE status = 'active';
COMMIT;
