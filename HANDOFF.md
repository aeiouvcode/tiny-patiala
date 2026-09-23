# Handoff

## Resume here
Deploy index.html, app.js, src/, package.json and these state files, then verify live (served app.js sha256 matches the local build, canvas boots, 390px + desktop day/night frames).

## Blocked
- The push bridge only updates existing paths: its GET-sha step returns 404 for new files and the helper aborts. Fix: on 404, PUT without sha.

## Failed approaches
- v13 chunked base64+gzip loader run through new Function: works but blocks a strict CSP. Replaced by a plain bundle.
- Pushing new chunk names q0-q4 through the bridge: failed on the 404 GET step (see above).
- Headless screenshots of avon.town with --virtual-time-budget stay on its loader; use puppeteer with real-time waits.
- Night transition timed with a capped frame delta stalled in slow headless frames; it now uses real elapsed time.

## Distance-to-reference (v14, still worse than the reference)
1. Ground reads as one flat dusty colour; avon.town has lawn, curbs and sidewalks with strong contrast.
2. Buildings are boxes of similar size; no stepped massing, balconies, signage or tin awnings.
3. Qila Androon ranges are too regular; photos show broken rooflines, domes and weathering.
4. Gate roofline domes are still blobby compared with the bangaldar roofs in photos.
5. Shadows softer and weaker than avon.town.
