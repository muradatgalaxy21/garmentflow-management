-- Enable Supabase Realtime (postgres_changes) for inbox/notification tables,
-- replacing 15s/30s client-side polling (plan.md §9.1).
alter publication supabase_realtime add table worker_inbox_messages;
alter publication supabase_realtime add table client_inbox_messages;
alter publication supabase_realtime add table admin_notifications;
