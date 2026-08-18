import * as THREE from "three";
import { BufferAttribute, BufferGeometry } from "three";
import { MeshBVH } from "three-mesh-bvh";
50 * Math.PI / 180;
-35 * Math.PI / 180;
65 * Math.PI / 180;
const TERRAIN_SEED = 20260815;
/** Fraction of the radius past which the ground starts rising to the rim. */
const RIM_START = .82;
/** Exponent of the rim curve: >1 makes the top steeper than the foot. */
const RIM_CURVE = 2.2;
const HILL_HEIGHT = 3.4;
const HILL_FREQUENCY = .013;
const DETAIL_HEIGHT = .45;
const DETAIL_FREQUENCY = .075;
/** Inside this radius the terrain is damped — the village stands there. */
const CENTER_CALM_INNER = .05;
const CENTER_CALM_OUTER = .34;
/** Ceiling for probe rays: safely above any point of the terrain. */
const TERRAIN_PROBE_HEIGHT = 43.85;
const RIVER_WAVINESS = .016;
/** How far the bed sits below the surrounding ground. */
const RIVER_DEPTH = .75;
/**
* This is how far the water sits below the surrounding ground. The gap to
* RIVER_DEPTH is the actual depth: 0.45 m is knee-deep on a 1.1 m
* halfling, so the river can be forded instead of walked around.
*/
const RIVER_WATER_DEPTH = .3;
/** Banks: past this fraction of the radius the bed tapers away. */
const RIVER_FADE_START = .6;
const RIVER_FADE_END = .78;
/** Ripples: small amplitude, otherwise the water looks like jelly. */
const RIVER_WAVE_HEIGHT = .035;
const RIVER_WAVE_SPEED = 1.1;
/** Steeper than this and bare dirt shows through the grass. */
const GROUND_DIRT_SLOPE = 26 * Math.PI / 180;
const GROUND_ROCK_SLOPE = 44 * Math.PI / 180;
/**
* Bare bank along the water. Despite the name this is not a width in
* metres: groundColor compares it against how far the channel cut is
* from full depth, so it shapes how quickly grass returns as the bed
* rises, not how wide the strip is.
*/
const BANK_WIDTH = 1.2;
const HEDGE_CREST = .95;
/** Where the bank's shoulder sits, as a share of the crest. */
const HEDGE_SHOULDER = .19;
/** How far the crest wanders, so no two metres of it are alike. */
const HEDGE_ROUGHNESS = .1;
/** How far the foot is sunk, so no seam shows where it meets the turf. */
const HEDGE_BEDDING = .06;
/**
* How much closer the green and the avenue are planted, as a share of
* the field interval. Both were planted on purpose; a field hedgerow
* grew where birds dropped seed.
*/
const GREEN_PLANTING = .5;
/** Their own seed: they must not move when the scattered wood changes. */
const HEDGEROW_SEED = 20863;
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
const POND_RADIUS = 2.8;
/** How far the shoreline wanders off that circle, as a share of it. */
const POND_WOBBLE = .13;
/** How deep the dish is dug below the surrounding grade. */
const POND_DEPTH = .62;
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
const POND_WATER_DEPTH = .28;
/**
* Width of the bank ramp. The floor inside it is flat, because a dug
* pond has a flat bottom; a dish that curves all the way to the middle
* held nine square metres instead of sixteen and read as a puddle in a
* crater. At 1.3 m the bank stands at 36 degrees — past
* GROUND_DIRT_SLOPE, so the margin shows as poached mud, and short of
* VEGETATION_MAX_SLOPE, so the grass above the waterline still grows.
*/
const POND_BANK = 1.3;
/** Ripple on still water, against RIVER_WAVE_HEIGHT on running water. */
const POND_WAVE_HEIGHT = .01;
/** The pound: a walled pen for straying stock, on the verge. */
const POUND_RADIUS = 2.3;
/** Chest-high on a halfling, so a beast cannot see over it. */
const POUND_WALL_HEIGHT = .95;
const POUND_WALL_THICKNESS = .3;
/**
* Chord length. Eleven chords of 1.30 m on this radius subtend 361
* degrees and cannot close; at 1.32 the outer faces meet within 4 mm.
*/
const POUND_CHORD = 1.32;
/** How far the footings are sunk, so no wall floats on uneven ground. */
const POUND_BEDDING = .06;
/** The wellhead: its total height is a halfling, the scale reference. */
const WELL_INNER_RADIUS = .5;
const WELL_OUTER_RADIUS = .65;
const WELL_WALL_HEIGHT = .55;
const WELL_POST_THICKNESS = .1;
const WELL_BARREL_RADIUS = .07;
const WELL_BEDDING = .03;
/** Its own stream, so the pond's dressing holds still. */
const GREEN_SEED = 41207;
/** The standard oak on the green, as a multiple of an ordinary tree. */
const GREEN_OAK_SCALE = 1.55;
/** How far off the centre of the road they stand. */
const CART_AVENUE_OFFSET = 2.9;
/** Frequency of the patches where green fades into dry grass. */
const GROUND_PATCH_FREQUENCY = .035;
/** Outline thickness in metres, in camera space. */
const OUTLINE_THICKNESS = .006;
/** How many times darker the outline is than the object itself. */
const OUTLINE_DARKEN = .45;
const SMOKE_DRIFT = 2.7;
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
const SMOKE_GUST_RATE = .18;
const SMOKE_GUST_SHARE = .45;
/** Baseline lean, kept above the gust share so smoke never blows upwind. */
const SMOKE_LEAN = .55;
/**
* Puff radius at birth and at the end of its life. The end radius has to
* beat the spacing — SMOKE_RISE over SMOKE_PUFFS is half a metre — or the
* plume comes apart at the top, which is where it is widest and most
* visible.
*/
const SMOKE_START_RADIUS = .28;
const SMOKE_END_RADIUS = 1.15;
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
const SMOKE_OPACITY = .42;
/** Halfling footprint: shoulders about 0.5 m, so a quarter-metre radius. */
const PLAYER_RADIUS = .25;
/** Grass tufts across the whole valley. Drawn instanced, in chunks. */
const GRASS_COUNT = 3e4;
const BUSH_COUNT = 1200;
/** Grass ~0.3 m against a halfling height of 1.1 m. */
const GRASS_HEIGHT = .3;
/**
* A bush comes up to a halfling's waist. At 0.45 it stood almost as tall
* as one and read as a boulder rather than a bush.
*/
const BUSH_RADIUS = .26;
/** Grass does not grow on slopes steeper than this. */
const VEGETATION_MAX_SLOPE = 38 * Math.PI / 180;
const VEGETATION_SEED = 7734;
/** Trees. Their silhouette is what makes the valley a valley, not a field. */
const TREE_COUNT = 1100;
/** Trees do not grow on anything steeper than this. */
const TREE_MAX_SLOPE = 30 * Math.PI / 180;
/** Trunk radius for collisions, before the instance scale. */
const TREE_TRUNK_RADIUS = .34;
/** Bare trunk below the crowns. */
const TREE_TRUNK_HEIGHT = 2.3;
/**
* Where the lower crown ball begins. The wind pivots about this: below it
* the trunk bends, above it the crowns travel as one rigid piece.
*/
const TREE_CROWN_BASE = 1.45;
/**
* How far the crown reaches sideways. The geometry is built from this and
* the planting reads it back, so the two cannot drift: a tree that grew
* wider without the spacing knowing would grow into its neighbour.
*/
const TREE_CROWN_RADIUS = 1.5;
/** Where the wind blows to, radians in the xz plane. */
const WIND_DIRECTION = .62;
/** How fast the gust front travels, m/s. */
const WIND_GUST_SPEED = 6.5;
/** Constant downwind lean, on top of the gust. Wind has a direction. */
const WIND_BIAS = .3;
const WIND_FLUTTER_SPEED = 2.7;
/**
* How far apart two neighbouring plants can be in stiffness, and how much
* of a turn their phases can differ by. Without this every plant at the
* same point along the wind moves identically and the field twitches in
* unison — which is what a first pass without it looked like.
*/
const WIND_STIFFNESS_SPREAD = .35;
const WIND_PHASE_SPREAD = .55;
/**
* Peak sideways travel at full bend, in metres, and how much of the
* motion is fast per-plant jitter rather than the gust.
*
* Toon shading has no motion blur and no soft edges, so these are small
* numbers: what reads as wind on a photographed meadow reads as jelly
* here. A tree is the extreme case — three metres of crown sliding a
* third of a metre looked like a balloon on a string.
*/
const WIND_GRASS_AMPLITUDE = .022;
const WIND_GRASS_FLUTTER = .3;
const WIND_BUSH_AMPLITUDE = .012;
const WIND_BUSH_FLUTTER = .15;
const WIND_BUSH_RATE = .8;
/** A tree is heavy: small travel, no jitter, and a long slow swing. */
const WIND_TREE_AMPLITUDE = .075;
const WIND_TREE_RATE = .4;
70 * Math.PI / 180;
100 * Math.PI / 180;
22 * Math.PI / 180;
//#endregion
//#region src/config/palette.ts
const PALETTE = {
	/** Clear colour. Only seen with SKY_ENABLED off; kept honest anyway. */
	sky: 12178394,
	/** Distance dissolves into the sky's lowest stop, and into nothing else. */
	fog: 12178394,
	/**
	* The sky dome's lowest stop, held perfectly flat from straight down to
	* the first stop angle. It is the fog colour on purpose, not a shade
	* near it: distant hills dissolve into the fog and then meet the sky
	* right above themselves, so any difference between the two draws a
	* line along the horizon exactly where nothing should be drawn.
	*
	* This is the most important line in the file. Change fog, change this.
	*/
	skyHorizon: 12178394,
	/**
	* The ramp above it. Hue, saturation and lightness all move in one
	* direction across the four stops — H 193 -> 197 -> 206 -> 215,
	* S 31 -> 47 -> 61 -> 66, L 79 -> 74 -> 68 -> 62. A ramp that sags on
	* any of the three in the middle is what makes a sky read as one colour
	* getting dimmer rather than as air.
	*/
	skyLow: 10472412,
	skyMid: 8172767,
	skyZenith: 6329822,
	/** The sun's own disc, brighter than the light it casts. */
	sunDisc: 16775396,
	/** The air around the sun. Added to the sky, never mixed into it. */
	sunGlow: 16767395,
	/**
	* Chimney smoke, lit side and shaded side. Warm rather than grey: it
	* sits against a cool sky, and a neutral grey there reads as dirt on
	* the lens. Two tones only, like everything else in the frame.
	*/
	smoke: 15130836,
	smokeShade: 12631220,
	sunlight: 16773588,
	/** Fill light from above: the sky. */
	skyBounce: 11060438,
	/** Fill light from below: bounce off the grass. */
	groundBounce: 7043662,
	grass: 8232533,
	grassDry: 10135644,
	earth: 9071177,
	rock: 9476256,
	wood: 11106639,
	woodDark: 7622703,
	thatch: 13083234,
	plaster: 14866109,
	roofTile: 11754051,
	door: 5209963,
	skin: 15317906,
	hair: 8145452,
	shirt: 12870975,
	shirtCool: 5339532,
	trousers: 7170648,
	boots: 6046256,
	water: 6001576,
	bloom: 14250079,
	/** The darkest tone: eyes, pupils, solid dark details. */
	ink: 2367260,
	/** Dark metal: buckles, fittings. */
	steel: 5989226
};
PALETTE.skin, PALETTE.hair, PALETTE.shirt, PALETTE.shirtCool, PALETTE.trousers, PALETTE.door, PALETTE.bloom, PALETTE.thatch, PALETTE.boots, PALETTE.wood, PALETTE.woodDark, PALETTE.rock, PALETTE.steel, PALETTE.plaster, PALETTE.ink;
PALETTE.shirt, PALETTE.shirtCool, PALETTE.trousers, PALETTE.door, PALETTE.bloom, PALETTE.thatch;
/**
* Darkening a color for the outline. The outline is not black but a dark
* version of the object itself (decision #5) — that way it reads as form
* rather than a contour pasted on top.
*
* Multiply the channels instead of subtracting: subtraction drags
* saturated colors into mud, multiplication keeps the hue.
*/
function darken(color, factor) {
	const r = Math.round((color >> 16 & 255) * factor);
	const g = Math.round((color >> 8 & 255) * factor);
	const b = Math.round((color & 255) * factor);
	return r << 16 | g << 8 | b;
}
//#endregion
//#region src/config/work.ts
/**
* The village's work spots. They stay within ~25 m of the center, where
* the terrain is flat (see CENTER_CALM_* in constants.ts).
*
* Every one of these was checked, by the corners of the prop it carries,
* against the hedges, the hedgerow trees, the lanes, the footpath, the
* pond and the green's furniture. A point is data; what it has to clear
* is not.
*
* Fishers stand on the north bank of the river, 4.2 m from its axis:
* still dry land, with the water within arm's reach. The coordinates were
* computed from riverCenterZ(x) — if the riverbed is moved in
* constants.ts, these three points have to be recomputed.
*/
/** How many meters in front of the villager the prop stands. */
const PROP_DISTANCE = .95;
const WORK_POINTS = [
	{
		id: "garden-1",
		role: "gardener",
		x: -13,
		z: 10.6
	},
	{
		id: "garden-2",
		role: "gardener",
		x: -12.8,
		z: 13.3
	},
	{
		id: "garden-3",
		role: "gardener",
		x: -15,
		z: 18.7
	},
	{
		id: "garden-4",
		role: "gardener",
		x: -14,
		z: 8
	},
	{
		id: "garden-5",
		role: "gardener",
		x: -9.6,
		z: 17.9
	},
	{
		id: "saw-1",
		role: "miller",
		x: 9.4,
		z: 11
	},
	{
		id: "saw-2",
		role: "miller",
		x: 12.5,
		z: 8
	},
	{
		id: "saw-3",
		role: "miller",
		x: 7,
		z: 15
	},
	{
		id: "saw-4",
		role: "miller",
		x: 14,
		z: 13
	},
	{
		id: "river-1",
		role: "fisher",
		x: -8,
		z: -19.3
	},
	{
		id: "river-2",
		role: "fisher",
		x: 4,
		z: -17
	},
	{
		id: "river-3",
		role: "fisher",
		x: 16,
		z: -14.8
	},
	{
		id: "square-1",
		role: "idler",
		x: -2.2,
		z: 6.5
	},
	{
		id: "square-2",
		role: "idler",
		x: -7.8,
		z: 11.6
	},
	{
		id: "square-3",
		role: "idler",
		x: 6,
		z: 8
	}
];
/** Where a villager faces at work: the valley center — and the prop too. */
function workFacing(point) {
	return Math.atan2(-point.x, -point.z);
}
/** Where the garden bed, sawhorse or reeds go: in front, not underneath. */
function propPosition(point) {
	const yaw = workFacing(point);
	return {
		x: point.x + Math.sin(yaw) * PROP_DISTANCE,
		z: point.z + Math.cos(yaw) * PROP_DISTANCE
	};
}
//#endregion
//#region src/config/burrows.ts
/**
* Round door. The 1.34 m diameter lands in the 1.2–1.5 m range of the
* reference burrow doors and is proportionate to a 1.1 m halfling. The
* sill is raised by 0.2 m: a real round door is stepped over, not walked
* through flush with the ground.
*/
const DOOR_RADIUS = .55;
const DOOR_FRAME_RADIUS = .6;
const DOOR_FRAME_TUBE = .11;
const DOOR_CENTER_HEIGHT = .91;
/** How far the geometry is pushed forward so it doesn't z-fight terrain. */
const FACE_OFFSET = .04;
/**
* The patch of the dome pressed in for the door. Inside INNER the surface
* lies exactly in the door plane; by OUTER it eases back to the dome.
* That is the entire "facade": a circle a little over a meter across, not
* a separate panel.
*/
const DIMPLE_INNER = 1.05;
/**
* The ground under a burrow is levelled into a pad, and the dome stands
* on that. Without it the valley's natural terrain rides up in front of
* the facade and drowns the bottom of the door. The margin is in meters,
* not in fractions of the radius: with fractions the pad on small mounds
* ran out right in front of the threshold.
*/
const PAD_MARGIN = 3.6;
const PAD_FADE = 2.6;
/**
* Softens the closeness weighting where pads overlap. Small enough that a
* mound owns the ground under itself, large enough that the term does not
* blow up at a mound's own centre.
*/
const PAD_BIAS = .8;
/**
* Fifteen dwellings in a closed ring around the green, four of them on
* the far bank. The doors face the centre of the valley — the angle is
* derived from the coordinates, so there is no point duplicating it here.
*
* The ring used to be six on a horseshoe with the whole south side open.
* Fifteen at that radius overlapped, and spread over the same horseshoe
* they overlapped worse, so the ring closes and crosses the water. That
* is what the surveyed English village does: the street carries on over
* the ford and a few households live on the other side.
*
* The positions come from a solver rather than from taste, and every one
* of them is measured. A dwelling steps back along its own radial until
* its whole mound plus a metre of threshold is on dry land — which is
* what put four of them across the river. Then the whole ring relaxes
* until nothing overlaps anything: no mound within 3.2 m of another, none
* within 1.8 m of the mill, its yard, the pond, the pound, the well or
* the green's oak, and none within a metre of a lane. A seat too near a
* lane slides ALONG the ring rather than outward, because a lane leaves a
* village between two tofts and sliding is what opens that gap.
*
* Result: spacing 9.9 to 16.1 m, mean 11.7, so the frontage is 57%
* occupied — the surveyed band for a real village is 50 to 67%, and the
* old six-dwelling ring managed 24%. Worst ground slope under a mound is
* 8.8 degrees. See docs/VILLAGE.md.
*/
/**
* A mound is close to a hemisphere: the radius roughly equals the height.
* Then the cut comes out almost a semicircle — an arch over the door
* rather than a wall.
*/
const BURROWS = [
	{
		id: "burrow-1",
		x: 10.6,
		z: 24.8,
		radius: 3.33,
		height: 3.13
	},
	{
		id: "burrow-2",
		x: 19.1,
		z: 19.1,
		radius: 3.71,
		height: 3.49
	},
	{
		id: "burrow-3",
		x: 24.9,
		z: 10.3,
		radius: 3.14,
		height: 2.95
	},
	{
		id: "burrow-4",
		x: 27,
		z: 0,
		radius: 3.52,
		height: 3.31
	},
	{
		id: "burrow-5",
		x: 24,
		z: -9.9,
		radius: 2.95,
		height: 2.77
	},
	{
		id: "burrow-6",
		x: 25.5,
		z: -25.5,
		radius: 3.33,
		height: 3.13
	},
	{
		id: "burrow-7",
		x: 11.9,
		z: -28.6,
		radius: 3.71,
		height: 3.49
	},
	{
		id: "burrow-8",
		x: 1.5,
		z: -30,
		radius: 3.14,
		height: 2.95
	},
	{
		id: "burrow-9",
		x: -13.8,
		z: -33.3,
		radius: 3.52,
		height: 3.31
	},
	{
		id: "burrow-10",
		x: -16.6,
		z: -17.4,
		radius: 2.95,
		height: 2.77
	},
	{
		id: "burrow-11",
		x: -22.7,
		z: -7.7,
		radius: 3.33,
		height: 3.13
	},
	{
		id: "burrow-12",
		x: -27,
		z: 1.6,
		radius: 3.71,
		height: 3.49
	},
	{
		id: "burrow-13",
		x: -24.5,
		z: 11.3,
		radius: 3.14,
		height: 2.95
	},
	{
		id: "burrow-14",
		x: -18.8,
		z: 19.4,
		radius: 3.52,
		height: 3.31
	},
	{
		id: "burrow-15",
		x: -10.5,
		z: 24.9,
		radius: 2.95,
		height: 2.77
	}
];
//#endregion
//#region src/world/burrow/profile.ts
/**
* Burrow geometry, computed from the parameters.
*
* Math only: the terrain and the meshes are both built from the same
* functions, so the facade cannot drift apart from the mound.
*
* How it works: the mound is cut by a vertical plane, and the cut is
* closed by a piece of geometry with a hole for the door. That gives two
* guarantees — the door cannot be buried under earth (it is a hole in
* the facade, not an object in front of it), and the facade cannot fail
* to meet the mound (the silhouette comes from the same function).
*
* The dome profile is half an ellipsoid, not a cosine. A cosine dome
* meets the ground at a shallow angle: to fit the door in you have to
* make it wide, and cutting such a pancake gives an eleven-meter wall
* that reads as a plywood board from the side. An ellipsoid has steep
* flanks, the radius can be taken nearly equal to the height, and the
* cut comes out as an arch a bit wider than the door — like real burrows.
*/
/** Top of the door casing above the threshold. */
const DOOR_TOP = 1.62;
/** Arch height on the cut, at side offset s from the door. */
function faceHeightAt(burrow, distance, s) {
	const r = Math.hypot(s, distance);
	if (r >= burrow.radius) return 0;
	return burrow.height * Math.sqrt(1 - (r / burrow.radius) ** 2);
}
/**
* How deep into the mound the cut plane goes.
*
* Computed so that exactly FACE_CLEARANCE of earth is left above the
* casing, rather than set as a fraction of the radius: with a fraction
* the margin would drift along with the size of the mound.
*/
function faceDistance(burrow) {
	const wanted = 2.17;
	if (wanted >= burrow.height) return 0;
	return burrow.radius * Math.sqrt(1 - (wanted / burrow.height) ** 2);
}
/**
* The facade point on the plane. Separate from faceOf because it is
* needed where there is no terrain yet: vegetation and ground painting
* steer clear of the doors, and they do not need the height for that.
*/
function facePoint(burrow) {
	const yaw = Math.atan2(-burrow.x, -burrow.z);
	const distance = faceDistance(burrow);
	return {
		x: burrow.x + Math.sin(yaw) * distance,
		z: burrow.z + Math.cos(yaw) * distance
	};
}
/** Everything both the terrain and the mesh builder need. */
function faceOf(burrow, valleyFloorAt) {
	const yaw = Math.atan2(-burrow.x, -burrow.z);
	const distance = faceDistance(burrow);
	return {
		yaw,
		x: burrow.x + Math.sin(yaw) * distance,
		z: burrow.z + Math.cos(yaw) * distance,
		distance,
		base: valleyFloorAt(burrow.x, burrow.z),
		halfWidth: Math.sqrt(Math.max(0, burrow.radius ** 2 - distance ** 2)),
		height: faceHeightAt(burrow, distance, 0)
	};
}
/**
* How far the terrain under the burrow is pulled up to the pad level.
* Without the leveling, valley swells climb up in front of the facade
* and drown the bottom of the door.
*/
function padWeight(burrow, x, z) {
	const distance = Math.hypot(x - burrow.x, z - burrow.z);
	const inner = burrow.radius + PAD_MARGIN;
	if (distance <= inner) return 1;
	if (distance >= inner + 2.6) return 0;
	const t = (distance - inner) / PAD_FADE;
	return 1 - t * t * (3 - 2 * t);
}
//#endregion
//#region src/config/green.ts
/**
* The green's furniture, as data.
*
* A green is not a lawn. It is the village's one shared room, and what
* makes it a room rather than a gap between houses is the kit standing on
* it: the water everyone draws from, the water the stock drinks, the tree
* that is older than any of them, and the pen where a beast that got out
* waits for its owner to pay for it.
*
* Every position here was solved against the world as built — hedges,
* hedgerow trees, lanes, work sites — rather than laid out on paper. The
* blueprint in docs/VILLAGE.md placed all five by eye before any of those
* existed, and four of the five landed inside something.
*/
/** The wellhead. Its total height is a halfling: the scale reference. */
const WELL = {
	x: -1,
	z: 8.5
};
/**
* The standard oak. Not a prop — one more instance in the hedgerow-tree
* mesh, so it costs no draw call at all. Its foot is on the footpath the
* path was drawn to reach.
*/
const OAK = {
	x: -4.5,
	z: 12.5,
	scale: GREEN_OAK_SCALE
};
/**
* The pond, in the green's low corner.
*
* Radius 2.8 is not a taste: it is the largest circle that leaves a body
* room to walk between the water and every hedge, tree and lane around
* it. The shoreline is not that circle — POND_WOBBLE bends it — and the
* waterline is not the shoreline either, because the water lies flat and
* the ground does not. That third line is the one you see.
*/
const POND = {
	x: -5.75,
	z: 7.25,
	radius: POND_RADIUS,
	wobble: POND_WOBBLE,
	depth: POND_DEPTH,
	waterDepth: POND_WATER_DEPTH,
	bank: POND_BANK
};
/** How far the shoreline reaches at its widest, in metres. */
const POND_REACH = POND_RADIUS * 1.13;
/**
* The pound: the pen for straying stock, walled and gated.
*
* On the verge outside the green's south hedge, fronting the mill lane —
* where a pound belongs, because a pound is a thing of the parish and the
* road, not of the lawn. The ground there sits level to within 62 mm over
* the whole footing ring, which is why it is there and not on the green.
*/
const POUND = {
	x: -6,
	z: -2.5,
	radius: POUND_RADIUS,
	segments: 11,
	/** Bearing of the gap, aimed at the lane the beast is driven along. */
	gate: 135 * Math.PI / 180
};
/**
* The shoreline, as a multiplier on the radius.
*
* Two harmonics, three-lobed and five-lobed, so the bank never repeats
* around the circle and never doubles back on itself.
*/
function pondEdge(angle) {
	return POND_RADIUS * (1 + POND_WOBBLE * (.62 * Math.sin(3 * angle + .9) + .38 * Math.sin(5 * angle + 2.4)));
}
//#endregion
//#region src/world/heightfield.ts
function clamp01(value) {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}
/** Smooth step: 0 before edge0, 1 after edge1, eased transition between. */
function smoothstep$1(edge0, edge1, value) {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
	return a + (b - a) * t;
}
/** Integer lattice hash -> [0, 1). Math.imul keeps the maths in 32 bits. */
function hash(ix, iz) {
	let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(TERRAIN_SEED, 1013904223);
	h = Math.imul(h ^ h >>> 13, 1274126177);
	return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
/** Value noise in the range [-1, 1]: bilinear blend of lattice hashes. */
function valueNoise(x, z) {
	const ix = Math.floor(x);
	const iz = Math.floor(z);
	const sx = smoothstep$1(0, 1, x - ix);
	const sz = smoothstep$1(0, 1, z - iz);
	return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), sx), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx), sz) * 2 - 1;
}
/** Sum of octaves: the coarse shape plus ever finer detail. */
function fbm(x, z, octaves) {
	let sum = 0;
	let amplitude = 1;
	let frequency = 1;
	let total = 0;
	for (let i = 0; i < octaves; i++) {
		sum += valueNoise(x * frequency, z * frequency) * amplitude;
		total += amplitude;
		amplitude *= .5;
		frequency *= 2;
	}
	return sum / total;
}
/** Channel axis: where the middle of the river runs at a given x. */
function riverCenterZ(x) {
	return -22 + 12 * Math.sin(x * RIVER_WAVINESS);
}
/**
* How deeply the channel is cut in at this point. Zero means the river
* doesn't reach here.
*
* Towards the valley rim the cut fades to nothing: cut the rim through
* and a gap appears in the closed ring, and the player walks out of the
* valley along the channel. The ring has been checked numerically
* (docs/ASSETS.md isn't about this, but the closedness test runs over
* 3600 directions) — it must not be broken.
*/
function riverCarve(x, z) {
	const profile = 1 - smoothstep$1(3 * .55, 4.5, Math.abs(z - riverCenterZ(x)));
	if (profile <= 0) return 0;
	const distance = Math.hypot(x, z) / 128;
	const taper = 1 - smoothstep$1(RIVER_FADE_START, RIVER_FADE_END, distance);
	return RIVER_DEPTH * profile * taper;
}
/**
* Burrow cuts are computed once: faceOf depends only on the burrow data
* and on the valley terrain without the burrows, so there is no recursion
* here.
*/
const FACES = BURROWS.map((burrow) => faceOf(burrow, valleyFloor));
/**
* The ground under the burrows is flattened into a pad.
*
* The hill itself is no longer raised by the terrain: it became a
* separate mesh together with the facade (burrow/mesh.ts). All the
* terrain has left to do is give it a level base — otherwise the valley's
* waves creep in front of the door and drown its lower edge.
*
* With fifteen dwellings the pads overlap: fifteen of the hundred and
* five pairs reach into each other, and their levels differ by up to
* 0.92 m. Taking the strongest pad and ignoring the rest put a cliff on
* every seam — 127 points inside the village stood steeper than 40
* degrees, one of them at 69 — and it left burrow-2's rim floating 0.92 m
* off its own base. Blending fixes both, but a flat average does not:
* a pad is flat at weight 1 over a disc wider than its own mound, so
* neighbours tie and no mound owns the ground beneath it. Weighting by
* closeness as well leaves nothing steeper than 31 degrees and every rim
* within 6 cm of where its mound expects it.
*/
function burrowGround(x, z, floor) {
	let strongest = 0;
	let sum = 0;
	let total = 0;
	for (let i = 0; i < BURROWS.length; i++) {
		const burrow = BURROWS[i];
		const face = FACES[i];
		if (burrow === void 0 || face === void 0) continue;
		const w = padWeight(burrow, x, z);
		if (w <= 0) continue;
		if (w > strongest) strongest = w;
		const reach = Math.max(0, Math.hypot(x - burrow.x, z - burrow.z) - burrow.radius);
		const closeness = w / (PAD_BIAS + reach * reach);
		sum += closeness * face.base;
		total += closeness;
	}
	if (total <= 0) return floor;
	return lerp(floor, sum / total, strongest);
}
/** Valley terrain without the burrows and without the channel. */
function valleyFloor(x, z) {
	const distance = Math.hypot(x, z) / 128;
	const rim = smoothstep$1(RIM_START, 1.05, distance) ** RIM_CURVE * 30;
	const calm = 1 - smoothstep$1(CENTER_CALM_INNER, CENTER_CALM_OUTER, distance);
	const hills = fbm(x * HILL_FREQUENCY, z * HILL_FREQUENCY, 4) * HILL_HEIGHT * (1 - calm * .8);
	const detail = fbm(x * DETAIL_FREQUENCY, z * DETAIL_FREQUENCY, 3) * DETAIL_HEIGHT;
	return rim + hills + detail;
}
/** Ground height without the channel — the water stands on it. */
function groundHeight(x, z) {
	return burrowGround(x, z, valleyFloor(x, z));
}
/**
* The pond dish on the green.
*
* Squared distance, and the outer radius squared once at module scope.
* This function is asked the same question as riverCarve — "are we near
* it at all?" — and the answer is no for 99.96 % of the calls, of which
* there are around 593,000 before the first frame: heightAt runs once per
* terrain vertex and three more times per vertex inside groundColor's
* slope test. A Math.hypot in that early-out is not sqrt; it is a
* variadic builtin with overflow guards, and measured it cost 29 ms of
* startup against 3 ms for the comparison below.
*
* Inside, the floor is flat and the bank is a ramp POND_BANK wide. A dish
* that curved to the middle instead held nine square metres of water
* where this holds sixteen.
*/
const POND_REACH_SQ = (POND_RADIUS * 1.13) ** 2;
function pondCarve(x, z) {
	const dx = x - POND.x;
	const dz = z - POND.z;
	const distanceSq = dx * dx + dz * dz;
	if (distanceSq >= POND_REACH_SQ) return 0;
	const distance = Math.sqrt(distanceSq);
	const edge = pondEdge(Math.atan2(dz, dx));
	if (distance >= edge) return 0;
	return POND_DEPTH * smoothstep$1(0, 1, Math.min(1, (edge - distance) / POND_BANK));
}
/** Ground height at world point (x, z), with the channel and pond cut in. */
function heightAt(x, z) {
	return groundHeight(x, z) - riverCarve(x, z) - pondCarve(x, z);
}
/**
* The pond's surface, which is level — unlike the river's, which follows
* the ground because a channel may.
*
* Recovered from the ground rather than written down: the dish is at full
* depth under its own centre, so the rim is groundHeight there. A number
* in constants.ts would go stale the moment the terrain moved.
*/
let pondSurface = null;
function pondWaterY() {
	if (pondSurface === null) pondSurface = groundHeight(POND.x, POND.z) - POND_WATER_DEPTH;
	return pondSurface;
}
//#endregion
//#region src/config/lanes.ts
/** Half-width of the beaten track. */
const LANE_HALF_WIDTH = {
	cart: 1,
	front: .8,
	croft: .5,
	foot: .35
};
/** How far the wear fades past the track, as a multiple of the half-width. */
const LANE_BLEND = 1.45;
const LANES = [
	{
		id: "cart",
		kind: "cart",
		points: [
			[-.1, 20.1],
			[.8, 17],
			[1.4, 11],
			[1.2, 6],
			[.4, 0],
			[-.4, -7],
			[-.6, -14],
			[-.6, -18],
			[-.4, -22],
			[-.5, -26],
			[-6.2, -31.6],
			[-7.7, -37.3]
		]
	},
	{
		id: "front",
		kind: "front",
		points: [
			[19.3, -8],
			[21.1, 0],
			[20, 8.3],
			[14.8, 14.8],
			[8.4, 19.7],
			[-.1, 20.1],
			[-8.5, 20.3],
			[-14.7, 15.2],
			[-19.7, 9.1],
			[-20.9, 1.2],
			[-17.4, -5.9],
			[-13.1, -13.8]
		]
	},
	{
		id: "over-water",
		kind: "front",
		points: [
			[30, -30],
			[14.5, -34.8],
			[1.8, -36.1],
			[-16.3, -39.3]
		]
	},
	{
		id: "mill",
		kind: "cart",
		points: [
			[-8, 1],
			[-12, -3.5],
			[-16, -8],
			[-20, -13.4],
			[-24, -17],
			[-26.5, -19.5]
		]
	},
	{
		id: "green-walk",
		kind: "foot",
		points: [
			[.75, 3],
			[.1, 8.8],
			[-2.55, 12.8],
			[-4, 15]
		]
	},
	{
		id: "bank",
		kind: "foot",
		points: [
			[-8, -19.3],
			[-1, -18.4],
			[4, -17],
			[10, -15.9],
			[16, -14.8]
		]
	}
];
/** Where a burrow's threshold sits, and which way it faces. */
function threshold(burrow) {
	const yaw = Math.atan2(-burrow.x, -burrow.z);
	const reach = burrow.radius * Math.sqrt(Math.max(0, 1 - (2.17 / burrow.height) ** 2));
	return {
		x: burrow.x + Math.sin(yaw) * reach,
		z: burrow.z + Math.cos(yaw) * reach,
		yaw,
		reach
	};
}
/**
* The short path from each threshold to the street. Generated rather than
* written down, so it follows a dwelling that moves.
*
* On the far bank the street is behind the row, and a straight line from
* the door to it would go through the mound — so those turn the corner.
*/
function doorSpurs() {
	const spurs = [];
	for (const burrow of BURROWS) {
		const door = threshold(burrow);
		const step = .6;
		const from = [burrow.x + Math.sin(door.yaw) * (door.reach + step), burrow.z + Math.cos(door.yaw) * (door.reach + step)];
		if (burrow.z > riverCenterZ(burrow.x)) {
			const to = [burrow.x + Math.sin(door.yaw) * (door.reach + 3.2), burrow.z + Math.cos(door.yaw) * (door.reach + 3.2)];
			spurs.push({
				id: `spur-${burrow.id}`,
				kind: "croft",
				points: [from, to]
			});
			continue;
		}
		const side = door.yaw + Math.PI / 2;
		const flank = burrow.radius + 1.4;
		const behind = door.reach + burrow.radius + 3;
		spurs.push({
			id: `spur-${burrow.id}`,
			kind: "croft",
			points: [
				from,
				[burrow.x + Math.sin(side) * flank, burrow.z + Math.cos(side) * flank],
				[burrow.x - Math.sin(door.yaw) * behind, burrow.z - Math.cos(door.yaw) * behind]
			]
		});
	}
	return spurs;
}
//#endregion
//#region src/core/random.ts
/** FNV-1a: string to 32 bits. */
function hashSeed(seed) {
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
/** mulberry32: a tiny generator over a single 32-bit state. */
function makeRandom(seed) {
	let state = seed;
	return () => {
		state = state + 1831565813 >>> 0;
		let t = state;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
//#endregion
//#region src/world/groundColor.ts
/**
* Flattens the lane network into segments once, carrying each way's own
* width along with it.
*
* The routes themselves are data in config/lanes.ts, so moving a lane is
* one edit in one file — the same discipline work.ts already has.
*/
function buildPaths() {
	const segments = [];
	for (const lane of [...LANES, ...doorSpurs()]) {
		const halfWidth = LANE_HALF_WIDTH[lane.kind];
		for (let i = 1; i < lane.points.length; i++) {
			const a = lane.points[i - 1];
			const b = lane.points[i];
			if (a === void 0 || b === void 0) continue;
			segments.push({
				ax: a[0],
				az: a[1],
				bx: b[0],
				bz: b[1],
				halfWidth
			});
		}
	}
	const byRole = /* @__PURE__ */ new Map();
	for (const point of WORK_POINTS) {
		const spot = propPosition(point);
		const acc = byRole.get(point.role) ?? {
			x: 0,
			z: 0,
			count: 0
		};
		acc.x += spot.x;
		acc.z += spot.z;
		acc.count++;
		byRole.set(point.role, acc);
	}
	for (const acc of byRole.values()) {
		const cx = acc.x / acc.count;
		const cz = acc.z / acc.count;
		const near = nearestOnNetwork(cx, cz, segments);
		segments.push({
			ax: near.x,
			az: near.z,
			bx: cx,
			bz: cz,
			halfWidth: LANE_HALF_WIDTH.croft
		});
	}
	return segments;
}
/** Closest point anywhere on the network so far. */
function nearestOnNetwork(x, z, segments) {
	let best = Infinity;
	let point = {
		x,
		z
	};
	for (const segment of segments) {
		const dx = segment.bx - segment.ax;
		const dz = segment.bz - segment.az;
		const length = dx * dx + dz * dz;
		const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / length));
		const px = segment.ax + dx * t;
		const pz = segment.az + dz * t;
		const d = Math.hypot(x - px, z - pz);
		if (d < best) {
			best = d;
			point = {
				x: px,
				z: pz
			};
		}
	}
	return point;
}
/** Distance from a point to a segment in the plane. */
function distanceToSegment(x, z, s) {
	const dx = s.bx - s.ax;
	const dz = s.bz - s.az;
	const lengthSquared = dx * dx + dz * dz;
	if (lengthSquared < 1e-8) return Math.hypot(x - s.ax, z - s.az);
	let t = ((x - s.ax) * dx + (z - s.az) * dz) / lengthSquared;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}
function smoothstep(edge0, edge1, value) {
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
/** Surface slope at a point, by finite difference. */
function slopeAt(x, z) {
	const h = heightAt(x, z);
	const step = .5;
	return Math.atan(Math.hypot(heightAt(x + step, z) - h, heightAt(x, z + step) - h) / step);
}
/**
* Fills in the `color` attribute for the terrain geometry.
* The geometry must already be displaced by height.
*/
function paintGround(geometry) {
	const position = geometry.getAttribute("position");
	const paths = buildPaths();
	const patchOffset = makeRandom(hashSeed("ground"))() * 1e3;
	const grass = new THREE.Color(PALETTE.grass);
	const dry = new THREE.Color(PALETTE.grassDry);
	const earth = new THREE.Color(PALETTE.earth);
	const rock = new THREE.Color(PALETTE.rock);
	const current = new THREE.Color();
	const data = new Float32Array(position.count * 3);
	for (let i = 0; i < position.count; i++) {
		const x = position.getX(i);
		const z = position.getZ(i);
		const patch = .5 + .5 * Math.sin((x + patchOffset) * GROUND_PATCH_FREQUENCY) * Math.cos((z - patchOffset) * GROUND_PATCH_FREQUENCY * 1.3);
		current.copy(grass).lerp(dry, patch * .45);
		const slope = slopeAt(x, z);
		current.lerp(earth, smoothstep(GROUND_DIRT_SLOPE, GROUND_ROCK_SLOPE, slope) * .85);
		current.lerp(rock, smoothstep(GROUND_ROCK_SLOPE, GROUND_ROCK_SLOPE + .25, slope) * .7);
		const carve = riverCarve(x, z);
		if (carve > .01) current.lerp(earth, 1 - smoothstep(0, BANK_WIDTH, Math.abs(carve - RIVER_DEPTH)));
		const dish = pondCarve(x, z);
		if (dish > .01) current.lerp(earth, smoothstep(0, POND_DEPTH * .5, dish));
		let wear = 0;
		for (const segment of paths) {
			const d = distanceToSegment(x, z, segment);
			const edge = segment.halfWidth + segment.halfWidth * LANE_BLEND;
			if (d >= edge) continue;
			const w = 1 - smoothstep(segment.halfWidth, edge, d);
			if (w > wear) wear = w;
		}
		current.lerp(earth, wear * .8);
		data[i * 3] = current.r;
		data[i * 3 + 1] = current.g;
		data[i * 3 + 2] = current.b;
	}
	geometry.setAttribute("color", new THREE.BufferAttribute(data, 3));
}
//#endregion
//#region src/render/Outline.ts
/**
* Inverted hull outline (decision #5).
*
* The idea: a copy of the mesh is placed beside it, inflated along the
* normals and drawn with back faces only. The copy's front faces are
* culled, so all that shows is what sticks out past the original's
* silhouette — and that reads as an outline. No post-processing needed,
* it works on any hardware and costs one extra draw call per object.
*
* The subtleties that break a naive implementation:
*
* 1. Inflate in view space, not in local space. The player model is
*    scaled to 0.5, and in local coordinates its outline would come out
*    twice as thin as on objects at natural size.
* 2. Compute the normal ourselves rather than via the
*    `defaultnormal_vertex` chunk: with `side: BackSide` three sets
*    FLIP_SIDED and flips it, so the copy would inflate inwards and the
*    outline would disappear.
* 3. Inflate along a smoothed normal, not the one the shader shades with.
*    On KayKit heads 23–45% of the vertices sit on hard-edge seams: several
*    vertices at one point with different normals, up to 148° apart. Along
*    such normals the hull splits open, and through the gaps you see its
*    own dark back faces — like dirty smudges around the eyes and mouth.
*    Averaging the normals over coincident positions makes the hull solid.
* 4. For skinned meshes the copy shares the skeleton with the original —
*    otherwise the outline would not keep up with the animation.
* 5. If the object has a texture, the outline samples that same texture
*    and darkens it — then it really is "a darkened version of the
*    object's own colour" and not one shared dark tone. The texture has
*    to be decoded by hand: three does not do it for us in a custom
*    shader, and without sRGBTransferEOTF the colour would be off.
*/
const vertexShader = `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>

uniform float thickness;

/** Normal averaged over coincident positions: no splits at the seams. */
attribute vec3 smoothNormal;

#ifdef OUTLINE_USE_MAP
varying vec2 vOutlineUv;
#endif

void main() {
  #include <beginnormal_vertex>

  // Swap the normal in before skinning so the bones rotate it as well
  objectNormal = smoothNormal;

  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  // Our own normal in view space, without FLIP_SIDED
  vec3 outlineNormal = normalize( normalMatrix * objectNormal );

  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  mvPosition.xyz += outlineNormal * thickness;

  gl_Position = projectionMatrix * mvPosition;

  #ifdef OUTLINE_USE_MAP
  vOutlineUv = uv;
  #endif

  #include <fog_vertex>
}
`;
const fragmentShader = `
#include <common>
// colorspace_pars_fragment is not included: three prepends it to every
// fragment shader on its own, and an explicit include would duplicate the
// function bodies — the shader would fail to compile
#include <fog_pars_fragment>

uniform vec3 outlineColor;
uniform float darkenFactor;

#ifdef OUTLINE_USE_MAP
uniform sampler2D outlineMap;
varying vec2 vOutlineUv;
#endif

void main() {
  #ifdef OUTLINE_USE_MAP
  // The texture is in sRGB, but the maths must be done in linear space
  vec3 base = sRGBTransferEOTF( texture2D( outlineMap, vOutlineUv ) ).rgb;
  #else
  vec3 base = outlineColor;
  #endif

  gl_FragColor = vec4( base * darkenFactor, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
/** Materials are cached: one program per colour or per texture. */
const materials = /* @__PURE__ */ new Map();
function outlineMaterial(color, thickness, map) {
	const key = map === null ? `c${color}:${thickness}` : `m${map.uuid}:${thickness}`;
	const cached = materials.get(key);
	if (cached !== void 0) return cached;
	const material = new THREE.ShaderMaterial({
		vertexShader,
		fragmentShader,
		uniforms: {
			...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
			thickness: { value: thickness },
			darkenFactor: { value: OUTLINE_DARKEN },
			outlineColor: { value: new THREE.Color(color) },
			outlineMap: { value: map }
		},
		defines: map === null ? {} : { OUTLINE_USE_MAP: "" },
		side: THREE.BackSide,
		fog: true
	});
	materials.set(key, material);
	return material;
}
/**
* Computes the smoothNormal attribute: normals averaged over vertices that
* sit at the same point. The attribute goes into the geometry shared with
* the original — the toon material simply never reads it.
*/
function ensureSmoothNormals(geometry) {
	if (geometry.getAttribute("smoothNormal") !== void 0) return;
	const position = geometry.getAttribute("position");
	const normal = geometry.getAttribute("normal");
	const keyOf = (i) => `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
	const sums = /* @__PURE__ */ new Map();
	const keys = new Array(position.count);
	for (let i = 0; i < position.count; i++) {
		const key = keyOf(i);
		keys[i] = key;
		const existing = sums.get(key);
		if (existing === void 0) sums.set(key, new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)));
		else {
			existing.x += normal.getX(i);
			existing.y += normal.getY(i);
			existing.z += normal.getZ(i);
		}
	}
	const data = new Float32Array(position.count * 3);
	for (let i = 0; i < position.count; i++) {
		const key = keys[i];
		const sum = key === void 0 ? void 0 : sums.get(key);
		if (sum === void 0) continue;
		const length = sum.length();
		if (length < 1e-6) {
			data[i * 3] = normal.getX(i);
			data[i * 3 + 1] = normal.getY(i);
			data[i * 3 + 2] = normal.getZ(i);
		} else {
			data[i * 3] = sum.x / length;
			data[i * 3 + 1] = sum.y / length;
			data[i * 3 + 2] = sum.z / length;
		}
	}
	geometry.setAttribute("smoothNormal", new THREE.BufferAttribute(data, 3));
}
/**
* Builds the outline mesh for a single mesh. Returns null if the geometry
* is unusable (no normals — nothing to inflate along).
*/
function createOutline(source, options) {
	if (source.geometry.getAttribute("normal") === void 0) return null;
	ensureSmoothNormals(source.geometry);
	const { color, map = null, thickness = OUTLINE_THICKNESS } = options;
	const material = outlineMaterial(color, thickness, map);
	const copyTransform = (target) => {
		target.position.copy(source.position);
		target.quaternion.copy(source.quaternion);
		target.scale.copy(source.scale);
	};
	const finish = (outline) => {
		copyTransform(outline);
		outline.frustumCulled = source.frustumCulled;
		outline.castShadow = false;
		outline.receiveShadow = false;
		outline.renderOrder = source.renderOrder - 1;
		outline.name = `${source.name}_outline`;
		return outline;
	};
	if (source instanceof THREE.SkinnedMesh) {
		const outline = new THREE.SkinnedMesh(source.geometry, material);
		finish(outline);
		outline.bind(source.skeleton, source.bindMatrix);
		outline.bindMode = source.bindMode;
		return outline;
	}
	return finish(new THREE.Mesh(source.geometry, material));
}
//#endregion
//#region src/render/style.ts
/**
* The single styling entry point (decision #6). Everything that ends up in
* the scene goes through applyStyle: the material that came with the asset
* is thrown away and replaced with a toon one from the project palette.
*/
/**
* Lighting ramp for MeshToonMaterial.
*
* MeshToonMaterial takes the illumination computed the usual way and,
* instead of applying it smoothly, uses it to look up a colour in this
* one-dimensional texture. NearestFilter turns the gradient into steps:
* three texels — three light levels, shadow / midtone / light. Without
* Nearest we would get the same gradient, only routed through a texture.
*/
function createToonGradient(steps) {
	const data = new Uint8Array(steps);
	for (let i = 0; i < steps; i++) data[i] = Math.round((i + 1) / steps * 255);
	const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return texture;
}
const gradientMap = createToonGradient(3);
/** Materials are cached: same colour or same atlas — one program. */
const surfaces = /* @__PURE__ */ new Map();
function toonSurface(color, map = null) {
	const key = map === null ? `c${color}` : `m${map.uuid}`;
	const cached = surfaces.get(key);
	if (cached !== void 0) return cached;
	const material = new THREE.MeshToonMaterial({
		color: map === null ? color : 16777215,
		gradientMap,
		fog: true,
		...map === null ? {} : { map }
	});
	surfaces.set(key, material);
	return material;
}
/**
* Material for geometry with the colour baked into the vertices.
*
* Trees need it: trunk and crown are different colours, yet it is one
* instanced mesh. Colouring them separately would mean two InstancedMeshes
* per chunk — twice the draw calls for the sake of two colours.
*/
let vertexColored = null;
function toonVertexColored() {
	if (vertexColored === null) vertexColored = new THREE.MeshToonMaterial({
		color: 16777215,
		vertexColors: true,
		gradientMap,
		fog: true
	});
	return vertexColored;
}
/**
* Walks the subtree, swaps the materials and optionally attaches outlines.
* The outlines are collected into a list and added after the walk: adding
* children inside traverse means traversing them too.
*
* Returns the outlines it created: they get faded out by distance (step 6),
* and that needs references to them.
*/
function applyStyle(root, options) {
	const { color, map, vertexColors = false, outline = false, castShadow = true, receiveShadow = true } = options;
	const material = vertexColors ? toonVertexColored() : toonSurface(color, map ?? null);
	const outlineColor = darken(color, OUTLINE_DARKEN);
	const pending = [];
	root.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) return;
		if (child.name.endsWith("_outline")) return;
		child.material = material;
		child.castShadow = castShadow;
		child.receiveShadow = receiveShadow;
		if (!outline) return;
		const hull = createOutline(child, {
			color: outlineColor,
			map
		});
		if (hull !== null && child.parent !== null) pending.push({
			parent: child.parent,
			outline: hull
		});
	});
	for (const { parent, outline: hull } of pending) parent.add(hull);
	return pending.map((entry) => entry.outline);
}
//#endregion
//#region src/world/Terrain.ts
/**
* The valley mesh plus the BVH built over it.
*
* A BVH (bounding volume hierarchy) is a tree of nested boxes over the
* triangles. Without it a ray would be tested against all 131k
* triangles; with it, against a dozen boxes and a handful of triangles.
* Built once at startup.
*/
var Terrain = class {
	mesh;
	bvh;
	constructor() {
		const geometry = new THREE.PlaneGeometry(256, 256, 384, 384);
		geometry.rotateX(-Math.PI / 2);
		const position = geometry.attributes.position;
		for (let i = 0; i < position.count; i++) position.setY(i, heightAt(position.getX(i), position.getZ(i)));
		position.needsUpdate = true;
		geometry.computeVertexNormals();
		paintGround(geometry);
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		this.bvh = new MeshBVH(geometry);
		this.mesh = new THREE.Mesh(geometry);
		this.mesh.name = "terrain";
		applyStyle(this.mesh, {
			color: PALETTE.grass,
			vertexColors: true,
			outline: false,
			castShadow: false,
			receiveShadow: true
		});
		this.mesh.matrixAutoUpdate = false;
		this.mesh.updateMatrix();
	}
	dispose() {
		this.mesh.geometry.dispose();
	}
};
//#endregion
//#region node_modules/three/examples/jsm/utils/BufferGeometryUtils.js
/**
* Merges a set of geometries into a single instance. All geometries must have compatible attributes.
*
* @param {Array<BufferGeometry>} geometries - The geometries to merge.
* @param {boolean} [useGroups=false] - Whether to use groups or not.
* @return {?BufferGeometry} The merged geometry. Returns `null` if the merge does not succeed.
*/
function mergeGeometries(geometries, useGroups = false) {
	const isIndexed = geometries[0].index !== null;
	const attributesUsed = new Set(Object.keys(geometries[0].attributes));
	const morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes));
	const attributes = {};
	const morphAttributes = {};
	const morphTargetsRelative = geometries[0].morphTargetsRelative;
	const mergedGeometry = new BufferGeometry();
	let offset = 0;
	for (let i = 0; i < geometries.length; ++i) {
		const geometry = geometries[i];
		let attributesCount = 0;
		if (isIndexed !== (geometry.index !== null)) {
			console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");
			return null;
		}
		for (const name in geometry.attributes) {
			if (!attributesUsed.has(name)) {
				console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". All geometries must have compatible attributes; make sure \"" + name + "\" attribute exists among all geometries, or in none of them.");
				return null;
			}
			if (attributes[name] === void 0) attributes[name] = [];
			attributes[name].push(geometry.attributes[name]);
			attributesCount++;
		}
		if (attributesCount !== attributesUsed.size) {
			console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". Make sure all geometries have the same number of attributes.");
			return null;
		}
		if (morphTargetsRelative !== geometry.morphTargetsRelative) {
			console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". .morphTargetsRelative must be consistent throughout all geometries.");
			return null;
		}
		for (const name in geometry.morphAttributes) {
			if (!morphAttributesUsed.has(name)) {
				console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ".  .morphAttributes must be consistent throughout all geometries.");
				return null;
			}
			if (morphAttributes[name] === void 0) morphAttributes[name] = [];
			morphAttributes[name].push(geometry.morphAttributes[name]);
		}
		if (useGroups) {
			let count;
			if (isIndexed) count = geometry.index.count;
			else if (geometry.attributes.position !== void 0) count = geometry.attributes.position.count;
			else {
				console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". The geometry must have either an index or a position attribute");
				return null;
			}
			mergedGeometry.addGroup(offset, count, i);
			offset += count;
		}
	}
	if (isIndexed) {
		let indexOffset = 0;
		const mergedIndex = [];
		for (let i = 0; i < geometries.length; ++i) {
			const index = geometries[i].index;
			for (let j = 0; j < index.count; ++j) mergedIndex.push(index.getX(j) + indexOffset);
			indexOffset += geometries[i].attributes.position.count;
		}
		mergedGeometry.setIndex(mergedIndex);
	}
	for (const name in attributes) {
		const mergedAttribute = mergeAttributes(attributes[name]);
		if (!mergedAttribute) {
			console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.");
			return null;
		}
		mergedGeometry.setAttribute(name, mergedAttribute);
	}
	for (const name in morphAttributes) {
		const numMorphTargets = morphAttributes[name][0].length;
		if (numMorphTargets === 0) continue;
		mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
		mergedGeometry.morphAttributes[name] = [];
		for (let i = 0; i < numMorphTargets; ++i) {
			const morphAttributesToMerge = [];
			for (let j = 0; j < morphAttributes[name].length; ++j) morphAttributesToMerge.push(morphAttributes[name][j][i]);
			const mergedMorphAttribute = mergeAttributes(morphAttributesToMerge);
			if (!mergedMorphAttribute) {
				console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " morphAttribute.");
				return null;
			}
			mergedGeometry.morphAttributes[name].push(mergedMorphAttribute);
		}
	}
	return mergedGeometry;
}
/**
* Merges a set of attributes into a single instance. All attributes must have compatible properties and types.
* Instances of {@link InterleavedBufferAttribute} are not supported.
*
* @param {Array<BufferAttribute>} attributes - The attributes to merge.
* @return {?BufferAttribute} The merged attribute. Returns `null` if the merge does not succeed.
*/
function mergeAttributes(attributes) {
	let TypedArray;
	let itemSize;
	let normalized;
	let gpuType = -1;
	let arrayLength = 0;
	for (let i = 0; i < attributes.length; ++i) {
		const attribute = attributes[i];
		if (TypedArray === void 0) TypedArray = attribute.array.constructor;
		if (TypedArray !== attribute.array.constructor) {
			console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.");
			return null;
		}
		if (itemSize === void 0) itemSize = attribute.itemSize;
		if (itemSize !== attribute.itemSize) {
			console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.");
			return null;
		}
		if (normalized === void 0) normalized = attribute.normalized;
		if (normalized !== attribute.normalized) {
			console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.");
			return null;
		}
		if (gpuType === -1) gpuType = attribute.gpuType;
		if (gpuType !== attribute.gpuType) {
			console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.");
			return null;
		}
		arrayLength += attribute.count * itemSize;
	}
	const array = new TypedArray(arrayLength);
	const result = new BufferAttribute(array, itemSize, normalized);
	let offset = 0;
	for (let i = 0; i < attributes.length; ++i) {
		const attribute = attributes[i];
		if (attribute.isInterleavedBufferAttribute) {
			const tupleOffset = offset / itemSize;
			for (let j = 0, l = attribute.count; j < l; j++) for (let c = 0; c < itemSize; c++) {
				const value = attribute.getComponent(j, c);
				result.setComponent(j + tupleOffset, c, value);
			}
		} else array.set(attribute.array, offset);
		offset += attribute.count * itemSize;
	}
	if (gpuType !== void 0) result.gpuType = gpuType;
	return result;
}
//#endregion
//#region src/world/burrow/mesh.ts
/**
* The burrow mound as a single mesh — facade included.
*
* The mound used to live in the terrain, and the cut was covered by a
* separate flat panel. As long as those are two different things, the
* panel has to be flat, and from any angle but head-on it reads as a
* board propped against the hill. No amount of trim fixes that.
*
* Now the mound is a surface of its own, and the "facade" is just a
* patch of it pressed inwards to take the door. What stays flat is a
* circle a little over a meter in radius, everything else is a curved
* dome blending smoothly into it. There is no separate facade left, so
* nothing is there to look like a propped board.
*
* The geometry is parametric: rings up the height, segments around the
* circle. Vertices that land near the door are pulled towards the door
* plane, the more strongly the closer they are to its center.
*/
function buildMoundMesh(burrow, face) {
	const distance = faceDistance(burrow);
	const outX = Math.sin(face.yaw);
	const outZ = Math.cos(face.yaw);
	const leftX = Math.cos(face.yaw);
	const leftZ = -Math.sin(face.yaw);
	const positions = [];
	const colors = [];
	const indices = [];
	const grass = new THREE.Color(PALETTE.grass);
	const dry = new THREE.Color(darken(PALETTE.grass, .88));
	const earth = new THREE.Color(PALETTE.earth);
	const color = new THREE.Color();
	for (let ring = 0; ring <= 16; ring++) {
		const v = ring / 16 * (Math.PI / 2);
		const radius = burrow.radius * Math.cos(v);
		const y = burrow.height * Math.sin(v);
		for (let segment = 0; segment <= 40; segment++) {
			const u = segment / 40 * Math.PI * 2;
			let x = radius * Math.cos(u);
			let z = radius * Math.sin(u);
			let forward = x * outX + z * outZ;
			const side = x * leftX + z * leftZ;
			const fromDoor = Math.hypot(side, y - DOOR_CENTER_HEIGHT);
			const t = Math.min(1, Math.max(0, (fromDoor - DIMPLE_INNER) / .8));
			const pull = 1 - t * t * (3 - 2 * t);
			if (pull > 0 && forward > distance) {
				const flattened = distance + (forward - distance) * (1 - pull);
				const shift = flattened - forward;
				x += outX * shift;
				z += outZ * shift;
				forward = flattened;
			}
			positions.push(x, y, z);
			const groundTint = grass.clone().lerp(dry, 1 - y / Math.max(.001, burrow.height));
			color.copy(groundTint).lerp(earth, pull * .85);
			colors.push(color.r, color.g, color.b);
		}
	}
	const stride = 41;
	for (let ring = 0; ring < 16; ring++) for (let segment = 0; segment < 40; segment++) {
		const a = ring * stride + segment;
		const b = a + stride;
		indices.push(a, b, a + 1, b, b + 1, a + 1);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	geometry.translate(burrow.x, face.base, burrow.z);
	geometry.computeBoundingSphere();
	return geometry;
}
//#endregion
//#region src/world/burrow/build.ts
function buildBurrows(valleyFloorAt) {
	const mounds = [];
	const byColor = /* @__PURE__ */ new Map();
	const blockers = [];
	const chimneys = [];
	const add = (color, geometry) => {
		const bucket = byColor.get(color);
		if (bucket === void 0) byColor.set(color, [geometry]);
		else bucket.push(geometry);
	};
	for (const burrow of BURROWS) {
		const face = faceOf(burrow, valleyFloorAt);
		checkFits(burrow, face);
		const random = makeRandom(hashSeed(burrow.id));
		const place = (geometry, forward) => {
			geometry.translate(0, 0, forward);
			geometry.rotateY(face.yaw);
			geometry.translate(face.x, face.base, face.z);
			return geometry;
		};
		mounds.push(buildMoundMesh(burrow, face));
		const recess = new THREE.CircleGeometry(DOOR_FRAME_RADIUS, 22);
		recess.translate(0, DOOR_CENTER_HEIGHT, 0);
		add(PALETTE.ink, place(recess, .05));
		const leaf = new THREE.CircleGeometry(DOOR_RADIUS, 22);
		leaf.translate(0, DOOR_CENTER_HEIGHT, 0);
		add(PALETTE.wood, place(leaf, .11000000000000001));
		for (const part of doorFrame()) add(part.color, place(part.geometry, .1));
		const knob = new THREE.SphereGeometry(.07, 8, 6);
		knob.translate(0, DOOR_CENTER_HEIGHT, 0);
		add(PALETTE.thatch, place(knob, .18000000000000002));
		for (const stone of pathStones(random)) add(PALETTE.rock, place(stone, FACE_OFFSET));
		const pipeHeight = .6;
		const pipeCentre = face.base + burrow.height - .15;
		const pipe = new THREE.CylinderGeometry(.13, .16, pipeHeight, 8);
		pipe.translate(burrow.x, pipeCentre, burrow.z);
		add(PALETTE.rock, pipe);
		chimneys.push(new THREE.Vector3(burrow.x, pipeCentre + pipeHeight / 2, burrow.z));
		blockers.push({
			x: burrow.x,
			z: burrow.z,
			radius: burrow.radius * .85
		});
		blockers.push({
			x: face.x,
			z: face.z,
			radius: 1
		});
	}
	const merged = mergeGeometries(mounds, false);
	for (const geometry of mounds) geometry.dispose();
	if (merged === null) throw new Error("[burrow] could not merge the mound geometry");
	merged.computeBoundingSphere();
	const parts = /* @__PURE__ */ new Map();
	for (const [color, geometries] of byColor) {
		const merged = mergeGeometries(geometries, false);
		for (const geometry of geometries) geometry.dispose();
		if (merged === null) throw new Error("[burrow] could not merge the part geometry");
		merged.computeBoundingSphere();
		parts.set(color, merged);
	}
	return {
		mounds: merged,
		parts,
		blockers,
		chimneys
	};
}
/** Thick wooden arch with spokes — the mark of a round door. */
function doorFrame() {
	const parts = [];
	const ring = new THREE.TorusGeometry(DOOR_FRAME_RADIUS, DOOR_FRAME_TUBE, 8, 24);
	ring.translate(0, DOOR_CENTER_HEIGHT, 0);
	parts.push({
		geometry: ring,
		color: PALETTE.wood
	});
	for (let i = 0; i < 6; i++) {
		const angle = Math.PI * i / 5;
		const spoke = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 1.9, .055, .05);
		spoke.rotateZ(angle);
		spoke.translate(0, DOOR_CENTER_HEIGHT, 0);
		parts.push({
			geometry: spoke,
			color: PALETTE.woodDark
		});
	}
	return parts;
}
/** Flagstones in front of the door. */
function pathStones(random) {
	const stones = [];
	for (let i = 0; i < 4; i++) {
		const size = .5 + random() * .25;
		const stone = new THREE.BoxGeometry(size, .08, size * .7);
		stone.rotateY((random() - .5) * .6);
		stone.translate((random() - .5) * .5, .04, .75 + i * .72);
		stones.push(stone);
	}
	return stones;
}
/**
* A check I used to do by eye and got wrong three times: does the door
* fit into the cut. The generator has to catch this itself.
*/
function checkFits(burrow, face) {
	if (face.height < DOOR_TOP) console.error(`[burrow] ${burrow.id}: arch is ${face.height.toFixed(2)} m tall, the door frame needs ${DOOR_TOP.toFixed(2)} m — raise height`);
	if (face.halfWidth < 1.05) console.error(`[burrow] ${burrow.id}: cut is ${(face.halfWidth * 2).toFixed(2)} m wide — no room around the door frame, increase radius`);
}
//#endregion
//#region src/world/Burrows.ts
/**
* Burrows: the mound gives the landform, the facade and the joinery come
* from the generator in burrow/.
*
* The burrow casts no shadow, and that is deliberate. The facade sits
* flush with the mound, the sun grazes along it, and at 1.4 cm per texel
* the shadow map smeared dirty blotches from the door casing all over the
* slope. A shadow on the ground adds nothing here, and dropping it gets
* rid of the artifacts entirely.
*/
var Burrows = class {
	group = new THREE.Group();
	blockers;
	/** Where the smoke comes out. */
	chimneys;
	constructor() {
		this.group.name = "burrows";
		const built = buildBurrows(valleyFloor);
		this.blockers = built.blockers;
		this.chimneys = built.chimneys;
		const mounds = new THREE.Mesh(built.mounds);
		mounds.name = "burrow_mounds";
		this.group.add(mounds);
		applyStyle(mounds, {
			color: PALETTE.grass,
			vertexColors: true,
			outline: false,
			castShadow: true,
			receiveShadow: false
		});
		for (const [color, geometry] of built.parts) {
			const mesh = new THREE.Mesh(geometry);
			mesh.name = `burrow_part_${color.toString(16)}`;
			this.group.add(mesh);
			applyStyle(mesh, {
				color,
				outline: true,
				castShadow: false,
				receiveShadow: false
			});
		}
	}
	dispose() {
		this.group.traverse((child) => {
			if (child instanceof THREE.Mesh) child.geometry.dispose();
		});
	}
};
/** Where a boundary starts, just clear of the frontage. */
const TOFT_INNER = 22.6;
const bearingOf = (x, z) => (Math.atan2(x, z) * 180 / Math.PI + 360) % 360;
const onArc = (r, deg) => [Math.sin(deg * Math.PI / 180) * r, Math.cos(deg * Math.PI / 180) * r];
/** Standing water over the ground at a point, without needing the player. */
function flooded(x, z) {
	const carve = riverCarve(x, z);
	if (carve <= .3) return false;
	return groundHeight(x, z) - RIVER_WATER_DEPTH > groundHeight(x, z) - carve;
}
/** The inn takes a frontage on the ring like any household. */
const INN_SEAT = {
	id: "inn",
	x: -.1,
	z: 27,
	radius: 4.4,
	height: 4.14
};
function ringSeats() {
	return [...BURROWS.filter((b) => b.z > riverCenterZ(b.x)), INN_SEAT].map((seat) => ({
		seat,
		deg: bearingOf(seat.x, seat.z)
	})).sort((a, b) => a.deg - b.deg);
}
/** The one wide opening in the ring, where the river cuts through it. */
function ringGap(ring) {
	let widest = {
		from: 0,
		span: -1
	};
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % ring.length];
		if (a === void 0 || b === void 0) continue;
		const span = (b.deg - a.deg + 360) % 360;
		if (span > widest.span) widest = {
			from: a.deg,
			span
		};
	}
	return widest;
}
/**
* Boundaries between neighbours, running outward from the frontage.
*
* Down the middle of the GAP, not along the angular bisector. With
* unequal mound radii those are different lines, and the bisector came
* within 0.88 m of a mound — half of that is inside the hedge itself.
*/
function toftBoundaries() {
	const ring = ringSeats();
	const gap = ringGap(ring);
	const runs = [];
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % ring.length];
		if (a === void 0 || b === void 0) continue;
		if ((b.deg - a.deg + 360) % 360 >= gap.span) continue;
		const apart = Math.hypot(b.seat.x - a.seat.x, b.seat.z - a.seat.z);
		const t = (apart + a.seat.radius - b.seat.radius) / (2 * apart);
		const deg = bearingOf(a.seat.x + (b.seat.x - a.seat.x) * t, a.seat.z + (b.seat.z - a.seat.z) * t);
		let outer = 42;
		for (let r = TOFT_INNER; r <= 42; r += .5) {
			const [x, z] = onArc(r, deg);
			if (flooded(x, z)) {
				outer = r - 1.5;
				break;
			}
		}
		if (outer <= 24.6) continue;
		runs.push({
			id: `toft-${a.seat.id}`,
			points: [onArc(TOFT_INNER, deg), onArc(outer, deg)]
		});
	}
	return runs;
}
/** The back of the crofts, cut wherever it would meet the water. */
function croftRear() {
	const gap = ringGap(ringSeats());
	const runs = [];
	let open = null;
	for (let deg = 0; deg <= 360; deg += 1.5) {
		const [x, z] = onArc(42, deg);
		if ((deg - gap.from + 360) % 360 > gap.span && !flooded(x, z)) {
			if (open === null) open = [];
			open.push([x, z]);
		} else if (open !== null) {
			if (open.length > 2) runs.push({
				id: `rear-${runs.length + 1}`,
				points: open
			});
			open = null;
		}
	}
	if (open !== null && open.length > 2) runs.push({
		id: `rear-${runs.length + 1}`,
		points: open
	});
	return runs;
}
/**
* The green's own wall. Open on the east, where the cart lane forms the
* edge — which is how a real green meets its street.
*/
const GREEN_HEDGES = [
	{
		id: "green-west",
		points: [[-10, 3], [-10, 15]]
	},
	{
		id: "green-north",
		points: [[-10, 15], [5, 15]]
	},
	{
		id: "green-south",
		points: [[-10, 3], [7, 3]]
	},
	{
		id: "green-east",
		points: [[7, 3], [7, 11]]
	}
];
/**
* Where the ways break the boundaries.
*
* A gate is not decoration, it is the place a way crosses a hedge, so it
* is derived from the two rather than written down. Written by hand they
* went stale the moment a lane moved: three lanes were walled off — the
* cart road into the green among them — by boundaries added after the
* routes were solved.
*
* The opening is measured from the hedge's own centre line, which is
* where its blocking circles sit, so an oblique crossing widens the gap
* by itself: more of the hedge falls near the lane.
*/
function gatesFor(run, ways) {
	const STEP = .25;
	const gates = [];
	let open = null;
	let travelled = 0;
	for (let i = 1; i < run.points.length; i++) {
		const a = run.points[i - 1];
		const b = run.points[i];
		if (a === void 0 || b === void 0) continue;
		const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
		if (length < 1e-4) continue;
		for (let d = 0; d <= length; d += STEP) {
			const t = d / length;
			const x = a[0] + (b[0] - a[0]) * t;
			const z = a[1] + (b[1] - a[1]) * t;
			const along = travelled + d;
			let breached = false;
			for (const way of ways) {
				const room = Math.max(LANE_HALF_WIDTH[way.kind], PLAYER_RADIUS) + 1 / 2 + .1;
				if (distanceToWay$1(x, z, way) < room) {
					breached = true;
					break;
				}
			}
			if (breached) {
				if (open === null) open = [along, along];
				else open[1] = along;
			} else if (open !== null) {
				gates.push(open);
				open = null;
			}
		}
		travelled += length;
	}
	if (open !== null) gates.push(open);
	return gates;
}
function distanceToWay$1(x, z, way) {
	let best = Infinity;
	for (let i = 1; i < way.points.length; i++) {
		const a = way.points[i - 1];
		const b = way.points[i];
		if (a === void 0 || b === void 0) continue;
		const dx = b[0] - a[0];
		const dz = b[1] - a[1];
		const len2 = dx * dx + dz * dz;
		const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
		best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
	}
	return best;
}
/** Arc length of a polyline, and the cumulative length at each point. */
function measure(points) {
	const marks = [0];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		if (a === void 0 || b === void 0) continue;
		marks.push((marks[marks.length - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
	}
	return marks;
}
/** Re-cuts a polyline between two distances along itself. */
function trim(points, from, to) {
	const marks = measure(points);
	const at = (d) => {
		for (let i = 1; i < points.length; i++) {
			const a = points[i - 1];
			const b = points[i];
			const s = marks[i - 1];
			const e = marks[i];
			if (a === void 0 || b === void 0 || s === void 0 || e === void 0) continue;
			if (d <= e || i === points.length - 1) {
				const t = e - s < 1e-6 ? 0 : (d - s) / (e - s);
				return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
			}
		}
		const last = points[points.length - 1];
		return last === void 0 ? [0, 0] : [last[0], last[1]];
	};
	const cut = [at(from)];
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const m = marks[i];
		if (p === void 0 || m === void 0) continue;
		if (m > from && m < to) cut.push(p);
	}
	cut.push(at(to));
	return cut;
}
function allHedges() {
	const ways = [...LANES, ...doorSpurs()];
	const out = [];
	for (const run of [
		...GREEN_HEDGES,
		...toftBoundaries(),
		...croftRear()
	]) {
		const found = gatesFor(run, ways).filter((g) => g[1] - g[0] >= .5);
		const total = measure(run.points).pop() ?? 0;
		let from = 0;
		let to = total;
		const middle = [];
		for (const gate of found) if (gate[0] <= .3) from = Math.max(from, gate[1]);
		else if (gate[1] >= total - .3) to = Math.min(to, gate[0]);
		else middle.push(gate);
		if (to - from < 2) continue;
		const points = from > 0 || to < total ? trim(run.points, from, to) : run.points;
		const gates = [...run.gates ?? [], ...middle].map((g) => [g[0] - from, g[1] - from]);
		out.push(gates.length > 0 ? {
			...run,
			points,
			gates
		} : {
			...run,
			points
		});
	}
	return out;
}
//#endregion
//#region src/world/Hedges.ts
/**
* Hedges, as extruded ribbon.
*
* Not a term in the height field. A hedge bank is about a metre across
* and the terrain samples at 1.5 quads to the metre, so it cannot be
* represented there; and putting five hundred segment tests inside
* heightAt would be paid two hundred thousand times at startup. As
* geometry it costs about seven thousand triangles, merged into one mesh
* and carrying no outline — the same reasoning as the grass, which is
* that a contour drawn on a metre-wide object does not read.
*
* Not instanced bushes either: the same length as instances would be
* around twenty-six thousand triangles and would look like a row of
* separate objects rather than a continuous boundary, which is precisely
* what a boundary must not look like.
*
* The player is stopped by circles in the obstacle grid, not by slope.
*/
var Hedges = class {
	mesh;
	/** Fed into the same grid that already bins the tree trunks. */
	blockers = [];
	constructor() {
		const pieces = [];
		for (const run of allHedges()) {
			const geometry = ribbon(run, this.blockers);
			if (geometry !== null) pieces.push(geometry);
		}
		const merged = mergeGeometries(pieces, false);
		for (const piece of pieces) piece.dispose();
		if (merged === null) throw new Error("[hedges] could not merge the hedge geometry");
		merged.computeVertexNormals();
		merged.computeBoundingSphere();
		this.mesh = new THREE.Mesh(merged);
		this.mesh.name = "hedges";
		applyStyle(this.mesh, {
			color: darken(PALETTE.grass, .78),
			outline: false,
			castShadow: true,
			receiveShadow: true
		});
	}
	dispose() {
		this.mesh.geometry.dispose();
	}
};
/** Deterministic 1D wobble along a hedge, so no two metres are alike. */
function crestAt(distance) {
	return HEDGE_CREST + Math.sin(distance * 2.09) * HEDGE_ROUGHNESS * .6 + Math.sin(distance * .77 + 1.7) * HEDGE_ROUGHNESS * .4;
}
/**
* Walks the polyline at half-metre steps and lofts a section along it.
*
* The section is a bank, not a wall: it flares to a wide foot so it beds
* into ground that is never flat, which is also what stops a seam showing
* where it crosses a slope.
*/
function ribbon(run, blockers) {
	const half = 1 / 2;
	const profile = [
		[-.5, 0],
		[-.34, HEDGE_SHOULDER],
		[-.16, 1],
		[half * .32, 1],
		[half * .68, HEDGE_SHOULDER],
		[half, 0]
	];
	const WIDTH = profile.length;
	const positions = [];
	const indices = [];
	let pushed = 0;
	let previous = -1;
	let travelled = 0;
	let sinceBlocker = Infinity;
	for (let i = 1; i < run.points.length; i++) {
		const a = run.points[i - 1];
		const b = run.points[i];
		if (a === void 0 || b === void 0) continue;
		const dx = b[0] - a[0];
		const dz = b[1] - a[1];
		const length = Math.hypot(dx, dz);
		if (length < 1e-4) continue;
		const nx = -dz / length;
		const nz = dx / length;
		const steps = Math.max(1, Math.round(length / .5));
		for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
			const t = s / steps;
			const x = a[0] + dx * t;
			const z = a[1] + dz * t;
			const along = travelled + length * t;
			if (isGate(run, along)) {
				previous = -1;
				continue;
			}
			const top = heightAt(x, z) + crestAt(along);
			for (const [across, share] of profile) {
				const px = x + nx * across;
				const pz = z + nz * across;
				const ground = heightAt(px, pz) - HEDGE_BEDDING;
				positions.push(px, ground + (top - ground) * share, pz);
			}
			const current = pushed;
			pushed++;
			if (previous >= 0) {
				const p = previous * WIDTH;
				const c = current * WIDTH;
				for (let k = 0; k + 1 < WIDTH; k++) {
					indices.push(p + k, c + k, p + k + 1);
					indices.push(p + k + 1, c + k, c + k + 1);
				}
			}
			previous = current;
			sinceBlocker += length / steps;
			if (sinceBlocker >= .7) {
				blockers.push({
					x,
					z,
					radius: half
				});
				sinceBlocker = 0;
			}
		}
		travelled += length;
	}
	if (positions.length === 0) return null;
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	return geometry;
}
function isGate(run, along) {
	if (run.gates === void 0) return false;
	for (const gate of run.gates) if (along >= gate[0] && along <= gate[1]) return true;
	return false;
}
//#endregion
//#region src/world/Water.ts
/**
* Every water surface in the valley, in one mesh.
*
* The channel is a ribbon along the river axis; the pond is a disc on the
* green. They are one object because they are one material, and giving
* the pond a module of its own would have cost a second draw call, a
* second material and — the expensive one — a second shader program: the
* wave amplitude used to be baked into the GLSL as a literal, so water
* that rippled less compiled a different shader. Worse, three keys its
* program cache on customProgramCacheKey, and under the river's key the
* pond would silently have been handed the river's program. The amplitude
* is a per-vertex attribute instead. One program, one draw call, and
* still water and running water still tell themselves apart.
*
* The channel's surface is not horizontal — it follows the surrounding
* ground with a downward offset. A real river does not behave that way,
* but the valley floor is flat to within a metre and a half per hundred,
* and to the eye it reads as water rather than a tilted plane. The pond's
* surface IS horizontal, because a pond has no such excuse: it is one
* height, taken from the ground at its own centre.
*
* Both beds are cut into the terrain itself (heightfield.ts), so the
* bottom is part of the collision mesh: you wade in, and the BVH honestly
* stands you on it. Where the ground rises above the pond's plane the
* terrain simply hides the disc — which is why the pool you see has an
* irregular edge that nobody drew.
*/
var Water = class {
	mesh;
	uniforms = { uTime: { value: 0 } };
	constructor() {
		const geometry = buildSurfaces();
		const material = toonSurface(PALETTE.water).clone();
		material.onBeforeCompile = (shader) => {
			shader.uniforms["uTime"] = this.uniforms.uTime;
			shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;\nattribute float aWave;").replace("#include <begin_vertex>", `#include <begin_vertex>
           // Two waves at an angle to each other: one alone gives
           // stripes, two give ripples with no visible repeat. The
           // amplitude rides on the vertex, so the pond can lie calm
           // while the channel runs
           transformed.y += aWave * (
             sin(position.x * 1.7 + uTime * ${RIVER_WAVE_SPEED.toFixed(3)}) +
             sin(position.z * 2.3 - uTime * ${(RIVER_WAVE_SPEED * .8).toFixed(3)})
           );`);
		};
		material.customProgramCacheKey = () => "water-waves";
		material.needsUpdate = true;
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.name = "water";
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = true;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.updateMatrix();
	}
	update(delta) {
		this.uniforms.uTime.value += delta;
	}
	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
};
/** Both surfaces, built in world coordinates into one buffer. */
function buildSurfaces() {
	const buffers = {
		positions: [],
		indices: [],
		uvs: [],
		waves: []
	};
	addChannel(buffers);
	addPond(buffers);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
	geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
	geometry.setAttribute("aWave", new THREE.Float32BufferAttribute(buffers.waves, 1));
	geometry.setIndex(buffers.indices);
	geometry.computeVertexNormals();
	geometry.computeBoundingSphere();
	return geometry;
}
/** A ribbon along the channel axis, its surface parallel to the ground. */
function addChannel(buffers) {
	const limit = 128 * RIVER_FADE_END;
	const halfWidth = 3 * 1.15;
	const first = buffers.positions.length / 3;
	for (let i = 0; i <= 220; i++) {
		const t = i / 220;
		const x = -99.84 + t * limit * 2;
		const centerZ = riverCenterZ(x);
		for (let j = 0; j <= 6; j++) {
			const s = j / 6;
			const z = centerZ - halfWidth + s * halfWidth * 2;
			buffers.positions.push(x, groundHeight(x, z) - RIVER_WATER_DEPTH, z);
			buffers.uvs.push(t * 20, s);
			buffers.waves.push(RIVER_WAVE_HEIGHT);
		}
	}
	const stride = 7;
	for (let i = 0; i < 220; i++) for (let j = 0; j < 6; j++) {
		const a = first + i * stride + j;
		const b = a + stride;
		buffers.indices.push(a, a + 1, b, b, a + 1, b + 1);
	}
}
/**
* A level disc over the pond dish, drawn out to the widest the shoreline
* ever reaches. Most of its rim is underground, and that is the point:
* the terrain cuts the pool to shape, so the waterline follows the
* ground rather than a circle somebody drew.
*/
function addPond(buffers) {
	const y = pondWaterY();
	const first = buffers.positions.length / 3;
	for (let ring = 0; ring <= 4; ring++) {
		const radius = ring / 4 * POND_REACH;
		for (let step = 0; step <= 28; step++) {
			const angle = step / 28 * Math.PI * 2;
			buffers.positions.push(POND.x + Math.cos(angle) * radius, y, POND.z + Math.sin(angle) * radius);
			buffers.uvs.push(step / 28 * 6, ring / 4);
			buffers.waves.push(POND_WAVE_HEIGHT);
		}
	}
	const stride = 29;
	for (let ring = 0; ring < 4; ring++) for (let step = 0; step < 28; step++) {
		const a = first + ring * stride + step;
		const b = a + stride;
		buffers.indices.push(a, b, a + 1, a + 1, b, b + 1);
	}
}
//#endregion
//#region src/render/wind.ts
/**
* The one clock. Everything that moves with the wind reads this exact
* object, so a gust that bends the grass leans the smoke at the same
* moment — which is the whole reason the module exists rather than the
* vegetation keeping a clock of its own.
*/
const windTime = { value: 0 };
/**
* The gust wave, as GLSL. Anything that leans with the wind has to go
* through this exact function.
*
* Sharing the clock is only half of what makes the scene agree with
* itself — the curve has to be shared too. The smoke used to carry its
* own hand-copied copy of these two sines, which agreed with the grass by
* coincidence and would have stopped agreeing, silently and with no
* compile error, the first time either was retuned.
*
* `t` is deliberately a parameter rather than the clock: grass reads the
* gust at the present instant, smoke reads it at the moment each puff
* left the chimney and on a slower scale, and both are the same wave.
*/
function gustGLSL() {
	const n = (value) => value.toFixed(5);
	return `
vec2 windDirection() {
  return vec2( ${n(Math.cos(WIND_DIRECTION))}, ${n(Math.sin(WIND_DIRECTION))} );
}

// A wave rolling across the valley: the phase depends on how far along
// the wind you stand, so a crest visibly crosses the field. Drop the
// position term and everything breathes at once. Two frequencies at an
// incommensurate ratio, because one sine alone has an obvious period once
// you have watched it for a few seconds.
float windGust( vec2 at, float t, float phase ) {
  float travel = dot( at, windDirection() ) * ${n(Math.PI * 2 / 26)}
    - t * ${n(WIND_GUST_SPEED)} + phase;
  return sin( travel ) * 0.62 + sin( travel * 2.3 + 1.7 ) * 0.38;
}`;
}
/**
* Worst-case sideways travel, in metres.
*
* Chunk bounding spheres are deliberately tight — that was the whole
* point of chunking the vegetation — so displaced vertices poke outside
* their own sphere and the chunk blinks out at the edge of the screen
* while it is still visible. The radius has to grow by this much.
*/
function maxSway(profile) {
	const along = 1.3 + profile.flutter;
	const across = profile.flutter * SIDE_SHARE;
	return profile.amplitude * 1.35 * Math.hypot(along, across);
}
/** How much of the sway goes across the wind rather than along it. */
const SIDE_SHARE = .35;
/**
* A copy of `base` that sways. Always a copy, never the original:
* toonSurface() hands out one cached material per colour, so grass, bushes
* and every future white object are literally the same object. Patching it
* in place would set the whole scene swaying.
*/
function windMaterial(base, profile) {
	const material = base.clone();
	patch(material, profile);
	return material;
}
/**
* Depth material for the shadow pass.
*
* The shadow map is drawn with a separate, much simpler shader that knows
* nothing about our displacement. Without this a swaying crown would throw
* a rigid shadow — the tree moves and its shadow stands still, which is
* more obviously wrong than no wind at all.
*/
function windDepthMaterial(profile) {
	const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
	patch(material, profile);
	return material;
}
function patch(material, profile) {
	const glsl = shader(profile);
	material.onBeforeCompile = (compiled) => {
		compiled.uniforms["uWindTime"] = windTime;
		compiled.vertexShader = compiled.vertexShader.replace("#include <common>", `#include <common>\n${glsl.common}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${glsl.vertex}`);
	};
	material.customProgramCacheKey = () => `wind-${profile.key}`;
	material.needsUpdate = true;
}
function shader(profile) {
	const n = (value) => value.toFixed(5);
	return {
		common: `
uniform float uWindTime;

${gustGLSL()}

// One pseudo-random number per plant, from where it is rooted. Two plants
// never share a spot, so this is stable and needs no extra attribute.
float windHash( vec2 at ) {
  return fract( sin( dot( at, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

// Sideways offset, in world axes, for a plant rooted at \`at\` (world xz),
// taken at bend weight \`w\`.
vec2 windOffset( vec2 at, float w ) {
  vec2 dir = windDirection();
  vec2 side = vec2( -dir.y, dir.x );

  // Each plant gets its own phase and its own stiffness. The gust below
  // is a smooth function of position, so without this every plant the
  // same distance along the wind moves exactly alike and the field
  // twitches as one body. The phase offset stays small on purpose:
  // scatter it fully and the travelling gust stops being readable.
  float h = windHash( at );
  float stiffness = 1.0 + ( h - 0.5 ) * ${n(WIND_STIFFNESS_SPREAD * 2)};
  float phase = h * 6.28318;

  float t = uWindTime * ${n(profile.rate)};

  float gust = windGust( at, t, phase * ${n(WIND_PHASE_SPREAD)} );

  // Much faster, and keyed to the plant itself rather than to the gust.
  // Grass has plenty of it, a tree has none: a three-metre crown that
  // jitters looks like a bush glued to a stick.
  float flutter = sin( t * ${n(WIND_FLUTTER_SPEED)} + phase * 6.0 );

  float along = ( ${n(WIND_BIAS)} + gust + flutter * ${n(profile.flutter)} ) * w * stiffness;
  float across = flutter * w * stiffness * ${n(profile.flutter * SIDE_SHARE)};
  return ( dir * along + side * across ) * ${n(profile.amplitude)};
}`,
		vertex: `
{
  #ifdef USE_INSTANCING
    vec3 windAt = ( modelMatrix * instanceMatrix[ 3 ] ).xyz;
    vec2 windCol0 = instanceMatrix[ 0 ].xz;
    vec2 windCol2 = instanceMatrix[ 2 ].xz;
  #else
    vec3 windAt = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    vec2 windCol0 = modelMatrix[ 0 ].xz;
    vec2 windCol2 = modelMatrix[ 2 ].xz;
  #endif

  // Squared, so the bend is a cantilever: nothing at the root, most of it
  // near the pivot. A uniform offset would slide the whole plant sideways
  // and tear it out of the ground it grows from.
  //
  // The clamp is what keeps anything above the pivot rigid. That is the
  // difference between a tree crown that is carried by its trunk and one
  // that stretches and squashes every time the wind changes its mind.
  float windW = clamp( transformed.y / ${n(profile.pivot)}, 0.0, 1.0 );
  windW *= windW;

  vec2 windWorld = windOffset( windAt.xz, windW );

  // windWorld is in world axes, but \`transformed\` is still in the
  // instance's own space, and every instance carries a random yaw and a
  // scale. Added as is, each tuft would bend whichever way it happens to
  // be turned. The xz block of the instance matrix is a rotation times a
  // scale that is equal on x and z, and the inverse of that is its
  // transpose over the squared scale — so no inverse() is needed, and the
  // world displacement comes out the same for every instance.
  float windS2 = dot( windCol0, windCol0 );
  transformed.xz += vec2( dot( windCol0, windWorld ), dot( windCol2, windWorld ) ) / windS2;
}`
	};
}
//#endregion
//#region src/world/Smoke.ts
/**
* Smoke from the burrow chimneys.
*
* The cheapest "somebody lives here" signal there is, and the pipe that
* carries it was already modelled and doing nothing. Six plumes read from
* eighty metres, which is exactly the distance at which the valley
* otherwise looks like a kit laid out on a table.
*
* Blobs rather than sprites or points. A toon frame has no soft edges
* anywhere else in it, so a soft particle would be the one blurred thing
* on screen — and the usual failure of low-poly smoke is that it reads as
* floating dumplings, which is a reason to use few and large ones, not a
* reason to use round ones.
*
* Nothing moves on the CPU. Every puff's whole life is a function of one
* shared clock and its own birth offset, so the cost is a uniform write
* per frame however many chimneys the valley grows.
*
* The clock is the wind's, not its own. That is the point of sharing it:
* the gust that lays the grass over leans the plumes at the same instant,
* and a scene whose motion agrees with itself reads as authored.
*/
var Smoke = class {
	mesh;
	constructor(chimneys) {
		const count = chimneys.length * 6;
		const geometry = new THREE.IcosahedronGeometry(1, 0);
		const phase = new Float32Array(count);
		const seed = new Float32Array(count);
		for (let c = 0; c < chimneys.length; c++) for (let p = 0; p < 6; p++) {
			const i = c * 6 + p;
			phase[i] = (p / 6 + c * .37) % 1;
			seed[i] = (c * 7 + p * 13) % 17 / 17;
		}
		geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
		geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
		const material = new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			fog: true,
			uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib["fog"]]),
			vertexShader: vertex(),
			fragmentShader: FRAGMENT
		});
		material.uniforms["uWindTime"] = windTime;
		material.uniforms["uSmoke"] = { value: new THREE.Color(PALETTE.smoke) };
		material.uniforms["uSmokeShade"] = { value: new THREE.Color(PALETTE.smokeShade) };
		this.mesh = new THREE.InstancedMesh(geometry, material, count);
		this.mesh.name = "smoke";
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		this.mesh.frustumCulled = false;
		const matrix = new THREE.Matrix4();
		for (let c = 0; c < chimneys.length; c++) {
			const mouth = chimneys[c];
			if (mouth === void 0) continue;
			for (let p = 0; p < 6; p++) {
				matrix.makeTranslation(mouth.x, mouth.y, mouth.z);
				this.mesh.setMatrixAt(c * 6 + p, matrix);
			}
		}
		this.mesh.instanceMatrix.needsUpdate = true;
	}
	dispose() {
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
		this.mesh.dispose();
	}
};
function vertex() {
	const n = (value) => value.toFixed(5);
	const lean = `${n(SMOKE_LEAN)} + windGust( mouth.xz, birth * ${n(SMOKE_GUST_RATE)}, 0.0 ) * ${n(SMOKE_GUST_SHARE)}`;
	return `
#include <common>
#include <fog_pars_vertex>

uniform float uWindTime;

${gustGLSL()}

attribute float aPhase;
attribute float aSeed;

varying float vLife;
varying vec3 vNormalWorld;

void main() {
  // One puff's life, 0 at the chimney mouth and 1 where it is gone.
  vLife = fract( uWindTime / ${n(7)} + aPhase );

  // The anchor is the chimney mouth: the instance matrix is a pure
  // translation, so its fourth column is that point in world space.
  vec3 mouth = instanceMatrix[ 3 ].xyz;

  vec2 dir = windDirection();
  // The wind this puff left the chimney in, frozen. Read at the present
  // instant instead, every puff shares one value and the whole plume
  // swings like a wiper; frozen at birth, the column carries the history
  // of the gust up itself, which is what a plume actually is.
  float birth = uWindTime - vLife * ${n(7)};
  float lean = ${lean};

  // Rising slows a little as the puff cools and spreads, but only a
  // little: sqrt() threw the first puff a third of the way up the column
  // on its own and left a gap at the mouth. Drift builds up faster,
  // because the longer it is in the air the more of the wind it has felt
  float rise = ${n(3)} * pow( vLife, 0.85 );
  vec2 drift = dir * ( ${n(SMOKE_DRIFT)} * lean * vLife * vLife );
  // A slow curl so the column is not a ruler, and so consecutive puffs
  // do not sit on one axis where their seams would line up
  float curl = sin( vLife * 5.0 + aSeed * 6.2831 ) * 0.34 * vLife;

  float radius = mix( ${n(SMOKE_START_RADIUS)}, ${n(SMOKE_END_RADIUS)}, vLife );
  // Lumps, not spheres: squash each puff differently on its own axes
  vec3 lump = vec3( 1.0 + aSeed * 0.35, 0.82, 1.0 - aSeed * 0.3 );

  vec3 local = position * lump * radius;
  vec3 offset = vec3( drift.x + curl, rise, drift.y - curl );

  // instanceMatrix is translation only, so adding here lands the puff at
  // mouth + offset with the lump around it
  vec3 transformed = local + offset;
  vNormalWorld = normalize( normal / lump );

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( transformed, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}`;
}
const FRAGMENT = `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uSmoke;
uniform vec3 uSmokeShade;

varying float vLife;
varying vec3 vNormalWorld;

void main() {
  // Two tones with a hard edge between them, the same vocabulary as the
  // three lighting steps. No light is sampled: smoke this thin scatters
  // rather than catching a terminator, and a lit blob would sit oddly
  // against the flat sky behind it.
  float up = dot( normalize( vNormalWorld ), vec3( 0.0, 1.0, 0.0 ) );
  vec3 color = mix( uSmokeShade, uSmoke, step( 0.05, up ) );

  // Up fast out of the pipe, then a long dissolve. Squared on the way out
  // so the tail thins rather than switching off.
  float rising = smoothstep( 0.0, 0.12, vLife );
  float gone = 1.0 - vLife;
  float alpha = ${SMOKE_OPACITY.toFixed(3)} * rising * gone * gone;

  gl_FragColor = vec4( color, alpha );

  // three's own order is tonemapping then colorspace then fog. Tone
  // mapping is off today, so this chunk expands to nothing — but leaving
  // it out would make the smoke one of the only surfaces in the frame not
  // mapped on the day it is switched on
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
//#endregion
//#region src/world/Ground.ts
const UP = new THREE.Vector3(0, 1, 0);
/**
* Terrain queries: the height under a point and whatever a ray hits.
*
* The height could be read from heightAt() directly, and more cheaply,
* but the mesh is a piecewise-linear approximation of that function, and
* on a one-meter grid the two drift apart by centimeters. The character
* has to stand on what is actually drawn, so we ask the geometry itself.
*/
var Ground = class {
	bvh;
	ray = new THREE.Ray();
	down = new THREE.Vector3(0, -1, 0);
	sampleResult = {
		height: 0,
		normal: new THREE.Vector3(0, 1, 0),
		slope: 0
	};
	constructor(bvh) {
		this.bvh = bvh;
	}
	/**
	* The ground under point (x, z). Returns a reused object — copy it if
	* you need to keep the value between frames.
	* null means the point is outside the valley.
	*/
	sample(x, z) {
		this.ray.origin.set(x, TERRAIN_PROBE_HEIGHT, z);
		this.ray.direction.copy(this.down);
		const hit = this.bvh.raycastFirst(this.ray, THREE.FrontSide);
		if (hit === null || hit.face === null || hit.face === void 0) return null;
		this.sampleResult.height = hit.point.y;
		this.sampleResult.normal.copy(hit.face.normal);
		this.sampleResult.slope = this.sampleResult.normal.angleTo(UP);
		return this.sampleResult;
	}
	/**
	* First hit of a ray against the terrain. The camera needs it so it
	* does not slide inside a hill. Returns the distance to the hit, or null.
	*/
	raycastDistance(origin, direction, maxDistance) {
		this.ray.origin.copy(origin);
		this.ray.direction.copy(direction).normalize();
		const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, maxDistance);
		return hit === null ? null : hit.distance;
	}
};
//#endregion
//#region src/world/Vegetation.ts
/**
* Grass and bushes by instancing.
*
* InstancedMesh draws thousands of copies of one geometry in a single
* draw call: the GPU is handed the geometry plus an array of matrices,
* not a thousand objects. Twelve thousand grass tufts as ordinary meshes
* would cost twelve thousand calls and kill the frame; here it's dozens.
*
* The split into chunks exists precisely for culling. A single
* InstancedMesh for the whole valley would have a bounding sphere the
* size of the valley — meaning it would always be visible and drawn in
* full, even with a couple of bushes on screen. A chunk covers its own
* piece of the map, and three quarters of the valley behind the camera
* get culled for free.
*
* Vegetation has no outline on purpose: a contour on a thirty-centimetre
* tuft doesn't read, and it would double the draw calls.
*/
var Vegetation = class {
	chunks = [];
	/** Materials cloned for the wind. Shared ones must never be disposed. */
	materials = [];
	/** Trunks as obstacles: you can't walk through a tree. */
	treeTrunks = [];
	constructor(scene, ground) {
		const random = makeRandom(VEGETATION_SEED);
		const grass = grassGeometry();
		const bush = bushGeometry();
		const grassByChunk = scatter(GRASS_COUNT, ground, random);
		const bushByChunk = scatter(BUSH_COUNT, ground, random);
		this.addTrees(scene, ground, random);
		this.addChunks(scene, grass, grassByChunk, PALETTE.grass, PALETTE.grassDry, {
			key: "grass",
			pivot: topOf(grass),
			amplitude: WIND_GRASS_AMPLITUDE,
			flutter: WIND_GRASS_FLUTTER,
			rate: 1
		});
		this.addChunks(scene, bush, bushByChunk, darken(PALETTE.grass, .85), PALETTE.door, {
			key: "bush",
			pivot: topOf(bush) * .45,
			amplitude: WIND_BUSH_AMPLITUDE,
			flutter: WIND_BUSH_FLUTTER,
			rate: WIND_BUSH_RATE
		});
	}
	get drawCallCount() {
		return this.chunks.length;
	}
	dispose() {
		for (const chunk of this.chunks) {
			chunk.geometry.dispose();
			chunk.dispose();
		}
		for (const material of this.materials) material.dispose();
	}
	addTrees(scene, ground, random) {
		const kit = treeKit(this.materials);
		addTreesTo(scene, ground, random, this.treeTrunks, this.chunks, kit);
		addHedgerowTrees(scene, ground, this.treeTrunks, this.chunks, kit);
	}
	addChunks(scene, geometry, byChunk, colorA, colorB, profile) {
		const material = windMaterial(toonSurface(16777215), profile);
		this.materials.push(material);
		const matrix = new THREE.Matrix4();
		const color = new THREE.Color();
		const tint = new THREE.Color();
		for (const [key, placements] of byChunk) {
			if (placements.length === 0) continue;
			const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
			mesh.name = `${profile.key}_chunk_${key}`;
			mesh.castShadow = false;
			mesh.receiveShadow = true;
			placements.forEach((placement, index) => {
				matrix.compose(placement.position, placement.rotation, placement.scale);
				mesh.setMatrixAt(index, matrix);
				color.set(colorA).lerp(tint.set(colorB), placement.tint);
				mesh.setColorAt(index, color);
			});
			mesh.instanceMatrix.needsUpdate = true;
			if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
			mesh.computeBoundingSphere();
			inflateForWind(mesh, profile);
			scene.add(mesh);
			this.chunks.push(mesh);
		}
	}
};
/**
* Geometry, material and wind profile, built once and shared by both
* tree passes. Two materials would mean two shader programs compiled for
* the same tree, and two wind curves to keep in step by hand.
*/
function treeKit(materials) {
	const profile = {
		key: "tree",
		pivot: TREE_CROWN_BASE,
		amplitude: WIND_TREE_AMPLITUDE,
		flutter: 0,
		rate: WIND_TREE_RATE
	};
	let material = toonVertexColored();
	let depth = null;
	material = windMaterial(toonVertexColored(), profile);
	depth = windDepthMaterial(profile);
	materials.push(material, depth);
	return {
		geometry: treeGeometry(),
		material,
		depth,
		profile
	};
}
function addTreesTo(scene, ground, random, trunks, chunks, kit) {
	const doors = BURROWS.map((burrow) => facePoint(burrow));
	const { geometry, material, depth, profile } = kit;
	const chunkSize = 32;
	const byChunk = /* @__PURE__ */ new Map();
	for (let i = 0; i < TREE_COUNT; i++) {
		const radius = Math.sqrt(random()) * 128 * .92;
		const angle = random() * Math.PI * 2;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		if (radius < 46) continue;
		const sample = ground.sample(x, z);
		if (sample === null || sample.slope > TREE_MAX_SLOPE) continue;
		if (riverCarve(x, z) > .05 || pondCarve(x, z) > .05) continue;
		if (BURROWS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + 1.5)) continue;
		if (doors.some((d) => Math.hypot(x - d.x, z - d.z) < 6)) continue;
		const scale = .75 + random() * .65;
		byChunk.set(0, byChunk.get(0) ?? []);
		const placement = {
			position: new THREE.Vector3(x, sample.height, z),
			rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
			scale: new THREE.Vector3(scale, scale * (.85 + random() * .4), scale),
			tint: random()
		};
		const key = Math.floor((z + 128) / chunkSize) * 8 + Math.floor((x + 128) / chunkSize);
		const bucket = byChunk.get(key);
		if (bucket === void 0) byChunk.set(key, [placement]);
		else bucket.push(placement);
		trunks.push({
			x,
			z,
			radius: TREE_TRUNK_RADIUS * scale
		});
	}
	byChunk.delete(0);
	const matrix = new THREE.Matrix4();
	for (const [key, placements] of byChunk) {
		if (placements.length === 0) continue;
		const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
		mesh.name = `tree_chunk_${key}`;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		if (depth !== null) mesh.customDepthMaterial = depth;
		placements.forEach((placement, index) => {
			matrix.compose(placement.position, placement.rotation, placement.scale);
			mesh.setMatrixAt(index, matrix);
		});
		mesh.instanceMatrix.needsUpdate = true;
		mesh.computeBoundingSphere();
		inflateForWind(mesh, profile);
		scene.add(mesh);
		chunks.push(mesh);
	}
}
/**
* Trees standing in the boundaries.
*
* The cheapest thing in the plan and the one that does the most. A hedge
* on its own is 1.1 m against a green 17 m across — a line on the floor,
* not a wall. Put a five-metre tree in it every dozen metres and the
* green has a ceiling edge: the same enclosure a room gets from its
* cornice. Same geometry, same material, one extra draw call.
*
* They are not scattered and then filtered onto the lines — they are
* walked along the lines, which is how a hedgerow standard grows. What
* is filtered is where a tree must NOT stand: in a gateway, in a lane,
* against a door, in the water.
*/
function addHedgerowTrees(scene, ground, trunks, chunks, kit) {
	const random = makeRandom(HEDGEROW_SEED);
	const doors = BURROWS.map((burrow) => facePoint(burrow));
	const ways = [...LANES, ...doorSpurs()];
	const workSpots = WORK_POINTS.flatMap((point) => [{
		x: point.x,
		z: point.z
	}, propPosition(point)]);
	const placements = [];
	const standing = [];
	const oakGround = ground.sample(OAK.x, OAK.z);
	if (oakGround !== null) {
		placements.push({
			position: new THREE.Vector3(OAK.x, oakGround.height, OAK.z),
			rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .7),
			scale: new THREE.Vector3(OAK.scale, OAK.scale, OAK.scale),
			tint: .35
		});
		standing.push({
			x: OAK.x,
			z: OAK.z,
			crown: TREE_CROWN_RADIUS * OAK.scale
		});
		trunks.push({
			x: OAK.x,
			z: OAK.z,
			radius: TREE_TRUNK_RADIUS * OAK.scale
		});
	}
	for (const line of hedgerowLines()) {
		let target = line.spacing * .5;
		let travelled = 0;
		for (let i = 1; i < line.points.length; i++) {
			const a = line.points[i - 1];
			const b = line.points[i];
			if (a === void 0 || b === void 0) continue;
			const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
			if (length < 1e-4) continue;
			while (target <= travelled + length) {
				const at = target;
				const t = (at - travelled) / length;
				const x = a[0] + (b[0] - a[0]) * t;
				const z = a[1] + (b[1] - a[1]) * t;
				target += line.spacing * (.8 + random() * .5);
				const clear = 1;
				if (line.gates.some(([from, to]) => at >= from - clear && at <= to + clear)) continue;
				if (BURROWS.some((m) => Math.hypot(x - m.x, z - m.z) < m.radius + 1.5)) continue;
				if (doors.some((d) => Math.hypot(x - d.x, z - d.z) < 6)) continue;
				if (workSpots.some((w) => Math.hypot(x - w.x, z - w.z) < 1.6)) continue;
				if (riverCarve(x, z) > .05 || pondCarve(x, z) > .05) continue;
				const scale = .95 + random() * .5;
				const crown = TREE_CROWN_RADIUS * scale;
				if (standing.some((s) => Math.hypot(x - s.x, z - s.z) < (crown + s.crown) * .8)) continue;
				const room = TREE_TRUNK_RADIUS * scale + PLAYER_RADIUS + .2;
				if (ways.some((way) => distanceToWay(x, z, way) < LANE_HALF_WIDTH[way.kind] + room)) continue;
				const sample = ground.sample(x, z);
				if (sample === null || sample.slope > TREE_MAX_SLOPE) continue;
				standing.push({
					x,
					z,
					crown
				});
				placements.push({
					position: new THREE.Vector3(x, sample.height, z),
					rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
					scale: new THREE.Vector3(scale, scale * (.9 + random() * .35), scale),
					tint: random()
				});
				trunks.push({
					x,
					z,
					radius: TREE_TRUNK_RADIUS * scale
				});
			}
			travelled += length;
		}
	}
	if (placements.length === 0) return;
	const mesh = new THREE.InstancedMesh(kit.geometry, kit.material, placements.length);
	mesh.name = "hedgerow_trees";
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	if (kit.depth !== null) mesh.customDepthMaterial = kit.depth;
	const matrix = new THREE.Matrix4();
	placements.forEach((placement, index) => {
		matrix.compose(placement.position, placement.rotation, placement.scale);
		mesh.setMatrixAt(index, matrix);
	});
	mesh.instanceMatrix.needsUpdate = true;
	mesh.computeBoundingSphere();
	inflateForWind(mesh, kit.profile);
	scene.add(mesh);
	chunks.push(mesh);
}
/**
* The lines a hedgerow tree may grow along, where they are broken, and
* how thickly they are planted.
*
* The spacing is not one number. Out in the crofts a standard every
* dozen metres is a hedgerow; around the green the same interval put two
* trees on forty-six metres of boundary and enclosed nothing, which is
* the one place the whole exercise exists to fix. A green is planted
* closer than a field because it was planted deliberately.
*/
function hedgerowLines() {
	const lines = allHedges().map((run) => ({
		points: run.points,
		gates: run.gates ?? [],
		spacing: run.id.startsWith("green-") ? 13 * GREEN_PLANTING : 13
	}));
	const cart = LANES.find((lane) => lane.id === "cart");
	if (cart !== void 0) for (const side of [-1, 1]) {
		const verge = [];
		for (let i = 1; i < cart.points.length; i++) {
			const a = cart.points[i - 1];
			const b = cart.points[i];
			if (a === void 0 || b === void 0) continue;
			if (a[1] > 2 || a[1] < -12) continue;
			const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
			if (length < 1e-4) continue;
			const nx = -(b[1] - a[1]) / length * side * CART_AVENUE_OFFSET;
			const nz = (b[0] - a[0]) / length * side * CART_AVENUE_OFFSET;
			verge.push([a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz]);
		}
		if (verge.length > 1) lines.push({
			points: verge,
			gates: [],
			spacing: 13 * GREEN_PLANTING
		});
	}
	return lines;
}
function distanceToWay(x, z, way) {
	let best = Infinity;
	for (let i = 1; i < way.points.length; i++) {
		const a = way.points[i - 1];
		const b = way.points[i];
		if (a === void 0 || b === void 0) continue;
		const dx = b[0] - a[0];
		const dz = b[1] - a[1];
		const len2 = dx * dx + dz * dz;
		const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
		best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
	}
	return best;
}
/**
* Height of the tallest vertex. Measured off the geometry rather than
* assumed, so reshaping a cone or an icosahedron carries the wind with it.
*/
function topOf(geometry) {
	geometry.computeBoundingBox();
	return geometry.boundingBox?.max.y ?? 1;
}
/**
* The cull sphere was measured around vertices that had not moved yet.
* Leave it and a chunk pops out of existence while a corner of it is
* still on screen — the more visible the stronger the wind.
*/
function inflateForWind(mesh, profile) {
	if (mesh.boundingSphere === null) return;
	mesh.boundingSphere.radius += maxSway(profile);
}
/** Trunk and two crowns, colour goes into the vertex attribute. */
function treeGeometry() {
	const paint = (geometry, hex) => {
		const color = new THREE.Color(hex);
		const count = geometry.getAttribute("position").count;
		const data = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			data[i * 3] = color.r;
			data[i * 3 + 1] = color.g;
			data[i * 3 + 2] = color.b;
		}
		geometry.setAttribute("color", new THREE.BufferAttribute(data, 3));
		return geometry;
	};
	const trunk = new THREE.CylinderGeometry(.17, .26, TREE_TRUNK_HEIGHT, 6).toNonIndexed();
	trunk.translate(0, TREE_TRUNK_HEIGHT / 2, 0);
	const lowerRadius = TREE_CROWN_RADIUS;
	const lowerSquash = 1.1;
	const lower = new THREE.IcosahedronGeometry(lowerRadius, 0);
	lower.scale(1, lowerSquash, 1);
	lower.translate(0, 3.1, 0);
	const upper = new THREE.IcosahedronGeometry(1.05, 0);
	upper.translate(.22, 4.35, -.12);
	const merged = mergeGeometries([
		paint(trunk, PALETTE.woodDark),
		paint(lower, darken(PALETTE.grass, .82)),
		paint(upper, darken(PALETTE.grass, .95))
	], false);
	if (merged === null) throw new Error("[vegetation] could not merge the tree geometry");
	return merged;
}
/** Scatters points across the valley and groups them into chunks. */
function scatter(count, ground, random) {
	const byChunk = /* @__PURE__ */ new Map();
	const axis = new THREE.Vector3(0, 1, 0);
	const chunkSize = 32;
	for (let i = 0; i < count; i++) {
		const radius = Math.sqrt(random()) * 128 * .95;
		const angle = random() * Math.PI * 2;
		const x = Math.cos(angle) * radius;
		const z = Math.sin(angle) * radius;
		const sample = ground.sample(x, z);
		if (sample === null) continue;
		if (sample.slope > VEGETATION_MAX_SLOPE) continue;
		if (riverCarve(x, z) > .05 || pondCarve(x, z) > .05) continue;
		if (BURROWS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + .6)) continue;
		const scale = .7 + random() * .6;
		const placement = {
			position: new THREE.Vector3(x, sample.height, z),
			rotation: new THREE.Quaternion().setFromAxisAngle(axis, random() * Math.PI * 2),
			scale: new THREE.Vector3(scale, scale * (.8 + random() * .5), scale),
			tint: random()
		};
		const cx = Math.floor((x + 128) / chunkSize);
		const key = Math.floor((z + 128) / chunkSize) * 8 + cx;
		const bucket = byChunk.get(key);
		if (bucket === void 0) byChunk.set(key, [placement]);
		else bucket.push(placement);
	}
	return byChunk;
}
/**
* A grass tuft: a four-sided pyramid with no bottom cap — four triangles.
* The cap is pressed against the ground anyway, and across thirty
* thousand instances that is half as much geometry.
*/
function grassGeometry() {
	const geometry = new THREE.ConeGeometry(GRASS_HEIGHT * .3, GRASS_HEIGHT, 4, 1, true);
	geometry.translate(0, GRASS_HEIGHT / 2, 0);
	return geometry;
}
/**
* Bush: a faceted sphere a little taller than it is wide. The flattened
* version read as a rock — shape matters more than colour here.
*/
function bushGeometry() {
	const geometry = new THREE.IcosahedronGeometry(BUSH_RADIUS, 0);
	geometry.scale(1, 1.15, 1);
	geometry.translate(0, BUSH_RADIUS * .8, 0);
	return geometry;
}
//#endregion
//#region src/world/props/batch.ts
const DEFAULT = {
	castShadow: true,
	receiveShadow: true
};
var PropBatch = class {
	buckets = /* @__PURE__ */ new Map();
	/**
	* Hands a finished, world-placed part to the batch.
	*
	* Everything is stripped of its index on the way in. mergeGeometries
	* requires every input to be uniformly indexed or uniformly not, and
	* three's primitives disagree: boxes and cylinders carry an index,
	* icosahedra never do. Mixing them returns null, and the caller throws
	* — a blank screen from one stone. treeGeometry() has always done this
	* for the same reason; here it is done once for everybody.
	*/
	add(geometry, color, style) {
		const full = {
			color,
			...DEFAULT,
			...style
		};
		const key = `${full.color}:${full.castShadow ? 1 : 0}${full.receiveShadow ? 1 : 0}`;
		const flat = geometry.index === null ? geometry : geometry.toNonIndexed();
		if (flat !== geometry) geometry.dispose();
		const bucket = this.buckets.get(key);
		if (bucket === void 0) this.buckets.set(key, {
			style: full,
			parts: [flat]
		});
		else bucket.parts.push(flat);
	}
	/** Merges every bucket and hangs the meshes under `parent`. */
	build(parent) {
		for (const [key, bucket] of this.buckets) {
			const merged = mergeGeometries(bucket.parts, false);
			for (const part of bucket.parts) part.dispose();
			if (merged === null) throw new Error(`[props] could not merge the ${key} bucket`);
			merged.computeBoundingSphere();
			const mesh = new THREE.Mesh(merged);
			mesh.name = `props_${key}`;
			mesh.matrixAutoUpdate = false;
			mesh.updateMatrix();
			parent.add(mesh);
			applyStyle(mesh, {
				color: bucket.style.color,
				outline: true,
				castShadow: bucket.style.castShadow,
				receiveShadow: bucket.style.receiveShadow
			});
		}
		this.buckets.clear();
	}
};
//#endregion
//#region src/world/WorkSites.ts
/**
* Work-site props: garden beds, sawhorses with logs, reeds at the water,
* benches.
*
* Before them the occupations happened in a void — the gardener dug flat
* grass, the sawyer sawed air. Work points are defined by data
* (config/work.ts), and the props are built from that same data, so
* moving the vegetable patch is still a change in exactly one place.
*
* Nothing here builds a mesh. Every part goes into the shared PropBatch
* and comes out merged with the green's furniture: fifteen sites of four
* items each would otherwise cost close to a hundred draw calls, and
* merging per module still cost three for every colour in every module.
*/
var WorkSites = class {
	/** Prop circles: you shouldn't walk through a sawhorse or a bed. */
	blockers = [];
	constructor(batch) {
		const add = (color, geometry) => {
			batch.add(geometry, color);
		};
		for (const point of WORK_POINTS) {
			const spot = propPosition(point);
			const yaw = workFacing(point);
			const base = heightAt(spot.x, spot.z);
			const random = makeRandom(hashSeed(point.id));
			const tilt = yaw + (random() - .5) * .5;
			const place = (geometry, color) => {
				geometry.rotateY(tilt);
				geometry.translate(spot.x, base, spot.z);
				add(color, geometry);
			};
			for (const part of propsFor(point.role, random)) place(part.geometry, part.color);
			this.blockers.push({
				x: spot.x,
				z: spot.z,
				radius: blockRadius(point.role)
			});
		}
	}
};
function blockRadius(role) {
	return role === "fisher" ? .35 : .6;
}
function propsFor(role, random) {
	switch (role) {
		case "gardener": return gardenBed(random);
		case "miller": return sawBench();
		case "fisher": return reeds(random);
		case "idler": return bench();
	}
}
/** Garden bed: a box of soil and sprouts in rows. */
function gardenBed(random) {
	const parts = [];
	const soil = new THREE.BoxGeometry(2, .16, 1.2);
	soil.translate(0, .08, 0);
	parts.push({
		geometry: soil,
		color: PALETTE.earth
	});
	for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
		const sprout = new THREE.ConeGeometry(.07, .24 + random() * .1, 4);
		sprout.translate(-.6 + i * .6, .28, -.28 + row * .56);
		parts.push({
			geometry: sprout,
			color: PALETTE.grass
		});
	}
	return parts;
}
/** Sawhorse with a log: the thing being sawed. */
function sawBench() {
	const parts = [];
	const beam = new THREE.BoxGeometry(1.5, .12, .16);
	beam.translate(0, .52, 0);
	parts.push({
		geometry: beam,
		color: PALETTE.wood
	});
	for (const x of [-.55, .55]) for (const z of [-.25, .25]) {
		const leg = new THREE.BoxGeometry(.09, .52, .09);
		leg.translate(x, .26, z);
		parts.push({
			geometry: leg,
			color: PALETTE.woodDark
		});
	}
	const log = new THREE.CylinderGeometry(.2, .2, 1.3, 8);
	log.rotateZ(Math.PI / 2);
	log.translate(0, .68, 0);
	parts.push({
		geometry: log,
		color: PALETTE.woodDark
	});
	return parts;
}
/** Reeds at the water and a crate for the catch. */
function reeds(random) {
	const parts = [];
	for (let i = 0; i < 6; i++) {
		const stalk = new THREE.ConeGeometry(.045, .8 + random() * .5, 4);
		stalk.translate(-.5 + random(), .5, -.35 + random() * .7);
		parts.push({
			geometry: stalk,
			color: PALETTE.grassDry
		});
	}
	const crate = new THREE.BoxGeometry(.5, .36, .4);
	crate.translate(.55, .18, .2);
	parts.push({
		geometry: crate,
		color: PALETTE.wood
	});
	return parts;
}
/** Bench on the square: an idler needs somewhere to idle. */
function bench() {
	const parts = [];
	const seat = new THREE.BoxGeometry(1.3, .1, .38);
	seat.translate(0, .42, 0);
	parts.push({
		geometry: seat,
		color: PALETTE.wood
	});
	for (const x of [-.5, .5]) {
		const leg = new THREE.BoxGeometry(.12, .42, .34);
		leg.translate(x, .21, 0);
		parts.push({
			geometry: leg,
			color: PALETTE.woodDark
		});
	}
	return parts;
}
//#endregion
//#region src/world/GreenFurniture.ts
/**
* What stands on the green: the wellhead, the pound, and the pond's
* dressing.
*
* The oak is not here — it is one more instance in the hedgerow-tree mesh
* (Vegetation.ts), so the biggest thing on the green costs no draw call
* at all. The water is not here either: it belongs to Water.ts, with the
* river, for the same reason.
*
* Nothing in this file builds a mesh. Every part goes into the shared
* PropBatch and comes out merged with the work-site props, because five
* colours of furniture would otherwise cost fifteen draw calls to draw
* eight hundred triangles.
*/
var GreenFurniture = class {
	/** Circles for the obstacle grid: you cannot walk through a wellhead. */
	blockers = [];
	constructor(batch) {
		const random = makeRandom(GREEN_SEED);
		this.buildWell(batch);
		this.buildPound(batch);
		this.buildPondEdge(batch, random);
	}
	/**
	* The wellhead: a stone drum with a dark shaft, two posts and a
	* windlass. It stands 1.05 m to the top of the barrel — a halfling
	* exactly — which makes it the one object in the village that tells you
	* how big everything else is.
	*
	* Built from primitives rather than a lathed profile. A lathe is the
	* obvious way to make a ring wall and the wrong one here: its winding
	* decides which way the faces point, and wound the natural way the
	* outer wall and the coping face inward, so a FrontSide toon material
	* shows you straight through the well and the inverted-hull outline
	* inflates the wrong way and disappears.
	*/
	buildWell(batch) {
		const base = heightAt(WELL.x, WELL.z) - WELL_BEDDING;
		const put = (geometry, color) => {
			geometry.translate(WELL.x, base, WELL.z);
			batch.add(geometry, color);
		};
		const drum = new THREE.CylinderGeometry(WELL_OUTER_RADIUS, .68, WELL_WALL_HEIGHT, 12);
		drum.translate(0, WELL_WALL_HEIGHT / 2, 0);
		put(drum, PALETTE.rock);
		const coping = new THREE.CylinderGeometry(.7000000000000001, .7000000000000001, .08, 12);
		coping.translate(0, .5900000000000001, 0);
		put(coping, PALETTE.rock);
		const shaft = new THREE.CircleGeometry(WELL_INNER_RADIUS, 12);
		shaft.rotateX(-Math.PI / 2);
		shaft.translate(0, .49000000000000005, 0);
		put(shaft, PALETTE.woodDark);
		for (const side of [-1, 1]) {
			const post = new THREE.BoxGeometry(WELL_POST_THICKNESS, 1, WELL_POST_THICKNESS);
			post.translate(side * .56, 1 / 2, 0);
			put(post, PALETTE.woodDark);
		}
		const barrel = new THREE.CylinderGeometry(WELL_BARREL_RADIUS, WELL_BARREL_RADIUS, 1.2, 8);
		barrel.rotateZ(Math.PI / 2);
		barrel.translate(0, .95, 0);
		put(barrel, PALETTE.wood);
		const crank = new THREE.BoxGeometry(.06, .22, .06);
		crank.translate(.68, .84, 0);
		put(crank, PALETTE.woodDark);
		const handle = new THREE.BoxGeometry(.05, .05, .16);
		handle.translate(.68, .73, .08);
		put(handle, PALETTE.woodDark);
		const rope = new THREE.CylinderGeometry(.012, .012, .17, 4);
		rope.translate(.3, .86, 0);
		put(rope, PALETTE.woodDark);
		const bucket = new THREE.CylinderGeometry(.13, .11, .18, 8);
		bucket.translate(.3, .69, 0);
		put(bucket, PALETTE.wood);
		this.blockers.push({
			x: WELL.x,
			z: WELL.z,
			radius: .75
		});
	}
	/**
	* The pound: a walled ring with one gate, for stock found straying.
	*
	* Eleven segments. The chord matters: eleven chords of 1.30 m on this
	* radius subtend 361 degrees and cannot close, which leaves a 12 cm
	* notch at every outer joint. At POUND_CHORD the outer faces meet
	* within four millimetres and the ring is a wall.
	*
	* One segment is left out for the gateway, and a five-bar gate hangs in
	* it. An open ring is not a pound, it is a ruin: the entire function of
	* the thing is that what goes in does not come out.
	*/
	buildPound(batch) {
		const pitch = Math.PI * 2 / 11;
		const put = (geometry, color, angle, radius, lift) => {
			const x = POUND.x + Math.cos(angle) * radius;
			const z = POUND.z + Math.sin(angle) * radius;
			geometry.rotateY(-angle);
			geometry.translate(x, heightAt(x, z) - POUND_BEDDING + lift, z);
			batch.add(geometry, color);
		};
		const gateSlot = Math.round(POUND.gate / pitch) % 11;
		for (let i = 0; i < 11; i++) {
			const angle = i * pitch;
			if (i === gateSlot) continue;
			const wall = new THREE.BoxGeometry(POUND_WALL_THICKNESS, POUND_WALL_HEIGHT, POUND_CHORD);
			wall.translate(0, POUND_WALL_HEIGHT / 2, 0);
			put(wall, PALETTE.rock, angle, POUND_RADIUS, 0);
			const cope = new THREE.BoxGeometry(POUND_WALL_THICKNESS * .7, .14, POUND_CHORD * .96);
			cope.translate(0, 1.02, 0);
			put(cope, PALETTE.rock, angle, POUND_RADIUS, 0);
		}
		this.buildPoundGate(batch, gateSlot * pitch);
		const steps = 44;
		for (let i = 0; i < steps; i++) {
			const angle = i / steps * Math.PI * 2;
			if (Math.abs((angle - gateSlot * pitch + Math.PI * 3) % (Math.PI * 2) - Math.PI) > Math.PI - pitch * .6) continue;
			this.blockers.push({
				x: POUND.x + Math.cos(angle) * POUND_RADIUS,
				z: POUND.z + Math.sin(angle) * POUND_RADIUS,
				radius: POUND_WALL_THICKNESS
			});
		}
	}
	/** A five-bar gate, hung ajar: closed reads as a wall, open as a hole. */
	buildPoundGate(batch, angle) {
		const hinge = angle - POUND_CHORD / 2 / POUND_RADIUS;
		const hx = POUND.x + Math.cos(hinge) * POUND_RADIUS;
		const hz = POUND.z + Math.sin(hinge) * POUND_RADIUS;
		const base = heightAt(hx, hz) - POUND_BEDDING;
		const swing = -angle + 35 * Math.PI / 180;
		const put = (geometry, color) => {
			geometry.rotateY(swing);
			geometry.translate(hx, base, hz);
			batch.add(geometry, color);
		};
		for (const post of [0, POUND_CHORD]) {
			const stile = new THREE.BoxGeometry(.1, 1.05, .1);
			stile.translate(0, 1.05 / 2, post);
			put(stile, PALETTE.woodDark);
		}
		for (let bar = 0; bar < 5; bar++) {
			const rail = new THREE.BoxGeometry(.06, .07, POUND_CHORD);
			rail.translate(0, .16 + bar * .19, POUND_CHORD / 2);
			put(rail, PALETTE.wood);
		}
		const brace = new THREE.BoxGeometry(.05, .06, POUND_CHORD * 1.08);
		brace.rotateX(-24 * Math.PI / 180);
		brace.translate(0, POUND_WALL_HEIGHT / 2, POUND_CHORD / 2);
		put(brace, PALETTE.wood);
	}
	/**
	* The pond's edge: a hard where the stock go in, and reeds on the side
	* where they do not.
	*
	* Not a ring of boulders at even spacing round the whole bank. That is
	* a garden rockery; a village pond is grass to the water almost all the
	* way round, with one cobbled ramp on the side the carts and the beasts
	* used, and the reeds left standing where nothing trampled them.
	*
	* Everything here shares the styling of the props it merges with. A
	* flat slab does not need to cast a shadow, but asking for that split
	* its colour into a second bucket and cost four draw calls to save
	* two.
	*/
	buildPondEdge(batch, random) {
		const water = pondWaterY();
		const hardAt = .1;
		for (let i = 0; i < 7; i++) {
			const across = -1.05 + i % 4 * .7;
			const out = i < 4 ? .35 : -.35;
			const angle = hardAt + across / POND_REACH;
			const radius = pondEdge(angle) + out;
			const x = POND.x + Math.cos(angle) * radius;
			const z = POND.z + Math.sin(angle) * radius;
			const slab = new THREE.BoxGeometry(.62 + random() * .2, .1, .52 + random() * .2);
			slab.rotateY(angle + (random() - .5) * .4);
			slab.translate(x, Math.max(heightAt(x, z), water - .04) - .02, z);
			batch.add(slab, PALETTE.rock);
		}
		for (let clump = 0; clump < 5; clump++) {
			const angle = Math.PI * .62 + clump / 5 * Math.PI * .72 + random() * .18;
			const radius = pondEdge(angle) - .15 - random() * .35;
			const cx = POND.x + Math.cos(angle) * radius;
			const cz = POND.z + Math.sin(angle) * radius;
			for (let stalk = 0; stalk < 4; stalk++) {
				const x = cx + (random() - .5) * .55;
				const z = cz + (random() - .5) * .55;
				const height = .75 + random() * .45;
				const reed = new THREE.ConeGeometry(.04, height, 4);
				reed.translate(x, heightAt(x, z) + height / 2 - .05, z);
				batch.add(reed, PALETTE.grassDry);
			}
		}
	}
};
//#endregion
//#region C:/Temp/claude/D--hobbits/03ad97d4-339a-46b5-bcab-b2a7ea2dcfd4/scratchpad/count.ts
const scene = new THREE.Scene();
const t0 = Date.now();
const terrain = new Terrain();
scene.add(terrain.mesh);
const tTerrain = Date.now() - t0;
const ground = new Ground(terrain.bvh);
const burrows = new Burrows();
scene.add(burrows.group);
const smoke = new Smoke(burrows.chimneys);
scene.add(smoke.mesh);
const hedges = new Hedges();
scene.add(hedges.mesh);
const water = new Water();
scene.add(water.mesh);
const props = new THREE.Group();
props.name = "props";
const batch = new PropBatch();
const work = new WorkSites(batch);
const green = new GreenFurniture(batch);
batch.build(props);
scene.add(props);
const t1 = Date.now();
const veg = new Vegetation(scene, ground);
const tVeg = Date.now() - t1;
const rows = [];
scene.traverse((o) => {
	if (!(o instanceof THREE.Mesh)) return;
	const g = o.geometry;
	const idx = g.getIndex();
	const pos = g.getAttribute("position");
	const tris = (idx ? idx.count : pos.count) / 3;
	const inst = o instanceof THREE.InstancedMesh ? o.count : 1;
	rows.push({
		name: o.name,
		kind: o.type,
		tris,
		cast: o.castShadow,
		recv: o.receiveShadow,
		instances: inst
	});
});
rows.sort((a, b) => a.name.localeCompare(b.name));
let totalTris = 0;
let colorDraws = 0;
let shadowDraws = 0;
for (const r of rows) {
	totalTris += r.tris * r.instances;
	colorDraws++;
	if (r.cast) shadowDraws++;
}
console.log(JSON.stringify({
	terrainMs: tTerrain,
	vegMs: tVeg,
	meshCount: rows.length,
	colorDraws,
	shadowDraws,
	totalTris,
	chimneys: burrows.chimneys.length,
	burrowParts: [...burrows.group.children].map((c) => c.name),
	burrowBlockers: burrows.blockers.length,
	hedgeBlockers: hedges.blockers.length,
	workBlockers: work.blockers.length,
	greenBlockers: green.blockers.length,
	treeTrunks: veg.treeTrunks.length,
	rows
}, null, 1));
//#endregion
export {};
