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

const weightedKinds = Object.entries(kinds).flatMap(([key, data]) => Array(data.weight).fill(key));
const world = {
  minX: -3840,
  maxX: 3840,
  minY: -760,
  maxY: 760,
  tile: 32
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
  for (let i = 0; i < 145; i += 1) {
    const kind = weightedKinds[randInt(0, weightedKinds.length - 1)];
    const data = kinds[kind];
    const x = world.minX + 180 + i * ((world.maxX - world.minX - 360) / 144) + rand(-54, 54);
    state.materials.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${i}`,
      kind,
      x,
      y: materialY(kind, x),
      amount: randInt(data.min, data.max),
      reservedBy: null
    });
  }
}

function canSummon() {
  return state.summons === 0 || (state.inventory.wood >= 8 && state.inventory.stone >= 5);
}

function summonExplorer() {
  if (!canSummon()) {
    addPopup("NEED 8 WOOD + 5 STONE", state.camera.x, state.camera.y + 90, "#ffffff");
    return;
  }
  if (state.summons > 0) {
    state.inventory.wood -= 8;
    state.inventory.stone -= 5;
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
    face: 1,
    status: "SEARCH",
    color: ["#2e8ad6", "#c7576b", "#6b9e47", "#ad7adb"][(state.summons - 1) % 4]
  };
  state.explorers.push(explorer);
  addPopup(`SUMMONED #${state.summons}`, explorer.x, explorer.y + 64, "#ffd84b");
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function scoreMaterial(material, explorer) {
  const column = Math.round(material.x / world.tile);
  const discoveryBonus = state.discovered.has(column) ? 130 : -220;
  const rarityBias = { wood: 0, stone: 0, herb: -45, ore: -70, crystal: -110 }[material.kind];
  return distance(explorer.x, explorer.y, material.x, material.y) + discoveryBonus + rarityBias;
}

function assignTarget(explorer) {
  let best = null;
  let bestScore = Infinity;
  for (const material of state.materials) {
    if (material.amount <= 0 || material.reservedBy) continue;
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
    explorer.status = "FIELD CLEAR";
  }
}

function moveToward(explorer, x, y, dt) {
  const dx = x - explorer.x;
  const dy = y - explorer.y;
  const length = Math.hypot(dx, dy);
  if (length < 4) return;
  const speed = 124 + Math.max(0, state.explorers.length - 1) * 4;
  explorer.x = clamp(explorer.x + (dx / length) * speed * dt, world.minX + 40, world.maxX - 40);
  explorer.y += (dy / length) * speed * dt;
  explorer.face = dx >= 0 ? 1 : -1;
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
      moveToward(explorer, target.x, target.y, dt);
      const near = distance(explorer.x, explorer.y, target.x, target.y) < 64;
      if (near) {
        explorer.gather += dt;
        explorer.status = `GATHER ${kinds[target.kind].title}`;
        if (explorer.gather >= 0.72) {
          state.inventory[target.kind] += target.amount;
          addPopup(`+${target.amount} ${kinds[target.kind].title}`, target.x, target.y + 38, kinds[target.kind].color);
          state.materials = state.materials.filter((item) => item.id !== target.id);
          explorer.target = null;
          explorer.gather = 0;
          explorer.status = "SEARCH";
        }
      } else {
        explorer.gather = 0;
        explorer.status = `TO ${kinds[target.kind].title}`;
      }
    } else {
      if (explorer.scoutX === null || Math.abs(explorer.x - explorer.scoutX) < 40) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        explorer.scoutX = clamp(explorer.x + direction * rand(360, 820), world.minX + 80, world.maxX - 80);
      }
      explorer.status = "SCOUT";
      moveToward(explorer, explorer.scoutX, surfaceY(explorer.scoutX) + 58, dt);
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
  const halfW = Math.max(160, window.innerWidth / 2);
  const halfH = Math.max(260, window.innerHeight / 2);
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
    x: Math.round(window.innerWidth / 2 + x - state.camera.x),
    y: Math.round(window.innerHeight / 2 - (y - state.camera.y))
  };
}

function drawRectWorld(x, y, w, h, color) {
  const p = worldToScreen(x, y);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h);
}

function drawRectFromGround(x, groundY, bottom, w, h, color) {
  drawRectWorld(x, groundY + bottom + h / 2, w, h, color);
}

function hashUnit(a, b = 0, c = 0) {
  const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function drawLeafBlock(x, groundY, bottom, w, h, color, seed) {
  drawRectFromGround(x, groundY, bottom, w, h, color);
  const speckCount = Math.max(2, Math.floor((w * h) / 140));
  for (let i = 0; i < speckCount; i += 1) {
    const sx = x - w / 2 + 4 + hashUnit(seed, i, 1) * (w - 8);
    const sy = bottom + 3 + hashUnit(seed, i, 2) * Math.max(4, h - 6);
    const bright = hashUnit(seed, i, 3) > 0.45 ? "#94d96b" : "#2a7a3d";
    drawRectFromGround(sx, groundY, sy, 5, 5, bright);
  }
}

function drawCanopyTree(x, groundY, seed = 1, scale = 1) {
  const trunkW = 11 * scale;
  drawRectFromGround(x - 4 * scale, groundY, 0, trunkW, 43 * scale, "#63371d");
  drawRectFromGround(x + 4 * scale, groundY, 4 * scale, 6 * scale, 36 * scale, "#8b542a");
  drawRectFromGround(x - 8 * scale, groundY, 16 * scale, 7 * scale, 23 * scale, "#4c2a17");
  drawRectFromGround(x + 10 * scale, groundY, 17 * scale, 12 * scale, 5 * scale, "#7a4724");
  drawLeafBlock(x - 24 * scale, groundY, 38 * scale, 34 * scale, 18 * scale, "#4cae42", seed + 1);
  drawLeafBlock(x + 1 * scale, groundY, 34 * scale, 46 * scale, 22 * scale, "#54b64a", seed + 2);
  drawLeafBlock(x + 22 * scale, groundY, 42 * scale, 30 * scale, 18 * scale, "#3d963b", seed + 3);
  drawLeafBlock(x - 11 * scale, groundY, 54 * scale, 38 * scale, 18 * scale, "#77c85d", seed + 4);
  drawLeafBlock(x + 11 * scale, groundY, 59 * scale, 28 * scale, 15 * scale, "#66be54", seed + 5);
  drawRectFromGround(x - 29 * scale, groundY, 47 * scale, 8 * scale, 8 * scale, "#b8ef86");
  drawRectFromGround(x + 8 * scale, groundY, 66 * scale, 6 * scale, 6 * scale, "#cdf59a");
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
}

function tileColor(depth, column) {
  if (depth < 38) return column % 2 === 0 ? "#3a9148" : "#2e7c40";
  if (depth < 190) return column % 3 === 0 ? "#5f4a33" : "#6f5437";
  return column % 4 === 0 ? "#34363c" : "#272a30";
}

function drawTerrainDetails(x, y, surface, column, row) {
  const depth = surface - y;
  const baseX = x - world.tile / 2;
  const baseY = y - world.tile / 2;
  const cells = 4;
  for (let ix = 0; ix < cells; ix += 1) {
    for (let iy = 0; iy < cells; iy += 1) {
      const r = hashUnit(column, row, ix * 7 + iy);
      if (r < 0.28 && depth < 38) {
        ctx.fillStyle = r < 0.12 ? "#68b657" : "#2f7940";
      } else if (r < 0.42 && depth < 190) {
        ctx.fillStyle = r < 0.20 ? "#8a6842" : "#493724";
      } else if (r < 0.34) {
        ctx.fillStyle = r < 0.17 ? "#4a4f58" : "#1e2025";
      } else {
        continue;
      }
      const p = worldToScreen(baseX + ix * 8 + 4, baseY + iy * 8 + 4);
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
  }
  if (depth < 38) {
    for (let i = 0; i < 4; i += 1) {
      if (hashUnit(column, i, 77) > 0.72) {
        const grassX = x - 13 + i * 8;
        drawRectFromGround(grassX, surface, 0, 3, 9 + i % 2 * 5, "#93dd5f");
      }
    }
  }
}

function drawTerrain() {
  const start = Math.floor((state.camera.x - window.innerWidth / 2 - 80) / world.tile);
  const end = Math.ceil((state.camera.x + window.innerWidth / 2 + 80) / world.tile);
  for (let column = start; column <= end; column += 1) {
    const x = column * world.tile;
    if (x < world.minX - world.tile || x > world.maxX + world.tile) continue;
    const surface = surfaceY(x);
    let row = 0;
    for (let y = world.minY; y <= surface; y += world.tile) {
      drawRectWorld(x, y, world.tile + 1, world.tile + 1, tileColor(surface - y, column));
      drawTerrainDetails(x, y, surface, column, row);
      row += 1;
    }
    if (column % 9 === 0) {
      drawRectFromGround(x - 6, surface, 0, 3, 18, "#5cd65a");
      drawRectFromGround(x, surface, 0, 3, 12, "#47bd4a");
      drawRectFromGround(x + 6, surface, 0, 3, 16, "#63e060");
    }
  }
}

function drawMaterial(material) {
  const data = kinds[material.kind];
  const x = material.x;
  const y = surfaceY(x);
  if (material.kind === "wood") {
    drawCanopyTree(x, y, Math.round(x), 1.0);
  } else if (material.kind === "stone") {
    drawRectFromGround(x - 6, y, 0, 28, 12, data.color);
    drawRectFromGround(x + 8, y, 4, 22, 12, "#727b86");
    drawRectFromGround(x - 8, y, 10, 16, 8, "#a3abb3");
    drawRectFromGround(x + 4, y, 3, 6, 5, "#424956");
  } else if (material.kind === "ore") {
    drawRectFromGround(x - 4, y, 0, 34, 15, "#464b55");
    drawRectFromGround(x + 10, y, 5, 24, 13, "#5a6070");
    drawRectFromGround(x - 11, y, 8, 10, 9, data.color);
    drawRectFromGround(x + 3, y, 4, 7, 7, "#e69b4a");
    drawRectFromGround(x + 15, y, 11, 6, 6, "#ffc06c");
  } else if (material.kind === "herb") {
    drawRectFromGround(x, y, 0, 4, 25, data.color);
    drawRectFromGround(x - 8, y, 6, 14, 6, "#85f073");
    drawRectFromGround(x + 10, y, 13, 16, 6, "#33a857");
    drawRectFromGround(x - 3, y, 22, 7, 7, "#b9ff8c");
    drawRectFromGround(x + 4, y, 25, 5, 5, "#f0ffd0");
  } else {
    drawRectFromGround(x, y, 0, 14, 38, data.color);
    drawRectFromGround(x - 10, y, 4, 10, 24, "#4d8ee0");
    drawRectFromGround(x + 10, y, 7, 9, 28, "#51c8f1");
    drawRectFromGround(x, y, 13, 5, 20, "#d1ffff");
    drawRectFromGround(x - 2, y, 35, 8, 7, "#eaffff");
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
  const footY = explorer.y - 58 + Math.sin(explorer.clock * 10) * 2;
  const face = explorer.face;
  drawRectFromGround(x - 11, footY, 0, 9, 8, "#1b1f27");
  drawRectFromGround(x + 7, footY, 0, 9, 8, "#1b1f27");
  drawRectFromGround(x - 9, footY, 8, 7, 17, "#313947");
  drawRectFromGround(x + 8, footY, 8, 7, 17, "#313947");
  drawRectFromGround(x, footY, 24, 30, 26, explorer.color);
  drawRectFromGround(x, footY, 45, 23, 18, "#f5b87a");
  drawRectFromGround(x, footY, 60, 29, 9, "#2c1a13");
  drawRectFromGround(x - 12, footY, 27, 9, 25, "#273142");
  drawRectFromGround(x + 14, footY, 28, 7, 22, "#f5b87a");
  drawRectFromGround(x, footY, 33, 30, 4, "#f0ce5b");
  drawRectFromGround(x - 2, footY, 36, 7, 6, "#6a3a1f");
  drawRectFromGround(x + 16 * face, footY, 16, 4, 48, "#8d7044");
  drawRectFromGround(x + 18 * face, footY, 56, 10, 10, "#62e7f0");
  drawRectFromGround(x + 18 * face, footY, 67, 6, 9, "#eaffff");
  drawRectFromGround(x - 5 * face, footY, 53, 3, 3, "#0d0d0d");
  drawRectFromGround(x + 5 * face, footY, 53, 3, 3, "#0d0d0d");
  drawRectFromGround(x + 7 * face, footY, 48, 7, 2, "#8a4a32");
  drawRectFromGround(x - 13, footY, 22, 6, 12, "#7c4c2d");
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
    const visible = Math.abs(material.x - state.camera.x) < window.innerWidth / 2 + 90;
    if (visible) drawMaterial(material);
  }
  drawGate();
  for (const explorer of state.explorers) drawExplorer(explorer);
  drawPopups();
}

function updateUi() {
  ui.workers.textContent = `EXPLORERS ${state.explorers.length} / SUMMONS ${state.summons}`;
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
  if (!state.paused) updateExplorers(dt);
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
