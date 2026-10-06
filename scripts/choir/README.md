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

Licences: the package is MIT (`LICENSE.md` here, fetched from the package's repository, "Copyright (c) 2021 Eric Cramer"), and its DESCRIPTION and CRAN page name "Stanford University School of Medicine" as copyright holder (`cph`) and funder. The polygons were not drawn for the package: they are, point for point, the click regions of the CHOIR body map image in the REDCap Image Map module (github.com/ctsit/imagemap, `maps/choirbodymap_*.html`; the back figures shifted by a constant), whose README says the map "was devised by Dr. Ming-Chih J Kao and Professor Sean Mackey at Stanford University as part of CHOIR" and that use of its images "requires that the CHOIR attribution remains intact". So the outlines are Stanford's, released under MIT in a package that names Stanford, by authors who include Kao and Mackey (Cramer, Ziadni, Scherrer, Mackey, Kao, PLOS Computational Biology 2022). The validation paper (Scherrer et al., PAIN Reports 2021) is open access under CC BY-NC-ND 4.0; that licence covers the article, its text and figures as published, which the app does not reproduce. The app credits CHOIR, the map's authors, Stanford and both papers in `open-source-licences.html` (`choirNotice` in `src/build/notices.ts`, #121).
