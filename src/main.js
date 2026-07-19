import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Client, getStateCallbacks } from "colyseus.js";
import "./style.css";

const canvas = document.querySelector("#game-canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f1115");
scene.fog = new THREE.FogExp2("#0f1115", 0.024);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.005,
  180,
);
const player = new THREE.Group();
const pitch = new THREE.Group();
player.position.set(12, 0, 10);
pitch.add(camera);
player.add(pitch);
scene.add(player);
camera.position.set(0, 1.68, 0);

const ambient = new THREE.HemisphereLight("#b7d5f6", "#14221d", 1.45);
scene.add(ambient);
const key = new THREE.DirectionalLight("#d9ecff", 3.2);
key.position.set(-14, 22, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -35;
key.shadow.camera.right = 35;
key.shadow.camera.top = 35;
key.shadow.camera.bottom = -35;
scene.add(key);
const redLight = new THREE.PointLight("#ef4444", 20, 22, 2);
redLight.position.set(-10, 4, -8);
scene.add(redLight);
const blueLight = new THREE.PointLight("#2563eb", 18, 20, 2);
blueLight.position.set(12, 5, -5);
scene.add(blueLight);

const concrete = new THREE.MeshStandardMaterial({
  color: "#4a5055",
  roughness: 0.86,
  metalness: 0.05,
});
const dark = new THREE.MeshStandardMaterial({
  color: "#23282d",
  roughness: 0.82,
});
const trim = new THREE.MeshStandardMaterial({
  color: "#1b2633",
  roughness: 0.42,
  metalness: 0.5,
});
const emissiveBlue = new THREE.MeshStandardMaterial({
  color: "#2563eb",
  emissive: "#2563eb",
  emissiveIntensity: 2.3,
});
const emissiveRed = new THREE.MeshStandardMaterial({
  color: "#ef4444",
  emissive: "#ef4444",
  emissiveIntensity: 2.3,
});
const colliders = [];
const shootables = [];

function box(width, height, depth, x, y, z, material = concrete, solid = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (solid)
    colliders.push({
      minX: x - width / 2,
      maxX: x + width / 2,
      minZ: z - depth / 2,
      maxZ: z + depth / 2,
      height,
    });
  shootables.push(mesh);
  return mesh;
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), concrete);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
shootables.push(floor);

// Compact, readable deathmatch arena assembled from simple collision-ready blocks.
box(16, 5, 1, 0, 2.5, -12);
box(1, 5, 24, -15, 2.5, 0);
box(1, 5, 24, 15, 2.5, 0);
box(30, 5, 1, 0, 2.5, 12);
box(7, 3.5, 3, -7, 1.75, -4);
box(7, 3.5, 3, 7, 1.75, 3);
box(4, 6, 4, -6, 3, 6, dark);
box(4, 6, 4, 7, 3, -7, dark);
box(8, 1.1, 2.2, 0, 0.55, 8, dark);
box(2, 1.1, 8, -10, 0.55, 1, dark);
box(2, 1.1, 8, 10, 0.55, -1, dark);
box(24, 0.16, 0.24, 0, 3.8, -11.42, trim, false);
box(0.18, 3.2, 0.25, -14.42, 3.4, -4, emissiveRed, false);
box(0.18, 3.2, 0.25, 14.42, 3.4, -4, emissiveBlue, false);

for (let x = -10; x <= 10; x += 5) {
  for (let z = -8; z <= 8; z += 5) {
    const slab = box(1.65, 0.12, 0.05, x, 0.07, z, trim, false);
    slab.rotation.y = Math.PI / 2;
  }
}

const targetGroup = new THREE.Group();
scene.add(targetGroup);
for (const [x, z, mat] of [
  [-3, -8, emissiveRed],
  [3, -8, emissiveBlue],
  [0, 1, emissiveRed],
]) {
  const target = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 0.12, 24),
    mat,
  );
  target.rotation.x = Math.PI / 2;
  target.position.set(x, 2.4, z);
  target.castShadow = true;
  target.userData.isTarget = true;
  targetGroup.add(target);
  shootables.push(target);
  box(0.12, 2.25, 0.12, x, 1.1, z + 0.08, trim, false);
}

const keys = new Set();
const playerVelocity = new THREE.Vector3();
const horizontalVelocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
// A generous radius keeps the camera and weapon comfortably clear of arena geometry.
const playerRadius = 0.56;
const walkSpeed = 5.1;
const sprintSpeed = 8.1;
const crouchSpeed = 2.65;
const gravity = 25;
const jumpVelocity = 8.5;
const standHeight = 1.68;
const crouchHeight = 1.12;
let grounded = true;
let locked = false;
let crouching = false;
let bobTime = 0;
const intro = document.querySelector("#intro-screen");
const enterButton = document.querySelector("#enter-button");
const speedReadout = document.querySelector("#movement-readout strong");
const ammoCount = document.querySelector("#ammo-count");
const reloadStatus = document.querySelector("#reload-status");
const networkStatus = document.querySelector("#network-status");
const healthCount = document.querySelector('#health-count');
const matchTimer = document.querySelector('#match-timer');
const killFeed = document.querySelector('#kill-feed');
const matchResult = document.querySelector('#match-result');
const winnerName = document.querySelector('#winner-name');
const resultScores = document.querySelector('#result-scores');
const playAgainButton = document.querySelector('#play-again-button');
const roomOverlay = document.querySelector('#room-overlay');
const hitMarker = document.querySelector('#hit-marker');
const scoreboard = document.querySelector('#scoreboard');
const scoreboardRoom = document.querySelector('#scoreboard-room');
const scoreboardPlayers = document.querySelector('#scoreboard-players');
const lobby = document.querySelector('#lobby-screen');
const lobbyStatus = document.querySelector('#lobby-status');
const nicknameInput = document.querySelector('#nickname-input');
const roomCodeInput = document.querySelector('#room-code-input');
const quickMatchButton = document.querySelector('#quick-match-button');
const createRoomButton = document.querySelector('#create-room-button');
const joinRoomButton = document.querySelector('#join-room-button');

const remotePlayers = new Map();
let multiplayerRoom;
let connectingMatch;
let lastNetworkSync = 0;
let localAlive = true;
let hitMarkerUntil = 0;
let screenShake = 0;
let lastFootstepAt = 0;

const soundAssets = {
  fire: '/assets/audio/Rifle_Fire.wav',
  reload: '/assets/audio/Rifle_Reload.wav',
  hit: '/assets/audio/Hit_Marker.wav',
  death: '/assets/audio/Player_Death.wav',
  footsteps: ['/assets/audio/Footstep_01.wav', '/assets/audio/Footstep_02.wav'],
};

function playGameSound(name, { volume = 0.35, playbackRate = 1 } = {}) {
  const source = name === 'footsteps'
    ? soundAssets.footsteps[Math.floor(Math.random() * soundAssets.footsteps.length)]
    : soundAssets[name];
  if (!source) return;
  const sound = new Audio(source);
  sound.volume = volume;
  sound.playbackRate = playbackRate;
  sound.play().catch(() => {});
}

function createRemotePlayer(nickname) {
  const avatar = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.92, 5, 10),
    new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.65 }),
  );
  body.position.y = 0.78; body.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: '#b7d5f6' }));
  visor.position.set(0, 1.08, -0.31);
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.66), new THREE.MeshStandardMaterial({ color: '#202832', roughness: 0.45, metalness: 0.7 }));
  rifle.position.set(0.27, 0.68, -0.3); rifle.rotation.x = -0.18;
  const remoteMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: '#fff1a8' }));
  remoteMuzzle.position.set(0.27, 0.68, -0.65); remoteMuzzle.visible = false;
  avatar.add(body, visor, rifle, remoteMuzzle);
  avatar.userData.target = new THREE.Vector3();
  avatar.userData.rotation = 0;
  avatar.userData.nickname = nickname;
  avatar.userData.muzzle = remoteMuzzle;
  avatar.userData.shotUntil = 0;
  scene.add(avatar);
  return avatar;
}

function updateCombatHud() {
  if (!multiplayerRoom?.state?.players) return;
  const state = multiplayerRoom.state;
  const local = state.players.get(multiplayerRoom.sessionId);
  if (local) {
    const justDied = localAlive && !local.alive;
    const justRespawned = !localAlive && local.alive;
    localAlive = local.alive;
    healthCount.textContent = local.alive ? local.health : `R${local.respawnSeconds}`;
    if (justDied) playGameSound('death', { volume: 0.42 });
    if (justRespawned) {
      player.position.set(local.x, local.y, local.z);
      playerVelocity.set(0, 0, 0); horizontalVelocity.set(0, 0, 0);
    }
  }
  if (state.status === 'WAITING') matchTimer.textContent = 'WAITING FOR PLAYER';
  else if (state.status === 'STARTING') matchTimer.textContent = `STARTS ${state.countdown}`;
  else {
    const minutes = Math.floor(Math.max(0, state.matchTime || 0) / 60);
    const seconds = Math.max(0, state.matchTime || 0) % 60;
    matchTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  if (state.status === 'FINISHED') showMatchResult(state.winner);
}

function showMatchResult(winner) {
  if (!multiplayerRoom?.state?.players) return;
  winnerName.textContent = winner || 'NO WINNER';
  const players = [...multiplayerRoom.state.players.values()].sort((a, b) => b.kills - a.kills);
  resultScores.innerHTML = players.map((remote, index) => `<p><span>${index + 1}. ${remote.nickname}</span><b>${remote.kills} K / ${remote.deaths} D</b></p>`).join('');
  matchResult.hidden = false;
}

function addKillFeed(message) {
  const item = document.createElement('p');
  item.innerHTML = `<b>${message.killer}</b> <i>${message.headshot ? 'HEADSHOT' : 'ELIMINATED'}</i> ${message.victim}`;
  killFeed.prepend(item);
  if (message.killerId === multiplayerRoom?.sessionId) {
    reserveAmmo = Math.min(180, reserveAmmo + 30);
    updateAmmo();
  }
  window.setTimeout(() => item.remove(), 4500);
}

function renderScoreboard() {
  if (!multiplayerRoom?.state?.players) return;
  const rows = [...multiplayerRoom.state.players.entries()]
    .sort(([, a], [, b]) => b.kills - a.kills)
    .map(([sessionId, remote]) => `<div class="scoreboard__row${sessionId === multiplayerRoom.sessionId ? ' scoreboard__row--self' : ''}"><span>${remote.nickname}</span><span>${remote.kills}</span><span>${remote.deaths}</span><span>${remote.alive ? remote.health : 'RESPAWN'}</span></div>`)
    .join('');
  scoreboardPlayers.innerHTML = '<div class="scoreboard__row"><span>PLAYER</span><span>KILLS</span><span>DEATHS</span><span>STATUS</span></div>' + rows;
}

function playFootstep() {
  playGameSound('footsteps', { volume: 0.12, playbackRate: 0.96 + Math.random() * 0.08 });
}

function connectToMatch(options = {}) {
  if (multiplayerRoom) return Promise.resolve(multiplayerRoom);
  if (connectingMatch) return connectingMatch;
  connectingMatch = startMatchConnection(options).finally(() => { connectingMatch = undefined; });
  return connectingMatch;
}

async function startMatchConnection(options = {}) {
  const savedNickname = localStorage.getItem('kstrike-nickname');
  const nickname = nicknameInput.value.trim() || savedNickname || `Player-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('kstrike-nickname', nickname);
  nicknameInput.value = nickname;
  const endpoint = import.meta.env.VITE_COLYSEUS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
  const client = new Client(endpoint);
  networkStatus.textContent = 'CONNECTING // TRAINING';
  lobbyStatus.textContent = 'CONNECTING TO MATCH SERVER...';
  const roomOptions = { nickname, isPrivate: Boolean(options.isPrivate), roomCode: options.roomCode || '', maxPlayers: options.maxPlayers || 10 };
  try {
    const room = await (options.create ? client.create('deathmatch', roomOptions) : options.join ? client.join('deathmatch', roomOptions) : client.joinOrCreate('deathmatch', roomOptions));
    multiplayerRoom = room;
    networkStatus.textContent = `ONLINE // ${room.roomId.slice(0, 5).toUpperCase()}`;
    const $ = getStateCallbacks(room);
    let playerCallbacksBound = false;
    const bindPlayerCallbacks = () => {
      if (playerCallbacksBound || !room.state?.players) return;
      playerCallbacksBound = true;
      $(room.state).players.onAdd((remote, sessionId) => {
        if (sessionId === room.sessionId) {
          $(remote).onChange(() => updateCombatHud());
          updateCombatHud();
          return;
        }
        const avatar = createRemotePlayer(remote.nickname);
        avatar.userData.sessionId = sessionId;
        remotePlayers.set(sessionId, avatar);
        $(remote).onChange(() => {
          avatar.userData.target.set(remote.x, remote.y, remote.z);
          avatar.userData.rotation = remote.rotation;
          avatar.visible = remote.alive;
        });
        avatar.userData.target.set(remote.x, remote.y, remote.z);
        avatar.userData.rotation = remote.rotation;
        avatar.visible = remote.alive;
      }, true);
      $(room.state).players.onRemove((remote, sessionId) => {
        const avatar = remotePlayers.get(sessionId);
        if (avatar) { scene.remove(avatar); remotePlayers.delete(sessionId); }
      });
    };
    room.onStateChange(() => {
      bindPlayerCallbacks();
      updateCombatHud();
    });
    bindPlayerCallbacks();
    room.onLeave(() => {
      multiplayerRoom = undefined;
      networkStatus.textContent = 'OFFLINE // TRAINING';
      remotePlayers.forEach((avatar) => scene.remove(avatar));
      remotePlayers.clear();
    });
    room.onMessage('kill', addKillFeed);
    room.onMessage('hit', () => {
      hitMarkerUntil = performance.now() + 120;
      screenShake = 1;
      playGameSound('hit', { volume: 0.24 });
    });
    room.onMessage('match-ended', ({ winner }) => showMatchResult(winner));
    room.onMessage('fire', ({ sessionId }) => {
      const avatar = remotePlayers.get(sessionId);
      if (avatar) {
        avatar.userData.shotUntil = performance.now() + 90;
        playGameSound('fire', { volume: 0.1 });
      }
    });
    // For newly created private rooms, use the requested code immediately.
    // State hydration can lag the join response by one network tick.
    const roomLabel = options.roomCode || room.state?.roomCode;
    roomOverlay.textContent = roomLabel ? `ROOM // ${roomLabel}` : `ROOM // ${room.roomId.slice(0, 6).toUpperCase()}`;
    scoreboardRoom.textContent = roomOverlay.textContent;
    intro.querySelector('.eyebrow').textContent = roomLabel
      ? `PRIVATE ROOM CODE // ${roomLabel}`
      : `PUBLIC MATCH // ${room.roomId.slice(0, 6).toUpperCase()}`;
    intro.querySelector('.intro__copy').innerHTML = 'Room joined. Enter when you are ready.<br />Waiting players will appear in the arena.';
    enterButton.innerHTML = 'ENTER ARENA <span>&gt;</span>';
    lobby.hidden = true;
    intro.hidden = false;
    return room;
  } catch (error) {
    networkStatus.textContent = 'OFFLINE // TRAINING';
    const detail = error?.message || 'CONNECTION FAILED';
    lobbyStatus.textContent = `JOIN FAILED // ${detail.toUpperCase()}`;
    console.error('KStrike room join failed:', error);
    throw error;
  }
}

function generateRoomCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
quickMatchButton.addEventListener('click', () => connectToMatch().catch(() => {}));
createRoomButton.addEventListener('click', () => {
  const roomCode = generateRoomCode();
  roomCodeInput.value = roomCode;
  connectToMatch({ create: true, isPrivate: true, roomCode, maxPlayers: 10 }).catch(() => {});
});
joinRoomButton.addEventListener('click', () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!roomCode) { lobbyStatus.textContent = 'ENTER A ROOM CODE'; return; }
  connectToMatch({ join: true, isPrivate: true, roomCode }).catch(() => {});
});

function syncMultiplayer(now) {
  if (!multiplayerRoom || now - lastNetworkSync < 50) return;
  lastNetworkSync = now;
  multiplayerRoom.send('move', {
    x: player.position.x, y: player.position.y, z: player.position.z,
    rotation: player.rotation.y, pitch: pitch.rotation.x,
  });
}

function updateRemotePlayers(delta) {
  remotePlayers.forEach((avatar) => {
    avatar.position.lerp(avatar.userData.target, 1 - Math.exp(-12 * delta));
    avatar.rotation.y = THREE.MathUtils.damp(avatar.rotation.y, avatar.userData.rotation, 14, delta);
    avatar.userData.muzzle.visible = performance.now() < avatar.userData.shotUntil;
  });
}
playAgainButton.addEventListener('click', () => { matchResult.hidden = true; });

// An intentionally lightweight viewmodel: no downloaded assets are needed for the first rifle.
const weapon = new THREE.Group();
const fallbackWeapon = new THREE.Group();
weapon.add(fallbackWeapon);
const weaponBody = new THREE.MeshStandardMaterial({
  color: "#202832",
  roughness: 0.45,
  metalness: 0.7,
});
const weaponAccent = new THREE.MeshStandardMaterial({
  color: "#2563eb",
  emissive: "#2563eb",
  emissiveIntensity: 0.8,
  metalness: 0.5,
});
function weaponPart(size, position, material = weaponBody) {
  const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  part.position.set(...position);
  fallbackWeapon.add(part);
  return part;
}
weaponPart([0.19, 0.15, 0.6], [0.16, -0.1, -0.38]);
weaponPart([0.07, 0.07, 0.65], [0.16, -0.05, -0.97]);
weaponPart([0.1, 0.16, 0.25], [0.16, -0.22, -0.18], weaponAccent);
weaponPart([0.12, 0.23, 0.12], [0.15, -0.28, -0.43]);
weaponPart([0.09, 0.07, 0.28], [0.16, 0.04, -0.24], weaponAccent);
const muzzleFlash = new THREE.Mesh(
  new THREE.ConeGeometry(0.075, 0.2, 8),
  new THREE.MeshBasicMaterial({ color: "#fff6b0" }),
);
// Fallback placement; the custom rifle path below reparents this to its measured barrel tip.
muzzleFlash.rotation.set(Math.PI / 2, 0, 0);
muzzleFlash.position.set(0.16, -0.05, -1.34);
muzzleFlash.visible = false;
weapon.add(muzzleFlash);
const muzzleBasePosition = muzzleFlash.position.clone();
const muzzleLight = new THREE.PointLight("#ffb347", 0, 5, 2);
muzzleLight.position.copy(muzzleFlash.position);
weapon.add(muzzleLight);
weapon.position.set(0.42, -0.34, -0.58);
weapon.rotation.set(-0.08, -0.16, 0);
camera.add(weapon);
// Fine-tune the custom rifle effect here: X = right/left, Y = up/down, Z = toward/away from camera.
const muzzleOffset = new THREE.Vector3(0, -0.1, -1.1);

const weaponModel = new THREE.Group();
weaponModel.visible = false;
weapon.add(weaponModel);
new GLTFLoader().load(
  "/assets/weapons/near_future_assault_rifle.glb",
  (gltf) => {
    const rifle = gltf.scene;
    // This model was authored upright on Y. Rotate it into a conventional lower-right FPS pose.
    rifle.rotation.z = 0;
    rifle.scale.setScalar(0.42);
    rifle.position.set(0.02, -0.2, -0.76);
    rifle.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.frustumCulled = false;
      }
    });
    const rifleMesh = rifle.getObjectByName("Cube.002_Weapon_Material_0");
    weaponModel.add(rifle);
    weapon.updateMatrixWorld(true);
    if (rifleMesh) {
      // Read the tip in mesh space, then convert it to the stable weapon rig coordinate system.
      const muzzlePoint = rifleMesh.localToWorld(
        new THREE.Vector3(0.0517, 1.9768, 0.3014),
      );
      weapon.worldToLocal(muzzlePoint);
      weapon.add(muzzleFlash);
      muzzleBasePosition.copy(muzzlePoint);
      muzzleFlash.scale.setScalar(1);
      muzzleFlash.add(muzzleLight);
      muzzleLight.position.set(0, 0, 0);
    }
    weaponModel.visible = true;
    fallbackWeapon.visible = false;
  },
  undefined,
  () => {
    console.warn(
      "Custom rifle model could not be loaded; using the built-in fallback.",
    );
  },
);

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();
const decals = [];
let magazine = 30;
let reserveAmmo = 90;
let reloading = false;
let reloadCompleteAt = 0;
let triggerHeld = false;
let lastShotAt = 0;
let weaponKick = 0;
let muzzleUntil = 0;

function updateAmmo() {
  ammoCount.innerHTML = `${magazine} <i>/</i> ${reserveAmmo}`;
}
function playWeaponSound(reload = false) {
  playGameSound(reload ? 'reload' : 'fire', { volume: reload ? 0.42 : 0.3 });
}
function startReload(now = performance.now()) {
  if (reloading || magazine === 30 || reserveAmmo === 0) return;
  reloading = true;
  reloadCompleteAt = now + 1200;
  reloadStatus.textContent = "RELOADING";
  playWeaponSound(true);
}
function addDecal(hit) {
  if (!hit.face) return;
  const decal = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 10),
    new THREE.MeshBasicMaterial({ color: "#14171b", side: THREE.DoubleSide }),
  );
  normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  const normal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
  decal.position.copy(hit.point).addScaledVector(normal, 0.006);
  decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  scene.add(decal);
  decals.push({ mesh: decal, expiresAt: performance.now() + 9000 });
  if (decals.length > 28) scene.remove(decals.shift().mesh);
}
function fire(now) {
  if (!locked || !localAlive || reloading || now - lastShotAt < 92) return;
  if (magazine === 0) {
    startReload(now);
    return;
  }
  lastShotAt = now;
  magazine -= 1;
  updateAmmo();
  playWeaponSound();
  weaponKick = 1;
  muzzleUntil = now + 80;
  muzzleFlash.visible = true;
  multiplayerRoom?.send('fire');
  pitch.rotation.x = THREE.MathUtils.clamp(
    pitch.rotation.x + 0.009,
    -1.42,
    1.42,
  );
  camera.updateMatrixWorld();
  raycaster.setFromCamera(new THREE.Vector2(), camera);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const playerHit = raycaster.intersectObjects([...remotePlayers.values()], true)[0];
  if (playerHit && (!hit || playerHit.distance < hit.distance)) {
    let owner = playerHit.object;
    while (owner && !owner.userData.sessionId) owner = owner.parent;
    if (owner?.userData.sessionId) {
      multiplayerRoom?.send('shoot', {
        targetId: owner.userData.sessionId,
        headshot: playerHit.point.y - owner.position.y > 1.15,
      });
      return;
    }
  }
  if (!hit) return;
  addDecal(hit);
  if (hit.object.userData.isTarget) hit.object.userData.hitUntil = now + 110;
}
function updateWeapon(now, delta) {
  // Apply the editable offset every frame, rather than only when the glTF first loads.
  muzzleFlash.position.copy(muzzleBasePosition).add(muzzleOffset);
  if (triggerHeld) fire(now);
  if (reloading && now >= reloadCompleteAt) {
    const loaded = Math.min(30 - magazine, reserveAmmo);
    magazine += loaded;
    reserveAmmo -= loaded;
    reloading = false;
    reloadStatus.textContent = "";
    updateAmmo();
  }
  weaponKick = THREE.MathUtils.damp(weaponKick, 0, 16, delta);
  weapon.position.z = -0.58 + weaponKick * 0.085;
  weapon.rotation.x = -0.08 - weaponKick * 0.13;
  screenShake = THREE.MathUtils.damp(screenShake, 0, 18, delta);
  camera.position.x = Math.sin(now * 0.08) * screenShake * 0.012;
  muzzleFlash.visible = now < muzzleUntil;
  muzzleLight.intensity = muzzleFlash.visible ? 5 : 0;
  for (let index = decals.length - 1; index >= 0; index -= 1)
    if (now >= decals[index].expiresAt) {
      scene.remove(decals[index].mesh);
      decals.splice(index, 1);
    }
}

function blocksPosition(x, z) {
  return colliders.some((collider) => {
    const closestX = THREE.MathUtils.clamp(x, collider.minX, collider.maxX);
    const closestZ = THREE.MathUtils.clamp(z, collider.minZ, collider.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    return dx * dx + dz * dz < playerRadius * playerRadius;
  });
}

function moveWithCollision(delta) {
  // Sweep in short increments so a slow frame cannot carry the player through a thin wall.
  const distance = Math.hypot(
    horizontalVelocity.x * delta,
    horizontalVelocity.z * delta,
  );
  const steps = Math.max(1, Math.ceil(distance / (playerRadius * 0.45)));
  const stepDelta = delta / steps;
  for (let step = 0; step < steps; step += 1) {
    const nextX = player.position.x + horizontalVelocity.x * stepDelta;
    const nextZ = player.position.z + horizontalVelocity.z * stepDelta;
    if (!blocksPosition(nextX, player.position.z)) player.position.x = nextX;
    else horizontalVelocity.x = 0;
    if (!blocksPosition(player.position.x, nextZ)) player.position.z = nextZ;
    else horizontalVelocity.z = 0;
  }
}

function movePlayer(delta) {
  direction.set(0, 0, 0);
  if (locked && keys.has("KeyW")) direction.z -= 1;
  if (locked && keys.has("KeyS")) direction.z += 1;
  if (locked && keys.has("KeyA")) direction.x -= 1;
  if (locked && keys.has("KeyD")) direction.x += 1;
  const hasInput = direction.lengthSq() > 0;
  crouching = locked && (
    keys.has("ControlLeft") || keys.has("ControlRight") || keys.has("KeyC")
  );
  const sprinting =
    !crouching && (keys.has("ShiftLeft") || keys.has("ShiftRight"));
  let targetSpeed = crouching
    ? crouchSpeed
    : sprinting
      ? sprintSpeed
      : walkSpeed;
  const targetVelocity = new THREE.Vector3();
  if (hasInput) {
    direction.normalize().applyAxisAngle(up, player.rotation.y);
    targetVelocity.copy(direction).multiplyScalar(targetSpeed);
  }
  const response = hasInput ? 15 : 7;
  horizontalVelocity.x = THREE.MathUtils.damp(
    horizontalVelocity.x,
    targetVelocity.x,
    response,
    delta,
  );
  horizontalVelocity.z = THREE.MathUtils.damp(
    horizontalVelocity.z,
    targetVelocity.z,
    response,
    delta,
  );
  moveWithCollision(delta);
  if (locked && grounded && keys.has("Space") && !crouching) {
    playerVelocity.y = jumpVelocity;
    grounded = false;
  }
  playerVelocity.y -= gravity * delta;
  player.position.y += playerVelocity.y * delta;
  if (player.position.y <= 0) {
    player.position.y = 0;
    playerVelocity.y = 0;
    grounded = true;
  }
  const horizontalSpeed = Math.hypot(
    horizontalVelocity.x,
    horizontalVelocity.z,
  );
  if (grounded && horizontalSpeed > 0.1)
    bobTime += delta * (sprinting ? 13 : crouching ? 7 : 10);
  if (locked && grounded && horizontalSpeed > 1 && performance.now() - lastFootstepAt > (sprinting ? 300 : 430)) {
    lastFootstepAt = performance.now();
    playFootstep();
  }
  const bobAmount = grounded
    ? Math.sin(bobTime) * Math.min(horizontalSpeed / sprintSpeed, 1) * 0.026
    : 0;
  const targetHeight = crouching ? crouchHeight : standHeight;
  camera.position.y = THREE.MathUtils.damp(
    camera.position.y,
    targetHeight + bobAmount,
    18,
    delta,
  );
  camera.fov = THREE.MathUtils.damp(
    camera.fov,
    sprinting && hasInput ? 67 : 62,
    10,
    delta,
  );
  camera.updateProjectionMatrix();
  speedReadout.textContent = horizontalSpeed.toFixed(1);
}

function lockArena() {
  connectToMatch();
  canvas.requestPointerLock();
}
enterButton.addEventListener("click", lockArena);
canvas.addEventListener("click", () => {
  if (!locked) lockArena();
});
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  intro.classList.toggle("intro--dismissed", locked);
  if (!locked) {
    triggerHeld = false;
    intro.hidden = false;
    enterButton.innerHTML = "RESUME ARENA <span>↗</span>";
  }
});
document.addEventListener("mousemove", (event) => {
  if (!locked) return;
  player.rotation.y -= event.movementX * 0.0021;
  pitch.rotation.x = THREE.MathUtils.clamp(
    pitch.rotation.x - event.movementY * 0.0021,
    -1.42,
    1.42,
  );
});
window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "Tab"].includes(event.code))
    event.preventDefault();
  keys.add(event.code);
  if (event.code === "KeyR" && !event.repeat) startReload();
  if (event.code === 'Tab') { renderScoreboard(); scoreboard.hidden = false; }
});
window.addEventListener("keyup", (event) => { keys.delete(event.code); if (event.code === 'Tab') scoreboard.hidden = true; });
window.addEventListener("blur", () => keys.clear());
window.addEventListener("mousedown", (event) => {
  if (event.button === 0) triggerHeld = true;
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 0) triggerHeld = false;
});
window.addEventListener("contextmenu", (event) => event.preventDefault());

const clock = new THREE.Clock();
function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const t = clock.elapsedTime;
  targetGroup.children.forEach((child, index) => {
    if (child.geometry.type !== "CylinderGeometry") return;
    child.position.y = 2.4 + Math.sin(t * 1.45 + index) * 0.12;
    child.scale.setScalar(now < child.userData.hitUntil ? 1.12 : 1);
  });
  movePlayer(delta);
  updateWeapon(now, delta);
  syncMultiplayer(now);
  updateRemotePlayers(delta);
  updateCombatHud();
  hitMarker.classList.toggle('hit-marker--active', now < hitMarkerUntil);
  if (!scoreboard.hidden) renderScoreboard();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.setTimeout(() => {
  document.querySelector("#loading-screen").classList.add("loading--done");
  nicknameInput.value = localStorage.getItem('kstrike-nickname') || '';
  lobby.hidden = false;
}, 700);
