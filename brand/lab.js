(() => {
  const root = document.documentElement;
  const body = document.body;
  const modeButtons = [...document.querySelectorAll("[data-set-experience]")];
  const scopeButtons = [...document.querySelectorAll("[data-set-scope]")];
  const runButton = document.querySelector("[data-run-scenario]");
  const motionButton = document.querySelector("[data-toggle-motion]");
  const statusBadge = document.querySelector("[data-lab-status]");
  const statusDot = document.querySelector("[data-lab-status-dot]");
  const progress = document.querySelector("[data-lab-progress]");
  const log = document.querySelector("[data-lab-log]");
  const heroVisual = document.querySelector("[data-hero-visual]");
  const scopePreview = document.querySelector("[data-scope-preview]");
  const modeReadout = document.querySelector("[data-current-experience]");

  const allowedModes = new Set(["calm", "operational", "cinematic"]);
  const allowedScopes = new Set(["cognition", "operator", "governance", "success", "warning", "danger"]);

  let runToken = 0;
  let motionReduced = false;

  const safeStoredMode = () => {
    try {
      const value = localStorage.getItem("comind.brand.experience");
      return allowedModes.has(value) ? value : null;
    } catch {
      return null;
    }
  };

  const storeMode = (mode) => {
    try {
      localStorage.setItem("comind.brand.experience", mode);
    } catch {
      // Storage is optional. The experience remains functional without it.
    }
  };

  const stamp = () =>
    new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());

  const addLog = (message, scope = "cognition") => {
    if (!log) return;
    const row = document.createElement("div");
    row.className = "cm-log-entry";
    row.dataset.comindScope = allowedScopes.has(scope) ? scope : "cognition";

    const time = document.createElement("span");
    time.className = "cm-log-time";
    time.textContent = stamp();

    const text = document.createElement("span");
    text.textContent = message;

    row.append(time, text);
    log.prepend(row);

    while (log.children.length > 12) {
      log.lastElementChild?.remove();
    }
  };

  const setMode = (mode, announce = true) => {
    if (!allowedModes.has(mode)) return;
    root.dataset.comindExperience = mode;
    body.dataset.comindExperience = mode;

    if (modeReadout) {
      modeReadout.textContent = `Mode: ${mode}`;
      modeReadout.dataset.mode = mode;
    }

    if (heroVisual) {
      heroVisual.classList.remove("cm-mode-change");
      void heroVisual.offsetWidth;
      heroVisual.classList.add("cm-mode-change");
    }

    modeButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.setExperience === mode),
      );
    });

    storeMode(mode);
    if (announce) addLog(`Experience mode changed to ${mode}.`, "operator");
  };

  const setScope = (scope) => {
    if (!allowedScopes.has(scope)) return;
    if (scopePreview) scopePreview.dataset.comindScope = scope;
    if (heroVisual) heroVisual.dataset.comindScope = scope;

    scopeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.setScope === scope));
    });

    addLog(`Semantic scope preview changed to ${scope}.`, scope);
  };

  const setStatus = (label, state, scope) => {
    if (statusBadge) {
      statusBadge.textContent = label;
      statusBadge.dataset.comindScope = scope;
    }
    if (statusDot) {
      statusDot.dataset.comindState = state;
      statusDot.closest("[data-comind-scope]")?.setAttribute("data-comind-scope", scope);
    }
  };

  const setProgress = (value) => {
    if (!progress) return;
    const bounded = Math.max(0, Math.min(100, value));
    progress.style.setProperty("--cm-progress", `${bounded}%`);
    progress.setAttribute("aria-valuenow", String(bounded));
  };

  const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const runScenario = async () => {
    const token = ++runToken;
    if (runButton) runButton.disabled = true;

    setStatus("Preparing governed run", "working", "governance");
    setProgress(12);
    addLog("Run accepted into the visual simulation queue.", "governance");
    await delay(650);
    if (token !== runToken) return;

    setStatus("Cognition active", "working", "cognition");
    setProgress(36);
    addLog("Cognitive field entered active processing state.", "cognition");
    await delay(850);
    if (token !== runToken) return;

    setProgress(62);
    addLog("Evidence and provenance channels synchronized.", "governance");
    await delay(850);
    if (token !== runToken) return;

    setStatus("Human review point", "working", "operator");
    setProgress(78);
    addLog("Operator decision boundary surfaced.", "operator");
    await delay(900);
    if (token !== runToken) return;

    setStatus("Verified and settled", "idle", "success");
    setProgress(100);
    addLog("Simulation completed and returned to a stable state.", "success");

    if (heroVisual) {
      heroVisual.classList.remove("cm-motion-settle");
      void heroVisual.offsetWidth;
      heroVisual.classList.add("cm-motion-settle");
    }

    await delay(650);
    if (runButton) runButton.disabled = false;
  };

  const toggleMotion = () => {
    motionReduced = !motionReduced;
    root.dataset.comindMotionOverride = motionReduced ? "reduce" : "full";

    if (motionButton) {
      motionButton.setAttribute("aria-pressed", String(motionReduced));
      motionButton.textContent = motionReduced ? "Restore motion" : "Reduce motion";
    }

    addLog(
      motionReduced ? "Manual reduced-motion preview enabled." : "Manual reduced-motion preview disabled.",
      "operator",
    );
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.setExperience));
  });

  scopeButtons.forEach((button) => {
    button.addEventListener("click", () => setScope(button.dataset.setScope));
  });

  runButton?.addEventListener("click", runScenario);
  motionButton?.addEventListener("click", toggleMotion);

  const initialMode = safeStoredMode() || root.dataset.comindExperience || "operational";
  setMode(initialMode, false);
  setScope("cognition");
  setProgress(0);
  setStatus("Ready for simulation", "idle", "cognition");
  addLog("CoMind Experience Lab initialized.", "cognition");
})();
