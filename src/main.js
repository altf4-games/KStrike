import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0f1115');
scene.fog = new THREE.FogExp2('#0f1115', 0.024);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.03, 180);
const player = new THREE.Group();
const pitch = new THREE.Group();
player.position.set(12, 0, 10);
pitch.add(camera); player.add(pitch); scene.add(player);
camera.position.set(0, 1.68, 0);

const ambient = new THREE.HemisphereLight('#b7d5f6', '#14221d', 1.45);
scene.add(ambient);
const key = new THREE.DirectionalLight('#d9ecff', 3.2);
key.position.set(-14, 22, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -35; key.shadow.camera.right = 35; key.shadow.camera.top = 35; key.shadow.camera.bottom = -35;
scene.add(key);
const redLight = new THREE.PointLight('#ef4444', 20, 22, 2);
redLight.position.set(-10, 4, -8); scene.add(redLight);
const blueLight = new THREE.PointLight('#2563eb', 18, 20, 2);
blueLight.position.set(12, 5, -5); scene.add(blueLight);

const concrete = new THREE.MeshStandardMaterial({ color: '#4a5055', roughness: 0.86, metalness: 0.05 });
const dark = new THREE.MeshStandardMaterial({ color: '#23282d', roughness: 0.82 });
const trim = new THREE.MeshStandardMaterial({ color: '#1b2633', roughness: 0.42, metalness: 0.5 });
const emissiveBlue = new THREE.MeshStandardMaterial({ color: '#2563eb', emissive: '#2563eb', emissiveIntensity: 2.3 });
const emissiveRed = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 2.3 });
const colliders = [];

function box(width, height, depth, x, y, z, material = concrete, solid = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  if (solid) colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, height });
  return mesh;
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), concrete);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// Compact, readable deathmatch arena assembled from simple collision-ready blocks.
box(16, 5, 1, 0, 2.5, -12); box(1, 5, 24, -15, 2.5, 0); box(1, 5, 24, 15, 2.5, 0); box(30, 5, 1, 0, 2.5, 12);
box(7, 3.5, 3, -7, 1.75, -4); box(7, 3.5, 3, 7, 1.75, 3);
box(4, 6, 4, -6, 3, 6, dark); box(4, 6, 4, 7, 3, -7, dark);
box(8, 1.1, 2.2, 0, 0.55, 8, dark); box(2, 1.1, 8, -10, 0.55, 1, dark); box(2, 1.1, 8, 10, 0.55, -1, dark);
box(24, 0.16, 0.24, 0, 3.8, -11.42, trim, false);
box(0.18, 3.2, 0.25, -14.42, 3.4, -4, emissiveRed, false); box(0.18, 3.2, 0.25, 14.42, 3.4, -4, emissiveBlue, false);

for (let x = -10; x <= 10; x += 5) {
  for (let z = -8; z <= 8; z += 5) {
    const slab = box(1.65, 0.12, 0.05, x, 0.07, z, trim, false);
    slab.rotation.y = Math.PI / 2;
  }
}

const targetGroup = new THREE.Group(); scene.add(targetGroup);
for (const [x, z, mat] of [[-3, -8, emissiveRed], [3, -8, emissiveBlue], [0, 1, emissiveRed]]) {
  const target = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 24), mat);
  target.rotation.x = Math.PI / 2; target.position.set(x, 2.4, z); target.castShadow = true;
  targetGroup.add(target);
  box(0.12, 2.25, 0.12, x, 1.1, z + 0.08, trim, false);
}

const keys = new Set();
const playerVelocity = new THREE.Vector3();
const horizontalVelocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const playerRadius = 0.38;
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
const intro = document.querySelector('#intro-screen');
const enterButton = document.querySelector('#enter-button');
const speedReadout = document.querySelector('#movement-readout strong');

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
  const nextX = player.position.x + horizontalVelocity.x * delta;
  const nextZ = player.position.z + horizontalVelocity.z * delta;
  if (!blocksPosition(nextX, player.position.z)) player.position.x = nextX;
  else horizontalVelocity.x = 0;
  if (!blocksPosition(player.position.x, nextZ)) player.position.z = nextZ;
  else horizontalVelocity.z = 0;
}

function movePlayer(delta) {
  if (!locked) { speedReadout.textContent = '0.0'; return; }
  direction.set(0, 0, 0);
  if (keys.has('KeyW')) direction.z -= 1;
  if (keys.has('KeyS')) direction.z += 1;
  if (keys.has('KeyA')) direction.x -= 1;
  if (keys.has('KeyD')) direction.x += 1;
  const hasInput = direction.lengthSq() > 0;
  crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  const sprinting = !crouching && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  let targetSpeed = crouching ? crouchSpeed : (sprinting ? sprintSpeed : walkSpeed);
  const targetVelocity = new THREE.Vector3();
  if (hasInput) {
    direction.normalize().applyAxisAngle(up, player.rotation.y);
    targetVelocity.copy(direction).multiplyScalar(targetSpeed);
  }
  const response = hasInput ? 15 : 7;
  horizontalVelocity.x = THREE.MathUtils.damp(horizontalVelocity.x, targetVelocity.x, response, delta);
  horizontalVelocity.z = THREE.MathUtils.damp(horizontalVelocity.z, targetVelocity.z, response, delta);
  moveWithCollision(delta);
  if (grounded && keys.has('Space') && !crouching) { playerVelocity.y = jumpVelocity; grounded = false; }
  playerVelocity.y -= gravity * delta;
  player.position.y += playerVelocity.y * delta;
  if (player.position.y <= 0) { player.position.y = 0; playerVelocity.y = 0; grounded = true; }
  const horizontalSpeed = Math.hypot(horizontalVelocity.x, horizontalVelocity.z);
  if (grounded && horizontalSpeed > 0.1) bobTime += delta * (sprinting ? 13 : crouching ? 7 : 10);
  const bobAmount = grounded ? Math.sin(bobTime) * Math.min(horizontalSpeed / sprintSpeed, 1) * 0.026 : 0;
  const targetHeight = crouching ? crouchHeight : standHeight;
  camera.position.y = THREE.MathUtils.damp(camera.position.y, targetHeight + bobAmount, 18, delta);
  camera.fov = THREE.MathUtils.damp(camera.fov, sprinting && hasInput ? 67 : 62, 10, delta);
  camera.updateProjectionMatrix();
  speedReadout.textContent = horizontalSpeed.toFixed(1);
}

function lockArena() { canvas.requestPointerLock(); }
enterButton.addEventListener('click', lockArena);
canvas.addEventListener('click', () => { if (!locked) lockArena(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  intro.classList.toggle('intro--dismissed', locked);
  if (!locked) { intro.hidden = false; enterButton.innerHTML = 'RESUME ARENA <span>↗</span>'; }
});
document.addEventListener('mousemove', (event) => {
  if (!locked) return;
  player.rotation.y -= event.movementX * 0.0021;
  pitch.rotation.x = THREE.MathUtils.clamp(pitch.rotation.x - event.movementY * 0.0021, -1.42, 1.42);
});
window.addEventListener('keydown', (event) => { if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault(); keys.add(event.code); });
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

const clock = new THREE.Clock();
function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  targetGroup.children.forEach((child, index) => { if (child.geometry.type === 'CylinderGeometry') child.position.y = 2.4 + Math.sin(t * 1.45 + index) * 0.12; });
  movePlayer(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});

window.setTimeout(() => {
  document.querySelector('#loading-screen').classList.add('loading--done');
  document.querySelector('#intro-screen').hidden = false;
}, 700);
