(() => {
  const canvas = document.getElementById("impreza-canvas");
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
      surfaceTiltX: 0,
      surfaceTiltY: 0,
      targetSurfaceTiltX: 0,
      targetSurfaceTiltY: 0,

      shiftX: 0,
      shiftY: 0,
      targetShiftX: 0,
      targetShiftY: 0,

      sensorX: 0,
      sensorY: 0,

      reflectionFlow: 0,
      targetReflectionFlow: 0,

      reflectionGlow: 0,
      targetReflectionGlow: 0,
    },

    flares: [],

    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

  const bodyBands = [
    {
      y: 0.18,
      thickness: 0.34,
      wave: 0.05,
      freq: 1.1,
      speed: 0.46,
      phase: 0.2,
      slope: -0.08,
      depth: 0.16,
      colors: ["#031224", "#0c4da0", "#7bc2ff", "#0e5dbf", "#04192d"],
    },
    {
      y: 0.36,
      thickness: 0.28,
      wave: 0.042,
      freq: 1.5,
      speed: 0.56,
      phase: 1.2,
      slope: -0.03,
      depth: 0.34,
      colors: ["#041426", "#0a3c82", "#4ca8ff", "#0c56b4", "#05172b"],
    },
    {
      y: 0.54,
      thickness: 0.36,
      wave: 0.052,
      freq: 1.22,
      speed: 0.42,
      phase: 2.2,
      slope: 0.028,
      depth: 0.56,
      colors: ["#04162a", "#0a4b9f", "#9ad7ff", "#0a62cc", "#061a31"],
    },
    {
      y: 0.74,
      thickness: 0.24,
      wave: 0.04,
      freq: 1.64,
      speed: 0.58,
      phase: 3.4,
      slope: 0.072,
      depth: 0.78,
      colors: ["#031324", "#08376e", "#54a8ff", "#0c50a6", "#041528"],
    },
  ];

  const creaseSpecs = [
    {
      y: 0.22,
      amp: 0.09,
      freq: 1.08,
      speed: 0.92,
      phase: 0.3,
      width: 20,
      alpha: 0.92,
      warm: false,
    },
    {
      y: 0.44,
      amp: 0.11,
      freq: 1.24,
      speed: 0.76,
      phase: 1.6,
      width: 34,
      alpha: 0.82,
      warm: false,
    },
    {
      y: 0.62,
      amp: 0.08,
      freq: 1.44,
      speed: 0.84,
      phase: 2.8,
      width: 18,
      alpha: 0.66,
      warm: true,
    },
  ];

  const washSpecs = [
    { y: 0.16, alpha: 0.13, width: 80, speed: 0.28, phase: 0.4 },
    { y: 0.48, alpha: 0.18, width: 120, speed: 0.22, phase: 1.8 },
    { y: 0.82, alpha: 0.12, width: 90, speed: 0.32, phase: 3.2 },
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

  function addFlare(x, y, strength = 1) {
    state.flares.push({
      x,
      y,
      radius: lerp(56, 132, Math.min(1, strength)),
      alpha: lerp(0.16, 0.32, Math.min(1, strength)),
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 0.7,
      life: 1,
      warm: Math.random() < 0.14,
    });

    if (state.flares.length > 12) {
      state.flares.shift();
    }
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
    const speed = Math.min(1.5, Math.hypot(dx, dy) / 28);

    state.motion.targetSurfaceTiltY = clamp(
      state.motion.targetSurfaceTiltY + dxNorm * 9.6,
      -1.25,
      1.25,
    );
    state.motion.targetSurfaceTiltX = clamp(
      state.motion.targetSurfaceTiltX - dyNorm * 7.6,
      -1.05,
      1.05,
    );

    state.motion.targetShiftX = clamp(
      state.motion.targetShiftX + dxNorm * 180,
      -180,
      180,
    );
    state.motion.targetShiftY = clamp(
      state.motion.targetShiftY + dyNorm * 86,
      -92,
      92,
    );

    state.motion.targetReflectionFlow = clamp(
      state.motion.targetReflectionFlow +
        Math.abs(dxNorm) * 4.6 +
        Math.abs(dyNorm) * 1.8,
      0,
      2.8,
    );

    state.motion.targetReflectionGlow = clamp(
      state.motion.targetReflectionGlow + speed * 0.24,
      0,
      1.9,
    );

    if (speed > 0.24) {
      addFlare(point.x, point.y, speed);
    }
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
    const gamma = clamp((event.gamma ?? 0) / 34, -1.15, 1.15);
    const beta = clamp((event.beta ?? 0) / 48, -1, 1);

    state.motion.sensorY = gamma;
    state.motion.sensorX = clamp(beta * 0.72, -0.82, 0.82);
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

  function updateFlares(deltaSeconds) {
    for (let i = state.flares.length - 1; i >= 0; i -= 1) {
      const flare = state.flares[i];
      flare.x += flare.vx;
      flare.y += flare.vy;
      flare.life *= decay(0.958, deltaSeconds);
      flare.alpha *= decay(0.952, deltaSeconds);
      flare.radius += 18 * deltaSeconds * 60;

      if (flare.life < 0.08 || flare.alpha < 0.01) {
        state.flares.splice(i, 1);
      }
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.velocityX *= decay(0.9, deltaSeconds);
      state.pointer.velocityY *= decay(0.9, deltaSeconds);

      state.motion.targetSurfaceTiltY = clamp(
        state.motion.targetSurfaceTiltY + state.pointer.velocityX * 0.0003,
        -1.25,
        1.25,
      );
      state.motion.targetSurfaceTiltX = clamp(
        state.motion.targetSurfaceTiltX - state.pointer.velocityY * 0.00024,
        -1.05,
        1.05,
      );
    }

    state.motion.targetSurfaceTiltX *= decay(0.972, deltaSeconds);
    state.motion.targetSurfaceTiltY *= decay(0.972, deltaSeconds);
    state.motion.targetShiftX *= decay(0.956, deltaSeconds);
    state.motion.targetShiftY *= decay(0.956, deltaSeconds);
    state.motion.targetReflectionFlow *= decay(0.934, deltaSeconds);
    state.motion.targetReflectionGlow *= decay(0.936, deltaSeconds);

    const ambientX =
      Math.sin(state.time * 0.54) * 0.05 + Math.cos(state.time * 0.16) * 0.024;
    const ambientY =
      Math.cos(state.time * 0.41) * 0.07 + Math.sin(state.time * 0.22) * 0.03;

    const tiltX = clamp(
      state.motion.targetSurfaceTiltX + state.motion.sensorX * 0.6 + ambientX,
      -1.12,
      1.12,
    );

    const tiltY = clamp(
      state.motion.targetSurfaceTiltY + state.motion.sensorY * 0.78 + ambientY,
      -1.3,
      1.3,
    );

    const shiftX = state.motion.targetShiftX + state.motion.sensorY * 36;
    const shiftY = state.motion.targetShiftY + state.motion.sensorX * 24;

    const flow =
      0.3 +
      state.motion.targetReflectionFlow +
      Math.abs(state.motion.sensorY) * 0.42 +
      Math.abs(tiltY) * 0.16;

    const glow =
      0.18 +
      state.motion.targetReflectionGlow +
      Math.abs(state.motion.sensorX) * 0.12 +
      Math.abs(tiltX) * 0.08;

    state.motion.surfaceTiltX = lerp(state.motion.surfaceTiltX, tiltX, 0.08);
    state.motion.surfaceTiltY = lerp(state.motion.surfaceTiltY, tiltY, 0.08);
    state.motion.shiftX = lerp(state.motion.shiftX, shiftX, 0.08);
    state.motion.shiftY = lerp(state.motion.shiftY, shiftY, 0.08);
    state.motion.reflectionFlow = lerp(state.motion.reflectionFlow, flow, 0.08);
    state.motion.reflectionGlow = lerp(state.motion.reflectionGlow, glow, 0.08);

    updateFlares(deltaSeconds);
  }

  function createBodyBandPath(spec) {
    const topPoints = [];
    const bottomPoints = [];
    const steps = 52;

    for (let i = 0; i <= steps; i += 1) {
      const p = i / steps;
      const x = -state.width * 0.16 + p * state.width * 1.32;
      const yOffset =
        Math.sin(
          p * Math.PI * spec.freq + state.time * spec.speed + spec.phase,
        ) *
          state.height *
          spec.wave +
        Math.cos(
          p * Math.PI * (spec.freq * 2.1) -
            state.time * spec.speed * 0.4 +
            spec.phase,
        ) *
          state.height *
          spec.wave *
          0.34;

      const bodySlope = (x - state.width * 0.5) * spec.slope;
      const creaseInfluence =
        state.motion.surfaceTiltY * (x - state.width * 0.5) * 0.034;

      const centerY =
        state.height * spec.y +
        yOffset +
        state.motion.shiftY * (0.08 + spec.depth * 0.08) +
        bodySlope +
        state.motion.surfaceTiltX * state.height * (0.08 + spec.depth * 0.06) +
        creaseInfluence;

      const thickness =
        state.height *
        spec.thickness *
        (1 + Math.abs(state.motion.surfaceTiltY) * 0.12);

      const xShift = state.motion.shiftX * (0.16 + spec.depth * 0.52);

      topPoints.push({
        x: x + xShift,
        y: centerY - thickness * 0.52,
      });

      bottomPoints.push({
        x: x + xShift + 18 + state.motion.surfaceTiltY * 10,
        y: centerY + thickness * 0.48,
      });
    }

    return { topPoints, bottomPoints };
  }

  function fillPathFromPoints(topPoints, bottomPoints) {
    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);

    for (let i = 1; i < topPoints.length; i += 1) {
      const prev = topPoints[i - 1];
      const curr = topPoints[i];
      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        (prev.x + curr.x) * 0.5,
        (prev.y + curr.y) * 0.5,
      );
    }

    const lastTop = topPoints[topPoints.length - 1];
    ctx.lineTo(lastTop.x, lastTop.y);

    for (let i = bottomPoints.length - 1; i > 0; i -= 1) {
      const prev = bottomPoints[i];
      const curr = bottomPoints[i - 1];
      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        (prev.x + curr.x) * 0.5,
        (prev.y + curr.y) * 0.5,
      );
    }

    ctx.lineTo(bottomPoints[0].x, bottomPoints[0].y);
    ctx.closePath();
  }

  function drawBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, state.width, state.height);
    gradient.addColorStop(0, "#041225");
    gradient.addColorStop(0.28, "#0a3774");
    gradient.addColorStop(0.52, "#0d57b2");
    gradient.addColorStop(0.76, "#0a4388");
    gradient.addColorStop(1, "#05192f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const crownGlow = ctx.createRadialGradient(
      state.width * (0.5 + state.motion.surfaceTiltY * 0.045),
      state.height * (0.3 + state.motion.surfaceTiltX * 0.055),
      0,
      state.width * 0.5,
      state.height * 0.32,
      Math.max(state.width, state.height) * 0.92,
    );
    crownGlow.addColorStop(0, "rgba(187, 233, 255, 0.16)");
    crownGlow.addColorStop(0.18, "rgba(112, 192, 255, 0.15)");
    crownGlow.addColorStop(0.42, "rgba(20, 113, 212, 0.12)");
    crownGlow.addColorStop(0.76, "rgba(15, 62, 124, 0.08)");
    crownGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = crownGlow;
    ctx.fillRect(0, 0, state.width, state.height);

    const sideFalloff = ctx.createLinearGradient(0, 0, state.width, 0);
    sideFalloff.addColorStop(0, "rgba(0, 0, 0, 0.14)");
    sideFalloff.addColorStop(0.16, "rgba(0,0,0,0)");
    sideFalloff.addColorStop(0.82, "rgba(0,0,0,0)");
    sideFalloff.addColorStop(1, "rgba(0, 0, 0, 0.14)");
    ctx.fillStyle = sideFalloff;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawBodyBand(spec, index) {
    const { topPoints, bottomPoints } = createBodyBandPath(spec);

    ctx.save();
    fillPathFromPoints(topPoints, bottomPoints);
    ctx.clip();

    const fill = ctx.createLinearGradient(
      -state.width * 0.1 + state.motion.shiftX * 0.16,
      state.height * (spec.y - 0.18),
      state.width * 1.12 + state.motion.shiftX * 0.16,
      state.height * (spec.y + 0.22),
    );
    fill.addColorStop(0, spec.colors[0]);
    fill.addColorStop(0.18, spec.colors[1]);
    fill.addColorStop(0.4, spec.colors[2]);
    fill.addColorStop(0.62, spec.colors[3]);
    fill.addColorStop(1, spec.colors[4]);
    ctx.fillStyle = fill;
    ctx.fillRect(
      -state.width * 0.3,
      -state.height * 0.22,
      state.width * 1.8,
      state.height * 1.44,
    );

    ctx.globalCompositeOperation = "screen";

    const faceHighlight = ctx.createLinearGradient(
      state.width * (-0.04 + state.motion.surfaceTiltY * 0.03),
      0,
      state.width * (1.02 + state.motion.surfaceTiltY * 0.03),
      state.height,
    );
    faceHighlight.addColorStop(0, "rgba(255,255,255,0)");
    faceHighlight.addColorStop(0.16, "rgba(255,255,255,0.08)");
    faceHighlight.addColorStop(0.3, "rgba(255,255,255,0.56)");
    faceHighlight.addColorStop(0.38, "rgba(196,233,255,0.22)");
    faceHighlight.addColorStop(0.52, "rgba(255,255,255,0.06)");
    faceHighlight.addColorStop(0.66, "rgba(74, 182, 255, 0.18)");
    faceHighlight.addColorStop(0.84, "rgba(255,255,255,0.04)");
    faceHighlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = faceHighlight;
    ctx.fillRect(
      -state.width * 0.2,
      -state.height * 0.2,
      state.width * 1.6,
      state.height * 1.4,
    );

    const hardEdge = ctx.createLinearGradient(
      state.width * (0.14 + index * 0.06 + state.motion.surfaceTiltY * 0.03),
      0,
      state.width * (0.46 + index * 0.08 + state.motion.surfaceTiltY * 0.04),
      state.height,
    );
    hardEdge.addColorStop(0, "rgba(255,255,255,0)");
    hardEdge.addColorStop(0.28, "rgba(255,255,255,0.18)");
    hardEdge.addColorStop(0.42, "rgba(255,255,255,0.95)");
    hardEdge.addColorStop(0.5, "rgba(167,221,255,0.42)");
    hardEdge.addColorStop(0.62, "rgba(255,255,255,0.08)");
    hardEdge.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hardEdge;
    ctx.fillRect(
      -state.width * 0.18,
      -state.height * 0.16,
      state.width * 1.52,
      state.height * 1.32,
    );

    const coolMetal = ctx.createLinearGradient(0, 0, 0, state.height);
    coolMetal.addColorStop(0, "rgba(160, 220, 255, 0.08)");
    coolMetal.addColorStop(0.42, "rgba(12, 81, 180, 0)");
    coolMetal.addColorStop(0.76, "rgba(168, 231, 255, 0.06)");
    coolMetal.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = coolMetal;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(244, 250, 255, 0.34)";
    ctx.lineWidth = Math.max(1.2, Math.min(state.width, state.height) * 0.0034);

    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);
    for (let i = 1; i < topPoints.length; i += 1) {
      const prev = topPoints[i - 1];
      const curr = topPoints[i];
      ctx.quadraticCurveTo(
        prev.x,
        prev.y,
        (prev.x + curr.x) * 0.5,
        (prev.y + curr.y) * 0.5,
      );
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(81, 181, 255, 0.18)";
    ctx.beginPath();
    ctx.moveTo(bottomPoints[0].x, bottomPoints[0].y);
    for (let i = 1; i < bottomPoints.length; i += 1) {
      const prev = bottomPoints[i - 1];
      const curr = bottomPoints[i];
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

  function drawReflectionCrease(spec) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const gradient = ctx.createLinearGradient(
      -state.width * 0.1,
      0,
      state.width * 1.14,
      state.height,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.18)");
    gradient.addColorStop(0.32, `rgba(255,255,255,${spec.alpha})`);
    gradient.addColorStop(0.46, "rgba(145, 226, 255, 0.88)");
    gradient.addColorStop(0.58, "rgba(255,255,255,0.42)");
    gradient.addColorStop(
      0.74,
      spec.warm ? "rgba(255, 160, 92, 0.2)" : "rgba(80, 187, 255, 0.18)",
    );
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.strokeStyle = gradient;
    ctx.shadowColor = spec.warm
      ? "rgba(255, 178, 110, 0.18)"
      : "rgba(157, 227, 255, 0.28)";
    ctx.shadowBlur = 14 + state.motion.reflectionGlow * 10;
    ctx.lineWidth = spec.width + state.motion.reflectionGlow * 3.4;

    ctx.beginPath();

    for (let i = 0; i <= 46; i += 1) {
      const p = i / 46;
      const x =
        -state.width * 0.1 +
        p * state.width * 1.22 +
        state.motion.shiftX * 0.38 +
        Math.sin(state.time * 1.2 + p * 4.8 + spec.phase) *
          (10 + state.motion.reflectionFlow * 4.2);

      const y =
        state.height * spec.y +
        Math.sin(
          p * Math.PI * spec.freq + state.time * spec.speed + spec.phase,
        ) *
          state.height *
          spec.amp +
        state.motion.surfaceTiltX * state.height * 0.11 +
        state.motion.surfaceTiltY * (x - state.width * 0.5) * 0.022;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.2, spec.width * 0.15);
    ctx.strokeStyle = spec.warm
      ? "rgba(255, 224, 196, 0.66)"
      : "rgba(255, 255, 255, 0.88)";
    ctx.stroke();

    ctx.restore();
  }

  function drawReflectionWashes() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    washSpecs.forEach((spec, index) => {
      const xShift =
        ((state.time * (90 + index * 26) +
          state.motion.reflectionFlow * 140 +
          index * 110) %
          (state.width * 1.48)) -
        state.width * 0.24;

      const y =
        state.height * spec.y +
        Math.sin(state.time * spec.speed + spec.phase) * 16 +
        state.motion.surfaceTiltX * 12;

      const gradient = ctx.createLinearGradient(
        xShift,
        y,
        xShift + state.width * 0.48,
        y + spec.width * 0.08,
      );
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.18, "rgba(255,255,255,0.05)");
      gradient.addColorStop(0.34, `rgba(173, 228, 255, ${spec.alpha})`);
      gradient.addColorStop(0.54, "rgba(255,255,255,0.22)");
      gradient.addColorStop(0.72, "rgba(94, 197, 255, 0.12)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(
        xShift,
        y - spec.width * 0.26,
        state.width * 0.54,
        spec.width,
      );
    });

    ctx.restore();
  }

  function drawFlares() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    state.flares.forEach((flare) => {
      const gradient = ctx.createRadialGradient(
        flare.x,
        flare.y,
        0,
        flare.x,
        flare.y,
        flare.radius,
      );

      if (flare.warm) {
        gradient.addColorStop(0, `rgba(255, 216, 176, ${flare.alpha})`);
        gradient.addColorStop(0.3, `rgba(255, 162, 92, ${flare.alpha * 0.42})`);
      } else {
        gradient.addColorStop(0, `rgba(255, 255, 255, ${flare.alpha})`);
        gradient.addColorStop(
          0.22,
          `rgba(190, 234, 255, ${flare.alpha * 0.72})`,
        );
        gradient.addColorStop(
          0.48,
          `rgba(74, 196, 255, ${flare.alpha * 0.24})`,
        );
      }

      gradient.addColorStop(1, "rgba(255,255,255,0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, flare.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawFineMetal() {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const count = 26;

    for (let i = 0; i < count; i += 1) {
      const p = i / count;
      const y =
        state.height * p +
        Math.sin(state.time * (0.16 + p * 0.12) + i * 0.35) * 6 +
        state.motion.surfaceTiltX * 6;

      const gradient = ctx.createLinearGradient(0, y, state.width, y + 10);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.24, "rgba(255,255,255,0.028)");
      gradient.addColorStop(0.52, "rgba(255,255,255,0.05)");
      gradient.addColorStop(0.82, "rgba(255,255,255,0.016)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, state.width, 8);
    }

    ctx.restore();
  }

  function drawFinalGloss() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const gloss = ctx.createLinearGradient(
      state.width * (0.12 + state.motion.surfaceTiltY * 0.05),
      0,
      state.width * (0.88 + state.motion.surfaceTiltY * 0.05),
      state.height,
    );
    gloss.addColorStop(0, "rgba(255,255,255,0)");
    gloss.addColorStop(0.18, "rgba(255,255,255,0.05)");
    gloss.addColorStop(0.34, "rgba(255,255,255,0.14)");
    gloss.addColorStop(0.46, "rgba(255,255,255,0.06)");
    gloss.addColorStop(0.62, "rgba(116, 217, 255, 0.06)");
    gloss.addColorStop(0.84, "rgba(255,255,255,0.03)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    bodyBands.forEach(drawBodyBand);
    drawReflectionWashes();
    creaseSpecs.forEach(drawReflectionCrease);
    drawFineMetal();
    drawFlares();
    drawFinalGloss();
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
