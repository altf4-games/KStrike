import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'node:http';
import { GameRoom } from './GameRoom.js';

const port = Number(process.env.PORT || 2567);
const host = '0.0.0.0';
const httpServer = createServer((request, response) => {
  if (request.url === '/' || request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'kstrike-server' }));
    return;
  }
  response.writeHead(404);
  response.end();
});
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('deathmatch', GameRoom).filterBy(['isPrivate', 'roomCode', 'mapId']);

await gameServer.listen(port, host);
console.log(`KStrike multiplayer server listening on ws://${host}:${port}`);
