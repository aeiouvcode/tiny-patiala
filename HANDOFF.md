# Handoff

## Resume here
Work the distance-to-reference list below in order, then rebuild (npm run build), bump the app.js ?v= query in index.html, push, and verify the served hash.

## Deploy path
Git Data API from a bridge page (blobs -> tree on base_tree -> commit -> PATCH ref, no force). Handles new and deleted paths in one commit. The token is vault-filled into the page and cleared after each commit.

## Failed approaches
- v13 chunked base64+gzip loader run through new Function: works but blocks a strict CSP. Replaced by a plain bundle.
- Contents-API bridge (GET sha then PUT): aborted on 404 for new paths. Replaced by the Git Data API path.
- Headless screenshots of avon.town with --virtual-time-budget stay on its loader; use puppeteer with real-time waits.
- Night transition timed with a capped frame delta stalled in slow headless frames; it now uses real elapsed time.

## Distance-to-reference (v14, still worse than the reference)
1. Ground reads as one flat dusty colour; avon.town has lawn, curbs and sidewalks with strong contrast.
2. Buildings are boxes of similar size; no stepped massing, balconies, signage or tin awnings.
3. Qila Androon ranges are too regular; photos show broken rooflines, domes and weathering.
4. Gate roofline domes are still blobby compared with the bangaldar roofs in photos.
5. Shadows softer and weaker than avon.town.
