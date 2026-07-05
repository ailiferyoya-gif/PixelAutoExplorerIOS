# PixelAutoExplorerIOS Handoff

## Current State

- Project created at `D:\Codex\PixelAutoExplorerIOS`.
- MVP is an iOS SwiftUI + SpriteKit app.
- Main gameplay lives in `PixelAutoExplorerIOS/GameScene.swift`.
- `ContentView.swift` hosts the SpriteKit scene full screen.
- Xcode project and shared scheme are included.
- Browser-checkable GitHub Pages preview lives in `PreviewWeb/`.
- GitHub repo: `https://github.com/ailiferyoya-gif/PixelAutoExplorerIOS`
- Published preview: `https://ailiferyoya-gif.github.io/PixelAutoExplorerIOS/PreviewWeb/`
- Cache-bypassed reference-density preview: `https://ailiferyoya-gif.github.io/PixelAutoExplorerIOS/PreviewWeb/reference-density.html`
- Latest live-verified art commit: `13b102d`
- Latest live-verified woodcutter commit: `c7ec254`
- Latest live-verified foot-animation commit: `379ed25`
- Latest live-verified scale and palette commit: `d2e7123`

## Implemented

- Large side-view generated pixel field.
- Summon gate and `SUMMON` button.
- First summoned woodcutter is free; additional woodcutters cost 12 wood.
- Explorers automatically pick material targets, walk across the field, gather, and continue.
- Materials: wood, stone, ore, herb, crystal.
- HUD: explorer count, current status, field/node count, resource counters.
- Minimap markers for the first explorer and current target.
- Pause and reset buttons.
- No external image assets and no sprite sheets are used.
- Root `index.html` redirects to `PreviewWeb/` for GitHub Pages.
- `.nojekyll` is present for static hosting.
- `PreviewWeb/reference-density.html` is available as a cache-bypassed Pages entry while the default preview path catches up.
- Finer code-drawn pixel art for trees, materials, the summon gate, and fantasy explorers.
- Materials and trees are grounded against terrain instead of floating above it.
- Reference-density pass added leafy tree clusters, smaller sky clouds, terrain speckles, and seamless terrain fills so the scene reads closer to dense 2D pixel action games.
- Ultra-fine pass added 16px terrain cells with 2px highlights/shadows, tiny moss and stone flecks, visible background houses/graves/church silhouettes, denser leafy trees, and smaller explorer equipment details.
- Woodcutter pass makes summoned units target only wood, changes repeat summon cost to 12 wood, adds walking/chopping states, axe visuals, tree shake/sawdust, and procedural SE for summon, steps, chopping, collect, and denied summon.
- Foot-animation pass keeps the boots grounded, alternates foot lift/step during walking, moves body/axe from a separate body baseline, and softens the native iOS walk tilt.
- Scale and palette pass expands the field to 11200px, increases material nodes to 210, zooms the web view to 0.74 scale, zooms out the iOS camera, and changes woodcutters to a pale blue-gray hood, black boots, teal tunic, purple cape/plume, and silver axe palette.

## Backup

- The target folder did not exist before this MVP, so there was no previous project to copy.
- A creation note was placed under `D:\Codex\backups` before writing the new D-drive project.
- A pre-preview backup was created before adding Web preview and Pages files.
- A pre-publish-notes backup was created before this handoff update.
- A pre-fine-pixel-grounding backup was created before the latest art and grounding pass.
- A pre-reference-density backup was created before the denser pixel-art pass.
- A pre-preview-alias backup was created before adding the cache-bypassed Pages entry.
- A pre-ultra-fine-pixels backup was created before the latest reference-image granularity pass.
- A pre-woodcutter-actions-se backup was created before adding the woodcutter specialization, animations, and SE.
- A pre-foot-animation-fix backup was created before correcting the woodcutter walking foot motion.
- A pre-scale-character-palette backup was created before shrinking the world presentation and changing the woodcutter palette.

## Verification

- File-level structure was checked locally.
- `PreviewWeb/app.js` passed `node --check`.
- Local browser preview loaded, summoned an explorer, collected materials, and reported no console errors.
- Local browser screenshot check confirmed trees, stones, ores, herbs, crystals, and the summon gate sit on the terrain.
- Local browser screenshot check confirmed the summoned explorer reads as a fantasy character with hat, robe, belt, and staff.
- Local browser screenshot check confirmed the denser terrain and leafy trees match the provided reference granularity more closely.
- GitHub Pages `reference-density.html` loaded the cache-bypassed art, summoned an explorer, collected materials, and reported no console errors.
- GitHub Pages default preview loaded `app.js?v=ultra-fine-20260705`, summoned an explorer, collected materials, and reported no console errors.
- GitHub Pages default preview loaded `app.js?v=woodcutter-actions-20260706`, summoned a woodcutter, entered `CHOP WOOD`, collected only wood, and reported no console errors.
- Local D-drive preview loaded `app.js?v=footfix-20260706`, summoned a woodcutter, entered `CHOP WOOD`, and reported no console errors.
- GitHub Pages default preview loaded `app.js?v=footfix-20260706`, summoned a woodcutter, entered `CHOP WOOD`, and reported no console errors.
- Local browser preview loaded `app.js?v=scale-palette-20260706`, showed `FIELD 11200px / NODES 210`, summoned a woodcutter, and reported no console errors.
- Mobile-width browser preview loaded `app.js?v=scale-palette-20260706`, summoned a woodcutter, and reported no console errors.
- Local D-drive preview loaded `app.js?v=scale-palette-20260706`, summoned a woodcutter, and reported no console errors.
- GitHub Pages default preview loaded `app.js?v=scale-palette-20260706`, summoned a woodcutter, and reported no console errors.
- GitHub Pages live URL was rechecked after the fine-pixel grounding pass.
- GitHub Pages live URL loaded, summoned an explorer, collected materials, and reported no console errors.
- Root Pages URL redirects to `PreviewWeb/`.
- Native iOS build was not run because this Windows environment has no `swift`, `xcodebuild`, or XcodeBuildMCP simulator tool available.

## Next Recommended Work

- Build once in Xcode on macOS and fix any compiler warnings.
- Add offline save/load for inventory, explorer count, and depleted material nodes.
- Add a proper summon roster and explorer traits.
- Add deeper terrain layers, caves, and return-to-base delivery loops.
- If image assets become necessary, generate individual transparent PNGs with ChatGPT first; do not use sprite sheets without confirmation.
