// Units: metres, seconds, radians.
// The whole world is scaled from the halfling height of 1.1 m.

// --- character --------------------------------------------------------------

/** Brings the model from Blender's native scale (2.1804) to 1.1 m tall. */
export const CHARACTER_SCALE = 0.50451;
export const HALFLING_HEIGHT = 1.1;

/**
 * Vernacular dimensions are quoted for a 1.70 m adult and scaled to a
 * 1.1 m halfling. APPLIES TO: lane and gate widths, hedge and wall
 * heights, plot frontage, doors, steps, benches, bridge decks, wheel and
 * building dimensions. DOES NOT APPLY TO: orchard spacing, tree crowns,
 * river width, pond depth, hill slopes, and ANY ANGLE. A 50-degree roof
 * pitch is 50 degrees at every size; shrinking the pitch with the
 * building is what makes a small world read as a diorama.
 */
export const VERNACULAR_SCALE = 0.647;
/**
 * Bay of a timber frame. Every above-ground structure is a whole number
 * of them.
 *
 * ALREADY SCALED. A real bay is about four metres — sixteen feet is the
 * common one — and 4.0 x VERNACULAR_SCALE is 2.59. Do not scale this
 * again; a three-bay inn is 7.8 m long, not 5.0.
 */
export const BAY = 2.6;

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
 * his own back.
 *
 * A fraction of half the screen width, not metres. Metres would be a
 * fixed angle at exactly one boom length: the same 30 cm reads as 5% off
 * centre at full zoom-out and 34% when a hill shoves the camera in, so
 * the character would slide across the frame every time either changed.
 * Framing should be a property of the shot.
 */
export const CAMERA_SHOULDER_NDC = 0.11;
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
/**
 * How close a hill may push the boom. Not CAMERA_NEAR: the near plane is
 * 5 cm, but the shoulder offset walks the character out of frame below
 * about 32 cm and his own head reaches the lens before that. A little
 * clipping into a steep bank is the better of the two failures.
 */
export const CAMERA_COLLISION_MIN = 0.6;

// --- valley -----------------------------------------------------------------

export const VALLEY_SIZE = 256;
export const VALLEY_RADIUS = VALLEY_SIZE / 2;
/**
 * Terrain resolution: 1.5 quads per metre, 295k triangles.
 *
 * The landscape features that make English farmland recognisable are all
 * around a metre — a hedge bank, the floor of a hollow lane, the pitch of
 * ridge and furrow — and at one quad per metre none of them survives
 * sampling. At 1.5 a six-metre ridge-and-furrow wavelength gets nine
 * samples instead of six, and a 2.6 m lane floor gets four instead of
 * two and a half.
 *
 * Measured cost: the terrain is one draw call at any resolution, so the
 * frame barely notices. What is paid is startup.
 *
 * That figure used to read 481 ms and it is stale — it was measured
 * before the pond dish, the wheel pit, the building pads and the scarps,
 * every one of which added a term to heightAt. Measured again, warm:
 * 1.6 s in total, of which displacement is 830 ms, vertex normals 120 and
 * the BVH 719. The BVH is not the landform's fault — a flat plane of the
 * same resolution costs 590 of those 719.
 *
 * Reading the vertices through the raw Float32Array instead of
 * BufferAttribute.getX/setY was tried and changed nothing measurable, so
 * the accessors are not the cost either. What is left is heightAt itself,
 * and the honest next step is to make IT cheaper rather than to guess
 * again at its callers.
 */
export const VALLEY_SEGMENTS = 384;

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
/**
 * The water's own ground. Raised land may not stand higher than a ramp of
 * HAUGH_SLOPE rising from HAUGH_FLAT metres off the channel axis — so no
 * scarp, present or future, can put a cliff over the river.
 */
export const HAUGH_FLAT = 5;
export const HAUGH_SLOPE = 0.36;
/** The detail noise the terrain already computes crinkles the scarp edges. */
export const SCARP_WOBBLE = 0.9;

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
/**
 * Wading. The river is fordable by design, and it should cost something
 * to ford — otherwise the only landmark in the valley is a blue stripe
 * you walk over without noticing.
 *
 * Running is not blocked by a separate rule: the wade speed replaces the
 * target speed outright, so Shift simply stops making a difference once
 * you are in deep enough.
 *
 * The exact value is not free. The walk clip is fitted to speed by
 * timeScale, which is clamped below at CLIP_TIME_SCALE_MIN so it cannot
 * break up while accelerating from a stop. WALK_CLIP_SPEED * that clamp
 * is 0.94 m/s, and anything slower makes the stride outrun the body and
 * the feet skate. Just above it is 41% off a walk and 74% off a run —
 * plenty to feel, with the footfalls still landing where they should.
 */
export const WADE_SPEED = 0.95;
/** Depth at which the water is slowing you as much as it ever will. */
export const WADE_FULL_DEPTH = 0.35;
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
/**
 * Bare bank along the water. Despite the name this is not a width in
 * metres: groundColor compares it against how far the channel cut is
 * from full depth, so it shapes how quickly grass returns as the bed
 * rises, not how wide the strip is.
 */
export const BANK_WIDTH = 1.2;

/**
 * Hedge section. A bank rather than a wall: a wide foot beds it into
 * ground that is never flat, which is also what stops a seam showing
 * where it crosses a slope.
 *
 * The crest is set against the eye, not against the survey. A halfling's
 * view sits 1.32 m above his feet, so at 0.95 plus a tenth of wander the
 * hedge clears the bottom of the frame by about a quarter of a metre.
 * Any taller and every lane in the village would be a green corridor.
 */
export const HEDGE_FOOT = 1;
export const HEDGE_CREST = 0.95;
/** Where the bank's shoulder sits, as a share of the crest. */
export const HEDGE_SHOULDER = 0.19;
/** How far the crest wanders, so no two metres of it are alike. */
export const HEDGE_ROUGHNESS = 0.1;
/** How far the foot is sunk, so no seam shows where it meets the turf. */
export const HEDGE_BEDDING = 0.06;

/**
 * Spacing of the trees left to grow up out of the boundaries.
 *
 * Twelve metres is a hedgerow, four is a wood and thirty is a line of
 * lonely trees. The interval is jittered either side of this, because
 * standards were left where they happened to seed.
 */
export const HEDGEROW_SPACING = 13;
/**
 * How much closer the green and the avenue are planted, as a share of
 * the field interval. Both were planted on purpose; a field hedgerow
 * grew where birds dropped seed.
 */
export const GREEN_PLANTING = 0.5;
/** Their own seed: they must not move when the scattered wood changes. */
export const HEDGEROW_SEED = 20863;
/**
 * How far a tree keeps off a gateway. At two metres a side, the green's
 * north hedge — fifteen metres with two gates in it — had no room left
 * for a single tree, and that is the side the player looks at.
 */
export const HEDGEROW_GATE_CLEARANCE = 1;
/**
 * And off the benches and beds. Measured from the widest prop — the
 * vegetable bed is two metres across, so a metre out from its centre,
 * plus room for the villager and the trunk. At 2.5 it cleared the whole
 * west side of the green, where the gardens stand against the hedge.
 */
export const HEDGEROW_WORK_CLEARANCE = 1.6;

/**
 * The pond on the green.
 *
 * VERNACULAR_SCALE does NOT apply to any of these. Pond depth is named in
 * docs/VILLAGE.md as one of the dimensions that stays at full size, along
 * with tree crowns and river width — the same reason RIVER_DEPTH and
 * RIVER_WATER_DEPTH are plain numbers a few lines away. Water is water.
 *
 * The radius is not a taste. It is the largest circle that leaves a body
 * room to walk between the water and every hedge, tree and lane around
 * the green's low corner.
 */
export const POND_RADIUS = 2.8;
/** How far the shoreline wanders off that circle, as a share of it. */
export const POND_WOBBLE = 0.13;
/** How deep the dish is dug below the surrounding grade. */
export const POND_DEPTH = 0.62;
/**
 * How far the water lies below the rim: freeboard, not depth. The pool
 * itself comes out 0.41 m deep, which on a 1.1 m halfling is thigh-deep.
 *
 * Not 0.22. The water plane is flat and the ground is not, and at 0.22 it
 * came out of the dish at ten vertices of the terrain mesh — a puddle
 * spreading across the grass. A fine radial scan said the rim held; the
 * mesh the BVH is actually built from said it did not, and the mesh is
 * the one the player walks on. At 0.28 the lowest ground outside the
 * shoreline still stands 27 mm above the water, and the price is 1.4 m²
 * of surface out of sixteen.
 */
export const POND_WATER_DEPTH = 0.28;
/**
 * Width of the bank ramp. The floor inside it is flat, because a dug
 * pond has a flat bottom; a dish that curves all the way to the middle
 * held nine square metres instead of sixteen and read as a puddle in a
 * crater. At 1.3 m the bank stands at 36 degrees — past
 * GROUND_DIRT_SLOPE, so the margin shows as poached mud, and short of
 * VEGETATION_MAX_SLOPE, so the grass above the waterline still grows.
 */
export const POND_BANK = 1.3;
/** Ripple on still water, against RIVER_WAVE_HEIGHT on running water. */
export const POND_WAVE_HEIGHT = 0.01;
/** Rings and sectors in the water disc. */
export const POND_SEGMENTS_ACROSS = 4;
export const POND_SEGMENTS_ROUND = 28;

/** The pound: a walled pen for straying stock, on the verge. */
export const POUND_RADIUS = 2.3;
export const POUND_SEGMENTS = 11;
/** Chest-high on a halfling, so a beast cannot see over it. */
export const POUND_WALL_HEIGHT = 0.95;
export const POUND_WALL_THICKNESS = 0.3;
/**
 * Chord length. Eleven chords of 1.30 m on this radius subtend 361
 * degrees and cannot close; at 1.32 the outer faces meet within 4 mm.
 */
export const POUND_CHORD = 1.32;
/** How far the footings are sunk, so no wall floats on uneven ground. */
export const POUND_BEDDING = 0.06;
/** The gap left for the gate, as a share of one segment's arc. */
export const POUND_GATE_SHARE = 1;

/** The wellhead: its total height is a halfling, the scale reference. */
export const WELL_INNER_RADIUS = 0.5;
export const WELL_OUTER_RADIUS = 0.65;
export const WELL_WALL_HEIGHT = 0.55;
export const WELL_POST_HEIGHT = 1;
export const WELL_POST_THICKNESS = 0.1;
export const WELL_BARREL_RADIUS = 0.07;
export const WELL_BEDDING = 0.03;

/** Its own stream, so the pond's dressing holds still. */
export const GREEN_SEED = 41207;

/**
 * A timber frame, at halfling scale. Real member sizes in brackets.
 *
 * Storey height, to the wall plate of a single-storey building. A
 * dwelling is one storey; the mill is three, and that is most of what
 * makes it read as a working building rather than a big house.
 */
export const FRAME_STOREY = 1.9;
/**
 * The doorway. Absolute, not a share of the wall: as a fraction the
 * three-storey mill was given a door three metres tall. At 1.18 m a
 * halfling ducks under his own lintel, which is what every surviving
 * frame makes a full-grown adult do.
 */
export const FRAME_DOOR_HEIGHT = 1.18;
export const FRAME_DOOR_WIDTH = 1;
/** Principal post and the beams: sill, plate, tie. [250 mm oak] */
export const FRAME_POST = 0.16;
/** Common stud. [110 mm] */
export const FRAME_STUD = 0.075;
/** Mid rail of a box panel. [150 mm] */
export const FRAME_RAIL = 0.1;
/** Diagonal brace. [140 mm] */
export const FRAME_BRACE = 0.09;
/**
 * Centres of close studding. Close studding means studs about their own
 * width apart — the expensive way to frame a wall, used on the face that
 * would be seen from the road and nowhere else.
 *
 * 0.34 and not the 0.19 of the real thing. At 19 cm centres a 7.5 cm stud
 * covers forty per cent of the wall, and from ten metres the whole face
 * averages into a dark striped mass: the panels stop reading and the
 * building goes grey. The frame has to be legible at the distance it is
 * actually seen from, which is not the distance a joiner sees it from.
 */
export const FRAME_STUD_GAP = 0.34;
/**
 * How far the daub panel sits behind the timber face.
 *
 * The most valuable three centimetres in the building. With the panel
 * flush the wall is one flat plane and the frame disappears; set back, every
 * member casts its own edge onto the panel beside it, and a three-step toon
 * shader draws the whole frame for free with no texture at all.
 */
export const FRAME_PANEL_INSET = 0.03;
/** Stone plinth under the sill: timber on the ground rots. */
export const FRAME_PLINTH = 0.3;

/**
 * Thatch. The pitch lives with each building because it is an angle and
 * angles are never scaled; these are the thicknesses, which are.
 */
export const ROOF_COAT = 0.19;
export const ROOF_OVERHANG = 0.19;
export const ROOF_RIDGE_BAND = 0.3;

/**
 * The mill wheel. Undershot: the stream runs past its bottom rather than
 * being delivered over its top, which is the whole reason this project
 * has no weir, no leat, no bay and no tailrace. 2.40 m across is a real
 * twelve-foot wheel at halfling scale.
 */
export const WHEEL_RADIUS = 1.2;
export const WHEEL_WIDTH = 1.2;
export const WHEEL_AXLE_RADIUS = 0.09;
/** The inner of the two rims; the outer sits 30 mm further out. */
export const WHEEL_RIM_INNER = 1.15;
export const WHEEL_FLOATS = 24;
export const WHEEL_SPOKES = 12;
export const WHEEL_FLOAT_THICKNESS = 0.05;
/**
 * The wheel pit: a hollow dug under the wheel, deeper than the channel.
 *
 * docs/VILLAGE.md cut every piece of waterworks, and it was right about
 * all of them — a weir, a leat, a bay and a tailrace are a hydrology
 * module for one prop. A pit is not that. It is one smoothstep bowl in
 * the height field, the same shape as the pond dish, and without it the
 * wheel stands in 0.42 m of water: 0.29 m of immersion, twelve per cent
 * of its own diameter. Against opaque water with no spray that does not
 * read as a wheel in a stream, it reads as a wheel resting on one — which
 * is exactly what it looked like.
 *
 * Deepening the bed does not move the surface: the water plane comes from
 * groundHeight, which no carve touches. The pit just holds more water.
 */
export const WHEEL_PIT_DEPTH = 0.4;
/** Wider than the wheel, or its rim stands on the ramp and nothing sinks. */
export const WHEEL_PIT_RADIUS = 2.4;
export const WHEEL_PIT_BANK = 1;

/**
 * How far the floats stay off the bed of the pit.
 *
 * This, and not the dip, is the number that matters. The pit holds 0.292 m
 * of water and the intended dip was 0.29, which left the paddles two
 * millimetres off the bottom — on terrain sampled every 0.667 m, a wheel
 * grinding through the riverbed. Setting the axle from the bed instead,
 * and from the highest point under the whole footprint rather than the
 * centre, leaves the floats dipping about two thirds of a metre once the
 * pit is dug.
 *
 * 0.15 and not 0.08 because the axle is set from the analytic field while
 * the wheel is seen and collided against the terrain MESH, which samples
 * every 0.667 m and sits above the field between samples. At 0.08 the
 * floats measured 18 mm inside the mesh — the same gap that let the pond
 * leak, found the same way.
 */
export const WHEEL_BED_CLEARANCE = 0.15;
/** One turn every 9.2 s. Faster reads as a fairground ride. */
export const WHEEL_RPM = 6.5;
/** How far the shaft carries past the wheel to its outer bearing. */
export const WHEEL_SHAFT_OVERHANG = 0.55;
/** The bearing blocks the shaft turns in, at the wall and on the pier. */
export const WHEEL_BEARING = 0.34;
/**
 * The lucam: the gabled hood projecting from the mill's top storey, so a
 * sack can be hoisted out of a cart without getting wet. About twenty
 * boxes, and worth more than the rest of the building — it is the one
 * silhouette nothing else in a village has.
 */
export const LUCAM_PROJECTION = 0.9;
export const LUCAM_WIDTH = 1.1;
export const LUCAM_GABLE = 0.6;

/**
 * Where the pit sits.
 *
 * Not the -24.6 the blueprint gives. That point does hold 0.29 m of
 * standing water, but it lies 2.5 m off the channel axis — up on the bank
 * — and a 2.4 m wheel needs 2.4 m of bed, not one deep sample. Measured
 * across the whole footprint, the wheel there cut 0.23 m into the bank.
 * The bed does not go flat until about -25.7, and there the floats dip
 * 0.34 m and clear the bottom by WHEEL_BED_CLEARANCE. It leaves the wheel
 * 2.9 m from the mill's south wall rather than 1.8 — a longer pit, which
 * is what a wheel standing in the stream rather than against the wall
 * actually needs.
 */
export const WHEEL_X = -27.4;
export const WHEEL_Z = -25.7;

/** Brick stack. The clearance over the ridge is a fire rule, not a look. */
export const STACK_WIDTH = 0.42;
export const STACK_CLEARANCE = 0.74;

/** The standard oak on the green, as a multiple of an ordinary tree. */
export const GREEN_OAK_SCALE = 1.55;
/**
 * The stretch of the cart lane with trees down both verges. It crosses
 * the open middle of the valley, where there is no boundary to stand in
 * and nothing else gives the road an edge.
 */
export const CART_AVENUE_FROM = 2;
export const CART_AVENUE_TO = -12;
/** How far off the centre of the road they stand. */
export const CART_AVENUE_OFFSET = 2.9;
/** Frequency of the patches where green fades into dry grass. */
export const GROUND_PATCH_FREQUENCY = 0.035;

// On the green, at its south-east corner, looking west-north-west up the
// street. Ground -0.53 m, slope 1.25 deg. (0, 0) was the middle of a ring
// that no longer exists
export const SPAWN_X = 18.75;
export const SPAWN_Z = 9.25;

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

// --- chimney smoke ------------------------------------------------------------

export const SMOKE_ENABLED = true;
/**
 * Puffs per chimney. Few and large on purpose: toon shading has no soft
 * edges, so a cloud of small particles reads as a swarm of dumplings.
 * Six chimneys at this count is one draw call and 720 triangles.
 */
export const SMOKE_PUFFS = 6;
/** Seconds from the chimney mouth to nothing. */
export const SMOKE_LIFETIME = 7;
/**
 * How far a puff climbs and is carried in that time.
 *
 * The rise is the number that decides whether this reads as a plume at
 * all. Spread the same few puffs over four metres and they arrive as a
 * dotted line of specks with sky between them; keep the column short
 * enough that consecutive puffs overlap and it reads as one thing.
 */
export const SMOKE_RISE = 3;
export const SMOKE_DRIFT = 2.7;
/**
 * How the plume reads the wind.
 *
 * The gust turns over about once a second. That is right for grass and
 * meaningless for a column that takes seven seconds to rise: read at full
 * rate, with one value shared by every puff, the whole plume swung like a
 * wiper twice a second and spent about two fifths of each cycle drifting
 * upwind. Grass survives the same curve only because its amplitude is two
 * centimetres against the smoke's couple of metres.
 *
 * So the smoke reads the same wave on its own timescale, and each puff
 * freezes the value it left the pipe in. What travels up the column is
 * then the history of the wind rather than a single number, which is also
 * what a real plume is.
 */
export const SMOKE_GUST_RATE = 0.18;
export const SMOKE_GUST_SHARE = 0.45;
/** Baseline lean, kept above the gust share so smoke never blows upwind. */
export const SMOKE_LEAN = 0.55;
/**
 * Puff radius at birth and at the end of its life. The end radius has to
 * beat the spacing — SMOKE_RISE over SMOKE_PUFFS is half a metre — or the
 * plume comes apart at the top, which is where it is widest and most
 * visible.
 */
export const SMOKE_START_RADIUS = 0.28;
export const SMOKE_END_RADIUS = 1.15;
/**
 * Opacity scale. Not the peak a puff reaches: the fade in and the fade
 * out overlap, so the most any single puff manages is about 0.33, a
 * little way above the chimney.
 *
 * Kept moderate because overlapping puffs accumulate it: where two cross,
 * the alpha compounds and the seam comes out denser than either of them,
 * which is what makes a column read as a stack of rings rather than as
 * one plume.
 */
export const SMOKE_OPACITY = 0.42;

/**
 * Spray thrown up by the mill wheel.
 *
 * Short-lived and small, and it does not drift: thrown water falls where
 * it was thrown, so the gust that leans the chimney plumes must not carry
 * this sideways. It exists because a wheel touching an opaque water plane
 * reads as one resting on it — the geometry measured right and still
 * looked wrong, and this is the part that says the two are in contact.
 */
export const SPRAY_PUFFS = 8;
export const SPRAY_LIFETIME = 0.8;
export const SPRAY_RISE = 0.75;
export const SPRAY_START_RADIUS = 0.1;
export const SPRAY_END_RADIUS = 0.26;
export const SPRAY_OPACITY = 0.5;

/**
 * The ford, on the cart lane where it crosses the channel.
 *
 * Not the blueprint's x in [-2.25, 2.25]: that was written for a lane
 * running through x = 0, and the lane as solved crosses at -0.40. The
 * water there is 6.5 m across and 0.45 m at its deepest — thigh-deep on a
 * halfling, which is the whole point of having a bridge as well.
 *
 * No ramps. The blueprint regrades both approaches at 7 %; measured on the
 * lane as built the banks stand at 21.1 and 21.7 degrees against a
 * MAX_SLOPE of 50, so they are already walkable and a height-field term
 * would buy nothing for its startup cost.
 */
// Where the ford lane actually crosses the channel axis, measured on the
// lane as routed. At (-0.40, -22.07) the setts lay 1.6 m off their own
// road: the lane moved with the village and the paving did not
export const FORD_X = -2;
export const FORD_Z = -22.34;
export const FORD_SETTS = 12;
export const FORD_SETT_WIDTH = 0.9;
export const FORD_SETT_LENGTH = 0.7;

/**
 * The plank footbridge, downstream-side of the ford.
 *
 * At the blueprint's x = 13 the south landing falls 0.83 m from
 * burrow-7's mound — a bridge onto somebody's doorstep. At 16.5 it clears
 * by 3.16 m and still meets the north bank path within 0.71 m. The span
 * is 9.2 m rather than 8.0 because the channel is genuinely wider there.
 *
 * The detour is about 26 m against a four-second wade, so the bridge is
 * the DRY way over, not the fast one. WADE_SPEED keeps its meaning.
 */
export const BRIDGE_X = 16.5;
export const BRIDGE_Z_NORTH = -14.3;
export const BRIDGE_Z_SOUTH = -23.5;
/** Two halflings abreast is a real negotiation at PLAYER_RADIUS 0.25. */
export const BRIDGE_DECK_WIDTH = 1.1;
export const BRIDGE_PLANKS = 11;
export const BRIDGE_BEAM = 0.24;
export const BRIDGE_HUMP = 0.45;
export const BRIDGE_RAIL_HEIGHT = 0.62;

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
/**
 * No trees this close to the centre.
 *
 * Raised from 34 when the village grew to fifteen dwellings. At 34 the
 * back of a croft was five to nine metres from its own door, against a
 * surveyed depth many times that, and the rear boundary would have run
 * through the wood. Forty-six gives the crofts fourteen metres and still
 * leaves a belt of trees between them and the rim — and since it removes
 * trees rather than adding them, it costs nothing.
 */
export const TREE_CLEARING_RADIUS = 46;
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
/**
 * How far the crown reaches sideways. The geometry is built from this and
 * the planting reads it back, so the two cannot drift: a tree that grew
 * wider without the spacing knowing would grow into its neighbour.
 */
export const TREE_CROWN_RADIUS = 1.5;
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
