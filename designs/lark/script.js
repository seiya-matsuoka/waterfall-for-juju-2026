(() => {
  const canvas = document.getElementById("lark-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const motionButton = document.getElementById("motion-permission-button");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const mix = (a, b, t) => a + (b - a) * t;
  const decay = (base, seconds) => Math.pow(base, seconds * 60);

  const COLORS = {
    red: [162, 22, 40],
    deepRed: [108, 10, 24],
    white: [244, 239, 233],
    warmWhite: [255, 246, 238],
    orange: [255, 170, 82],
    hotOrange: [255, 194, 96],
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
    },
    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

  const plumeBands = [0.34, 0.43, 0.5, 0.57, 0.66];
  const PARTICLE_COUNT = 150;

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function mixColor(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t)),
    ];
  }

  function smokeColorByY(y) {
    if (y > 0.7) {
      const t = (y - 0.7) / 0.3;
      return mixColor(COLORS.red, COLORS.deepRed, clamp(t, 0, 1));
    }

    if (y > 0.4) {
      const t = (0.7 - y) / 0.3;
      return mixColor(COLORS.deepRed, COLORS.white, clamp(t, 0, 1));
    }

    const t = (0.4 - y) / 0.4;
    return mixColor(COLORS.warmWhite, COLORS.orange, clamp(t, 0, 1));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function createParticle(initial = false) {
    const band = plumeBands[Math.floor(Math.random() * plumeBands.length)];
    const y = initial ? Math.random() * 1.15 : randomBetween(1.02, 1.2);

    return {
      band,
      y,
      xBias: randomBetween(-0.03, 0.03),
      widthBase: randomBetween(0.014, 0.03),
      heightBase: randomBetween(0.05, 0.12),
      rise: randomBetween(0.08, 0.16),
      drift: randomBetween(0.1, 0.28),
      phase: randomBetween(0, Math.PI * 2),
      wobble: randomBetween(0.6, 1.4),
      alpha: randomBetween(0.04, 0.12),
      rotationBias: randomBetween(-0.4, 0.4),
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
        lerp(0.08, 0.18, Math.min(power, 1.4) / 1.4),
    });

    if (state.influences.length > 16) {
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

    addInfluence(point.x, point.y, 0, -0.4, 0.45);

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
    const speed = Math.min(1.8, Math.hypot(dx, dy) / 26);

    state.motion.targetTiltX = clamp(
      state.motion.targetTiltX + dxNorm * 1.8,
      -1.2,
      1.2,
    );
    state.motion.targetTiltY = clamp(
      state.motion.targetTiltY - dyNorm * 1.4,
      -1,
      1,
    );
    state.motion.targetSmokeEnergy = clamp(
      state.motion.targetSmokeEnergy + speed * 0.34 + Math.abs(dyNorm) * 0.42,
      0,
      2.8,
    );
    state.motion.targetTopGlow = clamp(
      state.motion.targetTopGlow + speed * 0.18 + Math.abs(dyNorm) * 0.18,
      0,
      1.8,
    );

    addInfluence(point.x, point.y, dx * 0.18, dy * 0.18 - 0.6, speed);
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
      influence.vx *= decay(0.95, deltaSeconds);
      influence.vy *= decay(0.94, deltaSeconds);
      influence.vy -= 0.01;
      influence.life *= decay(0.95, deltaSeconds);
      influence.power *= decay(0.96, deltaSeconds);
      influence.radius += 18 * deltaSeconds * 60;

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

      fx += (influence.vx * 0.06 + dx * 0.0006) * impact * influence.power;
      fy += (influence.vy * 0.06 + dy * 0.0003) * impact * influence.power;
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
          (0.03 + widen * 0.17) +
        Math.cos(state.time * 0.22 + particle.phase * 1.2 + progress * 8.4) *
          state.width *
          particle.drift *
          0.04;

      const bandX = state.width * particle.band;
      const px = bandX + state.width * particle.xBias + ambientX + particle.vx;
      const py = state.height * particle.y + particle.vy;

      const influence = applyInfluences(px, py);
      particle.vx += influence.fx;
      particle.vy += influence.fy;

      particle.vx *= decay(0.95, deltaSeconds);
      particle.vy *= decay(0.95, deltaSeconds);

      const rise =
        (particle.rise + progress * 0.018 + state.motion.smokeEnergy * 0.004) *
        dt60;
      particle.y -= rise / 100;

      particle.vx +=
        (state.motion.tiltX + state.motion.sensorX * 0.4) * 0.12 * dt60 * 0.01;
      particle.vy +=
        (-0.18 + state.motion.tiltY * 0.04 + state.motion.sensorY * 0.03) *
        dt60 *
        0.01;

      if (particle.y < -0.12) {
        state.particles[i] = createParticle(false);
      }
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.vx *= decay(0.9, deltaSeconds);
      state.pointer.vy *= decay(0.9, deltaSeconds);
      state.motion.targetSmokeEnergy *= decay(0.956, deltaSeconds);
      state.motion.targetTopGlow *= decay(0.954, deltaSeconds);
    }

    state.motion.targetTiltX *= decay(0.986, deltaSeconds);
    state.motion.targetTiltY *= decay(0.986, deltaSeconds);

    const idleX =
      Math.sin(state.time * 0.34) * 0.22 + Math.cos(state.time * 0.12) * 0.08;
    const idleY =
      Math.cos(state.time * 0.28) * 0.14 + Math.sin(state.time * 0.16) * 0.06;

    const tiltX = clamp(
      state.motion.targetTiltX + state.motion.sensorX * 0.6 + idleX,
      -1.4,
      1.4,
    );
    const tiltY = clamp(
      state.motion.targetTiltY + state.motion.sensorY * 0.4 + idleY,
      -1.2,
      1.2,
    );

    const smokeEnergy =
      0.24 +
      state.motion.targetSmokeEnergy +
      Math.abs(state.motion.sensorY) * 0.14 +
      Math.abs(tiltY) * 0.04;

    const topGlow =
      0.24 +
      state.motion.targetTopGlow +
      Math.abs(state.motion.sensorX) * 0.12 +
      Math.abs(state.motion.sensorY) * 0.08;

    state.motion.tiltX = lerp(state.motion.tiltX, tiltX, 0.07);
    state.motion.tiltY = lerp(state.motion.tiltY, tiltY, 0.07);
    state.motion.smokeEnergy = lerp(
      state.motion.smokeEnergy,
      smokeEnergy,
      0.07,
    );
    state.motion.topGlow = lerp(state.motion.topGlow, topGlow, 0.07);

    updateInfluences(deltaSeconds);
    updateParticles(deltaSeconds);
  }

  function drawBackdrop() {
    const fill = ctx.createLinearGradient(0, 0, 0, state.height);
    fill.addColorStop(0, "#090203");
    fill.addColorStop(0.28, "#0b0204");
    fill.addColorStop(0.6, "#080203");
    fill.addColorStop(1, "#040102");
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const bottomRed = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 1.02,
      0,
      state.width * 0.5,
      state.height * 1.02,
      Math.max(state.width, state.height) * 0.36,
    );
    bottomRed.addColorStop(0, "rgba(170, 20, 36, 0.22)");
    bottomRed.addColorStop(0.28, "rgba(128, 14, 28, 0.12)");
    bottomRed.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bottomRed;
    ctx.fillRect(0, 0, state.width, state.height);

    const topOrange = ctx.createRadialGradient(
      state.width * (0.52 + state.motion.tiltX * 0.01),
      -state.height * 0.16,
      0,
      state.width * (0.52 + state.motion.tiltX * 0.01),
      -state.height * 0.16,
      Math.max(state.width, state.height) * 0.72,
    );
    topOrange.addColorStop(
      0,
      `rgba(255, 190, 98, ${0.34 + state.motion.topGlow * 0.08})`,
    );
    topOrange.addColorStop(
      0.18,
      `rgba(255, 176, 88, ${0.2 + state.motion.topGlow * 0.06})`,
    );
    topOrange.addColorStop(0.44, "rgba(255, 160, 76, 0.07)");
    topOrange.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topOrange;
    ctx.fillRect(0, 0, state.width, state.height * 0.82);

    ctx.restore();
  }

  function drawSmokeBase() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const base = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.968,
      0,
      state.width * 0.5,
      state.height * 0.968,
      state.width * 0.16,
    );
    base.addColorStop(0, "rgba(255,246,236,0.08)");
    base.addColorStop(0.28, "rgba(255,246,236,0.03)");
    base.addColorStop(1, "rgba(255,246,236,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawSoftEllipse(x, y, rx, ry, alpha, yRatio, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(rx, ry);

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, rgba(smokeColorByY(yRatio), alpha));
    gradient.addColorStop(0.24, rgba(smokeColorByY(yRatio), alpha * 0.52));
    gradient.addColorStop(0.62, rgba(smokeColorByY(yRatio), alpha * 0.14));
    gradient.addColorStop(1, rgba(smokeColorByY(yRatio), 0));
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
      const widen = Math.pow(progress, 1.7);
      const bandX = state.width * particle.band;

      const ambientX =
        Math.sin(
          state.time * 0.42 * particle.wobble + particle.phase + progress * 5.2,
        ) *
          state.width *
          particle.drift *
          (0.03 + widen * 0.17) +
        Math.cos(state.time * 0.22 + particle.phase * 1.2 + progress * 8.4) *
          state.width *
          particle.drift *
          0.04;

      const x = bandX + state.width * particle.xBias + ambientX + particle.vx;
      const y = state.height * particle.y + particle.vy;
      const width =
        state.width *
        lerp(particle.widthBase, particle.widthBase * 10.5, widen);
      const height = width * lerp(4.2, 1.9, progress);
      const alpha =
        particle.alpha + progress * 0.035 + state.motion.smokeEnergy * 0.004;
      const rotation =
        Math.sin(state.time * 0.18 + particle.phase) * 0.18 +
        particle.rotationBias +
        state.motion.tiltX * 0.02;

      drawSoftEllipse(x, y, width, height, alpha, yRatio, rotation);
      drawSoftEllipse(
        x - width * (0.18 + progress * 0.16),
        y + height * 0.04,
        width * 0.82,
        height * 0.9,
        alpha * 0.56,
        yRatio,
        rotation - 0.18,
      );
      drawSoftEllipse(
        x + width * (0.18 + progress * 0.16),
        y - height * 0.02,
        width * 0.82,
        height * 0.9,
        alpha * 0.56,
        yRatio,
        rotation + 0.16,
      );

      if (progress > 0.22) {
        drawSoftEllipse(
          x + Math.sin(state.time * 0.22 + particle.phase) * width * 0.12,
          y + Math.cos(state.time * 0.18 + particle.phase) * height * 0.06,
          width * (1.22 + progress * 0.24),
          height * (0.94 + progress * 0.18),
          alpha * 0.18,
          yRatio,
          rotation * 0.6,
        );
      }
    }

    ctx.restore();
  }

  function drawAtmosphericHaze() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 8; i += 1) {
      const t = i / 7;
      const y = state.height * (0.16 + i * 0.092);
      const x =
        state.width * (0.5 + Math.sin(state.time * 0.14 + i * 0.8) * 0.04);
      const rx = state.width * (0.24 + i * 0.04);
      const ry = state.height * (0.08 + i * 0.024);
      drawSoftEllipse(x, y, rx, ry, 0.012 + i * 0.003, 0.46 + t * 0.34, 0);
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
      veil.addColorStop(0, "rgba(255,255,255,0.06)");
      veil.addColorStop(0.22, "rgba(255,255,255,0.03)");
      veil.addColorStop(0.55, "rgba(255,255,255,0.012)");
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
      state.width * (0.22 + state.motion.tiltX * 0.01),
      0,
      state.width * (0.78 + state.motion.tiltX * 0.01),
      state.height,
    );
    glaze.addColorStop(0, "rgba(255,255,255,0)");
    glaze.addColorStop(0.12, "rgba(255,255,255,0.04)");
    glaze.addColorStop(0.3, "rgba(255,255,255,0.1)");
    glaze.addColorStop(0.54, "rgba(255,170,92,0.08)");
    glaze.addColorStop(0.74, "rgba(255,255,255,0.03)");
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
