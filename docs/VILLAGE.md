# Чертёж деревни

Рабочая документация к застройке долины. Составлена по реальной
английской деревне Уорикшира и Вустершира — тому ландшафту, который
Толкин называл образцом, — а не по его текстам и не по декорациям
фильмов. Ни одного имени собственного из легендариума здесь нет и быть
не должно: см. ограничение по названиям в CLAUDE.md.

Все координаты и уклоны перемерены по настоящему `heightfield.ts`.
Документ на английском: это спецификация, плотно набитая идентификаторами
кода. Скажете — переведу.

---

I have read the constitution and the four source files, and I re-derived every number in both layouts against the actual height field with a standalone replica of `heightfield.ts` (kept at `C:\Temp\claude\D--hobbits\03ad97d4-339a-46b5-bcab-b2a7ea2dcfd4\scratchpad\probe.mjs` — reusable, it imports nothing).

## Планы

**Планы удалены: они рисовали кольцо.** Отрисовщик читал выгрузку из
игры, но выгрузка сделана до перестройки, и обе картинки показывали
пятнадцать домов по окружности, межи-лучи и заднюю межу-окружность —
ровно то, чего в мире больше нет. Перерисовать их по новой застройке
нужно, и до этого не дошло.

---

# THE VALLEY

This document used to describe a ring: fifteen dwellings on a circle of
radius 27, with plot boundaries as rays from the origin and a croft rear as
a circle at radius 42. **That layout is gone, and so are the parts of this
document that described it.** They are deleted rather than annotated,
because a blueprint that contradicts itself in thirty-one places is worse
than no blueprint — footnoting it was a way of not admitting it was wrong.

## Why the ring died

Measured, and not in dispute:

- The natural ground rose **0.30 m** across a dwelling's own footprint,
  against a mound **3.13 m** tall. Nine tenths of every "hill" was an
  artificial dome sitting on a lawn.
- The whole valley floor was flat: mean slope **3 degrees** from r = 10 to
  r = 100, less than a metre of rise over any eight-metre span anywhere
  inside the rim. There was nothing to dig a dwelling into.
- The dwellings sat at bearings **22.5 degrees apart** — a regular polygon.
  No English village has ever been that shape.

And the ring was never a decision. It fell out of one line —
`Math.atan2(-x, -z)`, *face the middle of the valley* — retyped in four
files. If every door looks at the centre, every dwelling ends up on a
circle around it. Nobody chose it; it was inherited from a plan written for
six dwellings and never questioned.

## The valley as built

**Landform first, settlement second.** Six scarps in `config/scarps.ts`,
each a straight crest with round ends and a skirt that falls away from it,
plus a water guard that can only ever remove height — so no future edit can
put a cliff over the channel. Interior relief **9.75 m**, against about two
before.

**Five foci, not a ring**: four dwellings at the knot by the green, three at
the higher end, four along the water, three above the mill, one outlying
farmstead. Between foci 36 m, within a focus 8.7 m.

| | ring | as built |
|---|---|---|
| ground rise across a dwelling's footprint | 0.30 m | **2.00 – 3.20 m** |
| hill's share of the mound's silhouette | 0.7 % | **69 – 100 %, mean 88** |
| door bearings | all radial | **6.3 – 87.6 degrees** |
| frontage-width spread | 0.082 | **0.372** |
| interior relief | ~2 m | **9.75 m** |
| the green | rectangle, 204 m² | **residual of a lane fork, 525 m²** |

**Every position is derived, not drawn.** A plot boundary runs uphill from
the frontage along the fall line, from the midpoint of the gap between two
neighbours to where the bank stops rising. A croft rear is an offset of the
back lane. The green is what is left inside the fork of three lanes. Lanes
were routed on the built surface by shortest cost — length × (1 + 9·grade²),
refused past 26 degrees, water and mounds forbidden — which is why the
street holds 7 degrees and the hollow way up to the higher end takes 29.4.

**The rim never moved.** 0 leaks over 3,600 bearings, thinnest steep band
12.0 m, before and after. Every scarp is exactly zero beyond its own reach,
and the furthest reaches 95.5 m against a rim that begins at 104.96.

## What this cost, honestly

Startup went from a recorded 481 ms for the terrain to a measured **1.6 s**
— and that 481 was itself stale, taken before the pond, the pit and the
building pads. Of the 1.6 s: displacement 830 ms, vertex normals 120, BVH
719, of which a flat plane of the same resolution already costs 590. Reading
vertices straight from the array instead of through `BufferAttribute` was
tried and changed nothing. The cost is `heightAt` itself.

Frame time is unchanged at **8.3 ms / 120 fps**.

Three defects are known and open: twenty-three terrain triangles stand over
`MAX_SLOPE` on platform seams where the shipped world had none; spacing
within a focus is still nearly regular; and the whole village has not yet
been walked and looked at — only the knot has.

---

## 1. Scale rules — into `config/constants.ts` with this comment verbatim

```ts
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
/** Bay of a timber frame. Every above-ground structure is a whole number. */
export const BAY = 2.6;
```

Cart shed 1 bay, cottage 2, mill 3, inn 3.

---

### 2.7 The mill — no waterworks

**Building centred (−27.4, −20.8)**, axis along x, 3 bays × 2.6 = **7.8 × 4.0 m**, pad level −1.15 (measured range 0.39 m).

> Corrected after the plan was drawn. At the original −21.2 one sample of
> 364 across the footprint stood in water: the south-east corner reached
> z = −23.2 where the river's north edge is at −23.17, because the channel
> runs diagonally and rises towards the east. Moving 0.4 m north makes the
> whole footprint dry and still leaves the wheel only 1.8 m from the south
> wall. Water in the pit is unchanged at 0.29 m.
r = 34.3 — exactly on the tree-clearing edge, so it sits in the gap between clearing and wood, where a mill belongs. **39.3 m from the green centre = 25 s at walk.** Sightline from the green clear, subtends 6.7°.

Three storeys at 1.60 (above the 1.6 m burrow ceiling — this is a working building), eaves +4.80, gable 45° over 4.0 m adding 2.00, **ridge +6.80 above the pad**.

**Wheel pit (−27.4, −24.6).** Measured there: uncut ground −1.13, cut −1.72, carve 0.59 → **water surface −1.43, depth 0.29 m**. The mill's south wall is at z = −23.2, so the wheel is **1.4 m from the wall** — bridged by the wheel-pit side walls, not by a cut race. Nothing is added to `heightfield.ts` but the pad.

Wheel: 2.40 m diameter × 1.20 wide (Sarehole's 12 ft × 0.647), **24 flat float boards** 1.20 × 0.35 × 0.05 at 0.314 pitch, 12 spokes, two rims at r 1.15 and 1.18. Immersion 0.29 m. Axle y = −0.58; **crown +0.62, standing 1.77 m above the mill floor.** 6.5 rpm, one turn per 9.2 s — spokes phase-offset from paddles and the two rims at different radii, or a toon silhouette with no motion blur is perfectly periodic and reads as a wagon-wheel wobble.

**Lucam** — the one feature that reads "mill" and nothing else: gabled weatherboarded hood projecting 0.90 m, 1.10 wide, own gable 0.60, on two knees; loading doors 1.30 × 1.10 at +2.00; hoist beam 0.12 sq projecting 0.30, rope and hook hanging 0.80. ~20 boxes, worth more than the rest of the building.

Spray at the wheel foot: `Smoke` unchanged, white, 8 puffs, 0.8 s lifetime, no drift. Millstone as door threshold: one cylinder r 0.40 × 0.16.

Mill yard **(−23.5, −18.5)**, 9 × 7, range 0.31 m.

#### As built

The mill went in through `frame.ts` unchanged apart from one parameter it
was missing, which is the only honest test of whether that module was a
primitive or the inn with a knob on it: **`storeys`**. Wall height had been
a constant, and a constant is exactly the wrong shape for the one dimension
that separates a dwelling from a working building. Everything else — bays,
depth, pitch, the show face, the stack — was already a parameter and
already right.

| | planned | built |
|---|---|---|
| centre | (−27.4, −20.8) | **unchanged** |
| axis | along x | **along x, and it has to be** |
| storeys / eaves | 3 / +4.80 | **3 / +5.70** |
| wheel pit | (−27.4, −24.6) | **(−27.4, −25.7)** |
| wheel | 2.40 m, 24 floats, 6.5 rpm | **unchanged, 848 tri, 9.2 s a turn** |

**The axis is not a style.** Turned to face the village like every other
building here, the footprint swings its south-east corner into the channel:
56 samples of 819 stand in water. Along x the whole footprint is dry.

**The pit moved, because a wheel is not a point.** The blueprint measured
0.29 m of standing water at (−27.4, −24.6) and that reproduces exactly. But
that point lies 2.5 m off the channel axis, up on the bank, and a 2.4 m
wheel needs 2.4 m of bed. Measured across the whole footprint the wheel
there cut **0.23 m into the bank**. The bed does not go flat until about
−25.7; there the floats dip 0.29 m and clear the bottom by 0.08 m
everywhere, at the price of standing 2.9 m from the mill wall instead of
1.8 — a longer pit, which is what a wheel in the stream rather than against
the wall actually needs.

Two defects the screenshots could never have shown, both found by
measurement:

- **The axle was set from the bed under the wheel's centre.** The centre is
  the deepest point of a channel, so the stated clearance existed in exactly
  one place: 2 mm at the middle and a quarter of a metre into the bank at
  the sides. It is set from the highest bed under the whole footprint now.
- **The wheel had no outline at all, and then had one that stood still.**
  `applyStyle` hangs the inverted hull *beside* the mesh and copies its
  transform once — correct for every static object it had ever been asked
  to outline, and wrong for the only one that turns. First the mesh had no
  parent, so the hull was built and silently dropped; then it was a sibling,
  and the wheel span inside a stationary contour. It is a child of the mesh
  now and inherits the rotation.

**Both buildings were first built back to front.** `yaw` rotates the
building, and the front — door, windows, close studding, a mill's lucam —
is the face at local −depth/2. At `yaw = PI` that face swings to the far
side: the inn's door and studding landed at z = 29.08, on the away side
from a green whose centre is at z = 9, and the mill's loading doors faced
the river where the wheel is. The inn is at 0 and the mill at PI now. The
long axis is unchanged either way; what the angle decides is which side
gets the openings, and no measurement of clearances or levels can catch
that — only looking can.

**Why the wheel appeared to hang in the air.** At the blueprint's pit the
terrain mesh rises to −1.342 against a water plane at −1.360: the bank
pokes through the ribbon exactly where the wheel stood, the visible
waterline retreats, and the wheel hangs over what looks like dry ground.
The single-point depth reading was right and useless. At the pit as built
no terrain vertex stands above the water, and the wheel sits 0.315 m into
it.

**Cost.** The frame goes into the shared `PropBatch` and the wheel cannot:
merged static geometry has its matrix composed once, which is the whole
reason the batch is cheap. Three draw calls for the only moving mechanism
in the world. Measured after all of it — hedges, 37 hedgerow trees, pond,
green furniture, inn, mill, lucam and a turning wheel — the frame is
**8.3 ms at 120 fps**, which is where it stood before any of this began.

---

## 7. Cut, with the reason

- **The mill's weir, leat, millpond, bay, spillway, tailrace and race.** Measured: bank freeboard is 0.16–0.46 m, so no weir above 0.20 m is buildable; and water already stands 1.4 m from the mill wall. A 24 m leat is a real 130–200 m compressed sixfold; at this scale it is a ditch and a puddle for a whole new hydrology module. The pond goes on the green instead, 8 m from spawn, where the player is standing.
- **A closed back lane at r = 40.** Outside `TREE_CLEARING_RADIUS`, one 22° pinch, and it would force a clearing-radius change that thins the wood the valley's silhouette depends on. The croft rear arc at r = 32 does the same job inside the clearing.
- **The 0.78 m Devon hedge bank in the height field.** Unrepresentable on 1 m quads, and 0.78 + 0.87 = 1.65 m of green would black out the frame at a 1.32 m eye. Bank is 0.18 m of ribbon geometry.
- **Rebuilding the six burrow frontages** (retaining wall, segmental arch, mullioned lights). Correct and locally precedented, but it rewrites six working meshes and buys nothing at 23–26 m, which is as close as the player ever gets to five of the six. The chimneys deliver more silhouette for 10 lines. Revisit after step 12.
- **Stakes at 0.29 m, hazel binders, wattle staves at 0.13 m, lead cames at 6 mm, brick courses at 35 mm, cock-and-hen coping.** All correctly researched, all sub-pixel at the distance the player sees them, all flattened by a three-step ramp. Keep the brick-course *number* for the chimney texture; build none of the rest as geometry.
- **A second meander term on the river.** Invalidates four systems and the rim closedness test for landforms that read as noise.
- **Sheepwash, eel bucks, granary on staddle stones, washing stage, watering hard, ha-ha, clapper bridge, stepping stones, dry-stone field walls, jetty.** Every one real; every one under 0.9 m or beyond r = 44. This is clay country — walling the fields would relocate the valley to the wrong county. Two props survive (pound, per-toft yard clutter seeded from the burrow id) because two props read as habitation and fifteen read as an asset dump.
- **The smithy.** Deferred, not refused: (10.0, −2.5) is measured flat (range 0.16 m, slope 2.2°, 11.7 m clear of burrow-6 — proper fire clearance next to thatch). It is a seventh function and a fourth building. Build it only if steps 1–12 land and the valley still wants one.
- **Adding or moving a burrow.** The frontage problem is occupancy (mound covers 40 % of an 18 m chord against a surveyed 50–67 %), not spacing. Hedges and yard clutter take it to ~60 % with no new dwellings.

**Constitution check.** Circuit of the finished plan — green, front lane, croft rear, mill lane and back, orchard — measures ~400 m = **250 s at `WALK_SPEED`**, before any hedge detour; a straight crossing is 160 s today. The valley is currently *under* its own five-minute specification and enclosure closes the gap without one extra metre of terrain. Every prop above is boxes, cylinders, cones and extruded prisms. No character is added or generated. One palette, three tokens added, none replaced. Every generator is seeded through the existing `hashSeed`/`makeRandom`; there is no `Math.random` anywhere in the plan.