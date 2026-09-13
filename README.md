# CriProx

A local card-sheet studio for preparing Magic: The Gathering playtest cards for Cricut Print Then Cut. React + TypeScript UI, a millimeter-based layout/export engine, and a sandboxed Electron desktop shell for macOS, Windows, and Linux.

## Run

Requires Node.js 22+ and npm.

```sh
npm install
npm run dev       # Browser preview at http://127.0.0.1:5173
npm run desktop   # Build and launch the desktop application
npm test          # Geometry, parsing, PNG density, and project validation checks
npm run build     # Type-check and create the production renderer
npm run package   # Build an installer for the current OS into release/
```

Windows and Linux installers should be built/tested on their respective platforms. Published releases include a universal macOS DMG, a Windows x64 NSIS installer, and a Linux x64 AppImage. The macOS and Windows builds are currently unsigned, and automatic installation of updates is not configured. The desktop app checks GitHub for the latest stable release at launch and shows a dismissible notice when a newer installer is available. Design Space is a separate application: CriProx on Linux can prepare exports, but the actual Cricut job requires a platform supported by Design Space.

## Releases and contributions

Commits and pull request titles use [Conventional Commits](https://www.conventionalcommits.org/). Release Please maintains a release pull request containing the generated changelog and automatic `package.json` / `package-lock.json` version bump. Merging that pull request builds all three native installers, attaches them to a draft GitHub release, and publishes the release only after every installer succeeds.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and release details. Maintainers must enable **Allow GitHub Actions to create and approve pull requests** under **Settings → Actions → General** for the Release Please workflow.

## License

CriProx is free and open-source software licensed under the [GNU General Public License v3.0 only](LICENSE). Anyone may use, study, modify, and redistribute it. Distributed copies and derivative works must remain under the GPL, and their corresponding source must remain available under the license terms. The GPL permits charging for distribution; recipients retain the same rights to copy, modify, and redistribute the software. See [NOTICE](NOTICE) for the copyright notice.

## Included

- Responsive sheet studio with a searchable card library, sheet pagination, artwork/cut-path preview, and a settings inspector.
- Deck-list import through Scryfall, batched in groups of at most 75 unique identifiers. Requests are serialized with at least 120 ms between starts; 429 responses stop the operation.
- Printing selection with pagination and loaded-result filtering by set/collector number. Double-faced cards expose a face selector when inspecting a card.
- MPC Autofill community-art lookup from the card inspector, plus a browser for its dedicated card-back collection. Full-resolution selections use MPC Autofill's official image CDN.
- Local PNG, JPEG, and WebP artwork imports; the full source is contained inside an opaque rounded card silhouette.
- Standard 63 × 88 mm cards with a 3 mm corner radius and 1 mm spacing, Letter/A4 planning, and 300/600/900/1200 DPI export.
- A conservative 171.45 × 234.95 mm planning rectangle (four standard cards with default settings), plus an **experimental** 180 × 220 mm candidate area (six rotated cards with default settings). The expanded area is not a certified Cricut profile.
- Transparent artwork PNGs, matched vector-only SVG silhouettes, a dimensions manifest, and a plain-text Design Space guide in a ZIP.
- Size-check card export with a 5 mm grid, for measuring printer scale and the resulting cut.
- Reusable registered printing from a captured Design Space PDF, with print-only bleed and unchanged cut geometry.
- Optional shared card backs, disabled by default, with separate manual-refeed PDFs or alternating duplex pages, long/short-edge orientation, and X/Y alignment adjustment. Back pages contain artwork only.
- IndexedDB autosave and portable JSON project backups. Successful API responses are cached for a day; fetched export artwork is cached for reuse. No account or hosted backend.

The initial project contains four example Scryfall card records. Scryfall and MPC Autofill searches require a connection. Local artwork and already-cached export artwork can be used offline. Remote preview images are not guaranteed to be available offline. The selected DPI sets export density; it does not increase source image detail. The 900 and 1200 DPI settings are intended for high-resolution MPC Autofill or custom artwork and require substantially more memory.

## The Cricut integration boundary

**CriProx does not generate or reproduce Cricut registration marks, produce native Design Space project files, or control the machine. The registered-print workflow preserves marks captured from a PDF produced by Design Space.**

Design Space creates the sensor marks for the actual print-and-cut job. Cricut explicitly recommends completing printing and cutting in the same Design Space session and warns about incorrect sensor-mark sizing when printing outside that workflow. The supported handoff is to upload CriProx's transparent PNG, set its exact dimensions, and print/cut through Design Space.

The PNG has one opaque rounded silhouette per card and transparent gaps. Check the resulting cut contour in Design Space before printing. The SVG is a matched vector geometry reference / separate Basic Cut template, not a registration mechanism. Enabling both its paths and the PNG's cut contours may cut twice. SVG imports containing embedded raster images or clipping paths are unsupported by Design Space, so these assets are deliberately separate.

The layout engine uses millimeters. PNG raster rounding is at most half a pixel per overall dimension (about 0.042 mm at 300 DPI); Design Space tracing, paper feed, printer scaling and cutter calibration contribute their own errors. PNG physical-density metadata is included, but always set the width **and** height on the Design Space Canvas using the supplied manifest. Never use Auto-Resize to fit the page.

The dashed preview rectangle is a planning guide, not registration artwork or a certified model-specific cuttable-area outline. Cricut's modern usable area is not rectangular. Selecting a machine records the intended target and drives instructions; it does not emulate firmware or independently certify fit. Check each job in Design Space.

See [the physical validation procedure](docs/CRICUT-WORKFLOW.md) before printing a deck.

## Current limits

- Registered printing depends on a captured Design Space PDF for the exact saved cut job. It does not emulate sensor marks and must be tested with the user's printer and Cricut.
- Duplex alignment depends on printer feed accuracy. The included guide and X/Y offsets compensate for repeatable shifts, but cannot correct inconsistent paper feed.
- Up to 500 cards per project, 100 copies per entry, 20 MB per local image, and 24 sheets per ZIP. Export the current sheet for larger projects. High-resolution batches can use substantial memory.
- Browser storage can be cleared or reach its quota; save a project backup to keep your work. JSON backups include local artwork and selected remote URLs, not copies of remote images.
- New project / open project replaces the single autosaved workspace. Save a backup before switching.
- No paid image-upscaling service, cloud project sync, or printer/cutter connection.

## Structure

- `src/lib/layout.ts`: placement and vector geometry, shared by preview and export.
- `src/lib/export.ts`: clipped opaque card rendering, PNGs, ZIP package, and print instructions.
- `src/lib/png.ts`: PNG physical-density metadata.
- `src/lib/deck.ts`, `scryfall.ts`, and `mpc.ts`: list parsing, source lookup, caching, and artwork variants.
- `src/lib/project.ts`: imported project validation.
- `src/App.tsx` and `src/style.css`: application UI.
- `electron/main.cjs`: desktop shell with context isolation, sandboxing, and no Node access from the renderer.

## Sources

Checked September 9, 2026:

- [Cricut: Print Then Cut workflow](https://help.cricut.com/hc/en-us/articles/360009387274-How-to-Print-Then-Cut-in-Design-Space)
- [Cricut: usable area depends on machine, paper, and shape](https://help.cricut.com/hc/en-us/articles/360009429814-How-large-can-I-Print-Then-Cut)
- [Cricut: unsupported SVG items](https://help.cricut.com/hc/en-us/articles/360009553213-Image-uploads-unsupported-items)
- [Cricut: machine calibration](https://help.cricut.com/hc/en-us/articles/360009424974-Calibrating-your-machine-for-Print-Then-Cut)
- [Scryfall: API traffic requirements](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17)
- [MPC Autofill](https://mpcfill.com/) and its [open-source API implementation](https://github.com/chilli-axe/mpc-autofill)
- [Proxxied](https://proxxied.com/), the user's reference for deck import and printing selection.

Card data and artwork are provided by Scryfall, MPC Autofill contributors, and their respective owners. CriProx is an independent playtesting utility and is not affiliated with Cricut, Wizards of the Coast, or MPC Autofill.
