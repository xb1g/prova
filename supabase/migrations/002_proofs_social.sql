-- proofs
create table if not exists public.proofs (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid references public.goals(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  media_url       text,
  media_type      text check (media_type in ('photo', 'video', 'text', 'voice')),
  caption         text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'disputed')),
  streak_period   text,
  submitted_at    timestamptz default now()
);

-- proof_votes
create table if not exists public.proof_votes (
  id          uuid primary key default gen_random_uuid(),
  proof_id    uuid references public.proofs(id) on delete cascade not null,
  voter_id    uuid references auth.users(id) on delete cascade not null,
  vote        text not null check (vote in ('approve', 'dispute')),
  created_at  timestamptz default now(),
  unique(proof_id, voter_id)
);

-- proof_reactions
create table if not exists public.proof_reactions (
  id          uuid primary key default gen_random_uuid(),
  proof_id    uuid references public.proofs(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  emoji       text not null,
  created_at  timestamptz default now(),
  unique(proof_id, user_id, emoji)
);

-- proof_comments
create table if not exists public.proof_comments (
  id          uuid primary key default gen_random_uuid(),
  proof_id    uuid references public.proofs(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  body        text not null,
  created_at  timestamptz default now()
);

-- push_tokens
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null unique,
  token       text not null,
  platform    text check (platform in ('ios', 'android')),
  updated_at  timestamptz default now()
);

-- RLS
alter table public.proofs enable row level security;
alter table public.proof_votes enable row level security;
alter table public.proof_reactions enable row level security;
alter table public.proof_comments enable row level security;
alter table public.push_tokens enable row level security;

-- Helper: check if the current user has access to a proof's goal
-- (owns the goal or participates in the challenge linked to the goal)
create or replace function public.user_can_access_goal(p_goal_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.goals where id = p_goal_id and user_id = auth.uid()
  )
  or exists (
    select 1
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where cp.user_id = auth.uid()
      and (c.creator_goal_id = p_goal_id or cp.goal_id = p_goal_id)
  );
$$;

-- proofs policies
create policy "Users can view proofs for accessible goals"
  on public.proofs for select
  using (public.user_can_access_goal(goal_id));

create policy "Users can insert proofs for their own goals"
  on public.proofs for insert
  with check (
    user_id = auth.uid()
    and goal_id in (select id from public.goals where user_id = auth.uid())
  );

create policy "Users can update their own proofs"
  on public.proofs for update
  using (user_id = auth.uid());

-- proof_votes policies
create policy "Users can view votes on accessible proofs"
  on public.proof_votes for select
  using (
    proof_id in (select id from public.proofs where public.user_can_access_goal(goal_id))
  );

create policy "Users can insert their own votes"
  on public.proof_votes for insert
  with check (voter_id = auth.uid());

create policy "Users can update their own votes"
  on public.proof_votes for update
  using (voter_id = auth.uid());

-- proof_reactions policies
create policy "Users can view reactions on accessible proofs"
  on public.proof_reactions for select
  using (
    proof_id in (select id from public.proofs where public.user_can_access_goal(goal_id))
  );

create policy "Users can insert their own reactions"
  on public.proof_reactions for insert
  with check (user_id = auth.uid());

create policy "Users can delete their own reactions"
  on public.proof_reactions for delete
  using (user_id = auth.uid());

-- proof_comments policies
create policy "Users can view comments on accessible proofs"
  on public.proof_comments for select
  using (
    proof_id in (select id from public.proofs where public.user_can_access_goal(goal_id))
  );

create policy "Users can insert their own comments"
  on public.proof_comments for insert
  with check (user_id = auth.uid());

-- push_tokens policies
create policy "Users can manage their own push token"
  on public.push_tokens for all
  using (user_id = auth.uid());
