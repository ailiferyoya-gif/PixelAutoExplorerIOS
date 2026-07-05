import SpriteKit
import SwiftUI

struct ContentView: View {
    @State private var scene = GameScene(size: CGSize(width: 390, height: 844))

    var body: some View {
        SpriteView(scene: scene, preferredFramesPerSecond: 60)
            .ignoresSafeArea()
            .statusBarHidden(true)
            .onAppear {
                scene.scaleMode = .resizeFill
            }
    }
}

#Preview {
    ContentView()
}
