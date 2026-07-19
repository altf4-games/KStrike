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

## Asset attribution

### Weapons

- `near_future_assault_rifle.glb` — [near future Assault rifle](https://sketchfab.com/3d-models/near-future-assault-rifle-34c6eb98deaa4d2480bc0351d7897d16) by Ahmed Abu Ajamiah, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `shotgun.glb` — [Low Poly Shotgun - Game ready](https://sketchfab.com/3d-models/low-poly-shotgun-game-ready-d932d5005daf48bd8ac0897915f02adf) by Koten, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [FN SCAR-Assault Rifle](https://sketchfab.com/3d-models/fn-scar-assault-rifle-7b7328a5de3f481aa13acbc0e8e08076) by CastleBravo, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

### Map

- `de_dust_2.glb` — [De_Dust 2 with real light](https://sketchfab.com/3d-models/de-dust-2-with-real-light-4ce74cd95c584ce9b12b5ed9dc418db5) by Neo_minigan, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The model page credits Valve for the original map.
