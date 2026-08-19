// Catalog of parts and the rules for assembling villagers (decision #2).
//
// Every character in the pack sits on the same Rig_Medium with the same
// rest pose, so parts are interchangeable: a barbarian head fits onto a
// mage body with no retargeting. Verified in docs/ASSETS.md, section 3.

export type VillagerRole = 'gardener' | 'miller' | 'fisher' | 'idler';

export interface VillagerConfig {
  id: string;
  head: string;
  body: string;
  arms: string;
  legs: string;
  /** Column indices in the 8×4 atlas: UV offset for each group of parts. */
  palette: { head: number; body: number; legs: number };
  role: VillagerRole;
}

/** Which file a part is taken from and what its meshes are called. */
export interface PartSource {
  /** Key of the file in the model catalog. */
  file: PartFile;
  /** One mesh for head and body, two for arms and legs. */
  meshes: readonly string[];
}

export type PartFile = 'Barbarian' | 'Knight' | 'Mage' | 'Ranger' | 'Rogue' | 'Rogue_Hooded';

export const PART_FILES: readonly PartFile[] = [
  'Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded',
];

export const HEADS: Readonly<Record<string, PartSource>> = {
  rogue: { file: 'Rogue', meshes: ['Rogue_Head'] },
  hooded: { file: 'Rogue_Hooded', meshes: ['RogueHooded_Head'] },
  barbarian: { file: 'Barbarian', meshes: ['Barbarian_Head'] },
  knight: { file: 'Knight', meshes: ['Knight_Head'] },
  mage: { file: 'Mage', meshes: ['Mage_Head'] },
  ranger: { file: 'Ranger', meshes: ['Ranger_Head'] },
};

/**
 * Ranger_Body is left out on purpose: 3461 triangles, twice as expensive
 * as any other body. For a villager, and there will be dozens of them in
 * the valley, that is not justified (docs/ASSETS.md, section 1).
 */
export const BODIES: Readonly<Record<string, PartSource>> = {
  rogue: { file: 'Rogue', meshes: ['Rogue_Body'] },
  hooded: { file: 'Rogue_Hooded', meshes: ['RogueHooded_Body'] },
  barbarian: { file: 'Barbarian', meshes: ['Barbarian_Body'] },
  knight: { file: 'Knight', meshes: ['Knight_Body'] },
  mage: { file: 'Mage', meshes: ['Mage_Body'] },
};

export const ARMS: Readonly<Record<string, PartSource>> = {
  rogue: { file: 'Rogue', meshes: ['Rogue_ArmLeft', 'Rogue_ArmRight'] },
  barbarian: { file: 'Barbarian', meshes: ['Barbarian_ArmLeft', 'Barbarian_ArmRight'] },
  knight: { file: 'Knight', meshes: ['Knight_ArmLeft', 'Knight_ArmRight'] },
  mage: { file: 'Mage', meshes: ['Mage_ArmLeft', 'Mage_ArmRight'] },
  ranger: { file: 'Ranger', meshes: ['Ranger_ArmLeft', 'Ranger_ArmRight'] },
};

export const LEGS: Readonly<Record<string, PartSource>> = {
  rogue: { file: 'Rogue', meshes: ['Rogue_LegLeft', 'Rogue_LegRight'] },
  barbarian: { file: 'Barbarian', meshes: ['Barbarian_LegLeft', 'Barbarian_LegRight'] },
  knight: { file: 'Knight', meshes: ['Knight_LegLeft', 'Knight_LegRight'] },
  mage: { file: 'Mage', meshes: ['Mage_LegLeft', 'Mage_LegRight'] },
};

export const ROLES: readonly VillagerRole[] = ['gardener', 'miller', 'fisher', 'idler'];

/**
 * Villager names double as seeds: the same villager always looks alike.
 *
 * Changing this list is not cosmetic. configFromSeed() hashes the name, so
 * a rename reshuffles that villager's parts, palette and role — and a name
 * is the only thing tying a villager to their appearance between sessions.
 *
 * The register is an English parish register rather than fantasy: nothing
 * from Tolkien's legendarium is allowed anywhere in this repository, and
 * the hobbit given names are a wide net — Perry, Ned, Odo and Myrtle are
 * all his, down to one-line mentions in the Shire family trees.
 */
export const VILLAGER_NAMES: readonly string[] = [
  'Anselm', 'Joan', 'Perkin', 'Rohese', 'Ivo', 'Tabitha',
  'Osbert', 'Meg', 'Gervase', 'Custance', 'Reuben', 'Avelina',
  'Kenelm', 'Grace', 'Lambert', 'Emmot', 'Simeon', 'Kezia',
  'Wilfrid', 'Petronilla', 'Alban', 'Maud', 'Ranulf', 'Tamsin',
  'Ephraim', 'Mariot', 'Kester', 'Juliana', 'Amias', 'Hawise',
];

/**
 * Which pack file the player's own model was cut from.
 *
 * assets/characters/halfling_base.glb is the pack's Rogue with the cloak,
 * the weapons, the camera and the light taken out (docs/ASSETS.md), so his
 * UVs address the Rogue's zone of the atlas and nobody else's.
 */
export const PLAYER_PART_FILE: PartFile = 'Rogue';

/**
 * What the player wears.
 *
 * Written down rather than drawn from a seed: he is the one character the
 * user looks at for the whole game, and he should not change his shirt
 * because somebody edited the villager name list. The parts are the ones
 * his model already has; only the palette does any work here.
 */
export const PLAYER_LOOK: VillagerConfig = {
  id: 'player',
  head: 'Rogue_Head',
  body: 'Rogue_Body',
  arms: 'Rogue_Arms',
  legs: 'Rogue_Legs',
  palette: { head: 0, body: 3, legs: 5 },
  role: 'idler',
};
