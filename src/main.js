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

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(14, 8, 20);

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
const meshes = [];

function box(width, height, depth, x, y, z, material = concrete) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh); return mesh;
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), concrete);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// Compact, readable deathmatch arena assembled from simple collision-ready blocks.
box(16, 5, 1, 0, 2.5, -12); box(1, 5, 24, -15, 2.5, 0); box(1, 5, 24, 15, 2.5, 0);
box(7, 3.5, 3, -7, 1.75, -4); box(7, 3.5, 3, 7, 1.75, 3);
box(4, 6, 4, -6, 3, 6, dark); box(4, 6, 4, 7, 3, -7, dark);
box(8, 1.1, 2.2, 0, 0.55, 8, dark); box(2, 1.1, 8, -10, 0.55, 1, dark); box(2, 1.1, 8, 10, 0.55, -1, dark);
box(24, 0.16, 0.24, 0, 3.8, -11.42, trim);
box(0.18, 3.2, 0.25, -14.42, 3.4, -4, emissiveRed); box(0.18, 3.2, 0.25, 14.42, 3.4, -4, emissiveBlue);

for (let x = -10; x <= 10; x += 5) {
  for (let z = -8; z <= 8; z += 5) {
    const slab = box(1.65, 0.12, 0.05, x, 0.07, z, trim);
    slab.rotation.y = Math.PI / 2;
  }
}

const targetGroup = new THREE.Group(); scene.add(targetGroup);
for (const [x, z, mat] of [[-3, -8, emissiveRed], [3, -8, emissiveBlue], [0, 1, emissiveRed]]) {
  const target = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.12, 24), mat);
  target.rotation.x = Math.PI / 2; target.position.set(x, 2.4, z); target.castShadow = true;
  targetGroup.add(target);
  box(0.12, 2.25, 0.12, x, 1.1, z + 0.08, trim);
}

const clock = new THREE.Clock();
function animate() {
  const t = clock.getElapsedTime();
  targetGroup.children.forEach((child, index) => { if (child.geometry.type === 'CylinderGeometry') child.position.y = 2.4 + Math.sin(t * 1.45 + index) * 0.12; });
  camera.position.x = 14 + Math.sin(t * 0.15) * 1.8;
  camera.lookAt(0, 2.1, -2);
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
document.querySelector('#enter-button').addEventListener('click', () => document.querySelector('#intro-screen').classList.add('intro--dismissed'));
