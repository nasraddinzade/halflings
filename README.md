# halflings

A browser 3D game: a walk through a halfling village. A closed valley,
burrows dug into hills with round doors, a river, thirty villagers each
with their own occupation. No combat, no inventory.

The goal is a showcase of 3D web skills. The priority is the picture and
smooth framerate, not the amount of content: better a small world that
looks expensive than a big empty one.

## Stack

Vite + TypeScript in strict mode, three.js with no wrappers,
`three-mesh-bvh` for terrain collision. There is no backend, everything
is served as static files. The only runtime dependencies are three and BVH.

## Running it

```bash
npm install && npm run dev
```

Clicking the window captures the mouse. WASD to walk, Shift to run,
Space to jump, Esc to release the mouse.

## What's inside

**The valley.** The terrain comes from a deterministic height function,
with no `Math.random`: a bowl with a flat middle for the village, hills,
and a steep rim along the edge. The rim is steeper than the maximum
climbable angle, so the world border holds by itself — no invisible
walls. The ring was checked numerically for gaps along 3600 directions.

**Villagers.** They are assembled from parts of six different characters
of a CC0 pack onto a shared skeleton and merged into a single
`SkinnedMesh` — otherwise each one would cost six draw calls. Looks,
clothing and habits are derived from the name, so the village is the same
between runs. Occupations are an `idle → move → work` state machine, and
the workplaces are defined by data.

**Coloring.** A cell of the pack's texture atlas is treated as a material
zone: the colors are read out of it at load time and pulled to the nearest
tones of the project palette. The split into zones stays the author's, the
colors are ours. Only clothing changes; skin and eyes are the same for
everyone.

**Style.** A toon shader with three lighting steps and an inverted hull
outline, inflated along the smoothed normal. One palette for the whole
project: no asset brings colors of its own.

**Performance.** 120 fps with thirty villagers, eleven hundred trees and
thirty thousand grass tufts; 70–120 draw calls per frame. Vegetation is
instanced per chunk, distant villagers lose their outline and animation
rate, and past 95 m are not drawn at all.

A detailed walkthrough of the decisions is in [CLAUDE.md](CLAUDE.md), the
asset catalog with measurements is in [docs/ASSETS.md](docs/ASSETS.md),
and the work plan is in [docs/PROMPTS.md](docs/PROMPTS.md).

## Assets

Characters and animations are [KayKit](https://kaylousberg.com) by Kay
Lousberg, licensed CC0. The source packs are not part of the repository:
the files that are needed were deliberately copied into `assets/`.
Everything else — terrain, water, vegetation, burrow doors, tools — is
geometry built by code.

`assets/` currently holds 3.85 MB, or 1.19 MB over the wire under brotli.

Two tools bring the pack files into working shape. The first cuts the
mannequin mesh out of the animation files, since it has nothing to do in
the game. The second compresses them with `EXT_meshopt_compression`; it
deliberately leaves the characters alone, because quantization breaks
merging parts onto a shared skeleton.

```bash
npm run assets
```

Both need the unpacked packs in the project root. Each one verifies its
result against the source by clip names, durations and bones, and refuses
to write the file if anything diverged.

## About the names

The project is inspired by Tolkien's Shire, but names from the legendarium
are protected by trademarks and are not used in the repository. Neutral
ones are used instead: `halfling`, `village`, `valley`, `river`.
