# CriProx feature reference

## Card and artwork sources

- Import a public or unlisted Moxfield or Archidekt deck link, preserving selected printings when available.
- Paste a deck list and resolve cards through Scryfall.
- Search the Scryfall card catalog by full or partial name and add cards one at a time.
- Start with four example Scryfall card records in a new workspace.
- Search loaded cards and filter printings by set and collector number.
- Select either face of a double-faced card from the inspector.
- Search MPC Autofill community artwork and browse its dedicated card-back collection.
- Import local PNG, JPEG, or WebP artwork up to 20 MB per file.
- Keep the complete card interior opaque, even when the source image contains transparent pixels.

Deck-list requests are batched in groups of at most 75 unique identifiers. Request starts are serialized with at least 120 ms between them, and a `429` response stops the operation instead of continuing to pressure the service.

## Sheet design

- Standard 63 × 88 mm card dimensions with a 3 mm corner radius.
- 1 mm spacing in the standard layout profiles.
- US Letter and A4 planning modes.
- Millimeter-based placement and vector geometry shared by preview and export.
- Artwork and cut-path preview modes, sheet pagination, and zoom controls.
- 300, 600, 900, and 1200 DPI output.
- Optional playtest label along the bottom edge.
- Size-check card with a 5 mm measurement grid.

The selected DPI controls export density; it cannot add detail absent from the source image. The 900 and 1200 DPI modes are intended for high-resolution MPC Autofill or custom artwork and use substantially more memory.

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
- Bleed is fixed at 0.5 mm for six-card sheets and 0.05 mm for seven-card sheets.
- The captured PDF must correspond to the exact saved Design Space cut job.
- CriProx preserves captured marks; it does not generate or imitate them.
- CriProx saves the finished PDF instead of printing it through the browser, which would rasterize
  and reduce higher-resolution output. Print the saved file from a dedicated PDF application at
  100% / Actual size with fit-to-page disabled.

See [Cricut workflow and physical validation](CRICUT-WORKFLOW.md) for the complete setup and reuse procedure.

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
- A desktop project explorer backed by `Documents/CriProx` by default.
- A configurable projects folder, with one subfolder per saved project.
- Uploaded artwork materialized in the saved project’s `assets` folder.
- Project deletion moves the complete project folder to the operating system Trash for recovery.
- Portable JSON backups that include local artwork and selected remote URLs.
- Successful API responses cached for one day.
- Export artwork cached for reuse.
- No account, telemetry service, hosted backend, or cloud project sync.

Remote URLs in a project backup are references, not embedded copies of the remote files. Browser or application storage can be cleared or reach its quota, so a downloaded project backup is the durable copy.

## Experimental layouts

### Six-card candidate area

The default 180 × 220 mm candidate area produces six rotated cards. With US Letter output, the workflow declares Tabloid inside Design Space and then selects US Letter at 100% / Actual size in the system print dialog. It is not a Cricut-certified profile.

### Seven-card 2–3–2 layout

The Maker/Explore experimental profile uses seven fixed 63 × 88 mm cards, 3 mm corners, 0.1 mm spacing, and a 189.2 × 214.2 mm template. It also uses the Tabloid-to-Letter handoff. A one-page PDF capture has passed software geometry checks; sensor acquisition and physical cutting remain unverified.

## Current limits

- 500 cards per project.
- 100 copies per entry.
- 20 MB per local image.
- 24 sheets per ZIP; export the current sheet for larger projects.
- One active autosaved workspace. New Project, a project-library selection, or an imported backup
  replaces it.
- No image-upscaling service, printer connection, cutter control, native Design Space project generation, or cloud sync.
- Registered printing depends on a captured PDF for the exact saved cut job.
- Duplex alignment depends on repeatable printer feed.
- Letter output for the six- and seven-card profiles uses an unsupported Tabloid-to-Letter paper-size workaround.

Always inspect the final contour in Design Space, set both dimensions from the supplied manifest, and avoid Auto-Resize. Complete a measured size-check and test cut before using a full sheet of card stock.
