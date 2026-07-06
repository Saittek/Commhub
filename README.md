# Commhub

A Discord-style communication app built on Cloudflare Workers, D1, R2, and React.

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
npx wrangler d1 migrations apply commhub-db --local
```

Optional: create `.dev.vars` in the project root for local secrets:

```env
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

## Development

Start the dev server (applies migrations, then runs Vite):

```bash
npm run dev
```

Open the URL printed in the terminal (usually `http://localhost:5173/`). Vite picks the next free port if 5173 is taken.

If you get `ERR_CONNECTION_REFUSED`, the dev server is not running — restart it.

To free stuck dev ports and start fresh:

```bash
npm run dev:clean
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test
```

## Database

Apply local migrations only:

```bash
npm run db:local
```

## Deploy

```bash
npm run deploy
```

Apply remote D1 migrations separately before deploying to production:

```bash
npx wrangler d1 migrations apply commhub-db --remote
```

## Production checklist

Before inviting real users:

1. **D1** — apply all migrations to the remote database.
2. **R2** — confirm the assets bucket exists and is bound in `wrangler.jsonc`.
3. **Secrets** — set OAuth (`GITHUB_*`, `GOOGLE_*`), `SESSION_SECRET`, and VAPID keys for push notifications.
4. **Voice** — set `CALLS_APP_ID` and `CALLS_APP_SECRET` worker secrets to route media through [Cloudflare Realtime SFU](https://developers.cloudflare.com/realtime/sfu/). Without those secrets, voice falls back to peer mesh WebRTC (best for small groups; platform cap: 25 users per voice channel).
5. **TURN/STUN** — Cloudflare STUN is used when Calls is enabled. For mesh fallback or extra relay, set optional client env vars:
   - `VITE_TURN_URL` (e.g. `turn:turn.example.com:3478`)
   - `VITE_TURN_USERNAME`
   - `VITE_TURN_CREDENTIAL`
6. **Custom domain** — route your domain to the Worker and enable HTTPS (required for mic/camera/screen share).
7. **Push** — set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` worker secrets and `VITE_VAPID_PUBLIC_KEY` for the client; register the service worker and verify push subscribe.

## Voice architecture notes

- **SFU mode (production)** — when `CALLS_APP_ID` / `CALLS_APP_SECRET` are set, each client connects once to Cloudflare Realtime SFU. The worker proxies Calls API requests; `VoiceRoom` still handles presence, moderation, soundboard, and track announcements over WebSocket.
- **Mesh fallback (local dev)** — without Calls credentials, clients use peer-to-peer WebRTC mesh coordinated by `VoiceRoom` signaling.
- Screen share and camera streams appear in the voice stage when any participant shares video.
