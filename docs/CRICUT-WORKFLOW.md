# Cricut workflow and physical validation

## Understand the integration boundary

CriProx does **not** generate or reproduce Cricut registration marks, create native Design Space project files, or control the machine. Design Space creates the sensor marks and owns the actual Print Then Cut job. CriProx's registered-print workflow preserves marks from a PDF that Design Space produced for the exact saved job.

The standard export PNG contains one opaque rounded silhouette per card and transparent gaps. Its companion SVG contains matched vector geometry, not registration data. Inspect the traced contour in Design Space before printing, and do not enable both the PNG's cut contours and the SVG paths unless you deliberately intend duplicate cuts.

The layout engine works in millimeters. PNG density metadata is included, but always set **both** Canvas dimensions to the values in the supplied manifest. Do not use Auto-Resize or printer fit-to-page. Design Space tracing, paper feed, printer scaling, cutter calibration, material, and mat condition can all add error after CriProx creates the files.

The dashed rectangle in the preview is a planning guide. It is not a registration mark or a certified, model-specific outline of Cricut's usable area. Machine selection records the intended target and tailors instructions; it does not emulate firmware or guarantee that a particular job will pass Design Space's checks.

## Recommended handoff

1. Export the transparent PNG package from CriProx.
2. Upload the PNG to Design Space as one flat Print Then Cut image and preserve transparency.
3. Set its width and height from the included manifest and confirm the expected number of rounded contours.
4. Print through Design Space at 100% / Actual size with fit-to-page disabled.
5. Complete the cut from the same saved Design Space project, mat, session, and device.

For reusable registered printing, download CriProx's setup PNG, create and save the cut job in Design Space, print that job to a one-page portrait PDF at actual size, and import the PDF into CriProx. Future registered pages must be cut with that same saved job.

CriProx saves completed registered pages as PDFs and does not print them directly. Open the saved PDF in a dedicated PDF application and print at **100% / Actual size** with fit, shrink, headers, and margins disabled. This preserves the selected artwork resolution and the captured PDF content.

## Experimental manual nine-card workflow

The nine-card profile is a separate Basic Cut workflow. It bypasses Print Then Cut and its optical
sensor marks. The print PDF and transparent cut PNG share one fixed 191 × 266 mm 3×3 geometry with
63 × 88 mm cards, 1 mm gutters, and 2.5 mm corners.

1. Select **9 cards · Manual Alignment · Experimental** and open **Create manual cut**.
2. Prepare the files. Save the print PDF and `basic-cut.png`; use the same PNG for every print page.
3. Open the PDF in a dedicated PDF application and print on the selected Letter or A4 paper in
   portrait orientation at **100% / Actual size**. Disable fit, shrink, headers, and added margins.
4. Upload the PNG to Design Space as **Basic Cut**, not Print Then Cut. Set both dimensions to
   **191 × 266 mm** (7.5197 × 10.4724 in), keep all nine shapes together, and save the project.
5. Choose **On Mat**. In the Prepare preview, keep the group upright with its top-left at the first
   0.25 in grid inset. Do not center, mirror, rearrange, or auto-resize it.
6. Place the printed page flush with the upper-left corner of the mat's adhesive grid and apply it
   smoothly. Keep the page orientation identical to the Design Space preview.
7. Choose **Prepare 1 mm calibration sheet** and print it on plain paper. Place it exactly as a card
   sheet and cut it with the existing saved nine-card Basic Cut project. The other eight paths cut
   blank paper; this is intentional, because the test must preserve the real project's placement.
8. At the top-left target, count the 1 mm magenta squares between the blade line and the dark left and
   top edges. Enter those measurements and directions in CriProx, then choose **Apply measured
   correction**. Prepare a new calibration PDF after changing the correction; the saved Basic Cut PNG
   and Design Space project do not change. The right and bottom edges should show the same translation;
   disagreement indicates scale or rotation rather than a simple X/Y offset.
9. Repeat the same mat load at least twice after each correction and measure several cards. A changing
   offset indicates paper placement, mat loading, or machine repeatability rather than a value that
   should be compensated in software. Use card stock only after the offset is repeatable.

On iOS, SnapMat can photograph the material on the mat and help visually place the cut group, but it
does not certify scale or replace the repeated physical test. The 191 × 266 mm design is smaller than
Cricut's published 11.5 × 11.5 in maximum cutting area for a 12 × 12 in mat; that size statement does
not guarantee alignment or machine-specific acceptance.

## Physical validation before a full deck

This is the remaining hardware acceptance test. It cannot be completed by a browser test or by comparing generated files.

1. Record the Cricut model, Design Space version, OS, printer/driver, paper size, material, and mat. Choose the corresponding machine in Design Space and CriProx.
2. Calibrate Print Then Cut using Cricut's built-in calibration flow.
3. In CriProx, leave the layout on **6 cards · Print and Cut** and select your desired card size. Open Export and download a size-check card. This package contains a single card with a 5 mm grid, not a sensor calibration page.
4. Upload the PNG as a flat/single-layer Print Then Cut image. Preserve transparency. Inspect its contour: exactly one rounded rectangle, with no interior holes. Set both Canvas dimensions to the values in START-HERE.txt. Confirm that Design Space accepts those dimensions without resizing.
5. For US Letter output, choose **Tabloid (11 × 17 in)** in Design Space, then change the system print dialog to **US Letter**, portrait, at **100% / Actual size**. Continue only if all six slots and all four sensor marks remain on one page. For native A4 output, choose A4 in both Design Space and the system dialog.
6. Print through Design Space with bleed enabled and with printer fit-to-page/shrink-to-fit disabled. Complete cutting in the same session from the same device. Follow the model-specific mat-loading instructions.
7. Measure width and height of the cut card and its internal 5 mm grid. A consistent scale error suggests printer scaling or incorrect Canvas dimensions. Correctly sized grid with displaced edges suggests calibration/alignment. Record the error; do not change the physical card dimensions to conceal a sensor alignment issue.
8. Repeat using a full six-card sheet and measure every card, including diagonal position differences. Use three sheets to check repeatability. Decide your own acceptable tolerance before committing a full deck (for example, target at most 0.25 mm edge displacement if your equipment supports it). The 180 × 220 mm planning envelope is a candidate, not a validated Cricut area. Do not use Auto-Resize if rejected; use a smaller batch instead. Recheck the rotated card dimensions.

## Experimental seven-card test

The seven-card profile is a separate 2–3–2 test for Maker and Explore. It fixes the cards at 63 × 88 mm, the corners at 2.5 mm, the spacing at 0.1 mm, and the complete template at 189.2 × 214.2 mm. Do not modify those values.

1. Download the reusable setup template from **Create print PDF** and upload the magenta PNG as one flat Print Then Cut image.
2. Set both Canvas dimensions to 189.2 × 214.2 mm and confirm seven rounded contours.
3. Choose **Tabloid (11 × 17 in)** as the Print Then Cut page size in Design Space. A4 is too narrow for the middle row.
4. Choose Make → Send to Printer, disable bleed, and open the system print dialog. Change the printer paper to **US Letter**, portrait, at **100% / Actual size**.
5. Continue only if the preview remains one page with all seven magenta slots and all four sensor marks. Cancel if it clips a mark or creates a second page.
6. Import the resulting one-page Letter PDF into CriProx. Prepare a size-check page before using a full artwork sheet.
7. Reopen the same saved Design Space project and mat for the cut. Design Space may require a 12 × 24 in mat because the declared page is Tabloid, even though the printed sheet is Letter.
8. Record sensor acquisition, every cut dimension, edge displacement, and repeatability. The successful one-page PDF capture confirms only the software geometry—not that a physical machine will read or cut it accurately.

## Experimental eight-card Tabloid capture

The eight-card profile fixes two horizontal cards per row across four rows at 63 × 88 mm per card, 1 mm gaps, and 2.5 mm corners. The complete magenta template is 177 × 255 mm.

1. Select the eight-card profile in CriProx, download its magenta setup PNG, and upload it to Design Space as one flat Print Then Cut image. Set both Canvas dimensions to 177 × 255 mm.
2. Select portrait **Tabloid (11 × 17 in)** in Design Space and the system print dialog. Turn bleed off and save one complete Tabloid PDF at **100% / Actual size**. Keep every card and all four sensor marks on one page.
3. Import that PDF into **Create print PDF**. CriProx verifies the eight-card pattern and checks that all printed content fits on portrait US Letter with at least 1 mm clearance. It moves the complete captured page content and card artwork together, without changing their size.
4. Save the resulting US Letter size-check PDF and print it at **100% / Actual size**. Check all four marks on plain paper, then confirm the machine reads them and cuts a 63 × 88 mm card before printing a full deck.

The earlier 0.1 mm-gap sample capture had a 7.63 × 10.63 in marked footprint and about 0.19 in top and bottom clearance after centering on Letter. The revised spacing needs a fresh Tabloid capture and Letter-fit check. Printer imageable area and borderless expansion can still clip marks. Reuse the same saved Design Space cut job and mat; a successful PDF fit alone does not prove sensor acquisition.

## Exact SVG template

Front and back bleed controls are independent on/off toggles. Front bleed and the bleed between card backs are fixed at 0.5 mm for the six-card and eight-card profiles and 0.05 mm for the tightly spaced seven-card profile. Because back pages do not contain registration marks, enabled back bleed extends 1.5 mm past exposed outside edges to cover small front-to-back alignment shifts without changing card positions or cut geometry.

When a selected Scryfall card has two faces, CriProx warns that card-back printing is required. With
card backs enabled, the face opposite the selected front is placed in that card's mirrored back-side
slot automatically. The shared card-back artwork applies only to single-sided cards; it remains required
for a mixed deck that contains any single-sided cards.

Each PNG is accompanied by an SVG with the same dimensions, origin, card positions, rotation and rounded corners. It contains only opaque vector shapes, with no page background, strokes, registration marks, embedded images or clipping paths.

The PNG's alpha silhouette is the recommended Print Then Cut input. The SVG is supplied for inspecting the intended geometry or a separate Basic Cut workflow. It does not tell Cricut where an independently printed page lies. Do not add the SVG as another enabled cut layer over the PNG unless you are deliberately testing a different, validated workflow: that can cause duplicate cuts.

## Physical acceptance record

| Field                             | Value                        |
| --------------------------------- | ---------------------------- |
| Machine / firmware                | Pending                      |
| Design Space / OS                 | Pending                      |
| Printer / driver                  | Pending                      |
| Paper / material / mat            | Pending                      |
| Export settings / manifest        | Pending                      |
| Import dimensions confirmed       | Pending                      |
| Outer contour count confirmed     | Pending                      |
| Card dimensions after cutting     | Pending                      |
| Maximum edge displacement         | Pending                      |
| Repeatability across three sheets | Pending                      |
| Six-card result                   | Pending                      |
| Seven-card one-page PDF capture   | Passed; physical cut pending |
| Seven-card sensor / cut result    | Pending                      |
| Nine-card Basic Cut import        | Pending                      |
| Nine-card manual alignment result | Pending                      |

Until this record is filled in with real measurements, the application is a software-tested prototype, not a guarantee of perfect Cricut alignment.
