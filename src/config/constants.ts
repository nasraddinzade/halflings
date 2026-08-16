// Units: metres, seconds, radians.
// The whole world is scaled from the halfling height of 1.1 m.

// --- character --------------------------------------------------------------

/** Brings the model from Blender's native scale (2.1804) to 1.1 m tall. */
export const CHARACTER_SCALE = 0.50451;
export const HALFLING_HEIGHT = 1.1;

/**
 * The KayKit model faces +Z: the boot toes reach out to z = 0.28 while the
 * heels only reach z = -0.13. In three.js `lookAt` aims along that same +Z,
 * so no extra rotation is needed. If the character starts moving backwards,
 * put Math.PI here.
 */
export const MODEL_YAW_OFFSET = 0;

// --- movement ---------------------------------------------------------------

export const WALK_SPEED = 1.6;
export const RUN_SPEED = 3.6;

/** Acceleration and braking on the ground. Air control is weakened. */
export const GROUND_ACCELERATION = 14;
export const GROUND_DECELERATION = 18;
export const AIR_ACCELERATION = 3.5;

/** How fast the model turns to face the movement direction. */
export const TURN_RATE = 14;

// --- jump and gravity -------------------------------------------------------

/** Well above Earth's: at a real 9.81 the jump feels limp. */
export const GRAVITY = 19;
export const JUMP_HEIGHT = 0.55;
/** Initial velocity that yields exactly JUMP_HEIGHT. */
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);

/** A jump still counts for this many seconds after leaving an edge. */
export const COYOTE_TIME = 0.12;
/** A space press before landing is remembered for this many seconds. */
export const JUMP_BUFFER = 0.14;

// --- stamina ----------------------------------------------------------------

export const STAMINA_MAX = 6;
export const STAMINA_DRAIN = 1;
export const STAMINA_REGEN = 0.9;
/** Pause before regen starts once the run key is released. */
export const STAMINA_REGEN_DELAY = 0.7;
/** Below this you cannot run, so it does not stutter around zero. */
export const STAMINA_RUN_THRESHOLD = 0.8;

// --- ground contact ---------------------------------------------------------

/** Anything steeper cannot be climbed. 50°. */
export const MAX_SLOPE = (50 * Math.PI) / 180;
/** Downhill the character is pulled to the ground if it is within this. */
export const GROUND_SNAP = 0.4;
/** Threshold below which a rise counts as a step, taken without a jump. */
export const STEP_HEIGHT = 0.15;

// --- camera -----------------------------------------------------------------

export const CAMERA_DISTANCE = 3.0;
/**
 * The point the camera tracks. 0.95 landed on the top of the head and the
 * whole character dropped below the centre of frame — aim at the chest.
 */
export const CAMERA_TARGET_HEIGHT = 0.78;
export const CAMERA_FOV = 55;
export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 500;
export const CAMERA_MIN_PITCH = (-35 * Math.PI) / 180;
export const CAMERA_MAX_PITCH = (65 * Math.PI) / 180;
/** How fast the camera catches up to its target: higher is stiffer. */
export const CAMERA_LAG = 12;
export const MOUSE_SENSITIVITY = 0.0022;
/** Gap between camera and slope, so we do not see through the ground. */
export const CAMERA_COLLISION_PADDING = 0.25;

// --- valley -----------------------------------------------------------------

export const VALLEY_SIZE = 256;
export const VALLEY_RADIUS = VALLEY_SIZE / 2;
/** One quad per metre. 256×256 quads ≈ 131k triangles. */
export const VALLEY_SEGMENTS = 256;

export const TERRAIN_SEED = 20260815;
/**
 * The valley rim is the diegetic edge of the world (decision #4). For it
 * to actually stop the player rather than merely hint, the rim slope has
 * to be steeper than MAX_SLOPE: then it is the slope check that holds the
 * player, not an invisible wall. Height and band width are chosen so the
 * peak slope goes past 60°.
 */
export const RIM_HEIGHT = 30;
/** Fraction of the radius past which the ground starts rising to the rim. */
export const RIM_START = 0.82;
/** Exponent of the rim curve: >1 makes the top steeper than the foot. */
export const RIM_CURVE = 2.2;
export const HILL_HEIGHT = 3.4;
export const HILL_FREQUENCY = 0.013;
export const DETAIL_HEIGHT = 0.45;
export const DETAIL_FREQUENCY = 0.075;
/** Inside this radius the terrain is damped — the village stands there. */
export const CENTER_CALM_INNER = 0.05;
export const CENTER_CALM_OUTER = 0.34;

/** Ceiling for probe rays: safely above any point of the terrain. */
export const TERRAIN_PROBE_HEIGHT = RIM_HEIGHT + HILL_HEIGHT + DETAIL_HEIGHT + 10;

// --- river ------------------------------------------------------------------

export const RIVER_ENABLED = true;
/** The bed runs west to east south of the village, clear of the gardens. */
export const RIVER_OFFSET_Z = -22;
export const RIVER_AMPLITUDE = 12;
export const RIVER_WAVINESS = 0.016;
/** Half-width of the bed: the river is six metres across. */
export const RIVER_WIDTH = 3;
/** How far the bed sits below the surrounding ground. */
export const RIVER_DEPTH = 0.75;
/**
 * This is how far the water sits below the surrounding ground. The gap to
 * RIVER_DEPTH is the actual depth: 0.45 m is knee-deep on a 1.1 m
 * halfling, so the river can be forded instead of walked around.
 */
export const RIVER_WATER_DEPTH = 0.3;
/** Banks: past this fraction of the radius the bed tapers away. */
export const RIVER_FADE_START = 0.6;
export const RIVER_FADE_END = 0.78;
/** Segments along and across the bed, for the ribbon of water. */
export const RIVER_SEGMENTS_ALONG = 220;
export const RIVER_SEGMENTS_ACROSS = 6;
/** Ripples: small amplitude, otherwise the water looks like jelly. */
export const RIVER_WAVE_HEIGHT = 0.035;
export const RIVER_WAVE_SPEED = 1.1;

// --- ground coloring --------------------------------------------------------

/** Steeper than this and bare dirt shows through the grass. */
export const GROUND_DIRT_SLOPE = (26 * Math.PI) / 180;
export const GROUND_ROCK_SLOPE = (44 * Math.PI) / 180;
/** Half-width of the beaten path and the length of its edge blend. */
export const PATH_WIDTH = 1.1;
export const PATH_BLEND = 1.6;
/** Strip of bare bank along the water. */
export const BANK_WIDTH = 1.2;
/** Frequency of the patches where green fades into dry grass. */
export const GROUND_PATCH_FREQUENCY = 0.035;

export const SPAWN_X = 0;
export const SPAWN_Z = 0;

// --- animations -------------------------------------------------------------

/**
 * The clips' "native" speed: how fast the character effectively travels
 * when a clip plays at timeScale = 1. KayKit clips carry no root motion,
 * so this number cannot be derived from the file — it is eyeballed until
 * the feet stop sliding.
 */
export const WALK_CLIP_SPEED = 1.45;
export const RUN_CLIP_SPEED = 3.15;
/** Clamp so the clip does not break into a blur while accelerating. */
export const CLIP_TIME_SCALE_MIN = 0.65;
export const CLIP_TIME_SCALE_MAX = 1.7;

export const ANIM_FADE = 0.18;
export const ANIM_FADE_FAST = 0.08;

// --- loop and rendering -----------------------------------------------------

/** Ceiling on the frame step: after a tab switch delta is huge, and
 *  without a clamp the character falls through the ground in one frame. */
export const MAX_DELTA = 0.05;

export const PIXEL_RATIO_CAP = 2;

// --- styling ----------------------------------------------------------------

/** Lighting steps in the toon ramp: shadow, midtone, light. */
export const TOON_STEPS = 3;
/** Outline thickness in metres, in camera space. */
export const OUTLINE_THICKNESS = 0.006;
/** How many times darker the outline is than the object itself. */
export const OUTLINE_DARKEN = 0.45;

/** Fog: past FOG_FAR everything dissolves into the sky colour. */
export const FOG_NEAR = 70;
export const FOG_FAR = 260;

/** Grid of the pack textures: 8x4 cells (docs/ASSETS.md, section 6).
 *  A cell = a material zone, that is how the pack artist set it up. */
export const SOURCE_COLUMNS = 8;
export const SOURCE_ROWS = 4;
/** How many clothing variants the villager atlas distinguishes. */
export const CLOTH_VARIANT_COUNT = 6;

// --- villagers --------------------------------------------------------------

/** One switch for the whole population: false and no village is built. */
export const VILLAGERS_ENABLED = true;
export const VILLAGER_COUNT = 30;

/** Villagers walk their errands, they do not run — slower than the player. */
export const VILLAGER_WALK_SPEED = 1.15;
/** Native speed of Walking_A: timeScale is fitted to it. */
export const VILLAGER_WALK_CLIP_SPEED = 1.45;
export const VILLAGER_TURN_RATE = 8;
/** Cross-fade duration between a villager's clips. */
export const VILLAGER_CLIP_FADE = 0.25;
/** How close you have to get before it counts as having arrived. */
export const VILLAGER_ARRIVE_RADIUS = 0.35;

/** First idle after load: from zero, so the village disperses at once. */
export const VILLAGER_FIRST_IDLE_MAX = 14;
/** Spread of durations: the village must not move on a whistle. */
export const VILLAGER_IDLE_MIN = 2.5;
export const VILLAGER_IDLE_MAX = 7;
export const VILLAGER_WORK_MIN = 6;
export const VILLAGER_WORK_MAX = 16;

// --- collisions -------------------------------------------------------------

/** Halfling footprint: shoulders about 0.5 m, so a quarter-metre radius. */
export const PLAYER_RADIUS = 0.25;
export const VILLAGER_RADIUS = 0.25;
/** The circle a burrow door uses to keep you out of the hill. */
export const DOOR_BLOCK_RADIUS = 0.8;
/** How softly villagers push each other apart: 1 resolves it in one go. */
export const SEPARATION_STRENGTH = 0.5;

// --- LOD and culling --------------------------------------------------------

/**
 * The rest pose gives too tight a culling sphere: in motion the arms and
 * legs stick out of it and the character blinks at the screen edge. Widen
 * it generously and keep culling on — cheaper than drawing everyone.
 */
export const CHARACTER_BOUNDS_MARGIN = 1.6;

/** Closer than this a villager is full detail: outline, animation every frame. */
export const LOD_NEAR = 22;
/** Beyond this a villager is not drawn at all. */
export const LOD_CULL = 95;
/** At mid range the mixer updates once every N frames. */
export const LOD_ANIMATION_STRIDE = 3;

// --- vegetation -------------------------------------------------------------

export const GRASS_ENABLED = true;
/** Grass tufts across the whole valley. Drawn instanced, in chunks. */
export const GRASS_COUNT = 30000;
export const BUSH_COUNT = 1200;
/** Grass ~0.3 m against a halfling height of 1.1 m. */
export const GRASS_HEIGHT = 0.3;
/**
 * A bush comes up to a halfling's waist. At 0.45 it stood almost as tall
 * as one and read as a boulder rather than a bush.
 */
export const BUSH_RADIUS = 0.26;
/** Chunk grid: each is its own InstancedMesh with its own cull sphere. */
export const VEGETATION_CHUNKS = 8;
/** Grass does not grow on slopes steeper than this. */
export const VEGETATION_MAX_SLOPE = (38 * Math.PI) / 180;
export const VEGETATION_SEED = 7734;

/** Trees. Their silhouette is what makes the valley a valley, not a field. */
export const TREE_COUNT = 1100;
/** No trees this close to the centre: village and open square are there. */
export const TREE_CLEARING_RADIUS = 34;
/** Trees do not grow on anything steeper than this. */
export const TREE_MAX_SLOPE = (30 * Math.PI) / 180;
/** Trunk radius for collisions, before the instance scale. */
export const TREE_TRUNK_RADIUS = 0.34;
/** There must be no trees around a burrow door. */
export const TREE_DOOR_CLEARANCE = 6;

export const SHADOW_MAP_SIZE = 2048;
/** Half-size of the area the shadow map covers around the player. */
export const SHADOW_EXTENT = 14;

/**
 * Whether characters receive shadows. Off on purpose: the shadow map is
 * about 1.4 cm per texel and facial detail is finer than that — self
 * shadowing falls apart into dirty blotches around the eyes and mouth.
 * Characters do still cast shadows, they just do not catch them on
 * themselves. Set true if you want villagers to shadow each other.
 */
export const CHARACTERS_RECEIVE_SHADOW = false;

// --- debug ------------------------------------------------------------------

/** One switch for the whole debug panel: false and it is never created. */
export const DEBUG_PANEL = true;
/** How often the panel redraws. Every frame is costly and unreadable. */
export const DEBUG_REFRESH = 0.25;
