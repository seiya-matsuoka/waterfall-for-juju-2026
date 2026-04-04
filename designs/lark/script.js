(() => {
  const canvas = document.getElementById("lark-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const motionButton = document.getElementById("motion-permission-button");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const mix = (a, b, t) => a + (b - a) * t;
  const decay = (base, seconds) => Math.pow(base, seconds * 60);

  const COLORS = {
    red: [194, 22, 40],
    deepRed: [126, 8, 24],
    white: [248, 242, 236],
    warmWhite: [255, 248, 240],
    orange: [255, 164, 64],
    hotOrange: [255, 194, 88],
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

  const plumeBands = [0.27, 0.35, 0.43, 0.5, 0.57, 0.65, 0.73];
  const PARTICLE_COUNT = 230;

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
    if (y > 0.68) {
      const t = (y - 0.68) / 0.32;
      return mixColor(COLORS.red, COLORS.deepRed, clamp(t, 0, 1));
    }

    if (y > 0.36) {
      const t = (0.68 - y) / 0.32;
      return mixColor(COLORS.deepRed, COLORS.white, clamp(t, 0, 1));
    }

    const t = (0.36 - y) / 0.36;
    return mixColor(COLORS.warmWhite, COLORS.orange, clamp(t, 0, 1));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createParticle(initial = false) {
    const band = plumeBands[Math.floor(Math.random() * plumeBands.length)];
    const y = initial ? Math.random() * 1.18 : randomBetween(1.02, 1.2);

    return {
      band,
      y,
      xBias: randomBetween(-0.05, 0.05),
      widthBase: randomBetween(0.014, 0.034),
      heightBase: randomBetween(0.06, 0.14),
      rise: randomBetween(0.08, 0.17),
      drift: randomBetween(0.14, 0.34),
      phase: randomBetween(0, Math.PI * 2),
      wobble: randomBetween(0.7, 1.55),
      alpha: randomBetween(0.06, 0.15),
      rotationBias: randomBetween(-0.5, 0.5),
      vx: 0,
      vy: 0,
    };
  }

  function seedParticles() {
    state.particles = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticle(true),
    );
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
        lerp(0.14, 0.34, Math.min(power, 1.6) / 1.6),
    });

    if (state.influences.length > 18) {
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

    addInfluence(point.x, point.y, 0, -0.5, 0.55);

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
    const speed = Math.min(2, Math.hypot(dx, dy) / 24);

    state.motion.targetTiltX = clamp(
      state.motion.targetTiltX + dxNorm * 2.2,
      -1.5,
      1.5,
    );
    state.motion.targetTiltY = clamp(
      state.motion.targetTiltY - dyNorm * 1.7,
      -1.2,
      1.2,
    );
    state.motion.targetSmokeEnergy = clamp(
      state.motion.targetSmokeEnergy + speed * 0.46 + Math.abs(dyNorm) * 0.54,
      0,
      3.4,
    );
    state.motion.targetTopGlow = clamp(
      state.motion.targetTopGlow + speed * 0.22 + Math.abs(dyNorm) * 0.2,
      0,
      2.2,
    );
    state.motion.targetFlowX = clamp(
      state.motion.targetFlowX + dxNorm * 1.5,
      -2,
      2,
    );
    state.motion.targetFlowY = clamp(
      state.motion.targetFlowY + dyNorm * 1.1,
      -1.6,
      1.6,
    );

    addInfluence(point.x, point.y, dx * 0.26, dy * 0.26 - 0.8, speed);
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
      influence.vx *= decay(0.96, deltaSeconds);
      influence.vy *= decay(0.95, deltaSeconds);
      influence.vy -= 0.014;
      influence.life *= decay(0.968, deltaSeconds);
      influence.power *= decay(0.972, deltaSeconds);
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

      fx += (influence.vx * 0.09 + dx * 0.0011) * impact * influence.power;
      fy += (influence.vy * 0.08 + dy * 0.0006) * impact * influence.power;
    }

    return { fx, fy };
  }

  function updateParticles(deltaSeconds) {
    const dt60 = deltaSeconds * 60;

    for (let i = 0; i < state.particles.length; i += 1) {
      const particle = state.particles[i];

      const progress = 1 - clamp(particle.y, 0, 1);
      const widen = Math.pow(progress, 1.7);

      const ambientX =
        Math.sin(
          state.time * 0.42 * particle.wobble + particle.phase + progress * 5.2,
        ) *
          state.width *
          particle.drift *
          (0.05 + widen * 0.22) +
        Math.cos(state.time * 0.22 + particle.phase * 1.2 + progress * 8.4) *
          state.width *
          particle.drift *
          0.06;

      const bandX = state.width * particle.band;
      const px = bandX + state.width * particle.xBias + ambientX + particle.vx;
      const py = state.height * particle.y + particle.vy;

      const influence = applyInfluences(px, py);
      particle.vx += influence.fx;
      particle.vy += influence.fy;

      particle.vx *= decay(0.966, deltaSeconds);
      particle.vy *= decay(0.968, deltaSeconds);

      const rise =
        (particle.rise + progress * 0.024 + state.motion.smokeEnergy * 0.006) *
        dt60;
      particle.y -= rise / 100;

      particle.vx +=
        (state.motion.tiltX +
          state.motion.sensorX * 0.44 +
          state.motion.flowX * 0.5) *
        0.18 *
        dt60 *
        0.01;
      particle.vy +=
        (-0.22 +
          state.motion.tiltY * 0.05 +
          state.motion.sensorY * 0.04 +
          state.motion.flowY * 0.18) *
        dt60 *
        0.01;

      if (particle.y < -0.14) {
        state.particles[i] = createParticle(false);
      }
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.vx *= decay(0.9, deltaSeconds);
      state.pointer.vy *= decay(0.9, deltaSeconds);
      state.motion.targetSmokeEnergy *= decay(0.962, deltaSeconds);
      state.motion.targetTopGlow *= decay(0.958, deltaSeconds);
      state.motion.targetFlowX *= decay(0.972, deltaSeconds);
      state.motion.targetFlowY *= decay(0.972, deltaSeconds);
    }

    state.motion.targetTiltX *= decay(0.988, deltaSeconds);
    state.motion.targetTiltY *= decay(0.988, deltaSeconds);

    const idleX =
      Math.sin(state.time * 0.34) * 0.26 + Math.cos(state.time * 0.12) * 0.1;
    const idleY =
      Math.cos(state.time * 0.28) * 0.16 + Math.sin(state.time * 0.16) * 0.06;

    const tiltX = clamp(
      state.motion.targetTiltX + state.motion.sensorX * 0.68 + idleX,
      -1.7,
      1.7,
    );
    const tiltY = clamp(
      state.motion.targetTiltY + state.motion.sensorY * 0.46 + idleY,
      -1.3,
      1.3,
    );

    const smokeEnergy =
      0.32 +
      state.motion.targetSmokeEnergy +
      Math.abs(state.motion.sensorY) * 0.16 +
      Math.abs(tiltY) * 0.05;

    const topGlow =
      0.32 +
      state.motion.targetTopGlow +
      Math.abs(state.motion.sensorX) * 0.14 +
      Math.abs(state.motion.sensorY) * 0.1;

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
    fill.addColorStop(0, "#090203");
    fill.addColorStop(0.28, "#0c0204");
    fill.addColorStop(0.6, "#080203");
    fill.addColorStop(1, "#040102");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const bottomRed = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 1.04,
      0,
      state.width * 0.5,
      state.height * 1.04,
      Math.max(state.width, state.height) * 0.48,
    );
    bottomRed.addColorStop(0, "rgba(204, 24, 42, 0.34)");
    bottomRed.addColorStop(0.18, "rgba(172, 18, 36, 0.22)");
    bottomRed.addColorStop(0.4, "rgba(126, 12, 26, 0.1)");
    bottomRed.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bottomRed;
    ctx.fillRect(0, 0, state.width, state.height);

    const topOrange = ctx.createRadialGradient(
      state.width * (0.52 + state.motion.tiltX * 0.012),
      -state.height * 0.14,
      0,
      state.width * (0.52 + state.motion.tiltX * 0.012),
      -state.height * 0.14,
      Math.max(state.width, state.height) * 0.86,
    );
    topOrange.addColorStop(
      0,
      `rgba(255, 198, 96, ${0.5 + state.motion.topGlow * 0.1})`,
    );
    topOrange.addColorStop(
      0.16,
      `rgba(255, 178, 78, ${0.28 + state.motion.topGlow * 0.08})`,
    );
    topOrange.addColorStop(0.36, "rgba(255, 160, 70, 0.12)");
    topOrange.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topOrange;
    ctx.fillRect(0, 0, state.width, state.height * 0.9);

    const beamA = ctx.createLinearGradient(
      state.width * 0.28,
      -state.height * 0.04,
      state.width * 0.46,
      state.height * 0.72,
    );
    beamA.addColorStop(0, "rgba(255, 190, 90, 0.14)");
    beamA.addColorStop(0.22, "rgba(255, 178, 80, 0.1)");
    beamA.addColorStop(0.46, "rgba(255, 166, 72, 0.04)");
    beamA.addColorStop(1, "rgba(255, 166, 72, 0)");
    ctx.fillStyle = beamA;
    ctx.fillRect(0, 0, state.width, state.height);

    const beamB = ctx.createLinearGradient(
      state.width * 0.72,
      -state.height * 0.04,
      state.width * 0.54,
      state.height * 0.72,
    );
    beamB.addColorStop(0, "rgba(255, 190, 90, 0.14)");
    beamB.addColorStop(0.22, "rgba(255, 178, 80, 0.1)");
    beamB.addColorStop(0.46, "rgba(255, 166, 72, 0.04)");
    beamB.addColorStop(1, "rgba(255, 166, 72, 0)");
    ctx.fillStyle = beamB;
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
    base.addColorStop(0, "rgba(255,248,240,0.12)");
    base.addColorStop(0.3, "rgba(255,248,240,0.05)");
    base.addColorStop(1, "rgba(255,248,240,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawSoftEllipse(x, y, rx, ry, alpha, yRatio, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(rx, ry);

    const core = smokeColorByY(yRatio);
    const hot =
      yRatio < 0.34
        ? mixColor(COLORS.white, COLORS.orange, 0.55)
        : yRatio > 0.68
          ? mixColor(COLORS.red, COLORS.white, 0.25)
          : mixColor(COLORS.white, COLORS.warmWhite, 0.5);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, rgba(hot, alpha * 1.08));
    gradient.addColorStop(0.18, rgba(core, alpha * 0.92));
    gradient.addColorStop(0.44, rgba(core, alpha * 0.48));
    gradient.addColorStop(0.74, rgba(core, alpha * 0.14));
    gradient.addColorStop(1, rgba(core, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function renderParticles() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < state.particles.length; i += 1) {
      const particle = state.particles[i];
      const yRatio = clamp(particle.y, 0, 1);
      const progress = 1 - yRatio;
      const widen = Math.pow(progress, 1.6);
      const bandX = state.width * particle.band;

      const ambientX =
        Math.sin(
          state.time * 0.42 * particle.wobble + particle.phase + progress * 5.4,
        ) *
          state.width *
          particle.drift *
          (0.07 + widen * 0.28) +
        Math.cos(state.time * 0.22 + particle.phase * 1.2 + progress * 8.8) *
          state.width *
          particle.drift *
          0.08;

      const x = bandX + state.width * particle.xBias + ambientX + particle.vx;
      const y = state.height * particle.y + particle.vy;
      const width =
        state.width *
        lerp(particle.widthBase, particle.widthBase * 15.5, widen);
      const height = width * lerp(4.8, 2.0, progress);
      const alpha =
        particle.alpha + progress * 0.06 + state.motion.smokeEnergy * 0.012;
      const rotation =
        Math.sin(state.time * 0.18 + particle.phase) * 0.24 +
        particle.rotationBias +
        state.motion.tiltX * 0.03;

      drawSoftEllipse(x, y, width, height, alpha, yRatio, rotation);
      drawSoftEllipse(
        x - width * (0.22 + progress * 0.2),
        y + height * 0.05,
        width * 0.9,
        height * 0.94,
        alpha * 0.62,
        yRatio,
        rotation - 0.22,
      );
      drawSoftEllipse(
        x + width * (0.22 + progress * 0.2),
        y - height * 0.03,
        width * 0.9,
        height * 0.94,
        alpha * 0.62,
        yRatio,
        rotation + 0.2,
      );

      if (progress > 0.18) {
        drawSoftEllipse(
          x + Math.sin(state.time * 0.24 + particle.phase) * width * 0.14,
          y + Math.cos(state.time * 0.2 + particle.phase) * height * 0.07,
          width * (1.32 + progress * 0.34),
          height * (1.02 + progress * 0.24),
          alpha * 0.22,
          yRatio,
          rotation * 0.55,
        );
      }

      if (progress > 0.34) {
        drawSoftEllipse(
          x,
          y,
          width * 0.48,
          height * 0.34,
          alpha * 0.34,
          yRatio,
          rotation,
        );
      }
    }

    ctx.restore();
  }

  function drawAtmosphericHaze() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const y = state.height * (0.12 + i * 0.095);
      const x =
        state.width * (0.5 + Math.sin(state.time * 0.14 + i * 0.84) * 0.06);
      const rx = state.width * (0.28 + i * 0.05);
      const ry = state.height * (0.1 + i * 0.024);
      drawSoftEllipse(x, y, rx, ry, 0.016 + i * 0.004, 0.42 + t * 0.38, 0);
    }

    ctx.restore();
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
      veil.addColorStop(0, "rgba(255,255,255,0.08)");
      veil.addColorStop(0.24, "rgba(255,255,255,0.04)");
      veil.addColorStop(0.6, "rgba(255,255,255,0.014)");
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
    glaze.addColorStop(0.12, "rgba(255,255,255,0.05)");
    glaze.addColorStop(0.28, "rgba(255,255,255,0.14)");
    glaze.addColorStop(0.52, "rgba(255,170,92,0.12)");
    glaze.addColorStop(0.76, "rgba(255,255,255,0.04)");
    glaze.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glaze;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    drawSmokeBase();
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
