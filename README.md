# KStrike

KStrike is a fast-paced browser FPS deathmatch built with Three.js and Colyseus.

Made by **AltF4 Games — Pradyum Mistry**.

- [Play my other game](https://store.steampowered.com/app/4539460/Fragments_of_Fear/)
- [More games on itch.io](https://altf4-games.itch.io/)

## Screenshots

![D2 deathmatch gameplay](screenshots/Screenshot%202026-07-19%20223644.png)

![KStrike firefight](screenshots/Screenshot%202026-07-19%20223703.png)

![KStrike D2 arena](screenshots/Screenshot%202026-07-19%20223741.png)

## Features

- Multiplayer deathmatch with public matchmaking and private room codes
- D2 desert arena and a compact training arena
- First-person movement with sprinting, crouching, jumping, momentum, and collision
- AR-01 automatic rifle and switchable SG-12 shotgun
- Networked blocky player avatars with idle, movement, crouch, jump, fire, and reload animation
- Kill feed, scoreboard, end-of-match leaderboard, and kill-streak cards
- Remote-player firing effects, weapon audio, hit markers, bullet decals, and out-of-map recovery

## Controls

| Action | Control |
| --- | --- |
| Move | `WASD` |
| Look / fire | Mouse / left click |
| Sprint | `Shift` |
| Crouch | `Ctrl` or `C` |
| Jump | `Space` |
| Reload | `R` |
| Switch weapons | `1` / `2` or mouse wheel |
| Leaderboard | Hold `Tab` |
| Pause menu | `Esc` |

## Run locally

Install dependencies once:

```bash
npm install
npm --prefix server install
```

Start the client:

```bash
npm run dev
```

In a second terminal, start the multiplayer server:

```bash
npm run dev:server
```

Open the Vite URL shown in the client terminal. Use a normal window and an incognito window to test a local multiplayer match.

Create a production client build with:

```bash
npm run build
```

## Deployment

Deploy the frontend to Vercel. Set `VITE_COLYSEUS_URL` to the public WebSocket URL of the server, for example:

```text
wss://kstrike-server.onrender.com
```

Deploy the Colyseus server as a persistent Node web service, such as Render, using [`render.yaml`](render.yaml). The server exposes `/health` for host health checks.

After deploying the server, redeploy the Vercel frontend with the environment variable set.

## Source code

The source is available on [GitHub](https://github.com/altf4-games/kstrike).

## Asset attribution

### Weapons

- `near_future_assault_rifle.glb` — [near future Assault rifle](https://sketchfab.com/3d-models/near-future-assault-rifle-34c6eb98deaa4d2480bc0351d7897d16) by Ahmed Abu Ajamiah, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- `shotgun.glb` — [Low Poly Shotgun - Game ready](https://sketchfab.com/3d-models/low-poly-shotgun-game-ready-d932d5005daf48bd8ac0897915f02adf) by Koten, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [FN SCAR-Assault Rifle](https://sketchfab.com/3d-models/fn-scar-assault-rifle-7b7328a5de3f481aa13acbc0e8e08076) by CastleBravo, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

### Map

- `de_dust_2.glb` — [De_Dust 2 with real light](https://sketchfab.com/3d-models/de-dust-2-with-real-light-4ce74cd95c584ce9b12b5ed9dc418db5) by Neo_minigan, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The model page credits Valve for the original map.
