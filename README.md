# KStrike

Fast browser FPS project. The current build contains Phase 1: a responsive Three.js training arena with scene lighting, fog, animated targets, and an entry screen.

## Run locally

```bash
npm install
npm run dev
```

In a second terminal, start multiplayer with `npm run dev:server`. The client automatically joins the local training room when the player enters the arena.

Build a production bundle with `npm run build`.

## Deploy

Deploy the frontend to Vercel from this repository. Set the `VITE_COLYSEUS_URL` environment variable to the public WebSocket URL of the server, for example `wss://kstrike-server.onrender.com`.

Deploy the server as a Render Web Service using `render.yaml`. Render provides a free tier for this prototype; it can spin down after inactivity, so the first player may need to wait for it to wake.

After both are deployed, redeploy the Vercel project with `VITE_COLYSEUS_URL` set. The browser client will then connect to the public multiplayer server instead of `localhost:2567`.
