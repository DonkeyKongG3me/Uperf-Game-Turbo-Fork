(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PKG_RE = /^[A-Za-z0-9._]+$/;
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const PRESETS = [
    { id: "off", name: "Off", lvl: "", desc: ["Stock behaviour. The module leaves this app alone."] },
    { id: "powersave", name: "Efficient Mode", lvl: "eco",
      desc: ["Caps the CPU to 0.75W and speeds up slowly. ", { hl: "Low battery consumption" }, " and heat; heavy apps may stutter. Recommended for YouTube, reading and chat."] },
    { id: "balance", name: "Balanced Mode", lvl: "bal",
      desc: ["Performance profile which limits the CPU to ~2W. Smooth for most apps and games with ", { hl: "moderate battery consumption" }, "."] },
    { id: "performance", name: "Rapid Mode", lvl: "rapid",
      desc: ["Performance profile with no power cap and extreme responsiveness. Excellent for demanding games. A cooler is highly recommended. ", { hl: "High battery consumption" }, "."] },
    { id: "fast", name: "Extreme Mode", lvl: "ext",
      desc: ["Performance profile that runs the CPU and memory at 100% at all times with no ramp delay and extreme responsiveness. Generates a lot of heat; strongly not recommended for long gaming sessions. ", { hl: "Extreme battery consumption" }, "."] }
  ];
  const presetOf = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];
  const presetName = (id) => presetOf(id).name;
  const isPerf = (id) => id === "performance" || id === "fast";

  const TOUCH_TEXT = {
    powersave: "Efficient: small effect. The CPU speeds up right away when you tap instead of after a short delay.",
    balance: "Balanced: a little extra CPU headroom while you swipe.",
    performance: "Rapid: strongest effect. About twice the CPU headroom while your finger is on the screen.",
    fast: "Extreme: no extra effect. The CPU already runs at full speed in this mode."
  };

  const WARN = {
    performance: {
      title: "Use Rapid Mode?",
      body: ["Rapid Mode removes the CPU power cap, so demanding games run much smoother.",
        "The phone gets hot and the battery drains fast. A cooler is highly recommended."],
      btn: "OK", kind: "warn"
    },
    fast: {
      title: "Use Extreme Mode?",
      body: ["Extreme Mode keeps the CPU and memory at 100% the whole time the app is open, with no ramp delay.",
        "It generates a lot of heat and drains the battery rapidly. Not recommended for long gaming sessions."],
      btn: "OK", kind: "danger"
    }
  };

  const ACCENTS = [
    { id: "default", name: "Default" },
    { id: "#1E6FD9", name: "Blue" },
    { id: "#00897B", name: "Teal" },
    { id: "#3F9142", name: "Green" },
    { id: "#C79100", name: "Amber" },
    { id: "#E8650A", name: "Orange" },
    { id: "#D93A35", name: "Red" },
    { id: "#D81B78", name: "Pink" },
    { id: "#7E57C2", name: "Violet" }
  ];
  const SKIN_DEFAULT = { miuix: "#3482FF", m3e: "#6750A4" };

  const LIC_PROJECTS = [
    { section: "Apache-2.0", items: [
      { name: "uperf", by: "Matt Yang (yc9559)", url: "https://github.com/yc9559/uperf" },
      { name: "Uperf Game Turbo", by: "yinwanxi", url: "https://github.com/yinwanxi/Uperf-Game-Turbo" },
      { name: "Miuix", by: "YuKongA (compose-miuix-ui)", url: "https://github.com/compose-miuix-ui/miuix" }
    ] },
    { section: "GPL-2.0", items: [
      { name: "BusyBox", by: "BusyBox project (1.34.1, osm0sis build)", url: "https://github.com/mirror/busybox" }
    ] }
  ];

  const hasKsu = typeof window.ksu !== "undefined" && typeof window.ksu.exec === "function";
  const hasSpawn = hasKsu && typeof window.ksu.spawn === "function";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkMq = window.matchMedia("(prefers-color-scheme: dark)");

  let modDir = "/data/adb/modules/uperf";
  let ctl = "";

  let modSumHold = false;
  const S = {
    apps: [],
    labelsKnown: true,
    conf: newConf(),
    ui: { v: 1, skin: "", theme: "system", dyn: null, accent: "default", haptics: true, recents: [], noWarn: {}, sort: "default", toasts: true, bubbles: true, swipeHints: 0, moduleOn: true },
    tab: "all",
    query: "",
    current: null,
    status: {},
    loaded: false
  };

  function newConf() {
    return { apps: new Map(), exitDelay: 5, poll: 2, legacy: false };
  }
  function cloneConf(c) {
    const n = Object.assign({}, c);
    n.apps = new Map([...c.apps].map(([k, v]) => [k, Object.assign({}, v)]));
    return n;
  }
  const paint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20))));

  let cbn = 0;
  function run(cmd, timeoutMs) {
    if (!hasKsu) return new Promise((r) => setTimeout(() => r(mockExec(cmd)), 120));
    if (hasSpawn) return spawnRun(cmd, timeoutMs);
    return paint().then(() => execRun(cmd, timeoutMs));
  }
  function spawnRun(cmd, timeoutMs) {
    return new Promise((resolve) => {
      const name = "uperf_sp_" + Date.now() + "_" + (cbn++);
      const out = [], err = [];
      let done = false;
      const stream = (arr) => ({ on() {}, emit(ev, data) { if (ev === "data") arr.push(String(data)); } });
      const finish = (code, msg) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        setTimeout(() => { delete window[name]; }, 1000);
        resolve({ errno: code, stdout: out.join("\n"), stderr: err.join("\n") || msg || "" });
      };
      window[name] = {
        stdout: stream(out), stderr: stream(err), stdin: { on() {}, emit() {} },
        on() {},
        emit(ev, arg) {
          if (ev === "exit") finish(Number(arg));
          else if (ev === "error") setTimeout(() => finish(-1, arg && arg.message ? arg.message : String(arg)), 300);
        }
      };
      const timer = setTimeout(() => finish(-1, "timed out"), timeoutMs || 30000);
      try { window.ksu.spawn(cmd, "[]", "{}", name); } catch (e) { finish(-1, String(e)); }
    });
  }
  function execRun(cmd, timeoutMs) {
    return new Promise((resolve) => {
      const name = "uperf_cb_" + Date.now() + "_" + (cbn++);
      const timer = setTimeout(() => { delete window[name]; resolve({ errno: -1, stdout: "", stderr: "timed out" }); }, timeoutMs || 30000);
      window[name] = (errno, stdout, stderr) => {
        clearTimeout(timer);
        delete window[name];
        resolve({ errno: Number(errno), stdout: stdout || "", stderr: stderr || "" });
      };
      try { window.ksu.exec(cmd, "{}", name); } catch (e) {
        clearTimeout(timer);
        delete window[name];
        resolve({ errno: -1, stdout: "", stderr: String(e) });
      }
    });
  }
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const ctlCmd = (...args) => ["sh", q(ctl)].concat(args).join(" ");
  const errText = (r) => (r.stderr || r.stdout || "no root access").trim().split("\n").slice(-2).join(" ");

  const DEMO = {
    pkgs: ["com.geode.launcher", "com.supercell.brawlstars", "com.mojang.minecraftpe", "org.telegram.messenger",
      "com.spotify.music", "com.miHoYo.GenshinImpact", "com.whatsapp", "com.instagram.android", "com.android.chrome",
      "com.discord", "com.robtopx.geometryjump", "com.netflix.mediaclient", "com.google.android.youtube", "com.tencent.ig"],
    labels: {
      "com.geode.launcher": "Geode", "com.supercell.brawlstars": "Brawl Stars", "com.mojang.minecraftpe": "Minecraft",
      "org.telegram.messenger": "Telegram", "com.spotify.music": "Spotify", "com.miHoYo.GenshinImpact": "Genshin Impact",
      "com.whatsapp": "WhatsApp", "com.instagram.android": "Instagram", "com.android.chrome": "Chrome", "com.discord": "Discord",
      "com.robtopx.geometryjump": "Geometry Dash", "com.netflix.mediaclient": "Netflix", "com.google.android.youtube": "YouTube",
      "com.tencent.ig": "PUBG Mobile"
    },
    conf: "FORMAT=2\nAPPS=com.geode.launcher:fast:11 com.google.android.youtube:powersave:10 com.mojang.minecraftpe:balance:10 com.tencent.ig:performance:11\nEXIT_DELAY=5\nPOLL_IDLE=2\n",
    ui: JSON.stringify({ v: 1, recents: [
      { p: "com.geode.launcher", t: Date.now() - 4 * 60e3 },
      { p: "com.tencent.ig", t: Date.now() - 50 * 60e3 },
      { p: "com.google.android.youtube", t: Date.now() - 26 * 3600e3 }
    ] })
  };
  function mockExec(cmd) {
    const ok = (stdout) => ({ errno: 0, stdout: stdout || "", stderr: "" });
    const prm = new URLSearchParams(location.search);
    if (/ state$/.test(cmd)) return ok("daemon=running\nactive=" + (prm.get("idle") ? "" : "com.geode.launcher") + "\npreset=fast\nuperf=4211\nbaseline=117\nsoc=MT6897\nplatform=mt6897\nbrand=" + (prm.get("brand") || "POCO") + "\nsdk=35\nversion=1.0\n");
    if (/ getconf$/.test(cmd)) return ok(DEMO.conf);
    if (/pm list packages/.test(cmd)) return ok(DEMO.pkgs.map((p) => "package:" + p).join("\n"));
    if (/ setconf /.test(cmd)) return ok("ok\n");
    if (/ uiget$/.test(cmd)) return ok(DEMO.ui);
    if (/ uiset /.test(cmd)) return ok("ok\n");
    if (/ colors$/.test(cmd)) return ok('overlay={"android.theme.customization.system_palette":"FF3F7A5A","android.theme.customization.color_source":"home_wallpaper"}\n');
    if (/ savelogs$/.test(cmd)) return ok("written: /sdcard/Android/yc/uperf/uperf_logs_20261015_143210.txt\n");
    if (/ restart$/.test(cmd)) return ok("watcher : running\n");
    if (/ (start|stop)$/.test(cmd)) return ok("ok\n");
    if (/ pkgdates$/.test(cmd)) return ok(DEMO.pkgs.map((p, i) => (1760000000 - i * 86400 * ((i * 7) % 5 + 1)) + " " + p).join("\n"));
    if (/ resetstock$/.test(cmd)) return ok("ok: every value is back to stock\n");
    return ok("");
  }

  function parseConf(text) {
    const c = newConf();
    let legacyPkgs = "", legacyPreset = "fast", fmt2 = false;
    const lines = text.split("\n");
    for (const raw of lines) if (/^\s*FORMAT\s*=\s*2\b/.test(raw)) fmt2 = true;
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/"/g, "");
      if (k === "LEGACY") c.legacy = true;
      else if (k === "APPS") {
        for (const w of v.split(/\s+/)) {
          if (!w) continue;
          const [p, pre, fl] = w.split(":");
          if (!PKG_RE.test(p)) continue;
          const preset = PRESETS.some((x) => x.id === pre && x.id !== "off") ? pre : "fast";
          let t = 1, h = isPerf(preset) ? 1 : 0;
          if (/^[01][01]$/.test(fl || "")) { t = +fl[0]; h = +fl[1]; }
          if (!fmt2) { t = 1; if (!isPerf(preset)) h = 0; }
          c.apps.set(p, { preset, t, h });
        }
      } else if (k === "EXIT_DELAY" && /^\d+$/.test(v)) c.exitDelay = Math.min(60, +v);
      else if (k === "POLL_IDLE" && /^\d+$/.test(v)) c.poll = clamp(+v, 1, 10);
      else if (k === "TARGET_PKGS") legacyPkgs = v;
      else if (k === "PRESET") legacyPreset = v;
    }
    if (c.legacy) {
      for (const p of legacyPkgs.split(/\s+/)) {
        if (PKG_RE.test(p)) c.apps.set(p, { preset: PRESETS.some((x) => x.id === legacyPreset) ? legacyPreset : "fast", t: 1, h: 1 });
      }
    }
    return c;
  }

  async function loadConf() {
    const r = await run(ctlCmd("getconf"));
    S.conf = parseConf(r.stdout || "");
  }

  let saveChain = Promise.resolve();
  function writeConf() {
    const c = S.conf;
    const apps = [...c.apps].map(([p, e]) => p + ":" + e.preset + ":" + (e.t ? 1 : 0) + (e.h ? 1 : 0)).join(" ");
    const cmd = ctlCmd("setconf", q(apps), c.exitDelay, c.poll);
    const job = saveChain.then(() => run(cmd));
    saveChain = job.catch(() => {});
    return job;
  }

  async function changeConf(mutate, okMsg, undo) {
    const before = cloneConf(S.conf);
    mutate(S.conf);
    renderConfViews();
    const r = await writeConf();
    if (r.errno === 0 && /ok/.test(r.stdout)) {
      if (okMsg) snack(S.ui.moduleOn ? okMsg : "Changes will apply when the module is active", S.ui.moduleOn ? undo : null);
      setTimeout(refreshStatus, 600);
      return true;
    }
    S.conf = before;
    renderConfViews();
    snack("Couldn't save: " + errText(r), null, true);
    return false;
  }

  let uiTimer = 0;
  function saveUi() {
    cacheLook();
    clearTimeout(uiTimer);
    uiTimer = setTimeout(async () => {
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(S.ui))));
      const r = await run(ctlCmd("uiset", q(b64)));
      if (!(r.errno === 0 && /ok/.test(r.stdout))) snack("Couldn't save the look settings: " + errText(r), null, true);
    }, 400);
  }
  async function loadUi() {
    const r = await run(ctlCmd("uiget"));
    let u = null;
    try { u = JSON.parse(r.stdout); } catch (e) { u = null; }
    if (!u || typeof u !== "object") return;
    if (u.skin === "miuix" || u.skin === "m3e") S.ui.skin = u.skin;
    if (["system", "light", "dark"].includes(u.theme)) S.ui.theme = u.theme;
    if (typeof u.dyn === "boolean") S.ui.dyn = u.dyn;
    if (typeof u.accent === "string" && (u.accent === "default" || /^#[0-9a-fA-F]{6}$/.test(u.accent))) S.ui.accent = u.accent;
    if (typeof u.haptics === "boolean") S.ui.haptics = u.haptics;
    if (Array.isArray(u.recents)) S.ui.recents = u.recents.filter((x) => x && PKG_RE.test(x.p) && +x.t > 0).slice(0, 30);
    if (SORTS.some((x) => x[0] === u.sort)) S.ui.sort = u.sort;
    if (typeof u.toasts === "boolean") S.ui.toasts = u.toasts;
    if (typeof u.bubbles === "boolean") S.ui.bubbles = u.bubbles;
    if (typeof u.moduleOn === "boolean") S.ui.moduleOn = u.moduleOn;
    if (+u.swipeHints >= 0) S.ui.swipeHints = Math.min(9, +u.swipeHints || 0);
    if (u.noWarn && typeof u.noWarn === "object") S.ui.noWarn = { performance: !!u.noWarn.performance, fast: !!u.noWarn.fast };
  }
  function cacheLook() {
    try {
      localStorage.setItem("uperf_ui_cache", JSON.stringify({ skin: S.ui.skin, theme: S.ui.theme, css: ($("dynColors") || {}).textContent || "" }));
    } catch (e) { }
  }
  function addRecent(pkg) {
    S.ui.recents = [{ p: pkg, t: Date.now() }].concat(S.ui.recents.filter((x) => x.p !== pkg)).slice(0, 30);
    saveUi();
  }

  const HAPTIC = { click: [0, 12], tick: [2, 6], heavy: [5, 20], pop: [21, 4] };
  let hapticBusy = false;
  function haptic(kind) {
    if (!S.ui.haptics) return;
    const h = HAPTIC[kind] || HAPTIC.click;
    if (!hasKsu) { try { navigator.vibrate && navigator.vibrate(h[1]); } catch (e) {} return; }
    if (hapticBusy) return;
    if (!hasSpawn && kind === "tick") return;
    hapticBusy = true;
    run("cmd vibrator_manager synced -f prebaked " + h[0] + " >/dev/null 2>&1 || cmd vibrator vibrate -f " + h[1] + " >/dev/null 2>&1", 3000)
      .then(() => { hapticBusy = false; });
  }

  const LAUNCH_TICKS = 6, LAUNCH_TICK_GAP = 100;
  let launchBusy = false;
  function launchBuzz() {
    if (!S.ui.haptics || launchBusy) return;
    if (!hasKsu) {
      try { navigator.vibrate && navigator.vibrate(Array.from({ length: LAUNCH_TICKS * 2 - 1 }, (_, i) => (i % 2 ? LAUNCH_TICK_GAP - 8 : 8))); } catch (e) {}
      return;
    }
    launchBusy = true;
    const t = HAPTIC.tick;
    const tick = "cmd vibrator_manager synced -f prebaked " + t[0] + " >/dev/null 2>&1 || cmd vibrator vibrate -f " + t[1] + " >/dev/null 2>&1";
    run("i=0; while [ $i -lt " + LAUNCH_TICKS + " ]; do " + tick + "; i=$((i+1)); done",
      LAUNCH_TICKS * LAUNCH_TICK_GAP + 2500).then(() => { launchBusy = false; });
  }

  let buzzUntil = 0, buzzBusy = false;
  function shakeBuzz(power) {
    if (!S.ui.haptics) return;
    const now = performance.now();
    if (now < buzzUntil || buzzBusy) return;
    const gap = Math.round(200 - power * 100);
    const n = Math.max(3, Math.round(600 / gap));
    buzzUntil = now + n * gap;
    if (!hasKsu) {
      try { navigator.vibrate && navigator.vibrate(Array.from({ length: n * 2 - 1 }, (_, i) => (i % 2 ? gap - 8 : 8))); } catch (e) {}
      return;
    }
    buzzBusy = true;
    const t = HAPTIC.tick;
    const tick = "cmd vibrator_manager synced -f prebaked " + t[0] + " >/dev/null 2>&1 || cmd vibrator vibrate -f " + t[1] + " >/dev/null 2>&1";
    run("i=0; while [ $i -lt " + n + " ]; do " + tick + "; sleep " + (gap / 1000).toFixed(2) + "; i=$((i+1)); done", 5000)
      .then(() => { buzzBusy = false; });
  }

  const SLIDER_TICK_INTERVAL = 106, SLIDER_TICK_MAX = 60, SLIDER_TICK_BUDGET = 160, SLIDER_TICK_STALE = 220, SLIDER_TICK_IDLE = 120;
  let sliderTickPending = false, sliderTickBusy = false, sliderTickIdle = 0, sliderTickTimer = 0;
  let sliderTickRequestedAt = 0, sliderTickLastAt = -Infinity;

  function sliderTicksStop() {
    clearTimeout(sliderTickIdle);
    clearTimeout(sliderTickTimer);
    sliderTickIdle = sliderTickTimer = 0;
    sliderTickPending = false;
    sliderTickRequestedAt = 0;
    if (!hasKsu) {
      try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
    }
  }

  function pumpSliderTicks() {
    if (sliderTickBusy || !sliderTickPending) return;

    const now = performance.now();
    if (now - sliderTickRequestedAt > SLIDER_TICK_STALE) {
      sliderTickPending = false;
      return;
    }

    const wait = SLIDER_TICK_INTERVAL - (now - sliderTickLastAt);
    if (wait > 0) {
      if (!sliderTickTimer) {
        sliderTickTimer = setTimeout(() => {
          sliderTickTimer = 0;
          pumpSliderTicks();
        }, Math.ceil(wait));
      }
      return;
    }

    sliderTickPending = false;
    sliderTickLastAt = now;

    if (!hasKsu) {
      try { navigator.vibrate && navigator.vibrate(6); } catch (e) {}
      return;
    }
    if (!hasSpawn) return;

    const t = HAPTIC.tick;
    const tick = "cmd vibrator_manager synced -f prebaked " + t[0] + " >/dev/null 2>&1 || cmd vibrator vibrate -f " + t[1] + " >/dev/null 2>&1";
    sliderTickBusy = true;
    const finish = () => {
      sliderTickBusy = false;
      pumpSliderTicks();
    };
    run(tick, SLIDER_TICK_BUDGET + 2500).then(finish, finish);
  }

  function sliderTicks(n) {
    if (!S.ui.haptics || !(n >= 1)) return;
    n = Math.min(SLIDER_TICK_MAX, Math.round(n));
    if (!(n >= 1)) return;
    if (!hasKsu && !navigator.vibrate) return;
    if (hasKsu && !hasSpawn) return;

    sliderTickPending = true;
    sliderTickRequestedAt = performance.now();
    clearTimeout(sliderTickIdle);
    sliderTickIdle = setTimeout(sliderTicksStop, SLIDER_TICK_IDLE);
    pumpSliderTicks();
  }
  const sliderSteps = (inp, a, b) => Math.max(1, Math.round(Math.abs(a - b) / (+inp.step || 1)));

  const Col = (() => {
    const hex2rgb = (h) => {
      h = h.replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const n = parseInt(h.slice(-6), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const rgb2hex = (rgb) => "#" + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("").toUpperCase();
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const delin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const XN = 0.95047, ZN = 1.08883, K = 24389 / 27, E = 216 / 24389;
    function hex2lch(hex) {
      const [r, g, b] = hex2rgb(hex).map(lin);
      const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
      const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
      const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
      const f = (t) => (t > E ? Math.cbrt(t) : (K * t + 16) / 116);
      const fx = f(x), fy = f(y), fz = f(z);
      const L = 116 * fy - 16, A = 500 * (fx - fy), B = 200 * (fy - fz);
      return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
    }
    function lab2lin(L, A, B) {
      const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
      const inv = (t) => { const t3 = t * t * t; return t3 > E ? t3 : (116 * t - 16) / K; };
      const x = inv(fx) * XN, y = L > 8 ? fy * fy * fy : L / K, z = inv(fz) * ZN;
      return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
        -0.969266 * x + 1.8760108 * y + 0.041556 * z,
        0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
    }
    function lch(L, C, h) {
      const hr = h * Math.PI / 180;
      const at = (c) => lab2lin(L, c * Math.cos(hr), c * Math.sin(hr));
      const inGamut = (v) => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
      let best = at(0);
      if (inGamut(at(C))) best = at(C);
      else {
        let lo = 0, hi = C;
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2, v = at(mid);
          if (inGamut(v)) { lo = mid; best = v; } else hi = mid;
        }
      }
      return rgb2hex(best.map((v) => delin(clamp(v, 0, 1))));
    }
    function over(fg, a, bg) {
      const f = hex2rgb(fg), b = hex2rgb(bg);
      return rgb2hex(f.map((v, i) => v * a + b[i] * (1 - a)));
    }
    function parseCss(v) {
      v = (v || "").trim();
      if (!v) return null;
      if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v)) return rgb2hex(hex2rgb(v));
      const probe = document.createElement("span");
      probe.style.color = v;
      if (!probe.style.color) return null;
      document.body.appendChild(probe);
      const m = getComputedStyle(probe).color.match(/(\d+(\.\d+)?)/g);
      probe.remove();
      return m && m.length >= 3 ? rgb2hex(m.slice(0, 3).map(Number)) : null;
    }
    return { hex2lch, lch, over, parseCss, rgb2hex };
  })();

  function m3Scheme(seed, dark, vivid) {
    const [, c, h] = Col.hex2lch(seed);
    const pc = vivid ? Math.min(80, Math.max(c, 44)) : 42;
    const P = (t) => Col.lch(t, pc, h);
    const Sx = (t) => Col.lch(t, 16, h);
    const T = (t) => Col.lch(t, 26, (h + 60) % 360);
    const N = (t) => Col.lch(t, 4, h);
    const NV = (t) => Col.lch(t, 9, h);
    const Er = (t) => Col.lch(t, 72, 32);
    if (!dark) {
      return {
        primary: P(40), onPrimary: P(100), primaryContainer: P(90), onPrimaryContainer: P(30),
        secondary: Sx(40), onSecondary: Sx(100), secondaryContainer: Sx(90), onSecondaryContainer: Sx(30),
        tertiary: T(40), onTertiary: T(100), tertiaryContainer: T(90), onTertiaryContainer: T(30),
        error: Er(40), onError: Er(100), errorContainer: Er(90), onErrorContainer: Er(30),
        surface: N(98), surfaceContainerLowest: N(100), surfaceContainerLow: N(96), surfaceContainer: N(94),
        surfaceContainerHigh: N(92), surfaceContainerHighest: N(90), onSurface: N(10), onSurfaceVariant: NV(30),
        outline: NV(50), outlineVariant: NV(80), inverseSurface: N(20), inverseOnSurface: N(95), inversePrimary: P(80)
      };
    }
    return {
      primary: P(80), onPrimary: P(20), primaryContainer: P(30), onPrimaryContainer: P(90),
      secondary: Sx(80), onSecondary: Sx(20), secondaryContainer: Sx(30), onSecondaryContainer: Sx(90),
      tertiary: T(80), onTertiary: T(20), tertiaryContainer: T(30), onTertiaryContainer: T(90),
      error: Er(80), onError: Er(20), errorContainer: Er(30), onErrorContainer: Er(90),
      surface: N(6), surfaceContainerLowest: N(4), surfaceContainerLow: N(10), surfaceContainer: N(12),
      surfaceContainerHigh: N(17), surfaceContainerHighest: N(22), onSurface: N(90), onSurfaceVariant: NV(80),
      outline: NV(60), outlineVariant: NV(30), inverseSurface: N(90), inverseOnSurface: N(20), inversePrimary: P(40)
    };
  }
  const kebab = (k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  const m3Vars = (r) => Object.keys(r).map((k) => "--md-" + kebab(k) + ":" + r[k]).join(";");
  function miuixVars(r, dark) {
    const disabledPrimary = Col.over(r.primary, 0.38, r.surface);
    const disabledSecondary = Col.over(r.outlineVariant, 0.5, r.surface);
    const v = {
      primary: r.primary, "on-primary": r.onPrimary,
      "disabled-primary": disabledPrimary, "disabled-on-primary": Col.over(r.onPrimary, 0.38, disabledPrimary),
      "primary-container": r.primaryContainer, "on-primary-container": r.onPrimaryContainer,
      secondary: r.outlineVariant, "on-secondary": r.outline,
      "secondary-variant": r.surfaceContainerHigh, "on-secondary-variant": r.onSurface,
      "disabled-secondary": disabledSecondary, "disabled-on-secondary": Col.over(r.onSurface, 0.38, disabledSecondary),
      "tertiary-container": r.secondaryContainer, "on-tertiary-container": r.onSecondaryContainer,
      background: r.surface, "on-background": r.onSurface, "on-background-variant": r.primary,
      surface: r.surface, "on-surface": r.onSurface,
      "on-surface-secondary": Col.over(r.onSurface, 0.8, r.surface),
      summary: r.onSurfaceVariant, actions: r.onSurfaceVariant,
      "disabled-on-surface": Col.over(r.onSurface, 0.38, r.surfaceContainer),
      container: r.surfaceContainer, "container-high": r.surfaceContainerHigh,
      "on-container-high": r.onSurfaceVariant, "container-highest": r.surfaceContainerHighest,
      outline: r.outline, divider: r.outlineVariant,
      "slider-bg": Col.over(r.primary, 0.2, r.surface),
      error: r.error, "error-container": r.errorContainer, "on-error-container": r.onErrorContainer,
      dim: dark ? "rgba(0,0,0,.6)" : "rgba(0,0,0,.3)",
      "primary-text": r.primary, "primary-btn": r.primary, "snack-action": dark ? r.primary : r.inversePrimary
    };
    return Object.keys(v).map((k) => "--mx-" + k + ":" + v[k]).join(";");
  }

  let wallpaperSeed = null;
  function applyColors() {
    let seed = null, vivid = true;
    if (S.ui.dyn) { seed = wallpaperSeed; vivid = false; }
    else if (S.ui.accent !== "default") seed = S.ui.accent;
    root.toggleAttribute("data-tinted", !!seed);
    let el = $("dynColors");
    if (!seed) {
      if (el) el.textContent = "";
    } else {
      const L = m3Scheme(seed, false, vivid), D = m3Scheme(seed, true, vivid);
      const css =
        'html:root[data-skin="m3e"]{' + m3Vars(L) + "}" +
        'html:root[data-skin="m3e"][data-dark]{' + m3Vars(D) + "}" +
        'html:root[data-skin="miuix"]{' + miuixVars(L, false) + "}" +
        'html:root[data-skin="miuix"][data-dark]{' + miuixVars(D, true) + "}";
      if (!el) {
        el = document.createElement("style");
        el.id = "dynColors";
        document.head.appendChild(el);
      }
      el.textContent = css;
    }
    cacheLook();
    renderSwatches();
  }
  const isDark = () => S.ui.theme === "dark" || (S.ui.theme === "system" && darkMq.matches);
  function applyTheme() {
    root.toggleAttribute("data-dark", isDark());
    $("metaScheme").content = isDark() ? "dark" : "light";
    renderSwatches();
  }

  async function findWallpaperSeed() {
    const r = await run(ctlCmd("colors"), 8000);
    const out = r.stdout || "";
    let m = out.match(/system_palette"\s*:\s*"#?([0-9A-Fa-f]{6,8})"/) || out.match(/accent_color"\s*:\s*"#?([0-9A-Fa-f]{6,8})"/);
    if (m) return "#" + m[1].slice(-6);
    const css = getComputedStyle(root);
    const host = Col.parseCss(css.getPropertyValue("--primary")) || Col.parseCss(css.getPropertyValue("--md-sys-color-primary"));
    if (host) return host;
    m = out.match(/Color\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (m) return Col.rgb2hex([+m[1] * 255, +m[2] * 255, +m[3] * 255]);
    m = out.match(/#([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})\b/);
    if (m) return "#" + m[1].slice(-6);
    return null;
  }

  async function loadApps() {
    let pkgs = [], info = [], viaApi = false;
    if (hasKsu && typeof window.ksu.listPackages === "function") {
      try { pkgs = JSON.parse(window.ksu.listPackages("user")) || []; viaApi = pkgs.length > 0; } catch (e) { pkgs = []; }
    }
    if (!viaApi) {
      const r = await run("pm list packages -3 2>/dev/null || cmd package list packages -3");
      pkgs = r.stdout.split("\n").map((l) => l.replace(/^package:/, "").trim()).filter((p) => PKG_RE.test(p));
    }
    for (const p of S.conf.apps.keys()) if (!pkgs.includes(p)) pkgs.push(p);
    if (hasKsu && typeof window.ksu.getPackagesInfo === "function") {
      try { info = JSON.parse(window.ksu.getPackagesInfo(JSON.stringify(pkgs))) || []; } catch (e) { info = []; }
    }
    const labels = new Map(info.filter((i) => i && i.appLabel).map((i) => [i.packageName, i.appLabel]));
    if (!hasKsu) for (const p of pkgs) labels.set(p, DEMO.labels[p] || p);
    S.apps = pkgs.map((p) => ({ pkg: p, label: labels.get(p) || p, hasIcon: viaApi }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    S.labelsKnown = labels.size > 0;
  }
  const appOf = (pkg) => S.apps.find((a) => a.pkg === pkg) || { pkg, label: pkg, hasIcon: false };

  function iconEl(app, cls) {
    const box = document.createElement("span");
    box.className = cls || "app-ic";
    const letter = (app.label || app.pkg).replace(/^(com|org|net)\./, "").charAt(0).toUpperCase();
    const fallback = () => { box.textContent = letter; box.classList.add("letter"); };
    if (app.hasIcon) {
      const img = new Image();
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.draggable = false;
      img.onerror = () => { img.remove(); fallback(); };
      img.src = "ksu://icon/" + app.pkg;
      box.appendChild(img);
    } else fallback();
    return box;
  }
  function descEl(parts, lvl) {
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      if (typeof part === "string") frag.appendChild(document.createTextNode(part));
      else {
        const s = document.createElement("span");
        s.className = "hl";
        s.dataset.lvl = lvl;
        s.textContent = part.hl;
        frag.appendChild(s);
      }
    }
    return frag;
  }
  function ago(t) {
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "Changed just now";
    if (s < 3600) return "Changed " + Math.round(s / 60) + " min ago";
    if (s < 86400) return "Changed " + Math.round(s / 3600) + "h ago";
    const d = Math.round(s / 86400);
    return "Changed " + d + (d === 1 ? " day ago" : " days ago");
  }
  function setSwitch(row, on, disabled) {
    row.setAttribute("aria-checked", on ? "true" : "false");
    row.disabled = !!disabled;
    row.classList.toggle("disabled", !!disabled);
  }

  const FX_HTML = '<span class="opt-fx calm" aria-hidden="true">' + '<i class="rp"></i>'.repeat(8) + '<b class="rx">' + '<i class="rp"></i>'.repeat(2) + "</b></span>";
  function ensureFx(el) {
    if (!el.querySelector(":scope > .opt-fx")) el.insertAdjacentHTML("afterbegin", FX_HTML);
  }
  const fxVisible = new Set();
  let fxList = [], fxQueued = false, fxSeed = null, syncMotion = () => {};
  const fxIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      en.target.classList.toggle("fx-off", !en.isIntersecting);
      if (en.isIntersecting) fxVisible.add(en.target); else fxVisible.delete(en.target);
    }
    fxInvalidate();
  }, { rootMargin: "60px 0px" }) : null;
  function fxWatch(el) { if (fxIO) fxIO.observe(el); }
  function fxInvalidate() {
    if (fxQueued) return;
    fxQueued = true;
    requestAnimationFrame(() => {
      fxQueued = false;
      const list = [];
      for (const row of fxVisible) {
        if (!row.isConnected || !row.classList.contains("fx-live")) continue;
        const scr = row.closest(".screen");
        if (scr && scr.hasAttribute("data-off")) continue;
        const fx = row.querySelector(":scope > .opt-fx");
        if (fx) list.push(fx);
      }
      fxList = list;
      if (fxSeed) fxSeed();
      syncMotion();
    });
  }

  const rowCache = new Map();
  function rowFor(app) {
    let r = rowCache.get(app.pkg);
    if (r) return r;
    const btn = document.createElement("button");
    btn.className = "row app-row arrow";
    btn.dataset.pkg = app.pkg;
    fxWatch(btn);
    btn.appendChild(iconEl(app));
    const txt = document.createElement("span");
    txt.className = "row-text";
    const n = document.createElement("span");
    n.className = "row-title";
    n.textContent = app.label;
    const sum = document.createElement("span");
    sum.className = "row-sum";
    txt.append(n, sum);
    const end = document.createElement("span");
    end.className = "row-end";
    btn.append(txt, end);
    btn.insertAdjacentHTML("beforeend", '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-chev"/></svg>');
    r = { el: btn, sum, end, app };
    rowCache.set(app.pkg, r);
    return r;
  }
  function updateRow(r, recentT) {
    const e = S.conf.apps.get(r.app.pkg);
    const sumText = recentT ? ago(recentT) : (r.app.label !== r.app.pkg ? r.app.pkg : "");
    if (r.sum.textContent !== sumText) r.sum.textContent = sumText;
    r.sum.hidden = !sumText;
    r.end.hidden = !e && !recentT;
    const text = e ? presetName(e.preset) : "Off";
    if (r.end.textContent !== text) r.end.textContent = text;
    r.end.className = "row-end" + (e ? " on" : "");
    if (e) r.end.dataset.lvl = r.el.dataset.lvl = presetOf(e.preset).lvl; else { delete r.end.dataset.lvl; delete r.el.dataset.lvl; }
    if (e) ensureFx(r.el);
    r.el.classList.toggle("fx-live", !!e);
    r.el.setAttribute("aria-label", r.app.label + ", " + (e ? "boosted, " + text : "not boosted"));
  }
  const SORTS = [
    ["default", "Default (A to Z, Recents newest first)"],
    ["az", "A to Z"],
    ["za", "Z to A"],
    ["new", "Recently installed"],
    ["old", "Oldest installed"],
    ["boost", "Strongest mode on top"]
  ];
  const RANK = { fast: 4, performance: 3, balance: 2, powersave: 1 };
  let dates = null;
  async function loadDates() {
    const r = await run(ctlCmd("pkgdates"), 20000);
    const m = new Map();
    for (const line of (r.stdout || "").split("\n")) {
      const [t, p] = line.trim().split(" ");
      if (p && PKG_RE.test(p) && +t > 0) m.set(p, +t);
    }
    if (m.size) dates = m;
    return m.size > 0;
  }
  const byName = (a, b) => a.app.label.localeCompare(b.app.label, undefined, { sensitivity: "base" });
  function sortItems(items, recents) {
    const s = S.ui.sort;
    if (recents && s === "default") return items;
    const out = items.slice();
    if (s === "za") out.sort((a, b) => byName(b, a));
    else if ((s === "new" || s === "old") && dates) {
      const d = (x) => dates.get(x.app.pkg) || 0;
      out.sort((a, b) => (s === "new" ? d(b) - d(a) : (d(a) || Infinity) - (d(b) || Infinity)) || byName(a, b));
    } else if (s === "boost") {
      const r = (x) => { const e = S.conf.apps.get(x.app.pkg); return e ? RANK[e.preset] : 0; };
      out.sort((a, b) => r(b) - r(a) || byName(a, b));
    } else out.sort(byName);
    return out;
  }
  async function pickSort() {
    haptic("click");
    const list = document.createElement("div");
    list.className = "group sort-list";
    list.setAttribute("role", "radiogroup");
    list.setAttribute("aria-label", "Sort apps");
    for (const [id, name] of SORTS) {
      const b = document.createElement("button");
      b.className = "row opt sort-opt";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", id === S.ui.sort ? "true" : "false");
      b.dataset.id = id;
      b.innerHTML = '<span class="row-text"><span class="row-title"></span></span><span class="radio" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><use href="#ic-check"/></svg></span>';
      b.querySelector(".row-title").textContent = name;
      b.onclick = () => { S.ui.sort = id; haptic("click"); closeDialog(true); };
      list.appendChild(b);
    }
    const ok = await dialog({ title: "Sort apps", body: [], extra: list, buttons: [{ label: "Close", value: false, kind: "secondary" }] });
    if (!ok) return;
    saveUi();
    $("sortBtn").setAttribute("aria-label", "Sort apps: " + SORTS.find((x) => x[0] === S.ui.sort)[1]);
    if ((S.ui.sort === "new" || S.ui.sort === "old") && !dates && !(await loadDates())) {
      snack("Couldn't read the install dates, so apps stay sorted by name.", null, true);
    }
    lastOrder = "";
    renderList();
  }

  let lastOrder = "";
  function renderList() {
    const list = $("list");
    const qv = S.query.toLowerCase();
    let items;
    if (S.tab === "recent") items = S.ui.recents.map((r) => ({ app: appOf(r.p), t: r.t }));
    else if (S.tab === "on") items = S.apps.filter((a) => S.conf.apps.has(a.pkg)).map((app) => ({ app }));
    else items = S.apps.map((app) => ({ app }));
    if (qv) items = items.filter((x) => x.app.label.toLowerCase().includes(qv) || x.app.pkg.toLowerCase().includes(qv));
    items = sortItems(items, S.tab === "recent");
    list.style.setProperty("--w", (list.offsetWidth || window.innerWidth - 24) + "px");

    const rows = items.map((x) => { const r = rowFor(x.app); updateRow(r, x.t); return r.el; });
    const order = S.tab + "|" + items.map((x) => x.app.pkg).join(",");
    if (order !== lastOrder) { list.replaceChildren(...rows); lastOrder = order; }
    list.hidden = !items.length;
    $("recentHead").hidden = !(S.tab === "recent" && S.ui.recents.length);
    $("loading").hidden = S.loaded;
    fxInvalidate();

    const empty = $("empty");
    empty.hidden = !S.loaded || items.length > 0;
    if (!empty.hidden) {
      const [t, s] = qv ? ["No apps match “" + S.query + "”", "Check the spelling, or search by package name."]
        : S.tab === "on" ? ["No boosted apps yet", "Open All apps, tap an app and pick a mode."]
          : S.tab === "recent" ? ["Nothing here yet", "Apps you change show up here, even after you switch them off."]
            : ["No apps found", "The app list couldn't be read. Try reopening this screen."];
      $("emptyTitle").textContent = t;
      $("emptySum").textContent = s;
    }
  }

  function renderTabs() {
    const n = S.conf.apps.size;
    $("countOn").textContent = n ? " (" + n + ")" : "";
    for (const el of document.querySelectorAll(".tab")) {
      const sel = el.dataset.tab === S.tab;
      el.setAttribute("aria-selected", sel ? "true" : "false");
      el.tabIndex = sel ? 0 : -1;
      if (sel) $("listPanel").setAttribute("aria-labelledby", el.id);
    }
    if (G.tabs) G.tabs.sync(true);
  }

  function renderSegs() {
    for (const [segId, val] of [["skinSeg", S.ui.skin], ["themeSeg", S.ui.theme]]) {
      for (const b of $(segId).querySelectorAll(".seg")) {
        const on = b.dataset.val === val;
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      }
    }
    if (G.skin) G.skin.sync(true);
    if (G.theme) G.theme.sync(true);
  }
function renderSettings() {
  renderSegs();
  setSwitch($("rowDyn"), S.ui.dyn);
  $("dynSum").textContent = S.ui.dyn
    ? (wallpaperSeed ? "Using your wallpaper colors for the user interface." : "Wallpaper colors not found; using the default colors")
    : "Use your wallpaper colors for the user interface.";
  $("accentRow").hidden = !!S.ui.dyn;
  setSwitch($("rowHaptics"), S.ui.haptics);
  setSwitch($("rowToasts"), S.ui.toasts);
  setSwitch($("rowBubbles"), S.ui.bubbles);
  root.classList.toggle("no-fx", S.ui.bubbles === false);
  fxInvalidate();
    const off = !S.ui.moduleOn;
  setSwitch($("rowModule"), S.ui.moduleOn);
  if (!modSumHold) $("modTitle").textContent = "Enable Module";

  const nOn = S.conf.apps.size;
  if (!modSumHold) {
    $("modSum").textContent = off ? "Module is disabled. Activate it to boost apps."
      : nOn === 0 ? "Module is running. No apps are boosted."
      : nOn === 1 ? "Module is running. 1 app is boosted."
      : `Module is running. ${nOn} apps are boosted.`;
  }
  
  root.classList.toggle("mod-off", off);
  const idle = S.conf.apps.size === 0;
  const locked = off || idle;
  for (const [id, name, msg] of [["ed", "return-to-stock delay", "Boost an app to configure the return-to-stock delay"], ["pi", "check interval", "Boost an app to configure the check interval"]]) {
    const sl = $(id + "Slider"), sum = $(id + "Sum");
    if (!sum.dataset.text) sum.dataset.text = sum.textContent;
    sl.closest(".slider-row").classList.toggle("locked", locked);
    $(id).disabled = locked;
    sum.textContent = off ? "Activate module to configure " + name : idle ? msg : sum.dataset.text;
    setSlider(id, id === "ed" ? S.conf.exitDelay : S.conf.poll);
  }
  renderSwatches();
}

  function renderSwatches() {
    const box = $("swatches");
    if (!box) return;
    const custom = S.ui.accent !== "default" && !ACCENTS.some((a) => a.id.toLowerCase() === S.ui.accent.toLowerCase());
    const dark = root.hasAttribute("data-dark");
    const frag = document.createDocumentFragment();
    let selName = "Default";
    for (const a of ACCENTS.concat([{ id: "custom", name: "Custom" }])) {
      const b = document.createElement("button");
      b.className = "swatch";
      b.setAttribute("role", "radio");
      const sel = a.id === "custom" ? custom : a.id.toLowerCase() === S.ui.accent.toLowerCase();
      if (sel) selName = a.id === "custom" ? "Custom " + S.ui.accent.toUpperCase() : a.name;
      b.setAttribute("aria-checked", sel ? "true" : "false");
      b.setAttribute("aria-label", a.id === "custom" ? "Custom colour" : a.name);
      b.tabIndex = sel ? 0 : -1;
      b.dataset.id = a.id;
      const seed = a.id === "default" ? SKIN_DEFAULT[S.ui.skin] : a.id === "custom" ? (custom ? S.ui.accent : null) : a.id;
      if (seed) b.style.setProperty("--sw", a.id === "default" ? seed : m3Scheme(seed, dark, true).primary);
      else b.classList.add("empty-sw");
      b.innerHTML = a.id === "custom" && !custom
        ? '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-plus"/></svg>'
        : '<svg class="i sw-check" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-check"/></svg>';
      frag.appendChild(b);
    }
    box.replaceChildren(frag);
    $("accentSum").textContent = selName;
  }

  function renderFacts() {
    const st = S.status;
    const rows = [
      ["Watcher", !S.ui.moduleOn ? "Off" : st.daemon === "running" ? "Running" : st.daemon ? "Stopped" : "…"],
      ["Boosting now", S.ui.moduleOn && st.active ? appOf(st.active).label + " (" + presetName(st.preset) + ")" : "Nothing"],
      ["Stock values", st.baseline ? st.baseline + " recorded at boot" : "Not recorded yet"],
      ["Chip", [st.soc, st.platform].filter(Boolean).join(" / ") || "…"]
    ];
    $("aboutVer").textContent = st.version || "…";
    const frag = document.createDocumentFragment();
    for (const [k, v] of rows) {
      const d = document.createElement("div");
      d.className = "fact";
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      d.append(dt, dd);
      frag.appendChild(d);
    }
    $("facts").replaceChildren(frag);
  }

  function renderStatus() {
    const st = S.status;
    const n = S.conf.apps.size;
    const box = $("status");
    let title, sum = [], mode, label;
    const off = !S.ui.moduleOn;
    if (off) {
      title = "Module is off";
      sum = ["Activate the module in settings to configure boost modes."];
      mode = "idle"; label = title + ". " + sum[0];
    } else if (!st.daemon) {
      title = "Checking…"; mode = "idle"; label = "Checking the watcher";
    } else if (st.daemon !== "running") {
      title = "Watcher stopped";
      sum = ["Nothing gets boosted until it runs again. Tap to start it."];
      mode = "error"; label = "Watcher stopped. Start it";
    } else if (st.active) {
      const p = presetOf(st.preset);
      title = "Boosting " + appOf(st.active).label;
      sum = [{ hl: p.name, lvl: p.lvl }, ". Stock performance comes back when you leave boosted apps."];
      mode = "active"; label = title + ", " + p.name + ". Open its settings";
    } else if (n) {
      title = "Module is running";
      sum = [(n === 1 ? "1 app is boosted. Tap to see it." : n + " apps are boosted. Tap to see them.")];
      mode = "idle"; label = title + ". " + sum[0];
    } else {
      title = "Nothing boosted yet";
      sum = ["Tap an app below and pick a mode."];
      mode = "idle"; label = title;
    }
    box.dataset.mode = mode;
    box.toggleAttribute("data-off", off);
    if (!off && st.active) box.dataset.lvl = presetOf(st.preset).lvl; else delete box.dataset.lvl;
    $("statusTitle").textContent = title;
    const s = $("statusSum");
    s.replaceChildren();
    for (const part of sum) {
      if (typeof part === "string") s.appendChild(document.createTextNode(part));
      else { const sp = document.createElement("span"); sp.className = "hl"; sp.dataset.lvl = part.lvl; sp.textContent = part.hl; s.appendChild(sp); }
    }
    box.setAttribute("aria-label", label);
  }

  function buildPresetList() {
    const list = $("presetList");
    const frag = document.createDocumentFragment();
    for (const p of PRESETS) {
      const b = document.createElement("div");
      b.className = "row opt";
      b.setAttribute("role", "radio");
      b.dataset.id = p.id;
      if (p.lvl) b.dataset.lvl = p.lvl;
      b.id = "opt-" + p.id;
      b.setAttribute("aria-describedby", "opt-" + p.id + "-d");
      fxWatch(b);
      b.innerHTML = '<span class="row-text"><span class="row-title"><span class="pn"></span></span><span class="row-sum"></span></span>' +
        '<span class="radio" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><use href="#ic-check"/></svg></span>';
      b.querySelector(".pn").textContent = p.name;
      const sum = b.querySelector(".row-sum");
      sum.id = "opt-" + p.id + "-d";
      sum.appendChild(descEl(p.desc, p.lvl));
      frag.appendChild(b);
    }
    list.replaceChildren(frag);
  }

  function fillApp(pkg) {
    S.current = pkg;
    const app = appOf(pkg);
    $("appTitle").textContent = app.label;
    $("appBarTitle").textContent = app.label;
    $("appPkg").textContent = app.pkg;
    $("appPkg").hidden = app.label === app.pkg;
    const ic = iconEl(app, "app-icon");
    ic.id = "appIcon";
    ic.setAttribute("aria-hidden", "true");
    $("appIcon").replaceWith(ic);
    $("scrApp").scrollTop = 0;
    renderApp();
  }

  function renderApp() {
    const pkg = S.current;
    if (!pkg) return;
    const e = S.conf.apps.get(pkg);
    const preset = e ? e.preset : "off";
    const off = !S.ui.moduleOn;
    $("modPill").hidden = !off;
    for (const b of $("presetList").children) {
      const sel = b.dataset.id === preset;
      b.setAttribute("aria-checked", sel ? "true" : "false");
      b.tabIndex = sel ? 0 : -1;
      if (sel && b.dataset.lvl) ensureFx(b);
      b.classList.toggle("fx-live", sel && !!b.dataset.lvl);
    }
    const list = $("presetList");
    if (list.offsetWidth) list.style.setProperty("--w", list.offsetWidth + "px");
    fxInvalidate();
    const touchRow = $("rowTouch"), thRow = $("rowThermal");
    if (!e) {
      setSwitch(touchRow, false, true);
      setSwitch(thRow, false, true);
      $("tSum").textContent = $("hSum").textContent = "Pick a mode first";
      return;
    }
    setSwitch(touchRow, e.t, false);
    {
      const [mode, rest] = TOUCH_TEXT[e.preset].split(/:(.*)/s);
      const t = $("tSum");
      t.replaceChildren();
      const sp = document.createElement("span");
      sp.className = "hl";
      sp.dataset.lvl = presetOf(e.preset).lvl;
      sp.textContent = mode + ":";
      t.append(sp, document.createTextNode(rest + " Off: the phone's own touch boost is used instead."));
    }
    setSwitch(thRow, e.h, false);
    $("hSum").textContent = "The phone stops slowing itself down when it gets hot. Stock limits come back when you leave the app.";
  }

  function renderConfViews() {
    renderTabs();
    renderList();
    renderStatus();
    renderSettings();
    renderApp();
  }

  function renderLicenses() {
    const box = $("licList");
    if (box.children.length) return;
    const frag = document.createDocumentFragment();
    for (const sec of LIC_PROJECTS) {
      const h = document.createElement("h2");
      h.className = "small-title";
      h.textContent = sec.section;
      const g = document.createElement("div");
      g.className = "group";
      for (const it of sec.items) {
        const b = document.createElement("button");
        b.className = "row arrow";
        b.dataset.url = it.url;
        b.setAttribute("aria-label", it.name + " by " + it.by + ". Opens " + it.url.replace("https://", ""));
        b.innerHTML = '<span class="row-text"><span class="row-title"></span><span class="row-sum"></span></span><svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-open"/></svg>';
        b.querySelector(".row-title").textContent = it.name;
        b.querySelector(".row-sum").textContent = it.by + " · " + it.url.replace("https://", "");
        g.appendChild(b);
      }
      frag.append(h, g);
    }
    box.replaceChildren(frag);
  }
  async function openUrl(url) {
    if (!hasKsu) { window.open(url, "_blank", "noopener"); return; }
    const r = await run("am start -a android.intent.action.VIEW -d " + q(url) + " >/dev/null 2>&1");
    if (r.errno !== 0) snack("Couldn't open the browser. The page is " + url, null, true);
  }

  const G = {};
  function glider(el, getCurrent, pick) {
    const items = () => [...el.children].filter((c) => !c.classList.contains("ind") && !c.hidden);
    const isPill = el.classList.contains("pillnav");
    let placed = false, st = null, suppressUntil = 0;
    function place(b, anim) {
      if (!b || !b.offsetWidth) return;
      const still = !anim || !placed || reduceMotion.matches;
      if (still) el.classList.add("no-anim");
      el.style.setProperty("--ix", b.offsetLeft + "px");
      el.style.setProperty("--iw", b.offsetWidth + "px");
      placed = true;
      if (still) { void el.offsetWidth; el.classList.remove("no-anim"); }
    }
    const BLUR_MAX = 5.25, BLUR_STEP = 4;
    let lastBl = 0, blTimer = 0;
    function unblur() {
      if (lastBl === 0) return;
      lastBl = 0;
      el.style.setProperty("--bl", "0px");
      clearTimeout(blTimer);
      blTimer = setTimeout(() => { el.classList.remove("blurring"); el.style.removeProperty("--bl"); }, 450);
    }
    function blur(t) {
      if (reduceMotion.matches) return;
      const v = Math.round(Math.min(1, t) * BLUR_MAX * BLUR_STEP) / BLUR_STEP;
      if (v === lastBl) return;
      if (v === 0) { unblur(); return; }
      lastBl = v;
      clearTimeout(blTimer);
      el.classList.add("blurring");
      el.style.setProperty("--bl", v + "px");
    }
    function stretch(sx, sy, tx, ty, t) {
      el.style.setProperty("--sx", sx.toFixed(3));
      el.style.setProperty("--sy", sy.toFixed(3));
      el.style.setProperty("--tx", tx.toFixed(1) + "px");
      el.style.setProperty("--ty", ty.toFixed(1) + "px");
      blur(t);
    }
    function relax() {
      for (const v of ["--sx", "--sy", "--tx", "--ty", "--gl"]) el.style.removeProperty(v);
      unblur();
    }
    const g = { sync(anim) { place(getCurrent(), anim); } };
    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, hover: -1, lx: e.clientX, lt: performance.now(), vx: 0 };
      if (isPill) {
        el.classList.add("pressing");
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const bs = items(), x = e.clientX - el.getBoundingClientRect().left;
        const b = bs.find((c) => x >= c.offsetLeft && x < c.offsetLeft + c.offsetWidth);
        if (b) { el.style.setProperty("--ix", b.offsetLeft + "px"); st.hover = bs.indexOf(b); }
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      const now = performance.now();
      st.vx = st.vx * 0.6 + 0.4 * ((e.clientX - st.lx) / Math.max(1, now - st.lt));
      st.lx = e.clientX; st.lt = now;
      if (!st.drag) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          st.drag = true;
          try { el.setPointerCapture(st.id); } catch (err) {}
          el.classList.add("dragging");
          if (st.hover < 0) st.hover = items().indexOf(getCurrent());
        } else if (isPill && Math.abs(dy) > 6) {
          stretch(1 - Math.min(.06, Math.abs(dy) / 900), 1 + Math.min(.16, Math.abs(dy) / 420), 0, clamp(dy * .22, -26, 26), Math.abs(dy) / 70);
          return;
        } else if (Math.abs(dy) > 10) { st = null; return; } else return;
      }
      const bs = items();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let i = bs.findIndex((b) => x >= b.offsetLeft && x < b.offsetLeft + b.offsetWidth);
      if (i < 0) i = x < bs[0].offsetLeft ? 0 : bs.length - 1;
      const w = bs[i].offsetWidth;
      const lo = bs[0].offsetLeft, hi = bs[bs.length - 1].offsetLeft + bs[bs.length - 1].offsetWidth - w;
      el.style.setProperty("--ix", clamp(x - w / 2, lo, hi) + "px");
      el.style.setProperty("--iw", w + "px");
      if (isPill) {
        const gl = Math.round(Math.min(1, .6 + Math.abs(st.vx) * .35) * 20) / 20;
        if (gl !== st.gl) { st.gl = gl; el.style.setProperty("--gl", gl); }
        const over = x < 0 ? x : x > rect.width ? x - rect.width : 0;
        const speed = Math.min(.07, Math.abs(st.vx) * .05);
        const sx = 1 + Math.min(.16, Math.abs(over) / 520) + speed;
        stretch(sx, 1 - (sx - 1) * .45, clamp(over * .3, -30, 30), clamp(dy * .12, -14, 14), Math.max(Math.abs(over) / 80, Math.abs(dy) / 70));
      }
      if (i !== st.hover) { haptic("tick"); st.hover = i; }
    });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      el.classList.remove("pressing");
      if (isPill) relax();
      if (!s.drag) {
        if (isPill && !cancel && Math.abs(e.clientY - s.y) < 12) {
          const b = items()[s.hover];
          suppressUntil = performance.now() + 450;
          if (b && b !== getCurrent()) pick(b);
        }
        g.sync(true);
        return;
      }
      el.classList.remove("dragging");
      suppressUntil = performance.now() + 450;
      const b = items()[s.hover];
      if (!cancel && b && b !== getCurrent()) pick(b);
      g.sync(true);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("click", (e) => {
      if (performance.now() < suppressUntil) { e.preventDefault(); e.stopPropagation(); return; }
      const b = e.target.closest("button");
      if (b && b.parentElement === el && b !== getCurrent()) pick(b);
    });
    return g;
  }
  const syncGliders = (anim) => { for (const k in G) G[k].sync(anim); };

  function setSlider(id, v) {
    const inp = $(id);
    if (!$(id + "Slider").classList.contains("pressed")) inp.value = v;
    paintSlider(id);
  }
  function paintSlider(id) {
    const inp = $(id);
    const min = +inp.min, max = +inp.max, v = +inp.value;
    $(id + "Slider").style.setProperty("--p", ((v - min) / (max - min)).toFixed(4));
    $(id + "Val").textContent = id === "ed" && v === 0 ? "Right away" : v + " s";
    inp.setAttribute("aria-valuetext", id === "ed" && v === 0 ? "right away" : v + " seconds");
  }
  function sliderDrag(sl, inp, onValue, onCommit) {
    let st = null;
    const thumb = () => parseFloat(getComputedStyle(sl).getPropertyValue("--thumb")) || 24;
    const valAt = (cx) => {
      const r = sl.getBoundingClientRect(), t = thumb();
      const p = clamp((cx - r.left - t / 2) / (r.width - t), 0, 1);
      const min = +inp.min, max = +inp.max, step = +inp.step || 1;
      return clamp(Math.round((min + p * (max - min)) / step) * step, min, max);
    };
    sl.addEventListener("pointerdown", (e) => {
      if (e.button || inp.disabled) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false };
    });
    sl.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.drag) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          st.drag = true;
          try { sl.setPointerCapture(st.id); } catch (err) {}
          sl.classList.add("pressed");
        } else if (Math.abs(dy) > 8) { st = null; return; } else return;
      }
      onValue(valAt(e.clientX));
    });
    sl.addEventListener("pointerup", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s = st;
      st = null;
      sliderTicksStop();
      sl.classList.remove("pressed");
      if (!s.drag) {
        if (Math.abs(e.clientX - s.x) > 6 || Math.abs(e.clientY - s.y) > 6) return;
        onValue(valAt(e.clientX));
      }
      onCommit();
    });
    sl.addEventListener("pointercancel", () => { st = null; sliderTicksStop(); sl.classList.remove("pressed"); });
  }
  function bindSlider(id, key) {
    const inp = $(id), sl = $(id + "Slider");
    const setV = (v) => {
      const prev = +inp.value;
      if (v === prev) return;
      inp.value = v;
      sliderTicks(sliderSteps(inp, v, prev));
      paintSlider(id);
    };
    const commit = () => {
      const v = +inp.value;
      if (S.conf[key] !== v) changeConf((c) => { c[key] = v; });
    };
    sliderDrag(sl, inp, setV, commit);
    inp.addEventListener("input", () => { paintSlider(id); sliderTicks(1); });
    inp.addEventListener("change", commit);
  }

  let snackTimer = 0;
  function snack(msg, undo, isError, force) {
    if (S.ui.toasts === false && !isError && !force) return;
    const s = $("snack");
    s.style.transition = "";
    $("snackText").textContent = msg;
    const a = $("snackAction");
    a.hidden = !undo;
    if (undo) { a.textContent = "Undo"; a.onclick = () => { hideSnack(); undo(); }; }
    s.classList.toggle("error", !!isError);
    s.style.translate = s.style.opacity = "";
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add("show"));
    clearTimeout(snackTimer);
    snackTimer = setTimeout(hideSnack, isError ? 5000 : undo ? 4000 : 1600);
  }
  function hideSnack() {
    const s = $("snack");
    s.classList.remove("show");
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => { s.hidden = true; s.style.translate = s.style.opacity = ""; }, reduceMotion.matches ? 0 : 220);
  }
  (() => {
    const s = $("snack");
    let st = null;
    s.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      st = { x: e.clientX, t: performance.now(), id: e.pointerId };
      try { s.setPointerCapture(e.pointerId); } catch (err) {}
      clearTimeout(snackTimer);
      s.style.transition = "none";
    });
    s.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x;
      s.style.translate = dx + "px 0";
      s.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 260));
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, v = dx / Math.max(1, performance.now() - st.t);
      st = null;
      s.style.transition = "";
      if (Math.abs(dx) > 90 || Math.abs(v) > .5) {
        s.style.translate = (dx < 0 ? -1 : 1) * window.innerWidth + "px 0";
        s.style.opacity = "0";
        haptic("tick");
        setTimeout(() => { s.classList.remove("show"); s.hidden = true; s.style.translate = s.style.opacity = ""; }, 220);
      } else {
        s.style.translate = s.style.opacity = "";
        snackTimer = setTimeout(hideSnack, 1600);
      }
    };
    s.addEventListener("pointerup", end);
    s.addEventListener("pointercancel", end);
  })();

  let dlgResolve = null, dlgReturn = null;
  function dialog({ title, body, buttons, warn, lvl, extra, check }) {
    return new Promise((resolve) => {
      dlgReturn = document.activeElement;
      $("dlgTitle").textContent = title;
      const b = $("dlgBody");
      b.replaceChildren();
      for (const para of [].concat(body || [])) {
        const p = document.createElement("p");
        if (para && para.parts) {
          for (const part of para.parts) {
            if (typeof part === "string") { p.append(part); continue; }
            const a = document.createElement("a");
            a.className = "dlg-link";
            a.href = part.url;
            a.textContent = part.text;
            a.onclick = (e) => { e.preventDefault(); haptic("click"); openUrl(part.url); };
            p.append(a);
          }
        } else p.textContent = para;
        b.appendChild(p);
      }
      $("dlgIcon").hidden = !warn;
      if (lvl) $("dlgIcon").dataset.lvl = lvl; else delete $("dlgIcon").dataset.lvl;
      $("dlgExtra").replaceChildren();
      if (extra) $("dlgExtra").appendChild(extra);
      $("dlgCheck").hidden = !check;
      $("dlgCheckBox").checked = false;
      $("dlgCheckText").textContent = check || "";
      const acts = $("dlgActions");
      acts.replaceChildren();
      for (const btn of buttons) {
        const el = document.createElement("button");
        el.className = "btn " + (btn.kind || "secondary");
        el.textContent = btn.label;
        el.onclick = () => closeDialog(btn.value);
        acts.appendChild(el);
      }
      dlgResolve = resolve;
      openScrim($("dlg"));
      requestAnimationFrame(() => {
        const box = document.querySelector("#dlg .dialog");
        box.classList.toggle("scrollable", box.scrollHeight > box.clientHeight + 2);
      });
      const f = acts.querySelector(".btn.secondary") || acts.querySelector(".btn");
      setTimeout(() => f && f.focus(), 30);
    });
  }
  (() => {
    const box = document.querySelector("#dlg .dialog");
    let st = null;
    box.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest("button, input, label, .slider, .sort-list")) return;
      if (!e.target.closest(".dlg-grip") && box.scrollTop > 0) return;
      st = { y: e.clientY, x: e.clientX, t: performance.now(), id: e.pointerId, drag: false };
    });
    box.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dy = e.clientY - st.y, dx = e.clientX - st.x;
      if (!st.drag) {
        if (dy > 8 && dy > Math.abs(dx)) {
          st.drag = true;
          try { box.setPointerCapture(st.id); } catch (err) {}
          box.style.transition = "none";
        } else if (Math.abs(dx) > 10 || dy < -10) { st = null; return; } else return;
      }
      box.style.translate = "0 " + Math.max(0, dy) + "px";
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st;
      st = null;
      if (!s0.drag) return;
      const dy = e.clientY - s0.y, v = dy / Math.max(1, performance.now() - s0.t);
      box.style.transition = "";
      if (dy > 110 || v > .6) {
        box.style.translate = "0 " + (window.innerHeight * .6) + "px";
        haptic("tick");
        closeDialog(undefined);
        setTimeout(() => { box.style.translate = ""; }, 260);
      } else box.style.translate = "";
    };
    box.addEventListener("pointerup", end);
    box.addEventListener("pointercancel", end);
  })();
  function closeDialog(v) {
    closeScrim($("dlg"));
    const r = dlgResolve;
    dlgResolve = null;
    if (dlgReturn && dlgReturn.focus) dlgReturn.focus({ preventScroll: true });
    if (r) r(v);
  }
  function lockBehind(on) {
    document.body.classList.toggle("modal", on);
    for (const el of document.querySelectorAll(".screen, .pillnav")) el.inert = on || el.hasAttribute("data-off");
  }
  function openScrim(el) {
    el.hidden = false;
    lockBehind(true);
    requestAnimationFrame(() => el.classList.add("show"));
  }
  function closeScrim(el) {
    el.classList.remove("show");
    setTimeout(() => {
      if (!el.classList.contains("show")) el.hidden = true;
      if (!document.querySelector(".scrim.show")) lockBehind(false);
    }, reduceMotion.matches ? 0 : 200);
  }
  $("dlg").addEventListener("click", (e) => { if (e.target === $("dlg")) closeDialog(undefined); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("dlg").hidden) closeDialog(undefined); });

  async function withBusy(title, body, fn) {
    $("busyTitle").textContent = title;
    $("busyBody").textContent = body;
    openScrim($("busy"));
    await paint();
    const t0 = Date.now();
    let r;
    try { r = await fn(); } finally {
      await new Promise((ok) => setTimeout(ok, Math.max(0, 900 - (Date.now() - t0))));
      closeScrim($("busy"));
    }
    return r;
  }

  const SCREENS = { home: $("scrHome"), settings: $("scrSettings"), app: $("scrApp"), licenses: $("scrLicenses") };
  const kindOf = (v) => v.split(":")[0];
  const argOf = (v) => v.slice(v.indexOf(":") + 1);
  const elOf = (v) => SCREENS[kindOf(v)];
  const isSub = (v) => !["home", "settings"].includes(kindOf(v));
  let stack = ["home"];
  let running = [];
  const top = () => stack[stack.length - 1];

  function prepare(v) {
    const k = kindOf(v);
    if (k === "app") fillApp(argOf(v));
    else if (k === "licenses") renderLicenses();
  }
  function setOff(el, off) {
    el.toggleAttribute("data-off", off);
    el.inert = off;
    el.setAttribute("aria-hidden", off ? "true" : "false");
    fxInvalidate();
  }
  let tseq = 0;
  function transition(from, to, dir) {
    const my = ++tseq;
    for (const a of running) a.cancel();
    running = [];
    const fromEl = elOf(from), toEl = elOf(to);
    for (const k in SCREENS) {
      const el = SCREENS[k];
      el.classList.remove("on-top");
      if (el !== fromEl && el !== toEl) setOff(el, true);
    }
    prepare(to);
    document.body.dataset.screen = kindOf(to);
    $("pillnav").classList.toggle("away", isSub(to));
    if (!isSub(to)) {
      const home = kindOf(to) === "home";
      $("navHome").toggleAttribute("aria-current", home);
      $("navSettings").toggleAttribute("aria-current", !home);
      (home ? $("navHome") : $("navSettings")).setAttribute("aria-current", "page");
      if (G.nav) G.nav.sync(true);
    }
    if (fromEl === toEl) return;
    if (dir !== "instant" && !reduceMotion.matches) { fromEl.classList.add("in-transit"); toEl.classList.add("in-transit"); }
    setOff(toEl, false);
    syncGliders(false);
    onScroll(toEl);
    const done = () => {
      if (my !== tseq) return;
      setOff(fromEl, true);
      fromEl.classList.remove("in-transit");
      requestAnimationFrame(() => toEl.classList.remove("in-transit"));
      fromEl.classList.remove("on-top");
      toEl.classList.remove("on-top");
      running = [];
    };
    if (reduceMotion.matches || dir === "instant") { done(); return; }
    const m3 = root.dataset.skin === "m3e";
    const ease = m3 ? "cubic-bezier(.05,.7,.1,1)" : "cubic-bezier(.22,.9,.25,1)";
    const dur = m3 ? 420 : 460;
    const X = (v) => ({ transform: "translateX(" + v + ")" });
    let a1, a2;
    if (dir === "push") {
      toEl.classList.add("on-top");
      a1 = toEl.animate([X("100%"), X("0")], { duration: dur, easing: ease });
      a2 = fromEl.animate([X("0"), X("-30%")], { duration: dur, easing: ease, fill: "forwards" });
    } else if (dir === "pop") {
      fromEl.classList.add("on-top");
      a1 = fromEl.animate([X("0"), X("100%")], { duration: dur * 0.85, easing: ease, fill: "forwards" });
      a2 = toEl.animate([X("-30%"), X("0")], { duration: dur * 0.85, easing: ease });
    } else {
      const s = dir === "tab-fwd" ? 1 : -1;
      a1 = toEl.animate([X(s * 100 + "%"), X("0")], { duration: 380, easing: ease });
      a2 = fromEl.animate([X("0"), X(-s * 100 + "%")], { duration: 380, easing: ease, fill: "forwards" });
    }
    running = [a1, a2];
    Promise.all([a1.finished, a2.finished]).then(() => { done(); a1.cancel(); a2.cancel(); }, () => {});
  }
  function go(next, dir) {
    const from = top();
    stack = next;
    transition(from, top(), dir);
  }
  function push(v) {
    const next = stack.concat(v);
    history.pushState({ v: next }, "");
    go(next, "push");
    maybeSwipeHint(elOf(v));
  }
  function goTop(name, instant) {
    if (isSub(top()) || kindOf(top()) === name) return;
    if (!instant) haptic("tick");
    if (name === "settings") {
      history.pushState({ v: ["settings"] }, "");
      go(["settings"], instant ? "instant" : "tab-fwd");
    } else if (history.state && history.state.v && history.state.v.length === 1 && history.state.v[0] === "settings") {
      if (instant) go(["home"], "instant");
      history.back();
    } else {
      history.replaceState({ v: ["home"] }, "");
      go(["home"], instant ? "instant" : "tab-back");
    }
  }
  function backInstant() {
    if (stack.length < 2) return;
    go(stack.slice(0, -1), "instant");
    history.back();
  }

  const W = () => window.innerWidth;
  let swipeLockUntil = 0;
  const noLeftSwipe = (el) => el === SCREENS.app || el === SCREENS.licenses;
  function pageSwipe(scr) {
    let st = null;
    const setX = (el, x) => { el.style.transform = x ? "translateX(" + x + "px)" : ""; };
    scr.addEventListener("pointerdown", (e) => {
      if (e.button || document.body.classList.contains("modal") || scr.hasAttribute("data-off")) return;
      if (e.target.closest(".glider, .slider, input, .snackbar")) return;
      if (e.clientX < 24 || e.clientX > W() - 24) return;
      st = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, mode: null };
    });
    scr.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.mode) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
        for (const a of running) a.cancel();
        running = [];
        const cur = top();
        if (isSub(cur)) {
          if (noLeftSwipe(elOf(cur)) && dx < 0) { st = null; return; }
          st.mode = "back"; st.other = elOf(stack[stack.length - 2]);
        }
        else if (kindOf(cur) === "home" && dx < 0) { st.mode = "tab"; st.other = SCREENS.settings; st.to = "settings"; }
        else if (kindOf(cur) === "settings" && dx > 0) { st.mode = "tab"; st.other = SCREENS.home; st.to = "home"; }
        else { st = null; return; }
        if (st.other) { setOff(st.other, false); onScroll(st.other); }
        if (st.mode === "back") scr.classList.add("on-top");
        if (st.other) { scr.classList.add("in-transit"); st.other.classList.add("in-transit"); }
        try { scr.setPointerCapture(st.id); } catch (err) {}
        scr.classList.add("swiping", "swipe-layer");
        if (st.other) st.other.classList.add("swipe-layer");
        document.body.classList.add("swiping");
        st.x = e.clientX - Math.sign(dx) * 14;
        hideSwipeHint();
      }
      st.cx = e.clientX;
      if (st.raf) return;
      st.raf = requestAnimationFrame(() => { if (st) { st.raf = 0; moveTo(st.cx); } });
    });
    function moveTo(cx) {
      const d = cx - st.x;
      if (st.mode === "back") {
        const bd = noLeftSwipe(scr) ? Math.max(0, d) : d;
        setX(scr, bd);
        setX(st.other, -0.3 * W() * (1 - Math.min(1, Math.abs(bd) / W())));
      } else if (st.mode === "tab") {
        const dd = st.to === "settings" ? Math.min(0, d) : Math.max(0, d);
        setX(scr, dd);
        setX(st.other, dd + (st.to === "settings" ? W() : -W()));
      }
    }
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st;
      st = null;
      if (!s0.mode) return;
      if (s0.raf) cancelAnimationFrame(s0.raf);
      scr.classList.remove("swiping");
      document.body.classList.remove("swiping");
      const unlayer = () => { if (document.body.classList.contains("swiping")) return; scr.classList.remove("swipe-layer"); if (s0.other) s0.other.classList.remove("swipe-layer"); };
      setTimeout(unlayer, 340);
      swipeLockUntil = performance.now() + 400;
      const d = e.clientX - s0.x, v = d / Math.max(1, performance.now() - s0.t);
      const m3 = root.dataset.skin === "m3e";
      const ease = m3 ? "cubic-bezier(.05,.7,.1,1)" : "cubic-bezier(.22,.9,.25,1)";
      const cur = (el) => el.style.transform || "translateX(0px)";
      const anim = (el, to) => el.animate([{ transform: cur(el) }, { transform: to }], { duration: 300, easing: ease, fill: "forwards" });
      let finish;
      const tabSw = s0.mode === "tab";
      const fling = Math.abs(v) > (tabSw ? .25 : .45) && Math.abs(d) > (tabSw ? 22 : 40);
      const far = Math.abs(d) > W() * (tabSw ? .13 : .3);
      if (s0.mode === "back" && !cancel && (far || fling) && !(noLeftSwipe(scr) && d < 0)) {
        const out = d < 0 ? -W() : W();
        finish = [anim(scr, "translateX(" + out + "px)"), anim(s0.other, "translateX(0)")];
        Promise.all(finish.map((a) => a.finished)).then(() => {
          backInstant();
          for (const a of finish) a.cancel();
          setX(scr, 0); setX(s0.other, 0);
          scr.classList.remove("in-transit");
          requestAnimationFrame(() => s0.other.classList.remove("in-transit"));
        }, () => {});
      } else if (s0.mode === "tab" && !cancel && (far || fling) && Math.sign(d) === (s0.to === "settings" ? -1 : 1)) {
        finish = [anim(scr, "translateX(" + (s0.to === "settings" ? -W() : W()) + "px)"), anim(s0.other, "translateX(0)")];
        Promise.all(finish.map((a) => a.finished)).then(() => {
          goTop(s0.to, true);
          for (const a of finish) a.cancel();
          setX(scr, 0); setX(s0.other, 0);
          scr.classList.remove("in-transit");
          requestAnimationFrame(() => s0.other.classList.remove("in-transit"));
        }, () => {});
      } else {
        const back = [anim(scr, "translateX(0)")];
        if (s0.other) back.push(anim(s0.other, s0.mode === "back" ? "translateX(" + (-0.3 * W()) + "px)" : "translateX(" + (s0.to === "settings" ? W() : -W()) + "px)"));
        Promise.all(back.map((a) => a.finished)).then(() => {
          for (const a of back) a.cancel();
          setX(scr, 0);
          if (s0.other) { setX(s0.other, 0); s0.other.classList.remove("in-transit"); if (s0.other !== elOf(top())) setOff(s0.other, true); }
          scr.classList.remove("on-top");
          requestAnimationFrame(() => scr.classList.remove("in-transit"));
        }, () => {});
      }
    };
    scr.addEventListener("pointerup", (e) => end(e, false));
    scr.addEventListener("pointercancel", (e) => end(e, true));
    scr.addEventListener("click", (e) => {
      if (performance.now() < swipeLockUntil) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  let hintTimer = 0;
  function hideSwipeHint() {
    const h = $("swipeHint");
    if (!h || h.hidden) return;
    h.classList.remove("show");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { h.hidden = true; }, 250);
  }
  function maybeSwipeHint(scr) {
    if (S.ui.toasts === false || S.ui.swipeHints >= 1) return;
    const h = $("swipeHint");
    setTimeout(() => {
      if (scr.hasAttribute("data-off") || S.ui.toasts === false || S.ui.swipeHints >= 2) return;
      S.ui.swipeHints++;
      saveUi();
      h.hidden = false;
      requestAnimationFrame(() => h.classList.add("show"));
      const prev = elOf(stack[stack.length - 2] || "home");
      setOff(prev, false);
      const nx = reduceMotion.matches ? 0 : 46;
      const a = scr.animate([{ transform: "translateX(0)" }, { transform: "translateX(" + nx + "px)" }, { transform: "translateX(0)" }],
        { duration: reduceMotion.matches ? 1 : 900, easing: "cubic-bezier(.3,0,.2,1)", delay: 200 });
      a.finished.then(() => { if (prev !== elOf(top())) setOff(prev, true); }, () => {});
      clearTimeout(hintTimer);
      hintTimer = setTimeout(hideSwipeHint, 3600);
    }, 550);
  }
  window.addEventListener("popstate", (e) => {
    const next = (e.state && Array.isArray(e.state.v) && e.state.v.length) ? e.state.v : ["home"];
    if (next.join("|") === stack.join("|")) return;
    const dir = next.length < stack.length ? "pop" : next.length > stack.length ? "push" : (kindOf(next[0]) === "settings" ? "tab-fwd" : "tab-back");
    go(next, dir);
  });
  for (const b of document.querySelectorAll(".back-btn")) b.addEventListener("click", () => history.back());

  function onScroll(scr) {
    const bar = scr.querySelector(".topbar");
    const t = scr.querySelector(".large-title, .app-title");
    if (!bar || !t) return;
    if (stretched.has(scr)) return;
    const max = scr.scrollHeight - scr.clientHeight;
    const y = Math.min(Math.max(0, scr.scrollTop), max);
    const limit = t.offsetTop + t.offsetHeight - bar.offsetHeight;
    bar.classList.toggle("show", y > Math.max(8, limit));
    bar.classList.toggle("scrolled", y > 4);
  }
  for (const k in SCREENS) SCREENS[k].addEventListener("scroll", () => onScroll(SCREENS[k]), { passive: true });
  for (const k in SCREENS) pageSwipe(SCREENS[k]);

  let touchAt = 0, bounceActive = 0;
  const edgeBuzz = new WeakMap();
  const atTop = (scr) => scr.scrollTop <= 1;
  const atBottom = (scr) => scr.scrollTop >= scr.scrollHeight - scr.clientHeight - 1;
  function buzzEdge(scr, edge) {
    if (edgeBuzz.get(scr) === edge) return;
    edgeBuzz.set(scr, edge);
    requestAnimationFrame(() => setTimeout(() => haptic("heavy"), 0));
  }
  const BOUNCE = { omega: 15, rubber: 0.55, maxPeak: 0.14, minFling: 180, maxV: 9000,
                   resampleLatency: 5, maxPredict: 8, step: 1000 / 120 };
  const stretched = new WeakSet();

  function pullRocket(scr, wrap) {
    const el = wrap.querySelector(".pull-rocket");
    if (!el) return null;
    const pad = wrap.querySelector(".pr-pad"), probe = el.querySelector(".pr-probe");
    const FLY_MS = 500;
    let armAt = 0, armed = false, pulling = false, ign = -1, tilt = 1e9;
    const setVar = (k, v) => el.style.setProperty(k, v);
    function measure() {
      const H = el.offsetHeight || 65, inset = probe.offsetHeight || 0;
      armAt = inset + H * 0.75 + 12;
    }
    function pull(off, dx) {
      if (!pulling) { measure(); pulling = true; el.classList.add("pulling"); el.classList.remove("gone"); }
      const p = Math.max(0, Math.min(1, off / armAt));
      if (Math.abs(p - ign) > 0.008) { ign = p; setVar("--ign", p.toFixed(3)); }
      const t = Math.round(Math.max(-16, Math.min(16, (dx || 0) * 0.09)) * 4) / 4;
      if (t !== tilt) { tilt = t; setVar("--tilt", t + "deg"); }
      const a = off >= armAt;
      if (a !== armed) {
        armed = a;
        el.classList.toggle("armed", a);
        if (a) requestAnimationFrame(() => setTimeout(() => haptic("tick"), 0));
      }
    }
    function end() {
      if (!pulling && !armed && ign <= 0) return;
      pulling = false; armed = false; ign = 0; tilt = 0;
      el.classList.remove("pulling", "armed");
      setVar("--ign", "0"); setVar("--tilt", "0deg");
    }
    function smoke() {
      if (!pad) return;
      const flash = document.createElement("i");
      flash.className = "pr-flash";
      pad.appendChild(flash);
      flash.animate([{ transform: "scale(.3)", opacity: 1 }, { transform: "scale(2.2, 1.6)", opacity: 0 }],
        { duration: 380, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).onfinish = () => flash.remove();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const s = document.createElement("i"), d = 18 + Math.random() * 14;
        s.className = "pr-puff";
        s.style.width = s.style.height = d + "px";
        s.style.margin = (-d / 2) + "px 0 0 " + (-d / 2) + "px";
        const side = (i / (n - 1)) * 2 - 1;
        const dx = side * (34 + Math.random() * 40), dy = -(2 + Math.random() * 16) * (1 - Math.abs(side) * 0.5);
        const sc = 1.3 + Math.random() * 0.9;
        pad.appendChild(s);
        s.animate([
          { transform: "translate(0,0) scale(.25)", opacity: 0 },
          { transform: `translate(${dx * 0.35}px,${dy * 0.35}px) scale(${sc * 0.6})`, opacity: 1, offset: 0.18 },
          { transform: `translate(${dx}px,${dy}px) scale(${sc})`, opacity: 0 }
        ], { duration: 560 + Math.random() * 220, delay: Math.random() * 50, easing: "cubic-bezier(.2,.7,.35,1)", fill: "forwards" })
          .onfinish = () => s.remove();
      }
    }
    function launch() {
      const r = el.getBoundingClientRect();
      const fly = el.cloneNode(true);
      fly.removeAttribute("id");
      fly.className = "pull-rocket pr-fly launch";
      fly.style.left = r.left + "px"; fly.style.top = r.top + "px";
      const a0 = Math.abs(tilt) < 90 ? tilt : 0, a1 = a0 * 1.5;
      fly.style.setProperty("--tilt", "0deg");
      document.body.appendChild(fly);
      const rad = Math.PI / 180;
      const dist = (r.bottom + 300) / Math.cos(Math.max(Math.abs(a0), Math.abs(a1)) * rad);
      const tf = (x, y, ang, sx, sy) => `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${ang.toFixed(2)}deg) scale(${sx},${sy})`;
      const sinA = Math.sin(a0 * rad), cosA = Math.cos(a0 * rad);
      const frames = [
        { transform: tf(0, 0, a0, 1, 1), offset: 0, easing: "cubic-bezier(.3,0,.5,1)" },
        { transform: tf(-sinA * 6, cosA * 6, a0, 1.08, .9), offset: 0.12, easing: "cubic-bezier(.4,0,.6,1)" },
        { transform: tf(sinA * 12, -cosA * 12, a0, .95, 1.08), offset: 0.26 }
      ];
      const N = 10;
      let x = sinA * 12, y = -cosA * 12, prev = 12;
      for (let i = 1; i <= N; i++) {
        const u = i / N, s = 12 + (dist - 12) * Math.pow(u, 2.1), ds = s - prev; prev = s;
        const ang = a0 + (a1 - a0) * Math.min(1, u * 1.4), mid = (a0 + (a1 - a0) * Math.min(1, (u - 0.5 / N) * 1.4)) * rad;
        x += Math.sin(mid) * ds; y -= Math.cos(mid) * ds;
        const k = Math.min(1, u * 2);
        frames.push({ transform: tf(x, y, ang, (.95 - .17 * k).toFixed(3), (1.08 + .2 * k).toFixed(3)), offset: 0.26 + 0.74 * u, opacity: u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15 });
      }
      const a = fly.animate(frames, { duration: FLY_MS, fill: "forwards" });
      a.onfinish = a.oncancel = () => fly.remove();
      el.classList.add("gone");
      end();
      smoke();
      requestAnimationFrame(() => setTimeout(launchBuzz, 0));
    }
    return {
      pull, end,
      release(off) { if (armed && off >= armAt * 0.9) { launch(); return true; } end(); return false; },
      reset() { el.classList.remove("gone"); }
    };
  }

  function pageBounce(scr) {
    const wrap = document.createElement("div");
    wrap.className = "bounce";
    for (const el of [...scr.children]) if (!el.classList.contains("topbar")) wrap.appendChild(el);
    scr.appendChild(wrap);
    const rk = pullRocket(scr, wrap);

    let off = 0;
    let anim = null, traj = null;
    let g = null, touching = false, touchEnd = -1e9, mraf = 0, draf = 0;
    let h = scr.clientHeight || window.innerHeight;
    const maxScroll = () => Math.max(0, scr.scrollHeight - scr.clientHeight);
    const rubber = (p) => (1 - 1 / (p * BOUNCE.rubber / h + 1)) * h;
    const unrubber = (o) => (h / BOUNCE.rubber) * (1 / (1 - Math.min(o, h * 0.95) / h) - 1);
    const disabled = () => reduceMotion.matches || scr.hasAttribute("data-off") || document.body.classList.contains("modal");

    function setStretched(on) {
      if (on === stretched.has(scr)) return;
      if (on) { stretched.add(scr); bounceActive++; }
      else { stretched.delete(scr); bounceActive = Math.max(0, bounceActive - 1); onScroll(scr); }
    }
    let shown = 0;
    function paint() {
      if (Math.abs(off) < 0.3) off = 0;
      const px = Math.round(off * 4) / 4;
      if (px === shown) return;
      shown = px;
      wrap.style.transform = px ? "translate3d(0," + px + "px,0)" : "";
      if (px) setStretched(true);
      else if (!anim) setStretched(false);
    }
    function animOffset() {
      if (!anim || !traj) return 0;
      const t = Math.max(0, Math.min(traj.dur, anim.currentTime || 0)) / BOUNCE.step;
      const i = Math.min(traj.pts.length - 2, Math.floor(t)), f = t - i;
      return traj.pts[i] + (traj.pts[i + 1] - traj.pts[i]) * f;
    }
    function stopSpring() {
      if (!anim) return;
      const a = anim;
      off = animOffset();
      anim = null; traj = null;
      shown = NaN; paint();
      a.cancel();
    }
    function spring(v0, lead) {
      const x0 = anim ? animOffset() : off;
      if (anim) { const a = anim; anim = null; a.cancel(); }
      let x = x0, v = Math.max(-BOUNCE.maxV, Math.min(BOUNCE.maxV, v0 || 0));
      const w = BOUNCE.omega, dt = 0.001, per = Math.round(BOUNCE.step);
      const pts = [x];
      for (let ms = 1; ms <= 2000; ms++) {
        v += (-w * w * x - 2 * w * v) * dt; x += v * dt;
        if (ms % per === 0) {
          pts.push(x);
          if (Math.abs(x) < 0.25 && Math.abs(v) < 8) break;
        }
      }
      pts[pts.length - 1] = 0;
      if (pts.length < 3 || (Math.abs(x0) < 0.3 && Math.abs(v0 || 0) < 30)) { off = 0; shown = NaN; paint(); return; }
      const dur = (pts.length - 1) * per;
      traj = { pts, dur };
      setStretched(true);
      anim = wrap.animate(pts.map((p) => ({ transform: "translate3d(0," + p.toFixed(2) + "px,0)" })),
        { duration: dur, easing: "linear" });
      if (lead) anim.currentTime = Math.min(dur, lead);
      off = 0; shown = 0; wrap.style.transform = "";
      const mine = anim;
      mine.onfinish = () => {
        if (anim !== mine) return;
        anim = null; traj = null;
        off = 0; shown = 0; wrap.style.transform = "";
        setStretched(false);
      };
    }
    function stopMomentum() { if (mraf) cancelAnimationFrame(mraf); mraf = 0; }
    function stopDrag() { if (draf) cancelAnimationFrame(draf); draf = 0; }
    function edgeBounce(v, lead) {
      if (disabled() || anim || off || Math.abs(v) < BOUNCE.minFling) return;
      h = scr.clientHeight || h;
      const cap = BOUNCE.maxPeak * h * BOUNCE.omega * Math.E;
      const s = Math.sign(v) * Math.min(Math.abs(v), cap);
      spring(-s, lead);
      buzzEdge(scr, v > 0 ? "bottom" : "top");
    }
    function momentum(v) {
      stopMomentum();
      if (Math.abs(v) < 120) return;
      let t0 = performance.now();
      const step = (now) => {
        const dt = Math.max(0, (now - t0) / 1000); t0 = now;
        v *= Math.exp(-dt / 0.35);
        const max = maxScroll(), y = scr.scrollTop + v * dt;
        if (y <= 0 || y >= max) { scr.scrollTop = y <= 0 ? 0 : max; mraf = 0; edgeBounce(v); return; }
        scr.scrollTop = y;
        if (Math.abs(v) < 25) { mraf = 0; return; }
        mraf = requestAnimationFrame(step);
      };
      mraf = requestAnimationFrame(step);
    }

    const addSample = (t, y) => {
      const s = g.samples;
      if (s.length && t <= s[s.length - 1].t) { s[s.length - 1].y = y; return; }
      if (s.length) g.iv += (Math.min(40, t - s[s.length - 1].t) - g.iv) * 0.3;
      s.push({ t, y });
      if (s.length > 12) s.shift();
    };
    const resampleDelay = () => Math.min(20, Math.max(BOUNCE.resampleLatency, g.iv * 0.5 + 3));
    function fingerAt(t) {
      const s = g.samples, n = s.length;
      if (n === 1 || t <= s[0].t) return s[0].y;
      const a = s[n - 2], b = s[n - 1];
      if (t >= b.t) {
        const ahead = Math.min(t - b.t, BOUNCE.maxPredict, g.iv * 0.5);
        return b.y + (b.y - a.y) / Math.max(1, b.t - a.t) * ahead;
      }
      for (let i = n - 1; i > 0; i--) {
        const p = s[i - 1], q = s[i];
        if (t >= p.t) return p.y + (q.y - p.y) * (t - p.t) / Math.max(1, q.t - p.t);
      }
      return s[0].y;
    }
    function fingerVel() {
      const s = g.samples, b = s[s.length - 1];
      let a = s[0];
      for (let i = s.length - 2; i >= 0; i--) { a = s[i]; if (b.t - s[i].t >= 50) break; }
      return b.t > a.t ? (b.y - a.y) / (b.t - a.t) * 1000 : 0;
    }
    function dragFrame(now) {
      draf = 0;
      if (!g || !g.on) return;
      const y = fingerAt(now - resampleDelay());
      const pull = (y - g.base) * g.dir;
      if (g.native) {
        if (pull < g.peak - 2 || pull <= 0) { g.on = false; if (rk) rk.end(); spring(0); return; }
      } else if (pull <= 0) {
        off = 0; paint();
        if (rk && g.dir > 0) rk.end();
        scr.scrollTop = (g.dir > 0 ? 0 : g.max) - g.dir * pull;
        g.manual = true; g.peak = 0;
        draf = requestAnimationFrame(dragFrame);
        return;
      }
      g.manual = false;
      g.peak = Math.max(g.peak, pull);
      off = g.dir * rubber(pull);
      paint();
      if (rk && g.dir > 0) rk.pull(off, g.cx - g.x);
      draf = requestAnimationFrame(dragFrame);
    }

    let sy = scr.scrollTop, st = 0, sv = 0;
    scr.addEventListener("scroll", () => {
      const now = performance.now(), y = scr.scrollTop, dt = now - st;
      const prev = sv, prevY = sy, prevT = st;
      sv = dt > 0 && dt < 120 ? ((y - sy) / dt) * 1000 : 0;
      sy = y; st = now;
      const top = atTop(scr), bottom = atBottom(scr);
      if (!touching && !mraf && now - touchEnd < 4000 && (top || bottom)) {
        const v = bottom ? Math.max(sv, prev) : Math.min(sv, prev);
        if (bottom ? v > 0 : v < 0) {
          const edgeY = bottom ? maxScroll() : 0;
          const tEdge = prevT + Math.abs(edgeY - prevY) / Math.max(1e-3, Math.abs(v) / 1000);
          edgeBounce(v, Math.max(0, Math.min(34, now - tEdge)) + BOUNCE.step);
        }
      }
      const recent = now - touchAt < 2500;
      if (top) { if (recent) buzzEdge(scr, "top"); }
      else if (bottom) { if (recent) buzzEdge(scr, "bottom"); }
      else edgeBuzz.delete(scr);
    }, { passive: true });

    scr.addEventListener("touchstart", (e) => {
      touching = true;
      touchAt = performance.now();
      edgeBuzz.delete(scr);
      stopMomentum();
      stopDrag();
      g = null;
      if (rk) { rk.end(); rk.reset(); }
      if (disabled() || e.touches.length !== 1) { stopSpring(); off = 0; paint(); return; }
      if (e.target.closest(".glider, .slider, input, .snackbar")) return;
      stopSpring();
      h = scr.clientHeight || h;
      const t = e.touches[0];
      g = { x: t.clientX, cx: t.clientX, y: t.clientY, py: t.clientY, slop: false, on: false, dir: 0, base: 0,
            native: false, manual: false, peak: 0, max: maxScroll(), samples: [], iv: 8 };
      addSample(e.timeStamp, t.clientY);
      if (Math.abs(off) > 0.5) {
        g.slop = true; g.on = true; g.dir = Math.sign(off);
        g.base = t.clientY - g.dir * unrubber(Math.abs(off));
        g.peak = unrubber(Math.abs(off));
        draf = requestAnimationFrame(dragFrame);
      }
    }, { passive: true });

    scr.addEventListener("touchmove", (e) => {
      if (!g || e.touches.length !== 1) return;
      if (scr.classList.contains("swiping")) { g = null; stopDrag(); if (rk) rk.end(); if (off) spring(0); return; }
      const t = e.touches[0];
      g.cx = t.clientX;
      addSample(e.timeStamp, t.clientY);
      if (!g.slop) {
        const dy = t.clientY - g.y, dx = t.clientX - g.x;
        if (Math.abs(dy) < 6 || Math.abs(dx) > Math.abs(dy)) { g.py = t.clientY; return; }
        g.slop = true;
      }
      const step = t.clientY - g.py;
      g.py = t.clientY;
      if (!g.on) {
        const dir = step > 0 && atTop(scr) ? 1 : step < 0 && atBottom(scr) ? -1 : 0;
        if (!dir) return;
        stopSpring();
        g.on = true; g.dir = dir; g.peak = 0; g.manual = false;
        g.max = maxScroll();
        g.base = t.clientY - step - g.dir * unrubber(Math.abs(off));
        g.samples = [{ t: e.timeStamp, y: t.clientY }];
        g.native = !e.cancelable;
        buzzEdge(scr, dir > 0 ? "top" : "bottom");
      }
      if (e.cancelable) e.preventDefault(); else g.native = true;
      if (!draf) draf = requestAnimationFrame(dragFrame);
    }, { passive: false });

    const release = (e) => {
      if (e.touches && e.touches.length) return;
      touching = false;
      touchEnd = performance.now();
      stopDrag();
      const s = g;
      g = null;
      if (!s) { if (rk) rk.end(); if (off && !anim) spring(0); return; }
      if (rk) {
        if (s.on && s.dir > 0 && e.type === "touchend" && off > 0) rk.release(off);
        else rk.end();
      }
      const last = s.samples[s.samples.length - 1];
      const stale = !last || e.timeStamp - last.t > 90;
      g = s; const fv = stale ? 0 : fingerVel(); g = null;
      if (off) {
        let v = 0;
        if (s.on && !stale) {
          const pull = Math.max(0, (last.y - s.base) * s.dir);
          const slope = 1 / Math.pow(pull * BOUNCE.rubber / h + 1, 2) * BOUNCE.rubber;
          v = fv * slope;
        }
        spring(v);
        return;
      }
      if (s.manual && !stale) momentum(-fv);
    };
    scr.addEventListener("touchend", release, { passive: true });
    scr.addEventListener("touchcancel", release, { passive: true });
  }
  for (const k in SCREENS) pageBounce(SCREENS[k]);

  $("q").addEventListener("input", (e) => {
    S.query = e.target.value.trim();
    $("clearQ").hidden = !e.target.value;
    renderList();
  });
  $("clearQ").onclick = () => {
    $("q").value = "";
    S.query = "";
    $("clearQ").hidden = true;
    renderList();
    $("q").focus();
  };
  const TABS = ["all", "on", "recent"];
  function setTab(tab, focus) {
    if (S.tab === tab) return;
    S.tab = tab;
    haptic("tick");
    renderTabs();
    renderList();
    if (focus) document.querySelector('.tab[data-tab="' + tab + '"]').focus();
  }
  $("tabs").addEventListener("keydown", (e) => {
    const i = TABS.indexOf(S.tab);
    if (e.key === "ArrowRight") { e.preventDefault(); setTab(TABS[(i + 1) % 3], true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setTab(TABS[(i + 2) % 3], true); }
  });
  $("list").addEventListener("click", (e) => {
    const row = e.target.closest(".app-row");
    if (row) push("app:" + row.dataset.pkg);
  });
  $("sortBtn").onclick = pickSort;
  $("clearRecents").onclick = () => {
    const keep = S.ui.recents;
    S.ui.recents = [];
    saveUi();
    haptic("click");
    renderList();
    snack("Recents cleared", () => { S.ui.recents = keep; saveUi(); renderList(); });
  };
  $("status").onclick = async () => {
    if (!S.ui.moduleOn) {
      haptic("click");
      goTop("settings");
      const anims = running.slice();
      (anims.length ? Promise.all(anims.map((a) => a.finished)).catch(() => {}) : Promise.resolve())
        .then(() => requestAnimationFrame(pulseModule));
      return;
    }
    const st = S.status;
    if (!st.daemon) return;
    haptic("click");
    if (st.daemon !== "running") {
      const r = await withBusy("Starting the watcher…", "This takes a second.", () => run(ctlCmd("start"), 20000));
      if (r.errno !== 0) snack("Couldn't start watcher: " + errText(r), null, true);
      refreshStatus();
    } else if (st.active) {
      push("app:" + st.active);
    } else {
      setTab(S.conf.apps.size ? "on" : "all");
      const y = $("tabs").offsetTop - $("homeBar").offsetHeight - 8;
      $("scrHome").scrollTo({ top: Math.max(0, y), behavior: reduceMotion.matches ? "auto" : "smooth" });
    }
  };

  async function pickPreset(id) {
    const pkg = S.current;
    const old = S.conf.apps.get(pkg);
    const oldPreset = old ? old.preset : "off";
    if (id === oldPreset) return;
    haptic("click");
    const w = WARN[id];
    if (w && !S.ui.noWarn[id]) {
      const ok = await dialog({
        title: w.title, body: w.body, warn: true, lvl: presetOf(id).lvl, check: "Don't show this again",
        buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: w.btn, value: true, kind: w.kind }]
      });
      if (!ok) { renderApp(); return; }
      if ($("dlgCheckBox").checked) { S.ui.noWarn[id] = true; saveUi(); }
    }
    changeConf((c) => {
      if (id === "off") { c.apps.delete(pkg); return; }
      const e = c.apps.get(pkg) || { preset: id, t: 1, h: isPerf(id) ? 1 : 0 };
      if (isPerf(id) !== isPerf(e.preset)) { e.h = isPerf(id) ? 1 : 0; if (isPerf(id)) e.t = 1; }
      e.preset = id;
      c.apps.set(pkg, e);
    }, S.ui.moduleOn ? null : "Changes will apply when the module is active");
    addRecent(pkg);
  }
  $("presetList").addEventListener("click", (e) => {
    const row = e.target.closest(".opt");
    if (row) pickPreset(row.dataset.id);
  });
  $("presetList").addEventListener("keydown", (e) => {
    const rows = [...$("presetList").children];
    const i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") n = (i + 1) % rows.length;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") n = (i - 1 + rows.length) % rows.length;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); pickPreset(rows[i].dataset.id); return; }
    if (n >= 0) { e.preventDefault(); rows[n].focus(); pickPreset(rows[n].dataset.id); }
  });
  function toggleFlag(flag) {
    const pkg = S.current;
    const e = S.conf.apps.get(pkg);
    if (!e) return;
    haptic("click");
    const on = !e[flag];
    changeConf((c) => { c.apps.get(pkg)[flag] = on ? 1 : 0; }, S.ui.moduleOn ? null : "Changes will apply when the module is active");
    addRecent(pkg);
  }
  $("rowTouch").onclick = () => toggleFlag("t");
  $("rowThermal").onclick = () => toggleFlag("h");

  function setSkin(skin) {
    if (S.ui.skin === skin) return;
    haptic("click");
    S.ui.skin = skin;
    root.dataset.skin = skin;
    renderSettings();
    requestAnimationFrame(() => syncGliders(false));
    saveUi();
  }
  function setTheme(theme) {
    if (S.ui.theme === theme) return;
    haptic("click");
    S.ui.theme = theme;
    applyTheme();
    renderSegs();
    saveUi();
  }
  for (const segId of ["skinSeg", "themeSeg"]) {
    $(segId).addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const bs = [...$(segId).querySelectorAll(".seg")];
      const i = bs.findIndex((b) => b.getAttribute("aria-checked") === "true");
      const n = bs[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? bs.length - 1 : 1)) % bs.length];
      (segId === "skinSeg" ? setSkin : setTheme)(n.dataset.val);
      n.focus();
    });
  }
  darkMq.addEventListener("change", () => { if (S.ui.theme === "system") applyTheme(); });

  $("rowDyn").onclick = async () => {
    haptic("click");
    S.ui.dyn = !S.ui.dyn;
    if (S.ui.dyn && !wallpaperSeed) {
      setSwitch($("rowDyn"), true);
      wallpaperSeed = await findWallpaperSeed();
      if (!wallpaperSeed) snack("Couldn't read your wallpaper colours, so the default colours stay.", null, true);
    }
    applyColors();
    renderSettings();
    saveUi();
  };
  let moduleBusy = false;
  $("rowModule").onclick = async () => {
    if (moduleBusy) return;
    moduleBusy = true;
    haptic("click");
    const next = !S.ui.moduleOn;
    S.ui.moduleOn = next;
    modSumHold = true;
    renderConfViews();
    renderFacts();
    let r;
    try {
      r = await withBusy(next ? "Activating module…" : "Deactivating module…",
        next ? "Starting the watcher." : "Stopping the watcher. Stock values are put back first if an app is boosted.",
        () => run(ctlCmd(next ? "start" : "stop"), 30000));
      await new Promise((ok) => setTimeout(ok, reduceMotion.matches ? 0 : 260));
    } finally {
      moduleBusy = false;
      modSumHold = false;
    }
    if (r.errno !== 0) {
      S.ui.moduleOn = !next;
      renderConfViews();
      renderFacts();
      snack("Couldn't " + (next ? "activate" : "deactivate") + " the module: " + errText(r), null, true);
      return;
    }
    renderSettings();
    saveUi();
    enforceTried = false;
    refreshStatus();
  };
  $("rowBubbles").onclick = () => {
    S.ui.bubbles = !S.ui.bubbles;
    haptic("click");
    renderSettings();
    saveUi();
  };
  $("rowToasts").onclick = () => {
    S.ui.toasts = !S.ui.toasts;
    haptic("click");
    renderSettings();
    saveUi();
  };
  $("rowHaptics").onclick = () => {
    S.ui.haptics = !S.ui.haptics;
    haptic("click");
    renderSettings();
    saveUi();
  };

  $("swatches").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    if (b.dataset.id === "custom") { customColour(); return; }
    haptic("click");
    S.ui.accent = b.dataset.id;
    applyColors();
    saveUi();
    const nb = $("swatches").querySelector('[data-id="' + b.dataset.id + '"]');
    if (nb) nb.focus({ preventScroll: true });
  });
  $("swatches").addEventListener("keydown", (e) => {
    const all = [...$("swatches").children];
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % all.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + all.length) % all.length;
    if (n >= 0) { e.preventDefault(); all[n].focus(); }
  });

  async function customColour() {
    haptic("click");
    const [, C0, H0] = Col.hex2lch(/^#/.test(S.ui.accent) ? S.ui.accent : "#1E6FD9");
    let hue = Math.round(H0), vivid = Math.round(clamp(C0, 20, 100));
    const wrap = document.createElement("div");
    wrap.className = "picker";
    wrap.innerHTML =
      '<div class="pick-preview"><span class="pick-dot" id="pkDot"></span><label class="pick-hex"><span class="sr-only">Hex colour</span><input id="pkHex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Hex colour"></label></div>' +
      '<div class="pick-row"><span class="pick-lbl" id="pkHueL">Hue</span><div class="slider hue" id="pkHueSlider"><div class="s-track"><div class="s-fill"></div><div class="s-rest"></div></div><div class="s-thumb"></div><input type="range" id="pkHue" min="0" max="359" step="1" aria-labelledby="pkHueL"></div></div>' +
      '<div class="pick-row"><span class="pick-lbl" id="pkVivL">Saturation</span><div class="slider" id="pkVivSlider"><div class="s-track"><div class="s-fill"></div><div class="s-rest"></div><div class="s-stop"></div></div><div class="s-thumb"></div><input type="range" id="pkViv" min="20" max="100" step="1" aria-labelledby="pkVivL"></div></div>';
    const hexOf = () => Col.lch(55, vivid, hue);
    let current = /^#/.test(S.ui.accent) ? S.ui.accent : hexOf();
    const hIn = wrap.querySelector("#pkHue"), vIn = wrap.querySelector("#pkViv");
    const draw = (fromHex) => {
      if (!fromHex) current = hexOf();
      wrap.querySelector("#pkDot").style.background = current;
      if (!fromHex) wrap.querySelector("#pkHex").value = current;
      hIn.value = hue; vIn.value = vivid;
      wrap.querySelector("#pkHueSlider").style.setProperty("--p", (hue / 359).toFixed(4));
      wrap.querySelector("#pkVivSlider").style.setProperty("--p", ((vivid - 20) / 80).toFixed(4));
      hIn.setAttribute("aria-valuetext", hue + " degrees");
      vIn.setAttribute("aria-valuetext", vivid + " percent");
    };
    sliderDrag(wrap.querySelector("#pkHueSlider"), hIn, (v) => { if (v !== hue) { sliderTicks(sliderSteps(hIn, v, hue)); hue = v; draw(); } }, () => {});
    sliderDrag(wrap.querySelector("#pkVivSlider"), vIn, (v) => { if (v !== vivid) { sliderTicks(sliderSteps(vIn, v, vivid)); vivid = v; draw(); } }, () => {});
    hIn.addEventListener("input", () => { hue = +hIn.value; draw(); });
    vIn.addEventListener("input", () => { vivid = +vIn.value; draw(); });
    wrap.querySelector("#pkHex").addEventListener("input", (e) => {
      let v = e.target.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        current = v.toUpperCase();
        const [, c, h] = Col.hex2lch(current);
        hue = Math.round(h); vivid = Math.round(clamp(c, 20, 100));
        draw(true);
      }
    });
    wrap.querySelector("#pkHex").value = current;
    draw(true);
    const ok = await dialog({
      title: "Custom color",
      body: "Customize your color or enter a hex code.",
      extra: wrap,
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "OK", value: true, kind: "primary" }]
    });
    if (ok) { S.ui.accent = current.toUpperCase(); applyColors(); saveUi(); }
  }

  bindSlider("ed", "exitDelay");
  bindSlider("pi", "poll");

  $("rowLogs").onclick = async () => {
    haptic("click");
    const r = await withBusy("Saving logs…", "Collecting the watcher, session and uperf logs into one file. This takes a few seconds.",
      () => run(ctlCmd("savelogs"), 60000));
    const m = (r.stdout || "").match(/written:\s*(\S+)/);
    if (r.errno === 0 && m) {
      haptic("click");
      dialog({
        title: "Logs saved",
        body: ["Saved to " + m[1].replace("/data/media/0/", "/sdcard/") + ".",
          { parts: ["If you encountered any issue while using the module, send it to me on Telegram: ", { text: "@DonkeyKongG3me", url: "https://t.me/DonkeyKongG3me" }, "."] }],
        buttons: [{ label: "OK", value: true, kind: "primary" }]
      });
    } else {
      dialog({
        title: "Couldn't save logs",
        body: [errText(r), "An unknown error occured. Please try again later."],
        warn: true, buttons: [{ label: "OK", value: true, kind: "primary" }]
      });
    }
  };
  $("rowRestart").onclick = async () => {
    haptic("click");
    if (!S.ui.moduleOn) { snack("Activate the module first, otherwise the watcher would start again."); return; }
    const ok = await dialog({
      title: "Restart the watcher?",
      body: ["The watcher is the module's background service. It checks which app is on screen, switches a boosted app's mode on when you open it, and puts the phone back to stock when you leave.",
        "Restarting stops it (if an app is boosted right now, stock values are put back first), then starts it again and re-reads your app list and settings. Use it if an app stopped getting boosted or the status card says the watcher is stopped."],
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "Restart", value: true, kind: "primary" }]
    });
    if (!ok) return;
    const r = await withBusy("Restarting the watcher…", "Stock values are put back first if an app is boosted.",
      () => run(ctlCmd("restart"), 60000));
    if (r.errno === 0) snack("Watcher restarted");
    else snack("Couldn't restart watcher" + errText(r), null, true);
    refreshStatus();
  };
  $("rowReset").onclick = async () => {
    haptic("click");
    const ok = await dialog({
      title: "Reset to defaults?",
      body: ["Every boosted app is set back to Off, so the phone runs fully stock again.",
        "Everything on this screen goes back to how it was after install: style, theme, colors, haptics, the return-to-stock delay, the check interval, the recents list and the Rapid / Extreme warnings.",
        "This can't be undone."],
      warn: true,
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "Reset", value: true, kind: "danger" }]
    });
    if (!ok) return;
    const r = await withBusy("Resetting…", "Switching every app off and clearing your settings.", async () => {
      const a = await run(ctlCmd("setconf", "''", 5, 2));
      if (a.errno !== 0 || !/ok/.test(a.stdout)) return a;
      return run(ctlCmd("uireset"));
    });
    if (r.errno !== 0) {
      dialog({ title: "Couldn't reset", body: [errText(r)], warn: true, buttons: [{ label: "OK", value: true, kind: "primary" }] });
      return;
    }
    if (!S.ui.moduleOn) await run(ctlCmd("start"), 30000);
    try { localStorage.removeItem("uperf_ui_cache"); } catch (e) {}
    haptic("click");
    location.reload();
  };
  function pulseModule() {
    const g = $("moduleGroup");
    if (reduceMotion.matches) return;
    g.classList.remove("pulse");
    void g.offsetWidth;
    g.classList.add("pulse");
  }
  $("moduleGroup").addEventListener("animationend", (e) => {
    if (e.animationName === "mod-pulse") $("moduleGroup").classList.remove("pulse");
  });
  $("modPill").onclick = () => {
    if (kindOf(top()) !== "app") return;
    haptic("click");
    $("scrSettings").scrollTop = 0;
    history.replaceState({ v: ["settings"] }, "");
    go(["settings"], "tab-fwd");
    const anims = running.slice();
    (anims.length ? Promise.all(anims.map((a) => a.finished)).catch(() => {}) : Promise.resolve())
      .then(() => requestAnimationFrame(pulseModule));
  };
  $("rowLicenses").onclick = () => { haptic("click"); push("licenses"); };
  $("rowTelegram").onclick = () => { haptic("click"); openUrl("https://t.me/DonkeyKongG3me"); };
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) {}
      ta.remove();
    }
    snack("Copied to clipboard!");
  }
  $("rowDiscord").onclick = () => { haptic("click"); copyText("donkeykong69"); };
  $("rowVersion").onclick = () => {
    const v = S.status.version;
    if (!v) return;
    haptic("click");
    copyText(v);
  };
  $("licList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-url]");
    if (b) { haptic("click"); openUrl(b.dataset.url); }
  });

  (() => {
    if (reduceMotion.matches || !("DeviceMotionEvent" in window)) return;
    let gx = 0, gy = 0, px = 0, py = 0, vx = 0, vy = 0, shk = 0, raf = 0, last = 0, seen = false, lastPop = 0, wx = 0, wy = 0, wk = 0, lastHard = 0;
    const BUZZ_MIN = 10;
    const BUZZ_WINDOW = 500;
    let listening = false, shaking = false, calmTimer = 0;
    const bubblesInView = () => fxList.length > 0 && !document.hidden && !document.body.classList.contains("modal") && !document.body.classList.contains("swiping");
    function paintFx(list) {
      const a = String(wx), b = String(wy), c = String(wk);
      for (const fx of list) {
        const st = fx.style;
        st.setProperty("--jx", a);
        st.setProperty("--jy", b);
        st.setProperty("--shk", c);
      }
    }
    function stateFx(list) {
      for (const fx of list) {
        fx.classList.toggle("shk", shaking);
        fx.classList.toggle("calm", !shaking);
      }
    }
    function setShaking(on) {
      if (on === shaking) return;
      shaking = on;
      clearTimeout(calmTimer);
      if (on) stateFx(fxList);
      else {
        for (const fx of fxList) fx.classList.remove("shk");
        calmTimer = setTimeout(() => { if (!shaking) stateFx(fxList); }, 700);
      }
    }
    fxSeed = () => {
      paintFx(fxList);
      stateFx(fxList);
    };
    function onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      if (!seen) { gx = a.x; gy = a.y; seen = true; }
      gx += (a.x - gx) * .1; gy += (a.y - gy) * .1;
      const sx = a.x - gx, sy = a.y - gy, mag = Math.hypot(sx, sy);
      if (mag > 1.5) {
        vx += -sx * 6; vy += sy * 6;
        shk = Math.min(1, shk + mag * .018);
        const now = performance.now();
        if (mag > BUZZ_MIN) {
          const deliberate = lastHard && now - lastHard < BUZZ_WINDOW && now - lastHard > 15;
          if (!lastHard || now - lastHard > 15) lastHard = now;
          if (deliberate && now - lastPop > 80 && bubblesInView()) {
            lastPop = now;
            shakeBuzz(clamp((mag - 2.4) / 6, 0, 1));
          }
        }
      }
      if (!raf) raf = requestAnimationFrame(step);
    }
    syncMotion = () => {
      const want = S.ui.bubbles !== false && !document.hidden && fxList.length > 0;
      if (want === listening) return;
      listening = want;
      if (want) window.addEventListener("devicemotion", onMotion, { passive: true });
      else {
        window.removeEventListener("devicemotion", onMotion);
        cancelAnimationFrame(raf);
        raf = 0; last = 0; seen = false;
        gx = gy = px = py = vx = vy = shk = wx = wy = wk = 0;
        setShaking(false);
      }
    };
    document.addEventListener("visibilitychange", syncMotion);
    syncMotion();
    function step(t) {
      raf = 0;
      const dt = Math.min(.05, last ? (t - last) / 1000 : .016);
      last = t;
      const tx = clamp(-gx * 2.2, -16, 16), ty = clamp(gy * 1 - 8, -12, 12);
      vx += ((tx - px) * 55 - vx * 6) * dt;
      vy += ((ty - py) * 55 - vy * 6) * dt;
      px = clamp(px + vx * dt * 10, -34, 34);
      py = clamp(py + vy * dt * 10, -22, 22);
      shk = Math.max(0, shk - dt * .35);
      const jx = Math.round(px * 2) / 2, jy = Math.round(py * 2) / 2, sk = Math.round(shk * 20) / 20;
      if (fxList.length && !bounceActive && !document.body.classList.contains("swiping") && (jx !== wx || jy !== wy || sk !== wk)) {
        wx = jx; wy = jy; wk = sk;
        paintFx(fxList);
      }
      setShaking(shaking ? shk >= .08 : shk >= .15);
      if (listening && (shk > .002 || Math.abs(vx) + Math.abs(vy) > .05 || Math.abs(tx - px) + Math.abs(ty - py) > .2)) raf = requestAnimationFrame(step);
      else last = 0;
    }
  })();

  let statusBusy = false, enforceTried = false;
  async function refreshStatus() {
    if (statusBusy) return;
    statusBusy = true;
    try {
      const r = await run(ctlCmd("state"), 10000);
      const st = {};
      for (const line of (r.stdout || "").split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) st[line.slice(0, i)] = line.slice(i + 1).trim();
      }
      if (r.errno !== 0) st.daemon = "stopped";
      S.status = st;
      renderStatus();
      renderFacts();
      if (!S.ui.moduleOn && st.daemon === "running" && !enforceTried) {
        enforceTried = true;
        run(ctlCmd("stop"), 30000).then(() => setTimeout(refreshStatus, 600));
      }
    } finally { statusBusy = false; }
  }

  function addHostCss() {
    for (const href of ["/internal/insets.css", "/internal/colors.css", "/mmrl/insets.css", "/mmrl/colors.css"]) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.insertBefore(l, document.head.firstChild);
    }
  }

  async function init() {
    for (const k in SCREENS) { const el = SCREENS[k]; el.hidden = false; setOff(el, k !== "home"); }
    document.body.dataset.screen = "home";
    if (hasKsu) {
      addHostCss();
      if (typeof window.ksu.moduleInfo === "function") {
        try { const mi = JSON.parse(window.ksu.moduleInfo()); if (mi && mi.moduleDir) modDir = mi.moduleDir; } catch (e) {}
      }
    } else {
      $("banner").innerHTML = '<p class="banner">Preview: open this from KernelSU, APatch, or WebUI X / KSU WebUI on Magisk. These are sample apps and nothing is saved.</p>';
    }
    ctl = modDir + "/script/ctl.sh";
    history.replaceState({ v: ["home"] }, "", location.pathname + location.search);
    buildPresetList();
    G.tabs = glider($("tabs"), () => document.querySelector('.tab[aria-selected="true"]'), (b) => setTab(b.dataset.tab));
    G.skin = glider($("skinSeg"), () => $("skinSeg").querySelector('[aria-checked="true"]'), (b) => setSkin(b.dataset.val));
    G.theme = glider($("themeSeg"), () => $("themeSeg").querySelector('[aria-checked="true"]'), (b) => setTheme(b.dataset.val));
    G.nav = glider($("pillnav"), () => $("pillnav").querySelector('[aria-current="page"]'), (b) => goTop(b.dataset.val));
    window.addEventListener("resize", () => syncGliders(false));

    const params = new URLSearchParams(location.search);
    await Promise.all([loadConf(), loadUi(), refreshStatus()]);
    if (!S.ui.skin) S.ui.skin = /xiaomi|redmi|poco/i.test(S.status.brand || "") ? "miuix" : "m3e";
    if (S.ui.dyn === null) S.ui.dyn = S.ui.skin === "m3e";
    if (!hasKsu && params.get("skin")) S.ui.skin = params.get("skin") === "m3e" ? "m3e" : "miuix";
    if (!hasKsu && params.get("theme")) S.ui.theme = params.get("theme");
    root.dataset.skin = S.ui.skin;
    applyTheme();
    if (S.ui.dyn) wallpaperSeed = await findWallpaperSeed();
    applyColors();
    renderConfViews();
    renderFacts();
    syncGliders(false);
    if (S.conf.legacy) changeConf(() => {}, "Settings moved from the Geode-only version");

    await loadApps();
    if (S.ui.sort === "new" || S.ui.sort === "old") await loadDates();
    S.loaded = true;
    if (hasKsu && !S.labelsKnown) {
      $("banner").innerHTML = '<p class="banner">App names and icons need a newer WebUI app, so package names are shown instead.</p>';
    }
    renderList();
    renderStatus();
    renderFacts();
    if (!hasKsu && params.get("tab") === "settings") goTop("settings");
    if (!hasKsu && params.get("app")) push("app:" + params.get("app"));
    if (!hasKsu && params.get("lic")) { goTop("settings"); push("licenses"); }
    setInterval(() => { if (!document.hidden) refreshStatus(); }, 4000);
  }
  init();
})();
