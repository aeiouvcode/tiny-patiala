# Current task

v14: close the biggest distance-to-reference gaps against avon.town (camera, depth, density, night) and the Qila Mubarak photos, and drop the eval-based chunk loader for an ordinary bundle with a strict CSP.

## Acceptance criteria
- A1 Perspective low-angle camera with tilt-shift depth, framed on the Qila at 390px and desktop.
- A2 Dense old-city fabric with parapets, windows, ground-floor shutters and rooftop tanks, clipped to the tile.
- A3 Qila read from photos: cream Darshani Gate with niches and scalloped roofline, weathered walls and bastions, pink Qila Androon courtyards. Labeled stylized.
- A4 Night: dark sky, sparse warm windows, lamps, gate floodlight, restrained bloom.
- A5 No eval / new Function; CSP `default-src 'none'; script-src 'self'`; no third-party requests.
- A6 Live URL serves the tested bytes and boots at 390px and desktop, day and night.

## Non-goals
- Survey-accurate geometry, new features beyond the brief.
