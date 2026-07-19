import { Room } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

const SPAWN_POINTS = [
  [12, 10], [-12, 9], [0, 6], [-11, -8], [11, -8], [0, -3],
];

class PlayerState extends Schema {
  constructor() {
    super();
    this.nickname = 'Player';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotation = 0;
    this.pitch = 0;
  }
}
defineTypes(PlayerState, {
  nickname: 'string', x: 'number', y: 'number', z: 'number', rotation: 'number', pitch: 'number',
});

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
defineTypes(GameState, { players: { map: PlayerState } });

export class GameRoom extends Room {
  onCreate() {
    this.maxClients = 10;
    this.patchRate = 50;
    this.setState(new GameState());
    this.onMessage('move', (client, movement) => this.updatePlayer(client, movement));
    this.onMessage('rename', (client, nickname) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.nickname = this.sanitizeNickname(nickname);
    });
  }

  onJoin(client, options) {
    const [x, z] = SPAWN_POINTS[this.clients.length % SPAWN_POINTS.length];
    const player = new PlayerState();
    player.nickname = this.sanitizeNickname(options?.nickname);
    player.x = x; player.z = z;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
  }

  updatePlayer(client, movement) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !movement) return;
    // Phase 4 accepts client movement, but bounds it to the playable arena.
    if (Number.isFinite(movement.x)) player.x = Math.max(-14, Math.min(14, movement.x));
    if (Number.isFinite(movement.y)) player.y = Math.max(0, Math.min(8, movement.y));
    if (Number.isFinite(movement.z)) player.z = Math.max(-11, Math.min(11, movement.z));
    if (Number.isFinite(movement.rotation)) player.rotation = movement.rotation;
    if (Number.isFinite(movement.pitch)) player.pitch = Math.max(-1.42, Math.min(1.42, movement.pitch));
  }

  sanitizeNickname(value) {
    const cleaned = String(value || 'Player').replace(/[^a-z0-9 _-]/gi, '').trim();
    return (cleaned || 'Player').slice(0, 16);
  }
}
