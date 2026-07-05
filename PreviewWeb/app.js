const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha: false });

const ui = {
  workers: document.getElementById("workers"),
  status: document.getElementById("status"),
  field: document.getElementById("field"),
  inventory: document.getElementById("inventory"),
  pause: document.getElementById("pause"),
  reset: document.getElementById("reset"),
  summon: document.getElementById("summon"),
  miniExplorer: document.getElementById("miniExplorer"),
  miniTarget: document.getElementById("miniTarget")
};

const kinds = {
  wood: { title: "WOOD", color: "#935c2e", min: 3, max: 7, weight: 3 },
  stone: { title: "STONE", color: "#8a949e", min: 2, max: 6, weight: 3 },
  ore: { title: "ORE", color: "#bf7a40", min: 2, max: 5, weight: 2 },
  herb: { title: "HERB", color: "#47c763", min: 1, max: 4, weight: 2 },
  crystal: { title: "CRYSTAL", color: "#66ebf2", min: 1, max: 3, weight: 1 }
};

const woodcutterPalettes = [
  {
    outline: "#111419",
    black: "#090b0e",
    boot: "#15191f",
    tunic: "#587078",
    tunicDark: "#2f454c",
    hoodLight: "#c8e6e8",
    hoodMid: "#8fb6bc",
    hoodDark: "#394248",
    skin: "#d6a184",
    purple: "#72528d",
    purpleDark: "#4e386a",
    metal: "#b9c4cc",
    metalLight: "#eef7f8",
    wood: "#75513a",
    belt: "#f2f2e8"
  },
  {
    outline: "#111419",
    black: "#090b0e",
    boot: "#161a20",
    tunic: "#4d626d",
    tunicDark: "#263d46",
    hoodLight: "#d1e9ec",
    hoodMid: "#94bdc3",
    hoodDark: "#343d44",
    skin: "#d8a78b",
    purple: "#8062a0",
    purpleDark: "#513a72",
    metal: "#b8c2cb",
    metalLight: "#eff9fb",
    wood: "#7b573c",
    belt: "#f4f1e5"
  }
];

const weightedKinds = Object.entries(kinds).flatMap(([key, data]) => Array(data.weight).fill(key));
const materialCount = 210;

const world = {
  minX: -5600,
  maxX: 5600,
  minY: -760,
  maxY: 760,
  tile: 32
};

const terrain = {
  cell: 16
};

const view = {
  scale: 0.74
};

const state = {
  camera: { x: 0, y: -80 },
  materials: [],
  explorers: [],
  popups: [],
  inventory: Object.fromEntries(Object.keys(kinds).map((kind) => [kind, 0])),
  discovered: new Set(),
  summons: 0,
  paused: false,
  lastTime: performance.now()
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function surfaceY(x) {
  return -160 + Math.sin((x + 220) / 330) * 44 + Math.sin((x - 120) / 115) * 18;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, window.innerWidth);
  const height = Math.max(480, window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function materialY(kind, x) {
  const offset = { wood: 36, stone: 14, ore: 16, herb: 18, crystal: 24 }[kind];
  return surfaceY(x) + offset;
}

function createMaterials() {
  state.materials = [];
  for (let i = 0; i < materialCount; i += 1) {
    const kind = weightedKinds[randInt(0, weightedKinds.length - 1)];
    const data = kinds[kind];
    const x = world.minX + 220 + i * ((world.maxX - world.minX - 440) / (materialCount - 1)) + rand(-62, 62);
    state.materials.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`,
      kind,
      x,
      y: materialY(kind, x),
      amount: randInt(data.min, data.max),
      reservedBy: null,
      shake: 0
    });
  }
}

const sound = {
  ctx: null,
  master: null
};

function ensureAudio() {
  if (!sound.ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    sound.ctx = new AudioContextClass();
    sound.master = sound.ctx.createGain();
    sound.master.gain.value = 0.26;
    sound.master.connect(sound.ctx.destination);
  }
  if (sound.ctx.state === "suspended") sound.ctx.resume();
  return sound.ctx;
}

function playTone(freq, duration, type = "square", gain = 0.08, delay = 0) {
  const ctxAudio = ensureAudio();
  if (!ctxAudio) return;
  const osc = ctxAudio.createOscillator();
  const amp = ctxAudio.createGain();
  const start = ctxAudio.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(sound.master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playNoise(duration, gain = 0.08, delay = 0) {
  const ctxAudio = ensureAudio();
  if (!ctxAudio) return;
  const length = Math.max(1, Math.floor(ctxAudio.sampleRate * duration));
  const buffer = ctxAudio.createBuffer(1, length, ctxAudio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const src = ctxAudio.createBufferSource();
  const filter = ctxAudio.createBiquadFilter();
  const amp = ctxAudio.createGain();
  const start = ctxAudio.currentTime + delay;
  filter.type = "bandpass";
  filter.frequency.value = 850;
  filter.Q.value = 2.6;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.buffer = buffer;
  src.connect(filter);
  filter.connect(amp);
  amp.connect(sound.master);
  src.start(start);
}

function playSfx(kind) {
  if (kind === "summon") {
    playTone(392, 0.08, "triangle", 0.07);
    playTone(587, 0.10, "triangle", 0.07, 0.05);
    playTone(784, 0.14, "triangle", 0.06, 0.10);
  } else if (kind === "step") {
    playNoise(0.045, 0.035);
    playTone(105, 0.045, "triangle", 0.025);
  } else if (kind === "chop") {
    playNoise(0.075, 0.10);
    playTone(176, 0.055, "square", 0.07);
    playTone(92, 0.08, "triangle", 0.045, 0.025);
  } else if (kind === "collect") {
    playTone(523, 0.08, "triangle", 0.07);
    playTone(659, 0.10, "triangle", 0.06, 0.045);
  } else if (kind === "denied") {
    playTone(150, 0.12, "sawtooth", 0.05);
  }
}

function canSummon() {
  return state.summons === 0 || state.inventory.wood >= 12;
}

function summonExplorer() {
  ensureAudio();
  if (!canSummon()) {
    playSfx("denied");
    addPopup("NEED 12 WOOD", state.camera.x, state.camera.y + 90, "#ffffff");
    return;
  }
  if (state.summons > 0) {
    state.inventory.wood -= 12;
  }
  state.summons += 1;
  const x = rand(-20, 20);
  const explorer = {
    id: crypto.randomUUID ? crypto.randomUUID() : `explorer-${state.summons}`,
    x,
    y: surfaceY(x) + 58,
    target: null,
    scoutX: null,
    gather: 0,
    clock: 0,
    stepTimer: 0,
    chopTimer: 0,
    face: 1,
    action: "idle",
    status: "TREE SEARCH",
    palette: woodcutterPalettes[(state.summons - 1) % woodcutterPalettes.length]
  };
  state.explorers.push(explorer);
  playSfx("summon");
  addPopup(`WOODCUTTER #${state.summons}`, explorer.x, explorer.y + 64, "#ffd84b");
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function scoreMaterial(material, explorer) {
  if (material.kind !== "wood") return Infinity;
  const column = Math.round(material.x / world.tile);
  const discoveryBonus = state.discovered.has(column) ? 130 : -220;
  return distance(explorer.x, explorer.y, material.x, material.y) + discoveryBonus;
}

function assignTarget(explorer) {
  let best = null;
  let bestScore = Infinity;
  for (const material of state.materials) {
    if (material.amount <= 0 || material.reservedBy) continue;
    if (material.kind !== "wood") continue;
    const score = scoreMaterial(material, explorer);
    if (score < bestScore) {
      best = material;
      bestScore = score;
    }
  }
  if (best) {
    best.reservedBy = explorer.id;
    explorer.target = best;
  } else {
    explorer.status = "NO TREES";
    explorer.action = "idle";
  }
}

function moveToward(explorer, x, y, dt) {
  const dx = x - explorer.x;
  const dy = y - explorer.y;
  const length = Math.hypot(dx, dy);
  if (length < 4) return false;
  const speed = 124 + Math.max(0, state.explorers.length - 1) * 4;
  explorer.x = clamp(explorer.x + (dx / length) * speed * dt, world.minX + 40, world.maxX - 40);
  explorer.y += (dy / length) * speed * dt;
  explorer.face = dx >= 0 ? 1 : -1;
  explorer.action = "walk";
  return true;
}

function updateMaterials(dt) {
  for (const material of state.materials) {
    material.shake = Math.max(0, (material.shake || 0) - dt * 3.6);
  }
}

function updateExplorers(dt) {
  for (const explorer of state.explorers) {
    explorer.clock += dt;
    if (explorer.target && explorer.target.amount <= 0) {
      explorer.target = null;
      explorer.gather = 0;
    }
    if (!explorer.target) assignTarget(explorer);
    if (explorer.target) {
      const target = explorer.target;
      const near = distance(explorer.x, explorer.y, target.x, target.y) < 64;
      if (near) {
        explorer.gather += dt;
        explorer.action = "chop";
        explorer.status = "CHOP WOOD";
        explorer.chopTimer -= dt;
        if (explorer.chopTimer <= 0) {
          explorer.chopTimer = 0.34;
          target.shake = 1;
          playSfx("chop");
        }
        if (explorer.gather >= 1.35) {
          state.inventory[target.kind] += target.amount;
          addPopup(`+${target.amount} ${kinds[target.kind].title}`, target.x, target.y + 38, kinds[target.kind].color);
          state.materials = state.materials.filter((item) => item.id !== target.id);
          playSfx("collect");
          explorer.target = null;
          explorer.gather = 0;
          explorer.status = "TREE SEARCH";
          explorer.action = "idle";
        }
      } else {
        const moved = moveToward(explorer, target.x, target.y, dt);
        explorer.stepTimer -= dt;
        if (moved && explorer.stepTimer <= 0) {
          explorer.stepTimer = 0.28;
          playSfx("step");
        }
        explorer.gather = 0;
        explorer.status = "TO TREE";
      }
    } else {
      if (explorer.scoutX === null || Math.abs(explorer.x - explorer.scoutX) < 40) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        explorer.scoutX = clamp(explorer.x + direction * rand(360, 820), world.minX + 80, world.maxX - 80);
      }
      explorer.status = "SCOUT";
      const moved = moveToward(explorer, explorer.scoutX, surfaceY(explorer.scoutX) + 58, dt);
      explorer.stepTimer -= dt;
      if (moved && explorer.stepTimer <= 0) {
        explorer.stepTimer = 0.32;
        playSfx("step");
      }
    }
    explorer.y += (surfaceY(explorer.x) + 58 - explorer.y) * 0.18;
    const center = Math.round(explorer.x / world.tile);
    for (let column = center - 8; column <= center + 8; column += 1) {
      state.discovered.add(column);
    }
  }
}

function updateCamera() {
  const focus = state.explorers[0] || { x: 0, y: surfaceY(0) + 80 };
  const halfW = Math.max(160, visibleWorldHalfWidth());
  const halfH = Math.max(260, visibleWorldHalfHeight());
  const tx = clamp(focus.x, world.minX + halfW, world.maxX - halfW);
  const ty = clamp(focus.y + 72, world.minY + halfH, world.maxY - halfH);
  state.camera.x += (tx - state.camera.x) * 0.12;
  state.camera.y += (ty - state.camera.y) * 0.12;
}

function addPopup(text, x, y, color) {
  state.popups.push({ text, x, y, color, life: 0.75, age: 0 });
}

function updatePopups(dt) {
  for (const popup of state.popups) {
    popup.age += dt;
    popup.y += 38 * dt;
  }
  state.popups = state.popups.filter((popup) => popup.age < popup.life);
}

function worldToScreen(x, y) {
  return {
    x: Math.round(window.innerWidth / 2 + (x - state.camera.x) * view.scale),
    y: Math.round(window.innerHeight / 2 - (y - state.camera.y) * view.scale)
  };
}

function visibleWorldHalfWidth() {
  return window.innerWidth / (view.scale * 2);
}

function visibleWorldHalfHeight() {
  return window.innerHeight / (view.scale * 2);
}

function drawRectWorld(x, y, w, h, color) {
  const p = worldToScreen(x, y);
  const scaledW = Math.max(1, Math.round(w * view.scale));
  const scaledH = Math.max(1, Math.round(h * view.scale));
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(p.x - scaledW / 2), Math.round(p.y - scaledH / 2), scaledW, scaledH);
}

function drawRectFromGround(x, groundY, bottom, w, h, color) {
  drawRectWorld(x, groundY + bottom + h / 2, w, h, color);
}

function hashUnit(a, b = 0, c = 0) {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function drawPixelStepsFromGround(x, groundY, bottom, steps, stepX, stepY, size, color) {
  for (let i = 0; i < steps; i += 1) {
    drawRectFromGround(x + i * stepX, groundY, bottom + i * stepY, size, size, color);
  }
}

function drawLeafBlock(x, groundY, bottom, w, h, color, seed) {
  drawRectFromGround(x, groundY, bottom + 1, w, h, "#1f4a26");
  const speckCount = Math.max(8, Math.floor((w * h) / 42));
  for (let i = 0; i < speckCount; i += 1) {
    const sx = x - w / 2 + 2 + hashUnit(seed, i, 1) * Math.max(4, w - 4);
    const sy = bottom + 2 + hashUnit(seed, i, 2) * Math.max(4, h - 4);
    const roll = hashUnit(seed, i, 3);
    const leaf = roll > 0.78 ? "#b4ee79" : roll > 0.44 ? color : "#2a7135";
    const size = roll > 0.86 ? 3 : 4;
    drawRectFromGround(sx, groundY, sy, size, size, leaf);
  }
  for (let i = 0; i < 6; i += 1) {
    const sx = x - w / 2 + hashUnit(seed, i, 9) * w;
    const sy = bottom + hashUnit(seed, i, 10) * h;
    drawRectFromGround(sx, groundY, sy, 3, 3, "#17351c");
  }
}

function drawCanopyTree(x, groundY, seed = 1, scale = 1) {
  const s = scale;
  drawRectFromGround(x - 5 * s, groundY, 0, 12 * s, 48 * s, "#3b2115");
  drawRectFromGround(x - 2 * s, groundY, 2 * s, 7 * s, 47 * s, "#6b3a1f");
  drawRectFromGround(x + 5 * s, groundY, 5 * s, 4 * s, 41 * s, "#9a5c2a");
  drawPixelStepsFromGround(x - 12 * s, groundY, 24 * s, 6, -4 * s, 5 * s, 5 * s, "#432515");
  drawPixelStepsFromGround(x + 8 * s, groundY, 27 * s, 5, 5 * s, 4 * s, 5 * s, "#5b321b");
  drawPixelStepsFromGround(x - 1 * s, groundY, 45 * s, 5, 0, 5 * s, 5 * s, "#2b1a12");
  drawLeafBlock(x - 26 * s, groundY, 43 * s, 35 * s, 20 * s, "#4faf46", seed + 1);
  drawLeafBlock(x + 0 * s, groundY, 39 * s, 48 * s, 24 * s, "#5bbb4e", seed + 2);
  drawLeafBlock(x + 24 * s, groundY, 46 * s, 32 * s, 20 * s, "#3f983c", seed + 3);
  drawLeafBlock(x - 13 * s, groundY, 60 * s, 41 * s, 19 * s, "#78ca5c", seed + 4);
  drawLeafBlock(x + 11 * s, groundY, 65 * s, 31 * s, 16 * s, "#67bf55", seed + 5);
  drawRectFromGround(x - 31 * s, groundY, 53 * s, 4 * s, 4 * s, "#d0f7a1");
  drawRectFromGround(x + 7 * s, groundY, 73 * s, 4 * s, 4 * s, "#d8ffae");
  drawRectFromGround(x + 20 * s, groundY, 58 * s, 3 * s, 3 * s, "#f2ffd0");
}

function drawPixelHouse(cx, groundY, width, height, roof, wall, seed) {
  drawRectFromGround(cx, groundY, 0, width, height, "#1b1a18");
  drawRectFromGround(cx, groundY, 3, width - 6, height - 6, wall);
  for (let i = 0; i < Math.floor(width / 8); i += 1) {
    const bx = cx - width / 2 + 4 + i * 8;
    drawRectFromGround(bx, groundY, height - 1 + (i % 2) * 2, 8, 5, "#5a2418");
    drawRectFromGround(bx, groundY, height + 4 + (i % 3), 8, 4, roof);
  }
  for (let i = 0; i < 5; i += 1) {
    const wx = cx - width / 2 + 11 + i * 12;
    if (wx > cx + width / 2 - 9) continue;
    drawRectFromGround(wx, groundY, 16 + (i % 2) * 13, 6, 9, "#15191c");
    drawRectFromGround(wx, groundY, 19 + (i % 2) * 13, 3, 3, "#e8f0dc");
  }
  drawRectFromGround(cx - width / 2 + 7, groundY, 5, 5, 15, "#271b14");
  if (hashUnit(seed, 8, 2) > 0.5) {
    drawRectFromGround(cx + width / 2 - 10, groundY, height + 6, 7, 11, "#2b2521");
  }
}

function drawChurch(cx, groundY) {
  drawRectFromGround(cx, groundY, 0, 74, 36, "#eee7da");
  drawRectFromGround(cx, groundY, 33, 80, 6, "#4e2018");
  drawRectFromGround(cx - 4, groundY, 39, 70, 6, "#a94823");
  drawRectFromGround(cx + 16, groundY, 35, 21, 44, "#f5f0e6");
  drawRectFromGround(cx + 16, groundY, 75, 26, 7, "#57231a");
  drawRectFromGround(cx + 16, groundY, 82, 18, 5, "#b95127");
  drawRectFromGround(cx + 16, groundY, 52, 11, 15, "#d4af35");
  drawRectFromGround(cx + 16, groundY, 91, 4, 25, "#e6e2d7");
  drawRectFromGround(cx + 16, groundY, 101, 18, 3, "#e6e2d7");
  drawRectFromGround(cx - 24, groundY, 13, 8, 12, "#171a1c");
  drawRectFromGround(cx - 3, groundY, 13, 8, 12, "#171a1c");
  drawRectFromGround(cx + 36, groundY, 13, 8, 12, "#171a1c");
}

function drawGraveCluster(cx, groundY, seed) {
  for (let i = 0; i < 7; i += 1) {
    const x = cx - 52 + i * 18 + hashUnit(seed, i, 1) * 7;
    const h = 23 + hashUnit(seed, i, 2) * 19;
    drawRectFromGround(x, groundY, 0, 9, h, "#252b2c");
    drawRectFromGround(x + 2, groundY, 3, 5, h - 5, "#596161");
    if (i % 2 === 0) drawRectFromGround(x, groundY, h + 1, 15, 4, "#69716c");
  }
}

function drawBackgroundLandmarks() {
  const items = [
    { type: "house", x: -820, width: 56, height: 48, roof: "#b14622", wall: "#f1eadb" },
    { type: "house", x: -680, width: 82, height: 74, roof: "#9f351d", wall: "#eee6d7" },
    { type: "house", x: -360, width: 66, height: 46, roof: "#a23c20", wall: "#eee6d5" },
    { type: "graves", x: -110 },
    { type: "tree", x: 80 },
    { type: "graves", x: 290 },
    { type: "church", x: 610 },
    { type: "house", x: 1160, width: 78, height: 32, roof: "#9a371e", wall: "#eadcca" }
  ];
  for (const item of items) {
    if (Math.abs(item.x - state.camera.x) > visibleWorldHalfWidth() + 340) continue;
    const groundY = surfaceY(item.x) + 2;
    if (item.type === "house") drawPixelHouse(item.x, groundY, item.width, item.height, item.roof, item.wall, item.x);
    if (item.type === "church") drawChurch(item.x, groundY);
    if (item.type === "graves") drawGraveCluster(item.x, groundY, item.x);
    if (item.type === "tree") drawCanopyTree(item.x, groundY, 34, 1.25);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight);
  gradient.addColorStop(0, "#3f78d1");
  gradient.addColorStop(0.54, "#5fb8d4");
  gradient.addColorStop(1, "#75bd81");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

  const sun = worldToScreen(-3050, 560);
  ctx.fillStyle = "#ffd15a";
  ctx.fillRect(sun.x - 46, sun.y - 46, 92, 92);

  ctx.fillStyle = "rgba(255,255,255,0.26)";
  for (let i = 0; i < 42; i += 1) {
    const x = world.minX + i * 188 + Math.sin(i * 37.3) * 42;
    const y = 420 + Math.sin(i * 11.4) * 130;
    const p = worldToScreen(x, y);
    ctx.fillRect(p.x - 32, p.y - 5, 28 + (i % 3) * 6, 6);
    ctx.fillRect(p.x - 10, p.y - 11, 24 + (i % 2) * 8, 6);
    ctx.fillRect(p.x + 14, p.y - 3, 34 + (i % 4) * 7, 6);
  }

  drawBackgroundLandmarks();
}

function tileColor(depth, column) {
  if (depth < 32) return column % 2 === 0 ? "#2e8a42" : "#246f38";
  if (depth < 190) return column % 3 === 0 ? "#5c4933" : "#6b5238";
  return column % 4 === 0 ? "#31343a" : "#25282e";
}

function terrainPalette(depth, column, row) {
  const variant = hashUnit(column, row, 4);
  if (depth < 32) {
    return {
      outer: "#101814",
      inner: variant > 0.5 ? "#2f8840" : "#26723a",
      light: "#74be58",
      dark: "#173b24",
      moss: "#8ddb62"
    };
  }
  if (depth < 190) {
    return {
      outer: "#161311",
      inner: variant > 0.55 ? "#765b3d" : "#604a34",
      light: "#9a754d",
      dark: "#35281c",
      moss: "#4c8b35"
    };
  }
  return {
    outer: "#101116",
    inner: variant > 0.55 ? "#343841" : "#282c34",
    light: "#545b68",
    dark: "#191b20",
    moss: "#315a3b"
  };
}

function drawFineTerrainCell(x, y, surface, column, row) {
  const depth = surface - y;
  const p = worldToScreen(x, y);
  const palette = terrainPalette(depth, column, row);
  const size = Math.max(2, Math.round(terrain.cell * view.scale));
  ctx.fillStyle = palette.outer;
  ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  ctx.fillStyle = palette.inner;
  ctx.fillRect(p.x - size / 2 + 2, p.y - size / 2 + 2, size - 4, size - 4);
  ctx.fillStyle = palette.light;
  ctx.fillRect(p.x - size / 2 + 2, p.y - size / 2 + 2, size - 5, 2);
  ctx.fillRect(p.x - size / 2 + 2, p.y - size / 2 + 4, 2, size - 7);
  ctx.fillStyle = palette.dark;
  ctx.fillRect(p.x - size / 2 + 3, p.y + size / 2 - 4, size - 5, 2);
  ctx.fillRect(p.x + size / 2 - 4, p.y - size / 2 + 4, 2, size - 7);
  for (let i = 0; i < 4; i += 1) {
    const r = hashUnit(column, row, i * 13);
    if (r < 0.64) {
      const mx = p.x - 5 + Math.floor(hashUnit(column, row, i) * 10);
      const my = p.y - 5 + Math.floor(hashUnit(column, row, i + 9) * 10);
      ctx.fillStyle = r < 0.2 ? palette.light : r < 0.42 ? palette.dark : palette.moss;
      ctx.fillRect(mx, my, 2, 2);
    }
  }
  if (depth > 40 && depth < 170 && hashUnit(column, row, 99) > 0.78) {
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i % 2 ? "#68b24c" : "#315e2d";
      ctx.fillRect(p.x - 5 + i * 4, p.y - 2 + i * 3, 3, 3);
    }
  }
}

function drawTerrain() {
  const half = visibleWorldHalfWidth();
  const start = Math.floor((state.camera.x - half - 120) / terrain.cell);
  const end = Math.ceil((state.camera.x + half + 120) / terrain.cell);
  const yStart = Math.floor(world.minY / terrain.cell) * terrain.cell;
  for (let column = start; column <= end; column += 1) {
    const x = column * terrain.cell;
    if (x < world.minX - terrain.cell || x > world.maxX + terrain.cell) continue;
    const surface = surfaceY(x);
    let row = 0;
    for (let y = yStart; y <= surface; y += terrain.cell) {
      drawFineTerrainCell(x, y, surface, column, row);
      row += 1;
    }
    drawRectFromGround(x, surface, -2, terrain.cell + 2, 4, "#142414");
    drawRectFromGround(x, surface, 0, terrain.cell + 2, 4, tileColor(0, column));
    if (column % 5 === 0) {
      drawRectFromGround(x - 6, surface, 0, 2, 15, "#8be05a");
      drawRectFromGround(x, surface, 0, 2, 10, "#47bd4a");
      drawRectFromGround(x + 5, surface, 0, 2, 13, "#b5f070");
    }
    if (column % 17 === 0) {
      drawPixelStepsFromGround(x + 2, surface, 2, 5, 2, 4, 3, "#2f6b32");
    }
  }
}

function drawMaterial(material) {
  const data = kinds[material.kind];
  const x = material.x;
  const y = surfaceY(x);
  if (material.kind === "wood") {
    const wobble = Math.sin(performance.now() / 28) * (material.shake || 0) * 5;
    drawCanopyTree(x + wobble, y, Math.round(x), 1.0);
    if ((material.shake || 0) > 0.2) {
      drawRectFromGround(x + 8, y, 15, 8, 4, "#f4d29b");
      drawRectFromGround(x + 18, y, 23, 4, 4, "#ffdca8");
      drawRectFromGround(x - 15, y, 8, 3, 3, "#d49a52");
    }
  } else if (material.kind === "stone") {
    drawRectFromGround(x - 8, y, 0, 24, 9, "#4c535c");
    drawRectFromGround(x + 8, y, 3, 22, 10, data.color);
    drawRectFromGround(x - 10, y, 8, 12, 6, "#a8b0b8");
    drawRectFromGround(x + 2, y, 10, 9, 5, "#bcc4c9");
    drawRectFromGround(x + 13, y, 7, 4, 4, "#303842");
    drawRectFromGround(x - 2, y, 3, 3, 3, "#d7dee0");
  } else if (material.kind === "ore") {
    drawRectFromGround(x - 4, y, 0, 34, 13, "#303640");
    drawRectFromGround(x + 10, y, 5, 23, 12, "#555d6a");
    drawRectFromGround(x - 13, y, 8, 8, 8, data.color);
    drawRectFromGround(x - 3, y, 5, 5, 5, "#e79a48");
    drawRectFromGround(x + 8, y, 10, 5, 5, "#ffc06c");
    drawRectFromGround(x + 16, y, 14, 4, 4, "#ffe0a8");
    drawRectFromGround(x - 18, y, 2, 3, 3, "#11151a");
  } else if (material.kind === "herb") {
    drawRectFromGround(x, y, 0, 3, 27, data.color);
    drawPixelStepsFromGround(x - 3, y, 6, 4, -4, 3, 4, "#85f073");
    drawPixelStepsFromGround(x + 3, y, 9, 4, 4, 4, 4, "#33a857");
    drawRectFromGround(x - 6, y, 24, 5, 5, "#b9ff8c");
    drawRectFromGround(x + 5, y, 28, 4, 4, "#f0ffd0");
  } else {
    drawRectFromGround(x, y, 0, 12, 36, data.color);
    drawPixelStepsFromGround(x - 8, y, 5, 4, -2, 6, 5, "#4d8ee0");
    drawPixelStepsFromGround(x + 8, y, 7, 5, 2, 5, 5, "#51c8f1");
    drawRectFromGround(x, y, 13, 4, 18, "#d1ffff");
    drawRectFromGround(x - 2, y, 34, 7, 6, "#eaffff");
    drawRectFromGround(x + 5, y, 25, 3, 4, "#ffffff");
  }
}

function drawGate() {
  const x = 0;
  const y = surfaceY(0);
  const pulse = 1 + Math.sin(performance.now() / 180) * 0.04;
  drawRectFromGround(x, y, 0, 84 * pulse, 14, "#38335a");
  drawRectFromGround(x - 23, y, 10, 14, 54, "#efbd47");
  drawRectFromGround(x + 23, y, 10, 14, 54, "#efbd47");
  drawRectFromGround(x, y, 13, 34 * pulse, 44, "rgba(92,235,245,0.78)");
  drawRectFromGround(x - 23, y, 58, 17, 7, "#fff0a2");
  drawRectFromGround(x + 23, y, 58, 17, 7, "#fff0a2");
}

function drawExplorer(explorer) {
  const x = explorer.x;
  const walking = explorer.action === "walk";
  const walk = walking ? Math.sin(explorer.clock * 10) : 0;
  const chop = explorer.action === "chop" ? Math.sin(explorer.gather * 22) : 0;
  const footY = explorer.y - 58;
  const bodyY = footY + (walking ? Math.abs(walk) * 1.5 : 0);
  const face = explorer.face;
  const palette = explorer.palette || woodcutterPalettes[0];
  const leftLift = walking ? Math.max(0, walk) * 4 : 0;
  const rightLift = walking ? Math.max(0, -walk) * 4 : 0;
  const leftStep = walking ? -walk * face * 3 : 0;
  const rightStep = walking ? walk * face * 3 : 0;
  const leftFootX = x - 9 + leftStep;
  const rightFootX = x + 8 + rightStep;
  const capeSwing = walking ? walk * 1.5 : 0;

  drawRectFromGround(x + 18 + capeSwing, bodyY, 8, 13, 34, palette.purpleDark);
  drawRectFromGround(x + 24 + capeSwing, bodyY, 2, 9, 20, palette.purple);
  drawRectFromGround(x + 13 + capeSwing, bodyY, 36, 8, 10, palette.purple);

  drawRectFromGround(leftFootX, footY, leftLift, 9, 6, palette.black);
  drawRectFromGround(rightFootX, footY, rightLift, 9, 6, palette.black);
  drawRectFromGround(leftFootX + 1, footY, 6 + leftLift, 6, 17 - leftLift * 0.45, palette.tunicDark);
  drawRectFromGround(rightFootX - 1, footY, 6 + rightLift, 6, 17 - rightLift * 0.45, palette.hoodDark);
  drawRectFromGround(x - 1, bodyY, 21, 28, 30, palette.outline);
  drawRectFromGround(x - 2, bodyY, 24, 20, 25, palette.tunic);
  drawRectFromGround(x - 9, bodyY, 25, 5, 22, palette.hoodMid);
  drawRectFromGround(x + 8, bodyY, 27, 5, 20, palette.purple);
  drawRectFromGround(x - 1, bodyY, 32, 23, 3, palette.outline);
  drawRectFromGround(x + 1, bodyY, 35, 10, 4, palette.belt);
  drawRectFromGround(x - 1, bodyY, 47, 22, 17, palette.skin);
  drawRectFromGround(x - 1, bodyY, 49, 17, 12, palette.hoodLight);
  drawRectFromGround(x - 11, bodyY, 45, 7, 18, palette.hoodMid);
  drawRectFromGround(x + 10, bodyY, 46, 7, 15, palette.hoodMid);
  drawRectFromGround(x - 12, bodyY, 55, 6, 9, palette.black);
  drawRectFromGround(x + 8, bodyY, 55, 9, 9, palette.hoodDark);
  drawRectFromGround(x - 1, bodyY, 60, 29, 7, palette.hoodMid);
  drawRectFromGround(x - 1, bodyY, 66, 20, 6, palette.hoodLight);
  drawRectFromGround(x - 4 * face, bodyY, 54, 3, 4, palette.black);
  drawRectFromGround(x + 5 * face, bodyY, 54, 2, 4, "#f4f8ff");
  drawRectFromGround(x + 8 * face, bodyY, 49, 6, 2, "#7a4b43");
  drawPixelStepsFromGround(x + 4, bodyY, 70, 5, 5, 4, 4, palette.purpleDark);
  drawPixelStepsFromGround(x + 6, bodyY, 73, 4, 5, -2, 4, palette.purple);
  drawRectFromGround(x - 15, bodyY, 24, 5, 13, palette.black);
  drawRectFromGround(x + 13, bodyY, 26, 5, 13, palette.skin);
  const axeBaseX = x + 14 * face;
  if (explorer.action === "chop") {
    const raised = chop > 0 ? 1 : -1;
    drawPixelStepsFromGround(axeBaseX, bodyY, 24 + raised * 6, 8, 3 * face, 5 * raised, 3, palette.wood);
    drawRectFromGround(x + 36 * face, bodyY, 51 + raised * 17, 14, 5, palette.metal);
    drawRectFromGround(x + 42 * face, bodyY, 47 + raised * 17, 6, 9, palette.metalLight);
    drawRectFromGround(x + 30 * face, bodyY, 50 + raised * 17, 5, 8, palette.hoodDark);
  } else {
    drawPixelStepsFromGround(axeBaseX, bodyY, 18, 8, 2 * face, 5, 3, palette.wood);
    drawRectFromGround(x + 28 * face, bodyY, 57, 13, 5, palette.metal);
    drawRectFromGround(x + 34 * face, bodyY, 53, 5, 9, palette.metalLight);
  }
  if (explorer.action === "chop" && chop < -0.25) {
    drawRectFromGround(x + 38 * face, bodyY, 22, 3, 3, "#f4d29b");
    drawRectFromGround(x + 46 * face, bodyY, 29, 3, 3, "#ffdca8");
  }
}

function drawPopups() {
  ctx.font = "700 14px Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const popup of state.popups) {
    const p = worldToScreen(popup.x, popup.y);
    ctx.globalAlpha = 1 - popup.age / popup.life;
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  drawBackground();
  drawTerrain();
  for (const material of state.materials) {
    const visible = Math.abs(material.x - state.camera.x) < visibleWorldHalfWidth() + 160;
    if (visible) drawMaterial(material);
  }
  drawGate();
  for (const explorer of state.explorers) drawExplorer(explorer);
  drawPopups();
}

function updateUi() {
  ui.workers.textContent = `WOODCUTTERS ${state.explorers.length} / SUMMONS ${state.summons}`;
  const task = state.explorers[0] ? state.explorers[0].status : "TAP SUMMON";
  ui.status.textContent = state.paused ? "STATUS PAUSED" : `STATUS ${task}`;
  ui.field.textContent = `FIELD ${world.maxX - world.minX}px / NODES ${state.materials.length}`;
  ui.inventory.innerHTML = Object.keys(kinds).map((kind) => (
    `<li style="color:${kinds[kind].color}">${kinds[kind].title} ${state.inventory[kind]}</li>`
  )).join("");
  ui.pause.textContent = state.paused ? "RESUME" : "PAUSE";
  ui.summon.classList.toggle("locked", !canSummon());

  const first = state.explorers[0];
  if (first) {
    const progress = (first.x - world.minX) / (world.maxX - world.minX);
    ui.miniExplorer.style.left = `${clamp(progress, 0, 1) * 100}%`;
    ui.miniExplorer.style.display = "block";
    if (first.target) {
      const targetProgress = (first.target.x - world.minX) / (world.maxX - world.minX);
      ui.miniTarget.style.left = `${clamp(targetProgress, 0, 1) * 100}%`;
      ui.miniTarget.style.display = "block";
    } else {
      ui.miniTarget.style.display = "none";
    }
  } else {
    ui.miniExplorer.style.display = "none";
    ui.miniTarget.style.display = "none";
  }
}

function tick(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 1 / 20);
  state.lastTime = now;
  if (!state.paused) {
    updateExplorers(dt);
    updateMaterials(dt);
  }
  updateCamera();
  updatePopups(dt);
  draw();
  updateUi();
  requestAnimationFrame(tick);
}

function reset() {
  state.materials = [];
  state.explorers = [];
  state.popups = [];
  state.inventory = Object.fromEntries(Object.keys(kinds).map((kind) => [kind, 0]));
  state.discovered.clear();
  state.summons = 0;
  state.paused = false;
  state.camera.x = 0;
  state.camera.y = -80;
  createMaterials();
  addPopup("RESET", 0, surfaceY(0) + 110, "#ffffff");
}

ui.summon.addEventListener("click", summonExplorer);
ui.pause.addEventListener("click", () => {
  state.paused = !state.paused;
});
ui.reset.addEventListener("click", reset);
window.addEventListener("resize", resize);

resize();
createMaterials();
requestAnimationFrame(tick);
