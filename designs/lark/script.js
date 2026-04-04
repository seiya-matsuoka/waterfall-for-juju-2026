(() => {
  const canvas = document.getElementById("lark-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const motionButton = document.getElementById("motion-permission-button");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const mix = (a, b, t) => a + (b - a) * t;
  const decay = (base, seconds) => Math.pow(base, seconds * 60);

  const COLORS = {
    red: [218, 34, 46],
    deepRed: [148, 18, 28],
    white: [242, 236, 230],
    warmWhite: [255, 247, 238],
    orange: [255, 128, 18],
    hotOrange: [255, 146, 24],
    vividOrange: [255, 138, 12],
    softOrange: [255, 184, 108],
  };

  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    lastFrame: performance.now(),
    particles: [],
    influences: [],
    pointer: {
      active: false,
      id: null,
      lastX: 0,
      lastY: 0,
      vx: 0,
      vy: 0,
    },
    motion: {
      tiltX: 0,
      tiltY: 0,
      targetTiltX: 0,
      targetTiltY: 0,
      smokeEnergy: 0,
      targetSmokeEnergy: 0,
      topGlow: 0,
      targetTopGlow: 0,
      sensorX: 0,
      sensorY: 0,
      flowX: 0,
      flowY: 0,
      targetFlowX: 0,
      targetFlowY: 0,
    },
    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

  const plumeBands = [0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8];

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function mixColor(a, b, t) {
    return [
      Math.round(mix(a[0], b[0], t)),
      Math.round(mix(a[1], b[1], t)),
      Math.round(mix(a[2], b[2], t)),
    ];
  }

  function smokeColorByY(y) {
    if (y > 0.8) {
      const t = (y - 0.8) / 0.2;
      return mixColor(COLORS.red, COLORS.deepRed, clamp(t, 0, 1));
    }

    if (y > 0.56) {
      const t = (0.8 - y) / 0.24;
      return mixColor(
        mixColor(COLORS.red, COLORS.warmWhite, 0.08),
        mixColor(COLORS.red, COLORS.warmWhite, 0.34),
        clamp(t, 0, 1),
      );
    }

    if (y > 0.34) {
      const t = (0.56 - y) / 0.22;
      return mixColor(COLORS.warmWhite, COLORS.softOrange, clamp(t, 0, 1));
    }

    if (y > 0.18) {
      const t = (0.34 - y) / 0.16;
      return mixColor(COLORS.softOrange, COLORS.hotOrange, clamp(t, 0, 1));
    }

    const t = y / 0.18;
    return mixColor(COLORS.hotOrange, COLORS.vividOrange, clamp(t, 0, 1));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createParticle(initial = false) {
    const band = plumeBands[Math.floor(Math.random() * plumeBands.length)];
    const y = initial ? Math.random() * 1.2 : randomBetween(1.02, 1.24);

    return {
      band,
      y,
      xBias: randomBetween(-0.05, 0.05),
      widthBase: randomBetween(0.012, 0.026),
      rise: randomBetween(0.08, 0.16),
      drift: randomBetween(0.14, 0.3),
      phase: randomBetween(0, Math.PI * 2),
      wobble: randomBetween(0.7, 1.5),
      alpha: randomBetween(0.03, 0.085),
      rotationBias: randomBetween(-0.55, 0.55),
      vx: 0,
      vy: 0,
    };
  }

  function seedParticles() {
    state.particles = Array.from({ length: 170 }, () => createParticle(true));
  }

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

  function addInfluence(x, y, vx, vy, power = 1) {
    state.influences.push({
      x,
      y,
      vx,
      vy,
      power,
      life: 1,
      radius:
        Math.max(state.width, state.height) *
        lerp(0.18, 0.34, Math.min(power, 1.8) / 1.8),
      swirl: randomBetween(-1, 1),
    });

    if (state.influences.length > 20) {
      state.influences.shift();
    }
  }

  function onPointerDown(event) {
    const point = getPoint(event);
    state.pointer.active = true;
    state.pointer.id = event.pointerId ?? null;
    state.pointer.lastX = point.x;
    state.pointer.lastY = point.y;
    state.pointer.vx = 0;
    state.pointer.vy = 0;

    addInfluence(point.x, point.y, 0, -0.4, 0.55);

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
    state.pointer.vx = dx;
    state.pointer.vy = dy;

    const dxNorm = dx / Math.max(1, state.width);
    const dyNorm = dy / Math.max(1, state.height);
    const speed = Math.min(2, Math.hypot(dx, dy) / 22);

    state.motion.targetTiltX = clamp(
      state.motion.targetTiltX + dxNorm * 2.2,
      -1.8,
      1.8,
    );
    state.motion.targetTiltY = clamp(
      state.motion.targetTiltY - dyNorm * 1.8,
      -1.5,
      1.5,
    );
    state.motion.targetSmokeEnergy = clamp(
      state.motion.targetSmokeEnergy + speed * 0.34 + Math.abs(dyNorm) * 0.46,
      0,
      2.6,
    );
    state.motion.targetTopGlow = clamp(
      state.motion.targetTopGlow + speed * 0.12 + Math.abs(dyNorm) * 0.12,
      0,
      1.4,
    );
    state.motion.targetFlowX = clamp(
      state.motion.targetFlowX + dxNorm * 2.0,
      -2.4,
      2.4,
    );
    state.motion.targetFlowY = clamp(
      state.motion.targetFlowY + dyNorm * 1.4,
      -2.0,
      2.0,
    );

    addInfluence(point.x, point.y, dx * 0.28, dy * 0.28 - 0.86, speed);
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
        canvas.releasePointerCapture(event.pointerId);
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
          // Ignore permission errors.
        }
      });
    } else {
      attachOrientationListener();
      state.orientation.enabled = true;
    }
  }

  function updateInfluences(deltaSeconds) {
    for (let i = state.influences.length - 1; i >= 0; i -= 1) {
      const influence = state.influences[i];
      influence.x += influence.vx;
      influence.y += influence.vy;
      influence.vx *= decay(0.974, deltaSeconds);
      influence.vy *= decay(0.97, deltaSeconds);
      influence.vy -= 0.01;
      influence.life *= decay(0.982, deltaSeconds);
      influence.power *= decay(0.98, deltaSeconds);
      influence.radius += 28 * deltaSeconds * 60;

      if (influence.life < 0.08 || influence.power < 0.05) {
        state.influences.splice(i, 1);
      }
    }
  }

  function applyInfluences(px, py) {
    let fx = 0;
    let fy = 0;

    for (const influence of state.influences) {
      const dx = px - influence.x;
      const dy = py - influence.y;
      const distance = Math.hypot(dx, dy);
      const impact = Math.exp(
        -(distance * distance) / (influence.radius * influence.radius),
      );

      const swirlX = -dy * 0.0012 * influence.swirl;
      const swirlY = dx * 0.0008 * influence.swirl;

      fx +=
        (influence.vx * 0.1 + dx * 0.0011 + swirlX) * impact * influence.power;
      fy +=
        (influence.vy * 0.08 + dy * 0.0007 + swirlY) * impact * influence.power;
    }

    return { fx, fy };
  }

  function updateParticles(deltaSeconds) {
    const dt60 = deltaSeconds * 60;

    for (let i = 0; i < state.particles.length; i += 1) {
      const particle = state.particles[i];

      const progress = 1 - clamp(particle.y, 0, 1);
      const widen = Math.pow(progress, 1.55);

      const ambientX =
        Math.sin(
          state.time * 0.4 * particle.wobble + particle.phase + progress * 5.4,
        ) *
          state.width *
          particle.drift *
          (0.08 + widen * 0.34) +
        Math.cos(state.time * 0.22 + particle.phase * 1.2 + progress * 9.2) *
          state.width *
          particle.drift *
          0.1;

      const bandX = state.width * particle.band;
      const px = bandX + state.width * particle.xBias + ambientX + particle.vx;
      const py = state.height * particle.y + particle.vy;

      const influence = applyInfluences(px, py);
      particle.vx += influence.fx;
      particle.vy += influence.fy;

      particle.vx *= decay(0.974, deltaSeconds);
      particle.vy *= decay(0.976, deltaSeconds);

      const rise =
        (particle.rise + progress * 0.022 + state.motion.smokeEnergy * 0.005) *
        dt60;
      particle.y -= rise / 100;

      particle.vx +=
        (state.motion.tiltX +
          state.motion.sensorX * 0.46 +
          state.motion.flowX * 0.68) *
        0.18 *
        dt60 *
        0.01;
      particle.vy +=
        (-0.22 +
          state.motion.tiltY * 0.06 +
          state.motion.sensorY * 0.05 +
          state.motion.flowY * 0.24) *
        dt60 *
        0.01;

      if (particle.y < -0.16) {
        state.particles[i] = createParticle(false);
      }
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.vx *= decay(0.9, deltaSeconds);
      state.pointer.vy *= decay(0.9, deltaSeconds);
      state.motion.targetSmokeEnergy *= decay(0.97, deltaSeconds);
      state.motion.targetTopGlow *= decay(0.968, deltaSeconds);
      state.motion.targetFlowX *= decay(0.982, deltaSeconds);
      state.motion.targetFlowY *= decay(0.982, deltaSeconds);
    }

    state.motion.targetTiltX *= decay(0.992, deltaSeconds);
    state.motion.targetTiltY *= decay(0.992, deltaSeconds);

    const idleX =
      Math.sin(state.time * 0.34) * 0.24 + Math.cos(state.time * 0.12) * 0.1;
    const idleY =
      Math.cos(state.time * 0.28) * 0.14 + Math.sin(state.time * 0.16) * 0.06;

    const tiltX = clamp(
      state.motion.targetTiltX + state.motion.sensorX * 0.72 + idleX,
      -1.9,
      1.9,
    );
    const tiltY = clamp(
      state.motion.targetTiltY + state.motion.sensorY * 0.5 + idleY,
      -1.5,
      1.5,
    );

    const smokeEnergy =
      0.24 +
      state.motion.targetSmokeEnergy +
      Math.abs(state.motion.sensorY) * 0.12 +
      Math.abs(tiltY) * 0.05;

    const topGlow =
      0.18 +
      state.motion.targetTopGlow +
      Math.abs(state.motion.sensorX) * 0.1 +
      Math.abs(state.motion.sensorY) * 0.08;

    state.motion.tiltX = lerp(state.motion.tiltX, tiltX, 0.08);
    state.motion.tiltY = lerp(state.motion.tiltY, tiltY, 0.08);
    state.motion.smokeEnergy = lerp(
      state.motion.smokeEnergy,
      smokeEnergy,
      0.08,
    );
    state.motion.topGlow = lerp(state.motion.topGlow, topGlow, 0.08);
    state.motion.flowX = lerp(
      state.motion.flowX,
      state.motion.targetFlowX,
      0.08,
    );
    state.motion.flowY = lerp(
      state.motion.flowY,
      state.motion.targetFlowY,
      0.08,
    );

    updateInfluences(deltaSeconds);
    updateParticles(deltaSeconds);
  }

  function drawBackdrop() {
    const fill = ctx.createLinearGradient(0, 0, 0, state.height);
    fill.addColorStop(0, "#f7f1e8");
    fill.addColorStop(0.12, "#f5efe6");
    fill.addColorStop(0.26, "#f2eadf");
    fill.addColorStop(0.34, "#ebe0d4");
    fill.addColorStop(0.46, "#b58661");
    fill.addColorStop(0.62, "#3a1713");
    fill.addColorStop(0.82, "#100305");
    fill.addColorStop(1, "#040102");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const topGlow = ctx.createRadialGradient(
      state.width * (0.54 + state.motion.tiltX * 0.008),
      state.height * 0.08,
      0,
      state.width * (0.54 + state.motion.tiltX * 0.008),
      state.height * 0.08,
      Math.max(state.width, state.height) * 0.24,
    );
    topGlow.addColorStop(
      0,
      `rgba(255, 170, 52, ${0.05 + state.motion.topGlow * 0.016})`,
    );
    topGlow.addColorStop(0.4, "rgba(255, 150, 40, 0.016)");
    topGlow.addColorStop(1, "rgba(255, 150, 40, 0)");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, state.width, state.height * 0.4);

    const bottomRed = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 1.04,
      0,
      state.width * 0.5,
      state.height * 1.04,
      Math.max(state.width, state.height) * 0.34,
    );
    bottomRed.addColorStop(0, "rgba(214, 28, 46, 0.12)");
    bottomRed.addColorStop(0.22, "rgba(176, 18, 36, 0.04)");
    bottomRed.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bottomRed;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawSmokeBase() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const base = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.972,
      0,
      state.width * 0.5,
      state.height * 0.972,
      state.width * 0.18,
    );
    base.addColorStop(0, "rgba(255,248,240,0.08)");
    base.addColorStop(0.3, "rgba(255,248,240,0.03)");
    base.addColorStop(1, "rgba(255,248,240,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawSoftEllipseComposite(
    x,
    y,
    rx,
    ry,
    alpha,
    yRatio,
    rotation,
    composite,
    boost = 1,
  ) {
    ctx.save();
    ctx.globalCompositeOperation = composite;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(rx, ry);

    const core = smokeColorByY(yRatio);
    const hot =
      yRatio < 0.3
        ? mixColor(COLORS.orange, COLORS.vividOrange, 0.5)
        : yRatio > 0.68
          ? mixColor(COLORS.red, COLORS.warmWhite, 0.14)
          : mixColor(COLORS.warmWhite, COLORS.softOrange, 0.1);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, rgba(hot, alpha * 0.74 * boost));
    gradient.addColorStop(0.16, rgba(core, alpha * 0.64 * boost));
    gradient.addColorStop(0.42, rgba(core, alpha * 0.34 * boost));
    gradient.addColorStop(0.76, rgba(core, alpha * 0.1 * boost));
    gradient.addColorStop(1, rgba(core, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function drawUpperOrangeSmoke() {
    const specs = [
      {
        x: 0.34,
        y: 0.095,
        rx: 0.14,
        ry: 0.055,
        alpha: 0.09,
        rot: -0.18,
        boost: 1.34,
      },
      {
        x: 0.5,
        y: 0.105,
        rx: 0.17,
        ry: 0.065,
        alpha: 0.098,
        rot: 0.02,
        boost: 1.44,
      },
      {
        x: 0.66,
        y: 0.11,
        rx: 0.15,
        ry: 0.06,
        alpha: 0.09,
        rot: 0.16,
        boost: 1.34,
      },
      {
        x: 0.42,
        y: 0.17,
        rx: 0.17,
        ry: 0.07,
        alpha: 0.056,
        rot: -0.08,
        boost: 0.86,
      },
      {
        x: 0.58,
        y: 0.18,
        rx: 0.17,
        ry: 0.07,
        alpha: 0.056,
        rot: 0.1,
        boost: 0.86,
      },
      {
        x: 0.5,
        y: 0.245,
        rx: 0.19,
        ry: 0.082,
        alpha: 0.03,
        rot: 0.02,
        boost: 0.46,
      },
    ];

    for (const spec of specs) {
      const x =
        state.width *
        (spec.x + Math.sin(state.time * 0.22 + spec.x * 9) * 0.012);
      const y =
        state.height *
        (spec.y + Math.cos(state.time * 0.18 + spec.y * 11) * 0.008);
      const rx = state.width * spec.rx;
      const ry = state.height * spec.ry;
      const rotation =
        spec.rot + Math.sin(state.time * 0.16 + spec.x * 7) * 0.08;

      drawSoftEllipseComposite(
        x,
        y,
        rx,
        ry,
        spec.alpha,
        spec.y,
        rotation,
        "source-over",
        spec.boost,
      );
      drawSoftEllipseComposite(
        x,
        y,
        rx * 0.58,
        ry * 0.42,
        spec.alpha * 0.3,
        spec.y,
        rotation,
        "screen",
        spec.boost * 0.3,
      );
    }
  }

  function renderParticles() {
    for (let i = 0; i < state.particles.length; i += 1) {
      const particle = state.particles[i];
      const yRatio = clamp(particle.y, 0, 1);
      const progress = 1 - yRatio;
      const widen = Math.pow(progress, 1.55);
      const bandX = state.width * particle.band;

      const ambientX =
        Math.sin(
          state.time * 0.4 * particle.wobble + particle.phase + progress * 5.4,
        ) *
          state.width *
          particle.drift *
          (0.08 + widen * 0.34) +
        Math.cos(state.time * 0.22 + particle.phase * 1.2 + progress * 9.2) *
          state.width *
          particle.drift *
          0.1;

      const x = bandX + state.width * particle.xBias + ambientX + particle.vx;
      const y = state.height * particle.y + particle.vy;
      const width =
        state.width *
        lerp(particle.widthBase, particle.widthBase * 14.5, widen);
      const height = width * lerp(4.6, 2.0, progress);
      const alpha =
        particle.alpha + progress * 0.04 + state.motion.smokeEnergy * 0.006;
      const rotation =
        Math.sin(state.time * 0.18 + particle.phase) * 0.28 +
        particle.rotationBias +
        state.motion.tiltX * 0.036;

      const boost = yRatio < 0.34 ? 1.22 : 1;

      drawSoftEllipseComposite(
        x,
        y,
        width,
        height,
        alpha,
        yRatio,
        rotation,
        "source-over",
        boost,
      );
      drawSoftEllipseComposite(
        x - width * (0.22 + progress * 0.2),
        y + height * 0.05,
        width * 0.9,
        height * 0.94,
        alpha * 0.52,
        yRatio,
        rotation - 0.24,
        "source-over",
        boost,
      );
      drawSoftEllipseComposite(
        x + width * (0.22 + progress * 0.2),
        y - height * 0.03,
        width * 0.9,
        height * 0.94,
        alpha * 0.52,
        yRatio,
        rotation + 0.22,
        "source-over",
        boost,
      );

      if (progress > 0.14) {
        drawSoftEllipseComposite(
          x + Math.sin(state.time * 0.24 + particle.phase) * width * 0.16,
          y + Math.cos(state.time * 0.2 + particle.phase) * height * 0.07,
          width * (1.26 + progress * 0.34),
          height * (1.0 + progress * 0.22),
          alpha * 0.16,
          yRatio,
          rotation * 0.55,
          "source-over",
          boost * 0.8,
        );
      }

      if (progress > 0.28) {
        drawSoftEllipseComposite(
          x,
          y,
          width * 0.46,
          height * 0.28,
          alpha * 0.18,
          yRatio,
          rotation,
          "screen",
          yRatio < 0.34 ? 0.38 : 0.28,
        );
      }
    }
  }

  function drawAtmosphericHaze() {
    for (let i = 0; i < 8; i += 1) {
      const t = i / 7;
      const yRatio = 0.18 + t * 0.38;
      const y = state.height * yRatio;
      const x =
        state.width * (0.5 + Math.sin(state.time * 0.14 + i * 0.84) * 0.06);
      const rx = state.width * (0.24 + i * 0.04);
      const ry = state.height * (0.08 + i * 0.022);
      drawSoftEllipseComposite(
        x,
        y,
        rx,
        ry,
        0.006 + i * 0.0014,
        yRatio,
        0,
        "source-over",
        0.8,
      );
    }
  }

  function drawDisturbanceVeils() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (const influence of state.influences) {
      const veil = ctx.createRadialGradient(
        influence.x,
        influence.y,
        0,
        influence.x,
        influence.y,
        influence.radius * 0.9,
      );
      veil.addColorStop(0, "rgba(255,255,255,0.05)");
      veil.addColorStop(0.24, "rgba(255,255,255,0.024)");
      veil.addColorStop(0.6, "rgba(255,255,255,0.008)");
      veil.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = influence.life;
      ctx.fillStyle = veil;
      ctx.fillRect(
        influence.x - influence.radius,
        influence.y - influence.radius,
        influence.radius * 2,
        influence.radius * 2,
      );
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawFinalHaze() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const glaze = ctx.createLinearGradient(
      state.width * (0.18 + state.motion.tiltX * 0.01),
      0,
      state.width * (0.82 + state.motion.tiltX * 0.01),
      state.height,
    );
    glaze.addColorStop(0, "rgba(255,255,255,0)");
    glaze.addColorStop(0.16, "rgba(255,255,255,0.012)");
    glaze.addColorStop(0.32, "rgba(255,245,236,0.026)");
    glaze.addColorStop(0.52, "rgba(255,160,62,0.018)");
    glaze.addColorStop(0.78, "rgba(255,255,255,0.006)");
    glaze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glaze;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    drawSmokeBase();
    drawUpperOrangeSmoke();
    renderParticles();
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
  seedParticles();
  setupOrientation();
  requestAnimationFrame(frame);
})();
