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
/**
 * How far the wheel may pull the boom in and out. The near end is not
 * free: at CAMERA_NEAR of 5 cm a boom much shorter than this puts the
 * lens inside the character's head and starts clipping through it.
 */
export const CAMERA_DISTANCE_MIN = 1.7;
export const CAMERA_DISTANCE_MAX = 6.5;
/** Metres per wheel notch, and how briskly the boom follows. */
export const CAMERA_ZOOM_STEP = 0.45;
export const CAMERA_ZOOM_EASE = 14;
/**
 * The camera aims a little to one side of the character, so he sits off
 * centre and the view opens up ahead of him instead of being blocked by
 * his own back. Metres, sideways from the aim point.
 */
export const CAMERA_SHOULDER = 0.3;
/**
 * Extra degrees of field of view at a full run. Speed reads as widening,
 * but past about five degrees it stops reading as speed and starts
 * reading as nausea.
 */
export const CAMERA_FOV_RUN = 4;
export const CAMERA_FOV_EASE = 4;
/** A short drop of the aim point on landing, so a jump has weight. */
export const CAMERA_LAND_DIP = 0.12;
export const CAMERA_LAND_RECOVER = 7;
/**
 * The boom snaps in when a hill gets between camera and character — there
 * is no choice, the alternative is a face full of hillside — but it eases
 * back out. Recovering as fast as it pulls in makes the picture pop.
 */
export const CAMERA_RECOVER = 5;

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

// --- sky --------------------------------------------------------------------

export const SKY_ENABLED = true;
/**
 * The four authored stops of the sky ramp, in degrees above the horizon.
 *
 * An earlier version quantised the sky into hard bands, reasoning that a
 * toon world wants a toon sky. That was a category error. Toon shading
 * quantises a lighting integral at a surface with a normal; a sky has
 * neither, so the same operator there is just posterisation. Worse, a
 * band edge is a contour of constant elevation on a dome, and a cone of
 * constant elevation projects to a hyperbola — so the "horizontal" bands
 * bowed into concentric arcs centred on the zenith the moment the camera
 * tilted up. A hard edge may trace a shape. It may never trace a contour
 * of the gradient. The sun's disc is the only hard edge left in the sky.
 *
 * Everything below the first stop is one flat plate of PALETTE.skyHorizon.
 * That is not laziness: the valley rim reaches 13 degrees above the eye,
 * and a fogged ridge has to meet a sky of exactly the fog colour. Holding
 * the first stop flat makes that true at every elevation a ridge can
 * occupy rather than at one tuned angle.
 *
 * The upper three are placed where the camera actually looks. The default
 * rig pitch points slightly down, so authoring the interesting colour
 * above 45 degrees would hide all of it until the player looks straight
 * up. The zenith stop stays above the sun's 50 degrees on purpose: warm
 * glow added over the most saturated blue drifts towards violet.
 */
export const SKY_STOP_DEGREES: readonly [number, number, number, number] = [13, 22, 38, 63];
/**
 * How far the sun's side of the sky lifts its ramp. The haze reaches
 * higher towards the sun and the cool stops arrive later, so turning
 * round changes the picture — without it the dome was a function of
 * height alone and looked identical in every direction.
 */
export const SKY_SUN_LIFT = 0.55;
/** Angular radius of the sun's disc, and the width of its soft rim. */
export const SUN_DISC_ANGLE = 2;
export const SUN_DISC_FEATHER = 0.32;
/**
 * The aureole: two exponential lobes, added to the sky rather than mixed
 * into it. Mixing warm into blue crosses the neutral axis and lays down a
 * grey annulus, which is exactly the bullseye the first version drew.
 * A sum of two falling exponentials cannot produce a ring at all.
 */
export const SUN_GLOW_GAIN = 0.55;
export const SUN_GLOW_INNER = 0.055;
export const SUN_GLOW_OUTER = 0.26;
/**
 * Dome radius. It rides with the camera, so this is just a number
 * comfortably inside CAMERA_FAR — nothing can ever reach it.
 */
export const SKY_RADIUS = 400;

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
/** Bare trunk below the crowns. */
export const TREE_TRUNK_HEIGHT = 2.3;
/**
 * Where the lower crown ball begins. The wind pivots about this: below it
 * the trunk bends, above it the crowns travel as one rigid piece.
 */
export const TREE_CROWN_BASE = 1.45;
/** There must be no trees around a burrow door. */
export const TREE_DOOR_CLEARANCE = 6;

// --- wind -------------------------------------------------------------------

/** One switch: false and the vegetation materials are left untouched. */
export const WIND_ENABLED = true;
/** Where the wind blows to, radians in the xz plane. */
export const WIND_DIRECTION = 0.62;
/**
 * Metres between gust crests. The gust is a wave rolling across the
 * valley, so this is what decides whether you read one breath moving over
 * the field or every plant twitching on its own. At 8 m it looked like
 * static; the valley is 128 m across, so 26 m puts about five crests in
 * view at once.
 */
export const WIND_GUST_LENGTH = 26;
/** How fast the gust front travels, m/s. */
export const WIND_GUST_SPEED = 6.5;
/** Constant downwind lean, on top of the gust. Wind has a direction. */
export const WIND_BIAS = 0.3;
export const WIND_FLUTTER_SPEED = 2.7;
/**
 * How far apart two neighbouring plants can be in stiffness, and how much
 * of a turn their phases can differ by. Without this every plant at the
 * same point along the wind moves identically and the field twitches in
 * unison — which is what a first pass without it looked like.
 */
export const WIND_STIFFNESS_SPREAD = 0.35;
export const WIND_PHASE_SPREAD = 0.55;

/**
 * Peak sideways travel at full bend, in metres, and how much of the
 * motion is fast per-plant jitter rather than the gust.
 *
 * Toon shading has no motion blur and no soft edges, so these are small
 * numbers: what reads as wind on a photographed meadow reads as jelly
 * here. A tree is the extreme case — three metres of crown sliding a
 * third of a metre looked like a balloon on a string.
 */
export const WIND_GRASS_AMPLITUDE = 0.022;
export const WIND_GRASS_FLUTTER = 0.3;
export const WIND_GRASS_RATE = 1;

export const WIND_BUSH_AMPLITUDE = 0.012;
export const WIND_BUSH_FLUTTER = 0.15;
export const WIND_BUSH_RATE = 0.8;

/** A tree is heavy: small travel, no jitter, and a long slow swing. */
export const WIND_TREE_AMPLITUDE = 0.075;
export const WIND_TREE_FLUTTER = 0;
export const WIND_TREE_RATE = 0.4;

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

// --- noticing the player ------------------------------------------------------

/**
 * A villager's head follows the player inside this range, and stops
 * bothering past it. Two numbers rather than one so the look fades in
 * instead of switching on at a line on the ground.
 */
export const NOTICE_NEAR = 9;
export const NOTICE_FAR = 13;
/**
 * How far a head turns from its own shoulders before it gives up. Past
 * the limit the look fades out rather than staying pinned at it — a head
 * cranked as far as it goes and held there reads as a stare, not a glance.
 */
export const NOTICE_YAW_LIMIT = (70 * Math.PI) / 180;
export const NOTICE_YAW_FADE = (100 * Math.PI) / 180;
export const NOTICE_PITCH_LIMIT = (22 * Math.PI) / 180;
/** How briskly the head eases in and out of a look. */
export const NOTICE_EASE = 3.5;

/**
 * Who bothers, and for how long.
 *
 * Everyone in range turning to watch reads as a guard of honour, not as a
 * village. Attention is per villager and it comes and goes: a glance,
 * then back to what they were doing, then maybe another later.
 */
export const NOTICE_INCURIOUS_SHARE = 0.3;
/** Seconds of watching, and seconds of not, drawn per villager per turn. */
export const NOTICE_GLANCE_MIN = 2.5;
export const NOTICE_GLANCE_MAX = 5.5;
export const NOTICE_AWAY_MIN = 3;
export const NOTICE_AWAY_MAX = 7;
/** Someone with their hands full looks up rather less often. */
export const NOTICE_WORK_FACTOR = 0.35;
/** Roughly where a halfling's eyes are: what the villagers aim at. */
export const NOTICE_EYE_HEIGHT = 0.95;

/**
 * Greeting. Exactly one villager waves at a time, village-wide, and then
 * nobody does for a while. Without that token every halfling in the
 * square waves as the player walks through and it becomes a stadium.
 */
export const GREET_RADIUS = 4.5;
export const GREET_COOLDOWN = 7;

// --- debug ------------------------------------------------------------------

/**
 * One switch for the whole debug panel: false and it is never created.
 * Off by default — this is a showcase, and it should not open with fps
 * and raw coordinates pinned over the art. Flip it while working.
 */
export const DEBUG_PANEL = false;
/** How often the panel redraws. Every frame is costly and unreadable. */
export const DEBUG_REFRESH = 0.25;
