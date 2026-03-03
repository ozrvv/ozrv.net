# ozrv.net

Static + Node site with Discord OAuth login and cloud-synced minigame progress.

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Fill `.env`:
   - `DISCORD_CLIENT_ID=...`
   - `DISCORD_CLIENT_SECRET=...`
   - `DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback`
   - `SUPABASE_URL=...` (optional but required for durable cloud progress)
   - `SUPABASE_SERVICE_ROLE_KEY=...` (optional but required for durable cloud progress)
   - `SESSION_SECRET=some-random-long-string`
4. Start:
   - `npm start`
5. Open:
   - `http://localhost:3000`

## Discord Developer Portal

Create an app at [Discord Developer Portal](https://discord.com/developers/applications), then:
- OAuth2 -> General:
  - Copy Client ID and Client Secret into `.env`.
- OAuth2 -> Redirects:
  - Add `http://localhost:3000/api/auth/discord/callback`
- Scopes used:
  - `identify`

## Deploy Notes (Vercel)

If you deploy on Vercel, this repo now includes a catch-all API function at:
- `api/[...all].js`

Set environment variables in Vercel project settings:
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI` (example: `https://your-domain.com/api/auth/discord/callback`)
- `SESSION_SECRET`

Also add the same production redirect URI in Discord Developer Portal -> OAuth2 -> Redirects.

## Permanent Account Saves (Free)

Recommended: Supabase free tier with spending disabled.

1. Create a Supabase project (free).
2. In SQL editor, run:

```sql
create table if not exists public.user_scores (
  user_id text primary key,
  username text,
  avatar text,
  reaction_best integer,
  tap_best integer,
  number_best integer,
  updated_at timestamptz default now()
);
```

3. From Supabase project settings, copy:
   - Project URL -> set `SUPABASE_URL`
   - Service Role key -> set `SUPABASE_SERVICE_ROLE_KEY`
4. Redeploy.

Notes:
- If Supabase env vars are missing, app falls back to non-durable memory/file storage.
- For strict no-pay guarantee, keep billing disabled and monitor free tier limits.
