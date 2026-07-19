import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Client, getStateCallbacks } from "colyseus.js";
import { MeshBVH, StaticGeometryGenerator } from 'three-mesh-bvh';
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
const arenaGroup = new THREE.Group();
scene.add(arenaGroup);
let targetGroup;
let d2MapModel;
let d2MapLoaded = false;
let d2CollisionBVH;
const D2_MODEL_SCALE = 1.5;
let initialD2LoadSettled = false;
let minimumLoadingTimeElapsed = false;

function finishInitialLoadingWhenReady() {
  const needsD2 = selectedMapId === 'd2';
  if (!minimumLoadingTimeElapsed || (needsD2 && !initialD2LoadSettled)) return;
  document.querySelector('#loading-screen').classList.add('loading--done');
  nicknameInput.value = localStorage.getItem('kstrike-nickname') || '';
  lobby.hidden = false;
}

function clearArena() {
  colliders.length = 0;
  shootables.length = 0;
  arenaGroup.clear();
  targetGroup = new THREE.Group();
  arenaGroup.add(targetGroup);
}

function box(width, height, depth, x, y, z, material = concrete, solid = true) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  arenaGroup.add(mesh);
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

function buildTrainingArena() {
clearArena();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), concrete);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
arenaGroup.add(floor);
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
}

const sand = new THREE.MeshStandardMaterial({ color: '#b58b53', roughness: 0.94 });
const sandstone = new THREE.MeshStandardMaterial({ color: '#c49a60', roughness: 0.88 });
const sunbaked = new THREE.MeshStandardMaterial({ color: '#785333', roughness: 0.91 });
const canopy = new THREE.MeshStandardMaterial({ color: '#76573a', roughness: 0.8, metalness: 0.08 });

function buildD2Arena() {
  clearArena();
  scene.background.set('#c48b58');
  scene.fog.color.set('#c48b58');
  scene.fog.density = 0.018;
  ambient.color.set('#ffe2ae');
  ambient.groundColor.set('#60412a');
  key.color.set('#fff0c8');
  key.intensity = 3.8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), sand);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  arenaGroup.add(floor);
  shootables.push(floor);
  // D2 blockout: T Spawn -> Long/Mid, with Catwalk and tunnels reaching A and B.
  // Outer playable boundary.
  box(70, 6, 1, 0, 3, 31, sandstone); box(70, 6, 1, 0, 3, -31, sandstone);
  box(1, 6, 62, -35, 3, 0, sandstone); box(1, 6, 62, 35, 3, 0, sandstone);
  // T Spawn (north): exits south to Mid and east to Long.
  box(8, 4.5, 1, -11, 2.25, 25, sandstone); box(8, 4.5, 1, 11, 2.25, 25, sandstone);
  box(1, 4.5, 11, -15, 2.25, 25, sandstone); box(1, 4.5, 4, 15, 2.25, 28.5, sandstone);
  box(1, 4.5, 3, 15, 2.25, 20.5, sandstone);
  // Mid: wide north-south central lane, with door-like cover and west Catwalk approach.
  box(1, 4.5, 24, -7, 2.25, 12, sandstone); box(1, 4.5, 24, 7, 2.25, 12, sandstone);
  box(4.2, 3.3, 0.8, 0, 1.65, 18.3, sunbaked);
  box(2.3, 2.4, 2, -1.8, 1.2, 14.5, canopy);
  // Long A: eastern corridor and corner/pit leading into A site.
  box(1, 4.5, 29, 19, 2.25, 10.5, sandstone); box(1, 4.5, 20, 29, 2.25, 15, sandstone);
  box(8, 4.5, 1, 24, 2.25, 25, sandstone); box(6, 4.5, 1, 32, 2.25, 5, sandstone);
  box(5, 2.8, 3.5, 24, 1.4, 13, new THREE.MeshStandardMaterial({ color: '#335e77', roughness: 0.7 }));
  box(4, 2.2, 4, 26.5, 1.1, 0, canopy);
  // Catwalk / Short A: west raised route from Mid into A.
  box(1, 3.5, 16, -13, 1.75, 5, sandstone); box(1, 3.5, 12, -5, 1.75, 1, sandstone);
  box(8, 1.25, 3, -9, 0.62, 4, sunbaked);
  box(1.7, 0.55, 3, -5.4, 0.27, 1.5, sunbaked);
  // A Site: open southern-east plaza, Long and Catwalk entries, cover and elevated box.
  box(1, 4.8, 17, 11, 2.4, -6.5, sandstone); box(1, 4.8, 17, 32, 2.4, -6.5, sandstone);
  box(21, 4.8, 1, 21.5, 2.4, -15, sandstone); box(9, 4.8, 1, 15.5, 2.4, 2, sandstone);
  box(2.5, 2.2, 4, 16, 1.1, -4, canopy); box(4.2, 1.5, 3.2, 24, 0.75, -7, sunbaked);
  box(2.5, 1.15, 2.5, 27.5, 0.57, -2.5, canopy);
  // CT Spawn: south-east room joining A and the tunnel connector.
  box(11, 4.5, 1, 22, 2.25, -24, sandstone); box(1, 4.5, 12, 28, 2.25, -19, sandstone);
  box(1, 4.5, 7, 16, 2.25, -21.5, sandstone); box(4, 4.5, 1, 18, 2.25, -14, sandstone);
  // B tunnels: two narrow, bent parallel runs from upper Mid down to B.
  box(1, 4.2, 27, -26, 2.1, 2.5, sandstone); box(1, 4.2, 17, -18, 2.1, 7.5, sandstone);
  box(5, 4.2, 1, -22, 2.1, 16, sandstone); box(4, 4.2, 1, -22, 2.1, -11, sandstone);
  box(1.2, 2.2, 5, -22, 1.1, 7, canopy); box(1.5, 1.3, 2.4, -24, 0.65, 1.5, sunbaked);
  // B Site: enclosed south-west court with platform, window-side boxes, and CT doors.
  box(1, 4.8, 16, -33, 2.4, -16, sandstone); box(1, 4.8, 16, -15, 2.4, -16, sandstone);
  box(18, 4.8, 1, -24, 2.4, -24, sandstone); box(7, 4.8, 1, -29.5, 2.4, -8, sandstone);
  box(5, 1.35, 3.5, -28, 0.67, -18, sunbaked); box(2.4, 2.1, 2.4, -20, 1.05, -18, canopy);
  box(3, 1, 2, -23, 0.5, -12.5, canopy);
  showD2MapModel();
}

function showD2MapModel() {
  if (!d2MapLoaded || !d2MapModel) return;
  // The lightweight blockout is only a load fallback. Raycasts must target the visible map.
  arenaGroup.children.forEach((child) => { if (child !== targetGroup) child.visible = false; });
  arenaGroup.add(d2MapModel);
  d2MapModel.visible = true;
  shootables.length = 0;
  d2MapModel.traverse((node) => { if (node.isMesh) shootables.push(node); });
}

function loadD2MapModel() {
  new GLTFLoader().load(
    '/assets/maps/de_dust_2.glb',
    (gltf) => {
      d2MapModel = gltf.scene;
      d2MapModel.scale.setScalar(D2_MODEL_SCALE);
      d2MapModel.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(d2MapModel);
      const center = bounds.getCenter(new THREE.Vector3());
      d2MapModel.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      d2MapModel.updateMatrixWorld(true);
      d2MapModel.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      const generator = new StaticGeometryGenerator(d2MapModel);
      generator.attributes = ['position'];
      generator.applyWorldTransforms = true;
      d2CollisionBVH = new MeshBVH(generator.generate(), { maxLeafSize: 16 });
      // The GLB collider replaces the temporary D2 blockout boxes completely.
      colliders.length = 0;
      d2MapLoaded = true;
      initialD2LoadSettled = true;
      if (activeMapId === 'd2') {
        showD2MapModel();
        snapPlayerToMapGround();
      }
      finishInitialLoadingWhenReady();
    },
    undefined,
    (error) => {
      initialD2LoadSettled = true;
      console.warn('D2 map model failed to load; using the blockout fallback.', error);
      finishInitialLoadingWhenReady();
    },
  );
}

function applyArenaMap(mapId) {
  if (mapId === 'training') {
    scene.background.set('#0f1115');
    scene.fog.color.set('#0f1115');
    scene.fog.density = 0.024;
    ambient.color.set('#b7d5f6');
    ambient.groundColor.set('#14221d');
    key.color.set('#d9ecff');
    key.intensity = 3.2;
    buildTrainingArena();
    return;
  }
  buildD2Arena();
}

applyArenaMap('d2');
loadD2MapModel();

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
const exitMatchButton = document.querySelector('#exit-match-button');
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
const mapSelect = document.querySelector('#map-select');
const mapButtons = [...mapSelect.querySelectorAll('[data-map]')];
const killStreakElement = document.querySelector('#kill-streak');

const remotePlayers = new Map();
let multiplayerRoom;
let connectingMatch;
let lastNetworkSync = 0;
let localAlive = true;
let hitMarkerUntil = 0;
let screenShake = 0;
let lastFootstepAt = 0;
let selectedMapId = localStorage.getItem('kstrike-map') || 'd2';
let activeMapId = 'd2';
let killStreak = 0;
let localPositionInitialized = false;

const streakCards = [
  { title: 'FIRST BLOOD', detail: '1 ELIMINATION' },
  { title: 'DOUBLE TAP', detail: '2 ELIMINATIONS' },
  { title: 'ON FIRE', detail: '3 ELIMINATIONS' },
  { title: 'RAMPAGE', detail: '4 ELIMINATIONS' },
  { title: 'UNSTOPPABLE', detail: '5 ELIMINATIONS' },
];

const mapPresentation = {
  d2: { code: 'D2', title: 'DESERT<br /><em>DISTRICT</em>', copy: 'A fast, lightweight browser FPS.<br />D2 deathmatch is online.' },
  training: { code: 'ARENA', title: 'TRAINING<br /><em>YARD</em>', copy: 'A fast, lightweight browser FPS.<br />Movement training is online.' },
};

function updateMapPresentation(mapId) {
  const presentation = mapPresentation[mapId] || mapPresentation.d2;
  intro.querySelector('.eyebrow').textContent = `KSTRIKE / ${presentation.code}`;
  intro.querySelector('h1').innerHTML = presentation.title;
  intro.querySelector('.intro__copy').innerHTML = presentation.copy;
  document.title = `KStrike — ${presentation.code}`;
}

function updateKillStreak() {
  killStreakElement.hidden = killStreak === 0;
  const firstVisibleKill = Math.max(0, killStreak - 6);
  killStreakElement.innerHTML = Array.from({ length: killStreak - firstVisibleKill }, (_, offset) => {
    const killNumber = firstVisibleKill + offset + 1;
    const card = streakCards[Math.min(killNumber - 1, streakCards.length - 1)];
    const current = killNumber === killStreak;
    return `<div class="streak-card streak-card--active${current ? ' streak-card--current' : ''}"><b>${card.title}</b><span>${card.detail}</span><i>${String(killNumber).padStart(2, '0')}</i></div>`;
  }).join('');
}

function selectMap(mapId) {
  selectedMapId = mapId === 'training' ? 'training' : 'd2';
  localStorage.setItem('kstrike-map', selectedMapId);
  mapButtons.forEach((button) => button.classList.toggle('map-card--selected', button.dataset.map === selectedMapId));
  updateMapPresentation(selectedMapId);
  if (!multiplayerRoom && activeMapId !== selectedMapId) {
    activeMapId = selectedMapId;
    applyArenaMap(activeMapId);
  }
}

selectMap(selectedMapId);
updateKillStreak();

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
    if (justDied) {
      killStreak = 0;
      updateKillStreak();
      playGameSound('death', { volume: 0.42 });
    }
    if (justRespawned) {
      player.position.set(local.x, local.y, local.z);
      playerVelocity.set(0, 0, 0); horizontalVelocity.set(0, 0, 0);
      snapPlayerToMapGround();
    }
    if (!localPositionInitialized) {
      player.position.set(local.x, local.y, local.z);
      playerVelocity.set(0, 0, 0); horizontalVelocity.set(0, 0, 0);
      snapPlayerToMapGround();
      localPositionInitialized = true;
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
    killStreak += 1;
    updateKillStreak();
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
  localPositionInitialized = false;
  const savedNickname = localStorage.getItem('kstrike-nickname');
  const nickname = nicknameInput.value.trim() || savedNickname || `Player-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('kstrike-nickname', nickname);
  nicknameInput.value = nickname;
  const endpoint = import.meta.env.VITE_COLYSEUS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`;
  const client = new Client(endpoint);
  networkStatus.textContent = 'CONNECTING // TRAINING';
  lobbyStatus.textContent = 'CONNECTING TO MATCH SERVER...';
  const roomOptions = { nickname, mapId: selectedMapId, isPrivate: Boolean(options.isPrivate), roomCode: options.roomCode || '', maxPlayers: options.maxPlayers || 10 };
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
      const roomMapId = room.state?.mapId;
      if (roomMapId && roomMapId !== activeMapId) {
        activeMapId = roomMapId;
        applyArenaMap(activeMapId);
        updateMapPresentation(activeMapId);
      }
      bindPlayerCallbacks();
      updateCombatHud();
    });
    bindPlayerCallbacks();
    room.onLeave(() => {
      multiplayerRoom = undefined;
      networkStatus.textContent = 'OFFLINE // TRAINING';
      remotePlayers.forEach((avatar) => scene.remove(avatar));
      remotePlayers.clear();
      exitMatchButton.hidden = true;
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
    roomOverlay.textContent = roomLabel ? `ROOM // ${roomLabel} // ${selectedMapId.toUpperCase()}` : `ROOM // ${room.roomId.slice(0, 6).toUpperCase()} // ${selectedMapId.toUpperCase()}`;
    scoreboardRoom.textContent = roomOverlay.textContent;
    intro.querySelector('.eyebrow').textContent = roomLabel
      ? `PRIVATE ROOM // ${roomLabel} // ${selectedMapId.toUpperCase()}`
      : `PUBLIC MATCH // ${room.roomId.slice(0, 6).toUpperCase()} // ${selectedMapId.toUpperCase()}`;
    intro.querySelector('.intro__copy').innerHTML = `Room joined. Enter when you are ready.<br />${selectedMapId.toUpperCase()} is loading for all players.`;
    enterButton.innerHTML = 'ENTER ARENA <span>&gt;</span>';
    lobby.hidden = true;
    intro.hidden = false;
    exitMatchButton.hidden = false;
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
mapButtons.forEach((button) => button.addEventListener('click', () => selectMap(button.dataset.map)));
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
  const hit = raycaster.intersectObjects(shootables, true)[0];
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
  if (activeMapId === 'd2' && d2CollisionBVH) {
    const origin = new THREE.Vector3(player.position.x, player.position.y + 1.05, player.position.z);
    const movement = new THREE.Vector3(x - origin.x, 0, z - origin.z);
    const distance = movement.length();
    if (distance <= 0.0001) return false;
    const hits = d2CollisionBVH.raycast(new THREE.Ray(origin, movement.normalize()), THREE.DoubleSide);
    return hits.some((hit) => (
      hit.distance <= distance + playerRadius
      && Math.abs(hit.face.normal.y) < 0.65
    ));
  }
  return colliders.some((collider) => {
    const closestX = THREE.MathUtils.clamp(x, collider.minX, collider.maxX);
    const closestZ = THREE.MathUtils.clamp(z, collider.minZ, collider.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    return dx * dx + dz * dz < playerRadius * playerRadius;
  });
}

function getMapGroundHeight(x, z, rayStartY = 80, maxGroundY = Infinity, referenceY = player.position.y) {
  if (activeMapId !== 'd2' || !d2CollisionBVH) return 0;
  const ray = new THREE.Ray(new THREE.Vector3(x, rayStartY, z), new THREE.Vector3(0, -1, 0));
  const groundHits = d2CollisionBVH.raycast(ray, THREE.DoubleSide)
    .filter((hit) => hit.point.y <= maxGroundY);
  const groundHit = groundHits.reduce((closest, hit) => (
    !closest || Math.abs(hit.point.y - referenceY) < Math.abs(closest.point.y - referenceY)
      ? hit
      : closest
  ), null);
  return groundHit ? groundHit.point.y + 0.03 : 0;
}

function getStableD2Surface(x, z) {
  const samples = [[0, 0], [-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]];
  const heights = samples.map(([offsetX, offsetZ]) => getMapGroundHeight(x + offsetX, z + offsetZ, 80, Infinity, 80));
  if (heights.some((height) => height < 0.15)) return null;
  if (Math.max(...heights) - Math.min(...heights) > 1.25) return null;
  return heights.reduce((total, height) => total + height, 0) / heights.length;
}

function snapPlayerToMapGround() {
  if (activeMapId !== 'd2' || !d2MapLoaded) return;
  let spawnX = player.position.x;
  let spawnZ = player.position.z;
  let groundHeight = getStableD2Surface(spawnX, spawnZ);
  // Reject spawn points that land on thin props, open air, or non-walkable map pieces.
  if (groundHeight === null) {
    const candidates = [
      [0, 0], [-8, 6], [8, 6], [-10, -8], [10, -8],
      [-20, 0], [20, 0], [-24, -16], [24, -16],
    ];
    for (const [candidateX, candidateZ] of candidates) {
      const candidateHeight = getStableD2Surface(candidateX, candidateZ);
      if (candidateHeight === null) continue;
      spawnX = candidateX;
      spawnZ = candidateZ;
      groundHeight = candidateHeight;
      break;
    }
  }
  player.position.set(spawnX, groundHeight ?? 0, spawnZ);
  playerVelocity.y = 0;
  grounded = true;
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
  const groundHeight = getMapGroundHeight(
    player.position.x,
    player.position.z,
    player.position.y + 3,
    player.position.y + 1.2,
  );
  if (player.position.y <= groundHeight) {
    player.position.y = groundHeight;
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
  if (!document.fullscreenElement && document.fullscreenEnabled)
    document.documentElement.requestFullscreen().catch(() => {});
  canvas.requestPointerLock();
}

async function leaveToMainMenu() {
  triggerHeld = false;
  keys.clear();
  const room = multiplayerRoom;
  multiplayerRoom = undefined;
  if (document.pointerLockElement) document.exitPointerLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  remotePlayers.forEach((avatar) => scene.remove(avatar));
  remotePlayers.clear();
  killFeed.replaceChildren();
  matchResult.hidden = true;
  killStreak = 0;
  updateKillStreak();
  localAlive = true;
  localPositionInitialized = false;
  networkStatus.textContent = 'OFFLINE // MAIN MENU';
  exitMatchButton.hidden = true;
  intro.hidden = true;
  lobby.hidden = false;
  lobbyStatus.textContent = 'SELECT A MAP AND FIND A MATCH';
  if (room) await room.leave();
}

enterButton.addEventListener("click", lockArena);
exitMatchButton.addEventListener('click', () => { leaveToMainMenu().catch(console.error); });
canvas.addEventListener("click", () => {
  if (!locked) lockArena();
});
document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === canvas;
  intro.classList.toggle("intro--dismissed", locked);
  if (!locked) {
    if (!multiplayerRoom && !lobby.hidden) return;
    triggerHeld = false;
    intro.hidden = false;
    enterButton.innerHTML = `RESUME ${mapPresentation[activeMapId]?.code || 'MATCH'} <span>↗</span>`;
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
  minimumLoadingTimeElapsed = true;
  finishInitialLoadingWhenReady();
}, 700);
