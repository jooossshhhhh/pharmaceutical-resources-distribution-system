create or replace function public.validate_other_program_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'UPCOMING' and new.program_date < current_date then
    raise exception 'Upcoming program date cannot be before the current date.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_other_program_date on public.other_programs;

create trigger validate_other_program_date
before insert or update of program_date, status on public.other_programs
for each row
execute function public.validate_other_program_date();

revoke all on function public.validate_other_program_date() from public, anon;
grant execute on function public.validate_other_program_date() to authenticated;

notify pgrst, 'reload schema';
