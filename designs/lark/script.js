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
      topGlow: 0,
      targetTopGlow: 0,
    },

    disturbances: [],

    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

  const plumes = [
    {
      baseX: 0.5,
      baseY: 0.972,
      topY: 0.04,
      startWidth: 0.014,
      endWidth: 0.3,
      sway: 0.1,
      phase: 0.2,
      tilt: -0.015,
      brightness: 1,
    },
    {
      baseX: 0.455,
      baseY: 0.962,
      topY: 0.1,
      startWidth: 0.012,
      endWidth: 0.26,
      sway: 0.09,
      phase: 1.2,
      tilt: -0.12,
      brightness: 0.84,
    },
    {
      baseX: 0.545,
      baseY: 0.962,
      topY: 0.1,
      startWidth: 0.012,
      endWidth: 0.26,
      sway: 0.09,
      phase: 2.0,
      tilt: 0.12,
      brightness: 0.84,
    },
    {
      baseX: 0.39,
      baseY: 0.935,
      topY: 0.18,
      startWidth: 0.011,
      endWidth: 0.22,
      sway: 0.082,
      phase: 3.0,
      tilt: -0.18,
      brightness: 0.6,
    },
    {
      baseX: 0.61,
      baseY: 0.935,
      topY: 0.18,
      startWidth: 0.011,
      endWidth: 0.22,
      sway: 0.082,
      phase: 4.0,
      tilt: 0.18,
      brightness: 0.6,
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

  function addDisturbance(x, y, velocityX, velocityY, strength = 1) {
    state.disturbances.push({
      x,
      y,
      vx: velocityX,
      vy: velocityY,
      strength,
      life: 1,
      radius:
        Math.max(state.width, state.height) *
        lerp(0.08, 0.18, Math.min(1, strength)),
    });

    if (state.disturbances.length > 18) {
      state.disturbances.shift();
    }
  }

  function onPointerDown(event) {
    const point = getPoint(event);
    state.pointer.active = true;
    state.pointer.id = event.pointerId ?? null;
    state.pointer.lastX = point.x;
    state.pointer.lastY = point.y;
    state.pointer.velocityX = 0;
    state.pointer.velocityY = 0;

    addDisturbance(point.x, point.y, 0, -0.2, 0.4);

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
    const speed = Math.min(1.8, Math.hypot(dx, dy) / 28);

    state.motion.targetSwayX = clamp(
      state.motion.targetSwayX + dxNorm * 2.6,
      -1.4,
      1.4,
    );
    state.motion.targetSwayY = clamp(
      state.motion.targetSwayY - dyNorm * 1.35,
      -1,
      1,
    );

    state.motion.targetDragDriftX = clamp(
      state.motion.targetDragDriftX + dxNorm * 220,
      -220,
      220,
    );
    state.motion.targetDragDriftY = clamp(
      state.motion.targetDragDriftY + dyNorm * 120,
      -130,
      130,
    );

    state.motion.targetSmokeLift = clamp(
      state.motion.targetSmokeLift + speed * 0.34 + Math.abs(dyNorm) * 0.48,
      0,
      2.4,
    );

    state.motion.targetEmberPulse = clamp(
      state.motion.targetEmberPulse + speed * 0.26 + Math.abs(dxNorm) * 0.14,
      0,
      1.9,
    );

    state.motion.targetTopGlow = clamp(
      state.motion.targetTopGlow + speed * 0.2 + Math.abs(dyNorm) * 0.18,
      0,
      1.7,
    );

    addDisturbance(point.x, point.y, dx * 0.16, dy * 0.16 - 0.4, speed);
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

  function updateDisturbances(deltaSeconds) {
    for (let i = state.disturbances.length - 1; i >= 0; i -= 1) {
      const d = state.disturbances[i];
      d.x += d.vx;
      d.y += d.vy;
      d.vx *= decay(0.95, deltaSeconds);
      d.vy *= decay(0.94, deltaSeconds);
      d.vy -= 0.02;
      d.life *= decay(0.95, deltaSeconds);
      d.radius += 22 * deltaSeconds * 60;
      d.strength *= decay(0.96, deltaSeconds);

      if (d.life < 0.08 || d.strength < 0.05) {
        state.disturbances.splice(i, 1);
      }
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.velocityX *= decay(0.9, deltaSeconds);
      state.pointer.velocityY *= decay(0.9, deltaSeconds);

      state.motion.targetDragDriftX *= decay(0.986, deltaSeconds);
      state.motion.targetDragDriftY *= decay(0.987, deltaSeconds);
      state.motion.targetSmokeLift *= decay(0.956, deltaSeconds);
      state.motion.targetEmberPulse *= decay(0.952, deltaSeconds);
      state.motion.targetTopGlow *= decay(0.954, deltaSeconds);
    }

    const idleSwayX =
      Math.sin(state.time * 0.42) * 0.14 + Math.cos(state.time * 0.17) * 0.05;
    const idleSwayY =
      Math.cos(state.time * 0.34) * 0.09 + Math.sin(state.time * 0.12) * 0.035;

    const swayX = clamp(
      state.motion.targetSwayX + state.motion.sensorX * 0.58 + idleSwayX,
      -1.5,
      1.5,
    );
    const swayY = clamp(
      state.motion.targetSwayY + state.motion.sensorY * 0.38 + idleSwayY,
      -1.1,
      1.1,
    );

    const dragX = state.motion.targetDragDriftX + state.motion.sensorX * 20;
    const dragY = state.motion.targetDragDriftY + state.motion.sensorY * 16;

    const lift =
      0.24 +
      state.motion.targetSmokeLift +
      Math.abs(state.motion.sensorY) * 0.16 +
      Math.abs(swayY) * 0.1;

    const ember =
      0.18 +
      state.motion.targetEmberPulse +
      Math.abs(state.motion.sensorX) * 0.12;

    const topGlow =
      0.26 +
      state.motion.targetTopGlow +
      Math.abs(state.motion.sensorX) * 0.12 +
      Math.abs(state.motion.sensorY) * 0.1;

    state.motion.swayX = lerp(state.motion.swayX, swayX, 0.07);
    state.motion.swayY = lerp(state.motion.swayY, swayY, 0.07);
    state.motion.dragDriftX = lerp(state.motion.dragDriftX, dragX, 0.08);
    state.motion.dragDriftY = lerp(state.motion.dragDriftY, dragY, 0.08);
    state.motion.smokeLift = lerp(state.motion.smokeLift, lift, 0.07);
    state.motion.emberPulse = lerp(state.motion.emberPulse, ember, 0.07);
    state.motion.topGlow = lerp(state.motion.topGlow, topGlow, 0.07);

    updateDisturbances(deltaSeconds);
  }

  function disturbanceOffset(x, y, t) {
    let offsetX = 0;
    let offsetY = 0;

    for (const d of state.disturbances) {
      const dx = x - d.x;
      const dy = y - d.y;
      const distance = Math.hypot(dx, dy);
      const influence = Math.exp(
        -(distance * distance) / (d.radius * d.radius),
      );
      const verticalWeight = 0.4 + t * 0.9;

      offsetX +=
        (d.vx * 2.4 + dx * 0.004) * influence * d.strength * verticalWeight;
      offsetY +=
        (d.vy * 2.1 + dy * 0.003) * influence * d.strength * verticalWeight;
    }

    return { x: offsetX, y: offsetY };
  }

  function drawBeam(x, angle, width, alpha) {
    ctx.save();
    ctx.translate(state.width * x, -state.height * 0.06);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, 0, state.height * 0.7);
    grad.addColorStop(0, `rgba(255, 186, 96, ${alpha})`);
    grad.addColorStop(0.16, `rgba(255, 176, 88, ${alpha * 0.72})`);
    grad.addColorStop(0.42, `rgba(255, 156, 72, ${alpha * 0.18})`);
    grad.addColorStop(1, "rgba(255, 156, 72, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(-width * 0.5, 0, width, state.height * 0.74);
    ctx.restore();
  }

  function drawBackdrop() {
    const fill = ctx.createLinearGradient(0, 0, 0, state.height);
    fill.addColorStop(0, "#130406");
    fill.addColorStop(0.24, "#180709");
    fill.addColorStop(0.56, "#130507");
    fill.addColorStop(1, "#070202");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const redField = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.95,
      0,
      state.width * 0.5,
      state.height * 0.95,
      Math.max(state.width, state.height) * 0.78,
    );
    redField.addColorStop(0, "rgba(136, 12, 26, 0.32)");
    redField.addColorStop(0.18, "rgba(126, 11, 24, 0.26)");
    redField.addColorStop(0.42, "rgba(88, 8, 18, 0.1)");
    redField.addColorStop(0.68, "rgba(34, 3, 8, 0.03)");
    redField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = redField;
    ctx.fillRect(0, 0, state.width, state.height);

    const emberField = ctx.createRadialGradient(
      state.width * (0.5 + state.motion.swayX * 0.008),
      state.height * 0.965,
      0,
      state.width * 0.5,
      state.height * 0.965,
      Math.max(state.width, state.height) * 0.22,
    );
    emberField.addColorStop(
      0,
      `rgba(166, 18, 34, ${0.86 + state.motion.emberPulse * 0.08})`,
    );
    emberField.addColorStop(
      0.16,
      `rgba(152, 16, 31, ${0.66 + state.motion.emberPulse * 0.06})`,
    );
    emberField.addColorStop(0.34, "rgba(128, 12, 25, 0.28)");
    emberField.addColorStop(0.56, "rgba(88, 8, 18, 0.08)");
    emberField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = emberField;
    ctx.fillRect(0, 0, state.width, state.height);

    const emberCore = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.972,
      0,
      state.width * 0.5,
      state.height * 0.972,
      Math.max(state.width, state.height) * 0.075,
    );
    emberCore.addColorStop(
      0,
      `rgba(178, 22, 40, ${0.92 + state.motion.emberPulse * 0.06})`,
    );
    emberCore.addColorStop(0.42, "rgba(160, 18, 34, 0.46)");
    emberCore.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = emberCore;
    ctx.fillRect(0, 0, state.width, state.height);

    const topOrange = ctx.createRadialGradient(
      state.width * (0.54 + state.motion.swayX * 0.016),
      -state.height * 0.14,
      0,
      state.width * 0.54,
      -state.height * 0.14,
      Math.max(state.width, state.height) * 0.72,
    );
    topOrange.addColorStop(
      0,
      `rgba(255, 188, 96, ${0.56 + state.motion.topGlow * 0.1})`,
    );
    topOrange.addColorStop(
      0.14,
      `rgba(255, 176, 86, ${0.38 + state.motion.topGlow * 0.08})`,
    );
    topOrange.addColorStop(0.32, "rgba(255, 160, 74, 0.18)");
    topOrange.addColorStop(0.54, "rgba(255, 146, 64, 0.06)");
    topOrange.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topOrange;
    ctx.fillRect(0, 0, state.width, state.height * 0.74);

    drawBeam(
      0.46,
      -0.09,
      state.width * 0.16,
      0.22 + state.motion.topGlow * 0.04,
    );
    drawBeam(
      0.56,
      0.08,
      state.width * 0.16,
      0.24 + state.motion.topGlow * 0.05,
    );
    drawBeam(
      0.5,
      -0.01,
      state.width * 0.24,
      0.14 + state.motion.topGlow * 0.04,
    );

    ctx.restore();
  }

  function plumePoint(spec, t) {
    const rise = 1 - t;
    const baseX = state.width * spec.baseX;
    const startY = state.height * spec.baseY;
    const endY = state.height * spec.topY;
    const y = lerp(startY, endY, t);

    const curveA =
      Math.sin(state.time * 0.5 + spec.phase + t * 4.6) *
      state.width *
      spec.sway *
      (0.42 + rise * 0.9);

    const curveB =
      Math.cos(state.time * 0.32 + spec.phase * 1.3 + t * 7.2) *
      state.width *
      spec.sway *
      0.42 *
      rise;

    const curveC =
      Math.sin(state.time * 0.18 + spec.phase * 0.8 + t * 10.4) *
      state.width *
      spec.sway *
      0.16 *
      (0.4 + t);

    const verticalShear =
      (t - 0.5) * state.motion.swayX * state.width * 0.09 +
      state.motion.dragDriftX * (0.025 + t * 0.0015);

    const disturbance = disturbanceOffset(baseX, y, t);

    const x =
      baseX +
      curveA +
      curveB +
      curveC +
      verticalShear +
      disturbance.x +
      spec.tilt * state.width * t * 0.2;

    return {
      x,
      y: y + disturbance.y + state.motion.dragDriftY * (0.01 + t * 0.001),
    };
  }

  function drawSmokeMass(spec) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const count = 34;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const p = plumePoint(spec, t);

      const spread =
        state.width * lerp(spec.startWidth, spec.endWidth, Math.pow(t, 1.85));
      const alpha =
        (0.038 + t * 0.034) * spec.brightness + state.motion.smokeLift * 0.008;

      const main = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, spread);
      main.addColorStop(0, `rgba(255,255,255,${alpha})`);
      main.addColorStop(0.24, `rgba(255,255,255,${alpha * 0.56})`);
      main.addColorStop(0.58, `rgba(255,255,255,${alpha * 0.18})`);
      main.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = main;
      ctx.fillRect(p.x - spread, p.y - spread, spread * 2, spread * 2);

      for (let k = 0; k < 4; k += 1) {
        const orbit = spread * (0.14 + t * 0.34);
        const angle = state.time * 0.18 + spec.phase + i * 0.22 + k * 1.52;
        const ox = Math.cos(angle) * orbit;
        const oy = Math.sin(angle * 1.16) * orbit * 0.42;
        const puffRadius = spread * (0.42 + k * 0.08);

        const puff = ctx.createRadialGradient(
          p.x + ox,
          p.y + oy,
          0,
          p.x + ox,
          p.y + oy,
          puffRadius,
        );
        puff.addColorStop(0, `rgba(255,255,255,${alpha * 0.6})`);
        puff.addColorStop(0.3, `rgba(255,255,255,${alpha * 0.26})`);
        puff.addColorStop(0.76, "rgba(255,255,255,0.012)");
        puff.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = puff;
        ctx.fillRect(
          p.x + ox - puffRadius,
          p.y + oy - puffRadius,
          puffRadius * 2,
          puffRadius * 2,
        );
      }
    }

    ctx.restore();
  }

  function drawDisturbanceVeils() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const d of state.disturbances) {
      const veil = ctx.createRadialGradient(
        d.x,
        d.y,
        0,
        d.x,
        d.y,
        d.radius * 0.9,
      );
      veil.addColorStop(0, `rgba(255,255,255,${0.06 * d.life})`);
      veil.addColorStop(0.22, `rgba(255,255,255,${0.03 * d.life})`);
      veil.addColorStop(0.55, `rgba(255,255,255,${0.012 * d.life})`);
      veil.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = veil;
      ctx.fillRect(d.x - d.radius, d.y - d.radius, d.radius * 2, d.radius * 2);
    }

    ctx.restore();
  }

  function drawSmokeBase() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const base = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.95,
      0,
      state.width * 0.5,
      state.height * 0.95,
      state.width * 0.16,
    );
    base.addColorStop(0, "rgba(255,255,255,0.08)");
    base.addColorStop(0.28, "rgba(255,255,255,0.03)");
    base.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawFinalHaze() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const glaze = ctx.createLinearGradient(
      state.width * (0.28 + state.motion.swayX * 0.02),
      0,
      state.width * (0.72 + state.motion.swayX * 0.02),
      state.height,
    );
    glaze.addColorStop(0, "rgba(255,255,255,0)");
    glaze.addColorStop(0.14, "rgba(255,255,255,0.03)");
    glaze.addColorStop(0.34, "rgba(255,255,255,0.08)");
    glaze.addColorStop(0.56, "rgba(255,170,92,0.06)");
    glaze.addColorStop(0.74, "rgba(255,255,255,0.024)");
    glaze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glaze;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    drawSmokeBase();
    plumes.forEach(drawSmokeMass);
    drawDisturbanceVeils();
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
