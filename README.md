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
4. **Voice** — mesh WebRTC works for small groups (platform cap: 25 users per voice channel). For larger or more reliable calls, plan a move to an SFU such as [Cloudflare Calls](https://developers.cloudflare.com/calls/) and replace peer mesh signaling in `VoiceRoom` / `voice-client.ts`.
5. **TURN/STUN** — Google STUN and Cloudflare STUN are used by default. For production, set optional client env vars:
   - `VITE_TURN_URL` (e.g. `turn:turn.example.com:3478`)
   - `VITE_TURN_USERNAME`
   - `VITE_TURN_CREDENTIAL`
6. **SFU (optional)** — For calls above ~15 users, migrate voice signaling to [Cloudflare Calls](https://developers.cloudflare.com/calls/) and replace mesh WebRTC in `VoiceRoom` / `voice-client.ts`. Until then, mesh works up to the 25-user platform cap.
7. **Custom domain** — route your domain to the Worker and enable HTTPS (required for mic/camera/screen share).
8. **Push** — set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` worker secrets and `VITE_VAPID_PUBLIC_KEY` for the client; register the service worker and verify push subscribe.

## Voice architecture notes

- Voice uses peer-to-peer mesh WebRTC between clients, coordinated by `VoiceRoom` Durable Objects.
- Each client opens connections to every other participant, so practical quality is best below ~15 users even though the hard cap is 25.
- Screen share and camera streams appear in the voice stage when any participant shares video.
