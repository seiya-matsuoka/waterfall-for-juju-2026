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

      speedFlow: 0,
      targetSpeedFlow: 0,

      bodyPressure: 0,
      targetBodyPressure: 0,
    },

    flares: [],

    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

  const bodyPanels = [
    {
      y: 0.12,
      thickness: 0.34,
      wave: 0.038,
      freq: 1.04,
      speed: 0.28,
      phase: 0.2,
      slope: -0.12,
      twist: 0.09,
      depth: 0.12,
      colors: ["#071a33", "#0b3b78", "#0f57ae", "#63b8ff", "#0b2a56"],
    },
    {
      y: 0.32,
      thickness: 0.26,
      wave: 0.028,
      freq: 1.46,
      speed: 0.36,
      phase: 1.2,
      slope: -0.04,
      twist: 0.12,
      depth: 0.28,
      colors: ["#071b35", "#0d488f", "#1763c0", "#9ad8ff", "#0c3365"],
    },
    {
      y: 0.54,
      thickness: 0.38,
      wave: 0.046,
      freq: 1.14,
      speed: 0.24,
      phase: 2.4,
      slope: 0.034,
      twist: 0.16,
      depth: 0.56,
      colors: ["#081c36", "#0c4da0", "#1b6dd0", "#b2e0ff", "#0c3b79"],
    },
    {
      y: 0.78,
      thickness: 0.24,
      wave: 0.03,
      freq: 1.58,
      speed: 0.32,
      phase: 3.6,
      slope: 0.092,
      twist: 0.11,
      depth: 0.84,
      colors: ["#06182f", "#093a74", "#1156ac", "#6ab8ff", "#0a2c58"],
    },
  ];

  const ridgeSpecs = [
    {
      y: 0.22,
      amp: 0.07,
      freq: 1.12,
      speed: 0.52,
      phase: 0.4,
      width: 18,
      alpha: 0.58,
      warm: false,
    },
    {
      y: 0.49,
      amp: 0.09,
      freq: 1.24,
      speed: 0.46,
      phase: 1.9,
      width: 24,
      alpha: 0.64,
      warm: false,
    },
    {
      y: 0.66,
      amp: 0.06,
      freq: 1.48,
      speed: 0.5,
      phase: 3.0,
      width: 14,
      alpha: 0.22,
      warm: true,
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

  function addFlare(x, y, strength = 1) {
    state.flares.push({
      x,
      y,
      radius: lerp(46, 104, Math.min(1, strength)),
      alpha: lerp(0.08, 0.2, Math.min(1, strength)),
      vx: (Math.random() - 0.5) * 1.6 + state.motion.speedFlow * 0.8,
      vy: (Math.random() - 0.5) * 0.45,
      life: 1,
      warm: Math.random() < 0.1,
    });

    if (state.flares.length > 10) {
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
    const speed = Math.min(1.6, Math.hypot(dx, dy) / 28);

    state.motion.targetSurfaceTiltY = clamp(
      state.motion.targetSurfaceTiltY + dxNorm * 10.4,
      -1.35,
      1.35,
    );
    state.motion.targetSurfaceTiltX = clamp(
      state.motion.targetSurfaceTiltX - dyNorm * 7.8,
      -1.15,
      1.15,
    );

    state.motion.targetShiftX = clamp(
      state.motion.targetShiftX + dxNorm * 210,
      -210,
      210,
    );
    state.motion.targetShiftY = clamp(
      state.motion.targetShiftY + dyNorm * 96,
      -108,
      108,
    );

    state.motion.targetSpeedFlow = clamp(
      state.motion.targetSpeedFlow + dxNorm * 5.4,
      -3.6,
      3.6,
    );

    state.motion.targetBodyPressure = clamp(
      state.motion.targetBodyPressure + speed * 0.26 + Math.abs(dxNorm) * 0.8,
      0,
      2.2,
    );

    if (speed > 0.18) {
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
    const gamma = clamp((event.gamma ?? 0) / 34, -1.2, 1.2);
    const beta = clamp((event.beta ?? 0) / 48, -1, 1);

    state.motion.sensorY = gamma;
    state.motion.sensorX = clamp(beta * 0.72, -0.84, 0.84);
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
      flare.alpha *= decay(0.95, deltaSeconds);
      flare.radius += 16 * deltaSeconds * 60;

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
        state.motion.targetSurfaceTiltY + state.pointer.velocityX * 0.00034,
        -1.35,
        1.35,
      );
      state.motion.targetSurfaceTiltX = clamp(
        state.motion.targetSurfaceTiltX - state.pointer.velocityY * 0.00024,
        -1.15,
        1.15,
      );

      state.motion.targetSpeedFlow += Math.sin(state.time * 0.42) * 0.006;
    }

    state.motion.targetSurfaceTiltX *= decay(0.972, deltaSeconds);
    state.motion.targetSurfaceTiltY *= decay(0.972, deltaSeconds);
    state.motion.targetShiftX *= decay(0.958, deltaSeconds);
    state.motion.targetShiftY *= decay(0.958, deltaSeconds);
    state.motion.targetSpeedFlow *= decay(0.932, deltaSeconds);
    state.motion.targetBodyPressure *= decay(0.934, deltaSeconds);

    const ambientX =
      Math.sin(state.time * 0.54) * 0.04 + Math.cos(state.time * 0.16) * 0.018;
    const ambientY =
      Math.cos(state.time * 0.42) * 0.06 + Math.sin(state.time * 0.22) * 0.026;

    const tiltX = clamp(
      state.motion.targetSurfaceTiltX + state.motion.sensorX * 0.58 + ambientX,
      -1.18,
      1.18,
    );

    const tiltY = clamp(
      state.motion.targetSurfaceTiltY + state.motion.sensorY * 0.82 + ambientY,
      -1.38,
      1.38,
    );

    const shiftX = state.motion.targetShiftX + state.motion.sensorY * 34;
    const shiftY = state.motion.targetShiftY + state.motion.sensorX * 24;

    const speedFlow =
      state.motion.targetSpeedFlow +
      state.motion.sensorY * 0.42 +
      Math.sin(state.time * 0.72) * 0.06;

    const bodyPressure =
      0.22 +
      state.motion.targetBodyPressure +
      Math.abs(state.motion.sensorY) * 0.26 +
      Math.abs(speedFlow) * 0.14;

    state.motion.surfaceTiltX = lerp(state.motion.surfaceTiltX, tiltX, 0.08);
    state.motion.surfaceTiltY = lerp(state.motion.surfaceTiltY, tiltY, 0.08);
    state.motion.shiftX = lerp(state.motion.shiftX, shiftX, 0.08);
    state.motion.shiftY = lerp(state.motion.shiftY, shiftY, 0.08);
    state.motion.speedFlow = lerp(state.motion.speedFlow, speedFlow, 0.08);
    state.motion.bodyPressure = lerp(
      state.motion.bodyPressure,
      bodyPressure,
      0.08,
    );

    updateFlares(deltaSeconds);
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

  function createBodyPanelPath(spec) {
    const topPoints = [];
    const bottomPoints = [];
    const steps = 58;

    for (let i = 0; i <= steps; i += 1) {
      const p = i / steps;
      const x = -state.width * 0.18 + p * state.width * 1.36;

      const wave =
        Math.sin(
          p * Math.PI * spec.freq + state.time * spec.speed + spec.phase,
        ) *
          state.height *
          spec.wave +
        Math.cos(
          p * Math.PI * (spec.freq * 1.96) -
            state.time * (spec.speed * 0.34) +
            spec.phase * 0.82,
        ) *
          state.height *
          spec.wave *
          0.3;

      const aerodynamicSweep =
        state.motion.speedFlow * state.height * 0.018 +
        p * state.motion.speedFlow * state.height * 0.01;

      const centerY =
        state.height * spec.y +
        wave +
        state.motion.shiftY * (0.08 + spec.depth * 0.08) +
        (x - state.width * 0.5) * spec.slope +
        state.motion.surfaceTiltX * state.height * (0.1 + spec.depth * 0.08) +
        state.motion.surfaceTiltY * (x - state.width * 0.5) * spec.twist +
        aerodynamicSweep;

      const thickness =
        state.height *
        spec.thickness *
        (1 +
          Math.abs(state.motion.surfaceTiltY) * 0.14 +
          state.motion.bodyPressure * 0.04);

      const xShift =
        state.motion.shiftX * (0.16 + spec.depth * 0.5) +
        state.motion.speedFlow * 20 * (0.36 + spec.depth * 0.18);

      topPoints.push({
        x: x + xShift,
        y: centerY - thickness * 0.54,
      });

      bottomPoints.push({
        x: x + xShift + 16 + state.motion.surfaceTiltY * 12,
        y: centerY + thickness * 0.46,
      });
    }

    return { topPoints, bottomPoints };
  }

  function drawBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, state.width, state.height);
    gradient.addColorStop(0, "#071a34");
    gradient.addColorStop(0.26, "#0b356e");
    gradient.addColorStop(0.5, "#0f55ad");
    gradient.addColorStop(0.74, "#0a3d80");
    gradient.addColorStop(1, "#071b35");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const crownGlow = ctx.createRadialGradient(
      state.width * (0.5 + state.motion.surfaceTiltY * 0.04),
      state.height * (0.28 + state.motion.surfaceTiltX * 0.05),
      0,
      state.width * 0.5,
      state.height * 0.32,
      Math.max(state.width, state.height) * 0.94,
    );
    crownGlow.addColorStop(0, "rgba(180, 226, 255, 0.12)");
    crownGlow.addColorStop(0.2, "rgba(93, 182, 255, 0.14)");
    crownGlow.addColorStop(0.42, "rgba(24, 109, 214, 0.12)");
    crownGlow.addColorStop(0.76, "rgba(8, 49, 112, 0.08)");
    crownGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = crownGlow;
    ctx.fillRect(0, 0, state.width, state.height);

    const shoulderDark = ctx.createLinearGradient(0, 0, 0, state.height);
    shoulderDark.addColorStop(0, "rgba(0, 0, 0, 0.1)");
    shoulderDark.addColorStop(0.18, "rgba(0,0,0,0)");
    shoulderDark.addColorStop(0.82, "rgba(0,0,0,0)");
    shoulderDark.addColorStop(1, "rgba(0, 0, 0, 0.14)");
    ctx.fillStyle = shoulderDark;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawBodyPanel(spec, index) {
    const { topPoints, bottomPoints } = createBodyPanelPath(spec);

    ctx.save();
    fillPathFromPoints(topPoints, bottomPoints);
    ctx.clip();

    const fill = ctx.createLinearGradient(
      -state.width * 0.08 + state.motion.shiftX * 0.14,
      state.height * (spec.y - 0.18),
      state.width * 1.08 + state.motion.shiftX * 0.14,
      state.height * (spec.y + 0.22),
    );
    fill.addColorStop(0, spec.colors[0]);
    fill.addColorStop(0.16, spec.colors[1]);
    fill.addColorStop(0.42, spec.colors[2]);
    fill.addColorStop(0.66, spec.colors[3]);
    fill.addColorStop(1, spec.colors[4]);
    ctx.fillStyle = fill;
    ctx.fillRect(
      -state.width * 0.28,
      -state.height * 0.2,
      state.width * 1.76,
      state.height * 1.4,
    );

    ctx.globalCompositeOperation = "screen";

    const broadFace = ctx.createLinearGradient(
      state.width * (-0.04 + state.motion.surfaceTiltY * 0.02),
      0,
      state.width * (1.02 + state.motion.surfaceTiltY * 0.03),
      state.height,
    );
    broadFace.addColorStop(0, "rgba(255,255,255,0)");
    broadFace.addColorStop(0.2, "rgba(255,255,255,0.04)");
    broadFace.addColorStop(0.34, "rgba(183,227,255,0.16)");
    broadFace.addColorStop(0.52, "rgba(255,255,255,0.08)");
    broadFace.addColorStop(0.68, "rgba(78, 187, 255, 0.16)");
    broadFace.addColorStop(0.86, "rgba(255,255,255,0.03)");
    broadFace.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = broadFace;
    ctx.fillRect(
      -state.width * 0.2,
      -state.height * 0.16,
      state.width * 1.62,
      state.height * 1.32,
    );

    const hardPlane = ctx.createLinearGradient(
      state.width * (0.08 + index * 0.08 + state.motion.surfaceTiltY * 0.026),
      0,
      state.width * (0.4 + index * 0.09 + state.motion.surfaceTiltY * 0.038),
      state.height,
    );
    hardPlane.addColorStop(0, "rgba(255,255,255,0)");
    hardPlane.addColorStop(0.24, "rgba(255,255,255,0.08)");
    hardPlane.addColorStop(0.38, "rgba(255,255,255,0.6)");
    hardPlane.addColorStop(0.44, "rgba(171,225,255,0.22)");
    hardPlane.addColorStop(0.54, "rgba(255,255,255,0.04)");
    hardPlane.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hardPlane;
    ctx.fillRect(
      -state.width * 0.16,
      -state.height * 0.14,
      state.width * 1.48,
      state.height * 1.28,
    );

    const lowerShadow = ctx.createLinearGradient(0, 0, 0, state.height);
    lowerShadow.addColorStop(0, "rgba(0,0,0,0)");
    lowerShadow.addColorStop(0.56, "rgba(0,0,0,0)");
    lowerShadow.addColorStop(0.8, "rgba(0,0,0,0.08)");
    lowerShadow.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = lowerShadow;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(235, 246, 255, 0.22)";
    ctx.lineWidth = Math.max(1.1, Math.min(state.width, state.height) * 0.003);

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

    ctx.strokeStyle = "rgba(56, 151, 255, 0.16)";
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

  function drawSpeedField() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const count = 15;
    for (let i = 0; i < count; i += 1) {
      const p = i / count;
      const baseY =
        state.height * (0.06 + p * 0.88) +
        Math.sin(state.time * (0.36 + p * 0.12) + i * 0.5) * 10 +
        state.motion.surfaceTiltX * 9;

      const startX =
        ((state.time * (230 + i * 22) + state.motion.speedFlow * 220 + i * 90) %
          (state.width * 1.56)) -
        state.width * 0.28;
      const length = state.width * (0.18 + p * 0.12);

      const grad = ctx.createLinearGradient(
        startX,
        baseY,
        startX + length,
        baseY,
      );
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.22, "rgba(255,255,255,0.01)");
      grad.addColorStop(0.44, "rgba(165, 227, 255, 0.05)");
      grad.addColorStop(0.66, "rgba(255,255,255,0.12)");
      grad.addColorStop(0.84, "rgba(92, 197, 255, 0.05)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(startX, baseY, length, 1.3);
    }

    ctx.restore();
  }

  function drawRidge(spec) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const gradient = ctx.createLinearGradient(
      -state.width * 0.08,
      0,
      state.width * 1.12,
      state.height,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.22, "rgba(255,255,255,0.08)");
    gradient.addColorStop(0.34, `rgba(255,255,255,${spec.alpha})`);
    gradient.addColorStop(0.48, "rgba(151, 225, 255, 0.72)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.18)");
    gradient.addColorStop(
      0.72,
      spec.warm ? "rgba(255, 165, 96, 0.12)" : "rgba(75, 182, 255, 0.12)",
    );
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.strokeStyle = gradient;
    ctx.shadowColor = spec.warm
      ? "rgba(255, 180, 112, 0.12)"
      : "rgba(156, 227, 255, 0.2)";
    ctx.shadowBlur = 8 + state.motion.bodyPressure * 4;
    ctx.lineWidth = spec.width + state.motion.bodyPressure * 1.6;

    ctx.beginPath();

    for (let i = 0; i <= 42; i += 1) {
      const p = i / 42;
      const x =
        -state.width * 0.08 +
        p * state.width * 1.18 +
        state.motion.shiftX * 0.34 +
        state.motion.speedFlow * 30 +
        Math.sin(state.time * 0.84 + p * 5.2 + spec.phase) *
          (6 + Math.abs(state.motion.speedFlow) * 3);

      const y =
        state.height * spec.y +
        Math.sin(
          p * Math.PI * spec.freq + state.time * spec.speed + spec.phase,
        ) *
          state.height *
          spec.amp +
        state.motion.surfaceTiltX * state.height * 0.1 +
        state.motion.surfaceTiltY * (x - state.width * 0.5) * 0.018;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.1, spec.width * 0.12);
    ctx.strokeStyle = spec.warm
      ? "rgba(255, 223, 196, 0.42)"
      : "rgba(255,255,255,0.56)";
    ctx.stroke();

    ctx.restore();
  }

  function drawFineMetal() {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const count = 22;

    for (let i = 0; i < count; i += 1) {
      const p = i / count;
      const y =
        state.height * p +
        Math.sin(state.time * (0.18 + p * 0.1) + i * 0.32) * 5 +
        state.motion.surfaceTiltX * 5;

      const gradient = ctx.createLinearGradient(0, y, state.width, y + 8);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.3, "rgba(255,255,255,0.018)");
      gradient.addColorStop(0.54, "rgba(255,255,255,0.038)");
      gradient.addColorStop(0.82, "rgba(255,255,255,0.012)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, state.width, 7);
    }

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
        gradient.addColorStop(0, `rgba(255, 220, 184, ${flare.alpha})`);
        gradient.addColorStop(
          0.32,
          `rgba(255, 165, 95, ${flare.alpha * 0.34})`,
        );
      } else {
        gradient.addColorStop(0, `rgba(255,255,255,${flare.alpha})`);
        gradient.addColorStop(
          0.24,
          `rgba(193, 236, 255, ${flare.alpha * 0.56})`,
        );
        gradient.addColorStop(0.5, `rgba(92, 197, 255, ${flare.alpha * 0.18})`);
      }

      gradient.addColorStop(1, "rgba(255,255,255,0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(flare.x, flare.y, flare.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  function drawFinalGloss() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const gloss = ctx.createLinearGradient(
      state.width * (0.12 + state.motion.surfaceTiltY * 0.04),
      0,
      state.width * (0.84 + state.motion.surfaceTiltY * 0.04),
      state.height,
    );
    gloss.addColorStop(0, "rgba(255,255,255,0)");
    gloss.addColorStop(0.2, "rgba(255,255,255,0.03)");
    gloss.addColorStop(0.34, "rgba(255,255,255,0.1)");
    gloss.addColorStop(0.5, "rgba(255,255,255,0.04)");
    gloss.addColorStop(0.66, "rgba(104, 210, 255, 0.04)");
    gloss.addColorStop(0.86, "rgba(255,255,255,0.02)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    bodyPanels.forEach(drawBodyPanel);
    drawSpeedField();
    ridgeSpecs.forEach(drawRidge);
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
