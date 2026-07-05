# PixelAutoExplorerIOS Handoff

## Current State

- Project created at `D:\Codex\PixelAutoExplorerIOS`.
- MVP is an iOS SwiftUI + SpriteKit app.
- Main gameplay lives in `PixelAutoExplorerIOS/GameScene.swift`.
- `ContentView.swift` hosts the SpriteKit scene full screen.
- Xcode project and shared scheme are included.
- Browser-checkable GitHub Pages preview lives in `PreviewWeb/`.

## Implemented

- Large side-view generated pixel field.
- Summon gate and `SUMMON` button.
- First summoned explorer is free; additional explorers cost 8 wood and 5 stone.
- Explorers automatically pick material targets, walk across the field, gather, and continue.
- Materials: wood, stone, ore, herb, crystal.
- HUD: explorer count, current status, field/node count, resource counters.
- Minimap markers for the first explorer and current target.
- Pause and reset buttons.
- No external image assets and no sprite sheets are used.
- Root `index.html` redirects to `PreviewWeb/` for GitHub Pages.
- `.nojekyll` is present for static hosting.

## Backup

- The target folder did not exist before this MVP, so there was no previous project to copy.
- A creation note was placed under `D:\Codex\backups` before writing the new D-drive project.
- A pre-preview backup was created before adding Web preview and Pages files.

## Verification

- File-level structure was checked locally.
- Browser preview should be tested through `PreviewWeb/index.html` or GitHub Pages after publish.
- Native iOS build was not run because this Windows environment has no `swift`, `xcodebuild`, or XcodeBuildMCP simulator tool available.

## Next Recommended Work

- Build once in Xcode on macOS and fix any compiler warnings.
- After GitHub push, verify `https://ailiferyoya-gif.github.io/PixelAutoExplorerIOS/PreviewWeb/`.
- Add offline save/load for inventory, explorer count, and depleted material nodes.
- Add a proper summon roster and explorer traits.
- Add deeper terrain layers, caves, and return-to-base delivery loops.
- If image assets become necessary, generate individual transparent PNGs with ChatGPT first; do not use sprite sheets without confirmation.
