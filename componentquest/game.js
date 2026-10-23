(() => {
  "use strict";
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const W = 960,
    H = 540;
  // Cache only viewport-space gradients with fixed geometry. The cache is bounded and
  // discarded on canvas resize; moving/world-space gradients are deliberately not cached.
  const viewportGradientCache = new Map();
  function cachedViewportGradient(key, create) {
    let gradient = viewportGradientCache.get(key);
    if (gradient) return gradient;
    gradient = create();
    if (viewportGradientCache.size >= 32)
      viewportGradientCache.delete(viewportGradientCache.keys().next().value);
    viewportGradientCache.set(key, gradient);
    return gradient;
  }
  // The canvas is the game's only bitmap. Limit both DPR and total pixel area
  // to keep its RGBA backing store under roughly 6.8 MB, even on high-DPI screens.
  const MAX_RENDER_DPR = 1.5;
  const MAX_CANVAS_PIXELS = 1_700_000;
  let renderScaleX = 1,
    renderScaleY = 1;
  let resizeObserver = null;
  function resizeCanvas() {
    const cssRect = canvas.getBoundingClientRect();
    const cssWidth = cssRect.width || W;
    const cssHeight = cssRect.height || (cssWidth * H) / W;
    const requestedDpr = Math.min(
      MAX_RENDER_DPR,
      Math.max(1, window.devicePixelRatio || 1),
    );
    const areaLimitedDpr = Math.sqrt(
      MAX_CANVAS_PIXELS / Math.max(1, cssWidth * cssHeight),
    );
    const dpr = Math.min(requestedDpr, areaLimitedDpr);
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      viewportGradientCache.clear();
    }
    renderScaleX = canvas.width / W;
    renderScaleY = canvas.height / H;
    ctx.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
  }
  const keys = new Set();
  const buttonHits = [];
  let buttonHitCount = 0;
  const BASE_MACHINE_TYPES = ["CPU", "RAM", "GPU"];
  const ALL_PART_TYPES = ["CPU", "RAM", "GPU", "SSD", "COOLER"];
  const campaignStages = [
    {
      title: "PERUSKOKOONPANO",
      objective: "Kerää CPU, RAM ja GPU. Lopuksi GO-maaliin.",
      collectTypes: BASE_MACHINE_TYPES,
      machineTypes: BASE_MACHINE_TYPES,
    },
    {
      title: "TIETOKONEEN PÄIVITYS",
      objective: "Kerää NVMe-SSD ja prosessorijäähdytin.",
      collectTypes: ["SSD", "COOLER"],
      machineTypes: ALL_PART_TYPES,
    },
  ];
  let stageIndex = 0;
  let types = [...campaignStages[0].collectTypes]; // Components to collect/install during this stage.
  function activeMachineTypes() {
    return campaignStages[stageIndex].machineTypes;
  }
  const info = {
    CPU: {
      name: "Prosessori",
      short: "CPU",
      detail: "Suorittaa laskutoimituksia ja käsittelee ohjelmien käskyjä.",
    },
    RAM: {
      name: "Keskusmuisti",
      short: "RAM",
      detail: "Pitää käynnissä olevien tehtävien tiedot nopeasti saatavilla.",
    },
    GPU: {
      name: "Näytönohjain",
      short: "GPU",
      detail: "Auttaa tuottamaan pelien ja sovellusten grafiikkaa.",
    },
    SSD: {
      name: "NVMe-SSD",
      short: "SSD",
      detail:
        "Tallentaa käyttöjärjestelmän, ohjelmat ja tiedostot myös virran katketessa.",
    },
    COOLER: {
      name: "Prosessorijäähdytin",
      short: "JÄÄHDYTIN",
      detail: "Siirtää prosessorin lämpöä pois, jotta se ei ylikuumene.",
    },
  };
  let state = "title";
  let gameStartedAt = 0;
  // Freeze elapsed time when the player successfully completes the hardware POST test.
  let completionElapsedMs = null;
  let finalScoreValue = null;
  let lastActivityAt = performance.now();
  let lastPointer = { x: 0, y: 0 };
  let globalNotice = "";
  let globalNoticeUntil = 0;
  let toast = "";
  let toastUntil = 0;
  let score = 0; // points earned before deductions
  let assemblyDisplayScore = null; // freeze visible score during assembly; penalties are revealed after POST test
  let mistakes = 0;
  let penaltyPoints = 0;
  let bootStartedAt = 0;
  // Fade the current scene down, switch while the screen is dark, then fade
  // the next scene up. This avoids a hard cut and prevents duplicate/blurred text.
  let sceneTransitionTargetState = null;
  let sceneTransitionStartedAt = 0;
  let sceneTransitionSwitched = false;
  const SCENE_FADE_OUT_MS = 300;
  const SCENE_FADE_IN_MS = 460;
  const SCENE_TRANSITION_MS = SCENE_FADE_OUT_MS + SCENE_FADE_IN_MS;
  let finishStartedAt = 0;
  let lastGoalNoticeAt = 0;
  const WRONG_INSTALL_PENALTY = 50;
  const MAX_SCORE = 1000;
  const IDLE_TIMEOUT_MS = 60_000;
  const IDLE_WARNING_MS = IDLE_TIMEOUT_MS - 10_000;
  const MAX_SESSION_MS = 300_000;
  let cameraX = 0;
  let cameraY = 480;
  const floorY = 1000;
  const worldWidth = 3600;
  const worldHeight = 1220;
  // These are route personalities, not fixed levels. Every start generates a
  // new platform layout from scratch; the names merely describe the route's feel.
  const levelDefinitions = [
    {
      name: "PROSESSORIHARJANTE",
      note: "Nouse piirilevyn portaita",
      profile: "ridge",
    },
    { name: "MUISTISILTA", note: "Hyppää muistipankkien yli", profile: "wave" },
    { name: "PIIRITORNI", note: "Kiipeä emolevyn yläosiin", profile: "tower" },
  ];
  const levelPalettes = [
    {
      board: ["#173f49", "#0d3440", "#102b41", "#081a2d"],
      trace: "#43d9b8",
      platform: ["#689b8e", "#286d67", "#15454e", "#092531"],
    },
    {
      board: ["#17445b", "#12364b", "#12304a", "#081b2d"],
      trace: "#58baff",
      platform: ["#79a9bd", "#326f8a", "#164a67", "#092b42"],
    },
    {
      board: ["#382b51", "#292946", "#163347", "#081a2d"],
      trace: "#b6a1ff",
      platform: ["#a397ba", "#655b8d", "#38375f", "#1b2340"],
    },
  ];
  let activeLevel = { ...levelDefinitions[0], theme: 0 };
  let activeLevelIndex = 0; // palette index; chosen independently from the route shape
  let lastLevelIndex = -1;
  let lastRouteProfileIndex = -1;
  let mapCode = "----";
  // Every run has a fresh 64-bit seed: 2^64 (~18.4 quintillion) possible seeds.
  // Levels are generated as a few small arrays on demand; none are stored in a catalog.
  const UINT64_MASK = (1n << 64n) - 1n;
  const SPLITMIX_INCREMENT = 0x9e3779b97f4a7c15n;
  let activeLevelSeed = 0n;
  let lastLevelSeed = null;
  let levelRngState = 0n;
  function createLevelSeed() {
    let seed;
    try {
      const words = new Uint32Array(2);
      window.crypto.getRandomValues(words);
      seed = ((BigInt(words[0]) << 32n) | BigInt(words[1])) & UINT64_MASK;
    } catch (_) {
      seed =
        ((BigInt(Date.now()) << 24n) ^
          BigInt(Math.floor(Math.random() * 0x100000000)) ^
          BigInt(Math.floor(performance.now() * 1000))) &
        UINT64_MASK;
    }
    if (lastLevelSeed !== null && seed === lastLevelSeed)
      seed = (seed + 1n) & UINT64_MASK;
    lastLevelSeed = seed;
    activeLevelSeed = seed;
    levelRngState = seed;
    return seed;
  }
  function levelRandom() {
    let z = (levelRngState =
      (levelRngState + SPLITMIX_INCREMENT) & UINT64_MASK);
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
    z ^= z >> 31n;
    return Number(z >> 11n) / 9007199254740992;
  }
  let player = {
    x: 70,
    y: floorY - 59,
    w: 29,
    h: 41,
    vx: 0,
    vy: 0,
    grounded: true,
    checkpointX: 70,
    checkpointY: floorY - 59,
    face: 1,
    walk: 0,
    jumpsUsed: 0,
  };
  // Previous fixed-step state is used only for render interpolation. Simulation values
  // stay untouched between updates, so input/collisions never use interpolated values.
  let previousPlayerX = player.x,
    previousPlayerY = player.y;
  let previousCameraX = cameraX,
    previousCameraY = cameraY;
  function syncPhysicsRenderState(clearAccumulator = false) {
    previousPlayerX = player.x;
    previousPlayerY = player.y;
    previousCameraX = cameraX;
    previousCameraY = cameraY;
    physicsSnapRequested = false;
    if (clearAccumulator) physicsAccumulator = 0;
  }
  // Testable name retained for deterministic scene transitions and QA snapshots.
  function syncRenderSnapshot() {
    syncPhysicsRenderState(true);
  }
  let jumpQueued = false;
  let collected = Object.fromEntries(
    ALL_PART_TYPES.map((type) => [type, false]),
  );
  // placements[part] stores the socket where that physical part was dropped.
  // A wrong socket is still accepted so the player can test a bad build and learn why it fails.
  let installed = Object.fromEntries(
    ALL_PART_TYPES.map((type) => [type, false]),
  );
  let placements = Object.fromEntries(
    ALL_PART_TYPES.map((type) => [type, null]),
  );
  let correctInstallAwarded = Object.fromEntries(
    ALL_PART_TYPES.map((type) => [type, false]),
  );
  let dragOrigin = null;
  // Physics advances at a stable 60 Hz, independently of the display refresh rate.
  // Rendering itself is not capped: requestAnimationFrame paints at the browser's refresh rate.
  const FIXED_STEP_MS = 1000 / 60;
  const MAX_FRAME_DELTA_MS = 100;
  const MAX_PHYSICS_STEPS_PER_FRAME = 6;
  let lastFrame = performance.now();
  let physicsAccumulator = 0;
  let physicsSnapRequested = false;
  let dragType = null;
  let pointer = { x: 0, y: 0, down: false };
  let stars = Array.from({ length: 95 }, (_, i) => ({
    x: (i * 137.31) % W,
    y: (i * 73.7) % H,
    r: 0.5 + (i % 4) * 0.3,
    a: 0.18 + (i % 5) * 0.1,
  }));
  let platforms = [];
  let items = [];
  let hazards = [];
  // All five physical socket positions are fixed and separated. The same PCB layout
  // is retained for the upgrade level, so existing parts never jump to another place.
  let slots = {};
  const socketTemplate = {
    CPU: { x: 365, y: 198, w: 64, h: 64 },
    RAM: { x: 465, y: 203, w: 88, h: 33 },
    GPU: { x: 389, y: 315, w: 124, h: 50 },
    SSD: { x: 453, y: 265, w: 88, h: 22 },
    COOLER: { x: 351, y: 267, w: 58, h: 41 },
  };
  const trays = {
    CPU: { x: 48, y: 157, w: 225, h: 70 },
    RAM: { x: 48, y: 244, w: 225, h: 70 },
    GPU: { x: 48, y: 331, w: 225, h: 70 },
    SSD: { x: 48, y: 190, w: 225, h: 70 },
    COOLER: { x: 48, y: 284, w: 225, h: 70 },
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function roundRect(c, x, y, w, h, r, fill, stroke, line = 1) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.lineWidth = line;
      c.strokeStyle = stroke;
      c.stroke();
    }
  }
  const fontCache = new Map();
  function text(
    str,
    x,
    y,
    size = 14,
    color = "#edf7ff",
    weight = 600,
    align = "left",
  ) {
    const fontKey = weight * 100 + size;
    let font = fontCache.get(fontKey);
    if (!font) {
      font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
      fontCache.set(fontKey, font);
    }
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }
  function addButton(id, label, x, y, w, h, opts = {}) {
    const hovered =
      pointer.x >= x &&
      pointer.x <= x + w &&
      pointer.y >= y &&
      pointer.y <= y + h;
    const fill = opts.fill || (hovered ? "#70f1ed" : "#4edbd8");
    roundRect(
      ctx,
      x,
      y,
      w,
      h,
      opts.radius || 13,
      opts.disabled ? "#213747" : fill,
      opts.stroke || "rgba(190,255,255,.22)",
      1,
    );
    if (opts.disabled) {
      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.fillRect(x, y, w, h);
    }
    text(
      label,
      x + w / 2,
      y + h / 2 + 1,
      opts.size || 15,
      opts.disabled ? "#b8cde0" : opts.color || "#061820",
      850,
      "center",
    );
    let hit = buttonHits[buttonHitCount];
    if (!hit) {
      hit = {};
      buttonHits.push(hit);
    }
    hit.id = id;
    hit.x = x;
    hit.y = y;
    hit.w = w;
    hit.h = h;
    hit.disabled = !!opts.disabled;
    buttonHitCount++;
  }
  function shuffle(list, randomFn = levelRandom) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function randomizeSlots() {
    // Called only for a fresh campaign. Socket positions are intentionally fixed for
    // every retry and upgrade so components remain physically aligned on one motherboard.
    slots = Object.fromEntries(
      Object.entries(socketTemplate).map(([type, sl]) => [
        type,
        { ...sl, cx: sl.x + sl.w / 2, cy: sl.y + sl.h / 2 },
      ]),
    );
  }
  function generateLevelLayout() {
    createLevelSeed();
    const routeStyle =
      levelDefinitions[Math.floor(levelRandom() * levelDefinitions.length)];
    activeLevelIndex = Math.floor(levelRandom() * levelPalettes.length);
    activeLevel = { ...routeStyle, theme: activeLevelIndex };
    // A stable 13-character base-36 level ID is useful for identifying a map.
    mapCode = activeLevelSeed.toString(36).toUpperCase().padStart(13, "0");

    // Each run uses 12–16 platforms. The number of platforms and gaps are coupled
    // to preserve approachable jumps and produce many more route shapes.
    const count = 12 + Math.floor(levelRandom() * 5);
    const startX = Math.round(203 + levelRandom() * 25);
    const targetGap = 192 + levelRandom() * 28;
    const endX = Math.round(
      Math.min(worldWidth - 300, startX + (count - 1) * targetGap),
    );
    const startY = Math.round(838 + levelRandom() * 30);
    const endProgressY = Math.round(320 + levelRandom() * 110);
    const span = endX - startX;
    const phase = levelRandom() * Math.PI * 2;
    const waveRate = 2.0 + levelRandom() * 1.35;
    const waveAmplitude = 42 + levelRandom() * 34;
    const jitter = Array.from({ length: count }, (_, i) =>
      i === 0 || i === count - 1 ? 0 : Math.round((levelRandom() - 0.5) * 20),
    );
    const route = [];
    let previousY = startY;
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const x = Math.round(startX + span * progress + jitter[i]);
      let y;
      if (i === 0) y = startY;
      else {
        const baseline = startY + (endProgressY - startY) * progress;
        let shape = 0;
        if (routeStyle.profile === "ridge")
          shape = Math.sin(i * 0.78 + phase) * 25 + (levelRandom() - 0.5) * 62;
        else if (routeStyle.profile === "wave")
          shape =
            Math.sin(progress * Math.PI * waveRate + phase) * waveAmplitude +
            (levelRandom() - 0.5) * 48;
        else {
          const shelf =
            i % 4 === 0 ? -34 : i % 4 === 1 ? 27 : i % 4 === 2 ? -12 : 39;
          shape =
            Math.sin(i * 1.68 + phase) * 38 +
            shelf +
            (levelRandom() - 0.5) * 50;
        }
        const desired = baseline + shape;
        // A single jump is enough for every rise; double jump provides forgiveness.
        const minY = Math.max(278, previousY - 84);
        const maxY = Math.min(872, previousY + 68);
        y = Math.round(clamp(desired, minY, maxY));
      }
      const w = Math.round(139 + levelRandom() * 19);
      route.push({ x, y, w });
      previousY = y;
    }
    platforms = route.map((p, i) => ({
      x: p.x,
      y: p.y,
      w: p.w,
      h: 18,
      index: i,
    }));

    // Pickups are selected before hazards, so their spacing can be guaranteed
    // without allowing an electrical hazard to overlap a required component.
    const candidates = platforms.filter(
      (p) => p.index >= 1 && p.index <= count - 2,
    );
    const pickupCount = Math.min(types.length, candidates.length);
    let chosenPlatforms = null;
    // Generalized reservoir sampling selects the number of platforms this stage needs.
    // Minimum horizontal spacing prevents component sprites from overlapping in the map.
    function chooseSeparatedPlatforms(minGap) {
      let chosen = null,
        seen = 0;
      const selected = [];
      function visit(start) {
        if (selected.length === pickupCount) {
          seen++;
          if (levelRandom() < 1 / seen) chosen = selected.slice();
          return;
        }
        const remaining = pickupCount - selected.length;
        for (let i = start; i <= candidates.length - remaining; i++) {
          const p = candidates[i];
          if (selected.length && p.x - selected[selected.length - 1].x < minGap)
            continue;
          selected.push(p);
          visit(i + 1);
          selected.pop();
        }
      }
      visit(0);
      return chosen;
    }
    for (const minGap of [480, 430, 380, 330, 280, 0]) {
      chosenPlatforms = chooseSeparatedPlatforms(minGap);
      if (chosenPlatforms) break;
    }
    if (!chosenPlatforms) {
      chosenPlatforms = [];
      for (let i = 0; i < pickupCount; i++) {
        const at =
          pickupCount === 1
            ? Math.floor(candidates.length / 2)
            : Math.round((i * (candidates.length - 1)) / (pickupCount - 1));
        chosenPlatforms.push(candidates[at]);
      }
    }
    chosenPlatforms.sort((a, b) => a.x - b.x);
    const pickupTypes = shuffle(types);
    items = chosenPlatforms.map((p, i) => ({
      type: pickupTypes[i],
      x: p.x + p.w / 2,
      y: p.y - 36,
      got: false,
      platformIndex: p.index,
      phase: levelRandom() * Math.PI * 2,
    }));
    const pickupIndices = new Set(chosenPlatforms.map((p) => p.index));
    const hazardPool = platforms.filter(
      (p) =>
        p.index >= 2 && p.index <= count - 3 && !pickupIndices.has(p.index),
    );
    const hazardCount = Math.min(
      hazardPool.length,
      2 + Math.floor(levelRandom() * 3),
    );
    hazards = shuffle(hazardPool)
      .slice(0, hazardCount)
      .map((p) => ({
        x: p.x + Math.min(86, p.w * 0.55),
        y: p.y - 13,
        w: Math.min(36, p.w * 0.28),
        h: 13,
        platformIndex: p.index,
        phase: levelRandom() * Math.PI * 2,
      }));
  }
  function resetSession(reason = "") {
    state = "title";
    gameStartedAt = 0;
    completionElapsedMs = null;
    finalScoreValue = null;
    score = 0;
    assemblyDisplayScore = null;
    mistakes = 0;
    penaltyPoints = 0;
    bootStartedAt = 0;
    finishStartedAt = 0;
    lastGoalNoticeAt = 0;
    cameraX = 0;
    cameraY = 480;
    dragType = null;
    dragOrigin = null;
    pointer.down = false;
    jumpQueued = false;
    sceneTransitionTargetState = null;
    sceneTransitionStartedAt = 0;
    sceneTransitionSwitched = false;
    stageIndex = 0;
    types = [...campaignStages[0].collectTypes];
    player = {
      x: 70,
      y: floorY - 59,
      w: 29,
      h: 41,
      vx: 0,
      vy: 0,
      grounded: true,
      checkpointX: 70,
      checkpointY: floorY - 59,
      face: 1,
      walk: 0,
      jumpsUsed: 0,
    };
    collected = Object.fromEntries(ALL_PART_TYPES.map((type) => [type, false]));
    installed = Object.fromEntries(ALL_PART_TYPES.map((type) => [type, false]));
    placements = Object.fromEntries(ALL_PART_TYPES.map((type) => [type, null]));
    correctInstallAwarded = Object.fromEntries(
      ALL_PART_TYPES.map((type) => [type, false]),
    );
    generateLevelLayout();
    randomizeSlots();
    syncPhysicsRenderState(true);
    keys.clear();
    toast = "";
    toastUntil = 0;
    globalNotice = reason || "";
    globalNoticeUntil = reason ? performance.now() + 3000 : 0;
  }
  function beginSession() {
    resetSession();
    state = "platformer";
    gameStartedAt = performance.now();
    lastActivityAt = performance.now();
    cameraX = 0;
    cameraY = 480;
    lastFrame = performance.now();
    syncPhysicsRenderState(true);
    canvas.focus({ preventScroll: true });
  }
  function beginNextStage() {
    if (stageIndex >= campaignStages.length - 1) return;
    stageIndex++;
    types = [...campaignStages[stageIndex].collectTypes];
    for (const type of types) {
      collected[type] = false;
      installed[type] = false;
      placements[type] = null;
      correctInstallAwarded[type] = false;
    }
    // Keep the working PC and its earlier components; only the new level and pickups change.
    generateLevelLayout();
    player = {
      x: 70,
      y: floorY - 59,
      w: 29,
      h: 41,
      vx: 0,
      vy: 0,
      grounded: true,
      checkpointX: 70,
      checkpointY: floorY - 59,
      face: 1,
      walk: 0,
      jumpsUsed: 0,
    };
    state = "platformer";
    cameraX = 0;
    cameraY = 480;
    jumpQueued = false;
    dragType = null;
    dragOrigin = null;
    assemblyDisplayScore = null;
    bootStartedAt = 0;
    finishStartedAt = 0;
    completionElapsedMs = null;
    finalScoreValue = null;
    sceneTransitionTargetState = null;
    sceneTransitionStartedAt = 0;
    sceneTransitionSwitched = false;
    keys.clear();
    lastActivityAt = performance.now();
    toast = "";
    toastUntil = 0;
    syncPhysicsRenderState(true);
    lastFrame = performance.now();
    notify(
      `TASO ${stageIndex + 1}/${campaignStages.length}: kerää SSD ja prosessorijäähdytin.`,
      3200,
    );
    canvas.focus({ preventScroll: true });
  }
  function activity() {
    if (state !== "title") {
      lastActivityAt = performance.now();
    }
  }
  function allCollected() {
    return types.every((t) => collected[t]);
  }
  function allInstalled() {
    return types.every((t) => placements[t] !== null);
  }
  function allCorrectlyInstalled() {
    return activeMachineTypes().every((t) => placements[t] === t);
  }
  function socketOccupant(socketType) {
    return (
      ALL_PART_TYPES.find((part) => placements[part] === socketType) || null
    );
  }
  function installReason(partType, socketType) {
    if (partType === socketType) return "";
    const reasons = {
      CPU: {
        RAM: "Prosessori ei sovi RAM-muistipaikkaan. CPU tarvitsee emolevyn prosessorikannan.",
        GPU: "Prosessori ei sovi PCIe x16 -paikkaan; liittimet ja käyttötarkoitukset eroavat.",
        SSD: "Prosessori ei sovi M.2-tallennuspaikkaan.",
        COOLER:
          "Prosessori ei ole jäähdytin; jäähdytin kiinnitetään prosessorin päälle.",
      },
      RAM: {
        CPU: "RAM-muisti ei sovi prosessorikantaan. Muistikampa tarvitsee pitkän DIMM-paikan.",
        GPU: "RAM-muisti ei sovi PCIe-paikkaan.",
        SSD: "RAM-muisti ei sovi M.2-paikkaan; SSD kiinnitetään lyhyeen M.2-liittimeen.",
        COOLER: "RAM-muisti ei sovi jäähdyttimen kiinnikkeisiin.",
      },
      GPU: {
        CPU: "Näytönohjain on liian suuri prosessorikantaan ja tarvitsee PCIe x16 -paikan.",
        RAM: "Näytönohjain ei sovi kapeaan DIMM-muistipaikkaan.",
        SSD: "Näytönohjain ei sovi M.2-liittimeen; se tarvitsee pitkän PCIe x16 -paikan.",
        COOLER: "Näytönohjain ei sovi jäähdyttimen kiinnikkeisiin.",
      },
      SSD: {
        CPU: "M.2-SSD ei sovi prosessorikantaan. Se tarvitsee M.2 M-key -liittimen.",
        RAM: "M.2-SSD ei sovi DIMM-muistipaikkaan.",
        GPU: "M.2-SSD ei sovi täyspitkään PCIe x16 -asennuspaikkaan.",
        COOLER: "M.2-SSD ei sovi jäähdyttimen kiinnikkeisiin.",
      },
      COOLER: {
        CPU: "Jäähdytin ei ole prosessori. Se asennetaan prosessorikannan päälle omilla kiinnikkeillään.",
        RAM: "Prosessorijäähdytin ei sovi DIMM-muistipaikkaan.",
        GPU: "Prosessorijäähdytin ei sovi PCIe x16 -paikkaan.",
        SSD: "Prosessorijäähdytin ei sovi M.2-tallennuspaikkaan.",
      },
    };
    return (
      reasons[partType]?.[socketType] ||
      "Komponentti ei vastaa tämän liitännän muotoa tai käyttötarkoitusta."
    );
  }
  function installDiagnostics() {
    return activeMachineTypes()
      .filter((part) => placements[part] !== null && placements[part] !== part)
      .map((part) => ({
        part,
        socket: placements[part],
        reason: installReason(part, placements[part]),
      }));
  }
  function bootDurationMs() {
    const brokenIndex = activeMachineTypes().findIndex(
      (type) => placements[type] !== type,
    );
    // Detect the first failed POST item quickly, then leave enough time to read it.
    return brokenIndex < 0 ? 5000 : 1350 + brokenIndex * 360;
  }
  function getFinishGate() {
    const platform = platforms[platforms.length - 1] || {
      x: 2500,
      y: 350,
      w: 150,
    };
    return { x: platform.x + platform.w * 0.68, y: platform.y - 42, platform };
  }
  function currentScore() {
    return Math.min(MAX_SCORE, Math.max(0, score - penaltyPoints));
  }
  function addScore(points) {
    score = Math.min(MAX_SCORE, score + Math.max(0, points));
  }
  function completionScore() {
    if (finalScoreValue !== null) return finalScoreValue;
    if (stageIndex < campaignStages.length - 1) return currentScore();
    const bonus = 200 + (elapsed() < 180000 ? 250 : 0);
    return Math.min(MAX_SCORE, Math.max(0, currentScore() + bonus));
  }
  function elapsed() {
    if (completionElapsedMs !== null) return completionElapsedMs;
    return gameStartedAt ? Math.max(0, performance.now() - gameStartedAt) : 0;
  }
  function timeString(ms) {
    const total = Math.ceil(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  function notify(s, duration = 2100) {
    toast = s;
    toastUntil = performance.now() + duration;
  }
  // Death always restarts the current generated level from its starting dock, never a nearby checkpoint.
  function respawnAtLevelStart(message) {
    const startGroundY = floorY - 18;
    player.x = 70;
    player.y = startGroundY - player.h;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.jumpsUsed = 0;
    player.face = 1;
    player.walk = 0;
    player.checkpointX = 70;
    player.checkpointY = startGroundY - player.h;
    cameraX = 0;
    cameraY = 480;
    jumpQueued = false;
    // Snap the render interpolation after death; never draw a ghost trail from the hazard.
    physicsSnapRequested = true;
    notify(message, 2100);
  }

  function drawBackground(t, bright = false) {
    // Layered, cinematic motherboard environment with crisp vector detail.
    const base = cachedViewportGradient(`bg-base-${bright ? 1 : 0}`, () => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, bright ? "#111d3b" : "#0b1830");
      g.addColorStop(0.42, bright ? "#101f39" : "#0a172c");
      g.addColorStop(1, "#050b19");
      return g;
    });
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const glow = (x, y, r, color) => {
      const key = `bg-glow-${x}-${y}-${r}-${color}`;
      const g = cachedViewportGradient(key, () => {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        return gradient;
      });
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    glow(745, 150, 350, "rgba(38,135,230,.24)");
    glow(330, 420, 320, "rgba(24,211,183,.10)");
    glow(830, 440, 240, "rgba(125,77,255,.10)");

    // Fine engineering grid fading toward the horizon.
    ctx.save();
    const fade = cachedViewportGradient("bg-grid-fade", () => {
      const g = ctx.createLinearGradient(0, 190, 0, H);
      g.addColorStop(0, "rgba(30,99,144,0)");
      g.addColorStop(1, "rgba(41,111,151,.18)");
      return g;
    });
    ctx.strokeStyle = fade;
    ctx.lineWidth = 1;
    for (let x = -40; x < W + 80; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 175);
      ctx.lineTo(x - 110, 540);
      ctx.stroke();
    }
    for (let y = 205; y < H; y += 27) {
      ctx.globalAlpha = 0.38 + (y / H) * 0.35;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    // Long PCB traces with metallic pads and small right-angle bends.
    ctx.save();
    for (let i = 0; i < 15; i++) {
      const x = (i * 83 + 19) % W,
        y = 75 + ((i * 59) % 325),
        len = 42 + (i % 4) * 19;
      ctx.globalAlpha = 0.12 + (i % 3) * 0.045;
      ctx.strokeStyle =
        i % 4 === 0 ? "#947dff" : i % 3 === 0 ? "#36d7bb" : "#429ce7";
      ctx.lineWidth = i % 5 === 0 ? 2 : 1.15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * 0.46, y);
      ctx.lineTo(x + len * 0.6, y + 12);
      ctx.lineTo(x + len, y + 12);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(x + len, y + 12, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(140,212,255,.25)";
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.restore();

    // Keep the backdrop graphic crisp; hardware detail is drawn sharply in the playable world.

    // Tiny status lights drift subtly; all are positioned deterministically.
    for (const star of stars) {
      const pulse = 0.72 + 0.28 * Math.sin(t / 520 + star.x * 0.03);
      ctx.globalAlpha = star.a * pulse;
      ctx.fillStyle = star.x % 5 < 1 ? "#b8a4ff" : "#8be9ff";
      ctx.fillRect(
        Math.round(star.x),
        Math.round(star.y),
        Math.max(1, star.r),
        Math.max(1, star.r),
      );
    }
    ctx.globalAlpha = 1;
    const sx = ((t * 0.035) % (W + 240)) - 120;
    ctx.save();
    ctx.translate(sx, 0);
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = "#4dc9ff";
    ctx.fillRect(78, 0, 76, H);
    ctx.globalAlpha = 0.018;
    ctx.fillRect(35, 0, 43, H);
    ctx.fillRect(154, 0, 42, H);
    ctx.restore();
  }
  function drawCircuitDecor(x, y, w, h, alpha = 0.35) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2;
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const yy = y + i * (h / (rows - 1));
      ctx.strokeStyle = i % 2 ? "#4b8cff" : "#29dbc2";
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w * 0.25, yy);
      ctx.lineTo(x + w * 0.31, yy + 7);
      ctx.lineTo(x + w * 0.62, yy + 7);
      ctx.lineTo(x + w * 0.68, yy - 3);
      ctx.lineTo(x + w, yy - 3);
      ctx.stroke();
      ctx.fillStyle = i % 2 ? "#739aff" : "#66f8d8";
      ctx.beginPath();
      ctx.arc(x + w, yy - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function drawComponent(type, cx, cy, s = 1, glow = true) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    const accent =
      type === "CPU"
        ? "#f3bf55"
        : type === "RAM"
          ? "#5acb86"
          : type === "GPU"
            ? "#77a7fa"
            : type === "SSD"
              ? "#6eacee"
              : "#bd9bff";
    if (glow) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 60);
      g.addColorStop(0, accent);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-62, -62, 124, 124);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "#020611";
    ctx.beginPath();
    ctx.ellipse(
      3,
      24,
      type === "GPU"
        ? 49
        : type === "RAM"
          ? 38
          : type === "SSD"
            ? 31
            : type === "COOLER"
              ? 30
              : 31,
      5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
    if (type === "CPU") {
      // A desktop processor: dark organic substrate, plated heat spreader and gold contacts.
      for (let i = 0; i < 8; i++) {
        const q = -24 + i * 7;
        ctx.fillStyle = "#d8aa4c";
        ctx.fillRect(q, 25, 4, 5);
        ctx.fillRect(q, -30, 4, 4);
        ctx.fillRect(-30, q, 4, 4);
        ctx.fillRect(26, q, 4, 4);
      }
      roundRect(ctx, -30, -30, 60, 60, 5, "#152329", "#d6b86e", 1.5);
      const substrate = ctx.createLinearGradient(-28, -27, 28, 28);
      substrate.addColorStop(0, "#35554b");
      substrate.addColorStop(0.5, "#18372f");
      substrate.addColorStop(1, "#0b211f");
      roundRect(ctx, -27, -27, 54, 54, 4, substrate, "#759b7d", 1);
      // Fine PCB traces are visible at the four edges of the package.
      ctx.strokeStyle = "rgba(204,180,102,.72)";
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const q = -18 + i * 12;
        ctx.beginPath();
        ctx.moveTo(q, -25);
        ctx.lineTo(q + 3, -21);
        ctx.moveTo(q, 25);
        ctx.lineTo(q + 3, 21);
        ctx.stroke();
      }
      roundRect(ctx, -22, -22, 44, 44, 4, "#5b6873", "#d5e1e4", 1.4);
      const lid = ctx.createLinearGradient(-22, -22, 22, 22);
      lid.addColorStop(0, "#f1f4ed");
      lid.addColorStop(0.28, "#c7d0d1");
      lid.addColorStop(0.58, "#8c9ca5");
      lid.addColorStop(0.79, "#d8e0e1");
      lid.addColorStop(1, "#778b99");
      roundRect(ctx, -20, -20, 40, 40, 3, lid, "#f0f6ee", 1);
      // Subtle brushed-metal lines, not a glowing cartoon chip.
      ctx.strokeStyle = "rgba(255,255,255,.30)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-15, -12 + i * 5);
        ctx.lineTo(15, -12 + i * 5);
        ctx.stroke();
      }
      text("CPU", 0, 1, 11, "#263847", 950, "center");
      ctx.fillStyle = "rgba(52,75,86,.72)";
      for (let i = 0; i < 5; i++) ctx.fillRect(-11 + i * 5.5, 11, 3.4, 1.2);
      roundRect(ctx, -16, -16, 7, 2, 1, "rgba(255,255,255,.7)", null);
      ctx.fillStyle = "#f1d47d";
      ctx.beginPath();
      ctx.moveTo(18, -19);
      ctx.lineTo(21, -19);
      ctx.lineTo(21, -16);
      ctx.closePath();
      ctx.fill();
    } else if (type === "RAM") {
      // Full DIMM stick with PCB, IC packages, SPD sticker and gold edge fingers.
      for (let i = 0; i < 16; i++) {
        const x = -38 + i * 5;
        ctx.fillStyle = i % 4 === 0 ? "#f8d276" : "#c79a40";
        ctx.fillRect(x, 13, 3.5, 8);
      }
      const pcb = ctx.createLinearGradient(0, -15, 0, 14);
      pcb.addColorStop(0, "#28764b");
      pcb.addColorStop(0.28, "#145c39");
      pcb.addColorStop(0.75, "#0a3828");
      pcb.addColorStop(1, "#09281e");
      roundRect(ctx, -41, -15, 82, 29, 2, pcb, "#81bb85", 1.2);
      ctx.strokeStyle = "rgba(141,219,151,.55)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) {
        const x = -34 + i * 16;
        ctx.beginPath();
        ctx.moveTo(x, -10);
        ctx.lineTo(x + 4, -6);
        ctx.lineTo(x + 4, 8);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const x = -34 + i * 9.5;
        roundRect(ctx, x, -10, 7, 16, 1.5, "#111b23", "#66836d", 0.8);
        ctx.fillStyle = "#344d42";
        ctx.fillRect(x + 1, -8, 5, 4);
        ctx.fillStyle = "rgba(255,255,255,.18)";
        ctx.fillRect(x + 1, -8, 5, 1);
      }
      roundRect(ctx, -9, -11, 19, 7, 1, "#d0d6bd", "#eef1dd", 0.5);
      ctx.fillStyle = "#556f5d";
      ctx.fillRect(-6, -9, 12, 1);
      ctx.fillRect(-6, -7, 7, 1);
      // Key notch in the contacts makes the module identifiable.
      ctx.fillStyle = "#102a1e";
      ctx.fillRect(1, 12, 7, 6);
      ctx.fillStyle = "#8bc78e";
      ctx.fillRect(-39, -13, 78, 1);
    } else if (type === "GPU") {
      // Discrete graphics card: PCIe board, dual axial fans, metal I/O bracket and edge contacts.
      ctx.fillStyle = "#aebdca";
      roundRect(ctx, -54, -17, 7, 35, 1, "#aebdca", "#e2e9ef", 1);
      ctx.fillStyle = "#637787";
      ctx.fillRect(-53, -11, 5, 5);
      ctx.fillRect(-53, 6, 5, 5);
      const pcb = ctx.createLinearGradient(-48, -18, 48, 19);
      pcb.addColorStop(0, "#274f45");
      pcb.addColorStop(0.42, "#15372f");
      pcb.addColorStop(1, "#0b211f");
      roundRect(ctx, -48, -18, 98, 36, 4, pcb, "#8ca9a0", 1.2);
      const shroud = ctx.createLinearGradient(0, -15, 0, 16);
      shroud.addColorStop(0, "#526173");
      shroud.addColorStop(0.35, "#222e3d");
      shroud.addColorStop(1, "#101b27");
      roundRect(ctx, -43, -15, 88, 30, 4, shroud, "#8294a5", 1.1);
      for (const fx of [-22, 19]) {
        ctx.beginPath();
        ctx.arc(fx, 0, 11.5, 0, Math.PI * 2);
        ctx.fillStyle = "#0b111a";
        ctx.fill();
        ctx.strokeStyle = "#91a0ac";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(fx, 0, 9, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(169,190,201,.45)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
          ctx.save();
          ctx.translate(fx, 0);
          ctx.rotate((i * Math.PI * 2) / 9 + 0.22);
          ctx.fillStyle = i % 2 ? "#8f9fab" : "#526574";
          ctx.beginPath();
          ctx.moveTo(-1.5, -1);
          ctx.quadraticCurveTo(5, -4, 1, -9);
          ctx.quadraticCurveTo(-3, -7, -1.5, -1);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(fx, 0, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "#aab8c2";
        ctx.fill();
        ctx.strokeStyle = "#34434f";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      // Gold PCIe fingers and power socket.
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = i % 3 === 0 ? "#f0cb66" : "#c59b43";
        ctx.fillRect(-37 + i * 4.1, 17, 2.8, 5);
      }
      roundRect(ctx, 31, -12, 12, 8, 1, "#101a20", "#8998a4", 0.7);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "#d8c46e";
        ctx.fillRect(33 + i * 3, -10, 1.6, 4);
      }
      ctx.fillStyle = "#93a5b3";
      ctx.fillRect(-43, -14, 3, 5);
      ctx.fillRect(-43, 8, 3, 5);
      text("GPU", 0, 1, 7.5, "#e9f0f4", 950, "center");
    } else if (type === "SSD") {
      // Compact M.2 2280 NVMe drive: long PCB, NAND packages, controller and edge connector.
      const pcb = ctx.createLinearGradient(-38, -10, 38, 11);
      pcb.addColorStop(0, "#236d57");
      pcb.addColorStop(0.48, "#154b3b");
      pcb.addColorStop(1, "#0b2b26");
      roundRect(ctx, -38, -10, 76, 20, 2, pcb, "#9bc8a9", 1.1);
      ctx.strokeStyle = "rgba(147,222,168,.65)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-29 + i * 9, -7);
        ctx.lineTo(-26 + i * 9, -3);
        ctx.lineTo(-26 + i * 9, 6);
        ctx.stroke();
      }
      roundRect(ctx, -29, -7, 12, 13, 1.5, "#17232e", "#92a6b7", 0.7);
      roundRect(ctx, -12, -7, 13, 13, 1.5, "#17232e", "#92a6b7", 0.7);
      roundRect(ctx, 6, -7, 13, 13, 1.5, "#17232e", "#92a6b7", 0.7);
      roundRect(ctx, 24, -5, 8, 10, 1, "#c7d2c3", "#eef4e8", 0.5);
      text("NVMe", 28, 0, 3.8, "#243847", 950, "center");
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 ? "#e3bf64" : "#b58d43";
        ctx.fillRect(-37 + i * 3, 10, 2, 3);
      }
      roundRect(ctx, 32, -3, 5, 6, 1, "#060f19", "#93a8b6", 0.5);
    } else {
      // CPU tower cooler: aluminium fin stack, copper heat pipes and axial fan.
      ctx.strokeStyle = "#be8251";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-13, 17);
      ctx.quadraticCurveTo(-19, 9, -16, -3);
      ctx.moveTo(0, 17);
      ctx.quadraticCurveTo(-6, 9, -3, -3);
      ctx.moveTo(13, 17);
      ctx.quadraticCurveTo(7, 9, 10, -3);
      ctx.stroke();
      const fins = ctx.createLinearGradient(-24, -21, 24, 18);
      fins.addColorStop(0, "#cdd8de");
      fins.addColorStop(0.45, "#718895");
      fins.addColorStop(1, "#354a59");
      roundRect(ctx, -23, -20, 46, 37, 3, fins, "#d5e0e5", 1.1);
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = "rgba(24,39,52,.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-19, -16 + i * 5);
        ctx.lineTo(19, -16 + i * 5);
        ctx.stroke();
      }
      roundRect(ctx, -17, -15, 34, 27, 3, "#1c2a36", "#aab9c4", 1);
      ctx.beginPath();
      ctx.arc(0, -1.5, 13, 0, Math.PI * 2);
      ctx.fillStyle = "#0b141e";
      ctx.fill();
      ctx.strokeStyle = "#94a6b1";
      ctx.lineWidth = 1.1;
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / 7 + 0.18);
        ctx.fillStyle = "#a8bac5";
        ctx.beginPath();
        ctx.moveTo(0, -2);
        ctx.quadraticCurveTo(7, -6, 2, -11);
        ctx.quadraticCurveTo(-2, -7, 0, -2);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, -1.5, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#d1dde4";
      ctx.fill();
      roundRect(ctx, -8, 17, 16, 3, 1, "#9baeb9", "#dce6e9", 0.5);
    }
    ctx.restore();
  }
  function drawRobot(x, y, face = 1, walk = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    const bob = Math.sin(walk * 8) * 1.7;
    // Soft contact shadow.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#020610";
    ctx.beginPath();
    ctx.ellipse(0, 2, 21, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Backpack and antenna cabling.
    roundRect(ctx, -19, -34, 8, 19, 3, "#32496b", "#7da6d2", 1.2);
    roundRect(ctx, -18, -31, 5, 11, 2, "#49e5d7", "#a0fff0", 0.8);
    ctx.strokeStyle = "#9beaff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, -51);
    ctx.lineTo(8, -58);
    ctx.lineTo(14, -58);
    ctx.stroke();
    ctx.save();
    ctx.shadowBlur = 9;
    ctx.shadowColor = "#ffb75f";
    ctx.fillStyle = "#ffc16c";
    ctx.beginPath();
    ctx.arc(16, -58, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Legs animate in opposite phases.
    ctx.save();
    ctx.translate(-7, -10 + bob);
    ctx.rotate(Math.sin(walk * 8) * 0.18);
    roundRect(ctx, -4, -1, 8, 11, 3, "#6f91b6", "#c2e5ff", 1);
    roundRect(ctx, -7, 7, 13, 5, 2, "#1a2a43", "#5bded9", 1);
    ctx.restore();
    ctx.save();
    ctx.translate(7, -10 - bob);
    ctx.rotate(-Math.sin(walk * 8) * 0.18);
    roundRect(ctx, -4, -1, 8, 11, 3, "#6f91b6", "#c2e5ff", 1);
    roundRect(ctx, -5, 7, 13, 5, 2, "#1a2a43", "#5bded9", 1);
    ctx.restore();
    // Arms with colored shoulder rings.
    roundRect(ctx, -20, -34, 7, 18, 3, "#546f98", "#b1d8f2", 1);
    roundRect(ctx, 13, -34, 7, 18, 3, "#546f98", "#b1d8f2", 1);
    ctx.fillStyle = "#70f4dd";
    ctx.beginPath();
    ctx.arc(-16.5, -32, 3, 0, Math.PI * 2);
    ctx.arc(16.5, -32, 3, 0, Math.PI * 2);
    ctx.fill();
    // Body shell with two-tone metallic shading.
    const body = ctx.createLinearGradient(-15, -39, 15, -12);
    body.addColorStop(0, "#f1f8ff");
    body.addColorStop(0.28, "#93c6e6");
    body.addColorStop(0.7, "#467ca5");
    body.addColorStop(1, "#284261");
    roundRect(ctx, -15, -40, 30, 28, 7, body, "#d6f4ff", 1.4);
    roundRect(ctx, -10, -34, 20, 14, 4, "#10243c", "#69e9ed", 1.2);
    ctx.fillStyle = "#42f6df";
    ctx.beginPath();
    ctx.arc(-4, -27, 2.2, 0, Math.PI * 2);
    ctx.arc(4, -27, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f6c66f";
    ctx.fillRect(-3, -17, 6, 2);
    // Head and glass visor.
    const head = ctx.createLinearGradient(-16, -65, 17, -43);
    head.addColorStop(0, "#f5fbff");
    head.addColorStop(0.5, "#bfd6eb");
    head.addColorStop(1, "#6d90b5");
    roundRect(ctx, -17, -63, 34, 24, 8, head, "#f0fbff", 1.5);
    roundRect(ctx, -13, -59, 26, 15, 5, "#101d36", "#5a92b7", 1);
    // Eye glow and visor reflection.
    ctx.save();
    ctx.shadowBlur = 7;
    ctx.shadowColor = "#45fff0";
    ctx.fillStyle = "#67fff1";
    const blink = Math.sin(walk * 1.6) > 0.985 ? 1.2 : 2.6;
    ctx.beginPath();
    ctx.ellipse(-5, -52, 2.1, blink, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -52, 2.1, blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,.42)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-10, -57);
    ctx.lineTo(-3, -57);
    ctx.stroke();
    // Ear caps and serial light.
    roundRect(ctx, -19, -57, 4, 10, 2, "#40cfcf", "#c2fff7", 1);
    roundRect(ctx, 15, -57, 4, 10, 2, "#40cfcf", "#c2fff7", 1);
    ctx.fillStyle = "#ffba70";
    ctx.beginPath();
    ctx.arc(0, -44, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawPill(label, x, y, w, accent = "#58dfde") {
    roundRect(
      ctx,
      x,
      y,
      w,
      27,
      9,
      "rgba(8,22,36,.84)",
      "rgba(113,189,209,.23)",
      1,
    );
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + 12, y + 13.5, 3, 0, Math.PI * 2);
    ctx.fill();
    text(label, x + 23, y + 14, 11, "#d7edf5", 750);
  }
  function drawTopHUD() {
    roundRect(ctx, 16, 14, 286, 68, 14, "rgba(3,11,24,.98)", "#47728e", 1.2);
    text("KERÄTYT KOMPONENTIT", 31, 31, 11, "#d2e6f7", 900);
    types.forEach((t, i) => {
      const x = 31 + i * 83;
      roundRect(
        ctx,
        x,
        44,
        75,
        27,
        7,
        collected[t] ? "#124c42" : "#17283d",
        collected[t] ? "#58e9b9" : "#466078",
        1,
      );
      text(
        (collected[t] ? "✓ " : "") + t,
        x + 37.5,
        57.5,
        12,
        collected[t] ? "#a8ffdb" : "#e4eff9",
        900,
        "center",
      );
    });
    roundRect(ctx, 658, 14, 126, 50, 13, "rgba(3,11,24,.98)", "#47728e", 1.2);
    text(`PISTEET / ${MAX_SCORE}`, 721, 28, 9.5, "#cce3f3", 900, "center");
    text(String(currentScore()), 721, 47, 20, "#ffffff", 950, "center");
    roundRect(ctx, 800, 14, 144, 50, 13, "rgba(3,11,24,.98)", "#47728e", 1.2);
    text("AIKAA JÄLJELLÄ", 872, 28, 10, "#d2e6f7", 900, "center");
    text(
      timeString(300000 - elapsed()),
      872,
      47,
      20,
      elapsed() > 270000 ? "#ffd08a" : "#ffffff",
      950,
      "center",
    );
    roundRect(ctx, 17, 89, 180, 26, 8, "rgba(3,11,24,.97)", "#47728e", 1);
    text("TUPLAHYPY  ·  SPACE × 2", 107, 102, 10, "#ffffff", 850, "center");
    roundRect(ctx, 17, 121, 284, 25, 8, "rgba(3,11,24,.97)", "#47728e", 1);
    text(
      `KARTTA ${mapCode}  ·  ${activeLevel.name}`,
      159,
      133.5,
      8.6,
      "#ffdf9c",
      900,
      "center",
    );
  }
  function drawPlatformWorld(t) {
    drawBackground(t);
    ctx.save();
    ctx.translate(-cameraX, -cameraY);
    // A continuous motherboard backplane fills the entire climbing course.
    const palette = levelPalettes[activeLevel.theme];
    // A flat PCB base avoids rebuilding a full-world gradient on every frame. Layered
    // low-opacity colour panels retain depth while keeping the world low-cost to render.
    ctx.fillStyle = palette.board[1];
    ctx.fillRect(-40, -80, worldWidth + 80, worldHeight + 160);
    // Culling preserves the full motherboard world but avoids off-screen draw calls.
    const viewLeft = Math.max(0, cameraX - 70),
      viewRight = Math.min(worldWidth, cameraX + W + 70);
    const viewTop = Math.max(0, cameraY - 70),
      viewBottom = Math.min(worldHeight, cameraY + H + 70);
    ctx.save();
    ctx.globalAlpha = 0.23;
    ctx.fillStyle = palette.board[0];
    ctx.fillRect(
      viewLeft,
      viewTop,
      Math.min(330, viewRight - viewLeft),
      viewBottom - viewTop,
    );
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = palette.board[2];
    ctx.fillRect(
      Math.max(viewLeft, cameraX + W * 0.58),
      viewTop,
      Math.max(0, viewRight - (cameraX + W * 0.58)),
      viewBottom - viewTop,
    );
    ctx.restore();
    ctx.strokeStyle = "rgba(75,202,169,.12)";
    ctx.lineWidth = 1;
    const gridStartX = 35 + Math.max(0, Math.floor((viewLeft - 35) / 48)) * 48;
    for (let x = gridStartX; x < viewRight; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, worldHeight);
      ctx.stroke();
    }
    const gridStartY = 35 + Math.max(0, Math.floor((viewTop - 35) / 42)) * 42;
    for (let y = gridStartY; y < viewBottom; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(worldWidth, y);
      ctx.stroke();
    }
    const traceStartCol = Math.max(0, Math.floor((viewLeft - 170) / 180));
    const traceEndCol = Math.min(
      Math.ceil(worldWidth / 180),
      Math.ceil((viewRight + 20) / 180),
    );
    const traceStartRow = Math.max(0, Math.floor((viewTop - 130) / 135));
    const traceEndRow = Math.min(
      Math.ceil(worldHeight / 135),
      Math.ceil((viewBottom + 20) / 135),
    );
    for (let col = traceStartCol; col < traceEndCol; col++) {
      for (let row = traceStartRow; row < traceEndRow; row++) {
        const x = col * 180 + 18,
          y = row * 135 + 15,
          dir = (col + row) % 2 === 0 ? 1 : -1;
        ctx.save();
        ctx.strokeStyle =
          (col + row) % 3 === 0 ? "rgba(76,183,239,.34)" : palette.trace + "66";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 30, y);
        ctx.lineTo(x + 43, y + dir * 13);
        ctx.lineTo(x + 86, y + dir * 13);
        ctx.lineTo(x + 104, y + dir * 31);
        ctx.lineTo(x + 145, y + dir * 31);
        ctx.stroke();
        ctx.fillStyle = "#85d7c2";
        for (const [vx, vy] of [
          [x, y],
          [x + 86, y + dir * 13],
          [x + 145, y + dir * 31],
        ]) {
          ctx.beginPath();
          ctx.arc(vx, vy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#b1ebdf";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    // Repeated motherboard components: VRM blocks, capacitors and tiny IC packages.
    const chipStartX =
      70 + Math.max(0, Math.floor((viewLeft - 220 - 70) / 310)) * 310;
    for (let x = chipStartX; x < worldWidth && x < viewRight; x += 310) {
      if (x + 150 < viewLeft) continue;
      const chipStartY =
        65 + Math.max(0, Math.floor((viewTop - 80 - 65) / 270)) * 270;
      for (let y = chipStartY; y < worldHeight && y < viewBottom; y += 270) {
        if (y + 60 < viewTop) continue;
        ctx.save();
        ctx.globalAlpha = 0.86;
        roundRect(ctx, x, y, 72, 52, 4, "#09232d", "#45727b", 1.3);
        roundRect(ctx, x + 7, y + 6, 58, 40, 3, "#263a43", "#81989b", 1);
        ctx.fillStyle = "rgba(198,224,221,.13)";
        ctx.fillRect(x + 10, y + 8, 52, 4);
        for (let pin = 0; pin < 8; pin++) {
          ctx.fillStyle = "#b0aa7d";
          ctx.fillRect(x + 10 + pin * 7, y + 2, 3, 4);
          ctx.fillRect(x + 10 + pin * 7, y + 46, 3, 4);
        }
        ctx.strokeStyle = "rgba(130,221,186,.5)";
        ctx.lineWidth = 1;
        for (let r = 0; r < 3; r++) {
          ctx.beginPath();
          ctx.moveTo(x + 13, y + 16 + r * 10);
          ctx.lineTo(x + 58, y + 16 + r * 10);
          ctx.stroke();
        }
        ctx.restore();
        for (let k = 0; k < 3; k++) {
          const cx = x + 102 + k * 15,
            cy = y + 10;
          ctx.save();
          roundRect(ctx, cx, cy, 9, 23, 3, "#0b1a24", "#a6b8b9", 1);
          roundRect(
            ctx,
            cx + 2,
            cy + 3,
            5,
            17,
            2,
            k === 1 ? "#647883" : "#344c59",
            null,
          );
          ctx.fillStyle = "#a5c8bc";
          ctx.fillRect(cx + 2, cy + 3, 5, 2);
          ctx.restore();
        }
      }
    }
    // Board edge rails and gold contact fingers.
    // The backplane continues beneath the starting dock; no flat black void or full-width ground strip.
    ctx.fillStyle = "#3a7d78";
    ctx.fillRect(0, worldHeight - 34, worldWidth, 3);
    const contactStartX = 8 + Math.max(0, Math.floor((viewLeft - 8) / 24)) * 24;
    for (let x = contactStartX; x < Math.min(worldWidth, viewRight); x += 24) {
      roundRect(ctx, x, worldHeight - 22, 14, 7, 1, "#c6a45c", "#f1d58c", 0.6);
      ctx.strokeStyle = "rgba(80,221,173,.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 7, worldHeight - 25);
      ctx.lineTo(x + 7, worldHeight - 42);
      ctx.lineTo(x + 17, worldHeight - 54);
      ctx.stroke();
    }
    // Starting service dock.
    roundRect(ctx, 0, floorY - 18, 177, 26, 5, "#255e5b", "#9ef1d4", 1.4);
    ctx.fillStyle = "#7aab9b";
    ctx.fillRect(5, floorY - 16, 165, 3);
    for (let x = 9; x < 170; x += 17) {
      ctx.fillStyle = x % 2 ? "#d6b765" : "#5ce3bf";
      ctx.fillRect(x, floorY - 12, 9, 2);
    }
    // Climbable platforms resemble daughterboards mounted above the motherboard.
    for (const p of platforms) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.42)";
      ctx.shadowBlur = 7;
      ctx.shadowOffsetY = 6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 4);
      ctx.lineTo(p.x + p.w, p.y + 4);
      ctx.lineTo(p.x + p.w + 8, p.y + 20);
      ctx.lineTo(p.x + 7, p.y + 20);
      ctx.closePath();
      ctx.fillStyle = "#061924";
      ctx.fill();
      ctx.restore();
      roundRect(
        ctx,
        p.x,
        p.y,
        p.w,
        17,
        4,
        palette.platform[1],
        palette.trace,
        1.3,
      );
      ctx.fillStyle = palette.platform[0];
      ctx.fillRect(p.x + 4, p.y + 2, Math.max(0, p.w - 8), 3);
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.fillRect(p.x + 4, p.y + 12, Math.max(0, p.w - 8), 3);
      ctx.fillStyle = "#132e3a";
      for (let xx = p.x + 12; xx < p.x + p.w - 9; xx += 21)
        roundRect(ctx, xx, p.y + 6, 12, 2, 1, "#173c45", null);
      ctx.fillStyle = "#b4d8bb";
      for (const px of [p.x + 7, p.x + p.w - 8]) {
        ctx.beginPath();
        ctx.arc(px, p.y + 8, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Tiny mounted packages make each landing read as a board, not a generic block.
      roundRect(ctx, p.x + 20, p.y - 7, 18, 6, 1, "#283d47", "#9db3b2", 0.7);
      roundRect(
        ctx,
        p.x + p.w - 35,
        p.y - 6,
        15,
        5,
        1,
        "#30464e",
        "#9db3b2",
        0.7,
      );
      ctx.strokeStyle = "rgba(86,237,185,.72)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + 41, p.y + 2);
      ctx.lineTo(p.x + 56, p.y + 2);
      ctx.lineTo(p.x + 62, p.y - 4);
      ctx.lineTo(p.x + 80, p.y - 4);
      ctx.stroke();
    }
    // Electricity hazards sit on selected daughterboards. Touching one sends the player
    // back to the starting dock of this level; collected components and score are preserved.
    hazards.forEach((h, i) => {
      const pulse = 0.75 + 0.25 * Math.sin(t / 115 + h.phase);
      ctx.save();
      ctx.globalAlpha = 0.08 + pulse * 0.07;
      roundRect(ctx, h.x - 9, h.y - 8, h.w + 18, h.h + 16, 7, "#ff754f", null);
      ctx.globalAlpha = 0.48 + pulse * 0.18;
      ctx.fillStyle = "#ff9f67";
      ctx.fillRect(h.x + 2, h.y + 3, Math.max(1, h.w - 4), 3);
      ctx.restore();
      roundRect(ctx, h.x, h.y, h.w, h.h, 3, "#9d4638", "#ffcb8a", 1);
      ctx.strokeStyle = "#ffdc9b";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(h.x + 4, h.y + 8);
      ctx.lineTo(h.x + 12, h.y + 2);
      ctx.lineTo(h.x + 19, h.y + 10);
      ctx.lineTo(h.x + 27, h.y + 2);
      ctx.lineTo(h.x + h.w - 3, h.y + 8);
      ctx.stroke();
      ctx.fillStyle = "#ffe0a0";
      for (let n = 0; n < 3; n++) {
        const spark = (t * 0.045 + n * 13 + i * 9) % 22;
        ctx.globalAlpha = 0.3 + pulse * 0.5;
        ctx.fillRect(h.x + 8 + n * 11, h.y - 3 - spark * 0.6, 2, 3);
      }
      ctx.globalAlpha = 1;
    });
    // Component pickups sit above a real-looking contact pedestal. Placement is randomized per run.
    for (const item of items) {
      if (item.got) continue;
      const bob = Math.sin(t / 185 + item.phase) * 3.0,
        cy = item.y + bob;
      const accent =
        item.type === "CPU"
          ? "#f3c45d"
          : item.type === "RAM"
            ? "#65d996"
            : item.type === "GPU"
              ? "#8bb5ff"
              : item.type === "SSD"
                ? "#8dc5ff"
                : "#c1a2ff";
      ctx.save();
      ctx.globalAlpha = 0.075 + 0.025 * Math.sin(t / 220 + item.phase);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(item.x, cy + 2, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(item.x, cy + 2, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(item.x, cy + 31);
      ctx.scale(1, 0.27);
      ctx.beginPath();
      ctx.arc(0, 0, 29, 0, Math.PI * 2);
      ctx.fillStyle = "#07141e";
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      drawComponent(
        item.type,
        item.x,
        cy,
        item.type === "CPU" ? 1.0 : item.type === "RAM" ? 1.08 : 1.12,
        true,
      );
      const pickupLabel = item.type === "COOLER" ? "COOLER" : item.type;
      roundRect(
        ctx,
        item.x - (pickupLabel.length > 5 ? 43 : 34),
        cy + 36,
        pickupLabel.length > 5 ? 86 : 68,
        22,
        6,
        "#06121e",
        accent,
        1,
      );
      text(
        pickupLabel,
        item.x,
        cy + 47,
        pickupLabel.length > 5 ? 10.5 : 12,
        accent,
        950,
        "center",
      );
      // Floating up/down chevrons call attention to the collectible.
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      const bounce = Math.sin(t / 150 + item.phase) * 2;
      ctx.beginPath();
      ctx.moveTo(item.x - 5, cy - 39 + bounce);
      ctx.lineTo(item.x, cy - 44 + bounce);
      ctx.lineTo(item.x + 5, cy - 39 + bounce);
      ctx.stroke();
      ctx.restore();
    }
    // Finish gate is placed on the final motherboard platform, not at a fixed
    // world Y. It remains the end of the platformer even after every part is found.
    const finish = getFinishGate();
    const gateTop = finish.platform.y - 94;
    const gateColor = allCollected() ? "#69ffd7" : "#f4c46e";
    ctx.save();
    // A clearly visible finish stripe across the final PCB platform.
    ctx.globalAlpha = 0.88;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? gateColor : "#102331";
      ctx.fillRect(finish.x - 15 + i * 4, finish.platform.y - 2, 4, 12);
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = gateColor;
    ctx.shadowBlur = allCollected() ? 17 : 7;
    roundRect(
      ctx,
      finish.x - 28,
      gateTop,
      56,
      finish.platform.y - gateTop + 2,
      12,
      "rgba(7,23,35,.78)",
      gateColor,
      2.3,
    );
    ctx.shadowBlur = 0;
    roundRect(
      ctx,
      finish.x - 21,
      gateTop + 8,
      42,
      finish.platform.y - gateTop - 7,
      8,
      allCollected() ? "rgba(46,210,167,.16)" : "rgba(255,190,87,.10)",
      gateColor,
      1.1,
    );
    // Moving energy bars make it feel like an actual exit gate.
    for (let i = 0; i < 5; i++) {
      const yy =
        gateTop +
        15 +
        ((i * 19 + t * 0.035) % Math.max(20, finish.platform.y - gateTop - 22));
      ctx.globalAlpha = 0.35 + 0.45 * Math.sin(t / 190 + i) ** 2;
      roundRect(ctx, finish.x - 16, yy, 32, 3, 1.5, gateColor, null);
    }
    ctx.globalAlpha = 1;
    roundRect(
      ctx,
      finish.x - 15,
      gateTop - 24,
      30,
      12,
      4,
      "#06131f",
      gateColor,
      1,
    );
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = gateColor;
      ctx.globalAlpha = 0.55 + 0.4 * Math.sin(t / 150 + i);
      ctx.beginPath();
      ctx.arc(finish.x - 7 + i * 7, gateTop - 18, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawRobot(
      player.x + player.w / 2,
      player.y + player.h,
      player.face,
      player.walk,
    );
    ctx.restore();
    drawTopHUD();
    // High-contrast objective banner. Finding every part only unlocks the GO gate;
    // the player must still reach and cross the finish line to advance.
    roundRect(ctx, 278, 14, 362, 57, "#061322", "#47728e", 1.2);
    roundRect(ctx, 291, 25, 4, 34, 2, "#55f1d0", null);
    text(
      allCollected()
        ? "KAIKKI OSAT KERÄTTY!"
        : `KERÄÄ KAIKKI ${types.length} OSAA`,
      307,
      32,
      12,
      "#a7fff0",
      950,
    );
    text(
      allCollected()
        ? "Jatka GO-maalin läpi!"
        : campaignStages[stageIndex].objective,
      307,
      52,
      11,
      "#ffffff",
      800,
    );
  }
  function drawFinishTransition(t) {
    // Short visual transition only: no oversized FINISH LINE message.
    drawPlatformWorld(t);
    const elapsedFinish = Math.max(0, t - finishStartedAt);
    const sweep = clamp(elapsedFinish / 950, 0, 1);
    ctx.fillStyle = `rgba(2,8,18,${0.14 + 0.22 * sweep})`;
    ctx.fillRect(0, 0, W, H);
    const beam = ctx.createLinearGradient(
      80 + sweep * 820,
      80,
      160 + sweep * 820,
      460,
    );
    beam.addColorStop(0, "rgba(71,251,218,0)");
    beam.addColorStop(0.5, "rgba(92,255,229,.28)");
    beam.addColorStop(1, "rgba(71,251,218,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, W, H);
    // Small component silhouettes travel toward the assembly bench as a visual bridge.
    const lift = clamp(elapsedFinish / 1100, 0, 1);
    types.forEach((type, i) => {
      const x = 370 + i * 92 + (1 - lift) * 20;
      const y = 330 - lift * 54;
      ctx.globalAlpha = 0.35 + 0.65 * lift;
      drawComponent(type, x, y, type === "GPU" ? 0.33 : 0.32, false);
    });
    ctx.globalAlpha = 1;
  }

  function drawTitle(t) {
    drawBackground(t, true);
    // Right-side hero stage: a tilted PCB platform, big hardware illustrations and robot.
    ctx.save();
    ctx.translate(678, 298);
    ctx.rotate(-0.12);
    ctx.shadowColor = "rgba(0,0,0,.55)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 22;
    const board = ctx.createLinearGradient(-230, -100, 225, 135);
    board.addColorStop(0, "#315f87");
    board.addColorStop(0.35, "#173f62");
    board.addColorStop(1, "#10223f");
    roundRect(ctx, -248, -105, 496, 224, 22, board, "#72b9dc", 2);
    ctx.restore();
    // PCB etched tracks and screw contacts on the showcase.
    ctx.save();
    ctx.translate(678, 298);
    ctx.rotate(-0.12);
    ctx.strokeStyle = "rgba(91,239,216,.58)";
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      const y = -78 + i * 23;
      ctx.beginPath();
      ctx.moveTo(-223, y);
      ctx.lineTo(-110, y);
      ctx.lineTo(-91, y + 13);
      ctx.lineTo(12, y + 13);
      ctx.lineTo(35, y - 2);
      ctx.lineTo(222, y - 2);
      ctx.stroke();
    }
    for (const x of [-224, 224])
      for (const y of [-80, 92]) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#c5dff0";
        ctx.fill();
        ctx.strokeStyle = "#31506d";
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    ctx.restore();
    // Decorative orbit behind the floating components.
    ctx.save();
    ctx.translate(690, 286);
    ctx.rotate(t * 0.00009);
    ctx.strokeStyle = "rgba(144,131,255,.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 228, 152, -0.18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Hero components on a few different depths.
    ctx.save();
    ctx.globalAlpha = 0.98;
    drawComponent("CPU", 725, 236, 1.46, true);
    drawComponent("RAM", 830, 351, 1.12, true);
    drawComponent("GPU", 579, 360, 1.05, true);
    ctx.restore();
    // Tiny floating sparks travel along the board.
    for (let i = 0; i < 26; i++) {
      const x = 476 + ((i * 61 + t * 0.012 * ((i % 3) + 1)) % 432);
      const y = 120 + ((i * 43) % 320) + Math.sin(t / 370 + i) * 5;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t / 270 + i));
      ctx.fillStyle =
        i % 4 === 0 ? "#ffcf75" : i % 3 === 0 ? "#a89cff" : "#61ffdf";
      ctx.shadowBlur = 8;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(x, y, i % 5 === 0 ? 2 : 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Robot on a futuristic launch platform.
    ctx.save();
    ctx.shadowColor = "rgba(48,244,219,.48)";
    ctx.shadowBlur = 18;
    roundRect(ctx, 548, 421, 342, 17, 8, "#183a5b", "#70e8e2", 1.3);
    ctx.restore();
    ctx.fillStyle = "rgba(72,239,220,.19)";
    ctx.fillRect(570, 438, 300, 3);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "#67a5dc" : "#48e7d0";
      ctx.globalAlpha = 0.75;
      ctx.fillRect(565 + i * 31, 425, 15, 3);
    }
    ctx.globalAlpha = 1;
    drawRobot(719, 420, 1, Math.sin(t / 160));

    // Main title card: polished, readable, with clear hierarchy.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.50)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 10;
    roundRect(
      ctx,
      30,
      28,
      438,
      475,
      25,
      "rgba(5,13,29,.96)",
      "rgba(107,173,221,.42)",
      1.2,
    );
    ctx.restore();
    roundRect(
      ctx,
      41,
      39,
      416,
      453,
      19,
      "rgba(13,27,49,.72)",
      "rgba(89,154,203,.17)",
      1,
    );
    // Size the label chip to its actual text width with comfortable padding.
    const eyebrowLabel = "IT-ALAN MINISEIKKAILU";
    ctx.save();
    ctx.font = "900 9px Arial, Helvetica, sans-serif";
    const eyebrowChipWidth = Math.ceil(
      ctx.measureText(eyebrowLabel).width + 42,
    );
    ctx.restore();
    roundRect(
      ctx,
      62,
      58,
      eyebrowChipWidth,
      25,
      8,
      "rgba(42,212,191,.13)",
      "rgba(70,242,216,.31)",
      1,
    );
    ctx.fillStyle = "#4cf0d5";
    ctx.beginPath();
    ctx.arc(76, 70.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    text(eyebrowLabel, 87, 71, 9, "#9ffbed", 900);
    text("COMPONENT", 62, 135, 37, "#f4f8ff", 950);
    // Thin color bar under headline.
    const titleBar = ctx.createLinearGradient(62, 0, 372, 0);
    titleBar.addColorStop(0, "#3dedd1");
    titleBar.addColorStop(0.52, "#4eabff");
    titleBar.addColorStop(1, "#a18aff");
    roundRect(ctx, 62, 151, 274, 4, 2, titleBar, null);
    text("QUEST", 60, 201, 59, "#50f2d5", 950);
    text("Kerää. Rakenna. Käynnistä.", 64, 239, 16, "#c0d7eb", 700);
    text(
      "Tutki emolevyn maailmaa ja kokoa oma koneesi.",
      64,
      263,
      12,
      "#d4e4f3",
      650,
    );
    // Three step cards.
    const rows = [
      ["01", "KERÄÄ", "Etsi CPU, RAM ja GPU.", "#ffc96c"],
      ["02", "RAKENNA", "Asenna osat oikeille paikoille.", "#64e9c2"],
      ["03", "KÄYNNISTÄ", "Testaa oma kokoonpanosi.", "#a5a8ff"],
    ];
    rows.forEach((r, i) => {
      const y = 287 + i * 45;
      roundRect(
        ctx,
        62,
        y,
        352,
        37,
        9,
        "rgba(24,43,70,.72)",
        "rgba(108,158,203,.20)",
        1,
      );
      roundRect(ctx, 70, y + 6, 27, 25, 7, "rgba(69,126,174,.20)", r[3], 1);
      text(r[0], 83.5, y + 18.5, 9, r[3], 900, "center");
      text(r[1], 109, y + 13, 9, r[3], 900);
      text(r[2], 109, y + 26, 10, "#c9d9eb", 600);
    });
    addButton("start", "ALOITA SEIKKAILU  →", 62, 437, 258, 43, {
      size: 13,
      fill: "#53efd4",
      color: "#071a2a",
      stroke: "#a0fff0",
    });
    if (globalNotice && t < globalNoticeUntil) {
      roundRect(
        ctx,
        495,
        35,
        430,
        44,
        12,
        "rgba(26,37,62,.96)",
        "rgba(255,189,117,.48)",
        1,
      );
      text(globalNotice, 710, 57, 11, "#ffe0b8", 750, "center");
    }
  }
  function drawBuildSocket(socketType, sl, occupantType, t) {
    // Neutral, realistic-looking motherboard hardware. Visuals do not reveal compatibility:
    // the player must run the POST test to discover a bad combination.
    ctx.save();
    const metal = "#9eafb7",
      darkMetal = "#34464c",
      pcbEdge = "#56815c";
    if (socketType === "CPU") {
      // LGA1700 CPU socket with a steel load frame, contact field and retention arm.
      roundRect(
        ctx,
        sl.x - 2,
        sl.y - 2,
        sl.w + 4,
        sl.h + 4,
        4,
        "#293a34",
        metal,
        1.4,
      );
      roundRect(
        ctx,
        sl.x + 2,
        sl.y + 2,
        sl.w - 4,
        sl.h - 4,
        3,
        "#0c1718",
        "#667f70",
        0.9,
      );
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 7; col++) {
          const px = sl.x + 7 + col * 7.1,
            py = sl.y + 7 + row * 7.1;
          ctx.fillStyle = (row + col) % 2 ? "#c9ad66" : "#887447";
          ctx.fillRect(px, py, 2.7, 2.7);
        }
      // The cover remains visible as a thin border around the installed processor.
      roundRect(
        ctx,
        sl.x + 2,
        sl.y + 2,
        sl.w - 4,
        sl.h - 4,
        3,
        "rgba(16,28,26,.22)",
        "#829a8c",
        0.8,
      );
      ctx.strokeStyle = "#c5d0d1";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(sl.x + sl.w - 2, sl.y + 10);
      ctx.lineTo(sl.x + sl.w + 5, sl.y + 10);
      ctx.lineTo(sl.x + sl.w + 5, sl.y + sl.h - 10);
      ctx.stroke();
      roundRect(
        ctx,
        sl.x + sl.w - 4,
        sl.y + sl.h / 2 - 5,
        6,
        10,
        1,
        "#9aa8a9",
        "#d6e0df",
        0.7,
      );
    } else if (socketType === "RAM") {
      // DDR5 DIMM socket. The opening and latches are sized for a single full DIMM stick.
      roundRect(
        ctx,
        sl.x - 1,
        sl.y + 8,
        sl.w + 2,
        sl.h - 16,
        2,
        "#aab8ad",
        "#405a47",
        0.8,
      );
      roundRect(
        ctx,
        sl.x + 2,
        sl.y + 11,
        sl.w - 4,
        sl.h - 22,
        1,
        "#101816",
        "#516d56",
        0.6,
      );
      ctx.fillStyle = "#c9a44b";
      for (let i = 0; i < 20; i++)
        ctx.fillRect(sl.x + 5 + i * 3.8, sl.y + sl.h / 2 - 1, 2.2, 5);
      // DIMM retention latches at both ends.
      roundRect(
        ctx,
        sl.x - 1,
        sl.y + 2,
        5,
        sl.h - 4,
        1,
        "#84968b",
        "#d0d9cc",
        0.6,
      );
      roundRect(
        ctx,
        sl.x + sl.w - 4,
        sl.y + 2,
        5,
        sl.h - 4,
        1,
        "#84968b",
        "#d0d9cc",
        0.6,
      );
    } else if (socketType === "GPU") {
      // Full-length PCI Express x16 connector with a keyed end and retaining latch.
      roundRect(
        ctx,
        sl.x - 1,
        sl.y + sl.h / 2 - 6,
        sl.w + 2,
        12,
        2,
        "#9eaba9",
        "#344d44",
        0.9,
      );
      roundRect(
        ctx,
        sl.x + 3,
        sl.y + sl.h / 2 - 3,
        sl.w - 10,
        6,
        1,
        "#0b1311",
        "#647669",
        0.6,
      );
      ctx.fillStyle = "#d2ad51";
      for (let i = 0; i < 30; i++)
        ctx.fillRect(sl.x + 5 + i * 3.45, sl.y + sl.h / 2 - 2, 2.2, 3.5);
      roundRect(
        ctx,
        sl.x + sl.w - 11,
        sl.y + sl.h / 2 - 10,
        13,
        21,
        2,
        "#7d9189",
        "#c0c9c3",
        0.8,
      );
    } else if (socketType === "SSD") {
      // M.2 M-key socket and 2280 standoff, separated from every other part.
      roundRect(
        ctx,
        sl.x,
        sl.y + sl.h / 2 - 4,
        sl.w,
        8,
        2,
        "#263b31",
        "#9bb2a1",
        0.8,
      );
      roundRect(
        ctx,
        sl.x + 4,
        sl.y + sl.h / 2 - 1.5,
        sl.w - 10,
        3,
        1,
        "#0b1412",
        "#50695a",
        0.5,
      );
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = i % 3 === 0 ? "#e7c65f" : "#b99a47";
        ctx.fillRect(sl.x + 6 + i * 3.5, sl.y + sl.h / 2 - 1, 2, 3);
      }
      ctx.beginPath();
      ctx.arc(sl.x + sl.w - 4, sl.y + sl.h / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#b9c6bf";
      ctx.fill();
      ctx.strokeStyle = "#4b5f52";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      // CPU cooler retention bracket with four mounting points.
      roundRect(
        ctx,
        sl.x + 5,
        sl.y + 4,
        sl.w - 10,
        sl.h - 8,
        3,
        "#263a30",
        "#a4b8a8",
        0.9,
      );
      roundRect(
        ctx,
        sl.x + 11,
        sl.y + 8,
        sl.w - 22,
        sl.h - 16,
        2,
        "#111d19",
        "#647e6b",
        0.7,
      );
      for (const [dx, dy] of [
        [7, 6],
        [sl.w - 7, 6],
        [7, sl.h - 6],
        [sl.w - 7, sl.h - 6],
      ]) {
        ctx.beginPath();
        ctx.arc(sl.x + dx, sl.y + dy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#c7d3c9";
        ctx.fill();
        ctx.strokeStyle = "#344a3b";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Printed motherboard silkscreen labels identify socket specifications, never placement status.
    const spec = {
      CPU: { label: "CPU · LGA1700", width: 86 },
      RAM: { label: "RAM · DDR5 DIMM", width: 108 },
      GPU: { label: "GPU · PCIe x16", width: 94 },
      SSD: { label: "SSD · M.2 2280", width: 101 },
      COOLER: { label: "COOLER · LGA1700", width: 112 },
    }[socketType];
    const labelY = Math.max(169, sl.y - 18);
    roundRect(
      ctx,
      sl.x + sl.w / 2 - spec.width / 2,
      labelY,
      spec.width,
      15,
      3,
      "#172b1d",
      "#7e9b70",
      0.75,
    );
    text(
      spec.label,
      sl.x + sl.w / 2,
      labelY + 7.6,
      8.2,
      "#e7f3dc",
      900,
      "center",
    );

    // Hardware is drawn at the socket's physical footprint. A wrong part is not tinted,
    // outlined or marked; only the later startup test reports compatibility problems.
    if (occupantType) {
      const dimensions = {
        CPU: [60, 60],
        RAM: [82, 29],
        GPU: [108, 43],
        SSD: [76, 20],
        COOLER: [46, 40],
      };
      const [cw, ch] = dimensions[occupantType];
      const scale = Math.min((sl.w - 4) / cw, (sl.h - 4) / ch);
      // A neutral mounting carrier covers the exposed connector after a part is placed.
      // It is used for EVERY occupied socket, so there is no colour/outline tell for mistakes.
      roundRect(
        ctx,
        sl.x + 1,
        sl.y + 1,
        sl.w - 2,
        sl.h - 2,
        2,
        "#24352a",
        "#9bad94",
        0.75,
      );
      roundRect(
        ctx,
        sl.x + 3,
        sl.y + 3,
        sl.w - 6,
        sl.h - 6,
        2,
        "#18271d",
        "#4f6b4e",
        0.55,
      );
      // Small PCB traces and connector fingers make the entire footprint read as a fitted module,
      // even when the underlying part is an experimental (possibly incompatible) combination.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = "#8fae78";
      ctx.lineWidth = 0.7;
      if (sl.w > sl.h * 1.5) {
        for (let i = 0; i < 4; i++) {
          const xx = sl.x + 5 + i * 8;
          ctx.beginPath();
          ctx.moveTo(xx, sl.y + 4);
          ctx.lineTo(xx + 3, sl.y + 8);
          ctx.lineTo(xx + 3, sl.y + sl.h - 7);
          ctx.stroke();
        }
        for (let i = 0; i < Math.floor((sl.w - 12) / 4); i++) {
          ctx.fillStyle = i % 3 === 0 ? "#e2c56d" : "#bb954b";
          ctx.fillRect(sl.x + 6 + i * 4, sl.y + sl.h - 4, 2.4, 2.3);
        }
      } else {
        for (const [tx, ty] of [
          [sl.x + 5, sl.y + 8],
          [sl.x + sl.w - 8, sl.y + 8],
          [sl.x + 5, sl.y + sl.h - 8],
          [sl.x + sl.w - 8, sl.y + sl.h - 8],
        ]) {
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + (tx < sl.cx ? 5 : -5), ty);
          ctx.lineTo(tx + (tx < sl.cx ? 8 : -8), ty + (ty < sl.cy ? 5 : -5));
          ctx.stroke();
        }
        for (const [tx, ty] of [
          [sl.x + 7, sl.y + 7],
          [sl.x + sl.w - 7, sl.y + 7],
          [sl.x + 7, sl.y + sl.h - 7],
          [sl.x + sl.w - 7, sl.y + sl.h - 7],
        ]) {
          roundRect(
            ctx,
            tx - 1.5,
            ty - 1.5,
            3,
            3,
            0.5,
            "#aab5a0",
            "#53664c",
            0.45,
          );
        }
      }
      ctx.restore();
      // The hardware keeps its proportions and is sized to the available mounting footprint.
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.30)";
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1;
      drawComponent(occupantType, sl.cx, sl.cy, scale, false);
      ctx.restore();
    }
    // Neutral mounting screws; no red/green lights to give the result away.
    for (const [sx, sy] of [
      [sl.x - 1, sl.y - 1],
      [sl.x + sl.w + 1, sl.y - 1],
      [sl.x - 1, sl.y + sl.h + 1],
      [sl.x + sl.w + 1, sl.y + sl.h + 1],
    ]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = "#a8b8aa";
      ctx.fill();
      ctx.strokeStyle = "#31483a";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBuildScene(t) {
    drawBackground(t, true);
    // Workshop floor in perspective, with a soft light pool under the machine.
    const floor = ctx.createLinearGradient(0, 330, 0, H);
    floor.addColorStop(0, "rgba(27,56,84,.58)");
    floor.addColorStop(1, "rgba(4,11,25,.98)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, 330, W, H - 330);
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "#378ab4";
    ctx.lineWidth = 1;
    for (let i = -12; i < 25; i++) {
      ctx.beginPath();
      ctx.moveTo(480 + i * 40, 330);
      ctx.lineTo(480 + i * 76, 540);
      ctx.stroke();
    }
    for (let y = 354; y < 555; y += 22) {
      ctx.globalAlpha = 0.1 + (y - 354) / 1000;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
    const floorGlow = ctx.createRadialGradient(520, 430, 1, 520, 430, 330);
    floorGlow.addColorStop(0, "rgba(41,205,203,.12)");
    floorGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = floorGlow;
    ctx.fillRect(170, 160, 700, 380);

    // Header and progress show the player's exact task.
    roundRect(
      ctx,
      18,
      14,
      286,
      50,
      13,
      "rgba(6,15,31,.92)",
      "rgba(100,172,220,.35)",
      1,
    );
    roundRect(ctx, 29, 25, 4, 27, 2, "#5cf0d5", null);
    text(
      `TASO ${stageIndex + 1}/${campaignStages.length} · KASAUS`,
      43,
      29,
      10,
      "#7ce9e0",
      900,
    );
    text(
      stageIndex === 0 ? "Kokoa tietokone" : "Päivitä tietokonetta",
      43,
      47,
      16,
      "#f4f7ff",
      900,
    );
    roundRect(
      ctx,
      798,
      14,
      146,
      50,
      13,
      "rgba(6,15,31,.92)",
      "rgba(100,172,220,.35)",
      1,
    );
    text("AIKAA JÄLJELLÄ", 871, 28, 10, "#c0d6e9", 800, "center");
    text(
      timeString(300000 - elapsed()),
      871,
      47,
      18,
      elapsed() > 270000 ? "#ffbb75" : "#f4faff",
      900,
      "center",
    );
    roundRect(
      ctx,
      320,
      14,
      136,
      50,
      13,
      "rgba(6,15,31,.94)",
      "rgba(100,172,220,.35)",
      1,
    );
    text(`PISTEET / ${MAX_SCORE}`, 388, 28, 9, "#c0d6e9", 850, "center");
    text(
      String(
        Math.min(
          MAX_SCORE,
          assemblyDisplayScore === null ? currentScore() : assemblyDisplayScore,
        ),
      ),
      388,
      47,
      19,
      "#ffffff",
      950,
      "center",
    );
    text("ASENNA OSAT EMOLEVYLLE", 32, 91, 13, "#ffffff", 850);
    text(
      "Kokeile paikkoja ja testaa, tunnistaako kone osat.",
      32,
      111,
      11,
      "#c8deec",
      700,
    );

    // Left inventory: physical component cards with quantity/progress states.
    for (const type of types) {
      const tr = trays[type],
        done = installed[type];
      const card = ctx.createLinearGradient(
        tr.x,
        tr.y,
        tr.x + tr.w,
        tr.y + tr.h,
      );
      card.addColorStop(0, done ? "rgba(17,79,76,.98)" : "rgba(16,32,56,.96)");
      card.addColorStop(1, done ? "rgba(10,48,58,.95)" : "rgba(7,19,38,.97)");
      roundRect(
        ctx,
        tr.x,
        tr.y,
        tr.w,
        tr.h,
        13,
        card,
        done ? "rgba(79,255,202,.72)" : "rgba(104,173,221,.3)",
        1.2,
      );
      roundRect(
        ctx,
        tr.x + 8,
        tr.y + 8,
        70,
        tr.h - 16,
        9,
        done ? "rgba(73,235,181,.10)" : "rgba(74,116,186,.12)",
        done ? "rgba(86,249,202,.2)" : "rgba(87,134,198,.2)",
        1,
      );
      drawComponent(
        type,
        tr.x + 43,
        tr.y + 35,
        type === "GPU" ? 0.68 : 0.66,
        !done,
      );
      text(
        info[type].name,
        tr.x + 91,
        tr.y + 25,
        13,
        done ? "#a8ffdc" : "#eff6ff",
        850,
      );
      text(
        done ? "PAIKOILLA · SIIRRÄ LEVYLTÄ" : "VEDÄ EMOLEVYLLE",
        tr.x + 91,
        tr.y + 46,
        7.8,
        done ? "#79f2c2" : "#96b5d2",
        850,
      );
      if (done) {
        ctx.fillStyle = "#58efbd";
        ctx.beginPath();
        ctx.arc(tr.x + tr.w - 17, tr.y + 16, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2.5D tower: dark front glass, bright metal edges and a visible side panel.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.58)";
    ctx.shadowBlur = 29;
    ctx.shadowOffsetY = 17;
    ctx.beginPath();
    ctx.moveTo(322, 140);
    ctx.lineTo(414, 77);
    ctx.lineTo(704, 105);
    ctx.lineTo(619, 165);
    ctx.closePath();
    const top = ctx.createLinearGradient(350, 80, 680, 165);
    top.addColorStop(0, "#b2c5d8");
    top.addColorStop(0.33, "#526c88");
    top.addColorStop(1, "#263b5c");
    ctx.fillStyle = top;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(619, 165);
    ctx.lineTo(704, 105);
    ctx.lineTo(704, 382);
    ctx.lineTo(619, 438);
    ctx.closePath();
    const side = ctx.createLinearGradient(630, 130, 704, 380);
    side.addColorStop(0, "#2d4566");
    side.addColorStop(0.55, "#152843");
    side.addColorStop(1, "#0a152b");
    ctx.fillStyle = side;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(322, 140);
    ctx.lineTo(619, 165);
    ctx.lineTo(619, 438);
    ctx.lineTo(322, 405);
    ctx.closePath();
    const front = ctx.createLinearGradient(320, 140, 620, 420);
    front.addColorStop(0, "#49617b");
    front.addColorStop(0.2, "#243d5b");
    front.addColorStop(1, "#14233e");
    ctx.fillStyle = front;
    ctx.fill();
    ctx.restore();
    // Metallic edge strokes and corner screws.
    ctx.strokeStyle = "#a3c8e3";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(322, 140);
    ctx.lineTo(414, 77);
    ctx.lineTo(704, 105);
    ctx.lineTo(704, 382);
    ctx.lineTo(619, 438);
    ctx.lineTo(322, 405);
    ctx.closePath();
    ctx.stroke();
    for (const [sx, sy] of [
      [336, 153],
      [604, 176],
      [337, 391],
      [605, 419],
    ]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = "#a5c4dc";
      ctx.fill();
      ctx.strokeStyle = "#2b4664";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Inner case opening and a distinct forest-green motherboard mounted inside it.
    // The case stays metallic blue-grey; the PCB is a clearly separate board with a nearly square footprint.
    ctx.beginPath();
    ctx.moveTo(342, 157);
    ctx.lineTo(603, 181);
    ctx.lineTo(603, 414);
    ctx.lineTo(342, 388);
    ctx.closePath();
    ctx.fillStyle = "#060e1e";
    ctx.fill();
    ctx.strokeStyle = "#7e9eb9";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(350, 166);
    ctx.lineTo(597, 188);
    ctx.lineTo(590, 398);
    ctx.lineTo(350, 378);
    ctx.closePath();
    const pcb = ctx.createLinearGradient(350, 166, 590, 398);
    pcb.addColorStop(0, "#315f36");
    pcb.addColorStop(0.42, "#24502f");
    pcb.addColorStop(1, "#153a27");
    ctx.fillStyle = pcb;
    ctx.fill();
    ctx.strokeStyle = "#86b16c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Mounting points on the board corners.
    for (const [bx, by] of [
      [359, 175],
      [588, 194],
      [359, 369],
      [581, 389],
    ]) {
      ctx.beginPath();
      ctx.arc(bx, by, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = "#c0c9b4";
      ctx.fill();
      ctx.strokeStyle = "#2a3d2b";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = "#405044";
      ctx.fill();
    }
    // Copper traces, solder mask details and small power-delivery parts around socket positions.
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = "#8eb66d";
    ctx.lineWidth = 1.05;
    for (let i = 0; i < 8; i++) {
      const yy = 194 + i * 19;
      ctx.beginPath();
      ctx.moveTo(363, yy);
      ctx.lineTo(374, yy);
      ctx.lineTo(382, yy + 6);
      ctx.lineTo(392, yy + 6);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const yy = 211 + i * 27;
      ctx.beginPath();
      ctx.moveTo(555, yy);
      ctx.lineTo(566, yy);
      ctx.lineTo(578, yy + 6);
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      roundRect(ctx, 365 + i * 9, 334, 5, 11, 1, "#182b1e", "#8ba878", 0.65);
      roundRect(ctx, 366 + i * 9, 336, 3, 3, 0, "#b9c47f", null);
    }
    ctx.restore();

    // Socket bodies and labels are kept inside the differently coloured motherboard.

    // Three fan assemblies on the angled side, with rotating blades and RGB rings.
    for (const fy of [203, 274, 345]) {
      ctx.save();
      ctx.translate(660, fy);
      ctx.rotate(-0.22);
      ctx.beginPath();
      ctx.ellipse(0, 0, 21, 29, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#071224";
      ctx.fill();
      ctx.strokeStyle = "#5b87a8";
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 23, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(75,227,218,.78)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI * 2) / 7 + t * 0.0014);
        ctx.fillStyle = i % 2 ? "#3d5682" : "#65eadb";
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.quadraticCurveTo(8, -9, 2, -18);
        ctx.quadraticCurveTo(-5, -13, -2, -2);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#c8e9ff";
      ctx.fill();
      ctx.strokeStyle = "#5e7b9c";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    // Side-panel vents and power lighting.
    for (let i = 0; i < 5; i++) {
      roundRect(ctx, 684, 153 + i * 12, 9, 5, 2, "#0a172a", "#496a8e", 0.7);
    }
    ctx.save();
    ctx.shadowBlur = 9;
    ctx.shadowColor = "#52f1cf";
    ctx.fillStyle = "#52f1cf";
    ctx.beginPath();
    ctx.arc(690, 367, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Randomized physical sockets; the same component art is used in both phases.
    for (const socketType of activeMachineTypes()) {
      drawBuildSocket(
        socketType,
        slots[socketType],
        socketOccupant(socketType),
        t,
      );
    }

    // Right side control panel, power button and installation progress.
    roundRect(
      ctx,
      741,
      176,
      191,
      267,
      18,
      "rgba(6,16,34,.96)",
      "rgba(104,173,224,.36)",
      1.2,
    );
    roundRect(
      ctx,
      753,
      188,
      167,
      52,
      12,
      "rgba(20,40,68,.86)",
      "rgba(92,151,203,.20)",
      1,
    );
    text("KOKOONPANON TILA", 836, 202, 10, "#b8d4eb", 900, "center");
    text(
      allInstalled() ? "VALMIS TESTATTAVAKSI" : "RAKENNUS KESKEN",
      836,
      222,
      allInstalled() ? 10.5 : 12,
      "#f2f6ff",
      900,
      "center",
    );
    // Progress bar.
    roundRect(ctx, 761, 250, 151, 7, 4, "#0c1b30", "#294b6b", 0.8);
    const installedCount = types.filter((type) => installed[type]).length;
    const progress = installedCount / Math.max(1, types.length);
    if (progress > 0) {
      const pg = ctx.createLinearGradient(761, 0, 912, 0);
      pg.addColorStop(0, "#37d9c4");
      pg.addColorStop(1, "#88f6bd");
      roundRect(ctx, 761, 250, 151 * progress, 7, 4, pg, null);
    }
    text(
      `${installedCount}/${types.length} OSAA ASENNETTU`,
      836,
      273,
      10,
      "#c3d9ea",
      850,
      "center",
    );
    // Large illuminated power icon.
    ctx.save();
    ctx.shadowColor = allInstalled()
      ? "rgba(81,255,199,.75)"
      : "rgba(95,141,192,.15)";
    ctx.shadowBlur = allInstalled() ? 25 : 6;
    const pg = ctx.createRadialGradient(836, 318, 1, 836, 318, 38);
    pg.addColorStop(0, allInstalled() ? "#76ffd3" : "#284965");
    pg.addColorStop(1, allInstalled() ? "#1b9d84" : "#162c47");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(836, 318, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = allInstalled() ? "#073e39" : "#99b4d0";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(836, 320, 13, -Math.PI * 0.8, Math.PI * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(836, 297);
    ctx.lineTo(836, 316);
    ctx.stroke();
    text(
      allInstalled() ? "VALMIS KÄYNNISTYSTESTIIN" : "ASENNA KAIKKI OSAT",
      836,
      365,
      9.5,
      "#c3d8ea",
      850,
      "center",
    );
    addButton(
      "power",
      allInstalled() ? "KÄYNNISTÄ JA TESTAA  →" : "ASENNA KAIKKI OSAT",
      753,
      385,
      167,
      42,
      {
        disabled: !allInstalled(),
        size: 9.5,
        fill: "#63f0cd",
        color: "#062326",
        stroke: "#a0ffdf",
      },
    );

    if (dragType) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 43, 0, Math.PI * 2);
      ctx.fillStyle = "#64ffdb";
      ctx.fill();
      ctx.restore();
      drawComponent(dragType, pointer.x, pointer.y, 0.86, true);
      roundRect(
        ctx,
        pointer.x - 67,
        pointer.y + 34,
        134,
        24,
        8,
        "rgba(5,13,29,.96)",
        "rgba(116,239,218,.48)",
        1,
      );
      text(
        info[dragType].name,
        pointer.x,
        pointer.y + 46,
        10,
        "#ecfffb",
        850,
        "center",
      );
    }
    roundRect(
      ctx,
      295,
      467,
      425,
      43,
      12,
      "rgba(5,15,32,.92)",
      "rgba(90,171,217,.29)",
      1,
    );
    text(
      allInstalled()
        ? "Käynnistä kone ja katso tunnistaako se osat."
        : "Kokeile asennuspaikkoja. Vääräkin kokoonpano voidaan testata.",
      507,
      488,
      11,
      "#ffffff",
      750,
      "center",
    );
  }
  function drawComputerTower(x, y, w, h, t, active = true) {
    // A stylized but recognisable mid-tower PC with a transparent side panel,
    // motherboard, CPU cooler, RAM and a dual-fan graphics card.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w / 240, h / 300);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 12;
    const shell = ctx.createLinearGradient(0, 22, 202, 285);
    shell.addColorStop(0, "#6e8297");
    shell.addColorStop(0.28, "#293b52");
    shell.addColorStop(1, "#101a2b");
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(43, 0);
    ctx.lineTo(239, 20);
    ctx.lineTo(199, 47);
    ctx.lineTo(199, 300);
    ctx.lineTo(0, 273);
    ctx.closePath();
    ctx.fillStyle = shell;
    ctx.fill();
    ctx.restore();
    // Top and right metal bevels.
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(43, 0);
    ctx.lineTo(239, 20);
    ctx.lineTo(199, 47);
    ctx.closePath();
    ctx.fillStyle = "#8296a9";
    ctx.fill();
    ctx.strokeStyle = "#b4c9dc";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(199, 47);
    ctx.lineTo(239, 20);
    ctx.lineTo(239, 275);
    ctx.lineTo(199, 300);
    ctx.closePath();
    ctx.fillStyle = "#142238";
    ctx.fill();
    ctx.strokeStyle = "#5e7892";
    ctx.stroke();
    // Main side panel.
    ctx.beginPath();
    ctx.moveTo(10, 35);
    ctx.lineTo(190, 54);
    ctx.lineTo(190, 281);
    ctx.lineTo(10, 257);
    ctx.closePath();
    ctx.fillStyle = "#06111f";
    ctx.fill();
    ctx.strokeStyle = "#97afc4";
    ctx.lineWidth = 2;
    ctx.stroke();
    const glass = ctx.createLinearGradient(10, 35, 190, 281);
    glass.addColorStop(0, "#15384a");
    glass.addColorStop(0.45, "#0c2939");
    glass.addColorStop(1, "#081725");
    ctx.beginPath();
    ctx.moveTo(16, 42);
    ctx.lineTo(184, 60);
    ctx.lineTo(184, 273);
    ctx.lineTo(16, 251);
    ctx.closePath();
    ctx.fillStyle = glass;
    ctx.fill();
    // Etched motherboard traces.
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "#39c9ae";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const yy = 65 + i * 23;
      ctx.beginPath();
      ctx.moveTo(23, yy);
      ctx.lineTo(39, yy);
      ctx.lineTo(46, yy + 7);
      ctx.lineTo(78, yy + 7);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const yy = 73 + i * 28;
      ctx.beginPath();
      ctx.moveTo(119, yy);
      ctx.lineTo(139, yy);
      ctx.lineTo(145, yy + 7);
      ctx.lineTo(174, yy + 7);
      ctx.stroke();
    }
    ctx.restore();
    // CPU socket and memory bank at the upper left.
    roundRect(ctx, 45, 77, 54, 53, 4, "#182833", "#9baeb4", 1.5);
    roundRect(ctx, 50, 82, 44, 43, 3, "#0a151f", "#698c8e", 1);
    drawComponent("CPU", 72, 103, 0.45, active);
    for (let i = 0; i < 2; i++) {
      roundRect(ctx, 107 + i * 12, 76, 7, 51, 2, "#204b3c", "#83bd90", 1);
      for (let k = 0; k < 5; k++)
        roundRect(
          ctx,
          109 + i * 12,
          82 + k * 8,
          3,
          5,
          1,
          "#141d24",
          "#688b75",
          0.6,
        );
    }
    // Graphics card across the lower area.
    roundRect(ctx, 35, 169, 132, 48, 3, "#1d2b3d", "#a5b7c7", 1.4);
    drawComponent("GPU", 100, 191, 0.72, active);
    // Three case fans with moving blades and status LEDs.
    for (let i = 0; i < 3; i++) {
      const fx = 159,
        fy = 86 + i * 68;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(active ? t * 0.0018 * (i % 2 ? 1 : -1) : 0);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = "#06111d";
      ctx.fill();
      ctx.strokeStyle = active ? "#65eedc" : "#54758e";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      for (let b = 0; b < 7; b++) {
        ctx.save();
        ctx.rotate((b * Math.PI * 2) / 7);
        ctx.beginPath();
        ctx.moveTo(-2, -2);
        ctx.quadraticCurveTo(10, -8, 4, -16);
        ctx.quadraticCurveTo(-5, -13, -2, -2);
        ctx.fillStyle = b % 2 ? "#4e7b95" : "#7cebdc";
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#c5f8f0";
      ctx.fill();
      ctx.restore();
    }
    // Power switch and lower air vents.
    ctx.beginPath();
    ctx.arc(213, 51, 5, 0, Math.PI * 2);
    ctx.fillStyle = active ? "#5effc8" : "#667b90";
    ctx.fill();
    ctx.strokeStyle = "#c7e8f4";
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < 5; i++)
      roundRect(ctx, 209, 238 + i * 8, 18, 3, 1, "#081321", "#435a74", 0.5);
    ctx.restore();
  }

  function drawBooting(t) {
    drawBackground(t, true);
    const bootElapsedMs = Math.max(0, t - bootStartedAt);
    const elapsedBoot = clamp(bootElapsedMs / 5000, 0, 1);
    const checks = activeMachineTypes();
    const failingIndex = checks.findIndex((type) => placements[type] !== type);
    const hasFailure = failingIndex >= 0;
    const failureAt = hasFailure ? 250 + failingIndex * 360 : Infinity;
    const checking = hasFailure
      ? bootElapsedMs < failureAt
      : bootElapsedMs < 3500;
    const showPostFailure = hasFailure && !checking;
    const caseY = 158;
    const desk = ctx.createLinearGradient(0, 438, 0, H);
    desk.addColorStop(0, "#243d59");
    desk.addColorStop(1, "#091324");
    ctx.fillStyle = desk;
    ctx.fillRect(0, 438, W, H - 438);
    ctx.strokeStyle = "rgba(93,177,218,.28)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 42) {
      ctx.beginPath();
      ctx.moveTo(x, 438);
      ctx.lineTo(x - 50, H);
      ctx.stroke();
    }
    roundRect(ctx, 24, 30, 912, 44, 12, "rgba(5,15,31,.94)", "#537e9d", 1.2);
    text(
      `COMPONENT QUEST  /  ${stageIndex === 0 ? "ENSIMMÄINEN KÄYNNISTYS" : "PÄIVITYKSEN TARKISTUS"}`,
      46,
      52,
      14,
      "#f0f8ff",
      900,
    );
    drawComputerTower(48, caseY, 244, 288, t, true);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.58)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 13;
    roundRect(ctx, 317, 84, 602, 338, 18, "#17253a", "#9bb5ca", 2);
    ctx.restore();
    roundRect(ctx, 332, 99, 572, 305, 10, "#020711", "#405a73", 1.4);
    const sx = 342,
      sy = 109,
      sw = 552,
      sh = 285;

    if (checking) {
      const screen = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      screen.addColorStop(0, "#06131d");
      screen.addColorStop(0.65, "#081c28");
      screen.addColorStop(1, "#04101a");
      ctx.fillStyle = screen;
      ctx.fillRect(sx, sy, sw, sh);
      text("CQ BIOS  v1.04", sx + 21, sy + 22, 13, "#c6f7e8", 900);
      ctx.strokeStyle = "#285766";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 16, sy + 39);
      ctx.lineTo(sx + sw - 16, sy + 39);
      ctx.stroke();
      const rowInfo = {
        CPU: ["PROSESSORI", "CPU-KANTA"],
        RAM: ["KESKUSMUISTI", "DDR5 DIMM"],
        GPU: ["NÄYTÖNOHJAIN", "PCIe x16"],
        SSD: ["TALLENNUS", "M.2 NVMe"],
        COOLER: ["JÄÄHDYTYS", "CPU-JÄÄHDYTIN"],
      };
      let checkedCount = 0;
      checks.forEach((type, i) => {
        const revealAt = 180 + i * 360;
        if (bootElapsedMs < revealAt) return;
        if (hasFailure && i > failingIndex) return;
        checkedCount++;
        const yy = sy + 61 + (i % 5) * 35;
        const isOk = placements[type] === type;
        text(
          isOk ? "✓" : "!",
          sx + 24,
          yy,
          13,
          isOk ? "#70ffd0" : "#ff958a",
          950,
        );
        text(rowInfo[type][0], sx + 48, yy, 11, "#b7d9e8", 800);
        text(
          isOk ? `${rowInfo[type][1]} OK` : "YHTEENSOPIVUUSVIRHE",
          sx + sw - 20,
          yy,
          10,
          isOk ? "#81f2cd" : "#ff9d91",
          900,
          "right",
        );
      });
      const total = checks.length;
      text(
        hasFailure
          ? "TARKISTUS PYSÄHTYI VIRHEESEEN"
          : "TARKISTETAAN LAITTEISTOA...",
        sx + 20,
        sy + 237,
        10,
        hasFailure ? "#ffb3a8" : "#bdd1df",
        800,
      );
      const totalProgress = hasFailure
        ? Math.min(checkedCount / total, (failingIndex + 1) / total)
        : clamp(bootElapsedMs / 3500, 0, 1);
      roundRect(
        ctx,
        sx + 20,
        sy + 251,
        sw - 40,
        9,
        4,
        "#132d3a",
        "#355c6d",
        0.8,
      );
      roundRect(
        ctx,
        sx + 20,
        sy + 251,
        (sw - 40) * totalProgress,
        9,
        4,
        hasFailure ? "#ff8e80" : "#39d8bd",
        null,
      );
    } else if (showPostFailure) {
      // Stop on the first failed POST item; never show a false all-OK screen first.
      const screen = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      screen.addColorStop(0, "#211722");
      screen.addColorStop(1, "#080c18");
      ctx.fillStyle = screen;
      ctx.fillRect(sx, sy, sw, sh);
      roundRect(
        ctx,
        sx + 18,
        sy + 17,
        sw - 36,
        sh - 34,
        10,
        "rgba(28,13,20,.94)",
        "rgba(255,128,112,.48)",
        1.2,
      );
      text("CQ BIOS  /  POST-VIRHE", sx + 34, sy + 43, 15, "#ffb9a9", 950);
      text(
        "YHTEENSOPIVUUSVIRHE HAVAITTU",
        sx + 34,
        sy + 72,
        12,
        "#fff2ef",
        950,
      );
      const firstBroken = checks[failingIndex];
      text(
        `${info[firstBroken].name} ei toimi valitussa liitännässä.`,
        sx + 34,
        sy + 101,
        11,
        "#efcbc7",
        700,
      );
      const issues = installDiagnostics();
      issues.slice(0, 4).forEach((d, i) => {
        const yy = sy + 132 + i * 29;
        roundRect(
          ctx,
          sx + 28,
          yy - 12,
          sw - 56,
          24,
          5,
          "rgba(89,39,43,.42)",
          "rgba(238,133,118,.18)",
          0.7,
        );
        text(
          `${info[d.part].short} → ${d.socket}`,
          sx + 40,
          yy,
          9.7,
          "#fff0ed",
          850,
        );
      });
      text(
        "Diagnoosi avautuu hetken kuluttua.",
        sx + sw / 2,
        sy + sh - 35,
        10,
        "#ffc2b7",
        800,
        "center",
      );
    } else {
      // Only a configuration whose every required component passed POST reaches this desktop boot.
      const deskbg = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
      deskbg.addColorStop(0, "#0b2545");
      deskbg.addColorStop(0.5, "#14516a");
      deskbg.addColorStop(1, "#102347");
      ctx.fillStyle = deskbg;
      ctx.fillRect(sx, sy, sw, sh);
      for (let i = 0; i < 12; i++) {
        ctx.strokeStyle = "rgba(96,244,218,.19)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx + i * 52, sy + sh);
        ctx.lineTo(sx + sw * 0.56, sy + 65);
        ctx.lineTo(sx + sw, sy + sh - i * 14);
        ctx.stroke();
      }
      roundRect(
        ctx,
        sx + 18,
        sy + 18,
        sw - 36,
        sh - 36,
        12,
        "rgba(4,18,37,.82)",
        "rgba(126,231,228,.36)",
        1,
      );
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#5cebd2";
      roundRect(ctx, sx + 40, sy + 42, 72, 72, 17, "#173e56", "#63f0dc", 1.5);
      ctx.restore();
      text("CQ", sx + 76, sy + 78, 29, "#a4fff0", 950, "center");
      text("COMPONENT OS", sx + 130, sy + 55, 12, "#95f3e5", 900);
      text("Käynnistetään työpöytää", sx + 130, sy + 79, 20, "#f2faff", 900);
      text(
        stageIndex === 0
          ? "Peruskokoonpano läpäisi POST-testin."
          : "Tietokoneen päivitys läpäisi POST-testin.",
        sx + 130,
        sy + 103,
        11,
        "#c8e3f2",
        650,
      );
      roundRect(
        ctx,
        sx + 130,
        sy + 132,
        sw - 190,
        10,
        5,
        "#152e45",
        "#456c87",
        0.8,
      );
      roundRect(
        ctx,
        sx + 130,
        sy + 132,
        (sw - 190) * clamp((bootElapsedMs - 3500) / 1500, 0, 1),
        10,
        5,
        "#62efce",
        null,
      );
      const okStep = checks.length > 1 ? (sw - 80) / (checks.length - 1) : 0;
      checks.forEach((type, i) =>
        text(
          `${info[type].short}  OK`,
          sx + 40 + i * okStep,
          sy + 180,
          9.5,
          "#a3ffe3",
          850,
          "center",
        ),
      );
      roundRect(
        ctx,
        sx + 18,
        sy + sh - 39,
        sw - 36,
        22,
        6,
        "rgba(1,8,20,.72)",
        "rgba(125,203,233,.18)",
        0.7,
      );
      text(
        "Tervetuloa. Tietokoneesi on valmis.",
        sx + sw / 2,
        sy + sh - 28,
        10,
        "#e7fbff",
        800,
        "center",
      );
    }
    ctx.beginPath();
    ctx.moveTo(563, 422);
    ctx.lineTo(675, 422);
    ctx.lineTo(694, 455);
    ctx.lineTo(544, 455);
    ctx.closePath();
    ctx.fillStyle = "#536d86";
    ctx.fill();
    ctx.strokeStyle = "#abc1d3";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    roundRect(ctx, 520, 452, 198, 13, 5, "#334a63", "#9ab3c8", 1.2);
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#62f6d6";
    ctx.fillStyle = "#62f6d6";
    ctx.beginPath();
    ctx.arc(619, 414, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    roundRect(
      ctx,
      351,
      471,
      554,
      40,
      10,
      "rgba(5,15,31,.94)",
      "rgba(83,159,189,.4)",
      1,
    );
    const footerStatus =
      hasFailure && showPostFailure
        ? "POST löysi virheen – siirrytään diagnostiikkaan…"
        : checking
          ? "POST tarkistaa komponentteja..."
          : stageIndex === 0
            ? "Käyttöjärjestelmä käynnistyy..."
            : "Päivityksen jälkeen käynnistetään...";
    text(footerStatus, 628, 491, 12, "#ecf9ff", 800, "center");
    const pct = hasFailure
      ? Math.min(99, Math.round((bootElapsedMs / bootDurationMs()) * 100))
      : Math.round(elapsedBoot * 100);
    text(
      `${pct}%`,
      880,
      491,
      11,
      hasFailure ? "#ffad9f" : "#75f3d2",
      900,
      "right",
    );
  }

  function drawDiagnostics(t) {
    drawBackground(t, true);
    text("LAITTEISTOTESTI", 36, 34, 11, "#ffb9aa", 950);
    text(
      "Kone ei käynnistynyt – tarkista liitännät",
      36,
      61,
      22,
      "#ffffff",
      950,
    );
    text(
      "Olet asentanut osat, mutta yksi tai useampi niistä ei vastaa liitäntäänsä.",
      36,
      86,
      11,
      "#c9ddeb",
      700,
    );
    // Draw a compact open case to keep the physical problem visually grounded.
    drawComputerTower(43, 139, 223, 279, t, false);
    roundRect(
      ctx,
      291,
      112,
      640,
      322,
      15,
      "rgba(5,15,31,.97)",
      "rgba(231,133,117,.50)",
      1.3,
    );
    roundRect(
      ctx,
      307,
      128,
      608,
      41,
      9,
      "rgba(72,28,34,.72)",
      "rgba(255,147,126,.27)",
      1,
    );
    text(
      "POST-VIRHEET / TARKISTETTAVAT KOMPONENTIT",
      326,
      149,
      11,
      "#ffcabd",
      950,
    );
    const issues = installDiagnostics();
    const socketDescriptions = {
      CPU: "prosessorikantaan (LGA1700)",
      RAM: "RAM-muistipaikkaan (DDR5 DIMM)",
      GPU: "PCIe x16 -paikkaan",
      SSD: "M.2 NVMe -paikkaan",
      COOLER: "prosessorijäähdyttimen kiinnikkeisiin",
    };
    issues.forEach((d, i) => {
      const y = 183 + i * 75;
      roundRect(
        ctx,
        308,
        y,
        606,
        65,
        9,
        "rgba(20,30,47,.98)",
        "rgba(239,133,115,.26)",
        1,
      );
      roundRect(
        ctx,
        321,
        y + 10,
        48,
        45,
        7,
        "rgba(75,43,46,.8)",
        "rgba(255,142,120,.35)",
        0.8,
      );
      drawComponent(
        d.part,
        345,
        y + 32,
        d.part === "GPU" ? 0.27 : d.part === "SSD" ? 0.38 : 0.34,
        false,
      );
      text(
        `${info[d.part].name}: väärä liitäntä`,
        384,
        y + 18,
        11,
        "#fff1ee",
        900,
      );
      text(
        `Asennettu: ${socketDescriptions[d.socket] || "tuntemattomaan liitäntään"}.`,
        384,
        y + 34,
        9.3,
        "#d7e4ed",
        700,
      );
      text(d.reason, 384, y + 50, 8.1, "#ffbeaf", 650);
    });
    if (!issues.length) {
      text(
        "Liitännät näyttävät oikeilta. Kokeile käynnistystä uudelleen.",
        326,
        220,
        12,
        "#c9f6e9",
        800,
      );
    }
    text(
      "Vinkki: oikean paikan tunnistaa sen muodosta ja emolevyn merkinnästä.",
      311,
      455,
      10,
      "#b9d2e2",
      700,
    );
    addButton("fix", "PALAA KORJAAMAAN  ↶", 334, 475, 292, 40, {
      size: 12,
      fill: "#ffb59e",
      color: "#28151a",
      stroke: "#ffe0d7",
    });
    text(
      "Osat säilyvät. Siirrä väärä osa oikeaan paikkaan ja testaa uudelleen.",
      480,
      526,
      10,
      "#a9bfce",
      700,
      "center",
    );
  }

  function drawSuccess(t) {
    drawBackground(t, true);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#50ead5";
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const x = i * 74;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 90, 540);
      ctx.stroke();
    }
    ctx.restore();
    // Desktop screen and monitor bezel.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.58)";
    ctx.shadowBlur = 27;
    ctx.shadowOffsetY = 11;
    roundRect(ctx, 22, 55, 563, 368, 18, "#1c2b40", "#a8c2d5", 2);
    ctx.restore();
    roundRect(ctx, 36, 69, 535, 338, 9, "#020711", "#506b85", 1.4);
    const sx = 44,
      sy = 77,
      sw = 519,
      sh = 322;
    const wallpaper = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    wallpaper.addColorStop(0, "#0c2b4d");
    wallpaper.addColorStop(0.45, "#12506a");
    wallpaper.addColorStop(1, "#141f4c");
    ctx.fillStyle = wallpaper;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#73f6df";
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 9; i++) {
      const y = sy + 40 + i * 31;
      ctx.beginPath();
      ctx.moveTo(sx + 9, y);
      ctx.lineTo(sx + 72, y);
      ctx.lineTo(sx + 87, y + 9);
      ctx.lineTo(sx + 160, y + 9);
      ctx.stroke();
    }
    ctx.restore();
    roundRect(
      ctx,
      sx + 11,
      sy + 10,
      sw - 22,
      26,
      7,
      "rgba(3,14,30,.88)",
      "rgba(130,218,229,.20)",
      1,
    );
    text("COMPONENT OS", sx + 25, sy + 23, 10, "#b8fff0", 900);
    roundRect(
      ctx,
      sx + sw - 94,
      sy + 16,
      75,
      14,
      5,
      "rgba(27,116,87,.75)",
      "#73f8c0",
      0.7,
    );
    text("● ONLINE", sx + sw - 56.5, sy + 23, 8, "#b9ffe3", 900, "center");
    roundRect(
      ctx,
      sx + 18,
      sy + 48,
      sw - 36,
      218,
      10,
      "rgba(5,18,37,.94)",
      "rgba(113,204,229,.47)",
      1.2,
    );
    roundRect(
      ctx,
      sx + 18,
      sy + 48,
      sw - 36,
      28,
      8,
      "rgba(31,62,88,.96)",
      "rgba(113,204,229,.20)",
      0.7,
    );
    text("JÄRJESTELMÄN TIEDOT", sx + 31, sy + 62, 9, "#d8efff", 900);
    text(
      "Käynnistys onnistui!",
      sx + sw / 2,
      sy + 91,
      18,
      "#f4fffb",
      950,
      "center",
    );
    text(
      stageIndex === 0
        ? "Peruskokoonpano tunnistettiin."
        : "SSD ja prosessorijäähdytin lisättiin.",
      sx + sw / 2,
      sy + 111,
      10,
      "#c4e8f3",
      650,
      "center",
    );
    const cardY = sy + 126,
      cardGap = types.length === 3 ? 8 : 12,
      cardW = types.length === 3 ? 148 : 220;
    const totalCardWidth = types.length * cardW + (types.length - 1) * cardGap;
    const cardX = sx + (sw - totalCardWidth) / 2;
    const cardShort = {
      CPU: "Laskenta",
      RAM: "Työmuisti",
      GPU: "Grafiikka",
      SSD: "NVMe-tallennus",
      COOLER: "Lämmönhallinta",
    };
    const componentScale = {
      CPU: 0.44,
      RAM: 0.44,
      GPU: 0.43,
      SSD: 0.65,
      COOLER: 0.42,
    };
    types.forEach((type, i) => {
      const x = cardX + i * (cardW + cardGap);
      roundRect(
        ctx,
        x,
        cardY,
        cardW,
        127,
        8,
        "rgba(19,44,67,.98)",
        "rgba(92,171,201,.36)",
        1,
      );
      drawComponent(
        type,
        x + cardW / 2,
        cardY + 32,
        componentScale[type] || 0.42,
        false,
      );
      text(
        info[type].name,
        x + cardW / 2,
        cardY + 65,
        10,
        "#f0f9ff",
        900,
        "center",
      );
      roundRect(
        ctx,
        x + 23,
        cardY + 81,
        cardW - 46,
        20,
        6,
        "rgba(36,112,106,.32)",
        "rgba(99,224,192,.22)",
        0.6,
      );
      text(
        cardShort[type],
        x + cardW / 2,
        cardY + 91,
        9,
        "#aaffdf",
        800,
        "center",
      );
      text(
        "TUNNISTETTU ✓",
        x + cardW / 2,
        cardY + 113,
        7.5,
        "#b8cddd",
        850,
        "center",
      );
    });
    roundRect(
      ctx,
      sx + 8,
      sy + 276,
      sw - 16,
      31,
      7,
      "rgba(2,10,24,.93)",
      "rgba(103,171,206,.26)",
      0.8,
    );
    roundRect(ctx, sx + 20, sy + 283, 20, 18, 5, "#1a6d73", "#6af0dc", 0.8);
    text("CQ", sx + 30, sy + 292, 7.5, "#dffff8", 950, "center");
    text("Järjestelmä valmis", sx + 51, sy + 292, 8, "#d0e9f6", 750);
    text(
      "100%  •  Toiminta kunnossa",
      sx + sw - 20,
      sy + 292,
      8,
      "#9ff7d7",
      800,
      "right",
    );
    ctx.beginPath();
    ctx.moveTo(254, 423);
    ctx.lineTo(352, 423);
    ctx.lineTo(365, 450);
    ctx.lineTo(240, 450);
    ctx.closePath();
    ctx.fillStyle = "#5b728a";
    ctx.fill();
    ctx.strokeStyle = "#a8bfd0";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    roundRect(ctx, 218, 448, 171, 12, 5, "#344b62", "#8da9c0", 1);
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#66f5d5";
    ctx.fillStyle = "#66f5d5";
    ctx.beginPath();
    ctx.arc(305, 415, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    roundRect(
      ctx,
      603,
      43,
      335,
      454,
      17,
      "rgba(5,16,32,.97)",
      "rgba(109,193,213,.48)",
      1.4,
    );
    text("LAITTEISTORAPORTTI", 622, 64, 9, "#84f4df", 950);
    text(
      stageIndex === 0 ? "Taso 1 suoritettu!" : "Hienoa, tietokone valmis!",
      622,
      88,
      18,
      "#f5fbff",
      950,
    );
    roundRect(
      ctx,
      619,
      103,
      143,
      55,
      10,
      "rgba(26,58,80,.88)",
      "rgba(92,174,204,.32)",
      1,
    );
    text(`PISTEET / ${MAX_SCORE}`, 632, 118, 8, "#a6cadc", 900);
    text(String(completionScore()), 632, 141, 21, "#85ffdb", 950);
    roundRect(
      ctx,
      772,
      103,
      148,
      55,
      10,
      "rgba(26,58,80,.88)",
      "rgba(92,174,204,.32)",
      1,
    );
    text("SUORITUSAIKA", 784, 118, 8, "#a6cadc", 900);
    text(timeString(elapsed()), 784, 141, 18, "#f3fbff", 900);
    text(
      `TASO ${stageIndex + 1}/${campaignStages.length} LÄPÄISTY · POST OK`,
      622,
      177,
      8.2,
      "#a9e9d7",
      800,
    );
    const factsByType = {
      CPU: {
        title: "PROSESSORI (CPU)",
        line1: "Suorittaa ohjelmien käskyjä ja laskutoimituksia.",
        line2: "Vaikuttaa monien tehtävien käsittelynopeuteen.",
      },
      RAM: {
        title: "KESKUSMUISTI (RAM)",
        line1: "Pitää avoimien ohjelmien tiedot nopeasti saatavilla.",
        line2: "Virran katkaisu tyhjentää RAM-muistin.",
      },
      GPU: {
        title: "NÄYTÖNOHJAIN (GPU)",
        line1: "Laskee kuvan ja 3D-grafiikan.",
        line2: "Tärkeä peleissä ja 3D-mallinnuksessa.",
      },
      SSD: {
        title: "NVMe-SSD",
        line1: "Tallentaa ohjelmat ja tiedostot pysyvästi.",
        line2: "M.2 NVMe käyttää nopeaa PCIe-väylää.",
      },
      COOLER: {
        title: "PROSESSORIJÄÄHDYTIN",
        line1: "Siirtää lämpöä pois prosessorista.",
        line2: "Auttaa estämään ylikuumenemista.",
      },
    };
    types.forEach((type, i) => {
      const f = factsByType[type],
        y = 185 + i * 64;
      roundRect(
        ctx,
        618,
        y,
        304,
        58,
        8,
        "rgba(17,36,57,.97)",
        "rgba(99,155,188,.28)",
        1,
      );
      drawComponent(type, 642, y + 29, componentScale[type] * 0.76, false);
      text(f.title, 670, y + 14, 8.7, "#f3fbff", 950);
      text(f.line1, 670, y + 30, 7.7, "#c9dfed", 650);
      text(f.line2, 670, y + 44, 7.7, "#a7c6d8", 650);
    });
    const canContinue = stageIndex < campaignStages.length - 1;
    if (canContinue) {
      addButton("nextLevel", "SEURAAVA TASO  →", 638, 386, 264, 38, {
        size: 11,
        fill: "#66f0cd",
        color: "#062326",
        stroke: "#a0ffdf",
      });
      addButton("replay", "TAKAISIN ALOITUSRUUTUUN  ↶", 638, 430, 264, 34, {
        size: 9.5,
      });
      text(
        "Seuraavaksi: kerää SSD ja prosessorijäähdytin.",
        770,
        478,
        8,
        "#83a9bc",
        650,
        "center",
      );
    } else {
      addButton("replay", "TAKAISIN ALOITUSRUUTUUN  ↶", 638, 420, 264, 40, {
        size: 10.5,
      });
      text("Kiitos pelaamisesta!", 770, 476, 9, "#83a9bc", 650, "center");
    }
  }
  function drawTimerWarnings(t) {
    if (state === "title") return;
    const now = performance.now();
    const idle = now - lastActivityAt;

    // Keep this warning small and unobtrusive. It is drawn above every active game
    // screen (platformer, build, booting, diagnostics, success and transitions).
    if (idle >= IDLE_WARNING_MS && idle < IDLE_TIMEOUT_MS) {
      const seconds = Math.max(1, Math.ceil((IDLE_TIMEOUT_MS - idle) / 1000));
      roundRect(
        ctx,
        654,
        73,
        290,
        29,
        8,
        "rgba(40,31,25,.94)",
        "rgba(255,195,119,.58)",
        1,
      );
      text(
        `Paluu alkuun ${seconds} s – jatka pelaamista`,
        799,
        87.5,
        9.5,
        "#ffdfb9",
        800,
        "center",
      );
    }

    // The five-minute session limit only needs an in-game HUD on the playable
    // interaction screens. The hard limit itself is enforced centrally in loop().
    if (
      state === "finish" ||
      state === "booting" ||
      state === "diagnostics" ||
      state === "success"
    )
      return;
    const remaining = MAX_SESSION_MS - elapsed();
    if (remaining <= 30000 && remaining > 0) {
      roundRect(
        ctx,
        357,
        75,
        246,
        27,
        8,
        "rgba(72,37,29,.91)",
        "rgba(255,183,115,.4)",
        1,
      );
      text(
        `Peliaikaa jäljellä ${Math.ceil(remaining / 1000)} s`,
        480,
        88.5,
        11,
        "#ffcf9d",
        800,
        "center",
      );
    }
    if (
      toast &&
      t < toastUntil &&
      (state === "build" || state === "platformer")
    ) {
      if (state === "build") {
        const words = toast.split(/\s+/),
          lines = [];
        let line = "";
        for (const word of words) {
          const next = line ? line + " " + word : word;
          if (next.length > 31 && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        if (line) lines.push(line);
        roundRect(
          ctx,
          708,
          72,
          236,
          83,
          10,
          "rgba(5,17,31,.97)",
          "rgba(255,171,139,.55)",
          1.1,
        );
        lines
          .slice(0, 4)
          .forEach((ln, i) =>
            text(ln, 826, 86 + i * 17, 9.1, "#fff1ec", 750, "center"),
          );
      } else {
        const words = toast.split(/\s+/),
          lines = [];
        let line = "";
        for (const word of words) {
          const next = line ? line + " " + word : word;
          if (next.length > 58 && line) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        if (line) lines.push(line);
        const visible = lines.slice(0, 2),
          ty = visible.length > 1 ? 472 : 493;
        roundRect(
          ctx,
          165,
          ty,
          630,
          visible.length > 1 ? 48 : 30,
          9,
          "#061322",
          "#5b9a9d",
          1.2,
        );
        visible.forEach((ln, i) =>
          text(
            ln,
            480,
            ty + (visible.length > 1 ? 15 + i * 18 : 15),
            12,
            "#ffffff",
            800,
            "center",
          ),
        );
      }
    }
  }
  function render(t) {
    buttonHitCount = 0;
    ctx.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, W, H);
    if (state === "title") drawTitle(t);
    else if (state === "platformer") drawPlatformWorld(t);
    else if (state === "finish") drawFinishTransition(t);
    else if (state === "build") drawBuildScene(t);
    else if (state === "booting") drawBooting(t);
    else if (state === "diagnostics") drawDiagnostics(t);
    else if (state === "success") drawSuccess(t);
    drawTimerWarnings(t);
    if (sceneTransitionTargetState) {
      const transitionElapsed = Math.max(0, t - sceneTransitionStartedAt);
      const smoothstep = (p) => p * p * (3 - 2 * p);
      let opacity;
      if (transitionElapsed < SCENE_FADE_OUT_MS) {
        opacity = smoothstep(
          clamp(transitionElapsed / SCENE_FADE_OUT_MS, 0, 1),
        );
      } else {
        const fadeInProgress = clamp(
          (transitionElapsed - SCENE_FADE_OUT_MS) / SCENE_FADE_IN_MS,
          0,
          1,
        );
        opacity = 1 - smoothstep(fadeInProgress);
      }
      if (opacity > 0) {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = "#020611";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
  }
  function updatePlatformer(dt, t) {
    if (state !== "platformer") {
      jumpQueued = false;
      return;
    }
    const frame = dt / 16.67;
    const left = keys.has("ArrowLeft") || keys.has("KeyA");
    const right = keys.has("ArrowRight") || keys.has("KeyD");
    player.vx = ((right ? 1 : 0) - (left ? 1 : 0)) * 4.25;
    if (player.vx !== 0) {
      player.face = Math.sign(player.vx);
      player.walk += dt / 100;
    }
    // A fresh key press triggers a jump. The second fresh press in mid-air
    // triggers a proper double jump, even when the first jump has ended.
    if (jumpQueued) {
      if (player.grounded) {
        player.vy = -12.6;
        player.grounded = false;
        player.jumpsUsed = 1;
      } else if (player.jumpsUsed < 2) {
        player.vy = -11.5;
        player.jumpsUsed = 2;
        notify("Tuplahyppy! Nyt pääset ylemmäs.", 1000);
      }
      jumpQueued = false;
    }
    const oldY = player.y,
      oldBottom = oldY + player.h,
      oldX = player.x;
    player.x = clamp(player.x + player.vx * frame, 0, worldWidth - player.w);
    player.vy = Math.min(14, player.vy + 0.52 * frame);
    player.y += player.vy * frame;
    player.grounded = false;
    // The starting dock is the only ground area; death always returns the player here.
    const startGroundY = floorY - 18;
    if (
      player.x < 165 &&
      player.y + player.h >= startGroundY &&
      oldBottom <= startGroundY + 8 &&
      player.vy >= 0
    ) {
      player.y = startGroundY - player.h;
      player.vy = 0;
      player.grounded = true;
      player.jumpsUsed = 0;
    }
    // Land only when descending onto the top side of a PCB ledge. Ledges are not checkpoints.
    for (const p of platforms) {
      const newBottom = player.y + player.h;
      if (
        player.x + player.w > p.x + 2 &&
        player.x < p.x + p.w - 2 &&
        oldBottom <= p.y + 5 &&
        newBottom >= p.y &&
        player.vy >= 0
      ) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.jumpsUsed = 0;
      }
    }
    // Any physical contact with an energized hazard restarts at the level's starting dock.
    // Do not respawn at the last ledge: the player should replay the level from its beginning.
    const struck = hazards.find(
      (h) =>
        player.x + player.w > h.x &&
        player.x < h.x + h.w &&
        player.y + player.h > h.y &&
        player.y < h.y + h.h,
    );
    if (struck) {
      respawnAtLevelStart(
        "Sähkökipinä! Aloitat tason alusta. Kerätyt osat säilyvät.",
      );
    }
    if (player.y > floorY + 100) {
      respawnAtLevelStart(
        "Robotti putosi! Aloitat tason alusta. Kerätyt osat säilyvät.",
      );
    }
    // Collectible checks use a generous radius and never impose score penalties.
    for (const item of items) {
      if (item.got) continue;
      const bob = Math.sin(t / 185 + item.phase) * 4.5;
      const dx = player.x + player.w / 2 - item.x;
      const dy = player.y + player.h / 2 - (item.y + bob);
      if (Math.abs(dx) < 62 && Math.abs(dy) < 100) {
        item.got = true;
        collected[item.type] = true;
        addScore(100);
        notify(
          `${info[item.type].name} kerätty! ${info[item.type].detail}`,
          2400,
        );
      }
    }
    // Reaching the last board is the platformer's finish line. Components must
    // all be collected first; the assembly phase starts only after crossing GO.
    const finish = getFinishGate();
    const nearFinish =
      player.x + player.w >= finish.x - 16 &&
      player.x <= finish.x + 20 &&
      player.grounded &&
      Math.abs(player.y + player.h - finish.platform.y) < 24;
    if (nearFinish) {
      if (allCollected()) {
        state = "finish";
        finishStartedAt = t;
        player.vx = 0;
        player.vy = 0;
        jumpQueued = false;
      } else {
        player.x = finish.x - player.w - 24;
        player.vx = 0;
        if (t - lastGoalNoticeAt > 2200) {
          const missing = types.filter((type) => !collected[type]).join(", ");
          notify(`GO-maali odottaa! Etsi vielä: ${missing}.`, 2200);
          lastGoalNoticeAt = t;
        }
      }
    }
    // Follow both the long motherboard and its vertical climb.
    const targetCameraX = clamp(player.x - 300, 0, worldWidth - W);
    cameraX += (targetCameraX - cameraX) * Math.min(1, dt / 100);
    const screenY = player.y - cameraY;
    let targetCameraY = cameraY;
    if (screenY < 155) targetCameraY = player.y - 155;
    else if (screenY > 420) targetCameraY = player.y - 420;
    targetCameraY = clamp(targetCameraY, 0, worldHeight - H);
    cameraY += (targetCameraY - cameraY) * Math.min(1, dt / 90);
  }
  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - r.left) / r.width) * W, 0, W),
      y: clamp(((e.clientY - r.top) / r.height) * H, 0, H),
    };
  }
  function hitSlot(type, p) {
    const s = slots[type];
    const pad = 7;
    return (
      p.x >= s.x - pad &&
      p.x <= s.x + s.w + pad &&
      p.y >= s.y - pad &&
      p.y <= s.y + s.h + pad
    );
  }
  function hitAnySocket(p) {
    return types.find((socketType) => hitSlot(socketType, p)) || null;
  }
  function inTray(type, p) {
    const tr = trays[type];
    return (
      p.x >= tr.x && p.x <= tr.x + tr.w && p.y >= tr.y && p.y <= tr.y + tr.h
    );
  }
  function evaluatePlacement(partType, socketType) {
    if (socketType === partType) {
      if (!correctInstallAwarded[partType]) {
        addScore(100);
        correctInstallAwarded[partType] = true;
      }
    } else {
      // Keep the failed attempt in the final score, but do not reveal the answer now.
      // The player must install all parts and press the power button to see the POST diagnosis.
      mistakes++;
      penaltyPoints += WRONG_INSTALL_PENALTY;
    }
  }
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const p = pointerPos(e);
    pointer = { ...p, down: true };
    activity();
    canvas.setPointerCapture?.(e.pointerId);
    canvas.focus({ preventScroll: true });
    for (let i = buttonHitCount - 1; i >= 0; i--) {
      const b = buttonHits[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        if (!b.disabled) handleAction(b.id);
        return;
      }
    }
    if (state === "build") {
      // Grab an already-placed component directly from its socket.
      for (const type of types) {
        const socket = placements[type];
        if (socket && hitSlot(socket, p)) {
          dragType = type;
          dragOrigin = socket;
          return;
        }
      }
      // Unplaced parts can be dragged from the inventory tray.
      for (const type of types) {
        if (!installed[type] && inTray(type, p)) {
          dragType = type;
          dragOrigin = null;
          return;
        }
      }
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointerPos(e);
    if (Math.abs(p.x - lastPointer.x) > 4 || Math.abs(p.y - lastPointer.y) > 4)
      activity();
    lastPointer = p;
    pointer.x = p.x;
    pointer.y = p.y;
  });
  canvas.addEventListener("pointerup", (e) => {
    const p = pointerPos(e);
    pointer = { ...p, down: false };
    activity();
    if (state === "build" && dragType) {
      const part = dragType,
        origin = dragOrigin,
        target = hitAnySocket(p);
      if (target) {
        if (placements[part] !== target) {
          // A socket accepts the dropped part even when it is the wrong shape.
          // If the target is occupied, return the other part to the tray so it can be repositioned.
          const displaced = types.find(
            (other) => other !== part && placements[other] === target,
          );
          if (displaced) {
            placements[displaced] = null;
            installed[displaced] = false;
          }
          placements[part] = target;
          installed[part] = true;
          evaluatePlacement(part, target);
        }
      } else if (origin && inTray(part, p)) {
        // Dragging a part back to its inventory card safely removes it without counting as an error.
        placements[part] = null;
        installed[part] = false;
        notify(`${info[part].name} palautettu osavalikoimaan.`, 1300);
      }
      dragType = null;
      dragOrigin = null;
    }
  });
  canvas.addEventListener("pointercancel", () => {
    dragType = null;
    dragOrigin = null;
    pointer.down = false;
  });
  function handleAction(id) {
    activity();
    if (id === "start") beginSession();
    else if (id === "build" && allCollected()) {
      assemblyDisplayScore = currentScore();
      state = "build";
      dragType = null;
      dragOrigin = null;
      toast = "";
      toastUntil = 0;
    } else if (id === "power" && allInstalled()) {
      state = "booting";
      bootStartedAt = performance.now();
      toast = "";
      toastUntil = 0;
    } else if (id === "fix") {
      state = "build";
      dragType = null;
      dragOrigin = null;
      toast = "";
      toastUntil = 0;
    } else if (id === "nextLevel") beginNextStage();
    else if (id === "replay") resetSession();
  }
  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code))
      e.preventDefault();
    activity();
    const freshPress = !keys.has(e.code);
    keys.add(e.code);
    if (
      freshPress &&
      !e.repeat &&
      ["Space", "ArrowUp", "KeyW"].includes(e.code)
    )
      jumpQueued = true;
    if (state === "title" && e.code === "Enter") beginSession();
    if (state === "platformer" && e.code === "Escape")
      resetSession("Pelikerta keskeytettiin.");
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || state === "title") return;
    const now = performance.now();
    if (now - lastActivityAt >= IDLE_TIMEOUT_MS) {
      resetSession(
        "Peli palasi aloitusruutuun 60 sekunnin käyttämättömyyden jälkeen.",
      );
    } else {
      // If the player returns before the timeout, the resumed tab counts as activity.
      activity();
    }
  });

  function beginSceneTransition(nextState, now) {
    // Keep the boot scene visible while it dims. Switch to the result view only
    // when the transition reaches its darkest point, then reveal it smoothly.
    sceneTransitionTargetState = nextState;
    sceneTransitionStartedAt = now;
    sceneTransitionSwitched = false;
  }

  function updateSessionAndScenes(now) {
    // Wall-clock systems are evaluated every animation frame, independently from physics.
    // This includes the global five-minute limit and idle timeout for every game scene.
    if (state === "title") return;
    const sessionElapsed = elapsed();
    if (sessionElapsed >= MAX_SESSION_MS) {
      resetSession("Viisi minuuttia on kulunut. Aloita uusi pelikerta!");
      return;
    }
    if (now - lastActivityAt >= IDLE_TIMEOUT_MS) {
      resetSession(
        "Peli palasi aloitusruutuun 60 sekunnin käyttämättömyyden jälkeen.",
      );
      return;
    }
    if (
      state === "booting" &&
      now - bootStartedAt >= bootDurationMs() &&
      !sceneTransitionTargetState
    ) {
      const bootPassed = allCorrectlyInstalled();
      if (
        bootPassed &&
        stageIndex === campaignStages.length - 1 &&
        completionElapsedMs === null
      ) {
        // Freeze elapsed time only after the final campaign upgrade has passed POST.
        completionElapsedMs = Math.max(0, now - gameStartedAt);
        finalScoreValue = Math.min(
          MAX_SCORE,
          Math.max(
            0,
            currentScore() + 200 + (completionElapsedMs < 180000 ? 250 : 0),
          ),
        );
      }
      beginSceneTransition(bootPassed ? "success" : "diagnostics", now);
    }
    if (sceneTransitionTargetState) {
      const transitionElapsed = now - sceneTransitionStartedAt;
      if (transitionElapsed >= SCENE_FADE_OUT_MS && !sceneTransitionSwitched) {
        state = sceneTransitionTargetState;
        sceneTransitionSwitched = true;
      }
      if (transitionElapsed >= SCENE_TRANSITION_MS) {
        sceneTransitionTargetState = null;
        sceneTransitionStartedAt = 0;
        sceneTransitionSwitched = false;
      }
    }
    if (state === "finish" && now - finishStartedAt >= 1450) {
      assemblyDisplayScore = currentScore();
      state = "build";
    }
  }

  function updatePhysics(frameDelta, now) {
    if (state !== "platformer") {
      physicsAccumulator = 0;
      syncPhysicsRenderState(false);
      return;
    }
    physicsAccumulator = Math.min(
      physicsAccumulator + frameDelta,
      FIXED_STEP_MS * MAX_PHYSICS_STEPS_PER_FRAME,
    );
    let steps = 0;
    while (
      physicsAccumulator >= FIXED_STEP_MS &&
      steps < MAX_PHYSICS_STEPS_PER_FRAME &&
      state === "platformer"
    ) {
      previousPlayerX = player.x;
      previousPlayerY = player.y;
      previousCameraX = cameraX;
      previousCameraY = cameraY;
      updatePlatformer(FIXED_STEP_MS, now);
      physicsAccumulator -= FIXED_STEP_MS;
      steps++;
      if (physicsSnapRequested) {
        previousPlayerX = player.x;
        previousPlayerY = player.y;
        previousCameraX = cameraX;
        previousCameraY = cameraY;
        physicsSnapRequested = false;
      }
      if (state !== "platformer") {
        // Scene changes reset interpolation so the old location is never rendered into a new scene.
        syncPhysicsRenderState(true);
        break;
      }
    }
    // Bounded catch-up prevents the spiral-of-death on a stalled/background tab.
    if (
      steps >= MAX_PHYSICS_STEPS_PER_FRAME &&
      physicsAccumulator >= FIXED_STEP_MS
    ) {
      physicsAccumulator = physicsAccumulator % FIXED_STEP_MS;
    }
  }

  function renderInterpolated(now) {
    if (state !== "platformer") {
      render(now);
      return;
    }
    // Interpolate between fixed simulation states for smooth motion on 60/90/120/144 Hz displays.
    const alpha = clamp(physicsAccumulator / FIXED_STEP_MS, 0, 1);
    const currentX = player.x,
      currentY = player.y,
      currentCameraX = cameraX,
      currentCameraY = cameraY;
    player.x = previousPlayerX + (currentX - previousPlayerX) * alpha;
    player.y = previousPlayerY + (currentY - previousPlayerY) * alpha;
    cameraX = previousCameraX + (currentCameraX - previousCameraX) * alpha;
    cameraY = previousCameraY + (currentCameraY - previousCameraY) * alpha;
    render(now);
    // Restore authoritative physics state immediately; render code never affects collisions.
    player.x = currentX;
    player.y = currentY;
    cameraX = currentCameraX;
    cameraY = currentCameraY;
  }

  function loop(now) {
    const rawDelta = Math.max(0, now - lastFrame);
    const frameDelta = Math.min(MAX_FRAME_DELTA_MS, rawDelta);
    lastFrame = now;
    updateSessionAndScenes(now);
    updatePhysics(frameDelta, now);
    // Paint every requestAnimationFrame callback. Simulation uses its own fixed 60 Hz clock.
    renderInterpolated(now);
    requestAnimationFrame(loop);
  }
  // Draw immediately, then start the display-rate render loop.
  const initialRenderTime = performance.now();
  lastFrame = initialRenderTime;
  render(initialRenderTime);
  requestAnimationFrame(loop);
})();
