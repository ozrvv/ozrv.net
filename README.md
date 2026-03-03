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
