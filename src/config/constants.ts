// Единицы: метры, секунды, радианы.
// Весь мир строится от роста полурослика в 1.1 м.

// --- персонаж ---------------------------------------------------------------

/** Приводит модель из родного масштаба Blender (2.1804) к росту 1.1 м. */
export const CHARACTER_SCALE = 0.50451;
export const HALFLING_HEIGHT = 1.1;

/**
 * Модель KayKit смотрит в +Z: носки ботинок уходят до z = 0.28, а пятки
 * только до z = -0.13. В three.js `lookAt` целится тем же +Z, так что
 * доворот не нужен. Если персонаж поедет спиной вперёд — сюда Math.PI.
 */
export const MODEL_YAW_OFFSET = 0;

// --- движение ---------------------------------------------------------------

export const WALK_SPEED = 1.6;
export const RUN_SPEED = 3.6;

/** Разгон и торможение по земле. В воздухе управление ослаблено. */
export const GROUND_ACCELERATION = 14;
export const GROUND_DECELERATION = 18;
export const AIR_ACCELERATION = 3.5;

/** Скорость доворота модели к направлению движения. */
export const TURN_RATE = 14;

// --- прыжок и гравитация ----------------------------------------------------

/** Заметно больше земной: с реальными 9.81 прыжок ощущается ватным. */
export const GRAVITY = 19;
export const JUMP_HEIGHT = 0.55;
/** Начальная скорость, дающая ровно JUMP_HEIGHT. */
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

/** Прыжок засчитывается ещё столько секунд после схода с края. */
export const COYOTE_TIME = 0.12;
/** Нажатие пробела перед приземлением помнится столько секунд. */
export const JUMP_BUFFER = 0.14;

// --- стамина ----------------------------------------------------------------

export const STAMINA_MAX = 6;
export const STAMINA_DRAIN = 1;
export const STAMINA_REGEN = 0.9;
/** Пауза перед восстановлением после того, как отпустили бег. */
export const STAMINA_REGEN_DELAY = 0.7;
/** Пока стамина ниже — бежать нельзя, чтобы не дёргаться на нуле. */
export const STAMINA_RUN_THRESHOLD = 0.8;

// --- контакт с землёй -------------------------------------------------------

/** Круче — не залезть. 50°. */
export const MAX_SLOPE = (50 * Math.PI) / 180;
/** На спуске персонаж притягивается к земле, если она не дальше этого. */
export const GROUND_SNAP = 0.4;
/** Порог, ниже которого подъём считается ступенькой и берётся без прыжка. */
export const STEP_HEIGHT = 0.15;

// --- камера -----------------------------------------------------------------

export const CAMERA_DISTANCE = 3.0;
/**
 * Точка, за которой следит камера. 0.95 приходилось на макушку, и
 * персонаж целиком уходил под центр кадра — целимся в грудь.
 */
export const CAMERA_TARGET_HEIGHT = 0.78;
export const CAMERA_FOV = 55;
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 500;
export const CAMERA_MIN_PITCH = (-35 * Math.PI) / 180;
export const CAMERA_MAX_PITCH = (65 * Math.PI) / 180;
/** Скорость подтягивания камеры к цели: больше — жёстче. */
export const CAMERA_LAG = 12;
export const MOUSE_SENSITIVITY = 0.0022;
/** Зазор между камерой и склоном, чтобы не смотреть сквозь землю. */
export const CAMERA_COLLISION_PADDING = 0.25;

// --- долина -----------------------------------------------------------------

export const VALLEY_SIZE = 256;
export const VALLEY_RADIUS = VALLEY_SIZE / 2;
/** Один квад на метр. 256×256 квадов ≈ 131 тыс. треугольников. */
export const VALLEY_SEGMENTS = 256;

export const TERRAIN_SEED = 20260815;
/**
 * Борт долины — диегетическая граница мира (решение №4). Чтобы он
 * действительно останавливал, а не просто намекал, склон борта должен
 * быть круче MAX_SLOPE: тогда игрока держит проверка уклона, а не
 * невидимая стена. Высота и ширина полосы подобраны так, что максимум
 * уклона уходит за 60°.
 */
export const RIM_HEIGHT = 30;
/** Доля радиуса, после которой земля начинает подниматься к борту. */
export const RIM_START = 0.82;
/** Степень кривой борта: >1 делает верх круче подножия. */
export const RIM_CURVE = 2.2;
export const HILL_HEIGHT = 3.4;
export const HILL_FREQUENCY = 0.013;
export const DETAIL_HEIGHT = 0.45;
export const DETAIL_FREQUENCY = 0.075;
/** Внутри этого радиуса рельеф приглушён — там встанет деревня. */
export const CENTER_CALM_INNER = 0.05;
export const CENTER_CALM_OUTER = 0.34;

/** Потолок для зондирующих лучей: заведомо выше любой точки рельефа. */
export const TERRAIN_PROBE_HEIGHT = RIM_HEIGHT + HILL_HEIGHT + DETAIL_HEIGHT + 10;

// --- река -------------------------------------------------------------------

export const RIVER_ENABLED = true;
/** Русло идёт с запада на восток южнее деревни, огороды остаются в стороне. */
export const RIVER_OFFSET_Z = -22;
export const RIVER_AMPLITUDE = 12;
export const RIVER_WAVINESS = 0.016;
/** Полуширина русла: река шириной шесть метров. */
export const RIVER_WIDTH = 3;
/** Насколько дно ниже окрестной земли. */
export const RIVER_DEPTH = 0.75;
/**
 * Вода стоит ниже окрестной земли на столько. Разница с RIVER_DEPTH и
 * есть глубина: 0.45 м полурослику ростом 1.1 м по колено, так что
 * реку можно перейти вброд, а не обходить.
 */
export const RIVER_WATER_DEPTH = 0.3;
/** Берега: за этой долей радиуса русло сходит на нет. */
export const RIVER_FADE_START = 0.6;
export const RIVER_FADE_END = 0.78;
/** Сегментов вдоль русла и поперёк — на ленту воды. */
export const RIVER_SEGMENTS_ALONG = 220;
export const RIVER_SEGMENTS_ACROSS = 6;
/** Рябь: маленькая амплитуда, иначе вода выглядит как желе. */
export const RIVER_WAVE_HEIGHT = 0.035;
export const RIVER_WAVE_SPEED = 1.1;

export const SPAWN_X = 0;
export const SPAWN_Z = 0;

// --- анимации ---------------------------------------------------------------

/**
 * «Родная» скорость клипов: с какой скоростью персонаж как бы едет,
 * когда клип играется с timeScale = 1. Root motion в клипах KayKit
 * отсутствует, вывести это число из файла нельзя — подбирается глазом,
 * пока ноги не перестанут проскальзывать.
 */
export const WALK_CLIP_SPEED = 1.45;
export const RUN_CLIP_SPEED = 3.15;
/** Ограничитель, чтобы на разгоне клип не срывался в мельтешение. */
export const CLIP_TIME_SCALE_MIN = 0.65;
export const CLIP_TIME_SCALE_MAX = 1.7;

export const ANIM_FADE = 0.18;
export const ANIM_FADE_FAST = 0.08;

// --- цикл и рендер ----------------------------------------------------------

/** Потолок кадрового шага: после переключения вкладки delta огромная,
 *  и без ограничителя персонаж за один кадр проваливается сквозь землю. */
export const MAX_DELTA = 0.05;

export const PIXEL_RATIO_CAP = 2;

// --- стилизация -------------------------------------------------------------

/** Ступеней освещения в toon-рампе: тень, полутон, свет. */
export const TOON_STEPS = 3;
/** Толщина обводки в метрах, в пространстве камеры. */
export const OUTLINE_THICKNESS = 0.006;
/** Во сколько раз обводка темнее самого объекта. */
export const OUTLINE_DARKEN = 0.45;

/** Туман: дальше FOG_FAR всё растворяется в цвете неба. */
export const FOG_NEAR = 70;
export const FOG_FAR = 260;

/** Сетка паковых текстур: 8x4 ячейки (docs/ASSETS.md, раздел 6).
 *  Ячейка = зона материала, так её задал художник пака. */
export const SOURCE_COLUMNS = 8;
export const SOURCE_ROWS = 4;
/** Сколько вариантов одежды различает атлас жителей. */
export const CLOTH_VARIANT_COUNT = 6;

// --- жители -----------------------------------------------------------------

/** Одна константа на всё население: false — деревня не собирается. */
export const VILLAGERS_ENABLED = true;
export const VILLAGER_COUNT = 30;

/** Жители не бегут по делам, а идут — медленнее игрока. */
export const VILLAGER_WALK_SPEED = 1.15;
/** «Родная» скорость Walking_A: под неё подгоняется timeScale. */
export const VILLAGER_WALK_CLIP_SPEED = 1.45;
export const VILLAGER_TURN_RATE = 8;
/** Насколько близко надо подойти, чтобы считать, что дошёл. */
export const VILLAGER_ARRIVE_RADIUS = 0.35;

/** Первый простой после загрузки: от нуля, чтобы деревня сразу разошлась. */
export const VILLAGER_FIRST_IDLE_MAX = 14;
/** Разброс длительностей: деревня не должна работать по свистку. */
export const VILLAGER_IDLE_MIN = 2.5;
export const VILLAGER_IDLE_MAX = 7;
export const VILLAGER_WORK_MIN = 6;
export const VILLAGER_WORK_MAX = 16;

// --- столкновения -----------------------------------------------------------

/** Полурослик в плане: плечи около 0.5 м, значит радиус четверть метра. */
export const PLAYER_RADIUS = 0.25;
export const VILLAGER_RADIUS = 0.25;
/** Круг, которым дверь норы не пускает внутрь холма. */
export const DOOR_BLOCK_RADIUS = 0.8;
/** Насколько мягко жители расталкивают друг друга: 1 — сразу до конца. */
export const SEPARATION_STRENGTH = 0.5;

// --- LOD и отсечение --------------------------------------------------------

/**
 * Рест-поза даёт слишком тесную сферу отсечения: в движении руки и ноги
 * выходят за неё, и персонаж мигает на краю экрана. Расширяем с запасом
 * и оставляем отсечение включённым — это дешевле, чем рисовать всех.
 */
export const CHARACTER_BOUNDS_MARGIN = 1.6;

/** Ближе этого житель полностью подробный: с обводкой и анимацией каждый кадр. */
export const LOD_NEAR = 22;
/** Дальше этого житель не рисуется вовсе. */
export const LOD_CULL = 95;
/** На средней дистанции микшер обновляется раз в N кадров. */
export const LOD_ANIMATION_STRIDE = 3;

// --- растительность ---------------------------------------------------------

export const GRASS_ENABLED = true;
/** Пучков травы на всю долину. Рисуются инстансингом, чанками. */
export const GRASS_COUNT = 30000;
export const BUSH_COUNT = 1200;
/** Трава ~0.3 м при росте полурослика 1.1 м. */
export const GRASS_HEIGHT = 0.3;
/**
 * Куст по пояс полурослику. При 0.45 он выходил почти в его рост и
 * читался как валун, а не как куст.
 */
export const BUSH_RADIUS = 0.26;
/** Сетка чанков: каждый — свой InstancedMesh со своей сферой отсечения. */
export const VEGETATION_CHUNKS = 8;
/** На склонах круче этого трава не растёт. */
export const VEGETATION_MAX_SLOPE = (38 * Math.PI) / 180;
export const VEGETATION_SEED = 7734;

export const SHADOW_MAP_SIZE = 2048;
/** Полуразмер зоны, которую накрывает карта теней вокруг игрока. */
export const SHADOW_EXTENT = 14;

/**
 * Принимают ли персонажи тени. Выключено намеренно: карта теней даёт
 * около 1.4 см на тексель, а детали лица мельче — самозатенение
 * рассыпается в грязные пятна вокруг глаз и рта. Тени персонажи при
 * этом отбрасывают, просто не ловят их на себя. Поставьте true,
 * если захотите, чтобы жители затеняли друг друга.
 */
export const CHARACTERS_RECEIVE_SHADOW = false;

// --- отладка ----------------------------------------------------------------

/** Одна константа на всю отладочную панель: false — модуль не создаётся. */
export const DEBUG_PANEL = true;
/** Как часто панель перерисовывается. Каждый кадр — и дорого, и нечитаемо. */
export const DEBUG_REFRESH = 0.25;
