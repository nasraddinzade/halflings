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

/** Villager names double as seeds: the same villager always looks alike. */
export const VILLAGER_NAMES: readonly string[] = [
  'Одо', 'Мирта', 'Бран', 'Лилла', 'Тобо', 'Гретта', 'Нед', 'Пиппа',
  'Хэл', 'Дора', 'Сэм', 'Роза', 'Марло', 'Тилли', 'Бэрри', 'Мод',
  'Уилл', 'Нора', 'Джем', 'Флора',
  'Кэл', 'Бесс', 'Орин', 'Мэйв', 'Тод',
  'Ива', 'Гиб', 'Лоя', 'Фен', 'Руфь',
];
