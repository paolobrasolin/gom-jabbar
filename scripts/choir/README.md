# CHOIR body map polygons

The four CSV files are the segment polygons of the CHOIR body map (Collaborative Health Outcomes
Information Registry, Stanford), female and male silhouettes, front and back, as shipped in the
CHOIRBM R package by Eric Cramer (MIT, https://github.com/emcramer/CHOIRBM, `R/sysdata.rda`).
Columns: `id` (the CHOIR segment code, 101–136 front, 201–238 back), `x`, `y` in the package's
own units (about 270 × 570, y down). The male and female maps have identical segmentation but
number the abdomen and arm segments 112–117 in a different order (their `convert_bodymap`).

The instrument: Scherrer KH et al., "Development and validation of the Collaborative Health
Outcomes Information Registry body map", PAIN Reports 2021;6(1):e880. The package:
Cramer E et al., PLOS Computational Biology 2022.

`node scripts/choir.mjs` reads them and writes `src/lib/figures.ts`.
