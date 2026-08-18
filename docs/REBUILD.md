# Перестройка мира: рельеф и застройка

Причина, по которой это понадобилось, измерена и не обсуждается:

- земля поднимается поперёк пятна жилища на **0.30 м** при высоте холма
  **3.13 м** — «холм, в который врыт дом», на 90% искусственный купол;
- **вся долина плоская**: от r=10 до r=100 средний уклон 3°, перепад на
  восьми метрах меньше метра везде — врывать норы не во что;
- дома стоят по окружности с шагом 22.5° (разброс 6.2°) — правильный
  многоугольник, а не поселение.

Кольцо унаследовано из чертежа, написанного на шесть домов, и никем ни разу
не проверялось. Всё, что построено после — межи, дороги, зелёный, постройки —
возведено поверх этого допущения.

Ниже — решение: три независимых варианта застройки, суд по трём линзам,
попытка сломать победителя. Порядок работы обратный прежнему: **сперва форма
земли, потом застройка по ней.**

Состояние до перестройки помечено тегом `before-rebuild`.

---

## VERDICT

**C (POLYFOCAL) is the right base — but not C as written.** I rebuilt it from the repo source, and the result below is C's *architecture* (landform as data, capsule shelves with a provable reach, river/rim/light untouched, the crossing as a loop) carrying **B's derivation** (the row is a contour of the landform; door yaw is the closed-form fall line plus a splay, so the layout re-derives when a scarp moves) and **A's water-guard idea in a C1 form**. I did not adopt C's fifteen rows, its four scarps, or its lanes: two of them are wrong.

Two of the judges' cross-checks I confirmed independently, and one I falsified.

| claim | my measurement |
|---|---|
| all three proposals' pad fixes (`faceOf` base at the threshold; directional `padWeight`) are load-bearing | **confirmed, and worse than stated.** With the landform in and the *shipped* pads: 641 grid points over `MAX_SLOPE`, max 65.2°, worst door approach 57.6°, forecourt slope 7.29°. With the fixes: 0 points, 1.09° forecourt. |
| C's reach proof (`\|centre\|+half+toe` ≤ 97 m < 105) | **arithmetically wrong.** Its `shoulder` reaches 37.58+24+44 = **105.58 > 104.96**. My shoulder reaches 99.44. |
| "the spacing-regularity fix is cheap and I did not spend it" (C) | **false.** I spent it. See defect 3. |
| `probe.mjs` (the harness handed to all three) is "current" | **it omits `BUILDING_PADS`.** My replica matches `heightfield.ts` to 0.000e+0 on `valleyFloor` and `groundHeight` with the building pads in; `probe.mjs` differs by up to **0.277 m** near the inn and mill. Every number any proposal measured near those two buildings is off. |

Scripts (all mine, written from the TypeScript, not from any proposal's replica), in `C:\Temp\claude\D--hobbits\558b11a7-48ae-46b2-9650-9f7cdf31ee3e\scratchpad\syn\`: `field.mjs` (replica + landform + pads), `parity.mjs` (bit-exactness vs the repo), `land.mjs` (the scarps), `plan.mjs` (the seat generator), `solve.mjs` (variant search), `pads.mjs` (pad sweep), `world.mjs`, `layout.mjs` (furniture, Dijkstra lanes, walk times, load frame), `verify.mjs` (the battery).

---

# 1. THE LAYOUT

## 1.1 `src/config/scarps.ts` — NEW FILE. The landform, as data.

```ts
export interface Scarp {
  id: string;
  x: number; z: number;   // centre of the crest segment
  deg: number;            // bearing of the crest; the fall line runs deg - 90
  half: number;           // half-length of the crest segment (round end caps)
  toe: number;            // distance at which the shelf is exactly zero
  width: number;          // width of the falling skirt
  rise: number;           // metres the shelf stands above ground outside the toe
  wobble: number;         // how far the front wanders, metres
  wave: number; phase: number;
  free?: boolean;         // exempt from the water guard
}

export const SCARPS: readonly Scarp[] = [
  // 1. THE SHOULDER — the broad lie of the land. Its crest lies WEST of
  //    everything, so its uphill direction is the same westward one the risers
  //    have and it can never flip a fall line: peak 10.1 deg against a riser's
  //    28. No dwellings. It is why the higher end and the mill hamlet stand
  //    3.1 m above the knot. Exempt from the guard: at 10 deg it could not put
  //    a cliff over the water if it tried.
  { id: 'shoulder', x: -46.0, z:  12.0, deg: 158.0, half: 10, toe: 38, width: 38, rise: 4.50,
    wobble: 4.0, wave: 0.100, phase: 0.40, free: true },
  // 2. THE TOWN BANK — the knot: four plots on the west side of the green.
  { id: 'town',     x:  -9.5, z:   6.0, deg: 157.7, half: 24, toe: 19, width: 11, rise: 4.15,
    wobble: 3.5, wave: 0.105, phase: 1.35 },
  // 3. THE HIGH BANK — the higher end, three plots, up the shoulder and back.
  { id: 'high',     x: -44.0, z:  34.0, deg: 161.0, half: 17, toe: 19, width: 11, rise: 4.15,
    wobble: 3.0, wave: 0.120, phase: 2.70 },
  // 4. THE HAUGH BANK — the far bank's terrace, four plots looking north over
  //    the channel. Exempt: it IS the terrace the guard exists to protect.
  { id: 'haugh',    x:   2.3, z: -50.8, deg: 114.0, half: 20, toe: 19, width: 11, rise: 4.15,
    wobble: 2.6, wave: 0.140, phase: 0.15, free: true },
  // 5. THE MILL BANK — three steadings above the mill, west end of the water.
  { id: 'millbank', x: -47.0, z: -12.0, deg: 150.0, half: 15, toe: 19, width: 11, rise: 3.90,
    wobble: 2.0, wave: 0.180, phase: 3.90 },
  // 6. THE FOLD — a single hillock east of the green: one outlying farmstead,
  //    so the nucleus reads as the middle of a parish, not as the whole world.
  { id: 'fold',     x:  28.0, z:  30.0, deg: 158.0, half:  3, toe: 19, width: 11, rise: 4.15,
    wobble: 2.0, wave: 0.200, phase: 1.90 },
];
```

New constants in `src/config/constants.ts`:

```ts
/** Metres either side of the channel axis that stay dead level. */
export const HAUGH_FLAT = 5;
/** Ceiling on how fast raised ground may climb away from the water. */
export const HAUGH_SLOPE = 0.36;      // tan 19.8 deg
/** The detail noise the terrain already computes crinkles the riser edges. */
export const SCARP_WOBBLE = 0.9;
```

## 1.2 The height-field terms (`src/world/heightfield.ts`)

```ts
const SC = SCARPS.map((s) => {
  const a = (s.deg * Math.PI) / 180;
  return { ...s, ax: Math.sin(a), az: Math.cos(a),
           outerSq: (s.toe + s.wobble) ** 2, inner: s.toe - s.width };
});

/**
 * Raised ground may not stand higher than a ramp of HAUGH_SLOPE rising from
 * HAUGH_FLAT metres off the channel axis.
 *
 * Written as a gate, not as a min and not as a smooth-min. A hard `min` is one
 * scarp-tuning away from creasing; a smooth-min with an early-out creases at
 * its own toe (proposal A's `if (cap <= 0) return 0` before `smin` puts a
 * 25-degree corner the length of its street). This is C1 everywhere, exactly 0
 * over the water, exactly h once there is room, and it can only ever REMOVE
 * height — so no future scarp edit can put a cliff over the channel.
 */
function waterGuard(h: number, dz: number): number {
  if (h <= 0) return 0;
  const need = HAUGH_FLAT + h / HAUGH_SLOPE;
  if (dz >= need) return h;
  return h * smoothstep(HAUGH_FLAT, need, dz);
}

function scarpAt(x: number, z: number, channelZ: number): number {
  let free = 0, guarded = 0;
  for (let i = 0; i < SC.length; i++) {
    const s = SC[i]; if (s === undefined) continue;
    const dx = x - s.x, dz = z - s.z;
    let u = dx * s.ax + dz * s.az;
    if (u > s.half) u = s.half; else if (u < -s.half) u = -s.half;
    const ex = dx - u * s.ax, ez = dz - u * s.az;
    const q2 = ex * ex + ez * ez;
    if (q2 >= s.outerSq) continue;                       // squared early-out
    // Distance to the crest SEGMENT, so the two ends are round caps and each
    // bank dies for a reason instead of stopping at a drawn line. One sine
    // along the crest shifts that distance: the fall line is not a constant
    // bearing, so the doors splay 32-40 deg with no hand-written angle.
    const q = Math.sqrt(q2) - s.wobble * Math.sin(u * s.wave + s.phase);
    if (q >= s.toe) continue;
    const v = q <= s.inner ? s.rise : s.rise * (1 - smoothstep(s.inner, s.toe, q));
    if (s.free) free += v; else guarded += v;
  }
  if (guarded > 0) free += waterGuard(guarded, Math.abs(z - channelZ));
  return free;
}

export function valleyFloor(x: number, z: number, channelZ = riverCenterZ(x)): number {
  const distance = Math.hypot(x, z) / VALLEY_RADIUS;
  const rim = smoothstep(RIM_START, 1.05, distance) ** RIM_CURVE * RIM_HEIGHT;
  const calm = 1 - smoothstep(CENTER_CALM_INNER, CENTER_CALM_OUTER, distance);
  const hills = fbm(x * HILL_FREQUENCY, z * HILL_FREQUENCY, 4) * HILL_HEIGHT * (1 - calm * 0.8);
  const detailNoise = fbm(x * DETAIL_FREQUENCY, z * DETAIL_FREQUENCY, 3);
  const w = detailNoise * SCARP_WOBBLE;
  return rim + scarpAt(x + w, z - w, channelZ) + hills + detailNoise * DETAIL_HEIGHT;
}
```

`RIM_HEIGHT`, `RIM_START`, `RIM_CURVE`, `HILL_*`, `DETAIL_*`, `CENTER_CALM_*`, `TERRAIN_SEED`, every `RIVER_*`, `pondCarve`, `pitCarve`, `FORD_*`, `BRIDGE_*`, `WHEEL_*` and `render/Lighting.ts` are **unchanged**. Thread `channelZ` from `heightAt` into `valleyFloor` and `riverCarve` so the `Math.sin` count stays at one.

## 1.3 The two pad changes, without which the terrain change is cancelled

```ts
// burrows.ts
export const PAD_MARGIN = 1.0;   // was 3.6
export const PAD_FADE = 4.0;     // was 2.6
export const PAD_BACK = 0.6;     // how far the level floor reaches behind the cut
export const PAD_SIDE = 1.0;     // a forecourt is as wide as the frontage,
export const PAD_SIDE_FADE = 2.0;// not a 14 m disc

// burrow/profile.ts — base at the THRESHOLD, not at the crown (1.0-1.4 m out on a 27 deg bank)
export function faceOf(burrow: Burrow, valleyFloorAt: (x: number, z: number) => number): BurrowFace {
  const yaw = doorFacing(burrow);                 // was Math.atan2(-x, -z)
  const distance = faceDistance(burrow);
  const fx = burrow.x + Math.sin(yaw) * distance;
  const fz = burrow.z + Math.cos(yaw) * distance;
  return { yaw, x: fx, z: fz, distance, base: valleyFloorAt(fx, fz),
    halfWidth: Math.sqrt(Math.max(0, burrow.radius ** 2 - distance ** 2)),
    height: faceHeightAt(burrow, distance, 0) };
}

export function padWeight(pad: Pad, x: number, z: number): number {
  const dx = x - pad.x, dz = z - pad.z, d2 = dx * dx + dz * dz;
  if (d2 >= pad.outerSq) return 0;                // (radius+MARGIN+FADE)^2, precomputed
  const d = Math.sqrt(d2), inner = pad.radius + PAD_MARGIN;
  let w = d <= inner ? 1 : 1 - smooth01((d - inner) / PAD_FADE);
  if (pad.sx === 0 && pad.sz === 0) return w;     // a building pad has no facing
  const side = Math.abs((x - pad.fx) * pad.sz - (z - pad.fz) * pad.sx);
  const sideIn = pad.radius + PAD_SIDE;
  if (side >= sideIn + PAD_SIDE_FADE) return 0;
  if (side > sideIn) w *= 1 - smooth01((side - sideIn) / PAD_SIDE_FADE);
  const forward = (x - pad.fx) * pad.sx + (z - pad.fz) * pad.sz;
  if (forward >= 0) return w;                     // in front of the cut: level
  if (forward <= -PAD_BACK) return 0;             // behind it: solid hill
  return w * (1 - smooth01(-forward / PAD_BACK));
}
```

Measured on this layout, 0.5 m grid over the 120 m settlement box:

| pads | points > `MAX_SLOPE` | max slope | worst door approach | forecourt |
|---|---|---|---|---|
| shipped 3.6/2.6, omnidirectional | **641** | 65.2° | 57.6° | 7.29° |
| directional, 2.4/3.2 | 44 | 58.7° | 32.7° | 1.41° |
| **directional + lateral, 1.0/4.0** | **9** | 52.5° | 29.3° | **1.09°** |

Dropping the lateral limit alone costs +25 over-`MAX_SLOPE` triangles. Increasing `PAD_MARGIN` above 1.0 makes it *worse* (1.8/6.0 → 9× the over-50 count), because wider discs overlap more neighbours.

## 1.4 `src/config/burrows.ts` — the fifteen

`Burrow` gains one field; `doorFacing()` stops being a formula about the origin, and its four re-typed copies (`lanes.ts:102`, `work.ts:78`, `profile.ts:84`, `profile.ts:94`) collapse into it.

```ts
export interface Burrow {
  id: string; x: number; z: number; radius: number; height: number;
  /** Bearing the door faces, degrees (0 = +z). A dwelling cut into a bank has
   *  one possible aspect — downhill — so this is data, not a formula. */
  facing: number;
}
export function doorFacing(b: Burrow): number { return (b.facing * Math.PI) / 180; }

export const BURROWS: readonly Burrow[] = [
  { id: 'burrow-1',   x:  -2.70, z:  25.03, radius: 3.71, height: 3.49, facing:  40.5 },  // knot, 6 perch
  { id: 'burrow-2',   x:   3.44, z:  18.82, radius: 2.95, height: 2.77, facing:  40.7 },  // knot, 3 perch
  { id: 'burrow-3',   x:   7.68, z:  12.25, radius: 3.14, height: 2.95, facing:  75.5 },  // knot, 4 perch
  { id: 'burrow-4',   x:  10.33, z:   2.77, radius: 3.52, height: 3.31, facing:  79.7 },  // knot, 8 perch
  { id: 'burrow-5',   x: -34.88, z:  51.22, radius: 3.52, height: 3.31, facing:  60.0 },  // higher end, 4
  { id: 'burrow-6',   x: -28.63, z:  46.04, radius: 2.95, height: 2.77, facing:  65.5 },  // higher end, 2.5
  { id: 'burrow-7',   x: -22.64, z:  39.06, radius: 3.14, height: 2.95, facing:   6.3 },  // higher end, 5
  { id: 'burrow-8',   x:  -6.97, z: -33.18, radius: 3.33, height: 3.13, facing:  33.8 },  // water row, 3
  { id: 'burrow-9',   x:   0.06, z: -36.67, radius: 2.95, height: 2.77, facing:   9.6 },  // water row, 2.5
  { id: 'burrow-10',  x:   8.26, z: -37.99, radius: 3.14, height: 2.95, facing:   6.3 },  // water row, 4
  { id: 'burrow-11',  x:  23.01, z: -39.78, radius: 3.52, height: 3.31, facing:  33.6 },  // water row, 6
  { id: 'burrow-12',  x: -39.46, z:   0.03, radius: 3.33, height: 3.13, facing:  87.6 },  // mill hamlet, 5
  { id: 'burrow-13',  x: -34.78, z:  -6.55, radius: 2.95, height: 2.77, facing:  85.6 },  // mill hamlet, 2.5
  { id: 'burrow-14',  x: -30.30, z: -12.91, radius: 3.14, height: 2.95, facing:  66.4 },  // mill hamlet, 3
  { id: 'burrow-15',  x:  43.14, z:  36.73, radius: 3.52, height: 3.31, facing:  85.7 },  // the fold, 6
];
```

Five foci at **4 / 3 / 4 / 3 / 1**. Frontages are perch multiples (`5.0292 × VERNACULAR_SCALE 0.647 = 3.2539 m`): 2.5, 3, 4, 5, 6, 8. These rows are the frozen output of `plan.mjs`, whose set-back solver and per-plot splay run against the real height field — move a scarp and re-run rather than re-typing.

## 1.5 Lanes, green, inn, mill

Lanes routed by Dijkstra on the **built** surface, cost `length × (1 + 9·grade² + 6 if slope > 22°)`, forbidding slope > 26°, water outside the ford disc and bridge corridor, mounds + 1.2 m and building pads.

| id | class | length (ground) | max grade | nearest mound | in water |
|---|---|---|---|---|---|
| `street` — past every knot door, the green's west edge | front | 39.3 m | **7.0°** | 1.66 m | 0 |
| `back` — the toft rears behind the knot | croft | 35.9 m | 16.3° | 10.31 m | 0 |
| `higher` — the hollow way up to the higher end | cart | 54.3 m | **29.7°** | 1.07 m | 0 |
| `millway` — the green to the mill, along the north bank | cart | 52.0 m | 18.4° | 4.22 m | 0 |
| `mill-end` — the mill to the mill hamlet | croft | 29.3 m | 22.2° | 2.03 m | 0 |
| `ford` — the millway down to the crossing | cart | 14.9 m | 18.6° | 2.86 m | 0 |
| `far` — in front of the water row | front | 36.2 m | 10.1° | 1.19 m | 0 |
| `bridge-s` / `bridge-n` | foot | 15.4 / 8.5 m | 1.4 / 7.1° | 2.25 / 7.98 m | 0 |
| `fold` — the green out to the outlying farmstead | croft | 17.8 m | 15.2° | 1.36 m | 0 |

```
street:   [1.5,31.0] [9.5,22.5] [10.5,21.0] [10.5,18.5] [14.5,14.5] [14.5,9.0] [15.5,8.0] [15.5,-2.0] [16.0,-2.5]
back:     [-19.0,21.5] [-8.5,11.0] [-8.5,-1.0] [-6.5,-3.0] [-6.5,-8.5] [-6.0,-9.0]
higher:   [-19.0,21.5] [-24.0,26.5] [-27.0,26.5] [-34.0,33.5] [-34.5,39.5] [-35.5,40.5] [-35.5,42.0] [-40.0,47.0] [-40.0,52.0] [-38.5,55.5] [-33.0,56.0] [-30.5,54.5] [-30.0,55.0]
millway:  [16.0,-2.5] [14.0,-4.5] [14.0,-13.0] [13.0,-14.0] [11.0,-14.0] [9.5,-15.5] [4.0,-16.0] [2.0,-17.0] [-3.0,-17.5] [-5.0,-18.5] [-10.5,-19.0] [-13.0,-20.0] [-16.5,-20.0] [-19.5,-17.0] [-23.5,-17.0]
mill-end: [-23.5,-17.0] [-23.0,-12.5] [-27.5,-6.5] [-28.5,-3.0] [-31.0,-0.5] [-31.0,2.0] [-34.0,5.0] [-35.5,4.0] [-35.0,3.0]
ford:     [-6.0,-18.5] [-3.0,-19.0] [-2.0,-20.0] [-2.0,-24.5] [-1.0,-25.5] [-3.0,-27.5] [-4.5,-27.5]
far:      [-8.0,-28.5] [-4.0,-29.0] [-2.5,-30.5] [1.5,-30.5] [4.5,-33.5] [9.5,-33.5] [13.5,-35.0] [26.0,-35.0]
bridge-s: [26.0,-35.0] [16.5,-25.5] [16.5,-23.5]
bridge-n: [16.5,-14.5] [14.0,-11.5] [14.0,-9.0] [15.5,-7.5]
fold:     [28.0,20.0] [38.5,30.5] [40.0,33.0]
```

**The green** — ten-sided, the residual inside the fork of the street, the millway and the fold lane:
`[16,-6.5] [14.5,3] [13,12] [10.5,20] [11.5,24.5] [21,25.5] [30.5,20] [32,6] [28.5,-4] [21.5,-8]`
**525 m² = 0.125 ha** at real-world scale (shipped 204 m² = 0.049 ha). Mean slope 10.9°, relief 4.53 m across it.

Furniture and buildings, each sited by scanning for the flattest footing ring clear of every pad, mound and the water:

| | position | footing fall | slope | nearest mound |
|---|---|---|---|---|
| `INN` | (20.50, −1.25), yaw 78° (N·L 0.594) | 0.075 m | 0.17° | 7.42 m |
| `WELL` | (17.25, 10.25) | 0.026 m | 0.94° | 6.64 m |
| `POND` | (29.50, 0.00) | 0.086 m | 0.28° | 15.85 m |
| `OAK` | (26.00, 20.25) | 0.026 m | 0.12° | 16.85 m |
| `POUND` | (17.00, −10.25) | 0.115 m | 1.23° | 11.11 m |
| `MILL` | (−27.40, −20.80) **unchanged**, ground slope 0.0°, 6.29 m from the channel | | | |
| `WHEEL` / `FORD` / `BRIDGE` | **unchanged** | | | |
| `SPAWN` | (18.75, 9.25), ground −0.53, slope 1.25°; `CameraRig` yaw = 288° | | | |

Tree clearings replace `TREE_CLEARING_RADIUS` — one disc per focus, max reach 75.7 m, all inside `RIM_START·R`:
`knot (4.7, 14.7) r 27 · higher (−28.7, 45.4) r 22 · water (6.1, −36.9) r 31 · mill (−34.8, −6.5) r 21 · fold (43.1, 36.7) r 14`

---

# 2. INDEPENDENT VERIFICATION

Replica bit-exactness first: `parity.mjs` → `valleyFloor` max |Δ| **0.000e+0**, `groundHeight` max |Δ| **0.000e+0** over 40 000 samples with the landform off and the shipped pads on.

## 2.1 Every dwelling: rise and slope across its own footprint

`bank` = **bare** ground (no pads, no mounds) at the back of the footprint minus bare ground at the threshold, along the door axis. The arch needs `DOOR_TOP 1.62 + FACE_CLEARANCE 0.55 = 2.170 m`.

| id | focus | perch | r | facing | N·L | **bank** | **natural grad** | % of arch | hill share | nearest gap |
|---|---|---|---|---|---|---|---|---|---|---|
| burrow-1 | knot | 6 | 3.71 | 40.5 | 0.615 | **3.14** | **25.4°** | 145 % | 90 % | 2.07 |
| burrow-2 | knot | 3 | 2.95 | 40.7 | 0.616 | **2.45** | 27.1° | 113 % | 88 % | 1.73 |
| burrow-3 | knot | 4 | 3.14 | 75.5 | 0.604 | **2.86** | 28.5° | 132 % | 97 % | 1.73 |
| burrow-4 | knot | 8 | 3.52 | 79.7 | 0.587 | **3.10** | 26.6° | 143 % | 94 % | 3.18 |
| burrow-5 | higher | 4 | 3.52 | 60.0 | 0.638 | **2.58** | 22.6° | 119 % | 78 % | 1.65 |
| burrow-6 | higher | 2.5 | 2.95 | 65.5 | 0.631 | **2.31** | 25.8° | 106 % | 83 % | 1.65 |
| burrow-7 | higher | 5 | 3.14 | 6.3 | 0.411 | **2.40** | 24.5° | 111 % | 81 % | 3.11 |
| burrow-8 | water | 3 | 3.33 | 33.8 | 0.591 | **2.94** | 27.2° | 136 % | 94 % | 1.57 |
| burrow-9 | water | 2.5 | 2.95 | 9.6 | 0.439 | **2.70** | 29.5° | 125 % | 98 % | 1.57 |
| burrow-10 | water | 4 | 3.14 | 6.3 | 0.411 | **2.96** | 29.3° | 136 % | 100 % | 2.22 |
| burrow-11 | water | 6 | 3.52 | 33.6 | 0.590 | **2.63** | 23.1° | 121 % | 79 % | 8.20 |
| burrow-12 | mill | 5 | 3.33 | 87.6 | 0.547 | **2.38** | 22.6° | 110 % | 76 % | 1.79 |
| burrow-13 | mill | 2.5 | 2.95 | 85.6 | 0.558 | **2.45** | 27.1° | 113 % | 88 % | 1.69 |
| burrow-14 | mill | 3 | 3.14 | 66.4 | 0.630 | **2.49** | 25.3° | 115 % | 84 % | 1.69 |
| burrow-15 | fold | 6 | 3.52 | 85.7 | 0.557 | **3.20** | 27.4° | 148 % | 97 % | 36.43 |

**bank min 2.31, mean 2.71, max 3.20. All fifteen exceed the arch. Hill share of the mound's own silhouette: 76–100 %, mean 88 %.** Today: mean bank 0.30 m, six of fifteen leaning the *wrong* way, hill share 0.7 %.

**All fifteen façades are lit** — minimum N·L 0.411 against the toon shadow step at 0.3333, with the sun byte-identical to what ships. Today ten of fifteen sit on the shadow step.

`checkFits` passes: min arch **2.17** (needs 1.62), min half-width **2.31** (needs 1.05).

## 2.2 Clearances

```
closest five mound gaps:  8/9 1.57   5/6 1.65   13/14 1.69   2/3 1.73   12/13 1.79
nearest neighbour: within focus 8.72 m,  between foci 36.45 m   ->  ratio 4.18
nearest-neighbour spread over all fifteen: mean 11.02 m, CV 0.794
frontage classes {2.5, 3, 4, 5, 6, 8} perch, CV 0.372   (shipped ring 0.082)
door bearings 6.3 .. 87.6 deg
```
No mound touches the channel carve; the closest mound edge is 6.51 m from the channel axis.

## 2.3 The rim — 3600 bearings, 0.25 m march r = 95…145, threshold 50°, longest contiguous run

```
leaks (< 12 m): 0     thinnest 12.25 m at bearing 170.3     p1 12.50   median 13.25   max 14.00
```
**Identical to shipped**, and by construction rather than by tuning: every scarp is exactly zero beyond `|centre| + half + toe + wobble + SCARP_WOBBLE`, which is 58.6 / 65.9 / 85.4 / 93.4 / 95.5 / 99.4 m against `RIM_START·VALLEY_RADIUS = 104.96`.

## 2.4 The built surface

| | shipped | proposal |
|---|---|---|
| relief inside the rim | 4.36 m | **12.4 m** (bare landform 10.5 m) |
| mean slope, r ≤ 104 | 4.3° | 7.22° |
| p90 / p99 | 5.9 / 49.3° | 23.6 / 32.7° |
| > 26° (`GROUND_DIRT_SLOPE`) | 2.0 % | 7.76 % |
| > 30° (`TREE_MAX_SLOPE`) | 1.8 % | 2.83 % |
| > 38° (`VEGETATION_MAX_SLOPE`) | 1.5 % | **0.112 %** |
| > 50° (`MAX_SLOPE`), 1 m grid | 0.99 % | **0.006 %** |
| **terrain triangles over `MAX_SLOPE` as the BVH sees them, r ≤ 102** | **0** (max 39.85°) | **23 of 147 022** (max 54.13° at −34.0, −2.7) |

The bare landform, before any pad: max 46.7°, **0 % over `MAX_SLOPE`**, 0.027 % over 38°.

## 2.5 Water and machinery

```
ford   (-0.40, -22.07)  ground -1.24   slope 0.6
bridge x = 16.5:  north -0.53  south -0.26   asymmetry 0.262   (BRIDGE_HUMP 0.45)  PASS
mill   (-27.40, -20.80) ground +0.26   slope 0.0   6.29 m from the channel
wheel  (-27.40, -25.70) bed -1.31  axle +0.04  water surface -0.72  float dip 0.443 m
                        (shipped: bed -2.14, axle -0.79, dip 0.622 m)
```

## 2.6 Walk times (3D path along the ground, `WALK_SPEED` 1.6 / `RUN_SPEED` 3.6)

| leg | ground | walk | run |
|---|---|---|---|
| the street, end to end | 39 m | 25 s | 11 s |
| knot → higher end | 90 m | 56 s | 25 s |
| knot → the mill | 52 m | 33 s | 14 s |
| **the loop: green → bridge → far bank → ford → mill lane → green** | **127 m** | **79 s** | 35 s |
| green → the fold | 18 m | 11 s | 5 s |
| whole lane network walked once | 304 m | **3.16 min** | 1.41 min |
| **rim to rim, mean of 8 diameters** | 225 m | **2.34 min** | 63 s |

Farthest pair of dwellings 108 m. The five-minute rule is not threatened from either side.

## 2.7 What the player sees at load

Spawn (18.75, 9.25) on the green, camera bearing 288°, half-field 42.8° at `CAMERA_FOV 55` and 16:9.

| in frame | off-axis | distance | crown above eye | apparent | door readable |
|---|---|---|---|---|---|
| burrow-3 | −2.8° | 11.5 m | 3.25 m | **15.8°** | yes |
| burrow-2 | +14.0° | 18.1 m | 3.37 m | **10.6°** | yes |
| burrow-1 | +18.3° | 26.6 m | 4.48 m | 9.6° | yes |
| burrow-7 | +17.8° | 51.0 m | 3.84 m | 4.3° | no |
| burrow-14 | −42.3° | 53.8 m | 4.75 m | 5.0° | yes |
| burrow-13 | −34.4° | 55.8 m | 5.61 m | 5.7° | yes |
| burrow-12 | −27.0° | 58.9 m | 7.98 m | 7.7° | yes |
| burrow-6 | +19.8° | 60.0 m | 3.39 m | 3.2° | yes |
| burrow-5 | +20.0° | 68.1 m | 5.92 m | 5.0° | yes |

Ground straight ahead: **−0.53, +0.13, 2.94, 4.24, 4.20, 4.80, 5.06, 6.13, 6.88, 6.80, 5.82 m** out to 80 m.

Staging, on the same occlusion harness the play judge used (terrain + mound domes, eye at ground + 1.4 m):
**valley floor visible from spawn, r ≤ 65: 39.0 %** (A 54.1, C 66.2, B 87.5). **Doors visible from the spawn point over all 360°: 5 of 15** (A 12, C 14, B 15).

---

# 3. THE THREE DEFECTS I COULD NOT FIX

### 1. Twenty-three terrain triangles stand over `MAX_SLOPE` on the platform seams. The shipped world has none.

Max 54.13° at (−34.0, −2.7). All of them are the revetment between two adjoining platforms whose pad bases differ — on a 27° bank, two neighbours 8 m apart at set-backs 4 m apart stand 2 m apart in level, and the `burrowGround` closeness blend releases that over the `PAD_FADE`. I attacked this four ways and none reached zero: a **24-variant deterministic search** of the seat solver (best 15, worst 61, chosen variant 23); an **8-point pad sweep** (`PAD_FADE` 3.0→6.0, `PAD_SIDE_FADE` 1.5→6.0, lateral limit on and off); a **constraint on neighbouring set-backs** (`MAX_STEP` 1.0…3.0, which made it *worse* by displacing seats to worse ground); and dropping the smallest mound class. The honest diagnosis: this is not a tuning problem, it is that `burrowGround` has no slope ceiling. The fix is a real one — clamp the gradient of the blended pad surface, or blend platform *levels* along the row before blending them into the floor — and it is new mechanism, not a constant. Consequence in play: about 10 m² of ground the player slides off, every square metre of it behind or beside a façade, none of it on a lane or a door spur (worst door approach 29.3°, worst lane grade 29.7°).

### 2. The mill floor rises 1.32 m and the wheel's relation to the mill changes; the wheel constants need re-checking by eye.

The `shoulder`'s skirt reaches the mill (27.8 m from its crest segment against `toe 38`) and lifts the mill site from −1.06 to +0.26. The wheel bed rises only 0.83 m, so: float dip falls **0.622 → 0.443 m** (still wet, and `WHEEL_BED_CLEARANCE 0.15` holds by construction since the axle is set from the scanned bed), but the axle moves from **0.27 m above** the mill floor to **0.22 m below** it — a 0.49 m change in where the shaft enters the wall, which `Buildings.ts:58` places the bearing blocks against. I know the one-line fix (`shoulder.toe` 38 → 27 puts the mill outside its reach entirely, and the higher end still gets 3.06 m of lift instead of 3.7), but taking it re-runs the seat solver and invalidates every number above, so I did not take it inside this session. It is the first thing I would do on day one, followed by a full re-verify.

### 3. Within a focus the spacing is still nearly regular, and the higher end has no lane under the repo's own 26° rule.

Spacing CV by focus: knot 0.236, water 0.154, mill 0.122, higher **0.013**. That is better than the shipped ring's 0.256 only in the sense that the *whole-settlement* nearest-neighbour CV is 0.794 and the between-focus/within-focus ratio is 4.18 — the polyfocal claim holds, the within-row claim does not. This is C's admitted flaw and it is **not** the cheap fix C said it was: only the stretch of each bank between about 24° and 29° can bury 2.17 m over a 4.8–6.6 m footprint, and that stretch measures 21–45 m. Four mounds averaging 6.6 m across in 45 m of usable bank is 59 % occupancy with roughly 2 m of slack in total — there is no room left to vary the gaps, whatever the frontages do. The same arithmetic produces the second half of this defect: with slope capped at 26° the router finds **no route at all** to the higher end, and at 30° the best is 54 m of hollow way peaking at **29.7°**. The bank that makes a dwelling possible is the bank that makes the lane impossible. Two smaller blemishes of the same origin: burrow-7 and burrow-10 both sit at facing 6.3° because both were clamped to the same edge of the lit band, so two doors point identically; and the green averages 10.9° of slope with 4.53 m of relief across it, which is a green on a valley side rather than a level one.

---

# 4. BUILD ORDER

**Step 0 — `shoulder.toe` 38 → 27, then re-run `solve.mjs` and `verify.mjs`.** Defect 2 is the only one that touches machinery the repo already has acceptance tests for. Do it before anything is typed into the repo, and re-emit the fifteen rows from the generator. Everything downstream of this document then re-derives.

**Step 1 — the two pad changes alone, on the shipped ring, on the shipped terrain.** `faceOf` base at the face point; directional + laterally limited `padWeight` with the squared early-out; `PAD_MARGIN` 3.6 → 1.0, `PAD_FADE` 2.6 → 4.0. This is a pure win with no landform: it removes the omnidirectional 14 m disc, and it is what makes any terrain work visible at all. *Re-derives free:* `heightfield` `FACES`/`PADS`/`burrowGround`, all of `world/burrow/{build,mesh}`, `groundColor` path wear. *Verify:* the ring's own bank stays 0.30 m (the point is that nothing gets worse), the rim run stays 12.25 m, startup does not regress.

**Step 2 — `src/config/scarps.ts`, `scarpAt`, `waterGuard`, and `valleyFloor`'s new term. Keep the shipped fifteen where they are.** The world now has 10.5 m of interior relief and the ring sits on it wrongly — that is expected and it is the moment to check the rim (0 leaks, 12.25 m), the bare-slope census (0 % over `MAX_SLOPE`), the ford, both bridge landings, the mill and the wheel. *Re-derives free:* nothing else in the repo reads the landform. *Stop here if the rim moves at all.*

**Step 3 — `Burrow.facing`, `doorFacing()`, and the fifteen rows.** Delete the four copies of `Math.atan2(-x, -z)` in `lanes.ts:102`, `work.ts:78`, `profile.ts:84`, `profile.ts:94`. *Re-derives free:* `checkFits` (min arch 2.17, min half-width 2.31 — it throws at startup if a row is wrong), `lanes.doorSpurs()` once it reads `burrow.facing` and its far-bank corner-turn branch is deleted, all of `config/villagers.ts` (nothing is keyed on a burrow id), `Obstacles`, `Smoke`, `Village` wiring. *Verify:* the §2.1 table.

**Step 4 — `lanes.ts`, `green.ts`, `buildings.ts` (`INN` only), `SPAWN_X/Z`, `CameraRig.yaw`.** All data. `MILL`, `WHEEL_*`, `FORD_*`, `BRIDGE_*` are untouched. *Re-derives free:* `groundColor` wear, `BUILDING_PADS`, `hedges.gatesFor/trim/allHedges`, the hedgerow-tree walker. *Verify:* §2.6 walk times and the lane table.

**Step 5 — the two rewrites that are not re-fits.** `config/hedges.ts`: `ringSeats()` (neighbour = next bearing about the origin), `ringGap()` (exactly one wide opening), `toftBoundaries()` (a radial ray, r 22.6→42) and `croftRear()` (a circle at r = 42) are all ring ideas and all die. A toft boundary becomes the fall line at a plot edge — from the frontage to the crest of its own bank, in that bank's `(u, q)` frame; a croft rear becomes an offset of the back lane's polyline. `INN_SEAT`, the unlinked second copy of the inn's coordinates, is deleted and imported from `buildings.ts`. `world/Vegetation.ts:248`: `TREE_CLEARING_RADIUS` becomes the five clearing discs of §1.5.

**Step 6 — `config/work.ts`.** Fifteen work points and fifteen props re-cleared against the new hedges and lanes. This is last because its failure mode is silent: nothing throws, a sawhorse just ends up inside a hedge.

**`docs/VILLAGE.md`** — line 503 (*"Nothing is deleted from the world. `config/burrows.ts` is not touched."*) and line 592's cut-list entry are the two sentences this reverses; lines 44, 46, 50, 170–176, 193–194, 215–224, 245, 278–308, 356, 455, 488, 505, 517, 585, 590, 594 are ring-keyed, and the r = 32 / `TREE_CLEARING_RADIUS 34` versus r = 42 / 46 contradiction between them has to be reconciled either way.