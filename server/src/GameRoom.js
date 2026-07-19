import { Room } from '@colyseus/core';
import { Schema, MapSchema, defineTypes } from '@colyseus/schema';

const SPAWN_POINTS = {
  d2: [
    // Kept deliberately small: these are the stable, central walkable areas
    // verified against the imported D2 mesh rather than decorative geometry.
    // x, floor y, z — sampled from the imported D2 collision mesh.
    [-35, 4.95, -30], [0, 1.65, -25], [35, 4.95, 5], [10, 4.95, -8],
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
    this.action = 'idle';
    this.weapon = 'rifle';
    this.health = 100;
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    this.respawnSeconds = 0;
  }
}
defineTypes(PlayerState, {
  nickname: 'string', x: 'number', y: 'number', z: 'number', rotation: 'number', pitch: 'number', action: 'string', weapon: 'string',
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
    this.spawnIndex = 0;
    this.patchRate = 50;
    this.setState(new GameState());
    this.state.roomCode = this.roomCode;
    this.state.mapId = this.mapId;
    this.setMetadata({ roomCode: this.roomCode, mapId: this.mapId, isPrivate: this.isPrivate, maxPlayers: this.maxClients });
    this.onMessage('move', (client, movement) => this.updatePlayer(client, movement));
    this.onMessage('void', (client) => this.recoverPlayer(client));
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
    if (['idle', 'walk', 'run', 'crouch', 'jump', 'fire', 'reload'].includes(movement.action)) player.action = movement.action;
    if (movement.weapon === 'rifle' || movement.weapon === 'shotgun') player.weapon = movement.weapon;
  }

  recoverPlayer(client) {
    const player = this.state.players.get(client.sessionId);
    const now = Date.now();
    if (!player?.alive || now - (client.userData?.lastVoidRecoveryAt || 0) < 1000) return;
    if (!client.userData) client.userData = {};
    client.userData.lastVoidRecoveryAt = now;
    this.spawnPlayer(player);
    this.send(client, 'recovered', { x: player.x, y: player.y, z: player.z });
  }

  applyShot(client, shot) {
    if (this.state.status !== 'LIVE' || !shot) return;
    const attacker = this.state.players.get(client.sessionId);
    const weapon = shot.weapon === 'shotgun' ? 'shotgun' : 'rifle';
    const impacts = Array.isArray(shot.impacts)
      ? shot.impacts.slice(0, weapon === 'shotgun' ? 8 : 1)
      : shot.targetId ? [{ targetId: shot.targetId, headshot: shot.headshot }] : [];
    const now = Date.now();
    const fireDelay = weapon === 'shotgun' ? 400 : 80;
    if (!attacker?.alive || !impacts.length || now - (client.userData?.lastShotAt || 0) < fireDelay) return;
    if (!client.userData) client.userData = {};
    client.userData.lastShotAt = now;
    let confirmedHit = false;
    for (const impact of impacts) {
      if (!impact?.targetId || impact.targetId === client.sessionId) continue;
      const target = this.state.players.get(impact.targetId);
      if (!target?.alive) continue;
      const distance = Math.hypot(attacker.x - target.x, attacker.y - target.y, attacker.z - target.z);
      if (distance > 36) continue;
      const headshot = Boolean(impact.headshot);
      const damage = weapon === 'shotgun' ? (headshot ? 24 : 15) : (headshot ? 100 : 34);
      target.health = Math.max(0, target.health - damage);
      confirmedHit = true;
      if (target.health === 0) {
        target.alive = false; target.action = 'idle'; target.deaths += 1; target.respawnSeconds = 3;
        attacker.kills += 1;
        this.broadcast('kill', { killer: attacker.nickname, killerId: client.sessionId, victim: target.nickname, headshot });
      }
    }
    if (confirmedHit) this.send(client, 'hit', { headshot: false });
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
    // Cycle the small, vetted set so respawns never appear to repeatedly use
    // one point because of random chance.
    const point = points[this.spawnIndex % points.length];
    this.spawnIndex += 1;
    const [x, spawnY = 0, z] = point.length === 3 ? point : [point[0], 0, point[1]];
    player.x = x; player.y = spawnY; player.z = z; player.action = 'idle'; player.weapon = 'rifle'; player.health = 100; player.alive = true; player.respawnSeconds = 0;
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
