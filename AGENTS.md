# Repository guidance

## Living documentation

For user-visible features, update `docs/FEATURES.md` and the relevant installation or print workflow
guide in the same change. If a feature deserves a homepage summary, update the `Why CriProx?` table
in `README.md`; the website reads that table directly. Keep the `From card list to cut` numbered
workflow and app screenshot current when the workflow or interface changes.

The website lives in `site/` and publishes existing Markdown guides. Do not add a second copy of
feature documentation there. See `docs/WEBSITE.md` for the build, release synchronization, and Pages
setup. Website changes should pass `npm ci --prefix site`, `npm test --prefix site`, and a website
build. Use `npm run build --prefix site -- --offline` when release API access is unavailable.

Use human-readable Conventional Commit subjects and PR titles. Release Please manages version
files and `CHANGELOG.md`; do not edit them by hand. Describe the actual user-visible result in
feature and fix subjects because those subjects become the public release notes.
