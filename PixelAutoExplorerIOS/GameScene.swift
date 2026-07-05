import CoreGraphics
import AVFoundation
import Foundation
import SpriteKit
import UIKit

enum MaterialKind: String, CaseIterable {
    case wood
    case stone
    case ore
    case herb
    case crystal

    var title: String {
        switch self {
        case .wood: return "WOOD"
        case .stone: return "STONE"
        case .ore: return "ORE"
        case .herb: return "HERB"
        case .crystal: return "CRYSTAL"
        }
    }

    var color: SKColor {
        switch self {
        case .wood: return SKColor(red: 0.58, green: 0.36, blue: 0.18, alpha: 1)
        case .stone: return SKColor(red: 0.54, green: 0.58, blue: 0.62, alpha: 1)
        case .ore: return SKColor(red: 0.75, green: 0.48, blue: 0.25, alpha: 1)
        case .herb: return SKColor(red: 0.28, green: 0.78, blue: 0.39, alpha: 1)
        case .crystal: return SKColor(red: 0.40, green: 0.92, blue: 0.95, alpha: 1)
        }
    }

    var amountRange: ClosedRange<Int> {
        switch self {
        case .wood: return 3...7
        case .stone: return 2...6
        case .ore: return 2...5
        case .herb: return 1...4
        case .crystal: return 1...3
        }
    }
}

private final class MaterialSpot {
    let id = UUID()
    let kind: MaterialKind
    let node: SKNode
    var amount: Int
    var reservedBy: UUID?

    init(kind: MaterialKind, node: SKNode, amount: Int) {
        self.kind = kind
        self.node = node
        self.amount = amount
    }
}

private final class Explorer {
    let id = UUID()
    let node: SKNode
    var target: MaterialSpot?
    var scoutTarget: CGPoint?
    var gatherTimer: TimeInterval = 0
    var walkClock: TimeInterval = 0
    var stepSoundCooldown: TimeInterval = 0
    var chopSoundCooldown: TimeInterval = 0
    var facing: CGFloat = 1
    var action: ExplorerAction = .idle
    var status = "IDLE"

    init(node: SKNode) {
        self.node = node
    }
}

private enum ExplorerAction {
    case idle
    case walk
    case chop
}

private enum GameSfx {
    case summon
    case step
    case chop
    case collect
    case denied
}

private final class ProceduralSfx {
    static let shared = ProceduralSfx()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!

    private init() {
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        try? engine.start()
        player.play()
    }

    func play(_ kind: GameSfx) {
        guard let buffer = makeBuffer(for: kind) else { return }
        if !engine.isRunning {
            try? engine.start()
        }
        if !player.isPlaying {
            player.play()
        }
        player.scheduleBuffer(buffer, completionHandler: nil)
    }

    private func makeBuffer(for kind: GameSfx) -> AVAudioPCMBuffer? {
        let duration: Double
        switch kind {
        case .summon: duration = 0.22
        case .step: duration = 0.06
        case .chop: duration = 0.11
        case .collect: duration = 0.16
        case .denied: duration = 0.14
        }
        let frameCount = AVAudioFrameCount(format.sampleRate * duration)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount),
              let channel = buffer.floatChannelData?[0] else {
            return nil
        }
        buffer.frameLength = frameCount
        for index in 0..<Int(frameCount) {
            let t = Double(index) / format.sampleRate
            let fade = max(0, 1 - t / duration)
            let sample: Double
            switch kind {
            case .summon:
                let freq = t < 0.08 ? 392.0 : (t < 0.15 ? 587.0 : 784.0)
                sample = sin(t * freq * .pi * 2) * 0.16 * fade
            case .step:
                sample = sin(t * 105 * .pi * 2) * 0.08 * fade + Double.random(in: -0.04...0.04) * fade
            case .chop:
                sample = sin(t * 176 * .pi * 2) * 0.18 * fade + Double.random(in: -0.16...0.16) * fade
            case .collect:
                sample = (sin(t * 523 * .pi * 2) + sin(t * 659 * .pi * 2)) * 0.10 * fade
            case .denied:
                sample = sin(t * 150 * .pi * 2) * 0.12 * fade
            }
            channel[index] = Float(sample)
        }
        return buffer
    }
}

final class GameScene: SKScene {
    private let worldNode = SKNode()
    private let terrainNode = SKNode()
    private let materialLayer = SKNode()
    private let actorLayer = SKNode()
    private let effectLayer = SKNode()
    private let hudNode = SKNode()
    private let cameraRig = SKCameraNode()

    private let tileSize: CGFloat = 32
    private let renderTileSize: CGFloat = 16
    private let worldMinX: CGFloat = -3840
    private let worldMaxX: CGFloat = 3840
    private let worldMinY: CGFloat = -760
    private let worldMaxY: CGFloat = 760
    private var surfaceByColumn: [Int: CGFloat] = [:]

    private var materials: [MaterialSpot] = []
    private var explorers: [Explorer] = []
    private var inventory = Dictionary(uniqueKeysWithValues: MaterialKind.allCases.map { ($0, 0) })
    private var discoveredColumns = Set<Int>()

    private var lastTime: TimeInterval = 0
    private var isPausedByPlayer = false
    private var summonCount = 0

    private let titleLabel = SKLabelNode(fontNamed: "Menlo-Bold")
    private let statusLabel = SKLabelNode(fontNamed: "Menlo-Bold")
    private let distanceLabel = SKLabelNode(fontNamed: "Menlo-Bold")
    private let workerLabel = SKLabelNode(fontNamed: "Menlo-Bold")
    private var resourceLabels: [MaterialKind: SKLabelNode] = [:]
    private let summonButton = SKShapeNode(rectOf: CGSize(width: 132, height: 42), cornerRadius: 5)
    private let pauseButton = SKShapeNode(rectOf: CGSize(width: 82, height: 36), cornerRadius: 5)
    private let resetButton = SKShapeNode(rectOf: CGSize(width: 82, height: 36), cornerRadius: 5)
    private let summonText = SKLabelNode(fontNamed: "Menlo-Bold")
    private let pauseText = SKLabelNode(fontNamed: "Menlo-Bold")
    private let resetText = SKLabelNode(fontNamed: "Menlo-Bold")
    private let miniMapBack = SKShapeNode(rectOf: CGSize(width: 176, height: 12), cornerRadius: 2)
    private let miniMapExplorer = SKShapeNode(rectOf: CGSize(width: 7, height: 14), cornerRadius: 1)
    private let miniMapTarget = SKShapeNode(rectOf: CGSize(width: 5, height: 10), cornerRadius: 1)

    private var summonButtonFrame = CGRect.zero
    private var pauseButtonFrame = CGRect.zero
    private var resetButtonFrame = CGRect.zero

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(red: 0.32, green: 0.68, blue: 0.82, alpha: 1)
        anchorPoint = CGPoint(x: 0.5, y: 0.5)
        view.ignoresSiblingOrder = true
        view.isMultipleTouchEnabled = true
        addChild(worldNode)
        worldNode.addChild(terrainNode)
        worldNode.addChild(materialLayer)
        worldNode.addChild(actorLayer)
        worldNode.addChild(effectLayer)
        addChild(cameraRig)
        cameraRig.addChild(hudNode)
        camera = cameraRig
        buildSky()
        buildTerrain()
        buildMaterials()
        buildSummonGate()
        buildHud()
        updateHud()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        layoutHud()
    }

    override func update(_ currentTime: TimeInterval) {
        if lastTime == 0 {
            lastTime = currentTime
        }
        let dt = min(currentTime - lastTime, 1.0 / 20.0)
        lastTime = currentTime
        if !isPausedByPlayer {
            updateExplorers(dt: dt)
            updateDiscovery()
        }
        updateCamera()
        updateHud()
    }

    private func buildSky() {
        let sun = SKShapeNode(circleOfRadius: 46)
        sun.fillColor = SKColor(red: 1.0, green: 0.82, blue: 0.35, alpha: 1)
        sun.strokeColor = SKColor(red: 1.0, green: 0.96, blue: 0.62, alpha: 0.8)
        sun.lineWidth = 6
        sun.position = CGPoint(x: -3050, y: 560)
        worldNode.addChild(sun)

        for i in 0..<42 {
            let width = CGFloat.random(in: 44...130)
            let cloud = SKShapeNode(rectOf: CGSize(width: width, height: CGFloat.random(in: 10...22)), cornerRadius: 3)
            cloud.fillColor = SKColor(white: 1, alpha: CGFloat.random(in: 0.20...0.42))
            cloud.strokeColor = .clear
            cloud.position = CGPoint(x: worldMinX + CGFloat(i) * 188 + CGFloat.random(in: -40...40), y: CGFloat.random(in: 290...650))
            cloud.zPosition = -12
            worldNode.addChild(cloud)
        }

        let horizon = SKShapeNode(rectOf: CGSize(width: worldMaxX - worldMinX + 900, height: 220))
        horizon.fillColor = SKColor(red: 0.24, green: 0.56, blue: 0.50, alpha: 1)
        horizon.strokeColor = .clear
        horizon.position = CGPoint(x: 0, y: -205)
        horizon.zPosition = -15
        worldNode.addChild(horizon)

        buildBackgroundLandmarks()
    }

    private func generatedSurfaceY(at x: CGFloat) -> CGFloat {
        let waveA = sin((x + 220) / 330) * 44
        let waveB = sin((x - 120) / 115) * 18
        return CGFloat(-160) + waveA + waveB
    }

    private func buildBackgroundLandmarks() {
        let houseA = makePixelHouse(width: 56, height: 48, wall: SKColor(red: 0.91, green: 0.86, blue: 0.78, alpha: 1), roof: SKColor(red: 0.69, green: 0.25, blue: 0.13, alpha: 1))
        houseA.position = CGPoint(x: -820, y: generatedSurfaceY(at: -820) + 2)
        houseA.zPosition = -9
        worldNode.addChild(houseA)

        let houseB = makePixelHouse(width: 82, height: 74, wall: SKColor(red: 0.93, green: 0.89, blue: 0.82, alpha: 1), roof: SKColor(red: 0.58, green: 0.20, blue: 0.11, alpha: 1))
        houseB.position = CGPoint(x: -680, y: generatedSurfaceY(at: -680) + 2)
        houseB.zPosition = -9
        worldNode.addChild(houseB)

        let houseC = makePixelHouse(width: 66, height: 46, wall: SKColor(red: 0.93, green: 0.90, blue: 0.84, alpha: 1), roof: SKColor(red: 0.64, green: 0.24, blue: 0.13, alpha: 1))
        houseC.position = CGPoint(x: -360, y: generatedSurfaceY(at: -360) + 2)
        houseC.zPosition = -9
        worldNode.addChild(houseC)

        let gravesA = makeGraveCluster(seed: 3)
        gravesA.position = CGPoint(x: -110, y: generatedSurfaceY(at: -110) + 2)
        gravesA.zPosition = -9
        worldNode.addChild(gravesA)

        let tree = SKNode()
        buildFineTree(in: tree)
        tree.setScale(1.2)
        tree.position = CGPoint(x: 80, y: generatedSurfaceY(at: 80) + 42)
        tree.zPosition = -9
        worldNode.addChild(tree)

        let gravesB = makeGraveCluster(seed: 8)
        gravesB.position = CGPoint(x: 290, y: generatedSurfaceY(at: 290) + 2)
        gravesB.zPosition = -9
        worldNode.addChild(gravesB)

        let church = makeChurch()
        church.position = CGPoint(x: 610, y: generatedSurfaceY(at: 610) + 2)
        church.zPosition = -9
        worldNode.addChild(church)
    }

    private func makePixelHouse(width: CGFloat, height: CGFloat, wall: SKColor, roof: SKColor) -> SKNode {
        let node = SKNode()
        addPixel(to: node, color: SKColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1), rect: CGRect(x: -width / 2, y: 0, width: width, height: height))
        addPixel(to: node, color: wall, rect: CGRect(x: -width / 2 + 3, y: 3, width: width - 6, height: height - 6))
        let roofTiles = max(3, Int(width / 8))
        for index in 0..<roofTiles {
            let x = -width / 2 + CGFloat(index) * 8 + 2
            addPixel(to: node, color: SKColor(red: 0.35, green: 0.13, blue: 0.09, alpha: 1), rect: CGRect(x: x, y: height - 1 + CGFloat(index % 2) * 2, width: 8, height: 5))
            addPixel(to: node, color: roof, rect: CGRect(x: x, y: height + 4 + CGFloat(index % 3), width: 8, height: 4))
        }
        for index in 0..<5 {
            let x = -width / 2 + 8 + CGFloat(index) * 12
            guard x < width / 2 - 8 else { continue }
            let y = 16 + CGFloat(index % 2) * 13
            addPixel(to: node, color: SKColor(red: 0.08, green: 0.09, blue: 0.10, alpha: 1), rect: CGRect(x: x, y: y, width: 6, height: 9))
            addPixel(to: node, color: SKColor(red: 0.90, green: 0.94, blue: 0.86, alpha: 1), rect: CGRect(x: x + 1, y: y + 3, width: 3, height: 3))
        }
        addPixel(to: node, color: SKColor(red: 0.15, green: 0.10, blue: 0.07, alpha: 1), rect: CGRect(x: -width / 2 + 5, y: 5, width: 5, height: 15))
        return node
    }

    private func makeChurch() -> SKNode {
        let node = SKNode()
        addPixel(to: node, color: SKColor(red: 0.93, green: 0.90, blue: 0.84, alpha: 1), rect: CGRect(x: -37, y: 0, width: 74, height: 36))
        addPixel(to: node, color: SKColor(red: 0.30, green: 0.12, blue: 0.08, alpha: 1), rect: CGRect(x: -40, y: 33, width: 80, height: 6))
        addPixel(to: node, color: SKColor(red: 0.66, green: 0.27, blue: 0.14, alpha: 1), rect: CGRect(x: -35, y: 39, width: 70, height: 6))
        addPixel(to: node, color: SKColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1), rect: CGRect(x: 6, y: 35, width: 21, height: 44))
        addPixel(to: node, color: SKColor(red: 0.70, green: 0.31, blue: 0.15, alpha: 1), rect: CGRect(x: 7, y: 82, width: 18, height: 5))
        addPixel(to: node, color: SKColor(red: 0.82, green: 0.66, blue: 0.20, alpha: 1), rect: CGRect(x: 11, y: 52, width: 11, height: 15))
        addPixel(to: node, color: SKColor(red: 0.88, green: 0.86, blue: 0.82, alpha: 1), rect: CGRect(x: 14, y: 91, width: 4, height: 25))
        addPixel(to: node, color: SKColor(red: 0.88, green: 0.86, blue: 0.82, alpha: 1), rect: CGRect(x: 7, y: 101, width: 18, height: 3))
        [-24, -3, 36].forEach { x in
            addPixel(to: node, color: SKColor(red: 0.08, green: 0.09, blue: 0.10, alpha: 1), rect: CGRect(x: CGFloat(x), y: 13, width: 8, height: 12))
        }
        return node
    }

    private func makeGraveCluster(seed: Int) -> SKNode {
        let node = SKNode()
        for index in 0..<7 {
            let x = CGFloat(-52) + CGFloat(index) * 18 + CGFloat((seed * 11 + index * 5) % 7)
            let height = CGFloat(23) + CGFloat((seed * 17 + index * 9) % 19)
            addPixel(to: node, color: SKColor(red: 0.14, green: 0.17, blue: 0.17, alpha: 1), rect: CGRect(x: x, y: 0, width: 9, height: height))
            addPixel(to: node, color: SKColor(red: 0.34, green: 0.38, blue: 0.38, alpha: 1), rect: CGRect(x: x + 2, y: 3, width: 5, height: height - 5))
            if index.isMultiple(of: 2) {
                addPixel(to: node, color: SKColor(red: 0.42, green: 0.45, blue: 0.43, alpha: 1), rect: CGRect(x: x - 3, y: height + 1, width: 15, height: 4))
            }
        }
        return node
    }

    private func buildTerrain() {
        let minColumn = Int(worldMinX / tileSize)
        let maxColumn = Int(worldMaxX / tileSize)
        for column in minColumn...maxColumn {
            let x = CGFloat(column) * tileSize
            let surface = generatedSurfaceY(at: x)
            surfaceByColumn[column] = surface
        }

        let minRenderColumn = Int(worldMinX / renderTileSize)
        let maxRenderColumn = Int(worldMaxX / renderTileSize)
        for column in minRenderColumn...maxRenderColumn {
            let x = CGFloat(column) * renderTileSize
            let surface = generatedSurfaceY(at: x)
            var row = 0
            var y = floor(worldMinY / renderTileSize) * renderTileSize
            while y <= surface {
                let depth = surface - y
                let tile = SKSpriteNode(color: tileColor(depth: depth, column: column), size: CGSize(width: renderTileSize + 1, height: renderTileSize + 1))
                tile.position = CGPoint(x: x, y: y)
                tile.zPosition = -3
                terrainNode.addChild(tile)
                addTerrainSpeckIfNeeded(x: x, y: y, depth: depth, column: column, row: row)
                y += renderTileSize
                row += 1
            }

            let cap = SKSpriteNode(color: tileColor(depth: 0, column: column), size: CGSize(width: renderTileSize + 2, height: 4))
            cap.position = CGPoint(x: x, y: surface + 2)
            cap.zPosition = -1
            terrainNode.addChild(cap)

            if column % 5 == 0 {
                addGrassClump(x: x + CGFloat.random(in: -8...8), y: surface)
            }
        }

        let leftWall = SKShapeNode(rectOf: CGSize(width: 34, height: worldMaxY - worldMinY + 120))
        leftWall.fillColor = SKColor(red: 0.28, green: 0.24, blue: 0.34, alpha: 1)
        leftWall.strokeColor = .clear
        leftWall.position = CGPoint(x: worldMinX - 36, y: 0)
        terrainNode.addChild(leftWall)

        let rightWall = leftWall.copy() as! SKShapeNode
        rightWall.position.x = worldMaxX + 36
        terrainNode.addChild(rightWall)
    }

    private func tileColor(depth: CGFloat, column: Int) -> SKColor {
        if depth < 32 {
            return column.isMultiple(of: 2)
                ? SKColor(red: 0.18, green: 0.52, blue: 0.25, alpha: 1)
                : SKColor(red: 0.14, green: 0.43, blue: 0.22, alpha: 1)
        }
        if depth < 190 {
            return column.isMultiple(of: 3)
                ? SKColor(red: 0.36, green: 0.29, blue: 0.20, alpha: 1)
                : SKColor(red: 0.42, green: 0.32, blue: 0.22, alpha: 1)
        }
        return column.isMultiple(of: 4)
            ? SKColor(red: 0.19, green: 0.21, blue: 0.25, alpha: 1)
            : SKColor(red: 0.15, green: 0.17, blue: 0.20, alpha: 1)
    }

    private func addGrassClump(x: CGFloat, y: CGFloat) {
        let count = Int.random(in: 3...6)
        for index in 0..<count {
            let blade = SKSpriteNode(color: index.isMultiple(of: 2) ? SKColor(red: 0.58, green: 0.86, blue: 0.37, alpha: 1) : SKColor(red: 0.26, green: 0.70, blue: 0.34, alpha: 1), size: CGSize(width: 3, height: CGFloat.random(in: 8...18)))
            blade.position = CGPoint(x: x + CGFloat(index * 5) - 12, y: y)
            blade.anchorPoint = CGPoint(x: 0.5, y: 0)
            blade.zPosition = 1
            terrainNode.addChild(blade)
        }
    }

    private func addTerrainSpeckIfNeeded(x: CGFloat, y: CGFloat, depth: CGFloat, column: Int, row: Int) {
        let hash = abs((column * 73 + row * 41) % 13)
        guard hash < 8 else { return }
        let colors: [SKColor]
        if depth < 32 {
            colors = [
                SKColor(red: 0.45, green: 0.74, blue: 0.34, alpha: 1),
                SKColor(red: 0.17, green: 0.41, blue: 0.21, alpha: 1),
                SKColor(red: 0.55, green: 0.86, blue: 0.38, alpha: 1)
            ]
        } else if depth < 190 {
            colors = [
                SKColor(red: 0.60, green: 0.45, blue: 0.29, alpha: 1),
                SKColor(red: 0.21, green: 0.16, blue: 0.11, alpha: 1),
                SKColor(red: 0.30, green: 0.55, blue: 0.21, alpha: 1)
            ]
        } else {
            colors = [
                SKColor(red: 0.33, green: 0.36, blue: 0.41, alpha: 1),
                SKColor(red: 0.09, green: 0.10, blue: 0.12, alpha: 1),
                SKColor(red: 0.19, green: 0.35, blue: 0.23, alpha: 1)
            ]
        }
        let speck = SKSpriteNode(color: colors[hash % colors.count], size: CGSize(width: 3, height: 3))
        speck.position = CGPoint(
            x: x + CGFloat((row * 7 + column * 3) % 11) - 5,
            y: y + CGFloat((row * 5 + column * 2) % 11) - 5
        )
        speck.zPosition = -2
        terrainNode.addChild(speck)
    }

    private func buildMaterials() {
        let weightedKinds: [MaterialKind] = [
            .wood, .wood, .wood,
            .stone, .stone, .stone,
            .ore, .ore,
            .herb, .herb,
            .crystal
        ]
        for index in 0..<145 {
            guard let kind = weightedKinds.randomElement() else { continue }
            let x = worldMinX + 180 + CGFloat(index) * ((worldMaxX - worldMinX - 360) / 144) + CGFloat.random(in: -54...54)
            let y = surfaceY(at: x) + materialYOffset(for: kind)
            let node = makeMaterialNode(kind: kind)
            node.position = CGPoint(x: x, y: y)
            node.zPosition = 5
            materialLayer.addChild(node)
            materials.append(MaterialSpot(kind: kind, node: node, amount: Int.random(in: kind.amountRange)))
        }
    }

    private func materialYOffset(for kind: MaterialKind) -> CGFloat {
        switch kind {
        case .wood: return 36
        case .stone: return 14
        case .ore: return 16
        case .herb: return 18
        case .crystal: return 24
        }
    }

    private func makeMaterialNode(kind: MaterialKind) -> SKNode {
        let root = SKNode()
        switch kind {
        case .wood:
            buildFineTree(in: root)
        case .stone:
            addPixel(to: root, color: kind.color, rect: CGRect(x: -20, y: -14, width: 28, height: 12))
            addPixel(to: root, color: SKColor(red: 0.45, green: 0.48, blue: 0.53, alpha: 1), rect: CGRect(x: -3, y: -10, width: 22, height: 12))
            addPixel(to: root, color: SKColor(red: 0.64, green: 0.67, blue: 0.70, alpha: 1), rect: CGRect(x: -16, y: -4, width: 16, height: 8))
            addPixel(to: root, color: SKColor(red: 0.26, green: 0.29, blue: 0.34, alpha: 1), rect: CGRect(x: 1, y: -11, width: 6, height: 5))
        case .ore:
            addPixel(to: root, color: SKColor(red: 0.27, green: 0.29, blue: 0.33, alpha: 1), rect: CGRect(x: -21, y: -16, width: 34, height: 15))
            addPixel(to: root, color: SKColor(red: 0.35, green: 0.38, blue: 0.44, alpha: 1), rect: CGRect(x: -2, y: -11, width: 24, height: 13))
            addPixel(to: root, color: kind.color, rect: CGRect(x: -16, y: -8, width: 10, height: 9))
            addPixel(to: root, color: SKColor(red: 0.90, green: 0.61, blue: 0.29, alpha: 1), rect: CGRect(x: 0, y: -12, width: 7, height: 7))
            addPixel(to: root, color: SKColor(red: 1.0, green: 0.75, blue: 0.42, alpha: 1), rect: CGRect(x: 12, y: -5, width: 6, height: 6))
        case .herb:
            addPixel(to: root, color: kind.color, rect: CGRect(x: -2, y: -18, width: 4, height: 25))
            addPixel(to: root, color: SKColor(red: 0.52, green: 0.94, blue: 0.45, alpha: 1), rect: CGRect(x: -15, y: -12, width: 14, height: 6))
            addPixel(to: root, color: SKColor(red: 0.20, green: 0.66, blue: 0.34, alpha: 1), rect: CGRect(x: 2, y: -5, width: 16, height: 6))
            addPixel(to: root, color: SKColor(red: 0.73, green: 1.0, blue: 0.55, alpha: 1), rect: CGRect(x: -6, y: 4, width: 7, height: 7))
            addPixel(to: root, color: SKColor(red: 0.94, green: 1.0, blue: 0.82, alpha: 1), rect: CGRect(x: 4, y: 7, width: 5, height: 5))
        case .crystal:
            addPixel(to: root, color: kind.color, rect: CGRect(x: -7, y: -24, width: 14, height: 38))
            addPixel(to: root, color: SKColor(red: 0.30, green: 0.56, blue: 0.88, alpha: 1), rect: CGRect(x: -15, y: -20, width: 10, height: 24))
            addPixel(to: root, color: SKColor(red: 0.32, green: 0.78, blue: 0.94, alpha: 1), rect: CGRect(x: 6, y: -17, width: 9, height: 28))
            addPixel(to: root, color: SKColor(red: 0.82, green: 1.0, blue: 1.0, alpha: 1), rect: CGRect(x: -3, y: -11, width: 5, height: 20))
            addPixel(to: root, color: SKColor(red: 0.92, green: 1.0, blue: 1.0, alpha: 1), rect: CGRect(x: -4, y: 11, width: 8, height: 7))
        }
        return root
    }

    private func buildFineTree(in root: SKNode) {
        addPixel(to: root, color: SKColor(red: 0.39, green: 0.22, blue: 0.11, alpha: 1), rect: CGRect(x: -10, y: -36, width: 11, height: 43))
        addPixel(to: root, color: SKColor(red: 0.55, green: 0.33, blue: 0.16, alpha: 1), rect: CGRect(x: 1, y: -29, width: 7, height: 36))
        addPixel(to: root, color: SKColor(red: 0.30, green: 0.17, blue: 0.09, alpha: 1), rect: CGRect(x: -14, y: -20, width: 7, height: 23))
        addPixel(to: root, color: SKColor(red: 0.48, green: 0.28, blue: 0.14, alpha: 1), rect: CGRect(x: 10, y: -16, width: 12, height: 5))
        addLeafCluster(to: root, color: SKColor(red: 0.30, green: 0.68, blue: 0.26, alpha: 1), rect: CGRect(x: -41, y: -2, width: 34, height: 18), seed: 1)
        addLeafCluster(to: root, color: SKColor(red: 0.33, green: 0.71, blue: 0.29, alpha: 1), rect: CGRect(x: -22, y: -5, width: 46, height: 22), seed: 2)
        addLeafCluster(to: root, color: SKColor(red: 0.24, green: 0.59, blue: 0.23, alpha: 1), rect: CGRect(x: 7, y: 3, width: 30, height: 18), seed: 3)
        addLeafCluster(to: root, color: SKColor(red: 0.47, green: 0.78, blue: 0.36, alpha: 1), rect: CGRect(x: -30, y: 14, width: 38, height: 18), seed: 4)
        addLeafCluster(to: root, color: SKColor(red: 0.40, green: 0.74, blue: 0.33, alpha: 1), rect: CGRect(x: -3, y: 19, width: 28, height: 15), seed: 5)
        addPixel(to: root, color: SKColor(red: 0.72, green: 0.94, blue: 0.53, alpha: 1), rect: CGRect(x: -33, y: 11, width: 8, height: 8))
        addPixel(to: root, color: SKColor(red: 0.80, green: 0.96, blue: 0.60, alpha: 1), rect: CGRect(x: 5, y: 28, width: 6, height: 6))
    }

    private func addLeafCluster(to node: SKNode, color: SKColor, rect: CGRect, seed: Int) {
        addPixel(to: node, color: color, rect: rect)
        let specks = max(2, Int((rect.width * rect.height) / 140))
        for index in 0..<specks {
            let xOffset = CGFloat((seed * 17 + index * 11) % max(1, Int(rect.width - 8)))
            let yOffset = CGFloat((seed * 23 + index * 7) % max(1, Int(rect.height - 8)))
            let bright = index.isMultiple(of: 2)
                ? SKColor(red: 0.58, green: 0.85, blue: 0.42, alpha: 1)
                : SKColor(red: 0.16, green: 0.48, blue: 0.24, alpha: 1)
            addPixel(to: node, color: bright, rect: CGRect(x: rect.minX + 4 + xOffset, y: rect.minY + 4 + yOffset, width: 5, height: 5))
        }
    }

    private func buildSummonGate() {
        let baseY = surfaceY(at: 0)
        let gate = SKNode()
        gate.name = "summonGate"
        gate.position = CGPoint(x: 0, y: baseY)
        gate.zPosition = 4
        addPixel(to: gate, color: SKColor(red: 0.22, green: 0.20, blue: 0.35, alpha: 1), rect: CGRect(x: -42, y: 0, width: 84, height: 14))
        addPixel(to: gate, color: SKColor(red: 0.94, green: 0.74, blue: 0.28, alpha: 1), rect: CGRect(x: -30, y: 10, width: 14, height: 54))
        addPixel(to: gate, color: SKColor(red: 0.94, green: 0.74, blue: 0.28, alpha: 1), rect: CGRect(x: 16, y: 10, width: 14, height: 54))
        addPixel(to: gate, color: SKColor(red: 0.36, green: 0.92, blue: 0.96, alpha: 0.78), rect: CGRect(x: -17, y: 13, width: 34, height: 44))
        addPixel(to: gate, color: SKColor(red: 1.0, green: 0.94, blue: 0.64, alpha: 1), rect: CGRect(x: -31, y: 58, width: 17, height: 7))
        addPixel(to: gate, color: SKColor(red: 1.0, green: 0.94, blue: 0.64, alpha: 1), rect: CGRect(x: 14, y: 58, width: 17, height: 7))
        gate.run(.repeatForever(.sequence([
            .scale(to: 1.06, duration: 0.55),
            .scale(to: 1.0, duration: 0.55)
        ])))
        actorLayer.addChild(gate)
    }

    private func buildHud() {
        titleLabel.fontSize = 16
        titleLabel.fontColor = .white
        titleLabel.horizontalAlignmentMode = .left
        titleLabel.text = "PIXEL AUTO EXPLORER"
        hudNode.addChild(titleLabel)

        [statusLabel, distanceLabel, workerLabel].forEach { label in
            label.fontSize = 12
            label.fontColor = .white
            label.horizontalAlignmentMode = .left
            hudNode.addChild(label)
        }

        for kind in MaterialKind.allCases {
            let label = SKLabelNode(fontNamed: "Menlo-Bold")
            label.fontSize = 11
            label.fontColor = SKColor(white: 0.95, alpha: 1)
            label.horizontalAlignmentMode = .left
            resourceLabels[kind] = label
            hudNode.addChild(label)
        }

        configureButton(summonButton, label: summonText, title: "SUMMON")
        configureButton(pauseButton, label: pauseText, title: "PAUSE")
        configureButton(resetButton, label: resetText, title: "RESET")
        hudNode.addChild(summonButton)
        hudNode.addChild(summonText)
        hudNode.addChild(pauseButton)
        hudNode.addChild(pauseText)
        hudNode.addChild(resetButton)
        hudNode.addChild(resetText)

        miniMapBack.fillColor = SKColor(white: 0.07, alpha: 0.62)
        miniMapBack.strokeColor = SKColor(white: 1, alpha: 0.22)
        miniMapBack.lineWidth = 1
        miniMapExplorer.fillColor = SKColor(red: 1.0, green: 0.86, blue: 0.28, alpha: 1)
        miniMapExplorer.strokeColor = .clear
        miniMapTarget.fillColor = SKColor(red: 0.38, green: 0.95, blue: 0.98, alpha: 1)
        miniMapTarget.strokeColor = .clear
        hudNode.addChild(miniMapBack)
        hudNode.addChild(miniMapExplorer)
        hudNode.addChild(miniMapTarget)
        layoutHud()
    }

    private func configureButton(_ button: SKShapeNode, label: SKLabelNode, title: String) {
        button.fillColor = SKColor(red: 0.08, green: 0.10, blue: 0.12, alpha: 0.82)
        button.strokeColor = SKColor(red: 0.96, green: 0.82, blue: 0.38, alpha: 1)
        button.lineWidth = 2
        label.fontSize = 13
        label.fontColor = .white
        label.horizontalAlignmentMode = .center
        label.verticalAlignmentMode = .center
        label.text = title
    }

    private func layoutHud() {
        let left = -size.width / 2 + 16
        let top = size.height / 2 - 34
        let right = size.width / 2 - 16
        titleLabel.position = CGPoint(x: left, y: top)
        workerLabel.position = CGPoint(x: left, y: top - 24)
        statusLabel.position = CGPoint(x: left, y: top - 46)
        distanceLabel.position = CGPoint(x: left, y: top - 68)

        for (offset, kind) in MaterialKind.allCases.enumerated() {
            resourceLabels[kind]?.position = CGPoint(x: left, y: top - 98 - CGFloat(offset * 18))
        }

        summonButton.position = CGPoint(x: right - 66, y: -size.height / 2 + 58)
        summonText.position = summonButton.position
        pauseButton.position = CGPoint(x: right - 41, y: top - 4)
        pauseText.position = pauseButton.position
        resetButton.position = CGPoint(x: right - 41, y: top - 48)
        resetText.position = resetButton.position
        summonButtonFrame = CGRect(x: summonButton.position.x - 66, y: summonButton.position.y - 21, width: 132, height: 42)
        pauseButtonFrame = CGRect(x: pauseButton.position.x - 41, y: pauseButton.position.y - 18, width: 82, height: 36)
        resetButtonFrame = CGRect(x: resetButton.position.x - 41, y: resetButton.position.y - 18, width: 82, height: 36)

        miniMapBack.position = CGPoint(x: 0, y: top - 4)
        updateMiniMap()
    }

    private func summonExplorer() {
        guard canSummon else {
            ProceduralSfx.shared.play(.denied)
            showPopup("NEED 12 WOOD", at: CGPoint(x: cameraRig.position.x, y: cameraRig.position.y + 90), color: .white)
            return
        }
        if summonCount > 0 {
            inventory[.wood, default: 0] -= 12
        }
        summonCount += 1
        let node = makeExplorerNode(index: summonCount)
        node.position = CGPoint(x: CGFloat.random(in: -20...20), y: surfaceY(at: 0) + 58)
        node.zPosition = 12
        actorLayer.addChild(node)
        let explorer = Explorer(node: node)
        explorers.append(explorer)
        ProceduralSfx.shared.play(.summon)
        showPopup("WOODCUTTER #\(summonCount)", at: node.position + CGPoint(x: 0, y: 64), color: SKColor(red: 1.0, green: 0.86, blue: 0.32, alpha: 1))
    }

    private var canSummon: Bool {
        summonCount == 0 || inventory[.wood, default: 0] >= 12
    }

    private func makeExplorerNode(index: Int) -> SKNode {
        let root = SKNode()
        let robeColors = [
            SKColor(red: 0.31, green: 0.55, blue: 0.25, alpha: 1),
            SKColor(red: 0.55, green: 0.42, blue: 0.20, alpha: 1),
            SKColor(red: 0.25, green: 0.50, blue: 0.35, alpha: 1),
            SKColor(red: 0.58, green: 0.44, blue: 0.23, alpha: 1)
        ]
        let robe = robeColors[(index - 1) % robeColors.count]
        addPixel(to: root, color: SKColor(red: 0.16, green: 0.10, blue: 0.06, alpha: 1), rect: CGRect(x: -14, y: -40, width: 10, height: 6))
        addPixel(to: root, color: SKColor(red: 0.16, green: 0.10, blue: 0.06, alpha: 1), rect: CGRect(x: 4, y: -40, width: 10, height: 6))
        addPixel(to: root, color: SKColor(red: 0.25, green: 0.17, blue: 0.11, alpha: 1), rect: CGRect(x: -11, y: -34, width: 6, height: 17))
        addPixel(to: root, color: SKColor(red: 0.34, green: 0.22, blue: 0.12, alpha: 1), rect: CGRect(x: 5, y: -34, width: 6, height: 17))
        addPixel(to: root, color: SKColor(red: 0.08, green: 0.10, blue: 0.14, alpha: 1), rect: CGRect(x: -15, y: -18, width: 28, height: 29))
        addPixel(to: root, color: robe, rect: CGRect(x: -11, y: -15, width: 20, height: 25))
        addPixel(to: root, color: SKColor(red: 0.55, green: 0.37, blue: 0.16, alpha: 1), rect: CGRect(x: -13, y: -13, width: 5, height: 22))
        addPixel(to: root, color: SKColor(red: 0.83, green: 0.60, blue: 0.26, alpha: 1), rect: CGRect(x: 8, y: -10, width: 5, height: 19))
        addPixel(to: root, color: SKColor(red: 0.90, green: 0.78, blue: 0.42, alpha: 1), rect: CGRect(x: -12, y: -8, width: 24, height: 3))
        addPixel(to: root, color: SKColor(red: 0.34, green: 0.19, blue: 0.10, alpha: 1), rect: CGRect(x: -3, y: -4, width: 5, height: 5))
        addPixel(to: root, color: SKColor(red: 0.96, green: 0.72, blue: 0.48, alpha: 1), rect: CGRect(x: -10, y: 10, width: 20, height: 17))
        addPixel(to: root, color: SKColor(red: 0.74, green: 0.53, blue: 0.22, alpha: 1), rect: CGRect(x: -15, y: 25, width: 30, height: 7))
        addPixel(to: root, color: SKColor(red: 0.94, green: 0.75, blue: 0.30, alpha: 1), rect: CGRect(x: -9, y: 32, width: 18, height: 5))
        addPixel(to: root, color: SKColor(white: 0.04, alpha: 1), rect: CGRect(x: -6, y: 18, width: 2, height: 2))
        addPixel(to: root, color: SKColor(white: 0.04, alpha: 1), rect: CGRect(x: 6, y: 18, width: 2, height: 2))
        addPixel(to: root, color: SKColor(red: 0.54, green: 0.29, blue: 0.20, alpha: 1), rect: CGRect(x: 4, y: 12, width: 6, height: 2))
        addPixel(to: root, color: SKColor(red: 0.47, green: 0.30, blue: 0.16, alpha: 1), rect: CGRect(x: 16, y: -24, width: 3, height: 48))
        for step in 0..<5 {
            let offset = CGFloat(step)
            addPixel(to: root, color: SKColor(red: 0.47, green: 0.30, blue: 0.16, alpha: 1), rect: CGRect(x: 18 + offset * 2, y: 18 + offset * 5, width: 4, height: 4))
        }
        addPixel(to: root, color: SKColor(red: 0.68, green: 0.72, blue: 0.74, alpha: 1), rect: CGRect(x: 27, y: 47, width: 13, height: 5))
        addPixel(to: root, color: SKColor(red: 0.86, green: 0.91, blue: 0.92, alpha: 1), rect: CGRect(x: 35, y: 43, width: 5, height: 9))
        addPixel(to: root, color: SKColor(red: 0.42, green: 0.48, blue: 0.50, alpha: 1), rect: CGRect(x: 22, y: 46, width: 5, height: 8))
        addPixel(to: root, color: SKColor(red: 0.49, green: 0.30, blue: 0.18, alpha: 1), rect: CGRect(x: -16, y: -18, width: 5, height: 12))
        addPixel(to: root, color: SKColor(red: 0.88, green: 0.70, blue: 0.34, alpha: 1), rect: CGRect(x: -14, y: 51, width: 4, height: 4))
        root.setScale(1.45)
        return root
    }

    private func updateExplorers(dt: TimeInterval) {
        for explorer in explorers {
            explorer.walkClock += dt
            if explorer.target?.amount ?? 0 <= 0 {
                releaseTarget(for: explorer)
            }
            if explorer.target == nil {
                assignTarget(to: explorer)
            }
            if let target = explorer.target {
                let distance = explorer.node.position.distance(to: target.node.position)
                if distance < 64 {
                    explorer.gatherTimer += dt
                    explorer.action = .chop
                    explorer.status = "CHOP WOOD"
                    explorer.chopSoundCooldown -= dt
                    if explorer.chopSoundCooldown <= 0 {
                        explorer.chopSoundCooldown = 0.34
                        ProceduralSfx.shared.play(.chop)
                        target.node.run(.sequence([
                            .moveBy(x: 5 * explorer.facing, y: 0, duration: 0.04),
                            .moveBy(x: -5 * explorer.facing, y: 0, duration: 0.04)
                        ]))
                    }
                    if explorer.gatherTimer >= 1.35 {
                        collect(target, by: explorer)
                        explorer.gatherTimer = 0
                    }
                } else {
                    if move(explorer, toward: target.node.position, dt: dt) {
                        playStepIfNeeded(for: explorer, dt: dt)
                    }
                    explorer.gatherTimer = 0
                    explorer.status = "TO TREE"
                }
            } else {
                scout(explorer, dt: dt)
            }
            snapExplorerToGround(explorer)
            animate(explorer)
        }
    }

    private func assignTarget(to explorer: Explorer) {
        let available = materials.filter { $0.kind == .wood && $0.amount > 0 && $0.reservedBy == nil }
        guard !available.isEmpty else {
            explorer.status = "NO TREES"
            explorer.action = .idle
            return
        }
        let current = explorer.node.position
        let target = available.min { left, right in
            targetScore(left, from: current) < targetScore(right, from: current)
        }
        explorer.target = target
        explorer.target?.reservedBy = explorer.id
    }

    private func targetScore(_ spot: MaterialSpot, from point: CGPoint) -> CGFloat {
        guard spot.kind == .wood else { return .greatestFiniteMagnitude }
        let distance = point.distance(to: spot.node.position)
        let column = Int(spot.node.position.x / tileSize)
        let discoveryBonus: CGFloat = discoveredColumns.contains(column) ? 130 : -220
        return distance + discoveryBonus
    }

    private func scout(_ explorer: Explorer, dt: TimeInterval) {
        if explorer.scoutTarget == nil || explorer.node.position.distance(to: explorer.scoutTarget ?? .zero) < 40 {
            let direction: CGFloat = Bool.random() ? 1 : -1
            let x = (explorer.node.position.x + direction * CGFloat.random(in: 360...820)).clamped(to: worldMinX + 80...worldMaxX - 80)
            explorer.scoutTarget = CGPoint(x: x, y: surfaceY(at: x) + 58)
        }
        if let point = explorer.scoutTarget {
            explorer.status = "SCOUT"
            if move(explorer, toward: point, dt: dt) {
                playStepIfNeeded(for: explorer, dt: dt)
            }
        }
    }

    @discardableResult
    private func move(_ explorer: Explorer, toward point: CGPoint, dt: TimeInterval) -> Bool {
        let delta = point - explorer.node.position
        guard delta.length > 4 else {
            explorer.action = .idle
            return false
        }
        let direction = delta.normalized()
        let speed = 124 + CGFloat(explorers.count - 1) * 4
        explorer.node.position = explorer.node.position + direction * speed * CGFloat(dt)
        explorer.node.position.x = explorer.node.position.x.clamped(to: worldMinX + 40...worldMaxX - 40)
        explorer.facing = direction.dx >= 0 ? 1 : -1
        explorer.action = .walk
        return true
    }

    private func playStepIfNeeded(for explorer: Explorer, dt: TimeInterval) {
        explorer.stepSoundCooldown -= dt
        if explorer.stepSoundCooldown <= 0 {
            explorer.stepSoundCooldown = 0.30
            ProceduralSfx.shared.play(.step)
        }
    }

    private func snapExplorerToGround(_ explorer: Explorer) {
        let groundY = surfaceY(at: explorer.node.position.x) + 58
        explorer.node.position.y += (groundY - explorer.node.position.y) * 0.18
    }

    private func animate(_ explorer: Explorer) {
        explorer.node.xScale = explorer.facing * 1.45
        switch explorer.action {
        case .walk:
            let bob = sin(explorer.walkClock * 10) * 2
            explorer.node.yScale = 1.45 + bob * 0.012
            explorer.node.zRotation = sin(explorer.walkClock * 10) * 0.025 * explorer.facing
        case .chop:
            explorer.node.yScale = 1.45
            explorer.node.zRotation = sin(explorer.gatherTimer * 22) * 0.075 * explorer.facing
        case .idle:
            explorer.node.yScale = 1.45
            explorer.node.zRotation = 0
        }
    }

    private func collect(_ spot: MaterialSpot, by explorer: Explorer) {
        let amount = spot.amount
        inventory[spot.kind, default: 0] += amount
        spot.amount = 0
        materials.removeAll { $0.id == spot.id }
        spot.node.run(.sequence([
            .scale(to: 1.35, duration: 0.08),
            .fadeOut(withDuration: 0.16),
            .removeFromParent()
        ]))
        showPopup("+\(amount) \(spot.kind.title)", at: spot.node.position + CGPoint(x: 0, y: 38), color: spot.kind.color)
        ProceduralSfx.shared.play(.collect)
        explorer.target = nil
        explorer.action = .idle
        explorer.status = "TREE SEARCH"
    }

    private func releaseTarget(for explorer: Explorer) {
        explorer.target?.reservedBy = nil
        explorer.target = nil
        explorer.gatherTimer = 0
    }

    private func updateDiscovery() {
        for explorer in explorers {
            let center = Int(explorer.node.position.x / tileSize)
            for column in (center - 8)...(center + 8) {
                discoveredColumns.insert(column)
            }
        }
    }

    private func updateCamera() {
        let focus: CGPoint
        if let first = explorers.first {
            focus = first.node.position
        } else {
            focus = CGPoint(x: 0, y: surfaceY(at: 0) + 80)
        }
        let halfWidth = max(160, size.width / 2)
        let halfHeight = max(260, size.height / 2)
        let x = focus.x.clamped(to: worldMinX + halfWidth...worldMaxX - halfWidth)
        let y = (focus.y + 72).clamped(to: worldMinY + halfHeight...worldMaxY - halfHeight)
        cameraRig.position = CGPoint(x: x, y: y)
        updateMiniMap()
    }

    private func updateHud() {
        workerLabel.text = "WOODCUTTERS \(explorers.count) / SUMMONS \(summonCount)"
        let remaining = materials.count
        let task = explorers.first?.status ?? "TAP SUMMON"
        statusLabel.text = isPausedByPlayer ? "STATUS PAUSED" : "STATUS \(task)"
        distanceLabel.text = "FIELD \(Int(worldMaxX - worldMinX))px / NODES \(remaining)"
        for kind in MaterialKind.allCases {
            resourceLabels[kind]?.text = "\(kind.title) \(inventory[kind, default: 0])"
            resourceLabels[kind]?.fontColor = kind.color
        }
        summonButton.strokeColor = canSummon
            ? SKColor(red: 0.96, green: 0.82, blue: 0.38, alpha: 1)
            : SKColor(red: 0.62, green: 0.62, blue: 0.62, alpha: 0.8)
        pauseText.text = isPausedByPlayer ? "RESUME" : "PAUSE"
    }

    private func updateMiniMap() {
        let mapWidth: CGFloat = 176
        if let first = explorers.first {
            miniMapExplorer.isHidden = false
            miniMapExplorer.position = CGPoint(x: mapX(for: first.node.position.x, width: mapWidth), y: miniMapBack.position.y)
            if let target = first.target {
                miniMapTarget.isHidden = false
                miniMapTarget.position = CGPoint(x: mapX(for: target.node.position.x, width: mapWidth), y: miniMapBack.position.y)
            } else {
                miniMapTarget.isHidden = true
            }
        } else {
            miniMapExplorer.isHidden = true
            miniMapTarget.isHidden = true
        }
    }

    private func mapX(for worldX: CGFloat, width: CGFloat) -> CGFloat {
        let progress = ((worldX - worldMinX) / (worldMaxX - worldMinX)).clamped(to: 0...1)
        return miniMapBack.position.x - width / 2 + width * progress
    }

    private func resetRun() {
        explorers.forEach { $0.node.removeFromParent() }
        explorers.removeAll()
        materials.forEach { $0.node.removeFromParent() }
        materials.removeAll()
        inventory = Dictionary(uniqueKeysWithValues: MaterialKind.allCases.map { ($0, 0) })
        discoveredColumns.removeAll()
        summonCount = 0
        isPausedByPlayer = false
        buildMaterials()
        showPopup("RESET", at: CGPoint(x: cameraRig.position.x, y: cameraRig.position.y + 80), color: .white)
    }

    private func showPopup(_ text: String, at position: CGPoint, color: SKColor) {
        let label = SKLabelNode(fontNamed: "Menlo-Bold")
        label.text = text
        label.fontSize = 14
        label.fontColor = color
        label.position = position
        label.zPosition = 100
        effectLayer.addChild(label)
        label.run(.sequence([
            .group([
                .moveBy(x: 0, y: 34, duration: 0.65),
                .fadeOut(withDuration: 0.65)
            ]),
            .removeFromParent()
        ]))
    }

    private func surfaceY(at x: CGFloat) -> CGFloat {
        let column = Int((x / tileSize).rounded())
        if let value = surfaceByColumn[column] {
            return value
        }
        let nearest = surfaceByColumn.keys.min { abs($0 - column) < abs($1 - column) }
        return nearest.flatMap { surfaceByColumn[$0] } ?? generatedSurfaceY(at: x)
    }

    private func addPixel(to node: SKNode, color: SKColor, rect: CGRect) {
        let pixel = SKSpriteNode(color: color, size: rect.size)
        pixel.position = CGPoint(x: rect.midX, y: rect.midY)
        pixel.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        pixel.zPosition = 1
        node.addChild(pixel)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let point = touch.location(in: hudNode)
            if summonButtonFrame.contains(point) {
                summonExplorer()
            } else if pauseButtonFrame.contains(point) {
                isPausedByPlayer.toggle()
            } else if resetButtonFrame.contains(point) {
                resetRun()
            }
        }
    }
}

private extension CGPoint {
    static func +(lhs: CGPoint, rhs: CGPoint) -> CGPoint {
        CGPoint(x: lhs.x + rhs.x, y: lhs.y + rhs.y)
    }

    static func -(lhs: CGPoint, rhs: CGPoint) -> CGPoint {
        CGPoint(x: lhs.x - rhs.x, y: lhs.y - rhs.y)
    }

    static func *(lhs: CGPoint, rhs: CGFloat) -> CGPoint {
        CGPoint(x: lhs.x * rhs, y: lhs.y * rhs)
    }

    func distance(to other: CGPoint) -> CGFloat {
        hypot(x - other.x, y - other.y)
    }

    var length: CGFloat {
        hypot(x, y)
    }

    func normalized() -> CGVector {
        CGVector(dx: x, dy: y).normalized()
    }
}

private extension CGVector {
    static func *(lhs: CGVector, rhs: CGFloat) -> CGPoint {
        CGPoint(x: lhs.dx * rhs, y: lhs.dy * rhs)
    }

    func normalized() -> CGVector {
        let length = hypot(dx, dy)
        guard length > 0.001 else {
            return .zero
        }
        return CGVector(dx: dx / length, dy: dy / length)
    }
}

private extension CGFloat {
    func clamped(to range: ClosedRange<CGFloat>) -> CGFloat {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
