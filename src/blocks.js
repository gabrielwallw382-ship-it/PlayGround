import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const CELL = 1;
export const BLOCK_GEOMETRY = new RoundedBoxGeometry(0.985, 0.985, 0.985, 2, 0.035);

export const BLOCK_TYPES = {
  concrete: {
    key: 'concrete',
    name: 'Concrete',
    label: 'CONCRETE',
    mass: 150,
    color: 0xb9b4a9,
    tint: 0xffffff,
    roughness: 0.94,
    metalness: 0.02,
    score: 10,
    debris: 0xb2ada2,
    dust: 0xb9b3a7,
    sound: 'concrete',
  },
  brick: {
    key: 'brick',
    name: 'Brick',
    label: 'BRICK',
    mass: 80,
    color: 0x9a6a55,
    tint: 0xffffff,
    roughness: 0.92,
    metalness: 0.01,
    score: 14,
    debris: 0x955c45,
    dust: 0xb58a6f,
    sound: 'brick',
  },
  glass: {
    key: 'glass',
    name: 'Glass',
    label: 'GLASS',
    mass: 30,
    color: 0xa9dbe6,
    tint: 0xf2ffff,
    roughness: 0.07,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    score: 8,
    debris: 0xa9dbe6,
    dust: 0xd4f4fa,
    sound: 'glass',
  },
  wood: {
    key: 'wood',
    name: 'Timber',
    label: 'TIMBER',
    mass: 45,
    color: 0x9a6c41,
    tint: 0xfff4e4,
    roughness: 0.82,
    metalness: 0,
    score: 9,
    debris: 0x8a5c34,
    dust: 0xb98c5c,
    sound: 'wood',
  },
  steel: {
    key: 'steel',
    name: 'Steel',
    label: 'STEEL',
    mass: 260,
    color: 0x8b969c,
    tint: 0xdfe8ec,
    roughness: 0.36,
    metalness: 0.82,
    score: 18,
    debris: 0x7e8a91,
    dust: 0x9aa4a8,
    sound: 'steel',
  },
};

export const BUILD_TYPES = ['concrete', 'brick', 'glass', 'wood', 'steel'];

export function createBlockMaterials(textures) {
  const materials = {};
  for (const [key, type] of Object.entries(BLOCK_TYPES)) {
    if (key === 'glass') {
      materials[key] = new THREE.MeshPhysicalMaterial({
        color: type.color,
        roughness: type.roughness,
        metalness: 0,
        transparent: true,
        opacity: type.opacity,
        envMapIntensity: 1.7,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      continue;
    }
    const map = textures[key];
    const m = new THREE.MeshStandardMaterial({
      color: type.tint,
      map,
      bumpMap: map,
      bumpScale: 0.035,
      roughness: type.roughness,
      metalness: type.metalness,
      envMapIntensity: key === 'steel' ? 1.1 : 0.35,
    });
    materials[key] = m;
  }
  return materials;
}

export function createDebrisMaterials() {
  const out = {};
  for (const [key, type] of Object.entries(BLOCK_TYPES)) {
    out[key] = new THREE.MeshStandardMaterial({
      color: type.debris,
      roughness: type.transparent ? 0.12 : 0.9,
      metalness: key === 'steel' ? 0.7 : 0.02,
      transparent: key === 'glass',
      opacity: key === 'glass' ? 0.52 : 1,
      flatShading: true,
    });
  }
  return out;
}
