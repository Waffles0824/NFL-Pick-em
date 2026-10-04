-- NFL Pick'em schema, row level security, and commissioner functions.
-- Run in the Supabase SQL editor or via the Supabase CLI.
-- Service-role keys stay on the server. The anon key cannot read hidden picks.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 3 and 48),
  invite_code text not null unique,
  commissioner_user_id uuid not null references public.profiles (id),
  season_year integer not null check (season_year between 2000 and 2100),
  timezone text not null default 'America/New_York',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('commissioner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.nfl_games (
  id uuid primary key default gen_random_uuid(),
  provider_game_id text not null unique,
  season integer not null,
  week integer not null check (week between 1 and 18),
  away_team text not null,
  away_team_abbreviation text not null,
  home_team text not null,
  home_team_abbreviation text not null,
  kickoff_at timestamptz not null,
  status text not null check (status in ('scheduled', 'live', 'final', 'postponed', 'cancelled')),
  away_score integer,
  home_score integer,
  winner_team text,
  is_monday_game boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nfl_games_season_week_idx on public.nfl_games (season, week, kickoff_at);

create table public.league_weeks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season integer not null,
  week integer not null check (week between 1 and 18),
  tiebreaker_game_id uuid references public.nfl_games (id),
  unique (league_id, season, week)
);

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season integer not null,
  week integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.nfl_games (id),
  selected_team text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id, game_id)
);

create index picks_league_week_idx on public.picks (league_id, season, week);

create table public.tiebreaker_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season integer not null,
  week integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  prediction integer not null check (prediction between 0 and 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, season, week, user_id)
);

create table public.weekly_results (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season integer not null,
  week integer not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  correct_picks integer not null,
  eligible_picks integer not null,
  incorrect_picks integer not null,
  missed_picks integer not null,
  tiebreaker_prediction integer,
  tiebreaker_actual integer,
  tiebreaker_error integer,
  is_winner boolean not null default false,
  unique (league_id, season, week, user_id)
);

create table public.league_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index league_messages_league_idx on public.league_messages (league_id, created_at);

create table public.league_notifications (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  actor_user_id uuid references public.profiles (id),
  body text not null,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (league_id, dedupe_key)
);

create table public.league_audit_log (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  actor_user_id uuid not null references public.profiles (id),
  affected_user_id uuid references public.profiles (id),
  action_type text not null,
  entity_type text not null,
  entity_id text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index league_audit_log_league_idx on public.league_audit_log (league_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers. Security definer avoids recursive RLS checks.
-- ---------------------------------------------------------------------------

create or replace function public.is_league_member(p_league uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = p_user
  );
$$;

create or replace function public.is_commissioner(p_league uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = p_user and role = 'commissioner'
  );
$$;

create or replace function public.game_is_open(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nfl_games g
    where g.id = p_game
      and g.kickoff_at > now()
      and g.status in ('scheduled', 'postponed')
  );
$$;

create or replace function public.game_has_kicked_off(p_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nfl_games g
    where g.id = p_game and g.kickoff_at <= now()
  );
$$;

create or replace function public.tiebreaker_has_kicked_off(
  p_league uuid,
  p_season integer,
  p_week integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_weeks lw
    join public.nfl_games g on g.id = lw.tiebreaker_game_id
    where lw.league_id = p_league
      and lw.season = p_season
      and lw.week = p_week
      and g.kickoff_at <= now()
  );
$$;

create or replace function public.pick_team_is_valid(p_game uuid, p_team text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.nfl_games g
    where g.id = p_game
      and p_team in (g.away_team_abbreviation, g.home_team_abbreviation)
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.email <> old.email or new.created_at <> old.created_at then
    raise exception 'This profile field cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

create or replace function public.prevent_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'League history cannot be edited or deleted';
end;
$$;

create trigger audit_immutable
  before update or delete on public.league_audit_log
  for each row execute function public.prevent_history_mutation();

create trigger notifications_immutable
  before update or delete on public.league_notifications
  for each row execute function public.prevent_history_mutation();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nfl_games_touch
  before update on public.nfl_games
  for each row execute function public.touch_updated_at();

create trigger picks_touch
  before update on public.picks
  for each row execute function public.touch_updated_at();

create trigger tiebreaker_touch
  before update on public.tiebreaker_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invite + audited commissioner override. These run as the signed-in user.
-- ---------------------------------------------------------------------------

create or replace function public.preview_invite(p_code text)
returns table (id uuid, name text, season_year integer, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.season_year,
    (select count(*) from public.league_members m where m.league_id = l.id)
  from public.leagues l
  where l.invite_code = upper(trim(p_code))
    and l.active;
$$;

create or replace function public.join_league(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in first';
  end if;
  select * into v_league from public.leagues
  where invite_code = upper(trim(p_code)) and active;
  if v_league.id is null then
    raise exception 'That invite code does not match a league';
  end if;
  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_user, 'member')
  on conflict do nothing;
  return v_league.id;
end;
$$;

create or replace function public.commissioner_override_pick(
  p_league uuid,
  p_user uuid,
  p_game uuid,
  p_team text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_game public.nfl_games;
  v_prev public.picks;
  v_actor_name text;
  v_target_name text;
  v_matchup text;
  v_body text;
begin
  if not public.is_commissioner(p_league, v_actor) then
    raise exception 'Only the commissioner can do that';
  end if;
  if not public.is_league_member(p_league, p_user) then
    raise exception 'That person is not in this league';
  end if;
  select * into v_game from public.nfl_games where id = p_game;
  if v_game.id is null then
    raise exception 'Game not found';
  end if;
  if v_game.status = 'cancelled' then
    raise exception 'This game was cancelled';
  end if;
  if not public.pick_team_is_valid(p_game, p_team) then
    raise exception 'Pick one of the two teams in this game';
  end if;

  select * into v_prev from public.picks
  where league_id = p_league and user_id = p_user and game_id = p_game;

  insert into public.picks (league_id, season, week, user_id, game_id, selected_team)
  values (p_league, v_game.season, v_game.week, p_user, p_game, p_team)
  on conflict (league_id, user_id, game_id)
  do update set selected_team = excluded.selected_team, updated_at = now();

  insert into public.league_audit_log (
    league_id, actor_user_id, affected_user_id, action_type, entity_type, entity_id,
    previous_value, new_value, reason
  ) values (
    p_league, v_actor, p_user, 'pick_override', 'pick', p_game::text,
    case when v_prev.id is null then null else jsonb_build_object('selectedTeam', v_prev.selected_team) end,
    jsonb_build_object('selectedTeam', p_team, 'gameId', p_game),
    nullif(trim(coalesce(p_reason, '')), '')
  );

  select display_name into v_actor_name from public.profiles where id = v_actor;
  select display_name into v_target_name from public.profiles where id = p_user;
  v_matchup := v_game.away_team_abbreviation || ' @ ' || v_game.home_team_abbreviation;
  if v_prev.id is null then
    v_body := v_actor_name || ' set ' || v_target_name || '''s Week ' || v_game.week || ' ' || v_matchup || ' pick to ' || p_team || '.';
  else
    v_body := v_actor_name || ' changed ' || v_target_name || '''s Week ' || v_game.week || ' ' || v_matchup || ' pick from ' || v_prev.selected_team || ' to ' || p_team || '.';
  end if;
  insert into public.league_notifications (league_id, actor_user_id, body)
  values (p_league, v_actor, v_body);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on schema public from public;
grant usage on schema public to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

grant select, insert, update on public.leagues to authenticated;
grant select, delete on public.league_members to authenticated;

grant select on public.nfl_games to authenticated;
grant select on public.league_weeks to authenticated;
grant select, insert, update on public.picks to authenticated;
grant select, insert, update on public.tiebreaker_entries to authenticated;
grant select on public.weekly_results to authenticated;
grant select, insert on public.league_messages to authenticated;
grant select on public.league_notifications to authenticated;
grant select on public.league_audit_log to authenticated;

revoke insert, update, delete on public.nfl_games from authenticated, anon;
revoke insert, update, delete on public.league_weeks from authenticated, anon;
revoke insert, update, delete on public.weekly_results from authenticated, anon;
revoke insert, update, delete on public.league_notifications from authenticated, anon;
revoke insert, update, delete on public.league_audit_log from authenticated, anon;
revoke delete on public.picks from authenticated, anon;
revoke delete on public.tiebreaker_entries from authenticated, anon;
revoke update, delete on public.league_messages from authenticated, anon;

grant execute on function public.preview_invite(text) to anon, authenticated;
grant execute on function public.join_league(text) to authenticated;
grant execute on function public.commissioner_override_pick(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.is_league_member(uuid, uuid) to authenticated;
grant execute on function public.is_commissioner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.nfl_games enable row level security;
alter table public.league_weeks enable row level security;
alter table public.picks enable row level security;
alter table public.tiebreaker_entries enable row level security;
alter table public.weekly_results enable row level security;
alter table public.league_messages enable row level security;
alter table public.league_notifications enable row level security;
alter table public.league_audit_log enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.league_members mine
      join public.league_members theirs on theirs.league_id = mine.league_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy leagues_select on public.leagues
  for select to authenticated
  using (public.is_league_member(id, auth.uid()));

create policy leagues_insert on public.leagues
  for insert to authenticated
  with check (commissioner_user_id = auth.uid());

create policy leagues_update on public.leagues
  for update to authenticated
  using (public.is_commissioner(id, auth.uid()))
  with check (public.is_commissioner(id, auth.uid()));

create policy members_select on public.league_members
  for select to authenticated
  using (public.is_league_member(league_id, auth.uid()));

create policy members_delete on public.league_members
  for delete to authenticated
  using (
    (user_id = auth.uid() and role <> 'commissioner')
    or (
      public.is_commissioner(league_id, auth.uid())
      and user_id <> auth.uid()
      and role <> 'commissioner'
    )
  );

create policy games_select on public.nfl_games
  for select to authenticated
  using (true);

create policy league_weeks_select on public.league_weeks
  for select to authenticated
  using (public.is_league_member(league_id, auth.uid()));

-- Own picks are always visible. Everyone else's picks appear only after kickoff.
create policy picks_select on public.picks
  for select to authenticated
  using (
    public.is_league_member(league_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.game_has_kicked_off(game_id)
    )
  );

create policy picks_insert on public.picks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and public.game_is_open(game_id)
    and public.pick_team_is_valid(game_id, selected_team)
  );

create policy picks_update on public.picks
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and public.game_is_open(game_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and public.game_is_open(game_id)
    and public.pick_team_is_valid(game_id, selected_team)
  );

create policy tiebreaker_select on public.tiebreaker_entries
  for select to authenticated
  using (
    public.is_league_member(league_id, auth.uid())
    and (
      user_id = auth.uid()
      or public.tiebreaker_has_kicked_off(league_id, season, week)
    )
  );

create policy tiebreaker_write on public.tiebreaker_entries
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and not public.tiebreaker_has_kicked_off(league_id, season, week)
  );

create policy tiebreaker_update on public.tiebreaker_entries
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and not public.tiebreaker_has_kicked_off(league_id, season, week)
  )
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and not public.tiebreaker_has_kicked_off(league_id, season, week)
  );

create policy results_select on public.weekly_results
  for select to authenticated
  using (public.is_league_member(league_id, auth.uid()));

create policy messages_select on public.league_messages
  for select to authenticated
  using (public.is_league_member(league_id, auth.uid()));

create policy messages_insert on public.league_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id, auth.uid())
    and char_length(message) between 1 and 1000
  );

create policy notifications_select on public.league_notifications
  for select to authenticated
  using (public.is_league_member(league_id, auth.uid()));

create policy audit_select on public.league_audit_log
  for select to authenticated
  using (public.is_league_member(league_id, auth.uid()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.league_messages;
    alter publication supabase_realtime add table public.league_notifications;
  end if;
end $$;
