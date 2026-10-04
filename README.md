# NFL Pick'em

A private weekly pick sheet for an NFL regular-season pool. Each person picks the winner of every game, enters one Monday Night combined-points guess, and the league scores itself. No spreads, odds, confidence points, or money.

One friend group can use it immediately. The data model is a set of independent leagues, so more groups can be added later without sharing picks or chat.

## Run it locally

```bash
npm install
npm run dev -- --hostname 127.0.0.1 --port 43123
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

With no Supabase keys, the app runs in demo mode against a file at `.data/demo.json`. That file is created on first use and is gitignored.

Sample league **Sunday Sheet**, invite code **K7R9Q2**:

| Person | Email | Role |
| --- | --- | --- |
| Alex Rivera | alex@sunday-sheet.test | commissioner |
| Dylan Brooks | dylan@sunday-sheet.test | member |
| John Patel | john@sunday-sheet.test | member |
| Mike Chen | mike@sunday-sheet.test | member |
| Sam Ortiz | sam@sunday-sheet.test | member |
| Riley Nguyen | riley@sunday-sheet.test | member |

Password for every sample account: `pickem-demo`.

The login page has buttons for Alex, Dylan, and John. The sample week is built from the current date, so you can see a finished Thursday game, a live game, and games that are still open. Two earlier weeks are already scored, including a co-winner week.

Reset the sample file from the dashboard while you are signed in as a demo user.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

## Environment

Copy `.env.example` to `.env.local`.

| Variable | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server. Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server. Public. Row Level Security is the real gate. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Schedule sync, notifications, audit rows, weekly results, and commissioner overrides. Never send this to the client. |
| `CRON_SECRET` | `Authorization: Bearer` check on `GET /api/cron/sync`. |
| `NEXT_PUBLIC_APP_URL` | Password-reset links. |
| `DEMO_MODE` | `true` forces the sample league. `false` requires Supabase. Unset uses Supabase when the public keys exist. |

Demo mode stores passwords with scrypt. Supabase Auth stores passwords. This app never stores a plaintext password.

## Supabase

1. Create a project.
2. Run `supabase/migrations/20261003120000_init.sql` in the SQL editor.
3. In Authentication, enable email/password. Add `NEXT_PUBLIC_APP_URL` to the redirect allow list. The reset link returns to `/auth/callback`, then `/reset-password`.
4. Set the env vars above on Vercel and locally.
5. `vercel.json` calls `/api/cron/sync` every 15 minutes. Set `CRON_SECRET` to the same value Vercel sends as a bearer token.

The migration creates profiles, leagues, memberships, games, league weeks, picks, Monday tiebreaker entries, weekly results, chat, notifications, and an audit log. Triggers block updates and deletes of notifications and audit rows, including for the service role. Picks and Monday guesses are hidden from other members until that game's kickoff, and a normal update is rejected after kickoff. Those rules live in Postgres, not only in the page.

## How a week works

- A pick is one team. It saves as soon as you tap it. You can leave the rest blank and come back.
- Each game locks at its own kickoff. The server clock decides. A locked change is rejected even if the button is still on screen.
- No pick at kickoff stays **No pick** and scores 0. Nothing is filled in automatically.
- A correct winner is 1. A wrong pick, a missed pick, or a game that ends tied is 0. There is no tie selection.
- Cancelled games are left out of the denominator. Postponed games lock at the updated kickoff.
- Rank the week by most correct picks. If that is tied, the smaller Monday error wins. The error is the absolute difference between the guessed combined total and the actual combined total.
- The same correct count and the same Monday error (including two missing guesses) is a shared win. There is no further tiebreaker.
- A missing Monday guess sorts worse than any numeric error when the week needs the tiebreaker.
- The designated Monday game defaults to the last non-cancelled Monday game, otherwise the last game of the week. The commissioner can change it before that kickoff.
- Eligible picks on the season leaderboard are final, non-cancelled games only. Future and live games are not in the percentage. Missed picks still count in that denominator. Weekly wins include shared wins.
- Stored final scores are not overwritten by a sync. A commissioner result correction is the path that changes a finished game, and it writes an audit row plus a league notification.
- Kickoff times are stored in UTC and shown in Eastern Time, which follows daylight saving time. After the page loads, your local zone is added when it differs.

## Layout

- `src/lib/domain` is the rules engine: locking, privacy, scoring, roles, audit, and notifications. Tests in `rules.test.ts` cover those rules with a controllable clock.
- `src/lib/nfl` is the schedule provider. Components never call a sports API. `espn.ts` reads the public ESPN regular-season scoreboard (`seasontype=2`, weeks 1–18). `sync.ts` writes normalized games and skips stored finals that disagree.
- `src/lib/db` has two stores behind one interface: the demo file, and Supabase. Ordinary pick reads and writes use the signed-in user so hidden picks never leave the database. Privileged writes use the service role.
- `src/server/actions.ts` is the mutation boundary.
- `src/proxy.ts` sends signed-out visitors away from `/dashboard`, `/league`, and `/account`. `/join/[code]` stays public.

## Routes

`/` `/login` `/signup` `/forgot-password` `/reset-password` `/dashboard` `/account`

`/join/[inviteCode]`

`/league/[leagueId]` `/picks` `/board` `/leaderboard` `/chat` `/history` `/history/[week]` `/settings`
