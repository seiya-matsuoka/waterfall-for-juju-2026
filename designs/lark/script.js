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
      topY: 0.03,
      startWidth: 0.012,
      endWidth: 0.34,
      sway: 0.11,
      phase: 0.2,
      tilt: -0.01,
      brightness: 1,
    },
    {
      baseX: 0.455,
      baseY: 0.965,
      topY: 0.08,
      startWidth: 0.011,
      endWidth: 0.3,
      sway: 0.1,
      phase: 1.2,
      tilt: -0.12,
      brightness: 0.86,
    },
    {
      baseX: 0.545,
      baseY: 0.965,
      topY: 0.08,
      startWidth: 0.011,
      endWidth: 0.3,
      sway: 0.1,
      phase: 2.0,
      tilt: 0.12,
      brightness: 0.86,
    },
    {
      baseX: 0.39,
      baseY: 0.94,
      topY: 0.16,
      startWidth: 0.01,
      endWidth: 0.26,
      sway: 0.086,
      phase: 3.0,
      tilt: -0.18,
      brightness: 0.62,
    },
    {
      baseX: 0.61,
      baseY: 0.94,
      topY: 0.16,
      startWidth: 0.01,
      endWidth: 0.26,
      sway: 0.086,
      phase: 4.0,
      tilt: 0.18,
      brightness: 0.62,
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
      0.28 +
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
    ctx.translate(state.width * x, -state.height * 0.12);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, 0, state.height * 0.8);
    grad.addColorStop(0, `rgba(255, 192, 98, ${alpha})`);
    grad.addColorStop(0.14, `rgba(255, 180, 88, ${alpha * 0.82})`);
    grad.addColorStop(0.34, `rgba(255, 164, 76, ${alpha * 0.34})`);
    grad.addColorStop(1, "rgba(255, 164, 76, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(-width * 0.5, 0, width, state.height * 0.86);
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
      state.height * 0.97,
      0,
      state.width * 0.5,
      state.height * 0.97,
      Math.max(state.width, state.height) * 0.9,
    );
    redField.addColorStop(0, "rgba(144, 14, 28, 0.34)");
    redField.addColorStop(0.16, "rgba(132, 12, 26, 0.28)");
    redField.addColorStop(0.36, "rgba(98, 9, 20, 0.12)");
    redField.addColorStop(0.62, "rgba(36, 3, 8, 0.03)");
    redField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = redField;
    ctx.fillRect(0, 0, state.width, state.height);

    const emberField = ctx.createRadialGradient(
      state.width * (0.5 + state.motion.swayX * 0.008),
      state.height * 0.978,
      0,
      state.width * 0.5,
      state.height * 0.978,
      Math.max(state.width, state.height) * 0.29,
    );
    emberField.addColorStop(
      0,
      `rgba(172, 20, 36, ${0.9 + state.motion.emberPulse * 0.08})`,
    );
    emberField.addColorStop(
      0.14,
      `rgba(160, 18, 33, ${0.7 + state.motion.emberPulse * 0.06})`,
    );
    emberField.addColorStop(0.3, "rgba(136, 13, 27, 0.32)");
    emberField.addColorStop(0.52, "rgba(96, 9, 20, 0.08)");
    emberField.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = emberField;
    ctx.fillRect(0, 0, state.width, state.height);

    const emberCore = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.982,
      0,
      state.width * 0.5,
      state.height * 0.982,
      Math.max(state.width, state.height) * 0.11,
    );
    emberCore.addColorStop(
      0,
      `rgba(186, 24, 42, ${0.96 + state.motion.emberPulse * 0.06})`,
    );
    emberCore.addColorStop(0.26, "rgba(172, 20, 36, 0.68)");
    emberCore.addColorStop(0.56, "rgba(144, 14, 28, 0.18)");
    emberCore.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = emberCore;
    ctx.fillRect(0, 0, state.width, state.height);

    const topOrange = ctx.createRadialGradient(
      state.width * (0.54 + state.motion.swayX * 0.016),
      -state.height * 0.22,
      0,
      state.width * 0.54,
      -state.height * 0.22,
      Math.max(state.width, state.height) * 0.92,
    );
    topOrange.addColorStop(
      0,
      `rgba(255, 194, 98, ${0.72 + state.motion.topGlow * 0.1})`,
    );
    topOrange.addColorStop(
      0.12,
      `rgba(255, 184, 90, ${0.52 + state.motion.topGlow * 0.08})`,
    );
    topOrange.addColorStop(0.26, "rgba(255, 170, 80, 0.28)");
    topOrange.addColorStop(0.46, "rgba(255, 154, 70, 0.1)");
    topOrange.addColorStop(0.72, "rgba(255, 144, 62, 0.03)");
    topOrange.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topOrange;
    ctx.fillRect(0, 0, state.width, state.height * 0.9);

    drawBeam(
      0.42,
      -0.12,
      state.width * 0.24,
      0.32 + state.motion.topGlow * 0.05,
    );
    drawBeam(
      0.56,
      0.08,
      state.width * 0.24,
      0.34 + state.motion.topGlow * 0.05,
    );
    drawBeam(
      0.5,
      -0.01,
      state.width * 0.34,
      0.24 + state.motion.topGlow * 0.05,
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

  function drawSoftEllipse(x, y, rx, ry, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.24, `rgba(255,255,255,${alpha * 0.52})`);
    g.addColorStop(0.62, `rgba(255,255,255,${alpha * 0.14})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function drawSmokeMass(spec) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const count = 42;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const p = plumePoint(spec, t);
      const growth = Math.pow(t, 1.75);
      const width = state.width * lerp(spec.startWidth, spec.endWidth, growth);
      const height = width * lerp(3.8, 1.8, t);
      const alpha =
        (0.028 + t * 0.038) * spec.brightness + state.motion.smokeLift * 0.008;

      drawSoftEllipse(p.x, p.y, width, height, alpha);

      const sideOffset = width * (0.18 + t * 0.22);
      drawSoftEllipse(
        p.x - sideOffset,
        p.y + height * 0.04,
        width * 0.82,
        height * 0.88,
        alpha * 0.56,
      );
      drawSoftEllipse(
        p.x + sideOffset,
        p.y - height * 0.02,
        width * 0.82,
        height * 0.88,
        alpha * 0.56,
      );

      if (t > 0.24) {
        const haloWidth = width * (1.24 + t * 0.22);
        const haloHeight = height * (0.92 + t * 0.16);
        drawSoftEllipse(
          p.x +
            Math.sin(state.time * 0.22 + spec.phase + i * 0.15) * width * 0.12,
          p.y +
            Math.cos(state.time * 0.18 + spec.phase + i * 0.12) * height * 0.06,
          haloWidth,
          haloHeight,
          alpha * 0.18,
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

  function drawAtmosphericHaze() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 7; i += 1) {
      const y = state.height * (0.18 + i * 0.1);
      const x =
        state.width * (0.5 + Math.sin(state.time * 0.14 + i * 0.8) * 0.04);
      const rx = state.width * (0.22 + i * 0.04);
      const ry = state.height * (0.08 + i * 0.022);
      drawSoftEllipse(x, y, rx, ry, 0.014 + i * 0.003);
    }

    ctx.restore();
  }

  function drawSmokeBase() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const base = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.96,
      0,
      state.width * 0.5,
      state.height * 0.96,
      state.width * 0.14,
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
      state.width * (0.24 + state.motion.swayX * 0.02),
      0,
      state.width * (0.76 + state.motion.swayX * 0.02),
      state.height,
    );
    glaze.addColorStop(0, "rgba(255,255,255,0)");
    glaze.addColorStop(0.12, "rgba(255,255,255,0.035)");
    glaze.addColorStop(0.3, "rgba(255,255,255,0.09)");
    glaze.addColorStop(0.54, "rgba(255,170,92,0.07)");
    glaze.addColorStop(0.74, "rgba(255,255,255,0.028)");
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
    drawAtmosphericHaze();
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
