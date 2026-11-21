/* =========================================================
   Grocer demo — camera barcode scanner
   Uses a locally vendored ZXing build (vendor/zxing.min.js).
   Frames are decoded in the page; nothing is uploaded.
   ========================================================= */

(function () {
  const dialog = document.getElementById("scan-dialog");
  if (!dialog) return;

  const video = document.getElementById("scan-video");
  const statusEl = document.getElementById("scan-status");
  const hintEl = document.getElementById("scan-hint");
  const demoBtn = document.getElementById("scan-demo");
  const closeBtn = dialog.querySelector("[data-close-scan]");
  const torchBtn = document.getElementById("scan-torch");
  const switchBtn = document.getElementById("scan-switch");
  const addModeInput = document.getElementById("scan-add-mode");
  const countEl = document.getElementById("scan-count");
  const viewportEl = dialog.querySelector(".scan__viewport");
  const ADD_MODE_KEY = "grocer-scan-add-mode";

  const REAR = {
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  };

  let controls = null;
  let reader = null;
  let onCode = null;
  let demoCode = "";
  let lastCode = "";
  let lastAt = 0;
  let decoderPromise = null;
  let starting = false;
  let switching = false;
  let devices = [];
  let deviceIndex = 0;
  let torchOn = false;
  let watchdog = 0;
  let addMode = false;
  let scannedCount = 0;
  let absentSince = 0;

  function setStatus(text, tone) {
    statusEl.textContent = text;
    if (tone) statusEl.dataset.tone = tone;
    else delete statusEl.dataset.tone;
  }

  function loadDecoder() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!decoderPromise) {
      decoderPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "vendor/zxing.min.js";
        script.async = true;
        script.onload = () => (window.ZXing ? resolve(window.ZXing) : reject(new Error("decoder did not initialise")));
        script.onerror = () => reject(new Error("decoder failed to load"));
        document.head.appendChild(script);
      });
    }
    return decoderPromise;
  }

  function readAddMode() {
    try {
      return localStorage.getItem(ADD_MODE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function saveAddMode(value) {
    try {
      localStorage.setItem(ADD_MODE_KEY, value ? "1" : "0");
    } catch {
      /* preference is optional */
    }
  }

  function updateCount() {
    if (!countEl) return;
    countEl.hidden = !addMode || scannedCount === 0;
    countEl.textContent = `${scannedCount} scanned`;
  }

  function flashAdded() {
    if (!viewportEl) return;
    viewportEl.classList.remove("is-added");
    void viewportEl.offsetWidth;
    viewportEl.classList.add("is-added");
    window.setTimeout(() => viewportEl.classList.remove("is-added"), 700);
  }

  function currentTrack() {
    const stream = video.srcObject;
    if (!stream || typeof stream.getVideoTracks !== "function") return null;
    return stream.getVideoTracks()[0] || null;
  }

  function hideTools() {
    if (torchBtn) {
      torchBtn.hidden = true;
      torchBtn.setAttribute("aria-pressed", "false");
      torchBtn.classList.remove("is-on");
    }
    if (switchBtn) switchBtn.hidden = true;
    torchOn = false;
  }

  async function refreshTools() {
    const track = currentTrack();
    let torchCapable = false;
    if (track && typeof track.getCapabilities === "function") {
      try {
        const capabilities = track.getCapabilities();
        torchCapable = Boolean(capabilities && capabilities.torch);
      } catch {
        torchCapable = false;
      }
    }

    torchOn = false;
    if (torchBtn) {
      torchBtn.hidden = !torchCapable;
      torchBtn.setAttribute("aria-pressed", "false");
      torchBtn.classList.remove("is-on");
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const list = await navigator.mediaDevices.enumerateDevices();
        devices = list.filter((device) => device.kind === "videoinput");
      } else {
        devices = [];
      }
    } catch {
      devices = [];
    }

    if (switchBtn) switchBtn.hidden = devices.length < 2;
    if (devices.length > 1 && dialog.open) {
      hintEl.textContent = addMode
        ? "Scans go straight to your list. Use the buttons for camera or light."
        : "Hold the barcode inside the frame. Use the buttons to switch camera or light the shot.";
    }
  }

  function stopStream() {
    absentSince = 0;
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = 0;
    }
    if (controls) {
      try {
        controls.stop();
      } catch {
        /* already stopped */
      }
      controls = null;
    }
    reader = null;

    const stream = video.srcObject;
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
    hideTools();
  }

  function closeScanner() {
    stopStream();
    if (dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function describeError(error) {
    const name = error && error.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera access was blocked. Allow the camera in your browser, or use a demo barcode.";
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return "No camera was found on this device. Use a demo barcode instead.";
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return "The camera is busy in another app. Close it and try again, or use a demo barcode.";
    }
    return "The camera couldn't start here. Use a demo barcode to try the scanner flow.";
  }

  function handleRead(text, options) {
    const code = String(text || "").trim();
    if (!code) return;
    const now = Date.now();
    const force = Boolean(options && options.force);
    const sameCode = code === lastCode;
    const withinCooldown = now - lastAt < 1500;
    // Track every read, so a barcode held in frame never becomes "new" again.
    lastCode = code;
    lastAt = now;
    // Ignore the same barcode arriving frame after frame, but allow a
    // deliberate second scan once it has left the frame (or from the demo button).
    if (!force && sameCode && withinCooldown) return;

    const outcome = typeof onCode === "function" ? onCode(code, { addToList: addMode }) : null;

    // Unknown barcodes are looked up live, so the handler can answer later.
    if (outcome && typeof outcome.then === "function") {
      setStatus(`Looking up barcode ${code}…`, "info");
      outcome
        .then((result) => applyReadResult(code, result))
        .catch(() => setStatus("That barcode couldn't be looked up. Check your connection.", "warn"));
      return;
    }

    applyReadResult(code, outcome);
  }

  function applyReadResult(code, result) {
    const handled = result === true || Boolean(result && result.handled);

    if (!handled) {
      setStatus((result && result.message) || `Barcode ${code} isn't in the demo catalogue.`, "warn");
      hintEl.textContent = "Try the demo barcode button, or search by product name.";
      return;
    }

    if (result && result.keepScanning) {
      scannedCount += 1;
      updateCount();
      setStatus(result.message || `Added ${code}.`, "ok");
      flashAdded();
      if (typeof navigator.vibrate === "function") navigator.vibrate(30);
      return;
    }

    setStatus(`Read barcode ${code}`, "ok");
    closeScanner();
  }

  async function start(constraints, message) {
    stopStream();
    setStatus(message || "Starting camera…", "info");
    hintEl.textContent = "Your browser may ask for camera permission.";

    // A camera that never delivers frames would otherwise sit on "Starting camera…".
    if (watchdog) clearTimeout(watchdog);
    watchdog = window.setTimeout(() => {
      if (dialog.open && video.videoWidth === 0) {
        setStatus("This camera isn't sending a picture. Try switching camera, or use a demo barcode.", "warn");
        hintEl.textContent = "The camera may be blocked by another app, or the device may not expose it to the browser.";
      }
    }, 12000);

    try {
      const ZXing = await loadDecoder();
      reader = new ZXing.BrowserMultiFormatReader(null, 240);
      controls = await reader.decodeFromConstraints(constraints, video, (result) => {
        if (result) {
          absentSince = 0;
          handleRead(result.getText());
          return;
        }
        // Only forget the last code after it has been continuously absent,
        // so a barcode sitting in frame can't keep re-adding itself.
        if (!lastCode) return;
        if (!absentSince) {
          absentSince = Date.now();
        } else if (Date.now() - absentSince > 1500) {
          lastCode = "";
          absentSince = 0;
        }
      });

      // The dialog may have been closed while the camera was starting.
      if (!dialog.open) {
        stopStream();
        return;
      }

      setStatus("Camera on — line up a barcode.", "ok");
      hintEl.textContent = "Hold the barcode inside the frame until it reads.";
      await refreshTools();
    } catch (error) {
      stopStream();
      setStatus(describeError(error), "warn");
      hintEl.textContent = "You can still use the demo barcode button, or type a barcode in the search box.";
      if (demoBtn) demoBtn.focus();
    }
  }

  async function switchCamera() {
    if (switching || devices.length < 2) return;
    switching = true;
    try {
      deviceIndex = (deviceIndex + 1) % devices.length;
      const device = devices[deviceIndex];
      const label = device.label || `camera ${deviceIndex + 1}`;
      await start(
        {
          video: { deviceId: { exact: device.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        },
        `Switching to ${label}…`
      );
    } finally {
      switching = false;
    }
  }

  async function toggleTorch() {
    const track = currentTrack();
    if (!track || !torchBtn || torchBtn.hidden) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      torchOn = next;
      torchBtn.setAttribute("aria-pressed", String(next));
      torchBtn.classList.toggle("is-on", next);
      setStatus(next ? "Torch on." : "Torch off.", "ok");
    } catch {
      torchOn = false;
      torchBtn.setAttribute("aria-pressed", "false");
      torchBtn.classList.remove("is-on");
      setStatus("This camera won't let the browser turn on its light.", "warn");
    }
  }

  function openScanner(options) {
    onCode = options && options.onCode;
    demoCode = (options && options.demoCode) || "";
    lastCode = "";
    lastAt = 0;
    absentSince = 0;
    deviceIndex = 0;
    devices = [];
    addMode = readAddMode();
    if (addModeInput) addModeInput.checked = addMode;
    scannedCount = 0;
    updateCount();
    hideTools();

    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }

    if (starting) return;
    starting = true;
    start(REAR, "Starting camera…").finally(() => {
      starting = false;
    });
  }

  window.GrocerScan = openScanner;

  closeBtn?.addEventListener("click", closeScanner);
  torchBtn?.addEventListener("click", toggleTorch);
  switchBtn?.addEventListener("click", switchCamera);

  addModeInput?.addEventListener("change", () => {
    addMode = addModeInput.checked;
    saveAddMode(addMode);
    scannedCount = 0;
    updateCount();
    hintEl.textContent = addMode
      ? "Each scan is added straight to your shopping list. Keep scanning, then close when you're done."
      : "Hold the barcode inside the frame until it reads.";
    setStatus(addMode ? "Scan-to-list is on." : "Camera on — line up a barcode.", addMode ? "ok" : "ok");
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeScanner();
  });

  dialog.addEventListener("close", stopStream);
  dialog.addEventListener("cancel", stopStream);

  demoBtn?.addEventListener("click", () => {
    if (!demoCode) return;
    handleRead(demoCode, { force: true });
  });

  // Warm the decoder in the background so the camera starts inside the user's
  // tap — some mobile browsers only allow getUserMedia from a direct gesture.
  const preload = () => {
    loadDecoder().catch(() => {
      /* the scan dialog explains the failure if this happens */
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preload, { timeout: 5000 });
  } else {
    window.setTimeout(preload, 2500);
  }
})();
