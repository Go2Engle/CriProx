# Software validation — September 20, 2026

## Passed

- TypeScript strict type-check and production Vite build.
- Automated tests covering deck syntax and quantity limits, pagination, mixed and uniform rotated placement, non-overlap across supported settings, raster rounding tolerance, PNG density metadata, imported-project validation, and captured-template recognition.
- Live Scryfall collection import with valid and invalid card names. Successfully imported entries are removed from the retry list; missing entries stay editable.
- Live Archidekt import of a 100-card public deck, preserving all 94 selected printings, plus a live Moxfield response through Electron's constrained deck-source bridge.
- Single-card Scryfall search with partial names and repeated additions.
- Live variant lookup (136 Sol Ring printings), printing selection, and restoration after reload.
- Double-faced card import and selection of Insectile Aberration.
- Multi-sheet ZIP download, exact PNG pixel dimensions, opaque card interiors, transparent gaps/corners, and SVG shape counts/dimensions.
- Local artwork import, including an image with a transparent interior hole. The exported card remains opaque inside its outer cut silhouette.
- 600 DPI rotated local-artwork export: expected 4228 × 3047 pixels for the tested layout, correct rotation direction, and transparent gaps.
- Empty-project export disabled; project JSON backup opens and restores card quantities and selected printings.
- Visual review at desktop and 390 px mobile widths, with no horizontal page overflow at mobile width.
- Unsigned macOS arm64 package builds. Packaged app launches with context isolation, renderer sandboxing, and no renderer Node access. Native size-check and local-artwork exports succeed with no renderer exceptions.
- npm dependency audit reports zero known vulnerabilities for the installed dependency set.
- Experimental seven-card geometry: the 189.2 × 214.2 mm 2–3–2 template paginates at seven cards, preserves fixed slot positions, and is restricted to 63 × 88 mm cards, 0.1 mm spacing, US Letter output, and Maker/Explore targets.
- Experimental eight-card geometry: the 177 × 255 mm 2×4 template paginates at eight horizontal cards, preserves fixed slot positions, and is restricted to 63 × 88 mm cards, 1 mm spacing, US Letter output, and Maker/Explore targets.
- Manual nine-card geometry: the 191 × 266 mm 3×3 template paginates at nine cards, preserves all
  slot coordinates on partial pages, and is restricted to 63 × 88 mm cards, 1 mm spacing, and
  2.5 mm corners. Front and mirrored back placement use the same tested 6.35 mm nominal page inset;
  signed X/Y cut corrections preserve back mirroring while shifting only printed artwork.
- Browser generation of a 2256 × 3142 px transparent Basic Cut PNG at 300 DPI, with nine opaque
  rounded silhouettes and transparent gutters, plus a matching one-page Letter PDF preview.
- Manual calibration and production card PDFs share the same raster sheet, bleed padding, PDF image
  bounds, and first-slot trim origin. A 600 DPI rendered placement proof located the production trim
  origin within one raster pixel of the nominal 6.35 mm page coordinate.
- A user-supplied Design Space capture was confirmed as a single, unrotated 612 × 792 point US Letter PDF. Its rendered magenta 2–3–2 pattern passed the production detector at 300 DPI with all four surrounding marks present.
- A user-supplied eight-card Design Space capture of the earlier 0.1 mm-gap layout was confirmed as a single, unrotated 792 × 1224 point Tabloid PDF. The production pattern and mark checks passed at 300 DPI. Its 7.63 × 10.63 in printed footprint was translated at actual size into a 612 × 792 point Letter output proof with all visible content intact and at least 0.19 in clearance vertically. The revised 1 mm-gap layout needs a new capture and fit check.

Browser checks caught a local-image bug: fetching a data URL was blocked by the renderer CSP. The final export code directly decodes embedded artwork without making a fetch request. The fixed browser export was validated at pixel level.

## Still requires external validation

- Actual Cricut sensor acquisition, Design Space contour tracing, physical scale, alignment, and repeatability.
- Acceptance of the experimental six-card layout on each model/paper configuration, including the Tabloid-to-Letter print workaround for Letter output.
- Seven-card sensor acquisition, physical dimensions, edge alignment, 12 × 24 in mat behavior, and repeatability after the Tabloid-to-Letter print workaround.
- Eight-card printer imageable-area fit, sensor acquisition, physical dimensions, edge alignment, mat behavior, and repeatability after Tabloid capture and Letter export.
- A first nine-card Basic Cut trial completed with matching scale and a small, consistent-looking
  up/left translation. Exact correction and repeatability across multiple page placements and mat
  loads still require measurement.
- Windows and Linux installer builds and runtime checks.
- macOS signing/notarization for distribution.

Follow [the physical acceptance procedure](CRICUT-WORKFLOW.md) before producing a full deck. No software test here certifies perfect machine alignment or reproduces Cricut's registration marks.

Local screenshots and test export artifacts are in `output/playwright/` (ignored from source control). The desktop build is in `release/mac-arm64/CriProx.app`.
