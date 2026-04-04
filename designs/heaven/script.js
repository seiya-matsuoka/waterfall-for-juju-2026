(() => {
  const canvas = document.getElementById("heaven-canvas");
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
    noiseCanvas: null,
    pointer: {
      active: false,
      id: null,
      lastX: 0,
      lastY: 0,
    },
    motion: {
      shiftX: 0,
      shiftY: 0,
      targetShiftX: 0,
      targetShiftY: 0,
      angleDrift: 0,
      targetAngleDrift: 0,
      sensorX: 0,
      sensorY: 0,
      bandSpread: 0,
      targetBandSpread: 0,
    },
    orientation: {
      enabled: false,
      permissionNeeded: false,
    },
  };

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

  function createNoiseCanvas() {
    const noise = document.createElement("canvas");
    noise.width = 180;
    noise.height = 180;
    const nctx = noise.getContext("2d", { alpha: true });
    const image = nctx.createImageData(noise.width, noise.height);

    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.floor(Math.random() * 255);
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 22;
    }

    nctx.putImageData(image, 0, 0);
    state.noiseCanvas = noise;
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

    const dxNorm = dx / Math.max(1, state.width);
    const dyNorm = dy / Math.max(1, state.height);
    const speed = Math.min(1.4, Math.hypot(dx, dy) / 32);

    state.motion.targetShiftX = clamp(
      state.motion.targetShiftX + dxNorm * 1.7,
      -1.2,
      1.2,
    );
    state.motion.targetShiftY = clamp(
      state.motion.targetShiftY + dyNorm * 1.3,
      -1,
      1,
    );
    state.motion.targetAngleDrift = clamp(
      state.motion.targetAngleDrift + dxNorm * 0.8 - dyNorm * 0.3,
      -1,
      1,
    );
    state.motion.targetBandSpread = clamp(
      state.motion.targetBandSpread + speed * 0.7,
      0,
      1.4,
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

  function update(deltaSeconds) {
    state.time += deltaSeconds;

    if (!state.pointer.active) {
      state.motion.targetShiftX *= decay(0.986, deltaSeconds);
      state.motion.targetShiftY *= decay(0.986, deltaSeconds);
      state.motion.targetAngleDrift *= decay(0.986, deltaSeconds);
      state.motion.targetBandSpread *= decay(0.966, deltaSeconds);
    }

    const idleX =
      Math.sin(state.time * 0.24) * 0.28 + Math.cos(state.time * 0.1) * 0.08;
    const idleY =
      Math.cos(state.time * 0.19) * 0.18 + Math.sin(state.time * 0.13) * 0.06;

    const shiftX = clamp(
      state.motion.targetShiftX + state.motion.sensorX * 0.58 + idleX,
      -1.6,
      1.6,
    );
    const shiftY = clamp(
      state.motion.targetShiftY + state.motion.sensorY * 0.36 + idleY,
      -1.2,
      1.2,
    );
    const angleDrift = clamp(
      state.motion.targetAngleDrift + state.motion.sensorX * 0.4,
      -1.2,
      1.2,
    );

    state.motion.shiftX = lerp(state.motion.shiftX, shiftX, 0.065);
    state.motion.shiftY = lerp(state.motion.shiftY, shiftY, 0.065);
    state.motion.angleDrift = lerp(state.motion.angleDrift, angleDrift, 0.06);
    state.motion.bandSpread = lerp(
      state.motion.bandSpread,
      state.motion.targetBandSpread,
      0.06,
    );
  }

  function drawGradientField() {
    const angle = Math.PI * (0.74 + state.motion.angleDrift * 0.05);
    const centerX = state.width * (0.52 + state.motion.shiftX * 0.018);
    const centerY = state.height * (0.49 + state.motion.shiftY * 0.018);
    const radius = Math.max(state.width, state.height) * 1.02;

    const x1 = centerX - Math.cos(angle) * radius;
    const y1 = centerY - Math.sin(angle) * radius;
    const x2 = centerX + Math.cos(angle) * radius;
    const y2 = centerY + Math.sin(angle) * radius;

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, "rgba(13, 151, 235, 0.98)");
    gradient.addColorStop(0.14, "rgba(15, 201, 224, 0.94)");
    gradient.addColorStop(0.34, "rgba(168, 229, 223, 0.78)");
    gradient.addColorStop(0.48, "rgba(242, 235, 222, 0.64)");
    gradient.addColorStop(0.64, "rgba(248, 205, 132, 0.8)");
    gradient.addColorStop(0.82, "rgba(247, 164, 48, 0.9)");
    gradient.addColorStop(1, "rgba(242, 132, 0, 0.98)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    const cyanBloom = ctx.createRadialGradient(
      state.width * (0.2 + state.motion.shiftX * 0.014),
      state.height * (0.2 + state.motion.shiftY * 0.01),
      0,
      state.width * 0.2,
      state.height * 0.2,
      Math.max(state.width, state.height) * 0.52,
    );
    cyanBloom.addColorStop(0, "rgba(8, 206, 235, 0.24)");
    cyanBloom.addColorStop(0.3, "rgba(8, 206, 235, 0.12)");
    cyanBloom.addColorStop(1, "rgba(8, 206, 235, 0)");
    ctx.fillStyle = cyanBloom;
    ctx.fillRect(0, 0, state.width, state.height);

    const orangeBloom = ctx.createRadialGradient(
      state.width * (0.86 + state.motion.shiftX * 0.012),
      state.height * (0.82 + state.motion.shiftY * 0.012),
      0,
      state.width * 0.86,
      state.height * 0.82,
      Math.max(state.width, state.height) * 0.44,
    );
    orangeBloom.addColorStop(0, "rgba(255, 142, 12, 0.28)");
    orangeBloom.addColorStop(0.26, "rgba(255, 142, 12, 0.14)");
    orangeBloom.addColorStop(1, "rgba(255, 142, 12, 0)");
    ctx.fillStyle = orangeBloom;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawBrightBand() {
    ctx.save();
    ctx.translate(
      state.width * (0.52 + state.motion.shiftX * 0.018),
      state.height * (0.49 + state.motion.shiftY * 0.018),
    );
    ctx.rotate(Math.PI * (0.74 + state.motion.angleDrift * 0.05));

    const bandWidth =
      Math.max(state.width, state.height) *
      (0.38 + state.motion.bandSpread * 0.02);
    const bandLength = Math.max(state.width, state.height) * 1.46;

    const gradient = ctx.createLinearGradient(
      0,
      -bandLength * 0.5,
      0,
      bandLength * 0.5,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    gradient.addColorStop(0.16, "rgba(255, 255, 255, 0.05)");
    gradient.addColorStop(0.36, "rgba(255, 247, 232, 0.16)");
    gradient.addColorStop(0.5, "rgba(255, 241, 220, 0.22)");
    gradient.addColorStop(0.64, "rgba(255, 231, 198, 0.14)");
    gradient.addColorStop(0.84, "rgba(255, 255, 255, 0.04)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-bandWidth * 0.5, -bandLength * 0.5, bandWidth, bandLength);

    ctx.restore();
  }

  function drawPowderBand() {
    ctx.save();
    ctx.translate(
      state.width * (0.54 + state.motion.shiftX * 0.018),
      state.height * (0.5 + state.motion.shiftY * 0.016),
    );
    ctx.rotate(Math.PI * (0.76 + state.motion.angleDrift * 0.04));
    ctx.globalAlpha = 0.12;

    const bandWidth = Math.max(state.width, state.height) * 0.2;
    const bandLength = Math.max(state.width, state.height) * 1.56;
    const pattern = ctx.createPattern(state.noiseCanvas, "repeat");

    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(-bandWidth * 0.5, -bandLength * 0.5, bandWidth, bandLength);
    }

    ctx.globalCompositeOperation = "soft-light";
    const haze = ctx.createLinearGradient(
      0,
      -bandLength * 0.5,
      0,
      bandLength * 0.5,
    );
    haze.addColorStop(0, "rgba(255, 255, 255, 0)");
    haze.addColorStop(0.22, "rgba(255, 255, 255, 0.1)");
    haze.addColorStop(0.5, "rgba(255, 255, 255, 0.18)");
    haze.addColorStop(0.78, "rgba(255, 255, 255, 0.08)");
    haze.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(
      -bandWidth * 0.56,
      -bandLength * 0.5,
      bandWidth * 1.12,
      bandLength,
    );

    ctx.restore();
  }

  function drawSoftBlurs() {
    const blurs = [
      {
        x: 0.14,
        y: 0.16,
        rx: 0.26,
        ry: 0.2,
        color: "rgba(112, 219, 255, 0.16)",
      },
      {
        x: 0.42,
        y: 0.58,
        rx: 0.26,
        ry: 0.2,
        color: "rgba(255, 251, 243, 0.12)",
      },
      {
        x: 0.84,
        y: 0.8,
        rx: 0.26,
        ry: 0.22,
        color: "rgba(255, 172, 44, 0.12)",
      },
    ];

    for (const blur of blurs) {
      const gx = state.width * (blur.x + state.motion.shiftX * 0.014);
      const gy = state.height * (blur.y + state.motion.shiftY * 0.01);
      const rx = state.width * blur.rx;
      const ry = state.height * blur.ry;

      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(rx, ry);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, blur.color);
      gradient.addColorStop(0.46, blur.color.replace(/0\.\d+\)$/, "0.06)"));
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  function drawNoiseOverlay() {
    ctx.save();
    ctx.globalAlpha = 0.042;
    const pattern = ctx.createPattern(state.noiseCanvas, "repeat");

    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, state.width, state.height);
    }

    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);

    drawGradientField();
    drawBrightBand();
    drawPowderBand();
    drawSoftBlurs();
    drawNoiseOverlay();
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
  createNoiseCanvas();
  setupOrientation();
  requestAnimationFrame(frame);
})();
