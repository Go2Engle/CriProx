# Experimental eight-card US Letter template

This is a deliberately tight Design Space acceptance test, not a validated
CriProx layout profile. The primary experiment selects A4 inside Design Space
but sends the resulting job to 8.5 × 11 in US Letter paper in the printer
dialog.

## Result

The system print preview produced two pages, including with borderless Letter
selected. The experiment therefore failed the one-page acceptance gate and no
eight-card profile was added. These files are retained as a rejection record.

## Geometry

- Card trim size: 63 × 88 mm (2.4803 × 3.4646 in)
- Layout: two columns by four rows, cards rotated 90 degrees
- Card corner radius: 3 mm
- Transparent gap: 0.1 mm
- Complete image size: 176.1 × 252.3 mm (6.9331 × 9.9331 in)
- PNG: 4160 × 5960 px at 600 DPI
- Color: CriProx capture magenta, `#e600c8`

In native US Letter mode, the height is only 0.2 mm below Cricut's published
252.5 mm maximum vertical extent. In A4 mode, the complete image is below the
published 183 × 269.8 mm maximum extents by 6.9 mm horizontally and 17.5 mm
vertically. Cricut also says the cuttable area is not rectangular, so those
independent maxima still do not guarantee that Design Space will accept the
arrangement.

## Design Space test

1. Select the actual Cricut machine and set the Design Space Print Then Cut
   paper to **A4**.
2. Upload `eight-card-letter-test-600dpi.png` as one flat Print Then Cut image.
   Keep the transparent background; do not remove the background or add an
   offset.
3. On the Canvas, unlock the aspect ratio if necessary and set both dimensions
   to **6.9331 in wide × 9.9331 in high** (176.1 × 252.3 mm).
4. Confirm that Design Space shows eight separate rounded cut contours. If it
   offers Auto-Resize or reports that the printable image is too large, stop:
   resizing would make the cards undersized.
5. Select Make. Confirm that all eight slots stay together on one portrait A4
   layout and that no slot crosses a sensor mark. Turn bleed off for this
   solid-color template.
6. In the system printer dialog, select **8.5 × 11 in US Letter** and keep the
   job at **Actual Size / 100%**. Do not use Fit, Shrink, or Scale to Fit. Check
   the preview carefully: the full sensor-mark pattern and every pink slot must
   remain on the Letter page without clipping.
7. If Design Space accepts it, save the one-page test PDF for geometry
   inspection. Do not spend card stock until CriProx has an eight-card hybrid
   layout profile and the captured geometry has been validated.

This A4-on-Letter route is outside Cricut's supported guidance, which expects
the selected material size to match the paper and warns against printer
scaling. A successful Design Space preview is only the first gate; the sensor
must still read the printed marks and a physical test cut must measure 63 × 88
mm. Native US Letter mode can also be tried with this same PNG, but it has much
less vertical clearance.

The SVG is an exact vector reference. Use the PNG for this Print Then Cut
acceptance test so Design Space receives the same kind of flat transparent
image as the CriProx reusable-template workflow.

Official Cricut area limits:
https://help.cricut.com/hc/en-us/articles/360009429814-How-large-can-I-Print-Then-Cut
