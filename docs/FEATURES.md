# CriProx feature reference

## Card and artwork sources

- Import a public or unlisted Moxfield or Archidekt deck link, preserving selected printings when available.
- Paste a deck list and resolve cards through Scryfall.
- Search the Scryfall card catalog by full or partial name and add cards one at a time.
- Choose **Find a card → Browse sets** to browse all paper sets, including token and supplemental
  sets. Filter by set name or code, and list sets newest first or alphabetically.
- Browse every available printing in a selected set, sorted by collector number, name, color,
  rarity, mana value, or artist in ascending or descending order. Sorting applies to the entire set;
  **Load more cards** continues in that order. Adding a card keeps the chosen printing, and repeat
  additions increase its quantity without replacing other printings of the same card.
- Start with four example Scryfall card records in a new workspace.
- Search loaded cards and filter printings by set and collector number.
- Select either face of a double-faced card from the inspector.
- Search MPC Autofill community artwork and browse its dedicated card-back collection.
- Trim MPC Autofill's native print bleed from fronts and card backs so the finished-card area fills
  the 63 × 88 mm cut; when output bleed is enabled, reuse the source artwork outside that trim.
- Import local PNG, JPEG, or WebP artwork up to 20 MB per file.
- Detect MPC-style print-canvas proportions in uploaded fronts, reverse faces, and shared card backs,
  with a per-face toggle to correct the suggestion when custom artwork uses a different layout.
- Keep the complete card interior opaque, even when the source image contains transparent pixels.

Deck-list requests are batched in groups of at most 75 unique identifiers. Request starts are serialized with at least 120 ms between them and at least 500 ms between card-search requests, and a `429` response stops the operation instead of continuing to pressure the service.

## Sheet design

- Standard 63 × 88 mm card dimensions with a 2.5 mm corner radius.
- 1 mm spacing in the standard layout profiles.
- US Letter and A4 planning modes.
- Millimeter-based placement and vector geometry shared by preview and export.
- Print-sheet preview with captured Cricut registration marks when available, sheet pagination,
  and zoom controls.
- 300, 600, 900, and 1200 DPI output.
- Optional playtest label along the bottom edge.
- Size-check card with a 5 mm measurement grid.

The selected DPI controls export density; it cannot add detail absent from the source image. The 900 and 1200 DPI modes are intended for high-resolution MPC Autofill or custom artwork and use substantially more memory.

The print PDF dialog also offers **Upscale Scryfall card images (high detail)**. It is off by default and applies only when preparing card sheets, including matching reverse faces. You can choose the built-in 4× ESRGAN Thick engine, which downloads a ~28 MB model from a package CDN, or an installed [Upscayl desktop app](https://upscayl.org/download). The Upscayl option uses **Ultramix (Non-Commercial)** at 4× and appears when CriProx finds its bundled command line engine and Ultramix model in a common installation location. The Ultramix model is marked for non-commercial use by Upscayl. CriProx passes temporary PNG files to the engine and deletes them after processing; the work remains local. Enhanced images are cached separately by engine and model version. Choose 600 DPI or higher in Sheet setup to retain the extra detail in the PDF. MPC Autofill and uploaded artwork keep their original pixels. The original Scryfall image remains available by turning the option off. Upscaling can take much longer than a standard export and may change fine text or illustrated detail, so inspect the PDF before printing. Upscayl requires a compatible GPU. Size-check and alignment pages do not run either engine.

## Export packages

A normal export can include:

- Transparent artwork PNGs with one opaque, rounded silhouette per card.
- Matched vector-only SVG silhouettes with the same size, origin, positions, rotation, and corner radii.
- A dimensions manifest for exact Design Space canvas sizing.
- A plain-text Design Space handoff guide.
- A ZIP containing multiple sheet outputs.

PNG physical-density metadata is included. Pixel rounding is limited to at most half a pixel per overall dimension—about 0.042 mm at 300 DPI—but downstream tracing, printer scaling, paper feed, cutter calibration, and material behavior introduce their own error.

The SVG is a geometry reference or a separate Basic Cut template. It is not a registration mechanism. Enabling its paths together with the PNG's traced contours can create duplicate cuts.

## Registered printing

CriProx can import a one-page PDF captured from Design Space, recognize the surrounding marks, and place current artwork into that template without changing the saved cut geometry.

- Front and back bleed are independent toggles.
- Front bleed and the bleed between card backs are fixed at 0.5 mm for six-card and eight-card sheets and
  0.05 mm for seven-card sheets. Back sheets extend artwork 1.5 mm past exposed outside edges to
  hide small front-to-back alignment shifts.
- The captured PDF must correspond to the exact saved Design Space cut job.
- The desktop app stores verified six-cut, seven-cut, and eight-cut captures as PDFs at the root of the selected
  CriProx project library and loads them automatically whenever their exact cut geometry is selected.
  Existing captures in local app storage are copied into the library on first use.
- CriProx preserves captured marks; it does not generate or imitate them.
- CriProx saves the finished PDF instead of printing it through the browser, which would rasterize
  and reduce higher-resolution output. Print the saved file from a dedicated PDF application at
  100% / Actual size with fit-to-page disabled.

See [Cricut workflow and physical validation](CRICUT-WORKFLOW.md) for the complete setup and reuse procedure.

## Manual nine-card cutting

Choosing **Manual cutting** in the machine menu automatically selects the nine-card layout. The
portrait Letter or A4 PDF centers the nine-card block. The sheet editor previews configurable
vector guides before PDF generation: separate card and page colors, stroke width, placement, card corner or full outlines,
solid or dashed lines, square or round corners, corner-guide length, and page-edge or full-page
cut lines. Guides can also be disabled. Front PDFs use the same geometry as the preview; back
pages remain artwork-only. Print at 100% / Actual size and check one card with a ruler before
cutting a full sheet.

For registered Cricut layouts, the sheet editor shows the saved Design Space page and places cards
at the same origin used by PDF export. Partial sheets keep the full layout's occupied-slot positions.
The eight-card preview applies the same Tabloid-to-Letter or Tabloid-to-A4 translation as export. Before a matching
capture is available, the editor shows approximate marks.

For Cricut machines, the existing experimental manual alignment profile uses the same nine-card
geometry with a separate Basic Cut file:

The experimental manual profile fits nine fixed 63 × 88 mm cards in a 191 × 266 mm 3×3 block
with 1 mm gutters. It produces:

- Portrait Letter or A4 print PDFs with the artwork block nominally 6.35 mm (0.25 in) from the top
  and left before physical calibration.
- One transparent 300 DPI PNG containing the same nine rounded silhouettes for Basic Cut.
- Fixed slot positions on partial pages, allowing one saved Design Space cut project to serve every
  page in a deck.
- Saved horizontal and vertical physical-cut corrections from -5 mm to +5 mm. Corrections shift the
  print PDF in the opposite direction, so the Basic Cut PNG and saved Design Space project stay fixed.
- A plain-paper calibration PDF with 1 mm measurement grids around the top-left card. The guided
  controls convert the observed blade-line direction and square count into the required correction.
- Matching manual-refeed or duplex back pages when card backs are enabled.

This mode uses no sensor marks. The printed page must be placed flush to the upper-left of the mat's
adhesive grid, while the Basic Cut group starts at the first 0.25 in inset in Design Space's Prepare
preview. Printer scaling, page placement, mat loading, and machine repeatability remain physical error
sources, so this mode requires a measured plain-paper test.

## Card backs and duplex output

Card backs are optional and disabled by default. Selecting a double-sided card shows a warning while
backs are disabled. When backs are enabled, each double-sided card automatically uses the face opposite
its selected front in the matching mirrored back position. A shared back is used only for single-sided
cards, including on a mixed sheet. Back pages can be exported as:

- Separate front and back PDFs for manual refeed.
- Alternating duplex pages.
- Long-edge or short-edge orientation.
- X/Y alignment offsets for a repeatable printer shift.

Back pages contain artwork only. Alignment controls can compensate for a consistent offset, but not irregular feed variation from sheet to sheet.

## Local projects and caching

- One autosaved workspace stored in IndexedDB.
- A dedicated Settings area for appearance, the project library location, and user-defined new-project
  defaults. Defaults include every sheet, print, back-side, and alignment setting plus optional shared
  card-back artwork.
- Manual cut guide options can be edited in Settings and saved as defaults. The sheet editor also has
  a guide-only Save as defaults button below Page cut guides; it is disabled when guides already match
  the saved defaults.
- A desktop project explorer backed by the app's private Application Support directory by default.
- A one-time macOS importer for projects created in the earlier `Documents/CriProx` library.
- A configurable projects folder, with one subfolder per saved project.
- Uploaded artwork materialized in the saved project’s `assets` folder.
- Project deletion moves the complete project folder to the operating system Trash for recovery.
- Portable JSON backups that include local artwork and selected remote URLs.
- Successful API responses cached for one day.
- Find Card preview images cached locally by their complete image URL, shared across searches,
  sets, and sort orders. Cached previews survive app restarts. Only visible and nearby cards load
  previews, with at most four loads at once. The preview cache retains up to 1,024 images within
  128 MiB on disk and 32 MiB in memory, evicting older images as it fills. If local storage is
  unavailable or full, previews still load and use the session cache.
- Export artwork cached for reuse.
- No account, telemetry service, hosted backend, or cloud project sync.

Remote URLs in a project backup are references, not embedded copies of the remote files. Browser or application storage can be cleared or reach its quota, so a downloaded project backup is the durable copy.

## Experimental layouts

### Six-card candidate area

The default 180 × 220 mm candidate area produces six rotated cards. With US Letter or A4 output, the workflow declares Tabloid inside Design Space and then selects the output paper at 100% / Actual size in the system print dialog. It is not a Cricut-certified profile.

### Seven-card 2–3–2 layout

The Maker/Explore experimental profile uses seven fixed 63 × 88 mm cards, 2.5 mm corners, 0.1 mm spacing, and a 189.2 × 214.2 mm template. It also uses the Tabloid-to-Letter handoff. A one-page PDF capture has passed software geometry checks; sensor acquisition and physical cutting remain unverified.

### Eight-card portrait layout

The Maker/Explore experimental profile uses eight fixed horizontal cards in a 2 × 4 layout with 1 mm gaps. The magenta setup image is 177 × 255 mm. Design Space produces a complete portrait Tabloid capture; CriProx checks every slot and the complete marked footprint, then moves the capture and artwork together onto US Letter or A4 pages at actual size with at least 1 mm clearance. Fronts, backs, and previews use the selected output paper. A capture must fit that paper; changing paper requires a matching capture. The Sheet area selector hides layouts unavailable for the selected paper and cutting method; seven-card is Letter-only. Printer margins, sensor acquisition, and physical cutting remain unverified.

### Nine-card manual layout

The manual profile uses nine fixed 63 × 88 mm cards, 2.5 mm corners, 1 mm spacing, and a
191 × 266 mm template. It stays inside the published 11.5 × 11.5 in cutting area of a 12 × 12 in
mat, but it bypasses optical registration and remains physically unverified.

## Current limits

- 500 cards per project.
- 100 copies per entry.
- 20 MB per local image.
- 24 sheets per ZIP; export the current sheet for larger projects.
- One active autosaved workspace. New Project, a project-library selection, or an imported backup
  replaces it.
- No image-upscaling service, printer connection, cutter control, native Design Space project generation, or cloud sync.
- Registered printing depends on a captured PDF for the exact saved cut job.
- Manual nine-card cutting depends on repeatable page and cut-template placement on the mat.
- Duplex alignment depends on repeatable printer feed.
- Letter output for the six-, seven-, and eight-card profiles uses experimental Tabloid workflows. The eight-card profile requires a full Tabloid PDF capture and produces a new Letter PDF without scaling.

Always inspect the final contour in Design Space, set both dimensions from the supplied manifest, and avoid Auto-Resize. Complete a measured size-check and test cut before using a full sheet of card stock.
