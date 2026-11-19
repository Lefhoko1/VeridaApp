-- Schedules the background jobs on a hosted project. Run once, after the migrations and after
-- deploying dispatch-email. It lives outside migrations because it needs the project's own URL
-- and the pg_cron and pg_net extensions, which local test databases do not have.
--
-- Replace PROJECT_REF below, then run this in the SQL editor. Running it again is safe:
-- scheduling an existing job name replaces it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- FR-H09: send queued emails every minute.
select cron.schedule(
  'verida-dispatch-email',
  '* * * * *',
  $$ select net.http_post('https://PROJECT_REF.supabase.co/functions/v1/dispatch-email') $$
);

-- FR-H04: remind learners about unfinished lessons, each morning at 07:00 UTC.
select cron.schedule(
  'verida-learning-reminders',
  '0 7 * * *',
  $$ select notifications.send_learning_reminders() $$
);

-- Plan section 9: send task reminders that have come due, every five minutes. Each reminder is
-- claimed once, so overlapping runs never send it twice.
select cron.schedule(
  'verida-plan-reminders',
  '*/5 * * * *',
  $$ select plan.send_due_reminders() $$
);

-- Plan section 4.4: turn the next week of each repeating task into tasks, nightly at 00:10 UTC.
-- Opening the Plan tab does the same, so this only keeps reminders and counts current for
-- businesses nobody has opened. Running it twice never creates a task twice.
select cron.schedule(
  'verida-plan-occurrences',
  '10 0 * * *',
  $$ select plan.generate_all_occurrences() $$
);
