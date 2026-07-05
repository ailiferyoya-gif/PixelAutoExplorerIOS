# PixelAutoExplorerIOS

Terraria-like pixel idle exploration MVP for iPhone. The first interaction is summoning an explorer; after that, summoned explorers automatically walk across a large side-view field, select material nodes, gather them, and update the resource HUD.

## MVP Scope

- Full-screen SwiftUI app hosting a SpriteKit scene.
- Large horizontal pixel field with generated terrain, sky, grass, and 145 material nodes.
- Summon button: first explorer is free, later explorers cost 8 wood and 5 stone.
- Autonomous exploration and gathering for wood, stone, ore, herb, and crystal.
- Camera follow, minimap marker, pause, reset, material counters, and collection popups.
- No image assets and no sprite sheets. All current pixel art is built from code-drawn rectangle nodes.
- Static `PreviewWeb` build for GitHub Pages browser checks.

## Web Preview

GitHub Pages serves the browser preview from:

```text
https://ailiferyoya-gif.github.io/PixelAutoExplorerIOS/PreviewWeb/
```

The root `index.html` redirects to `PreviewWeb/`, and `.nojekyll` is included for static Pages hosting.

## Open In Xcode

Open:

```text
D:\Codex\PixelAutoExplorerIOS\PixelAutoExplorerIOS.xcodeproj
```

Then run the `PixelAutoExplorerIOS` scheme on an iPhone simulator or device.

## Local Verification Note

This Windows Codex environment does not currently expose `swift`, `xcodebuild`, or the XcodeBuildMCP simulator tools, so native compilation was not run here. The project is structured as a minimal Xcode iOS app and should be built in Xcode on macOS for the first device check.
