// Dungeon Joe's eight zone palettes (ART_AUDIO §2), their prop styles and hazards, as they washed up in the Shoal.
export interface ZoneLook {
  id: number;
  name: string;
  floor: string;
  floor2: string;
  wall: string;
  wallTop: string;
  accent: string;
  hazard: string;
  colors: string[];
  props: string;
  hazardKind: 'water' | 'poisonCloud' | 'thorns' | 'lava' | 'ice' | 'oil' | 'void';
  hazardName: string;
  style: 'crypt' | 'caverns' | 'sewers' | 'forest' | 'forge' | 'reliquary' | 'citadel' | 'abyss';
}

export const ZONES: ZoneLook[] = [
  { id: 1, name: 'Mossy Crypt', floor: '#2b3326', floor2: '#303a2a', wall: '#1c2219', wallTop: '#4a5a44', accent: '#a9b7a0', hazard: '#3a4a30', colors: ['#2f3d2a', '#a9b7a0', '#e8e1c8', '#6b7f66'], props: 'coffin', hazardKind: 'water', hazardName: 'grave water', style: 'crypt' },
  { id: 2, name: 'Fungal Caverns', floor: '#2a2236', floor2: '#2f263d', wall: '#1a1424', wallTop: '#5a3f7a', accent: '#5fd3c0', hazard: '#3a5a20', colors: ['#3b2a4f', '#5fd3c0', '#8b5a3c', '#c58cff'], props: 'mushroom', hazardKind: 'poisonCloud', hazardName: 'spore cloud', style: 'caverns' },
  { id: 3, name: 'Drowned Sewers', floor: '#232e22', floor2: '#283426', wall: '#121a12', wallTop: '#4a5a3a', accent: '#8fa37a', hazard: '#0e1a14', colors: ['#2d3b2b', '#7d5a2e', '#0e1a14', '#8fa37a'], props: 'barrel', hazardKind: 'water', hazardName: 'sewage', style: 'sewers' },
  { id: 4, name: 'Hollow Forest', floor: '#2a2a18', floor2: '#30301c', wall: '#1a1408', wallTop: '#5a3a1a', accent: '#e6b84a', hazard: '#3a4a1a', colors: ['#c8621f', '#1f3d22', '#e6b84a', '#5a3a1a'], props: 'stump', hazardKind: 'thorns', hazardName: 'thorns', style: 'forest' },
  { id: 5, name: 'Ashen Forge', floor: '#2a1814', floor2: '#301a16', wall: '#120808', wallTop: '#5a2a1a', accent: '#ff7a1a', hazard: '#ff4a10', colors: ['#8e1b1b', '#1a1010', '#ff7a1a', '#ffd27a'], props: 'anvil', hazardKind: 'lava', hazardName: 'molten slag', style: 'forge' },
  { id: 6, name: 'Frozen Reliquary', floor: '#2a3a4a', floor2: '#30404f', wall: '#1a2430', wallTop: '#6a8aaa', accent: '#d4af37', hazard: '#a8d8f0', colors: ['#9ad0ff', '#f4f8ff', '#d4af37', '#3a5a8a'], props: 'crystal', hazardKind: 'ice', hazardName: 'black ice', style: 'reliquary' },
  { id: 7, name: 'Clockwork Citadel', floor: '#22202a', floor2: '#28252f', wall: '#121018', wallTop: '#6a5a2a', accent: '#2aa198', hazard: '#b08de8', colors: ['#b08d3c', '#2aa198', '#6c4ab6', '#1a1a22'], props: 'gear', hazardKind: 'oil', hazardName: 'hot oil', style: 'citadel' },
  { id: 8, name: 'The Abyss', floor: '#120a1c', floor2: '#160c22', wall: '#06030a', wallTop: '#2a0d3f', accent: '#7a2bd6', hazard: '#06030a', colors: ['#06030a', '#7a2bd6', '#ffffff', '#2a0d3f'], props: 'void', hazardKind: 'void', hazardName: 'the void', style: 'abyss' },
];

export function zoneLook(z: number): ZoneLook {
  return ZONES[Math.max(0, Math.min(7, z - 1))]!;
}
