import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './GameRoom.js';

const port = Number(process.env.PORT || 2567);
const gameServer = new Server({ transport: new WebSocketTransport() });
gameServer.define('deathmatch', GameRoom).filterBy(['isPrivate', 'roomCode']);

await gameServer.listen(port);
console.log(`KStrike multiplayer server listening on ws://localhost:${port}`);
