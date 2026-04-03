(() => {
  const canvas = document.getElementById("lark-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const motionButton = document.getElementById("motion-permission-button");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const decay = (base, seconds) => Math.pow(base, seconds * 60);

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    lastFrame: performance.now(),

    pointer: {
      active: false,
      id: null,
      lastX: 0,
      lastY: 0,
      velocityX: 0,
      velocityY: 0,
    },

    motion: {
      swayX: 0,
      swayY: 0,
      targetSwayX: 0,
      targetSwayY: 0,

      dragDriftX: 0,
      dragDriftY: 0,
      targetDragDriftX: 0,
      targetDragDriftY: 0,

      sensorX: 0,
      sensorY: 0,

      smokeLift: 0,
      targetSmokeLift: 0,
      emberPulse: 0,
      targetEmberPulse: 0,
    },

    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

  const plumes = [
    {
      baseX: 0.47,
      baseY: 0.92,
      topY: 0.1,
      width: 0.07,
      sway: 0.055,
      phase: 0.1,
      tilt: -0.1,
      brightness: 1,
    },
    {
      baseX: 0.52,
      baseY: 0.94,
      topY: 0.14,
      width: 0.055,
      sway: 0.048,
      phase: 1.2,
      tilt: 0.08,
      brightness: 0.9,
    },
    {
      baseX: 0.43,
      baseY: 0.9,
      topY: 0.2,
      width: 0.045,
      sway: 0.04,
      phase: 2.1,
      tilt: -0.12,
      brightness: 0.72,
    },
    {
      baseX: 0.57,
      baseY: 0.9,
      topY: 0.22,
      width: 0.042,
      sway: 0.036,
      phase: 3.0,
      tilt: 0.12,
      brightness: 0.66,
    },
  ];

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth;
    state.height = window.innerHeight;

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function getPoint(event) {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    return { x: event.clientX, y: event.clientY };
  }

  function onPointerDown(event) {
    const point = getPoint(event);
    state.pointer.active = true;
    state.pointer.id = event.pointerId ?? null;
    state.pointer.lastX = point.x;
    state.pointer.lastY = point.y;
    state.pointer.velocityX = 0;
    state.pointer.velocityY = 0;

    if (event.pointerId != null && canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore capture errors.
      }
    }
  }

  function onPointerMove(event) {
    if (
      state.pointer.id != null &&
      event.pointerId != null &&
      event.pointerId !== state.pointer.id
    ) {
      return;
    }

    if (!state.pointer.active) return;

    const point = getPoint(event);
    const dx = point.x - state.pointer.lastX;
    const dy = point.y - state.pointer.lastY;

    state.pointer.lastX = point.x;
    state.pointer.lastY = point.y;
    state.pointer.velocityX = dx;
    state.pointer.velocityY = dy;

    const dxNorm = dx / Math.max(1, state.width);
    const dyNorm = dy / Math.max(1, state.height);
    const speed = Math.min(1.5, Math.hypot(dx, dy) / 30);

    state.motion.targetSwayX = clamp(
      state.motion.targetSwayX + dxNorm * 2.2,
      -1.2,
      1.2,
    );
    state.motion.targetSwayY = clamp(
      state.motion.targetSwayY - dyNorm * 1.2,
      -0.9,
      0.9,
    );

    state.motion.targetDragDriftX = clamp(
      state.motion.targetDragDriftX + dxNorm * 170,
      -180,
      180,
    );
    state.motion.targetDragDriftY = clamp(
      state.motion.targetDragDriftY + dyNorm * 90,
      -96,
      96,
    );

    state.motion.targetSmokeLift = clamp(
      state.motion.targetSmokeLift + speed * 0.3 + Math.abs(dyNorm) * 0.4,
      0,
      2,
    );

    state.motion.targetEmberPulse = clamp(
      state.motion.targetEmberPulse + speed * 0.22 + Math.abs(dxNorm) * 0.12,
      0,
      1.6,
    );
  }

  function onPointerUp(event) {
    if (
      state.pointer.id != null &&
      event?.pointerId != null &&
      event.pointerId !== state.pointer.id
    ) {
      return;
    }

    if (state.pointer.id != null && canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(state.pointer.id);
      } catch (error) {
        // Ignore release errors.
      }
    }

    state.pointer.active = false;
    state.pointer.id = null;
  }

  function attachOrientationListener() {
    window.addEventListener("deviceorientation", handleOrientation, {
      passive: true,
    });
  }

  function handleOrientation(event) {
    const gamma = clamp((event.gamma ?? 0) / 40, -1, 1);
    const beta = clamp((event.beta ?? 0) / 52, -1, 1);

    state.motion.sensorX = gamma;
    state.motion.sensorY = beta;
    state.orientation.enabled = true;
  }

  function setupOrientation() {
    if (!("DeviceOrientationEvent" in window)) return;

    const requiresPermission =
      typeof DeviceOrientationEvent.requestPermission === "function";

    if (requiresPermission) {
      state.orientation.permissionNeeded = true;
      motionButton.classList.add("is-visible");
      motionButton.addEventListener("click", async () => {
        try {
          const result = await DeviceOrientationEvent.requestPermission();
          if (result === "granted") {
            attachOrientationListener();
            state.orientation.enabled = true;
            motionButton.classList.remove("is-visible");
          }
        } catch (error) {
          // Ignore permission errors and keep manual interaction fallback.
        }
      });
    } else {
      attachOrientationListener();
      state.orientation.enabled = true;
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.velocityX *= decay(0.9, deltaSeconds);
      state.pointer.velocityY *= decay(0.9, deltaSeconds);

      state.motion.targetDragDriftX *= decay(0.985, deltaSeconds);
      state.motion.targetDragDriftY *= decay(0.986, deltaSeconds);
      state.motion.targetSmokeLift *= decay(0.954, deltaSeconds);
      state.motion.targetEmberPulse *= decay(0.95, deltaSeconds);
    }

    const idleSwayX =
      Math.sin(state.time * 0.42) * 0.12 + Math.cos(state.time * 0.17) * 0.04;
    const idleSwayY =
      Math.cos(state.time * 0.34) * 0.08 + Math.sin(state.time * 0.12) * 0.03;

    const swayX = clamp(
      state.motion.targetSwayX + state.motion.sensorX * 0.55 + idleSwayX,
      -1.4,
      1.4,
    );
    const swayY = clamp(
      state.motion.targetSwayY + state.motion.sensorY * 0.34 + idleSwayY,
      -1,
      1,
    );

    const dragX = state.motion.targetDragDriftX + state.motion.sensorX * 18;
    const dragY = state.motion.targetDragDriftY + state.motion.sensorY * 14;

    const lift =
      0.18 +
      state.motion.targetSmokeLift +
      Math.abs(state.motion.sensorY) * 0.12 +
      Math.abs(swayY) * 0.08;

    const ember =
      0.14 +
      state.motion.targetEmberPulse +
      Math.abs(state.motion.sensorX) * 0.1;

    state.motion.swayX = lerp(state.motion.swayX, swayX, 0.07);
    state.motion.swayY = lerp(state.motion.swayY, swayY, 0.07);
    state.motion.dragDriftX = lerp(state.motion.dragDriftX, dragX, 0.08);
    state.motion.dragDriftY = lerp(state.motion.dragDriftY, dragY, 0.08);
    state.motion.smokeLift = lerp(state.motion.smokeLift, lift, 0.07);
    state.motion.emberPulse = lerp(state.motion.emberPulse, ember, 0.07);
  }

  function drawBackdrop() {
    const fill = ctx.createLinearGradient(0, 0, 0, state.height);
    fill.addColorStop(0, "#010101");
    fill.addColorStop(0.55, "#040404");
    fill.addColorStop(1, "#020202");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const redBed = ctx.createRadialGradient(
      state.width * (0.5 + state.motion.swayX * 0.02),
      state.height * 0.88,
      0,
      state.width * 0.5,
      state.height * 0.88,
      Math.max(state.width, state.height) * 0.3,
    );
    redBed.addColorStop(0, "rgba(112, 6, 22, 0.28)");
    redBed.addColorStop(0.24, "rgba(101, 8, 20, 0.2)");
    redBed.addColorStop(0.55, "rgba(62, 5, 12, 0.08)");
    redBed.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = redBed;
    ctx.fillRect(0, 0, state.width, state.height);

    const ember = ctx.createRadialGradient(
      state.width * (0.52 + state.motion.swayX * 0.018),
      state.height * 0.9,
      0,
      state.width * 0.52,
      state.height * 0.9,
      Math.max(state.width, state.height) * 0.16,
    );
    ember.addColorStop(
      0,
      `rgba(255, 170, 88, ${0.16 + state.motion.emberPulse * 0.06})`,
    );
    ember.addColorStop(
      0.24,
      `rgba(255, 140, 64, ${0.08 + state.motion.emberPulse * 0.04})`,
    );
    ember.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ember;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function plumePoint(spec, t) {
    const rise = 1 - t;
    const baseX = state.width * spec.baseX;
    const startY = state.height * spec.baseY;
    const endY = state.height * spec.topY;
    const y = lerp(startY, endY, t);

    const curveA =
      Math.sin(state.time * 0.52 + spec.phase + t * 5.4) *
      state.width *
      spec.sway *
      (0.32 + rise * 0.9);

    const curveB =
      Math.cos(state.time * 0.34 + spec.phase * 1.3 + t * 8.2) *
      state.width *
      spec.sway *
      0.35 *
      rise;

    const verticalShear =
      (t - 0.5) * state.motion.swayX * state.width * 0.08 +
      state.motion.dragDriftX * (0.04 + t * 0.002);

    const x =
      baseX +
      curveA +
      curveB +
      verticalShear +
      spec.tilt * state.width * t * 0.18;

    return { x, y };
  }

  function drawSmokePlume(spec) {
    const steps = 42;
    const points = [];

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      points.push(plumePoint(spec, t));
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const hazeAlpha = 0.035 * spec.brightness + state.motion.smokeLift * 0.004;
    const coreAlpha = 0.12 * spec.brightness + state.motion.smokeLift * 0.008;
    const brightAlpha = 0.18 * spec.brightness + state.motion.smokeLift * 0.012;

    ctx.shadowColor = "rgba(255,255,255,0.16)";
    ctx.shadowBlur = 22 + spec.brightness * 8;

    ctx.strokeStyle = `rgba(255,255,255,${hazeAlpha})`;
    ctx.lineWidth = Math.max(
      8,
      state.width * spec.width * (1.4 + state.motion.smokeLift * 0.08),
    );

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        (prev.x + curr.x) * 0.5,
        (prev.y + curr.y) * 0.5,
      );
    }
    ctx.stroke();

    ctx.shadowBlur = 12 + spec.brightness * 5;
    ctx.strokeStyle = `rgba(255,255,255,${coreAlpha})`;
    ctx.lineWidth = Math.max(
      3,
      state.width * spec.width * (0.74 + state.motion.smokeLift * 0.04),
    );

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        (prev.x + curr.x) * 0.5,
        (prev.y + curr.y) * 0.5,
      );
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,255,255,${brightAlpha})`;
    ctx.lineWidth = Math.max(1.2, state.width * spec.width * 0.18);

    ctx.beginPath();
    const highlightStart = Math.floor(points.length * 0.12);
    ctx.moveTo(points[highlightStart].x, points[highlightStart].y);
    for (let i = highlightStart + 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const curr = points[i];
      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        (prev.x + curr.x) * 0.5,
        (prev.y + curr.y) * 0.5,
      );
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawSmokeVeils() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 5; i += 1) {
      const x =
        state.width *
          (0.45 + i * 0.03 + Math.sin(state.time * 0.22 + i) * 0.012) +
        state.motion.swayX * state.width * 0.02;
      const y =
        state.height * (0.22 + i * 0.11) + state.motion.dragDriftY * 0.08;
      const radius = state.width * (0.09 + i * 0.016);

      const veil = ctx.createRadialGradient(x, y, 0, x, y, radius);
      veil.addColorStop(0, "rgba(255,255,255,0.08)");
      veil.addColorStop(0.32, "rgba(255,255,255,0.04)");
      veil.addColorStop(0.68, "rgba(255,255,255,0.012)");
      veil.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = veil;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.restore();
  }

  function drawSmokeBase() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const base = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.88,
      0,
      state.width * 0.5,
      state.height * 0.88,
      state.width * 0.18,
    );
    base.addColorStop(0, "rgba(255,255,255,0.08)");
    base.addColorStop(0.34, "rgba(255,255,255,0.03)");
    base.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawFinalHaze() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const glaze = ctx.createLinearGradient(
      state.width * (0.38 + state.motion.swayX * 0.02),
      0,
      state.width * (0.68 + state.motion.swayX * 0.02),
      state.height,
    );
    glaze.addColorStop(0, "rgba(255,255,255,0)");
    glaze.addColorStop(0.22, "rgba(255,255,255,0.02)");
    glaze.addColorStop(0.42, "rgba(255,255,255,0.06)");
    glaze.addColorStop(0.58, "rgba(255,162,84,0.03)");
    glaze.addColorStop(0.74, "rgba(255,255,255,0.014)");
    glaze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glaze;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    drawSmokeBase();
    plumes.forEach(drawSmokePlume);
    drawSmokeVeils();
    drawFinalHaze();
  }

  function frame(now) {
    const deltaSeconds = Math.min(0.05, (now - state.lastFrame) / 1000);
    state.lastFrame = now;

    update(deltaSeconds);
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  resize();
  setupOrientation();
  requestAnimationFrame(frame);
})();
