# Software validation — September 13, 2026

## Passed

- TypeScript strict type-check and production Vite build.
- Automated tests covering deck syntax and quantity limits, pagination, mixed and uniform rotated placement, non-overlap across supported settings, raster rounding tolerance, PNG density metadata, imported-project validation, and captured-template recognition.
- Live Scryfall collection import with valid and invalid card names. Successfully imported entries are removed from the retry list; missing entries stay editable.
- Live variant lookup (136 Sol Ring printings), printing selection, and restoration after reload.
- Double-faced card import and selection of Insectile Aberration.
- Multi-sheet ZIP download, exact PNG pixel dimensions, opaque card interiors, transparent gaps/corners, and SVG shape counts/dimensions.
- Local artwork import, including an image with a transparent interior hole. The exported card remains opaque inside its outer cut silhouette.
- 600 DPI rotated local-artwork export: expected 4228 × 3047 pixels for the tested layout, correct rotation direction, and transparent gaps.
- Empty-project export disabled; project JSON backup opens and restores card quantities and selected printings.
- Visual review at desktop and 390 px mobile widths, with no horizontal page overflow at mobile width.
- Unsigned macOS arm64 package builds. Packaged app launches with context isolation, renderer sandboxing, and no renderer Node access. Native size-check and local-artwork exports succeed with no renderer exceptions.
- npm dependency audit reports zero known vulnerabilities for the installed dependency set.
- Experimental seven-card geometry: the current 189.5 × 214.5 mm 2–3–2 template paginates at seven cards, preserves fixed slot positions, and is restricted to 63 × 88 mm cards, 0.25 mm spacing, US Letter output, and Maker/Explore targets.
- A user-supplied Design Space capture of the preceding 0.1 mm-gap template was confirmed as a single, unrotated 612 × 792 point US Letter PDF. Its rendered magenta 2–3–2 pattern passed the production detector at 300 DPI with all four surrounding marks present. The 0.25 mm-gap revision still requires a new capture.

Browser checks caught a local-image bug: fetching a data URL was blocked by the renderer CSP. The final export code directly decodes embedded artwork without making a fetch request. The fixed browser export was validated at pixel level.

## Still requires external validation

- Actual Cricut sensor acquisition, Design Space contour tracing, physical scale, alignment, and repeatability.
- Acceptance of the experimental expanded layout on each model/paper configuration.
- Seven-card sensor acquisition, physical dimensions, edge alignment, 12 × 24 in mat behavior, and repeatability after the Tabloid-to-Letter print workaround.
- Windows and Linux installer builds and runtime checks.
- macOS signing/notarization for distribution.

Follow [the physical acceptance procedure](CRICUT-WORKFLOW.md) before producing a full deck. No software test here certifies perfect machine alignment or reproduces Cricut's registration marks.

Local screenshots and test export artifacts are in `output/playwright/` (ignored from source control). The desktop build is in `release/mac-arm64/CriProx.app`.
