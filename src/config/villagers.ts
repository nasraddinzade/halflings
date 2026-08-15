// Каталог частей и правила сборки жителей (решение №2).
//
// Все персонажи пака сидят на одном Rig_Medium с одинаковой рест-позой,
// поэтому части взаимозаменяемы: голова барбарианца встаёт на тело мага
// без ретаргета. Проверено в docs/ASSETS.md, раздел 3.

export type VillagerRole = 'gardener' | 'miller' | 'fisher' | 'idler';

export interface VillagerConfig {
  id: string;
  head: string;
  body: string;
  arms: string;
  legs: string;
  /** Индексы колонок атласа 8×4: смещение UV для каждой группы частей. */
  palette: { head: number; body: number; legs: number };
  role: VillagerRole;
}

/** Из какого файла берётся часть и как называются её меши. */
export interface PartSource {
  /** Ключ файла в каталоге моделей. */
  file: PartFile;
  /** Один меш для головы и тела, два — для рук и ног. */
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
 * Ranger_Body сюда не входит намеренно: 3461 треугольник, вдвое дороже
 * любого другого тела. Для жителя, которых в долине будут десятки,
 * это не оправдано (docs/ASSETS.md, раздел 1).
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

/** Имена жителей — они же seed'ы: один и тот же житель выглядит одинаково. */
export const VILLAGER_NAMES: readonly string[] = [
  'Одо', 'Мирта', 'Бран', 'Лилла', 'Тобо', 'Гретта', 'Нед', 'Пиппа',
  'Хэл', 'Дора', 'Сэм', 'Роза', 'Марло', 'Тилли', 'Бэрри', 'Мод',
  'Уилл', 'Нора', 'Джем', 'Флора',
  'Кэл', 'Бесс', 'Орин', 'Мэйв', 'Тод',
  'Ива', 'Гиб', 'Лоя', 'Фен', 'Руфь',
];
