/* ==========================================================================
   BridgeGuard — Structural Health Monitoring Demo
   All sensor data below is SIMULATED. Nothing in this file reads from,
   or connects to, any real sensor hardware or live bridge.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * CONFIG — sensor definitions & scenario profiles
   * ------------------------------------------------------------------ */
  const SENSORS = [
    { id: "ACC-DECK-01",   name: "Deck Vibration / Acceleration", type: "vibration", unit: "g",  baseline: [0.018, 0.026], weight: 16, decimals: 3 },
    { id: "TILT-DECK-02",  name: "Deck Tilt",                     type: "tilt",      unit: "°",  baseline: [0.035, 0.055], weight: 10, decimals: 3 },
    { id: "TILT-PIER-03",  name: "Pier Tilt",                     type: "tilt",      unit: "°",  baseline: [0.035, 0.065], weight: 18, decimals: 3 },
    { id: "LOAD-GIRDER-04",name: "Girder Load",                   type: "load",      unit: "kN", baseline: [16, 28],       weight: 12, decimals: 1 },
    { id: "TEMP-DECK-05",  name: "Deck Temperature",               type: "temperature", unit: "°C", baseline: [29, 32],   weight: 4,  decimals: 1 },
  ];

  const CHART_SENSOR_IDS = ["ACC-DECK-01", "TILT-PIER-03", "LOAD-GIRDER-04"];
  const CHART_COLORS = { "ACC-DECK-01": "#35d7d1", "TILT-PIER-03": "#f2b83d", "LOAD-GIRDER-04": "#7fb8ff" };
  const HISTORY_LEN = 44;

  function mid(range) { return (range[0] + range[1]) / 2; }

  // Target profiles per scenario. `duration` (ms) auto-reverts to normal (used by "heavy").
  const SCENARIOS = {
    normal: {
      label: "Normal Operation",
      targets: {
        "ACC-DECK-01": 0.022, "TILT-DECK-02": 0.045, "TILT-PIER-03": 0.05,
        "LOAD-GIRDER-04": 22, "TEMP-DECK-05": 30.5,
      },
      offline: null,
    },
    heavy: {
      label: "Heavy Vehicle Event",
      targets: {
        "ACC-DECK-01": 0.04, "TILT-DECK-02": 0.075, "TILT-PIER-03": 0.06,
        "LOAD-GIRDER-04": 50, "TEMP-DECK-05": 30.8,
      },
      offline: null,
      duration: 14000,
      revertTo: "normal",
    },
    vibration: {
      label: "High Vibration",
      targets: {
        "ACC-DECK-01": 0.12, "TILT-DECK-02": 0.05, "TILT-PIER-03": 0.052,
        "LOAD-GIRDER-04": 24, "TEMP-DECK-05": 30.5,
      },
      offline: null,
    },
    tilt: {
      label: "Pier Tilt",
      targets: {
        "ACC-DECK-01": 0.024, "TILT-DECK-02": 0.05, "TILT-PIER-03": 0.16,
        "LOAD-GIRDER-04": 23, "TEMP-DECK-05": 30.4,
      },
      offline: null,
    },
    anomaly: {
      label: "Structural Anomaly",
      targets: {
        "ACC-DECK-01": 0.07, "TILT-DECK-02": 0.095, "TILT-PIER-03": 0.11,
        "LOAD-GIRDER-04": 46, "TEMP-DECK-05": 31,
      },
      offline: null,
    },
    sensorfail: {
      label: "Sensor Failure",
      targets: {
        "ACC-DECK-01": 0.022, "TILT-DECK-02": 0.045, "TILT-PIER-03": 0.05,
        "LOAD-GIRDER-04": 22, "TEMP-DECK-05": 30.5,
      },
      offline: "ACC-DECK-01",
    },
    critical: {
      label: "Critical Event",
      targets: {
        "ACC-DECK-01": 0.19, "TILT-DECK-02": 0.14, "TILT-PIER-03": 0.17,
        "LOAD-GIRDER-04": 72, "TEMP-DECK-05": 45,
      },
      offline: null,
    },
  };

  const MATERIAL_RECORDS = [
    { test: "Rebound Hammer", location: "Deck slab – midspan", result: "32 N/mm² (avg. surface hardness)", status: "good" },
    { test: "Rebound Hammer", location: "Pier cap – P2",       result: "27 N/mm² (avg. surface hardness)", status: "watch" },
    { test: "UPV (Ultrasonic Pulse Velocity)", location: "Deck slab – midspan", result: "4.1 km/s — good quality concrete", status: "good" },
    { test: "UPV (Ultrasonic Pulse Velocity)", location: "Pier P2 – base",      result: "3.3 km/s — medium quality, voids possible", status: "watch" },
    { test: "Corrosion Assessment", location: "Rebar, deck soffit",  result: "-180 mV — low probability of corrosion", status: "good" },
    { test: "Corrosion Assessment", location: "Rebar, pier P2 base", result: "-340 mV — active corrosion likely", status: "attention" },
    { test: "Visual Inspection",    location: "Expansion joints",    result: "Minor debris accumulation, no structural cracking observed", status: "good" },
    { test: "Visual Inspection",    location: "Pier P2 surface",     result: "Hairline cracking and efflorescence noted", status: "watch" },
  ];

  /* ------------------------------------------------------------------ *
   * STATE
   * ------------------------------------------------------------------ */
  const state = {
    scenario: "normal",
    sensors: {},
    activeAlerts: [],
    timeline: [],
    healthScore: 98,
    prevHealthScore: 98,
    status: "NORMAL", // NORMAL | WARNING | INSPECTION REQUIRED
    prevStatus: "NORMAL",
    presentation: false,
    revertTimer: null,
    selectedBridgeSensor: null,
    loggedActive: new Set(), // condition keys currently logged in timeline, to avoid duplicate spam
  };

  SENSORS.forEach((cfg) => {
    state.sensors[cfg.id] = {
      cfg,
      value: mid(cfg.baseline),
      status: "online", // online | offline
      confidence: 97,
      history: Array(HISTORY_LEN).fill(mid(cfg.baseline)),
    };
  });

  /* ------------------------------------------------------------------ *
   * UTILITIES
   * ------------------------------------------------------------------ */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function fmt(v, d) { return Number(v).toFixed(d); }
  function nowTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour12: false });
  }
  function nowStamp() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0").slice(0, 2);
  }

  // Deviation ratio: 0 = within baseline. >0 = fraction of range-width outside baseline.
  function deviationOf(sensor) {
    const [lo, hi] = sensor.cfg.baseline;
    const width = hi - lo;
    if (sensor.value < lo) return (lo - sensor.value) / width;
    if (sensor.value > hi) return (sensor.value - hi) / width;
    return 0;
  }

  function severityOf(dev) {
    if (dev > 1.4) return "critical";
    if (dev > 0.25) return "warning";
    return "normal";
  }

  function logTimeline(level, title, desc) {
    state.timeline.unshift({ time: nowTime(), level, title, desc });
    if (state.timeline.length > 60) state.timeline.pop();
  }

  function logOnce(key, level, title, desc) {
    if (!state.loggedActive.has(key)) {
      state.loggedActive.add(key);
      logTimeline(level, title, desc);
    }
  }
  function clearLogged(key) { state.loggedActive.delete(key); }

  /* ------------------------------------------------------------------ *
   * SCENARIO CONTROL
   * ------------------------------------------------------------------ */
  function applyScenario(name, opts) {
    opts = opts || {};
    const profile = SCENARIOS[name];
    if (!profile) return;

    if (state.revertTimer) { clearTimeout(state.revertTimer); state.revertTimer = null; }

    state.scenario = name;

    // reset all sensors back online unless the profile specifies one offline
    SENSORS.forEach((cfg) => {
      const s = state.sensors[cfg.id];
      const wasOffline = s.status === "offline";
      s.status = "online";
      if (wasOffline) clearLogged("offline:" + cfg.id);
    });

    if (profile.offline) {
      const s = state.sensors[profile.offline];
      s.status = "offline";
    }

    state._targets = profile.targets;

    if (!opts.silent) {
      logTimeline("info", "Scenario changed: " + profile.label,
        "Operator selected \u201c" + profile.label + "\u201d in the scenario simulator.");
    }

    if (profile.duration && profile.revertTo) {
      state.revertTimer = setTimeout(() => {
        applyScenario(profile.revertTo);
        logTimeline("info", "Heavy vehicle event cleared", "Sensor readings returning to baseline after the temporary load event.");
        renderScenarioButtons();
      }, profile.duration);
    }

    renderScenarioButtons();
  }

  function renderScenarioButtons() {
    document.querySelectorAll(".scn-btn").forEach((btn) => {
      btn.classList.toggle("active-scn", btn.dataset.scenario === state.scenario);
    });
    const label = SCENARIOS[state.scenario] ? SCENARIOS[state.scenario].label : state.scenario;
    document.getElementById("activeScenarioLabel").textContent = label;
  }

  /* ------------------------------------------------------------------ *
   * SIMULATION TICK
   * ------------------------------------------------------------------ */
  function tick() {
    const targets = state._targets || SCENARIOS.normal.targets;

    SENSORS.forEach((cfg) => {
      const s = state.sensors[cfg.id];
      const [lo, hi] = cfg.baseline;
      const noiseScale = (hi - lo) * 0.06;

      if (s.status === "offline") {
        // Do NOT silently substitute — value becomes an explicit estimate.
        if (s.estimated === undefined) s.estimated = mid(cfg.baseline);
        s.estimated += rand(-noiseScale, noiseScale) * 0.4;
        s.estimated = clamp(s.estimated, lo - (hi - lo) * 0.3, hi + (hi - lo) * 0.3);
        s.confidence = clamp(72 + rand(-4, 4), 60, 78);
        s.history.push(s.estimated);
      } else {
        const target = targets[cfg.id] !== undefined ? targets[cfg.id] : mid(cfg.baseline);
        s.value += (target - s.value) * 0.28 + rand(-noiseScale, noiseScale);
        s.value = clamp(s.value, 0, target * 2.6 + (hi - lo));
        const dev = deviationOf(s);
        s.confidence = clamp(99 - dev * 14 + rand(-1.5, 1.5), 82, 99.5);
        s.history.push(s.value);
      }
      if (s.history.length > HISTORY_LEN) s.history.shift();
    });

    computeHealth();
    renderAll();
  }

  /* ------------------------------------------------------------------ *
   * HEALTH SCORE + CLASSIFICATION
   * ------------------------------------------------------------------ */
  function computeHealth() {
    let penalty = 0;
    let deviatingCount = 0;
    let maxDev = 0;
    let offlineSensor = null;

    SENSORS.forEach((cfg) => {
      const s = state.sensors[cfg.id];
      if (s.status === "offline") {
        offlineSensor = s;
        penalty += 6; // confidence / coverage penalty, not a structural one
        return;
      }
      const dev = deviationOf(s);
      maxDev = Math.max(maxDev, dev);
      if (dev > 0.12) deviatingCount++;
      penalty += Math.min(dev, 1) * cfg.weight;
    });

    let correlatedBonus = 0;
    if (deviatingCount >= 4) correlatedBonus = 10;
    else if (deviatingCount === 3) correlatedBonus = 5;
    else if (deviatingCount === 2) correlatedBonus = 2;

    let score = clamp(100 - penalty - correlatedBonus, 2, 100);
    state.prevHealthScore = state.healthScore;
    state.healthScore = Math.round(score);

    // classification for anomaly fusion logic
    let classification = "normal";
    if (offlineSensor && deviatingCount === 0) classification = "fault";
    else if (deviatingCount >= 3) classification = "corroborated";
    else if (deviatingCount >= 1) classification = "localized";
    state.classification = classification;
    state.deviatingCount = deviatingCount;
    state.offlineSensor = offlineSensor;

    // status thresholds
    state.prevStatus = state.status;
    if (state.healthScore >= 85 && classification !== "corroborated") state.status = "NORMAL";
    else if (state.healthScore >= 55) state.status = "WARNING";
    else state.status = "INSPECTION REQUIRED";

    if (classification === "corroborated" && state.healthScore >= 55) state.status = "WARNING";
    if (classification === "corroborated" && state.healthScore < 70) state.status = "INSPECTION REQUIRED";

    // transition logging
    if (state.status !== state.prevStatus) {
      const lvl = state.status === "NORMAL" ? "info" : (state.status === "WARNING" ? "warning" : "critical");
      logTimeline(lvl, "Structural state changed to " + state.status,
        "Health score " + state.healthScore + "/100. Classification: " + describeClassification(classification) + ".");
    }

    // condition-based active alerts + timeline (logged once per condition)
    state.activeAlerts = [];

    if (offlineSensor) {
      logOnce("offline:" + offlineSensor.cfg.id, "warning",
        offlineSensor.cfg.id + " offline — estimated value in use",
        "Sensor dropped off the network. Recommend physical inspection of " + offlineSensor.cfg.id + ".");
      state.activeAlerts.push({
        level: "warning",
        title: offlineSensor.cfg.id + " OFFLINE — using estimated value",
        meta: "Confidence " + Math.round(offlineSensor.confidence) + "% · Recommend physical inspection",
      });
    } else {
      clearLogged("offline:none");
    }

    SENSORS.forEach((cfg) => {
      const s = state.sensors[cfg.id];
      if (s.status === "offline") return;
      const dev = deviationOf(s);
      const sev = severityOf(dev);
      const key = "dev:" + cfg.id;
      if (sev !== "normal") {
        logOnce(key, sev, cfg.id + " reading outside baseline",
          cfg.name + " deviated from its baseline range (" + fmt(s.value, cfg.decimals) + " " + cfg.unit + ").");
        state.activeAlerts.push({
          level: sev,
          title: cfg.id + " outside baseline range",
          meta: cfg.name + " · " + fmt(s.value, cfg.decimals) + " " + cfg.unit + " · baseline " + cfg.baseline[0] + "–" + cfg.baseline[1] + " " + cfg.unit,
        });
      } else {
        clearLogged(key);
      }
    });

    if (classification === "corroborated") {
      logOnce("corroborated", "critical", "Correlated deviation across multiple sensors",
        deviatingCount + " independent sensors are deviating together — treated as a possible structural event, not a single sensor fault.");
      state.activeAlerts.unshift({
        level: "critical",
        title: "Possible structural event — " + deviatingCount + " sensors corroborate",
        meta: "Anomaly-fusion logic: correlated deviation, inspection prioritisation recommended",
      });
    } else {
      clearLogged("corroborated");
    }

    if (state.status === "INSPECTION REQUIRED") {
      logOnce("inspection", "critical", "Inspection required",
        "Health score fell to " + state.healthScore + "/100. Field inspection is recommended as a priority.");
    } else {
      clearLogged("inspection");
    }
  }

  function describeClassification(c) {
    switch (c) {
      case "fault": return "isolated sensor fault";
      case "corroborated": return "possible structural event (corroborated)";
      case "localized": return "single-sensor deviation";
      default: return "no anomaly";
    }
  }

  /* ------------------------------------------------------------------ *
   * RENDERING
   * ------------------------------------------------------------------ */
  function renderAll() {
    renderTopStatus();
    renderHealthCard();
    renderPipeline();
    renderSensorCards();
    renderChart();
    renderActiveAlerts();
    renderBridgeView();
    renderAnalytics();
    renderTimeline();
    renderNavCount();
  }

  function renderTopStatus() {
    const chip = document.getElementById("statusChip");
    chip.classList.remove("warning", "critical");
    if (state.status === "WARNING") chip.classList.add("warning");
    if (state.status === "INSPECTION REQUIRED") chip.classList.add("critical");
    document.getElementById("statusLabel").textContent = state.status;
  }

  function renderHealthCard() {
    const score = state.healthScore;
    document.getElementById("healthScoreNum").textContent = score;
    document.getElementById("healthStatusText").textContent = state.status;

    const bar = document.getElementById("healthBarFill");
    bar.style.width = score + "%";
    bar.style.background = score >= 85 ? "#2fa8a0" : score >= 55 ? "#c9952c" : "#c0453f";
    const numEl = document.getElementById("healthScoreNum");
    numEl.style.color = score >= 85 ? "#d8e3e8" : score >= 55 ? "#d9ab4a" : "#d96a63";

    const trendChip = document.getElementById("healthTrendChip");
    const delta = state.healthScore - state.prevHealthScore;
    trendChip.textContent = delta > 0.4 ? "improving" : delta < -0.4 ? "declining" : "stable";

    const descMap = {
      NORMAL: "All monitored parameters are within expected baseline ranges. No anomalies detected across the sensor network.",
      WARNING: "One or more parameters have moved outside baseline range. Continued monitoring is recommended.",
      "INSPECTION REQUIRED": "Multiple indicators are abnormal or correlated deviation has been detected. Field inspection is recommended as a priority.",
    };
    document.getElementById("healthDesc").textContent = descMap[state.status];

    const onlineCount = SENSORS.filter((c) => state.sensors[c.id].status === "online").length;
    const avgConf = SENSORS.reduce((sum, c) => sum + state.sensors[c.id].confidence, 0) / SENSORS.length;
    document.getElementById("systemConfidence").textContent = Math.round(avgConf) + "%";
    document.getElementById("sensorsOnlineChip").textContent = onlineCount + " / " + SENSORS.length + " online";
  }

  const PIPE_STAGES_MAIN = ["sensors", "esp32", "baseline", "fusion", "anomaly", "alert"];
  function renderPipeline() {
    ["pipelineFlow"].forEach((flowId) => {
      const nodes = document.querySelectorAll("#" + flowId + " .pipe-node");
      nodes.forEach((n) => n.classList.remove("active", "flagged", "critical-node"));
    });
    let activeStages = ["sensors", "esp32", "baseline", "fusion"];
    if (state.classification !== "normal") activeStages.push("anomaly");
    if (state.status !== "NORMAL") activeStages.push("alert");

    document.querySelectorAll("#pipelineFlow .pipe-node").forEach((node) => {
      const stage = node.dataset.stage;
      if (activeStages.includes(stage)) {
        node.classList.add("active");
        if (stage === "anomaly" || stage === "alert") {
          node.classList.add(state.status === "INSPECTION REQUIRED" ? "critical-node" : "flagged");
          node.classList.remove("active");
        }
      }
    });
  }

  function renderSensorCards() {
    const wrap = document.getElementById("sensorCards");
    wrap.innerHTML = "";
    SENSORS.forEach((cfg) => {
      const s = state.sensors[cfg.id];
      const offline = s.status === "offline";
      const dev = offline ? 0 : deviationOf(s);
      const sev = offline ? "offline" : severityOf(dev);

      const card = document.createElement("div");
      card.className = "sensor-card" + (sev === "warning" ? " warn" : sev === "critical" ? " critical" : "") + (offline ? " offline" : "");

      const displayVal = offline ? s.estimated : s.value;

      card.innerHTML =
        '<div class="sc-top">' +
          '<div><div class="sc-id">' + cfg.id + '</div><div class="sc-type">' + cfg.name + '</div></div>' +
          '<div class="sc-dot ' + (offline ? "offline" : sev === "warning" ? "warn" : sev === "critical" ? "critical" : "") + '"></div>' +
        '</div>' +
        '<div><span class="sc-value">' + fmt(displayVal, cfg.decimals) + '</span><span class="sc-unit">' + cfg.unit + '</span></div>' +
        '<div class="sc-baseline">baseline ' + cfg.baseline[0] + '–' + cfg.baseline[1] + ' ' + cfg.unit + '</div>' +
        (offline
          ? '<span class="sc-tag offline-tag">OFFLINE</span> <span class="sc-tag estimated">ESTIMATED</span>' +
            '<div class="sc-confidence">Confidence: ' + Math.round(s.confidence) + '%</div>' +
            '<div class="sc-recommend">Recommend physical inspection of ' + cfg.id + '.</div>'
          : '<div class="sc-confidence">Confidence: ' + Math.round(s.confidence) + '%</div>');

      wrap.appendChild(card);
    });
  }

  /* ---- Canvas line chart ---- */
  const chartCanvas = document.getElementById("liveChart");
  const ctx = chartCanvas.getContext("2d");

  function renderChartLegend() {
    const legend = document.getElementById("chartLegend");
    legend.innerHTML = CHART_SENSOR_IDS.map((id) =>
      '<span class="legend-item"><span class="legend-swatch" style="background:' + CHART_COLORS[id] + '"></span>' + id + '</span>'
    ).join("");
  }

  function renderChart() {
    const w = chartCanvas.width, h = chartCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    CHART_SENSOR_IDS.forEach((id) => {
      const s = state.sensors[id];
      const [lo, hi] = s.cfg.baseline;
      const range = (hi - lo) * 4 || 1; // generous scale so spikes are visible
      const midv = mid(s.cfg.baseline);

      ctx.beginPath();
      ctx.strokeStyle = CHART_COLORS[id];
      ctx.lineWidth = 2;
      s.history.forEach((v, i) => {
        const x = (i / (HISTORY_LEN - 1)) * w;
        const norm = clamp(0.5 + (v - midv) / range, 0.04, 0.96);
        const y = h - norm * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function renderActiveAlerts() {
    const list = document.getElementById("activeAlertList");
    document.getElementById("activeAlertCount").textContent = state.activeAlerts.length + " active";
    if (state.activeAlerts.length === 0) {
      list.innerHTML = '<div class="empty-state">No active alerts. Bridge is operating within baseline parameters.</div>';
      return;
    }
    list.innerHTML = state.activeAlerts.map((a) =>
      '<div class="alert-item level-' + a.level + '"><div class="alert-title">' + a.title + '</div><div class="alert-meta">' + a.meta + '</div></div>'
    ).join("");
  }

  function renderNavCount() {
    const el = document.getElementById("navAlertCount");
    const n = state.activeAlerts.length;
    el.textContent = n;
    el.classList.toggle("zero", n === 0);
  }

  /* ---- Bridge view ---- */
  function renderBridgeView() {
    document.querySelectorAll(".sensor-marker").forEach((m) => {
      const id = m.dataset.sensor;
      const s = state.sensors[id];
      m.classList.remove("warn", "critical", "offline", "selected");
      if (s.status === "offline") m.classList.add("offline");
      else {
        const dev = deviationOf(s);
        const sev = severityOf(dev);
        if (sev !== "normal") m.classList.add(sev);
      }
      if (state.selectedBridgeSensor === id) m.classList.add("selected");
    });

    if (state.selectedBridgeSensor) renderBridgeSensorPanel(state.selectedBridgeSensor);
  }

  function renderBridgeSensorPanel(id) {
    const cfg = SENSORS.find((c) => c.id === id);
    const s = state.sensors[id];
    const panel = document.getElementById("bridgeSensorPanel");
    const offline = s.status === "offline";
    const val = offline ? s.estimated : s.value;
    const dev = offline ? 0 : deviationOf(s);
    const sev = offline ? "offline" : severityOf(dev);

    panel.innerHTML =
      '<div class="bsp-id">' + cfg.id + '</div>' +
      '<div class="bsp-name">' + cfg.name + '</div>' +
      '<div class="bsp-value" style="color:' + (sev === "critical" || sev === "offline" ? "#d96a63" : sev === "warning" ? "#d9ab4a" : "#57bdb5") + '">' +
        fmt(val, cfg.decimals) + '<span style="font-size:14px;color:#7e8c98"> ' + cfg.unit + '</span></div>' +
      '<div class="bsp-row"><span>Status</span><span>' + (offline ? "OFFLINE — estimated" : sev.toUpperCase()) + '</span></div>' +
      '<div class="bsp-row"><span>Baseline range</span><span>' + cfg.baseline[0] + '–' + cfg.baseline[1] + ' ' + cfg.unit + '</span></div>' +
      '<div class="bsp-row"><span>Confidence</span><span>' + Math.round(s.confidence) + '%</span></div>' +
      (offline ? '<div class="bsp-row"><span>Recommendation</span><span>Physical inspection</span></div>' : "");
  }

  /* ---- Analytics ---- */
  function renderAnalytics() {
    const devWrap = document.getElementById("deviationBars");
    const confWrap = document.getElementById("confidenceBars");
    devWrap.innerHTML = "";
    confWrap.innerHTML = "";

    SENSORS.forEach((cfg) => {
      const s = state.sensors[cfg.id];
      const dev = s.status === "offline" ? 0 : deviationOf(s);
      const pct = clamp(dev * 100, 0, 100);
      const sev = severityOf(dev);
      const row = document.createElement("div");
      row.className = "dev-row";
      row.innerHTML =
        '<div class="dev-label">' + cfg.id + '</div>' +
        '<div class="dev-track"><div class="dev-fill ' + (sev === "warning" ? "warn" : sev === "critical" ? "critical" : "") + '" style="width:' + Math.max(pct, 2) + '%"></div></div>' +
        '<div class="dev-pct">' + Math.round(pct) + '%</div>';
      devWrap.appendChild(row);

      const crow = document.createElement("div");
      crow.className = "dev-row";
      const conf = s.status === "offline" ? s.confidence : s.confidence;
      crow.innerHTML =
        '<div class="dev-label">' + cfg.id + '</div>' +
        '<div class="dev-track"><div class="dev-fill" style="width:' + conf + '%; background:' + (s.status === "offline" ? "#c9952c" : "#2fa8a0") + '"></div></div>' +
        '<div class="dev-pct">' + Math.round(conf) + '%</div>';
      confWrap.appendChild(crow);
    });

    // fusion flow highlight (mirrors main pipeline, mapped ids)
    const map = { "a-sensors": "sensors", "a-esp32": "esp32", "a-baseline": "baseline", "a-fusion": "fusion", "a-anomaly": "anomaly", "a-alert": "alert" };
    let activeStages = ["sensors", "esp32", "baseline", "fusion"];
    if (state.classification !== "normal") activeStages.push("anomaly");
    if (state.status !== "NORMAL") activeStages.push("alert");
    document.querySelectorAll(".fusion-flow .pipe-node").forEach((node) => {
      const mapped = map[node.dataset.stage];
      node.classList.remove("active", "flagged", "critical-node");
      if (activeStages.includes(mapped)) {
        if (mapped === "anomaly" || mapped === "alert") node.classList.add(state.status === "INSPECTION REQUIRED" ? "critical-node" : "flagged");
        else node.classList.add("active");
      }
    });

    const fc = document.getElementById("fusionClassification");
    const c = state.classification;
    let tagClass = "normal", tagText = "No anomaly", desc = "All sensors are reporting within their baseline ranges. Fusion logic finds no correlated deviation.";
    if (c === "fault") { tagClass = "fault"; tagText = "Sensor fault (isolated)"; desc = (state.offlineSensor ? state.offlineSensor.cfg.id : "A sensor") + " is offline while every other sensor remains within baseline — classified as a hardware fault, not a structural signal. Field inspection of the sensor is recommended."; }
    else if (c === "localized") { tagClass = "fault"; tagText = "Single-sensor deviation"; desc = "One sensor is outside baseline while the rest of the network is normal. Continued monitoring is recommended before escalating."; }
    else if (c === "corroborated") { tagClass = "corroborated"; tagText = "Possible structural event"; desc = state.deviatingCount + " independent sensors are deviating from baseline together. Fusion logic treats this as a corroborated signal and prioritises inspection."; }
    fc.innerHTML = '<span class="fc-tag ' + tagClass + '">' + tagText + '</span><div class="fc-desc">' + desc + '</div>';
  }

  /* ---- Timeline ---- */
  function renderTimeline() {
    const wrap = document.getElementById("timelineList");
    if (state.timeline.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No events recorded yet.</div>';
      return;
    }
    wrap.innerHTML = state.timeline.map((ev) =>
      '<div class="tl-item"><div class="tl-dot-col"><div class="tl-dot level-' + ev.level + '"></div><div class="tl-line"></div></div>' +
      '<div class="tl-body"><div class="tl-time">' + ev.time + '</div><div class="tl-title">' + ev.title + '</div><div class="tl-desc">' + ev.desc + '</div></div></div>'
    ).join("");
  }

  /* ---- Material Health table (static demo content) ---- */
  function renderMaterialTable() {
    const table = document.getElementById("materialTable");
    let html = "<thead><tr><th>Test</th><th>Location</th><th>Result (demo)</th><th>Status</th></tr></thead><tbody>";
    MATERIAL_RECORDS.forEach((r) => {
      html += "<tr><td>" + r.test + "</td><td>" + r.location + "</td><td>" + r.result + "</td>" +
        '<td><span class="mt-status ' + r.status + '">' + r.status.toUpperCase() + "</span></td></tr>";
    });
    html += "</tbody>";
    table.innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * TABS / NAVIGATION
   * ------------------------------------------------------------------ */
  function switchTab(tab) {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
  }

  /* ------------------------------------------------------------------ *
   * EXPORT
   * ------------------------------------------------------------------ */
  function exportDemoJson() {
    const payload = {
      generatedAt: new Date().toISOString(),
      note: "SIMULATED DATA — FOR DEMONSTRATION ONLY. Not a real structural monitoring record.",
      bridge: { id: "KL-001", name: "River Link Bridge" },
      scenario: state.scenario,
      healthScore: state.healthScore,
      status: state.status,
      classification: state.classification,
      sensors: SENSORS.map((cfg) => {
        const s = state.sensors[cfg.id];
        return {
          id: cfg.id, name: cfg.name, unit: cfg.unit, baseline: cfg.baseline,
          status: s.status,
          value: s.status === "offline" ? null : Number(fmt(s.value, cfg.decimals)),
          estimatedValue: s.status === "offline" ? Number(fmt(s.estimated, cfg.decimals)) : null,
          confidence: Math.round(s.confidence),
        };
      }),
      activeAlerts: state.activeAlerts,
      timeline: state.timeline,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bridgeguard_demo_export_" + Date.now() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------------------------ *
   * INIT / EVENTS
   * ------------------------------------------------------------------ */
  function initEvents() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.querySelectorAll(".scn-btn").forEach((btn) => {
      btn.addEventListener("click", () => applyScenario(btn.dataset.scenario));
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      state.timeline = [];
      state.loggedActive.clear();
      applyScenario("normal", { silent: true });
      logTimeline("info", "System reset", "Simulation reset to Normal Operation baseline.");
      renderAll();
    });

    document.getElementById("presentationBtn").addEventListener("click", () => {
      state.presentation = !state.presentation;
      document.getElementById("app").classList.toggle("presentation", state.presentation);
      document.getElementById("presentationBtn").textContent = state.presentation ? "Exit Presentation" : "Presentation Mode";
    });

    document.getElementById("exportJsonBtn").addEventListener("click", exportDemoJson);

    document.querySelectorAll(".sensor-marker").forEach((m) => {
      m.setAttribute("tabindex", "0");
      m.addEventListener("click", () => {
        state.selectedBridgeSensor = m.dataset.sensor;
        renderBridgeView();
      });
      m.addEventListener("keypress", (e) => {
        if (e.key === "Enter") { state.selectedBridgeSensor = m.dataset.sensor; renderBridgeView(); }
      });
    });
  }

  function tickClock() {
    document.getElementById("liveClock").textContent = nowTime();
  }

  function init() {
    renderChartLegend();
    renderMaterialTable();
    initEvents();
    applyScenario("normal", { silent: true });
    logTimeline("info", "Monitoring session started", "BridgeGuard demo initialised for River Link Bridge (KL-001). All data simulated.");

    computeHealth();
    renderAll();
    tickClock();

    setInterval(tick, 1200);
    setInterval(tickClock, 1000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
