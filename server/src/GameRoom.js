import { Room } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

const SPAWN_POINTS = {
  d2: [
    [23, 19], [2, 10], [-21, 11], [21, -20], [-26, -18],
    [-11, 7], [11, 5], [-7, -9], [8, -7], [-20, 1], [20, 0],
    [-28, -10], [27, -4], [-4, 18], [15, 12],
  ],
  training: [[12, 10], [-12, 9], [0, 6], [-11, -8], [11, -8], [0, -3]],
};

class PlayerState extends Schema {
  constructor() {
    super();
    this.nickname = 'Player';
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.rotation = 0;
    this.pitch = 0;
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    this.respawnSeconds = 0;
  }
}
defineTypes(PlayerState, {
  nickname: 'string', x: 'number', y: 'number', z: 'number', rotation: 'number', pitch: 'number',
  health: 'number', kills: 'number', deaths: 'number', alive: 'boolean', respawnSeconds: 'number',
});

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.roomCode = '';
    this.mapId = 'd2';
    this.status = 'WAITING';
    this.countdown = 10;
    this.matchTime = 300;
    this.winner = '';
  }
}
defineTypes(GameState, {
  players: { map: PlayerState }, roomCode: 'string', mapId: 'string', status: 'string', countdown: 'number', matchTime: 'number', winner: 'string',
});

export class GameRoom extends Room {
  onCreate(options = {}) {
    this.maxClients = Math.max(2, Math.min(10, Number(options.maxPlayers) || 10));
    this.roomCode = String(options.roomCode || '').toUpperCase().slice(0, 6);
    this.mapId = options.mapId === 'training' ? 'training' : 'd2';
    this.isPrivate = Boolean(options.isPrivate);
    this.patchRate = 50;
    this.setState(new GameState());
    this.state.roomCode = this.roomCode;
    this.state.mapId = this.mapId;
    this.setMetadata({ roomCode: this.roomCode, mapId: this.mapId, isPrivate: this.isPrivate, maxPlayers: this.maxClients });
    this.onMessage('move', (client, movement) => this.updatePlayer(client, movement));
    this.onMessage('shoot', (client, shot) => this.applyShot(client, shot));
    this.onMessage('fire', (client) => this.broadcastFire(client));
    this.onMessage('rename', (client, nickname) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.nickname = this.sanitizeNickname(nickname);
    });
    this.clock.setInterval(() => this.updateMatchCountdown(), 1000);
  }

  onJoin(client, options) {
    const player = new PlayerState();
    player.nickname = this.sanitizeNickname(options?.nickname);
    this.spawnPlayer(player);
    this.state.players.set(client.sessionId, player);
    this.refreshMatchState();
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.refreshMatchState();
  }

  refreshMatchState() {
    if (this.state.status === 'FINISHED') return;
    if (this.clients.length < 2) {
      this.state.status = 'WAITING';
      this.state.countdown = 10;
      return;
    }
    if (this.state.status === 'WAITING') {
      this.state.status = 'STARTING';
      this.state.countdown = 10;
    }
  }

  updateMatchCountdown() {
    if (this.state.status === 'LIVE') {
      this.state.matchTime -= 1;
      this.updateRespawns();
      if (this.state.matchTime <= 0) this.finishMatch();
      return;
    }
    if (this.state.status === 'FINISHED') return;
    this.refreshMatchState();
    if (this.state.status === 'WAITING') return;
    this.state.countdown -= 1;
    if (this.state.countdown <= 0) {
      this.state.status = 'LIVE';
      this.state.countdown = 0;
      this.state.matchTime = 300;
    }
  }

  updatePlayer(client, movement) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.alive || !movement) return;
    const bounds = this.mapId === 'd2' ? { x: 52, z: 66 } : { x: 14, z: 11 };
    if (Number.isFinite(movement.x)) player.x = Math.max(-bounds.x, Math.min(bounds.x, movement.x));
    if (Number.isFinite(movement.y)) player.y = Math.max(0, Math.min(8, movement.y));
    if (Number.isFinite(movement.z)) player.z = Math.max(-bounds.z, Math.min(bounds.z, movement.z));
    if (Number.isFinite(movement.rotation)) player.rotation = movement.rotation;
    if (Number.isFinite(movement.pitch)) player.pitch = Math.max(-1.42, Math.min(1.42, movement.pitch));
  }

  applyShot(client, shot) {
    if (this.state.status !== 'LIVE' || !shot?.targetId || shot.targetId === client.sessionId) return;
    const attacker = this.state.players.get(client.sessionId);
    const target = this.state.players.get(shot.targetId);
    const now = Date.now();
    if (!attacker?.alive || !target?.alive || now - (client.userData?.lastShotAt || 0) < 80) return;
    if (!client.userData) client.userData = {};
    client.userData.lastShotAt = now;
    const distance = Math.hypot(attacker.x - target.x, attacker.y - target.y, attacker.z - target.z);
    if (distance > 36) return;
    target.health = Math.max(0, target.health - (shot.headshot ? 100 : 34));
    this.send(client, 'hit', { headshot: Boolean(shot.headshot) });
    if (target.health === 0) {
      target.alive = false; target.deaths += 1; target.respawnSeconds = 3;
      attacker.kills += 1;
      this.broadcast('kill', { killer: attacker.nickname, killerId: client.sessionId, victim: target.nickname, headshot: Boolean(shot.headshot) });
    }
  }

  broadcastFire(client) {
    if (this.state.status !== 'LIVE') return;
    const now = Date.now();
    if (!client.userData) client.userData = {};
    if (now - (client.userData.lastVisualShotAt || 0) < 80) return;
    client.userData.lastVisualShotAt = now;
    this.broadcast('fire', { sessionId: client.sessionId }, { except: client });
  }

  updateRespawns() {
    this.state.players.forEach((player) => {
      if (!player.alive && player.respawnSeconds > 0) {
        player.respawnSeconds -= 1;
        if (player.respawnSeconds === 0) this.spawnPlayer(player);
      }
    });
  }

  spawnPlayer(player) {
    const points = SPAWN_POINTS[this.mapId] || SPAWN_POINTS.d2;
    const [x, z] = points[Math.floor(Math.random() * points.length)];
    player.x = x; player.y = 0; player.z = z; player.health = 100; player.alive = true; player.respawnSeconds = 0;
  }

  finishMatch() {
    let winner = null;
    this.state.players.forEach((player) => { if (!winner || player.kills > winner.kills) winner = player; });
    this.state.status = 'FINISHED';
    this.state.matchTime = 0;
    this.state.winner = winner?.nickname || 'NO WINNER';
    this.broadcast('match-ended', { winner: this.state.winner });
  }

  sanitizeNickname(value) {
    const cleaned = String(value || 'Player').replace(/[^a-z0-9 _-]/gi, '').trim();
    return (cleaned || 'Player').slice(0, 16);
  }
}
