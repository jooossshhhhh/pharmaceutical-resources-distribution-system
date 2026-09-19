-- Ensure monthly reporting follows the caller's RLS policies on medicine_dispensing.
alter view public.monthly_dispensing_summary
  set (security_invoker = true);

notify pgrst, 'reload schema';
