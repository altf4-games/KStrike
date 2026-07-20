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
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0f1115");
scene.fog = new THREE.FogExp2("#0f1115", 0.024);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.005,
  180,
);
// The viewmodel is rendered in a separate pass after the world. It gets its
// own depth buffer, so level geometry can never clip the first-person weapon.
const viewModelScene = new THREE.Scene();
const viewModelCamera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.01,
  10,
);
// The viewmodel does not share the map scene, so give it a small studio-light
// rig. This keeps imported PBR weapon materials readable in dark map areas.
viewModelScene.add(new THREE.HemisphereLight('#e9f4ff', '#26313d', 3.4));
viewModelScene.add(new THREE.AmbientLight('#dbeaff', 1.15));
const viewModelKeyLight = new THREE.DirectionalLight('#ffffff', 3.2);
viewModelKeyLight.position.set(-2, 3, 2);
const viewModelFillLight = new THREE.PointLight('#b8d8ff', 14, 4, 2);
viewModelFillLight.position.set(0.8, 0.35, 0.5);
viewModelScene.add(viewModelKeyLight, viewModelFillLight);
const player = new THREE.Group();
const pitch = new THREE.Group();
player.position.set(12, 0, 10);
pitch.add(camera);
player.add(pitch);
scene.add(player);
// Rotate view around the eye itself. Keeping the pitch pivot at the player's
// feet made looking down swing the camera forward through nearby walls.
pitch.position.set(0, 1.68, 0);
camera.position.set(0, 0, 0);

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
const weaponName = document.querySelector('#weapon-name');
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
const deathScreen = document.querySelector('#death-screen');
const respawnCountdown = document.querySelector('#respawn-countdown');
const lobby = document.querySelector('#lobby-screen');
const lobbyStatus = document.querySelector('#lobby-status');
const nicknameInput = document.querySelector('#nickname-input');
const roomCodeInput = document.querySelector('#room-code-input');
const quickMatchButton = document.querySelector('#quick-match-button');
const singleplayerButton = document.querySelector('#singleplayer-button');
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
let playerAction = 'idle';
let hitMarkerUntil = 0;
let screenShake = 0;
let lastFootstepAt = 0;
let selectedMapId = localStorage.getItem('kstrike-map') || 'd2';
let activeMapId = 'd2';
let killStreak = 0;
let localPositionInitialized = false;
let voidRecoveryPending = false;
let singlePlayerMode = false;
let soloHealth = 100;
let soloKills = 0;
let soloDeaths = 0;
let soloRespawnAt = 0;
let soloSpawnShieldUntil = 0;
let soloMatchEndsAt = 0;
let soloMatchFinished = false;
const soloBots = [];

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
  shotgun: '/assets/audio/shotgun.wav',
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
  const uniform = new THREE.MeshStandardMaterial({ color: '#315fbd', roughness: 0.72 });
  const armor = new THREE.MeshStandardMaterial({ color: '#172333', roughness: 0.52, metalness: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b98363', roughness: 0.9 });
  const visorMaterial = new THREE.MeshBasicMaterial({ color: '#9eeaff' });
  const weaponMaterial = new THREE.MeshStandardMaterial({ color: '#242b34', roughness: 0.45, metalness: 0.7 });
  const cube = (size, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };
  const rig = { arms: [], legs: [], rifle: null, shotgun: null };
  const pelvis = cube([0.54, 0.25, 0.28], armor);
  pelvis.position.y = 0.91;
  const torso = cube([0.64, 0.72, 0.34], uniform);
  torso.position.y = 1.39;
  const chestPlate = cube([0.5, 0.39, 0.035], armor);
  chestPlate.position.set(0, 1.42, -0.188);
  const head = cube([0.47, 0.5, 0.47], skin);
  head.position.y = 2.03;
  const helmet = cube([0.51, 0.18, 0.51], armor);
  helmet.position.y = 2.28;
  const visor = cube([0.34, 0.11, 0.025], visorMaterial);
  visor.position.set(0, 2.07, -0.248);
  avatar.add(pelvis, torso, chestPlate, head, helmet, visor);

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.19, 0.84, 0);
    const legBlock = cube([0.23, 0.72, 0.27], uniform);
    legBlock.position.y = -0.36;
    const boot = cube([0.25, 0.13, 0.4], armor);
    boot.position.set(0, -0.69, -0.065);
    leg.add(legBlock, boot);
    avatar.add(leg);
    rig.legs.push(leg);

    const arm = new THREE.Group();
    // Keep the joint at the actual outer shoulder. The aiming pose below
    // brings the hands inward, rather than moving the whole shoulder joint.
    arm.position.set(side * 0.47, 1.66, 0);
    const upperArm = cube([0.2, 0.64, 0.24], uniform);
    upperArm.position.y = -0.32;
    const hand = cube([0.22, 0.16, 0.23], skin);
    hand.position.y = -0.67;
    arm.add(upperArm, hand);
    avatar.add(arm);
    rig.arms.push(arm);
  }

  const rifle = new THREE.Group();
  const rifleBody = cube([0.15, 0.14, 0.72], weaponMaterial);
  rifleBody.position.z = -0.25;
  const stock = cube([0.18, 0.19, 0.22], armor);
  stock.position.set(0, -0.06, 0.13);
  const barrel = cube([0.07, 0.07, 0.35], weaponMaterial);
  barrel.position.set(0, 0.015, -0.76);
  rifle.add(rifleBody, stock, barrel);
  rifle.position.set(-0.08, -0.68, -0.1);
  rifle.rotation.x = 0;
  rig.arms[1].add(rifle);
  rig.rifle = rifle;
  const shotgun = new THREE.Group();
  const shotgunReceiver = cube([0.19, 0.15, 0.56], weaponMaterial);
  shotgunReceiver.position.z = -0.2;
  const shotgunBarrel = cube([0.12, 0.1, 0.78], armor);
  shotgunBarrel.position.set(0, 0.01, -0.75);
  const shotgunStock = cube([0.2, 0.18, 0.28], armor);
  shotgunStock.position.set(0, -0.06, 0.13);
  shotgun.add(shotgunReceiver, shotgunBarrel, shotgunStock);
  shotgun.position.copy(rifle.position);
  shotgun.visible = false;
  rig.arms[1].add(shotgun);
  rig.shotgun = shotgun;
  const remoteMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), new THREE.MeshBasicMaterial({ color: '#fff1a8' }));
  remoteMuzzle.position.set(0, 0.015, -0.98);
  remoteMuzzle.visible = false;
  rifle.add(remoteMuzzle);
  const remoteShotgunMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: '#fff1a8' }));
  remoteShotgunMuzzle.position.set(0, 0.01, -1.16);
  remoteShotgunMuzzle.visible = false;
  shotgun.add(remoteShotgunMuzzle);
  avatar.userData.target = new THREE.Vector3();
  avatar.userData.rotation = 0;
  avatar.userData.pitch = 0;
  avatar.userData.nickname = nickname;
  avatar.userData.muzzles = [remoteMuzzle, remoteShotgunMuzzle];
  avatar.userData.shotUntil = 0;
  avatar.userData.action = 'idle';
  avatar.userData.weapon = 'rifle';
  avatar.userData.animationTime = Math.random() * Math.PI * 2;
  avatar.userData.rig = rig;
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
    deathScreen.hidden = local.alive;
    if (!local.alive) respawnCountdown.textContent = `RESPAWNING IN ${local.respawnSeconds}`;
    if (justDied) {
      killStreak = 0;
      updateKillStreak();
      playGameSound('death', { volume: 0.42 });
    }
    if (justRespawned) {
      player.position.set(local.x, local.y, local.z);
      playerVelocity.set(0, 0, 0); horizontalVelocity.set(0, 0, 0);
      snapPlayerToMapGround();
      deathScreen.hidden = true;
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
    const definition = weaponDefinitions[activeWeapon];
    reserveAmmo = Math.min(definition.reserveCap, reserveAmmo + definition.magazineSize);
    killStreak += 1;
    updateKillStreak();
    updateAmmo();
  }
  window.setTimeout(() => item.remove(), 4500);
}

function renderScoreboard() {
  if (singlePlayerMode) {
    scoreboardRoom.textContent = `SOLO // ${mapPresentation[activeMapId]?.code || 'ARENA'}`;
    const entries = [
      { nickname: 'YOU', kills: soloKills, deaths: soloDeaths, alive: localAlive, self: true },
      ...soloBots.map((bot) => ({ nickname: bot.avatar.userData.nickname, kills: bot.kills || 0, deaths: bot.deaths || 0, alive: bot.alive })),
    ].sort((a, b) => b.kills - a.kills);
    scoreboardPlayers.innerHTML = '<div class="scoreboard__row"><span>PLAYER</span><span>KILLS</span><span>DEATHS</span><span>STATUS</span></div>' + entries
      .map((entry) => `<div class="scoreboard__row${entry.self ? ' scoreboard__row--self' : ''}"><span>${entry.nickname}</span><span>${entry.kills}</span><span>${entry.deaths}</span><span>${entry.alive ? 'ALIVE' : 'RESPAWN'}</span></div>`)
      .join('');
    return;
  }
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
          avatar.userData.pitch = remote.pitch || 0;
          avatar.userData.action = remote.action || 'idle';
          avatar.userData.weapon = remote.weapon || 'rifle';
          avatar.visible = remote.alive;
        });
        avatar.userData.target.set(remote.x, remote.y, remote.z);
        avatar.userData.rotation = remote.rotation;
        avatar.userData.pitch = remote.pitch || 0;
        avatar.userData.action = remote.action || 'idle';
        avatar.userData.weapon = remote.weapon || 'rifle';
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
    room.onMessage('recovered', ({ x, y, z }) => {
      player.position.set(x, y, z);
      playerVelocity.set(0, 0, 0);
      horizontalVelocity.set(0, 0, 0);
      voidRecoveryPending = false;
      grounded = true;
    });
    room.onMessage('fire', ({ sessionId }) => {
      const avatar = remotePlayers.get(sessionId);
      if (avatar) {
        avatar.userData.shotUntil = performance.now() + 90;
        playGameSound(avatar.userData.weapon === 'shotgun' ? 'shotgun' : 'fire', { volume: 0.1 });
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
function startSinglePlayer() {
  singlePlayerMode = true;
  activeMapId = selectedMapId;
  applyArenaMap(activeMapId);
  updateMapPresentation(activeMapId);
  const [spawnX, spawnY, spawnZ] = (soloSpawnPoints[activeMapId] || soloSpawnPoints.training)[0];
  player.position.set(spawnX, spawnY, spawnZ);
  playerVelocity.set(0, 0, 0);
  horizontalVelocity.set(0, 0, 0);
  localAlive = true;
  soloHealth = 100;
  soloKills = 0;
  soloDeaths = 0;
  soloMatchEndsAt = performance.now() + 300000;
  soloMatchFinished = false;
  deathScreen.hidden = true;
  healthCount.textContent = soloHealth;
  localPositionInitialized = true;
  magazine = weaponAmmo.rifle.magazine;
  reserveAmmo = weaponAmmo.rifle.reserve;
  activeWeapon = 'rifle';
  weaponModel.visible = weaponModel.children.length > 0;
  fallbackWeapon.visible = weaponModel.children.length === 0;
  shotgunModel.visible = false;
  updateAmmo();
  networkStatus.textContent = 'OFFLINE // SOLO';
  roomOverlay.textContent = `SOLO // ${mapPresentation[activeMapId]?.code || 'ARENA'}`;
  matchTimer.textContent = 'SOLO // 0 KILLS';
  intro.querySelector('.eyebrow').textContent = `SINGLEPLAYER // ${mapPresentation[activeMapId]?.code || 'ARENA'}`;
  intro.querySelector('.intro__copy').innerHTML = 'Offline deathmatch against local NPCs.<br />No server connection required.';
  enterButton.innerHTML = 'ENTER SOLO MATCH <span>&gt;</span>';
  spawnSoloBots();
  lobby.hidden = true;
  intro.hidden = false;
  exitMatchButton.hidden = false;
}
singleplayerButton.addEventListener('click', startSinglePlayer);
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
  if (!multiplayerRoom || voidRecoveryPending || now - lastNetworkSync < 50) return;
  lastNetworkSync = now;
  multiplayerRoom.send('move', {
    x: player.position.x, y: player.position.y, z: player.position.z,
    rotation: player.rotation.y, pitch: pitch.rotation.x, action: playerAction, weapon: activeWeapon,
  });
}

function updateRemotePlayers(delta) {
  remotePlayers.forEach((avatar) => {
    avatar.position.lerp(avatar.userData.target, 1 - Math.exp(-12 * delta));
    avatar.rotation.y = THREE.MathUtils.damp(avatar.rotation.y, avatar.userData.rotation, 14, delta);
    avatar.userData.muzzles.forEach((muzzle) => { muzzle.visible = performance.now() < avatar.userData.shotUntil; });
    const { arms, legs, rifle, shotgun } = avatar.userData.rig;
    const action = avatar.userData.action;
    const animationSpeed = action === 'run' ? 15 : action === 'walk' ? 10 : 3;
    avatar.userData.animationTime += delta * animationSpeed;
    const phase = Math.sin(avatar.userData.animationTime);
    const moving = action === 'walk' || action === 'run';
    const stride = moving ? phase * (action === 'run' ? 0.82 : 0.53) : 0;
    // Hold a two-handed, shouldered rifle stance instead of letting arms hang
    // at the sides. Small opposing motion keeps locomotion readable.
    let leftArm = 0.82 + (moving ? -stride * 0.22 : Math.sin(avatar.userData.animationTime) * 0.035);
    let rightArm = 1.1 + (moving ? stride * 0.16 : Math.sin(avatar.userData.animationTime + 0.3) * 0.03);
    let leftLeg = stride;
    let rightLeg = -stride;
    if (action === 'crouch') { leftLeg = 0.48; rightLeg = 0.48; leftArm = 0.62; rightArm = 0.94; }
    if (action === 'jump') { leftLeg = -0.6; rightLeg = -0.6; leftArm = 1.04; rightArm = 1.25; }
    if (action === 'fire') { leftArm = 0.95; rightArm = 1.28; }
    if (action === 'reload') { leftArm = 0.48; rightArm = 0.82; }
    arms[0].rotation.x = THREE.MathUtils.damp(arms[0].rotation.x, leftArm, 18, delta);
    arms[1].rotation.x = THREE.MathUtils.damp(arms[1].rotation.x, rightArm, 18, delta);
    // Angle each arm toward the rifle: shoulders stay fixed on the torso,
    // while the hands meet at centre in a natural two-handed stance.
    arms[0].rotation.z = THREE.MathUtils.damp(arms[0].rotation.z, 0.52, 18, delta);
    arms[1].rotation.z = THREE.MathUtils.damp(arms[1].rotation.z, -0.52, 18, delta);
    legs[0].rotation.x = THREE.MathUtils.damp(legs[0].rotation.x, leftLeg, 16, delta);
    legs[1].rotation.x = THREE.MathUtils.damp(legs[1].rotation.x, rightLeg, 16, delta);
    // The rifle lives on the weapon arm, so cancel that limb's pose before
    // applying the replicated camera pitch. This keeps the barrel on target.
    rifle.rotation.x = THREE.MathUtils.damp(
      rifle.rotation.x,
      THREE.MathUtils.clamp(avatar.userData.pitch, -0.85, 0.65) - arms[1].rotation.x,
      20,
      delta,
    );
    shotgun.rotation.copy(rifle.rotation);
    rifle.visible = avatar.userData.weapon !== 'shotgun';
    shotgun.visible = avatar.userData.weapon === 'shotgun';
  });
}

const soloSpawnPoints = {
  d2: [[-35, 4.98, -30], [0, 1.68, -25], [35, 4.98, 5], [10, 4.98, -8]],
  training: [[0, 0, -3], [-12, 0, 8], [12, 0, 8], [3, 0, -2]],
};

function clearSoloBots() {
  soloBots.splice(0).forEach((bot) => {
    remotePlayers.delete(bot.id);
    scene.remove(bot.avatar);
  });
}

function addSoloFeed(text) {
  const item = document.createElement('p');
  item.innerHTML = `<b>SOLO</b> <i>${text}</i>`;
  killFeed.prepend(item);
  window.setTimeout(() => item.remove(), 2500);
}

function spawnSoloBots() {
  clearSoloBots();
  const points = soloSpawnPoints[activeMapId] || soloSpawnPoints.training;
  points.slice(1, 4).forEach(([x, y, z], index) => {
    const avatar = createRemotePlayer(`BOT-${index + 1}`);
    const bot = {
      id: `solo-bot-${index}`,
      avatar,
      spawn: new THREE.Vector3(x, y, z),
      patrol: new THREE.Vector3(x + (index - 1) * 2, y, z + (index % 2 ? 2 : -2)),
      health: 100,
      kills: 0,
      deaths: 0,
      alive: true,
      respawnAt: 0,
      spawnShieldUntil: 0,
      lastShotAt: performance.now() + index * 260,
    };
    avatar.position.copy(bot.spawn);
    avatar.userData.target.copy(bot.spawn);
    avatar.userData.soloBot = bot;
    avatar.userData.action = 'idle';
    remotePlayers.set(bot.id, avatar);
    soloBots.push(bot);
  });
}

function damageSoloBot(bot, headshot) {
  if (!singlePlayerMode || !bot.alive || performance.now() < bot.spawnShieldUntil) return;
  bot.health -= headshot ? 100 : activeWeapon === 'shotgun' ? 15 : 34;
  hitMarkerUntil = performance.now() + 120;
  screenShake = 1;
  playGameSound('hit', { volume: 0.24 });
  if (bot.health > 0) return;
  bot.alive = false;
  bot.deaths += 1;
  bot.respawnAt = performance.now() + 3000;
  bot.avatar.visible = false;
  soloKills += 1;
  killStreak += 1;
  reserveAmmo = Math.min(weaponDefinitions[activeWeapon].reserveCap, reserveAmmo + weaponDefinitions[activeWeapon].magazineSize);
  updateAmmo();
  updateKillStreak();
  addSoloFeed(`ELIMINATED ${bot.avatar.userData.nickname}`);
}

function damageSoloPlayer(amount, attacker) {
  if (!singlePlayerMode || !localAlive || performance.now() < soloSpawnShieldUntil) return;
  soloHealth = Math.max(0, soloHealth - amount);
  healthCount.textContent = soloHealth;
  screenShake = 1;
  if (soloHealth > 0) return;
  localAlive = false;
  soloDeaths += 1;
  if (attacker) attacker.kills += 1;
  soloRespawnAt = performance.now() + 2500;
  killStreak = 0;
  updateKillStreak();
  addSoloFeed('YOU WERE ELIMINATED');
  deathScreen.hidden = false;
  respawnCountdown.textContent = 'RESPAWNING IN 3';
}

function updateSoloBots(now, delta) {
  if (!singlePlayerMode) return;
  const secondsRemaining = Math.max(0, Math.ceil((soloMatchEndsAt - now) / 1000));
  const minutes = Math.floor(secondsRemaining / 60);
  matchTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(secondsRemaining % 60).padStart(2, '0')}`;
  if (secondsRemaining === 0) {
    if (!soloMatchFinished) {
      soloMatchFinished = true;
      triggerHeld = false;
      keys.clear();
      const entries = [
        { nickname: 'YOU', kills: soloKills, deaths: soloDeaths },
        ...soloBots.map((bot) => ({ nickname: bot.avatar.userData.nickname, kills: bot.kills || 0, deaths: bot.deaths || 0 })),
      ].sort((a, b) => b.kills - a.kills);
      winnerName.textContent = entries[0]?.nickname === 'YOU' ? 'YOU WIN' : `${entries[0]?.nickname || 'NO WINNER'} WINS`;
      resultScores.innerHTML = entries.map((entry, index) => `<p><span>${index + 1}. ${entry.nickname}</span><b>${entry.kills} K / ${entry.deaths} D</b></p>`).join('');
      matchResult.hidden = false;
    }
    return;
  }
  if (!localAlive && now >= soloRespawnAt) {
    const [x, y, z] = (soloSpawnPoints[activeMapId] || soloSpawnPoints.training)[0];
    player.position.set(x, y, z);
    playerVelocity.set(0, 0, 0);
    horizontalVelocity.set(0, 0, 0);
    soloHealth = 100;
    healthCount.textContent = soloHealth;
    localAlive = true;
    soloSpawnShieldUntil = now + 2000;
    deathScreen.hidden = true;
    addSoloFeed('RESPAWNED');
  }
  soloBots.forEach((bot) => {
    if (!bot.alive) {
      if (now < bot.respawnAt) return;
      bot.health = 100;
      bot.alive = true;
      bot.spawnShieldUntil = now + 2000;
      bot.avatar.visible = true;
      bot.avatar.position.copy(bot.spawn);
      bot.avatar.userData.target.copy(bot.spawn);
      bot.avatar.userData.action = 'idle';
      return;
    }
    const toPlayer = player.position.clone().sub(bot.avatar.position);
    const distance = Math.hypot(toPlayer.x, toPlayer.z);
    const canSeePlayer = distance < 22 && botHasLineOfSight(bot);
    // Keep every offline opponent visibly moving even when the player is far
    // away, then have it run toward the player once they are nearby.
    if (distance >= 22) {
      const patrolTime = now * 0.001 + soloBots.indexOf(bot) * 1.9;
      bot.patrol.set(
        bot.spawn.x + Math.sin(patrolTime) * 3.2,
        bot.spawn.y,
        bot.spawn.z + Math.cos(patrolTime * 0.8) * 3.2,
      );
    }
    const goal = canSeePlayer ? player.position : bot.patrol;
    const directionToGoal = goal.clone().sub(bot.avatar.position);
    directionToGoal.y = 0;
    if (directionToGoal.lengthSq() > 0.3) {
      directionToGoal.normalize();
      const speed = canSeePlayer ? 3.1 : 2;
      moveBotWithCollision(bot, directionToGoal, speed, delta);
      bot.avatar.userData.target.copy(bot.avatar.position);
      bot.avatar.userData.rotation = Math.atan2(-directionToGoal.x, -directionToGoal.z);
      bot.avatar.userData.action = canSeePlayer ? 'run' : 'walk';
    } else bot.avatar.userData.action = 'idle';
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(up, bot.avatar.userData.rotation);
    const flatToPlayer = toPlayer.setY(0).normalize();
    const playerInViewCone = forward.dot(flatToPlayer) > Math.cos(Math.PI / 3);
    if (localAlive && canSeePlayer && playerInViewCone && distance < 18 && now - bot.lastShotAt > 850) {
      bot.lastShotAt = now;
      bot.avatar.userData.action = 'fire';
      bot.avatar.userData.shotUntil = now + 90;
      playGameSound(bot.avatar.userData.weapon === 'shotgun' ? 'shotgun' : 'fire', { volume: 0.08 });
      if (Math.random() < 0.68) damageSoloPlayer(9, bot);
    }
  });
  if (!localAlive) respawnCountdown.textContent = `RESPAWNING IN ${Math.max(1, Math.ceil((soloRespawnAt - now) / 1000))}`;
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
const rifleMuzzleBasePosition = muzzleFlash.position.clone();
const muzzleLight = new THREE.PointLight("#ffb347", 0, 5, 2);
muzzleLight.position.copy(muzzleFlash.position);
weapon.add(muzzleLight);
weapon.position.set(0.42, -0.34, -0.58);
weapon.rotation.set(-0.08, -0.16, 0);
viewModelScene.add(weapon);
// Fine-tune the custom rifle effect here: X = right/left, Y = up/down, Z = toward/away from camera.
const muzzleOffset = new THREE.Vector3(0, -0.1, -1.1);

const weaponModel = new THREE.Group();
weaponModel.visible = false;
weapon.add(weaponModel);
const shotgunModel = new THREE.Group();
const shotgunFallback = new THREE.Group();
const shotgunBody = new THREE.MeshStandardMaterial({ color: '#31343a', roughness: 0.38, metalness: 0.72 });
const shotgunWood = new THREE.MeshStandardMaterial({ color: '#5e3825', roughness: 0.7 });
function shotgunPart(size, position, material = shotgunBody) {
  const part = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  part.position.set(...position);
  part.castShadow = true;
  shotgunFallback.add(part);
}
// Compact pump shotgun viewmodel: two barrels, receiver, pump, and stock.
shotgunPart([0.2, 0.16, 0.7], [0.16, -0.11, -0.48]);
shotgunPart([0.055, 0.055, 0.76], [0.105, -0.045, -1.14]);
shotgunPart([0.055, 0.055, 0.76], [0.215, -0.045, -1.14]);
shotgunPart([0.27, 0.14, 0.3], [0.16, -0.18, -0.78], shotgunWood);
shotgunPart([0.22, 0.23, 0.36], [0.16, -0.25, -0.08], shotgunWood);
shotgunPart([0.13, 0.12, 0.24], [0.16, 0.02, -0.36], weaponAccent);
shotgunModel.add(shotgunFallback);
shotgunModel.visible = false;
weapon.add(shotgunModel);
const shotgunMuzzleBasePosition = new THREE.Vector3(0.16, -0.045, -1.54);
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
      rifleMuzzleBasePosition.copy(muzzlePoint);
      muzzleFlash.scale.setScalar(1);
      muzzleFlash.add(muzzleLight);
      muzzleLight.position.set(0, 0, 0);
    }
    weaponModel.visible = activeWeapon === 'rifle';
    fallbackWeapon.visible = false;
  },
  undefined,
  () => {
    console.warn(
      "Custom rifle model could not be loaded; using the built-in fallback.",
    );
  },
);
new GLTFLoader().load(
  '/assets/weapons/shotgun.glb',
  (gltf) => {
    const shotgun = gltf.scene;
    // The Sketchfab asset is authored at a large scale and points +Z.
    shotgun.rotation.y = Math.PI;
    shotgun.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(shotgun);
    const size = bounds.getSize(new THREE.Vector3());
    shotgun.scale.multiplyScalar(1.72 / Math.max(size.x, size.y, size.z));
    shotgun.updateMatrixWorld(true);
    const scaledBounds = new THREE.Box3().setFromObject(shotgun);
    const centre = scaledBounds.getCenter(new THREE.Vector3());
    const scaledSize = scaledBounds.getSize(new THREE.Vector3());
    shotgun.position.set(0.16 - centre.x, -0.2 - centre.y, -0.86 - centre.z);
    shotgun.traverse((node) => {
      if (node.isMesh) { node.castShadow = true; node.frustumCulled = false; }
    });
    shotgunFallback.visible = false;
    shotgunModel.add(shotgun);
    weapon.updateMatrixWorld(true);
    // Sample the model's foremost vertices after all import transforms. This
    // anchors the effect to the actual barrel opening instead of its bounds.
    let muzzleZ = Infinity;
    const muzzleSamples = [];
    const vertex = new THREE.Vector3();
    const weaponSpaceVertex = new THREE.Vector3();
    shotgun.traverse((node) => {
      if (!node.isMesh) return;
      const positions = node.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index);
        node.localToWorld(vertex);
        weaponSpaceVertex.copy(vertex);
        weapon.worldToLocal(weaponSpaceVertex);
        muzzleZ = Math.min(muzzleZ, weaponSpaceVertex.z);
      }
    });
    shotgun.traverse((node) => {
      if (!node.isMesh) return;
      const positions = node.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        vertex.fromBufferAttribute(positions, index);
        node.localToWorld(vertex);
        weaponSpaceVertex.copy(vertex);
        weapon.worldToLocal(weaponSpaceVertex);
        if (weaponSpaceVertex.z <= muzzleZ + 0.025) muzzleSamples.push(weaponSpaceVertex.clone());
      }
    });
    if (muzzleSamples.length) {
      shotgunMuzzleBasePosition.set(0, 0, 0);
      muzzleSamples.forEach((sample) => shotgunMuzzleBasePosition.add(sample));
      shotgunMuzzleBasePosition.multiplyScalar(1 / muzzleSamples.length);
      shotgunMuzzleBasePosition.z -= 0.035;
    } else {
      shotgunMuzzleBasePosition.set(0.16, -0.2, -0.86 - scaledSize.z / 2 - 0.02);
    }
  },
  undefined,
  () => console.warn('Custom shotgun model could not be loaded; using the built-in fallback.'),
);

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();
const decals = [];
const weaponDefinitions = {
  rifle: { label: 'AR-01 / AUTO', magazineSize: 30, reserveCap: 180, fireInterval: 92, reloadMs: 1200, recoil: 0.009, pellets: 1, spread: 0 },
  shotgun: { label: 'SG-12 / PUMP', magazineSize: 8, reserveCap: 64, fireInterval: 400, reloadMs: 1050, recoil: 0.032, pellets: 8, spread: 0.022 },
};
const weaponAmmo = {
  rifle: { magazine: 30, reserve: 90 },
  shotgun: { magazine: 8, reserve: 32 },
};
let activeWeapon = 'rifle';
let magazine = weaponAmmo.rifle.magazine;
let reserveAmmo = weaponAmmo.rifle.reserve;
let reloading = false;
let reloadCompleteAt = 0;
let triggerHeld = false;
let lastShotAt = 0;
let weaponKick = 0;
let muzzleUntil = 0;

function updateAmmo() {
  ammoCount.innerHTML = `${magazine} <i>/</i> ${reserveAmmo}`;
  weaponName.textContent = weaponDefinitions[activeWeapon].label;
}
function equipWeapon(nextWeapon) {
  if (!weaponDefinitions[nextWeapon] || nextWeapon === activeWeapon || reloading) return;
  weaponAmmo[activeWeapon] = { magazine, reserve: reserveAmmo };
  activeWeapon = nextWeapon;
  ({ magazine, reserve: reserveAmmo } = weaponAmmo[activeWeapon]);
  weaponModel.visible = activeWeapon === 'rifle' && weaponModel.children.length > 0;
  fallbackWeapon.visible = activeWeapon === 'rifle' && weaponModel.children.length === 0;
  shotgunModel.visible = activeWeapon === 'shotgun';
  reloadStatus.textContent = '';
  updateAmmo();
}
function playWeaponSound(reload = false) {
  playGameSound(reload ? 'reload' : activeWeapon === 'shotgun' ? 'shotgun' : 'fire', { volume: reload ? 0.42 : 0.3 });
}
function startReload(now = performance.now()) {
  const definition = weaponDefinitions[activeWeapon];
  if (reloading || magazine === definition.magazineSize || reserveAmmo === 0) return;
  reloading = true;
  playerAction = 'reload';
  reloadCompleteAt = now + definition.reloadMs;
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
  const definition = weaponDefinitions[activeWeapon];
  if (!locked || !localAlive || reloading || now - lastShotAt < definition.fireInterval) return;
  if (magazine === 0) {
    startReload(now);
    return;
  }
  lastShotAt = now;
  playerAction = 'fire';
  magazine -= 1;
  updateAmmo();
  playWeaponSound();
  weaponKick = 1;
  muzzleUntil = now + 80;
  muzzleFlash.visible = true;
  multiplayerRoom?.send('fire');
  pitch.rotation.x = THREE.MathUtils.clamp(
    pitch.rotation.x + definition.recoil,
    -1.42,
    1.42,
  );
  camera.updateMatrixWorld();
  const impacts = [];
  for (let pellet = 0; pellet < definition.pellets; pellet += 1) {
    const crosshairOffset = pellet === 0
      ? new THREE.Vector2()
      : new THREE.Vector2((Math.random() - 0.5) * definition.spread, (Math.random() - 0.5) * definition.spread);
    raycaster.setFromCamera(crosshairOffset, camera);
    raycaster.far = activeWeapon === 'shotgun' ? 16 : Infinity;
    const hit = raycaster.intersectObjects(shootables, true)[0];
    const playerHit = raycaster.intersectObjects([...remotePlayers.values()], true)[0];
    if (playerHit && (!hit || playerHit.distance < hit.distance)) {
      let owner = playerHit.object;
      while (owner && !owner.userData.sessionId && !owner.userData.soloBot) owner = owner.parent;
      if (owner?.userData.soloBot) {
        damageSoloBot(owner.userData.soloBot, playerHit.point.y - owner.position.y > 1.15);
        continue;
      }
      if (owner?.userData.sessionId) {
        impacts.push({ targetId: owner.userData.sessionId, headshot: playerHit.point.y - owner.position.y > 1.15 });
        continue;
      }
    }
    // Each shotgun pellet can leave its own mark, making the close-range
    // spread readable on walls without exceeding the global decal cap.
    if (hit) {
      addDecal(hit);
      if (hit.object.userData.isTarget) hit.object.userData.hitUntil = now + 110;
    }
  }
  raycaster.far = Infinity;
  if (impacts.length) multiplayerRoom?.send('shoot', { weapon: activeWeapon, impacts });
}
function updateWeapon(now, delta) {
  // Apply the editable offset every frame, rather than only when the glTF first loads.
  const muzzleBase = activeWeapon === 'shotgun' ? shotgunMuzzleBasePosition : rifleMuzzleBasePosition;
  muzzleFlash.position.copy(muzzleBase).add(activeWeapon === 'rifle' ? muzzleOffset : new THREE.Vector3());
  if (triggerHeld) fire(now);
  if (reloading && now >= reloadCompleteAt) {
    const definition = weaponDefinitions[activeWeapon];
    const loaded = Math.min(definition.magazineSize - magazine, reserveAmmo);
    magazine += loaded;
    reserveAmmo -= loaded;
    weaponAmmo[activeWeapon] = { magazine, reserve: reserveAmmo };
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

function blocksPositionAt(position, x, z, radius = playerRadius) {
  if (activeMapId === 'd2' && d2CollisionBVH) {
    const movement = new THREE.Vector3(x - position.x, 0, z - position.z);
    const distance = movement.length();
    if (distance <= 0.0001) return false;
    const direction = movement.normalize();
    // Test feet, torso, and eye height. A single centre probe allowed the
    // camera to cross thin/low wall sections when looking downward.
    return [0.48, 1.08, 1.66].some((height) => {
      const origin = new THREE.Vector3(position.x, position.y + height, position.z);
      const hits = d2CollisionBVH.raycast(new THREE.Ray(origin, direction), THREE.DoubleSide);
      return hits.some((hit) => (
        hit.distance <= distance + radius
        && Math.abs(hit.face.normal.y) < 0.65
      ));
    });
  }
  return colliders.some((collider) => {
    const closestX = THREE.MathUtils.clamp(x, collider.minX, collider.maxX);
    const closestZ = THREE.MathUtils.clamp(z, collider.minZ, collider.maxZ);
    const dx = x - closestX;
    const dz = z - closestZ;
    return dx * dx + dz * dz < radius * radius;
  });
}

function blocksPosition(x, z) {
  return blocksPositionAt(player.position, x, z);
}

function moveBotWithCollision(bot, direction, speed, delta) {
  const position = bot.avatar.position;
  const distance = speed * delta;
  const steps = Math.max(1, Math.ceil(distance / (playerRadius * 0.45)));
  const stepDistance = distance / steps;
  for (let step = 0; step < steps; step += 1) {
    const nextX = position.x + direction.x * stepDistance;
    const nextZ = position.z + direction.z * stepDistance;
    if (!blocksPositionAt(position, nextX, position.z, 0.42)) position.x = nextX;
    if (!blocksPositionAt(position, position.x, nextZ, 0.42)) position.z = nextZ;
  }
  if (activeMapId === 'd2') {
    const floor = getMapGroundHeight(position.x, position.z, position.y + 5, position.y + 2, position.y);
    if (floor !== null) position.y = floor;
  }
}

function botHasLineOfSight(bot) {
  const origin = bot.avatar.position.clone().add(new THREE.Vector3(0, 1.25, 0));
  const target = player.position.clone().add(new THREE.Vector3(0, 1.25, 0));
  const direction = target.sub(origin);
  const distance = direction.length();
  if (distance <= 0.01) return true;
  direction.normalize();
  if (activeMapId === 'd2' && d2CollisionBVH) {
    const hits = d2CollisionBVH.raycast(new THREE.Ray(origin, direction), THREE.DoubleSide);
    return !hits.some((hit) => hit.distance < distance - 0.35 && Math.abs(hit.face.normal.y) < 0.8);
  }
  const ray = new THREE.Ray(origin, direction);
  return !colliders.some((collider) => {
    const box = new THREE.Box3(
      new THREE.Vector3(collider.minX, 0, collider.minZ),
      new THREE.Vector3(collider.maxX, collider.height, collider.maxZ),
    );
    const hit = ray.intersectBox(box, new THREE.Vector3());
    return hit && hit.distanceTo(origin) < distance - 0.35;
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
  // `null` means the ray missed the map entirely. A real floor can be at
  // height zero, so it must not be treated as an invalid spawn surface.
  return groundHit ? groundHit.point.y + 0.03 : null;
}

function getStableD2Surface(x, z, referenceY = player.position.y) {
  const samples = [[0, 0], [-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]];
  const heights = samples.map(([offsetX, offsetZ]) => getMapGroundHeight(x + offsetX, z + offsetZ, 80, Infinity, referenceY));
  if (heights.some((height) => height === null)) return null;
  if (Math.max(...heights) - Math.min(...heights) > 1.25) return null;
  return heights.reduce((total, height) => total + height, 0) / heights.length;
}

function snapPlayerToMapGround() {
  if (activeMapId !== 'd2' || !d2MapLoaded) return;
  // Multiplayer spawns already include a floor height sampled from this exact
  // map mesh. Do not replace that authoritative point with a client fallback.
  if (multiplayerRoom) return;
  // A stable camera location for the lobby/loading view before the server
  // supplies an authoritative spawn point.
  player.position.set(10, 4.98, -8);
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
  if (!localAlive || (singlePlayerMode && soloMatchFinished)) {
    horizontalVelocity.set(0, 0, 0);
    playerVelocity.set(0, 0, 0);
    playerAction = 'idle';
    speedReadout.textContent = '0.0';
    return;
  }
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
  if (activeMapId === 'd2' && (player.position.y < -8 || Math.abs(player.position.x) > 56 || Math.abs(player.position.z) > 67)) {
    playerVelocity.set(0, 0, 0);
    horizontalVelocity.set(0, 0, 0);
    if (multiplayerRoom && !voidRecoveryPending) {
      voidRecoveryPending = true;
      multiplayerRoom.send('void');
    } else if (!multiplayerRoom) {
      player.position.set(10, 4.98, -8);
      grounded = true;
    }
    return;
  }
  const groundHeight = getMapGroundHeight(
    player.position.x,
    player.position.z,
    player.position.y + 3,
    player.position.y + 1.2,
  );
  if (groundHeight !== null && player.position.y <= groundHeight) {
    player.position.y = groundHeight;
    playerVelocity.y = 0;
    grounded = true;
  }
  const horizontalSpeed = Math.hypot(
    horizontalVelocity.x,
    horizontalVelocity.z,
  );
  if (!grounded) playerAction = 'jump';
  else if (reloading) playerAction = 'reload';
  else if (triggerHeld && locked) playerAction = 'fire';
  else if (crouching) playerAction = 'crouch';
  else if (horizontalSpeed > 0.25) playerAction = sprinting ? 'run' : 'walk';
  else playerAction = 'idle';
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
  pitch.position.y = THREE.MathUtils.damp(
    pitch.position.y,
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
  if (!singlePlayerMode) connectToMatch();
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
  clearSoloBots();
  killFeed.replaceChildren();
  matchResult.hidden = true;
  killStreak = 0;
  updateKillStreak();
  deathScreen.hidden = true;
  localAlive = true;
  localPositionInitialized = false;
  voidRecoveryPending = false;
  soloMatchFinished = false;
  const wasSinglePlayer = singlePlayerMode;
  singlePlayerMode = false;
  if (wasSinglePlayer && activeMapId !== selectedMapId) {
    activeMapId = selectedMapId;
    applyArenaMap(activeMapId);
    updateMapPresentation(activeMapId);
  }
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
  if (event.code === 'Digit1' && !event.repeat) equipWeapon('rifle');
  if (event.code === 'Digit2' && !event.repeat) equipWeapon('shotgun');
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
window.addEventListener('wheel', (event) => {
  if (!locked) return;
  event.preventDefault();
  equipWeapon(event.deltaY > 0 ? 'shotgun' : 'rifle');
}, { passive: false });
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
  updateSoloBots(now, delta);
  updateRemotePlayers(delta);
  updateCombatHud();
  hitMarker.classList.toggle('hit-marker--active', now < hitMarkerUntil);
  if (!scoreboard.hidden) renderScoreboard();
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(viewModelScene, viewModelCamera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  viewModelCamera.aspect = window.innerWidth / window.innerHeight;
  viewModelCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.setTimeout(() => {
  minimumLoadingTimeElapsed = true;
  finishInitialLoadingWhenReady();
}, 700);
