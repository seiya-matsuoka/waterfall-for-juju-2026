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
      image.data[i + 3] = 20;
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
      state.motion.targetAngleDrift + dxNorm * 0.76 - dyNorm * 0.28,
      -1,
      1,
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
    }

    const idleX =
      Math.sin(state.time * 0.24) * 0.26 + Math.cos(state.time * 0.1) * 0.08;
    const idleY =
      Math.cos(state.time * 0.19) * 0.16 + Math.sin(state.time * 0.13) * 0.05;

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
      state.motion.targetAngleDrift + state.motion.sensorX * 0.38,
      -1.2,
      1.2,
    );

    state.motion.shiftX = lerp(state.motion.shiftX, shiftX, 0.065);
    state.motion.shiftY = lerp(state.motion.shiftY, shiftY, 0.065);
    state.motion.angleDrift = lerp(state.motion.angleDrift, angleDrift, 0.06);
  }

  function drawGradientField() {
    const angle = Math.PI * (0.74 + state.motion.angleDrift * 0.05);
    const centerX = state.width * (0.52 + state.motion.shiftX * 0.018);
    const centerY = state.height * (0.49 + state.motion.shiftY * 0.018);
    const radius = Math.max(state.width, state.height) * 1.06;

    const x1 = centerX - Math.cos(angle) * radius;
    const y1 = centerY - Math.sin(angle) * radius;
    const x2 = centerX + Math.cos(angle) * radius;
    const y2 = centerY + Math.sin(angle) * radius;

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, "rgba(0, 148, 238, 1)");
    gradient.addColorStop(0.12, "rgba(0, 206, 228, 0.98)");
    gradient.addColorStop(0.34, "rgba(168, 236, 226, 0.8)");
    gradient.addColorStop(0.56, "rgba(240, 232, 219, 0.66)");
    gradient.addColorStop(0.78, "rgba(248, 193, 92, 0.86)");
    gradient.addColorStop(1, "rgba(240, 134, 0, 1)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    const cyanBloom = ctx.createRadialGradient(
      state.width * (0.18 + state.motion.shiftX * 0.014),
      state.height * (0.18 + state.motion.shiftY * 0.01),
      0,
      state.width * 0.18,
      state.height * 0.18,
      Math.max(state.width, state.height) * 0.54,
    );
    cyanBloom.addColorStop(0, "rgba(0, 196, 236, 0.26)");
    cyanBloom.addColorStop(0.28, "rgba(0, 196, 236, 0.12)");
    cyanBloom.addColorStop(1, "rgba(0, 196, 236, 0)");
    ctx.fillStyle = cyanBloom;
    ctx.fillRect(0, 0, state.width, state.height);

    const orangeBloom = ctx.createRadialGradient(
      state.width * (0.88 + state.motion.shiftX * 0.012),
      state.height * (0.84 + state.motion.shiftY * 0.012),
      0,
      state.width * 0.88,
      state.height * 0.84,
      Math.max(state.width, state.height) * 0.46,
    );
    orangeBloom.addColorStop(0, "rgba(255, 142, 0, 0.32)");
    orangeBloom.addColorStop(0.24, "rgba(255, 142, 0, 0.15)");
    orangeBloom.addColorStop(1, "rgba(255, 142, 0, 0)");
    ctx.fillStyle = orangeBloom;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawSoftVeils() {
    const veils = [
      {
        x: 0.18,
        y: 0.18,
        rx: 0.34,
        ry: 0.24,
        color: "rgba(112, 224, 255, 0.12)",
      },
      {
        x: 0.52,
        y: 0.5,
        rx: 0.42,
        ry: 0.28,
        color: "rgba(255, 247, 232, 0.08)",
      },
      {
        x: 0.84,
        y: 0.82,
        rx: 0.34,
        ry: 0.24,
        color: "rgba(255, 176, 40, 0.1)",
      },
    ];

    for (const veil of veils) {
      const gx = state.width * (veil.x + state.motion.shiftX * 0.012);
      const gy = state.height * (veil.y + state.motion.shiftY * 0.01);
      const rx = state.width * veil.rx;
      const ry = state.height * veil.ry;

      ctx.save();
      ctx.translate(gx, gy);
      ctx.scale(rx, ry);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, veil.color);
      gradient.addColorStop(0.48, veil.color.replace(/0\.\d+\)$/, "0.04)"));
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  function drawPowderTexture() {
    ctx.save();
    ctx.globalAlpha = 0.038;
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
    drawSoftVeils();
    drawPowderTexture();
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
