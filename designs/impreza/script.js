(() => {
  const canvas = document.getElementById("impreza-canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const motionButton = document.getElementById("motion-permission-button");

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
      bodyTiltX: 0,
      bodyTiltY: 0,
      targetBodyTiltX: 0,
      targetBodyTiltY: 0,

      shiftX: 0,
      shiftY: 0,
      targetShiftX: 0,
      targetShiftY: 0,

      sensorX: 0,
      sensorY: 0,

      flow: 0,
      targetFlow: 0,

      glow: 0,
      targetGlow: 0,
    },

    flares: [],

    orientation: {
      supported: false,
      enabled: false,
      permissionNeeded: false,
    },
  };

  const ribbons = [
    {
      y: 0.2,
      thickness: 0.16,
      wave: 0.024,
      freq: 2.3,
      speed: 0.72,
      phase: 0.2,
      skew: -0.08,
      tiltY: 0.12,
      depth: 0.18,
      edgeShift: 18,
      colors: ["#08111c", "#f4fbff", "#8bd6ff", "#265b8f", "#061120"],
    },
    {
      y: 0.36,
      thickness: 0.2,
      wave: 0.03,
      freq: 1.8,
      speed: 0.58,
      phase: 1.2,
      skew: -0.045,
      tiltY: 0.14,
      depth: 0.32,
      edgeShift: 26,
      colors: ["#07111b", "#dff4ff", "#63c7ff", "#1d4f86", "#07111b"],
    },
    {
      y: 0.51,
      thickness: 0.22,
      wave: 0.034,
      freq: 1.45,
      speed: 0.52,
      phase: 2.4,
      skew: 0.02,
      tiltY: 0.16,
      depth: 0.54,
      edgeShift: 34,
      colors: ["#09131f", "#ffffff", "#9fe0ff", "#2d6ea7", "#08121f"],
    },
    {
      y: 0.66,
      thickness: 0.16,
      wave: 0.028,
      freq: 2.1,
      speed: 0.63,
      phase: 3.3,
      skew: 0.055,
      tiltY: 0.1,
      depth: 0.72,
      edgeShift: 24,
      colors: ["#08111b", "#e5f7ff", "#56bbff", "#1e4f82", "#07111b"],
    },
    {
      y: 0.82,
      thickness: 0.13,
      wave: 0.021,
      freq: 2.5,
      speed: 0.76,
      phase: 4.2,
      skew: 0.08,
      tiltY: 0.08,
      depth: 0.88,
      edgeShift: 18,
      colors: ["#071018", "#e9f8ff", "#8bd3ff", "#214a78", "#071019"],
    },
  ];

  const reflectionBands = [
    {
      y: 0.22,
      amp: 0.085,
      freq: 1.25,
      speed: 0.84,
      phase: 0.3,
      width: 26,
      alpha: 0.84,
      skew: -0.06,
    },
    {
      y: 0.42,
      amp: 0.11,
      freq: 1.05,
      speed: 0.68,
      phase: 1.6,
      width: 34,
      alpha: 0.72,
      skew: -0.02,
    },
    {
      y: 0.58,
      amp: 0.095,
      freq: 1.34,
      speed: 0.74,
      phase: 3.1,
      width: 22,
      alpha: 0.66,
      skew: 0.04,
    },
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function powerDecay(base, seconds) {
    return Math.pow(base, seconds * 60);
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

  function pathRibbon(topPoints, bottomPoints) {
    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);

    for (let i = 1; i < topPoints.length; i += 1) {
      ctx.lineTo(topPoints[i].x, topPoints[i].y);
    }

    for (let i = bottomPoints.length - 1; i >= 0; i -= 1) {
      ctx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
    }

    ctx.closePath();
  }

  function addFlare(x, y, strength = 1) {
    state.flares.push({
      x,
      y,
      radius: lerp(48, 120, Math.min(1, strength)),
      alpha: lerp(0.16, 0.34, Math.min(1, strength)),
      vx: (Math.random() - 0.5) * 1.6,
      vy: (Math.random() - 0.5) * 0.9,
      life: 1,
      hue: Math.random() < 0.2 ? "warm" : "cool",
    });

    if (state.flares.length > 12) {
      state.flares.shift();
    }
  }

  function onPointerDown(event) {
    state.pointer.active = true;
    state.pointer.id = event.pointerId ?? null;
    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
    state.pointer.velocityX = 0;
    state.pointer.velocityY = 0;

    if (event.pointerId != null && canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        // no-op
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

    const dx = event.clientX - state.pointer.lastX;
    const dy = event.clientY - state.pointer.lastY;

    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
    state.pointer.velocityX = dx;
    state.pointer.velocityY = dy;

    const dxNorm = dx / Math.max(1, state.width);
    const dyNorm = dy / Math.max(1, state.height);
    const speed = Math.min(1.4, Math.hypot(dx, dy) / 28);

    state.motion.targetBodyTiltY = clamp(
      state.motion.targetBodyTiltY + dxNorm * 8.2,
      -1.15,
      1.15,
    );
    state.motion.targetBodyTiltX = clamp(
      state.motion.targetBodyTiltX - dyNorm * 6.4,
      -0.9,
      0.9,
    );

    state.motion.targetShiftX = clamp(
      state.motion.targetShiftX + dxNorm * 140,
      -140,
      140,
    );
    state.motion.targetShiftY = clamp(
      state.motion.targetShiftY + dyNorm * 54,
      -68,
      68,
    );

    state.motion.targetFlow = clamp(
      state.motion.targetFlow + Math.abs(dxNorm) * 3.8 + Math.abs(dyNorm) * 1.2,
      0,
      2.2,
    );
    state.motion.targetGlow = clamp(
      state.motion.targetGlow + speed * 0.22,
      0,
      1.75,
    );

    if (speed > 0.28) {
      addFlare(event.clientX, event.clientY, speed);
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
        // no-op
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

    state.orientation.supported = true;
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
          // no-op
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
      flare.life *= powerDecay(0.96, deltaSeconds);
      flare.alpha *= powerDecay(0.955, deltaSeconds);
      flare.radius += 16 * deltaSeconds * 60;

      if (flare.life < 0.08 || flare.alpha < 0.01) {
        state.flares.splice(i, 1);
      }
    }
  }

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.pointer.velocityX *= powerDecay(0.9, deltaSeconds);
      state.pointer.velocityY *= powerDecay(0.9, deltaSeconds);

      state.motion.targetBodyTiltY = clamp(
        state.motion.targetBodyTiltY + state.pointer.velocityX * 0.00032,
        -1.15,
        1.15,
      );
      state.motion.targetBodyTiltX = clamp(
        state.motion.targetBodyTiltX - state.pointer.velocityY * 0.00026,
        -0.9,
        0.9,
      );
    }

    state.motion.targetBodyTiltX *= powerDecay(0.972, deltaSeconds);
    state.motion.targetBodyTiltY *= powerDecay(0.972, deltaSeconds);
    state.motion.targetShiftX *= powerDecay(0.955, deltaSeconds);
    state.motion.targetShiftY *= powerDecay(0.955, deltaSeconds);
    state.motion.targetFlow *= powerDecay(0.93, deltaSeconds);
    state.motion.targetGlow *= powerDecay(0.932, deltaSeconds);

    const ambientTiltX =
      Math.sin(state.time * 0.58) * 0.045 + Math.cos(state.time * 0.21) * 0.02;
    const ambientTiltY =
      Math.cos(state.time * 0.44) * 0.06 + Math.sin(state.time * 0.18) * 0.03;

    const combinedTiltX = clamp(
      state.motion.targetBodyTiltX + state.motion.sensorX * 0.55 + ambientTiltX,
      -1.1,
      1.1,
    );

    const combinedTiltY = clamp(
      state.motion.targetBodyTiltY + state.motion.sensorY * 0.72 + ambientTiltY,
      -1.25,
      1.25,
    );

    const combinedShiftX =
      state.motion.targetShiftX + state.motion.sensorY * 28;
    const combinedShiftY =
      state.motion.targetShiftY + state.motion.sensorX * 18;

    const combinedFlow =
      0.22 +
      state.motion.targetFlow +
      Math.abs(state.motion.sensorY) * 0.36 +
      Math.abs(combinedTiltY) * 0.08;

    const combinedGlow =
      0.18 +
      state.motion.targetGlow +
      Math.abs(state.motion.sensorX) * 0.12 +
      Math.abs(combinedTiltX) * 0.06;

    state.motion.bodyTiltX = lerp(state.motion.bodyTiltX, combinedTiltX, 0.08);
    state.motion.bodyTiltY = lerp(state.motion.bodyTiltY, combinedTiltY, 0.08);
    state.motion.shiftX = lerp(state.motion.shiftX, combinedShiftX, 0.08);
    state.motion.shiftY = lerp(state.motion.shiftY, combinedShiftY, 0.08);
    state.motion.flow = lerp(state.motion.flow, combinedFlow, 0.07);
    state.motion.glow = lerp(state.motion.glow, combinedGlow, 0.07);

    updateFlares(deltaSeconds);
  }

  function drawBackdrop() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, "#01040a");
    gradient.addColorStop(0.24, "#07111b");
    gradient.addColorStop(0.52, "#0d1f33");
    gradient.addColorStop(0.78, "#081320");
    gradient.addColorStop(1, "#02060b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const centerGlow = ctx.createRadialGradient(
      state.width * (0.52 + state.motion.bodyTiltY * 0.04),
      state.height * (0.48 + state.motion.bodyTiltX * 0.06),
      0,
      state.width * 0.52,
      state.height * 0.48,
      Math.max(state.width, state.height) * 0.8,
    );
    centerGlow.addColorStop(0, "rgba(185, 232, 255, 0.12)");
    centerGlow.addColorStop(0.24, "rgba(85, 185, 255, 0.11)");
    centerGlow.addColorStop(0.56, "rgba(53, 121, 206, 0.06)");
    centerGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = centerGlow;
    ctx.fillRect(0, 0, state.width, state.height);

    const warmReflection = ctx.createRadialGradient(
      state.width * (0.82 + state.motion.bodyTiltY * 0.02),
      state.height * 0.28,
      0,
      state.width * 0.82,
      state.height * 0.28,
      Math.max(state.width, state.height) * 0.24,
    );
    warmReflection.addColorStop(0, "rgba(255, 152, 62, 0.08)");
    warmReflection.addColorStop(0.42, "rgba(255, 152, 62, 0.04)");
    warmReflection.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = warmReflection;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function drawSurfaceRibbon(spec) {
    const topPoints = [];
    const bottomPoints = [];
    const steps = 32;

    for (let i = 0; i <= steps; i += 1) {
      const progress = i / steps;
      const x = -state.width * 0.14 + progress * state.width * 1.28;

      const shiftedX = x + state.motion.shiftX * (0.18 + spec.depth * 0.62);
      const curve =
        Math.sin(
          progress * Math.PI * spec.freq + state.time * spec.speed + spec.phase,
        ) *
          state.height *
          spec.wave +
        Math.cos(progress * Math.PI * 2.2 + spec.phase * 0.8) *
          state.height *
          spec.wave *
          0.32;

      const centerY =
        state.height * spec.y +
        curve +
        state.motion.shiftY * (0.06 + spec.depth * 0.05) +
        (x - state.width * 0.5) * spec.skew +
        state.motion.bodyTiltX * state.height * spec.tiltY +
        state.motion.bodyTiltY * (x - state.width * 0.5) * 0.03;

      const thickness =
        state.height *
        spec.thickness *
        (1 + Math.abs(state.motion.bodyTiltY) * 0.12);

      topPoints.push({
        x: shiftedX,
        y: centerY - thickness * 0.5,
      });

      bottomPoints.push({
        x: shiftedX + spec.edgeShift + state.motion.bodyTiltY * 12,
        y: centerY + thickness * 0.5,
      });
    }

    ctx.save();
    pathRibbon(topPoints, bottomPoints);
    ctx.clip();

    const fill = ctx.createLinearGradient(
      -state.width * 0.1 + state.motion.shiftX * 0.2,
      0,
      state.width * 1.1 + state.motion.shiftX * 0.2,
      state.height,
    );
    fill.addColorStop(0, spec.colors[0]);
    fill.addColorStop(0.2, spec.colors[1]);
    fill.addColorStop(0.38, "#ffffff");
    fill.addColorStop(0.56, spec.colors[2]);
    fill.addColorStop(0.78, spec.colors[3]);
    fill.addColorStop(1, spec.colors[4]);

    ctx.fillStyle = fill;
    ctx.fillRect(
      -state.width * 0.3,
      -state.height * 0.2,
      state.width * 1.8,
      state.height * 1.4,
    );

    ctx.globalCompositeOperation = "screen";

    const sheen = ctx.createLinearGradient(
      -state.width * 0.1 + state.motion.flow * 12,
      0,
      state.width * 1.2 + state.motion.flow * 20,
      state.height,
    );
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.18, "rgba(255,255,255,0.1)");
    sheen.addColorStop(0.34, "rgba(255,255,255,0.7)");
    sheen.addColorStop(0.42, "rgba(214,243,255,0.28)");
    sheen.addColorStop(0.58, "rgba(255,255,255,0.08)");
    sheen.addColorStop(0.74, "rgba(255,160,81,0.08)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(
      -state.width * 0.28,
      -state.height * 0.16,
      state.width * 1.72,
      state.height * 1.32,
    );

    const coolTint = ctx.createLinearGradient(0, 0, state.width, state.height);
    coolTint.addColorStop(0, "rgba(119, 205, 255, 0.14)");
    coolTint.addColorStop(0.4, "rgba(218, 244, 255, 0.1)");
    coolTint.addColorStop(0.72, "rgba(71, 165, 245, 0.14)");
    coolTint.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = coolTint;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(240, 249, 255, 0.48)";
    ctx.lineWidth = Math.max(1.4, Math.min(state.width, state.height) * 0.004);

    ctx.beginPath();
    ctx.moveTo(topPoints[0].x, topPoints[0].y);
    for (let i = 1; i < topPoints.length; i += 1) {
      ctx.lineTo(topPoints[i].x, topPoints[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(102, 198, 255, 0.22)";
    ctx.beginPath();
    ctx.moveTo(bottomPoints[0].x, bottomPoints[0].y);
    for (let i = 1; i < bottomPoints.length; i += 1) {
      ctx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawReflectionBand(spec) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const gradient = ctx.createLinearGradient(
      -state.width * 0.1,
      0,
      state.width * 1.1,
      state.height,
    );
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.14, "rgba(255,255,255,0.28)");
    gradient.addColorStop(0.28, "rgba(255,255,255,0.96)");
    gradient.addColorStop(0.46, "rgba(151,233,255,0.82)");
    gradient.addColorStop(0.62, "rgba(255,255,255,0.4)");
    gradient.addColorStop(0.78, "rgba(255,164,92,0.16)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    ctx.strokeStyle = gradient;
    ctx.shadowColor = "rgba(173, 230, 255, 0.24)";
    ctx.shadowBlur = 18 + state.motion.glow * 10;
    ctx.lineWidth = spec.width + state.motion.glow * 3;

    ctx.beginPath();

    for (let i = 0; i <= 36; i += 1) {
      const progress = i / 36;
      const x =
        -state.width * 0.08 +
        progress * state.width * 1.18 +
        state.motion.shiftX * 0.42 +
        Math.sin(state.time * 1.4 + progress * 4.8 + spec.phase) *
          (10 + state.motion.flow * 3);

      const y =
        state.height * spec.y +
        Math.sin(
          progress * Math.PI * spec.freq + state.time * spec.speed + spec.phase,
        ) *
          state.height *
          spec.amp +
        (x - state.width * 0.5) * spec.skew +
        state.motion.bodyTiltX * state.height * 0.12 +
        state.motion.bodyTiltY * (x - state.width * 0.5) * 0.022;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.2, spec.width * 0.18);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.stroke();

    ctx.restore();
  }

  function drawSpeedLines() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 9; i += 1) {
      const progress = (i + 1) / 10;
      const y =
        state.height * (0.12 + progress * 0.72) +
        Math.sin(state.time * (0.5 + progress * 0.4) + i) * 8 +
        state.motion.bodyTiltX * 10;

      const shift =
        ((state.time * (140 + i * 26) + state.motion.flow * 120 + i * 80) %
          (state.width * 1.4)) -
        state.width * 0.2;

      const length = state.width * (0.12 + progress * 0.08);
      const gradient = ctx.createLinearGradient(shift, y, shift + length, y);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(0.4, "rgba(133, 219, 255, 0.08)");
      gradient.addColorStop(0.7, "rgba(255,255,255,0.18)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(shift, y, length, 1.2);
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

      if (flare.hue === "warm") {
        gradient.addColorStop(0, `rgba(255, 208, 160, ${flare.alpha})`);
        gradient.addColorStop(
          0.28,
          `rgba(255, 164, 95, ${flare.alpha * 0.46})`,
        );
      } else {
        gradient.addColorStop(0, `rgba(255, 255, 255, ${flare.alpha})`);
        gradient.addColorStop(
          0.22,
          `rgba(181, 236, 255, ${flare.alpha * 0.7})`,
        );
        gradient.addColorStop(
          0.54,
          `rgba(107, 197, 255, ${flare.alpha * 0.22})`,
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

  function drawFinalGloss() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const gloss = ctx.createLinearGradient(
      state.width * (0.12 + state.motion.bodyTiltY * 0.04),
      0,
      state.width * (0.88 + state.motion.bodyTiltY * 0.04),
      state.height,
    );
    gloss.addColorStop(0, "rgba(255,255,255,0)");
    gloss.addColorStop(0.22, "rgba(255,255,255,0.05)");
    gloss.addColorStop(0.38, "rgba(255,255,255,0.16)");
    gloss.addColorStop(0.48, "rgba(255,255,255,0.08)");
    gloss.addColorStop(0.64, "rgba(112, 217, 255, 0.06)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawBackdrop();
    ribbons.forEach(drawSurfaceRibbon);
    reflectionBands.forEach(drawReflectionBand);
    drawSpeedLines();
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
