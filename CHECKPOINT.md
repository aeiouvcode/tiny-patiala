# Checkpoint

- [x] v13 shipped (chunked loader, orthographic view). Security PARTIAL: new Function loader.
- [x] v14 distance audit vs avon.town and Commons Qila photos at 390px and 1440px.
- [x] v14 scene rewritten (src/main.js), bundled with esbuild to app.js (three 0.186).
- [x] Local QA: day/night at 390x844 and 1440x900 under CSP, no console errors except favicon 404.
- [x] Security scan: no eval/new Function in bundle, no network calls beyond same-origin app.js, no secrets.
- [x] Deploy v14 (5a30573, fix a3a5dd3) via Git Data API; served app.js/index.html sha256 match local; hosted 390px + desktop, day + night frames verified (A6).
- [x] Removed unused p0-p4 (nothing references them).
- [ ] Republish Instinct File with v14.
