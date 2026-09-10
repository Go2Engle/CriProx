# Physical validation before a full deck

This is the remaining hardware acceptance test. It cannot be completed by a browser test or by comparing generated files.

1. Record the Cricut model, Design Space version, OS, printer/driver, paper size, material, and mat. Choose the corresponding machine in Design Space and CriProx.
2. Calibrate Print Then Cut using Cricut's built-in calibration flow.
3. In CriProx, leave the layout on Conservative and select your desired card size. Open Export and download a size-check card. This package contains a single card with a 5 mm grid, not a sensor calibration page.
4. Upload the PNG as a flat/single-layer Print Then Cut image. Preserve transparency. Inspect its contour: exactly one rounded rectangle, with no interior holes. Set both Canvas dimensions to the values in START-HERE.txt. Confirm that Design Space accepts those dimensions without resizing.
5. Print through Design Space with bleed enabled and with printer fit-to-page/shrink-to-fit disabled. Complete cutting in the same session from the same device. Follow the model-specific mat-loading instructions.
6. Measure width and height of the cut card and its internal 5 mm grid. A consistent scale error suggests printer scaling or incorrect Canvas dimensions. Correctly sized grid with displaced edges suggests calibration/alignment. Record the error; do not change the physical card dimensions to conceal a sensor alignment issue.
7. Repeat using a full conservative sheet and measure every card, including diagonal position differences. Use three sheets to check repeatability. Decide your own acceptable tolerance before committing a full deck (for example, target at most 0.25 mm edge displacement if your equipment supports it).
8. If testing Expanded, import its PNG into Design Space before printing. The 180 × 220 mm planning envelope is a candidate, not a validated Cricut area. Do not use Auto-Resize if rejected. Return to Conservative or a smaller batch. Recheck the rotated card dimensions.

## Exact SVG template

Each PNG is accompanied by an SVG with the same dimensions, origin, card positions, rotation and rounded corners. It contains only opaque vector shapes, with no page background, strokes, registration marks, embedded images or clipping paths.

The PNG's alpha silhouette is the recommended Print Then Cut input. The SVG is supplied for inspecting the intended geometry or a separate Basic Cut workflow. It does not tell Cricut where a independently printed page lies. Do not add the SVG as another enabled cut layer over the PNG unless you are deliberately testing a different, validated workflow: that can cause duplicate cuts.

## Physical acceptance record

| Field | Value |
| --- | --- |
| Machine / firmware | Pending |
| Design Space / OS | Pending |
| Printer / driver | Pending |
| Paper / material / mat | Pending |
| Export settings / manifest | Pending |
| Import dimensions confirmed | Pending |
| Outer contour count confirmed | Pending |
| Card dimensions after cutting | Pending |
| Maximum edge displacement | Pending |
| Repeatability across three sheets | Pending |
| Conservative / expanded result | Pending |

Until this record is filled in with real measurements, the application is a software-tested prototype, not a guarantee of perfect Cricut alignment.
