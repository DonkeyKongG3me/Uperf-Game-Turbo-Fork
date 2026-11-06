(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PKG_RE = /^[A-Za-z0-9._]+$/;
  const root = document.documentElement;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mkSpring = (x) => ({ x, v: 0, to: x });
  function stepSpring(s, dt, response, damping) {
    const k = Math.pow(2 * Math.PI / response, 2), c = 4 * Math.PI * damping / response, h = 1 / 240;
    for (let left = dt; left > 1e-6; left -= h) {
      const t = Math.min(left, h);
      s.v += (-k * (s.x - s.to) - c * s.v) * t;
      s.x += s.v * t;
    }
  }
  const springIdle = (s, eps) => Math.abs(s.x - s.to) < eps && Math.abs(s.v) < eps * 30;
  const snapSpring = (s, x) => { s.x = s.to = x; s.v = 0; };
  const PRESETS = [
  { id: "off", name: "Off", lvl: "", desc: "Stock behavior.", hl: null },
  { id: "powersave", name: "Efficient Mode", lvl: "eco",
    desc: "Limit the CPU to 0.75W and a 0.8s ramp-up time, perfect for social media apps.",
    hl: "Low battery consumption." },
  { id: "balance", name: "Balanced Mode", lvl: "bal",
    desc: "Limit the CPU to 2W and a 0.2s ramp-up time, perfect for most apps and games.",
    hl: "Moderate battery consumption." },
  { id: "performance", name: "Rapid Mode", lvl: "rapid",
    desc: "Run the CPU with no ramp-up delay or power limit, perfect for demanding games with extreme responsiveness.",
    hl: "High battery consumption." },
  { id: "fast", name: "Extreme Mode", lvl: "ext",
    desc: "Run the CPU and memory at 100% with no ramp-up delay or power limit, meant for the most demanding games with extreme responsiveness.",
    hl: "Extreme battery consumption." }
];
const presetOf = (id) => PRESETS.find((p) => p.id === id) || PRESETS[0];
const presetName = (id) => presetOf(id).name;
const isPerf = (id) => id === "performance" || id === "fast";
const RELEASES_URL = "https://github.com/DonkeyKongG3me/Uperf-Game-Turbo-Fork/releases";
  const FAMILY = {
    pixel: "Google Tensor", exynos: "Exynos", kirin: "Kirin", unisoc: "Unisoc", tegra: "Nvidia Tegra",
    rockchip: "Rockchip", xring: "XRING", surge: "Surge", mediatek: "MediaTek", qualcomm: "Snapdragon"
  };
  const BATOC_WARN = {
    title: "Disable battery limits?",
    body: ["The phone may restart if the battery runs very low, mostly on older batteries. Best used above 30% or while charging."],
    btn: "OK", kind: "danger"
  };
  const BT_CHG_WARN = {
    title: "Enable while charging?",
    body: ["This setting reports fake battery temperatures while charging. It can disable charge throttling if the battery overheats.",
      "This can cause irreversible damage to your device. Are you sure?"],
    btn: "OK", kind: "danger"
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
    ui: { v: 1, skin: "", theme: "system", dyn: null, accent: "default", haptics: true, recents: [], noWarn: {}, sort: "default", toasts: true, bubbles: true, swipeHints: 0, moduleOn: true, statusCard: true, sysApps: false, hideFallbackNote: false, hideOutdatedNote: false, btMem: {} },
    tab: "all",
    query: "",
    current: null,
    status: {},
    caps: null,
    uperf: null,
    loaded: false
  };
  function newConf() {
    return { apps: new Map(), exitDelay: 5, poll: 2, batTemp: 0, batTempOn: false, batTempChg: false };
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
    conf: "FORMAT=2\nAPPS=com.geode.launcher:fast:11:g30 com.google.android.youtube:powersave:10 com.mojang.minecraftpe:balance:10 com.tencent.ig:performance:11:38\nEXIT_DELAY=5\nPOLL_IDLE=2\n",
    caps: {
      mediatek: "family=mediatek\nth_mtk=1\nth_mi=1\nth_gpu=0\nth_msm=0\nth_cdev=0\nth_exy=0\nbatoc=1\nbat_low=1\nbat_temp=1\n",
      pixel: "family=pixel\nth_mtk=0\nth_mi=0\nth_gpu=0\nth_msm=0\nth_cdev=4\nth_exy=0\nbatoc=1\nbat_low=1\n",
      exynos: "family=exynos\nth_mtk=0\nth_mi=0\nth_gpu=0\nth_msm=0\nth_cdev=0\nth_exy=1\nbatoc=0\n",
      qualcomm: "family=qualcomm\nth_mtk=0\nth_mi=0\nth_gpu=1\nth_msm=0\nth_cdev=0\nth_exy=0\nbatoc=0\n",
      kirin: "family=kirin\nth_mtk=0\nth_mi=0\nth_gpu=0\nth_msm=0\nth_cdev=0\nth_exy=0\nbatoc=0\n",
      tegra: "family=tegra\nth_mtk=0\nth_mi=0\nth_gpu=0\nth_msm=0\nth_cdev=0\nth_exy=0\nbatoc=0\n"
    },
    uperf: {
      mediatek: { initials: { cpu: { latencyTime: 0.5, margin: 0.2, burst: 0.05, predictThd: 0.3 }, sysfs: { ddrMin: "800000000" } },
        presets: {
          balance: { "*": { "cpu.latencyTime": 0.1, "cpu.margin": 0.3, "sysfs.ddrMin": "3200000000" }, idle: {}, touch: {}, trigger: { "cpu.margin": 0.3 }, gesture: { "cpu.margin": 0.4 }, junk: { "cpu.burst": 0.5, "sysfs.ddrMin": "5500000000" } },
          powersave: { "*": { "cpu.latencyTime": 0.8, "cpu.margin": 0.1 }, idle: { "cpu.predictThd": 1 }, touch: {}, trigger: { "cpu.latencyTime": 0, "cpu.margin": 0.1 }, gesture: { "cpu.margin": 0.1 }, junk: { "cpu.burst": 0.1 } },
          performance: { "*": { "cpu.latencyTime": 0, "cpu.margin": 0.28, "cpu.burst": 0.29 }, idle: {}, touch: { "cpu.margin": 0.53 }, trigger: { "cpu.margin": 0.65 }, gesture: { "cpu.margin": 0.5 }, junk: { "cpu.burst": 0.7 } },
          fast: { "*": { "cpu.latencyTime": 0, "cpu.margin": 1 }, idle: {}, touch: {}, trigger: {}, gesture: {}, junk: {} } } },
      tegra: { initials: { cpu: { latencyTime: 0.5, margin: 0.2, burst: 0 } },
        presets: {
          balance: { "*": { "cpu.latencyTime": 0.1, "cpu.margin": 0.25 }, idle: {}, touch: {}, trigger: { "cpu.latencyTime": 0, "cpu.margin": 0.4 }, gesture: { "cpu.margin": 0.6 }, junk: { "cpu.burst": 0.7 } },
          powersave: { "*": { "cpu.latencyTime": 0.4, "cpu.margin": 0.05 }, idle: {}, touch: {}, trigger: { "cpu.latencyTime": 0, "cpu.margin": 0.1 }, gesture: { "cpu.margin": 0.2 }, junk: { "cpu.burst": 0.2 } },
          performance: { "*": { "cpu.latencyTime": 0, "cpu.margin": 0.3 }, idle: {}, touch: {}, trigger: { "cpu.margin": 0.4 }, gesture: { "cpu.margin": 0.6 }, junk: { "cpu.burst": 0.7 } },
          fast: { "*": { "cpu.latencyTime": 0, "cpu.margin": 1 }, idle: {}, touch: {}, trigger: {}, gesture: {}, junk: {} } } }
    },
    ui: JSON.stringify({ v: 1, recents: [
      { p: "com.geode.launcher", t: Date.now() - 4 * 60e3 },
      { p: "com.tencent.ig", t: Date.now() - 50 * 60e3 },
      { p: "com.google.android.youtube", t: Date.now() - 26 * 3600e3 }
    ] })
  };
  const PREVIEW_CHIPS = ["e1080", "e1280", "e1380", "e2100", "e2200", "e5420", "e7420", "e7884", "e850", "e8890", "e8895", "e9810", "e9820", "e990",
    "gs101", "gs201", "gs301", "gs401", "kirin65x", "kirin710", "kirin9000", "kirin955", "kirin960", "kirin970", "kirin980", "kirin990",
    "mt6580", "mt6739", "mt6755", "mt6781", "mt8167", "mt8173", "mta22", "mtd1000", "mtd1200", "mtd6000", "mtd7000", "mtd720", "mtd7300",
    "mtd8100", "mtd820", "mtd8300", "mtd8400", "mtd9000", "mtd920", "mtd9200", "mtd930", "mtd9300", "mtd9400", "mtd9500", "mtg80", "mtg90t",
    "mtg96", "mtg99", "mtp10", "mtp20", "mtp35", "mtp70", "mtp90", "mtx10", "mtx20", "mtx30", "rk356", "rk3588", "sdm210", "sdm439", "sdm4g2",
    "sdm600", "sdm616", "sdm625", "sdm653", "sdm660", "sdm665", "sdm675", "sdm680", "sdm695", "sdm7+g3", "sdm710", "sdm720", "sdm730", "sdm750",
    "sdm765", "sdm778", "sdm780", "sdm7g1", "sdm7sg3", "sdm7sg4", "sdm808", "sdm810", "sdm820", "sdm835", "sdm845", "sdm855", "sdm865", "sdm888",
    "sdm8cxg2", "sdm8e", "sdm8eg5", "sdm8g1+", "sdm8g1", "sdm8g2", "sdm8g3", "sdm8g3q", "sdm8g4", "sdm8sg3", "sdm8sg4", "song1", "sp9832",
    "sp9863", "t310", "t606", "t618", "t710", "t770", "t8200", "tegra", "tegra_x1", "xro1"];
  const DEFAULT_CHIP = "mtd8400";
  function previewFamily(id) {
    if (/^gs/.test(id)) return "pixel";
    if (/^e[0-9]/.test(id)) return "exynos";
    if (/^kirin/.test(id)) return "kirin";
    if (/^tegra/.test(id)) return "tegra";
    if (/^(t[0-9]|sp)/.test(id)) return "unisoc";
    if (/^rk/.test(id)) return "rockchip";
    if (id === "xro1") return "xring";
    if (id === "song1") return "surge";
    if (/^mt/.test(id)) return "mediatek";
    if (/^sdm/.test(id)) return "qualcomm";
    return "other";
  }
  function pickPreviewChip() {
    const cur = new URLSearchParams(location.search).get("chip") || DEFAULT_CHIP;
    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto;";
    for (const id of PREVIEW_CHIPS) {
      const b = document.createElement("button");
      b.className = "btn " + (id === cur ? "primary" : "secondary");
      b.textContent = (FAMILY[previewFamily(id)] || "Other") + " · " + id + (id === cur ? " (current)" : "");
      b.onclick = () => {
        if (id === cur) { closeDialog(null); return; }
        const u = new URL(location.href);
        u.searchParams.set("chip", id);
        location.href = u.toString();
      };
      list.appendChild(b);
    }
    dialog({
      title: "Preview chip",
      body: "Choose a chip to emulate. The preview reloads with that chip's layout.",
      extra: list,
      buttons: [{ label: "Cancel", value: null, kind: "secondary" }]
    });
  }
  function mockExec(cmd) {
    const ok = (stdout) => ({ errno: 0, stdout: stdout || "", stderr: "" });
    const prm = new URLSearchParams(location.search);
    const chip = PREVIEW_CHIPS.includes(prm.get("chip")) ? prm.get("chip") : DEFAULT_CHIP;
    const fam = previewFamily(chip);
    if (/ state$/.test(cmd)) return ok("daemon=running\nactive=" + (prm.get("idle") ? "" : "com.geode.launcher") + "\npreset=fast\nuperf=4211\nbaseline=117\nsoc=" + chip.toUpperCase() + "\nplatform=" + chip + "\nbrand=" + (prm.get("brand") || "POCO") + "\nsdk=35\nversion=1.21\n");
    if (/ caps$/.test(cmd)) return ok(DEMO.caps[fam] || "family=" + fam + "\nth_mtk=0\nth_mi=0\nth_gpu=0\nth_msm=0\nth_cdev=0\nth_exy=0\nbatoc=0\n");
    if (/ uperfcfg$/.test(cmd)) return ok(JSON.stringify(DEMO.uperf[fam] || DEMO.uperf.mediatek));
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
    let fmt2 = false, btOnSeen = null;
    const lines = text.split("\n");
    for (const raw of lines) if (/^\s*FORMAT\s*=\s*2\b/.test(raw)) fmt2 = true;
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/"/g, "");
      if (k === "APPS") {
        for (const w of v.split(/\s+/)) {
          if (!w) continue;
          const [p, pre, fl, btf] = w.split(":");
          if (!PKG_RE.test(p)) continue;
          const preset = PRESETS.some((x) => x.id === pre && x.id !== "off") ? pre : "fast";
          let t = 1, h = isPerf(preset) ? 1 : 0, b = 0;
          if (/^[01]{2,3}$/.test(fl || "")) { t = +fl[0]; h = +fl[1]; b = fl.length > 2 ? +fl[2] : 0; }
          if (!fmt2) { t = 1; if (!isPerf(preset)) h = 0; }
          const bt = parseBtField(btf);
          c.apps.set(p, { preset, t, h, b, bt: bt ? bt.v : null, btOn: bt ? bt.on : false, btChg: bt ? bt.chg : false });
        }
      } else if (k === "EXIT_DELAY" && /^\d+$/.test(v)) c.exitDelay = Math.min(60, +v);
      else if (k === "POLL_IDLE" && /^\d+$/.test(v)) c.poll = clamp(+v, 1, 10);
      else if (k === "BAT_TEMP" && validBt(+v) && /^\d+$/.test(v)) c.batTemp = +v;
      else if (k === "BAT_TEMP_ON" && /^[01]$/.test(v)) btOnSeen = +v;
      else if (k === "BAT_TEMP_CHG" && /^[01]$/.test(v)) c.batTempChg = v === "1";
    }
    c.batTempOn = btOnSeen === null ? c.batTemp > 0 : !!btOnSeen;
    return c;
  }
  const BT_MIN = 10, BT_MAX = 40, BT_DEF = BT_MIN - 1;
  const validBt = (v) => v === 0 || (Number.isInteger(v) && v >= BT_MIN && v <= BT_MAX);
  const btToSlider = (v) => (v >= BT_MIN ? v : BT_DEF);
  const btFromSlider = (v) => (v <= BT_DEF ? 0 : v);
  function parseBtField(f) {
    const m = /^(g?)(\d+)(c?)$/.exec(f || "");
    if (!m || !validBt(+m[2])) return null;
    return { on: !m[1], v: +m[2], chg: !!m[3] };
  }
  function btField(e) {
    if (e.bt == null || !validBt(e.bt)) return "";
    return ":" + (e.btOn ? "" : "g") + e.bt + (e.btChg ? "c" : "");
  }
  function parseKv(text) {
    const o = {};
    for (const line of (text || "").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) o[line.slice(0, i)] = line.slice(i + 1).trim();
    }
    return o;
  }
  async function loadCaps() {
    const [a, b] = await Promise.all([run(ctlCmd("caps"), 15000), run(ctlCmd("uperfcfg"), 10000)]);
    const c = parseKv(a.stdout);
    S.caps = a.errno === 0 && c.family ? c : null;
    try { S.uperf = b.errno === 0 && b.stdout ? JSON.parse(b.stdout) : null; } catch (e) { S.uperf = null; }
  }
  async function loadConf() {
    const r = await run(ctlCmd("getconf"));
    S.conf = parseConf(r.stdout || "");
  }
  let saveChain = Promise.resolve();
  function writeConf() {
    const c = S.conf;
    const apps = [...c.apps].map(([p, e]) => p + ":" + e.preset + ":" + (e.t ? 1 : 0) + (e.h ? 1 : 0) + (e.b ? 1 : 0) + btField(e)).join(" ");
    const cmd = ctlCmd("setconf", q(apps), c.exitDelay, c.poll, c.batTemp, c.batTempOn ? 1 : 0, c.batTempChg ? 1 : 0);
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
    if (typeof u.sysApps === "boolean") S.ui.sysApps = u.sysApps;
    if (typeof u.hideFallbackNote === "boolean") S.ui.hideFallbackNote = u.hideFallbackNote;
    if (typeof u.hideOutdatedNote === "boolean") S.ui.hideOutdatedNote = u.hideOutdatedNote;
    if (u.btMem && typeof u.btMem === "object") {
      S.ui.btMem = {};
      for (const k in u.btMem) {
        const m = u.btMem[k];
        if (PKG_RE.test(k) && m && validBt(+m.v)) S.ui.btMem[k] = { v: +m.v, on: !!m.on, chg: !!m.chg };
      }
    }
    if (typeof u.moduleOn === "boolean") S.ui.moduleOn = u.moduleOn;
    if (typeof u.statusCard === "boolean") S.ui.statusCard = u.statusCard;
    if (+u.swipeHints >= 0) S.ui.swipeHints = Math.min(9, +u.swipeHints || 0);
    if (u.noWarn && typeof u.noWarn === "object") S.ui.noWarn = { performance: !!u.noWarn.performance, fast: !!u.noWarn.fast, batoc: !!u.noWarn.batoc, btchg: !!u.noWarn.btchg, tegra: !!u.noWarn.tegra };
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
    requestAnimationFrame(() => setTimeout(() => {
      run("cmd vibrator_manager synced -f prebaked " + h[0] + " >/dev/null 2>&1 || cmd vibrator vibrate -f " + h[1] + " >/dev/null 2>&1", 3000)
        .then(() => { hapticBusy = false; });
    }, 0));
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
  let appsGen = 0;
  const labelCache = new Map(), pkgCache = {};
  const COLL = new Intl.Collator(undefined, { sensitivity: "base" });
  const yieldMain = () => new Promise((r) => setTimeout(r, 0));
  let userApiJob = null;
  function userApiBroken() {
    if (!userApiJob) userApiJob = (async () => {
      if (!hasKsu || typeof window.ksu.listPackages !== "function") return false;
      try {
        const api = (JSON.parse(window.ksu.listPackages("user")) || []).filter((p) => PKG_RE.test(p));
        if (api.length >= 8) return false;
        const root = await fetchPkgs(false, true);
        S.pkgFallback = root.length > api.length;
        return S.pkgFallback;
      } catch (e) { return false; }
    })();
    return userApiJob;
  }
  async function fetchPkgs(all, viaRoot) {
    if (!viaRoot && hasKsu && typeof window.ksu.listPackages === "function" && !(await userApiBroken())) {
      try { return (JSON.parse(window.ksu.listPackages(all ? "all" : "user")) || []).filter((p) => PKG_RE.test(p)); } catch (e) { return []; }
    }
    const r = await run(all ? "pm list packages 2>/dev/null || cmd package list packages" : "pm list packages -3 2>/dev/null || cmd package list packages -3");
    return r.stdout.split("\n").map((l) => l.replace(/^package:/, "").trim()).filter((p) => PKG_RE.test(p));
  }
  let appVisJob = null;
  function allowAppList() {
    if (!hasKsu) return Promise.resolve(false);
    if (!appVisJob) appVisJob = run(ctlCmd("appvis", "self"), 30000).then((r) => /^ok:/m.test(r.stdout || ""), () => false);
    return appVisJob;
  }
  async function fetchLabels(pkgs, gen) {
    if (!hasKsu) { for (const p of pkgs) if (!labelCache.has(p)) labelCache.set(p, DEMO.labels[p] || p); return true; }
    if (typeof window.ksu.getPackagesInfo !== "function") return true;
    const need = pkgs.filter((p) => !labelCache.has(p));
    for (let i = 0; i < need.length; i += 40) {
      const part = need.slice(i, i + 40);
      let info = [];
      try { info = JSON.parse(window.ksu.getPackagesInfo(JSON.stringify(part))) || []; } catch (e) { info = []; }
      const got = new Map(info.filter((x) => x && x.packageName).map((x) => [x.packageName, x.appLabel || ""]));
      for (const p of part) labelCache.set(p, got.get(p) || "");
      if (gen !== appsGen) return false;
      await yieldMain();
    }
    return true;
  }
  async function loadApps(retried) {
    const gen = ++appsGen, key = S.ui.sysApps ? "all" : "user";
    if (!pkgCache[key]) {
      let found = await fetchPkgs(!!S.ui.sysApps);
      if (gen !== appsGen) return;
      if (retried && hasKsu && found.length < 8) {
        const viaRoot = await fetchPkgs(!!S.ui.sysApps, true);
        if (gen !== appsGen) return;
        if (viaRoot.length > found.length) found = viaRoot;
      }
      pkgCache[key] = found;
    }
    const pkgs = pkgCache[key].slice();
    for (const p of S.conf.apps.keys()) if (!pkgs.includes(p)) pkgs.push(p);
    if (!(await fetchLabels(pkgs, gen))) return;
    const hasApi = hasKsu && typeof window.ksu.listPackages === "function";
    S.apps = pkgs.map((p) => ({ pkg: p, label: labelCache.get(p) || p, hasIcon: hasApi }))
      .sort((a, b) => COLL.compare(a.label, b.label));
    S.labelsKnown = pkgs.some((p) => labelCache.get(p));
    const few = pkgCache[key].length < 8;
    if (!retried && hasKsu && (few || !S.labelsKnown)) {
      await allowAppList();
      if (gen !== appsGen) return;
      delete pkgCache.all; delete pkgCache.user;
      labelCache.clear();
      return loadApps(true);
    }
  }
  function showBanner(text, flag) {
    const el = $("banner");
    if (S.ui[flag]) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="banner banner-note"><span class="banner-text">' + text + '</span><button class="banner-x" id="bannerX" aria-label="Dismiss"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-close"/></svg></button></div>';
    $("bannerX").onclick = () => {
      S.ui[flag] = true;
      el.innerHTML = "";
      haptic("click");
      saveUi();
    };
  }
  function appsBanner() {
    if (!hasKsu) return;
    if (S.pkgFallback) return showBanner("App names and icons can’t be displayed on this device. Using package names instead.", "hideFallbackNote");
    if (S.labelsKnown) { $("banner").innerHTML = ""; return; }
    showBanner("Your current WebUI viewer is outdated. This might lead to missing app names and icons, so package names get shown instead. WebUI X is recommended for this module.", "hideOutdatedNote");
  }
  const appOf = (pkg) => S.apps.find((a) => a.pkg === pkg) || { pkg, label: pkg, hasIcon: false };
  const iconNow = new Set(), iconWait = new Set();
  const ICON_PAR = 6;
  let iconBusy = 0;
  function iconNext() {
    for (const box of iconNow) if (box.isConnected) return box;
    for (const box of iconWait) if (box.isConnected) return box;
    return null;
  }
  function iconStart(box) {
    iconNow.delete(box);
    iconWait.delete(box);
    if (iconIO) iconIO.unobserve(box);
    const img = box.firstChild;
    if (!img || !img.dataset || !img.dataset.src) return;
    let freed = false;
    const free = () => {
      if (freed) return;
      freed = true;
      iconBusy--;
      iconPump();
    };
    iconBusy++;
    img.addEventListener("load", free, { once: true });
    img.addEventListener("error", free, { once: true });
    setTimeout(free, 4000);
    img.src = img.dataset.src;
    delete img.dataset.src;
  }
  function iconPump() {
    while (iconBusy < ICON_PAR) {
      const box = iconNext();
      if (!box) return;
      iconStart(box);
    }
  }
  const iconIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      const box = en.target;
      if (en.isIntersecting) { if (iconWait.delete(box)) iconNow.add(box); }
      else if (iconNow.delete(box)) iconWait.add(box);
    }
    iconPump();
  }, { root: $("scrHome"), rootMargin: "100% 0px" }) : null;
  function iconEl(app, cls, ahead) {
    const box = document.createElement("span");
    box.className = cls || "app-ic";
    const letter = (app.label || app.pkg).replace(/^(com|org|net)\./, "").charAt(0).toUpperCase();
    const fallback = () => { box.textContent = letter; box.classList.add("letter"); };
    if (app.hasIcon) {
      const img = new Image();
      img.decoding = "async";
      img.alt = "";
      img.draggable = false;
      img.onerror = () => { img.remove(); fallback(); };
      box.appendChild(img);
      if (ahead && iconIO) { img.dataset.src = "ksu://icon/" + app.pkg; iconWait.add(box); iconIO.observe(box); }
      else img.src = "ksu://icon/" + app.pkg;
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
  const SEL = { on: false, set: new Set(), pop: false };
  function paintClearBtn() {
    const clr = S.loaded && S.tab === "on" && S.conf.apps.size > 0, cb = $("clearBoosted");
    cb.parentElement.classList.toggle("with-clear", clr);
    cb.tabIndex = clr ? 0 : -1;
    cb.setAttribute("aria-hidden", clr ? "false" : "true");
  }
  function paintSel(r) {
    const can = SEL.on && S.conf.apps.has(r.app.pkg);
    r.el.classList.toggle("sel-na", SEL.on && !can);
    let box = r.selBox;
    if (can && !box) {
      box = r.selBox = document.createElement("span");
      box.className = "sel-box";
      box.setAttribute("aria-hidden", "true");
      box.innerHTML = '<svg class="i" viewBox="0 0 24 24"><use href="#ic-check"/></svg>';
      r.el.appendChild(box);
    } else if (!can && box) {
      const gone = box;
      r.selBox = box = null;
      if (reduceMotion.matches || !gone.isConnected) gone.remove();
      else {
        gone.classList.add("out");
        gone.addEventListener("animationend", () => gone.remove(), { once: true });
        setTimeout(() => gone.remove(), 500);
      }
    }
    if (box) box.classList.toggle("on", SEL.set.has(r.app.pkg));
    if (SEL.on) r.el.setAttribute("aria-pressed", can && SEL.set.has(r.app.pkg) ? "true" : "false");
    else r.el.removeAttribute("aria-pressed");
  }
  function rowFor(app) {
    let r = rowCache.get(app.pkg);
    if (r) return r;
    const btn = document.createElement("button");
    btn.className = "row app-row arrow";
    btn.dataset.pkg = app.pkg;
    fxWatch(btn);
    btn.appendChild(iconEl(app, "", true));
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
    paintSel(r);
  }
  const SORTS = [
    ["default", "Default"],
    ["az", "A to Z"],
    ["za", "Z to A"],
    ["new", "Newest installed"],
    ["old", "Oldest installed"],
    ["boost", "Highest mode on top"]
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
  const byName = (a, b) => COLL.compare(a.app.label, b.app.label);
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
    const ok = await dialog({ title: "Sort apps", body: [], extra: list, sheet: true, buttons: [{ label: "Close", value: false, kind: "secondary" }] });
    if (!ok) return;
    saveUi();
    $("sortBtn").setAttribute("aria-label", "Sort apps: " + SORTS.find((x) => x[0] === S.ui.sort)[1]);
    if ((S.ui.sort === "new" || S.ui.sort === "old") && !dates && !(await loadDates())) {
      snack("Couldn't read the install dates, so apps stay sorted by name.", null, true);
    }
    lastOrder = "";
    renderList();
  }
  let lastOrder = "", listFill = 0;
  function fillList(list, items, make, from, order) {
    const step = () => {
      if (lastOrder !== order) return;
      const to = Math.min(items.length, from + 60);
      list.append(...items.slice(from, to).map(make));
      from = to;
      if (from < items.length) listFill = requestAnimationFrame(step);
      else { fxInvalidate(); fitCollapse($("scrHome")); }
      iconPump();
    };
    listFill = requestAnimationFrame(step);
  }
  function renderList() {
    const list = $("list");
    const qv = S.query.toLowerCase();
    let items;
    if (S.tab === "recent") items = S.ui.recents.map((r) => ({ app: appOf(r.p), t: r.t }));
    else if (S.tab === "on") items = S.apps.filter((a) => S.conf.apps.has(a.pkg)).map((app) => ({ app }));
    else items = S.apps.map((app) => ({ app }));
    const pool = items;
    if (qv) items = items.filter((x) => x.app.label.toLowerCase().includes(qv) || x.app.pkg.toLowerCase().includes(qv));
    items = sortItems(items, S.tab === "recent");
    list.style.setProperty("--w", (list.offsetWidth || window.innerWidth - 24) + "px");
    const order = S.tab + "|" + items.map((x) => x.app.pkg).join(",");
    const make = (x) => { const r = rowFor(x.app); updateRow(r, x.t); return r.el; };
    if (order !== lastOrder) {
      cancelAnimationFrame(listFill);
      lastOrder = order;
      list.replaceChildren(...items.slice(0, 40).map(make));
      if (items.length > 40) fillList(list, items, make, 40, order);
    } else for (const x of items) { const r = rowCache.get(x.app.pkg); if (r) updateRow(r, x.t); }
    list.hidden = !items.length;
    iconPump();
    paintClearBtn();
    $("recentHead").hidden = !(S.tab === "recent" && S.ui.recents.length);
    $("loading").hidden = S.loaded;
    fitCollapse($("scrHome"));
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
    const dym = $("emptyDym"), more = $("emptyMore");
    const sug = !empty.hidden && qv ? suggestApp(S.query, pool) : null;
    dym.hidden = !sug;
    if (sug) {
      const name = document.createElement("span");
      name.className = "dym-name";
      name.textContent = sug.label;
      dym.dataset.label = sug.label;
      dym.replaceChildren("Did you mean ", name, "?");
    }
    const kind = empty.hidden || !qv ? "" : S.tab !== "all" ? "all" : S.ui.sysApps ? "" : "sys";
    more.hidden = !kind;
    more.dataset.kind = kind;
    more.textContent = kind === "all" ? "View All apps" : "View system apps";
    fitEmpty();
  }
  function fitEmpty() {
    const el = $("empty"), scr = $("scrHome");
    el.style.minHeight = "";
    if (el.hidden || document.body.classList.contains("kb-open")) return;
    const sp = scr.querySelector(".nav-spacer");
    const top = el.getBoundingClientRect().top - scr.getBoundingClientRect().top + scr.scrollTop;
    const room = scr.clientHeight - top - (sp ? sp.offsetHeight : 0);
    if (room > el.offsetHeight) el.style.minHeight = Math.floor(room) + "px";
  }
  function flipEmpty(apply) {
    const el = $("empty");
    if (el.hidden || reduceMotion.matches) { apply(); return; }
    const kids = [...el.children].filter((k) => !k.hidden);
    const before = kids.map((k) => k.getBoundingClientRect());
    for (const k of kids) if (k._flip) { k._flip.cancel(); k._flip = null; }
    apply();
    kids.forEach((k, i) => {
      const a = before[i], b = k.getBoundingClientRect();
      if (!b.width || !a.width) return;
      const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2), sc = a.width / b.width;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sc - 1) < 0.01) return;
      k._flip = k.animate([{ transform: "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" + sc.toFixed(3) + ")" }, { transform: "none" }],
        { duration: 520, easing: "cubic-bezier(.22, .8, .25, 1)" });
    });
  }
  function editDist(a, b) {
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let p2 = null, p1 = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const c = [i];
      for (let j = 1; j <= n; j++) {
        let d = Math.min(p1[j] + 1, c[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, p2[j - 2] + 1);
        c.push(d);
      }
      p2 = p1;
      p1 = c;
    }
    return p1[n];
  }
  function suggestApp(query, pool) {
    const q = query.toLowerCase().replace(/\s+/g, "");
    if (q.length < 3) return null;
    const lim = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
    let best = null, bd = Infinity;
    for (const { app } of pool) {
      const l = app.label.toLowerCase(), flat = l.replace(/\s+/g, "");
      const cands = [flat, flat.slice(0, q.length), flat.slice(0, q.length + 1), flat.slice(0, q.length - 1)]
        .concat(l.split(/[\s\-_.:]+/), app.pkg.toLowerCase().split(".").filter((w) => w.length > 2 && !/^(com|org|net|android|app)$/.test(w)));
      let d = Infinity;
      for (const c of cands) if (c && Math.abs(c.length - q.length) <= lim) d = Math.min(d, editDist(q, c));
      if (d < bd || (d === bd && best && app.label.length < best.label.length)) { bd = d; best = app; }
    }
    return bd <= lim ? best : null;
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
    for (const k in DD_OPTS) {
      const o = DD_OPTS[k], cur = o.get();
      $(k + "Val").textContent = (o.items.find((x) => x[0] === cur) || o.items[0])[1];
    }
  }
function renderSettings() {
  renderSegs();
  setSwitch($("rowDyn"), S.ui.dyn);
  $("dynSum").textContent = S.ui.dyn
    ? (wallpaperSeed ? "Using your wallpaper's highlight colors for the user interface." : "Wallpaper colors not found; using the default colors")
    : "Use your wallpaper's highlight colors for the user interface.";
  $("accentRow").hidden = !!S.ui.dyn;
  setSwitch($("rowHaptics"), S.ui.haptics);
  setSwitch($("rowToasts"), S.ui.toasts);
  setSwitch($("rowBubbles"), S.ui.bubbles);
  setSwitch($("rowSysApps"), S.ui.sysApps);
  root.classList.toggle("no-fx", S.ui.bubbles === false);
  fxInvalidate();
    const off = !S.ui.moduleOn;
  setSwitch($("rowModule"), S.ui.moduleOn);
  setSwitch($("rowStatusCard"), S.ui.statusCard);
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
  {
    const sup = btSupported(), btLocked = locked || !sup, on = S.conf.batTempOn;
    setSwitch($("rowGbt"), on, btLocked);
    $("btSwSum").textContent = !sup ? btUnsupportedText() : off ? "Activate module to configure the battery temperature"
      : idle ? "Boost an app to configure the battery temperature"
      : "Report a fake battery temperature while boosted apps are open. This feature doesn't work during charging by default.";
    setCollapse($("btRow"), on);
    setCollapse($("rowGbtChg"), on);
    setSwitch($("rowGbtChg"), S.conf.batTempChg, btLocked);
    $("btRow").classList.toggle("locked", btLocked);
    $("bt").disabled = btLocked;
    setSlider("bt", btToSlider(S.conf.batTemp));
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
    $("aboutVer").textContent = st.version ? st.version + " · Releases on GitHub" : "…";
    const frag = document.createDocumentFragment();
    for (const [k, v] of rows) {
      const d = document.createElement("div");
      d.className = "fact";
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      if (!hasKsu && k === "Chip") {
        dd.tabIndex = 0;
        dd.setAttribute("role", "button");
        dd.style.cursor = "pointer";
        dd.style.textDecoration = "underline";
        dd.onclick = () => { haptic("click"); pickPreviewChip(); };
      }
      d.append(dt, dd);
      frag.appendChild(d);
    }
    $("facts").replaceChildren(frag);
  }
  function renderChipNote() {
    $("chipNote").hidden = !(S.caps && S.caps.family === "tegra" && !S.ui.noWarn.tegra);
  }
  $("chipNoteHide").onclick = () => {
    haptic("click");
    S.ui.noWarn.tegra = true;
    saveUi();
    renderChipNote();
  };
  function renderStatus() {
    renderChipNote();
    const st = S.status;
    const n = S.conf.apps.size;
    const box = $("status");
    box.hidden = !S.ui.statusCard;
    let title, sum = [], mode, label;
    const off = !S.ui.moduleOn;
    if (off) {
      title = "Module is off";
      sum = ["Turn it on to boost apps."];
      mode = "idle"; label = title + ". " + sum[0];
    } else if (!st.daemon) {
      title = "Checking…"; mode = "idle"; label = "Checking the watcher";
    } else if (st.daemon !== "running") {
      title = "Watcher stopped";
      sum = ["Tap to start it again."];
      mode = "error"; label = "Watcher stopped. Start it";
    } else if (st.active) {
      const p = presetOf(st.preset);
      title = "Boosting " + appOf(st.active).label;
      sum = [{ hl: p.name, lvl: p.lvl }, " is active."];
      mode = "active"; label = title + ", " + p.name + ". Open its settings";
    } else if (n) {
      title = "Module is running";
      sum = [(n === 1 ? "1 app is boosted." : n + " apps are boosted.")];
      mode = "idle"; label = title + ". " + sum[0];
    } else {
      title = "Nothing boosted yet";
      sum = ["Tap an app below to boost it."];
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
      b.setAttribute("aria-describedby", "opt-" + p.id + "-d" + (p.hl ? " opt-" + p.id + "-hl" : ""));
      fxWatch(b);
      b.innerHTML = '<span class="row-text"><span class="row-title"><span class="pn"></span></span><span class="row-sum"></span></span>' +
        '<span class="radio" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><use href="#ic-check"/></svg></span>';
      b.querySelector(".pn").textContent = p.name;
      const sum = b.querySelector(".row-sum");
      sum.id = "opt-" + p.id + "-d";
      sum.appendChild(descEl([p.desc], p.lvl));
      if (p.hl) {
        sum.appendChild(document.createElement("br"));
        const hl = descEl([{ hl: p.hl }], p.lvl).firstChild;
        hl.id = "opt-" + p.id + "-hl";
        sum.appendChild(hl);
      }
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
    const touchRow = $("rowTouch"), thRow = $("rowThermal"), bRow = $("rowBatoc");
    const th = thermalInfo(), bi = batocInfo();
    $("hTitle").textContent = th.title;
    renderAppBt(pkg, e, off);
    if (!e) {
      setSwitch(touchRow, false, true);
      setSwitch(thRow, false, true);
      setSwitch(bRow, false, true);
      $("tSum").textContent = $("hSum").textContent = $("bSum").textContent = "Pick a mode first";
      return;
    }
    const ti = touchInfo(e.preset, !!e.t);
    setSwitch(touchRow, ti.ok ? e.t : true, !ti.ok);
    $("tSum").replaceChildren(...ti.text.map((part) => {
      if (typeof part === "string") return document.createTextNode(part);
      const sp = document.createElement("span");
      sp.className = "hl";
      sp.dataset.lvl = presetOf(part.mode).lvl;
      sp.textContent = part.label || presetName(part.mode);
      return sp;
    }));
    setSwitch(thRow, th.ok && e.h, !th.ok);
    $("hSum").textContent = th.text;
    setSwitch(bRow, bi.ok && e.b, !bi.ok);
    $("bSum").textContent = bi.text;
  }
  const capOn = (k) => !!S.caps && S.caps[k] === "1";
  const btSupported = () => capOn("bat_temp");
  const btUnsupportedText = () => S.caps ? "Not supported on this phone. No battery temp file was found in /sys/class/power_supply, or root can't mount over it."
    : "Couldn't check if this phone supports it.";
  const btLabel = (v) => (v >= BT_MIN ? v + "\u2009°C" : "Default");
  const globalBtLabel = () => (S.conf.batTempOn ? btLabel(S.conf.batTemp) : "off");
  function appBtState(pkg, e) {
    if (e) return { on: !!e.btOn && e.bt != null, v: e.bt != null ? e.bt : 0, chg: !!e.btChg };
    const m = S.ui.btMem[pkg];
    return m ? { on: m.on, v: m.v, chg: !!m.chg } : { on: false, v: 0, chg: false };
  }
  function renderAppBt(pkg, e, off) {
    const sup = btSupported(), st = appBtState(pkg, e);
    const locked = off || !e || !sup;
    setSwitch($("rowAbt"), st.on, locked);
    $("abtSwSum").textContent = !sup ? btUnsupportedText()
      : off ? "Activate module to configure the battery temperature"
      : !e ? "Pick a mode first"
      : st.on ? "This app uses its own battery temperature."
      : "Uses the global setting (" + globalBtLabel() + "). Turn on to use a different temperature for this app.";
    setCollapse($("abtRow"), st.on);
    setCollapse($("rowAbtChg"), st.on, true);
    setSwitch($("rowAbtChg"), st.chg, locked);
    $("abtRow").classList.toggle("locked", locked);
    $("abt").disabled = locked;
    setSlider("abt", btToSlider(st.v));
  }
  const chipLabel = () => (S.caps && FAMILY[S.caps.family]) || "this chip";
  function thermalInfo() {
    let title = "Disable thermal limits", text;
    const c = S.caps;
    if (!c) return { ok: true, title, text: "Turn off the CPU and GPU heat limits." };
    const cdev = +c.th_cdev > 0;
    if (capOn("th_mtk")) text = "Turn off MediaTek's CPU and GPU heat limits.";
    else if (capOn("th_mi") && capOn("th_gpu")) text = "Turn off Xiaomi's CPU and GPU heat limits.";
    else if (capOn("th_mi")) text = "Turn off Xiaomi's CPU heat limits.";
    else if (capOn("th_gpu") && capOn("th_msm")) text = "Turn off the CPU and GPU heat limits.";
    else if (capOn("th_gpu")) { title = "Disable GPU thermal limits"; text = "Turn off the Adreno GPU heat limits."; }
    else if (capOn("th_msm")) text = "Turn off the CPU heat limits.";
    else if (c.family === "pixel" && cdev) text = "Turn off Android's CPU and GPU heat limits. The phone will get noticeably warmer.";
    else if (c.family === "exynos" && (capOn("th_exy") || cdev)) text = "Turn off Samsung's " + (cdev ? "CPU and GPU" : "CPU") + " heat limits.";
    if (!text) {
      const fam = c.family !== "pixel" && c.family !== "exynos" && FAMILY[c.family];
      return { ok: false, title, text: "Not supported on " + (fam ? fam + " chips." : "this phone yet.") };
    }
    return { ok: true, title, text };
  }
  function batocInfo() {
    const c = S.caps;
    if (c && capOn("batoc") && capOn("bat_low")) return { ok: true, text: "Turn off the CPU and GPU slowdowns when the battery is low or under heavy load." };
    if (!c || capOn("batoc")) return { ok: true, text: "Turn off the CPU and GPU slowdowns when the battery is under heavy load." };
    return { ok: false, text: "Not supported on this phone yet." };
  }
  function touchFx(preset) {
    const cfg = S.uperf;
    if (!cfg || !cfg.presets || !cfg.presets[preset]) return null;
    const P = cfg.presets[preset];
    const split = (o, pre) => {
      const r = {};
      for (const k in o || {}) if (k.startsWith(pre)) r[k.slice(pre.length)] = o[k];
      return r;
    };
    const ini = cfg.initials || {};
    const base = Object.assign({}, ini.cpu, split(P["*"], "cpu."));
    const sysBase = Object.assign({}, ini.sysfs, split(P["*"], "sysfs."));
    const at = (h) => Object.assign({}, base, split(P[h], "cpu."));
    const ddr = (h) => +(Object.assign({}, sysBase, split(P[h], "sysfs.")).ddrMin || 0);
    const num = (v) => (isFinite(+v) ? +v : 0);
    const idle = at("idle"), hints = ["touch", "trigger", "gesture"].map(at), junk = at("junk");
    const trig = at("trigger");
    return {
      tap: num(idle.latencyTime) > 0 && trig.latencyTime !== undefined && num(trig.latencyTime) === 0,
      lift: Math.max(...hints.map((x) => num(x.margin))) - num(idle.margin),
      sooner: num(idle.predictThd) > Math.min(...hints.map((x) => num(x.predictThd))) + 0.05,
      burst: num(junk.burst) > num(idle.burst) + 0.05,
      mem: Math.max(ddr("touch"), ddr("trigger"), ddr("gesture"), ddr("junk")) > ddr("idle"),
      always: (P.idle || {})["sched.scene"] === "touch"
    };
  }
  function touchInfo(preset, on) {
  const fx = touchFx(preset);
  if (preset === "fast" || (fx !== null && !(fx.lift > 0.04) && !fx.tap && !fx.burst)) {
    return { ok: false, text: ["Touch boosting is always enabled in this mode."] };
  }
  if (!on) return { ok: true, text: ["Touch boosting is off."] };
  const lead = "Touch boosting is on. The CPU will respond faster to all touches in this app when this feature is on. ";
  if (preset === "performance") {
    return { ok: true, text: [lead.trimEnd()] };
  }
  const cap = preset === "powersave" ? "0.75W" : "~2W";
  const faster = preset === "powersave" ? [{ mode: "balance", label: "Balanced" }, " and ", { mode: "performance" }] : [{ mode: "performance" }];
  return { ok: true, text: [lead + "Slightly snappier in ", ...faster, "."] };
}
const touchOk = (preset) => touchInfo(preset).ok;
function normalizeFlags(c) {
  const thOk = thermalInfo().ok, bOk = batocInfo().ok;
  for (const e of c.apps.values()) {
    if (!touchOk(e.preset)) e.t = 1;
    if (!thOk) e.h = 0;
    if (!bOk) e.b = 0;
  }
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
    const inPill = (x, w) => {
      const s = parseFloat(getComputedStyle(el).getPropertyValue("--psx")) || 1;
      const ext = Math.max(0, (s - 1) * w / 2);
      return clamp(x, ext, Math.max(ext, el.clientWidth - w - ext));
    };
    function place(b, anim) {
      if (!b || !b.offsetWidth) return;
      const still = !anim || !placed || reduceMotion.matches;
      if (still) el.classList.add("no-anim");
      el.style.setProperty("--ix", b.offsetLeft + "px");
      el.style.setProperty("--iw", b.offsetWidth + "px");
      placed = true;
      el.classList.add("placed");
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
    let following = false;
    const g = {
      sync(anim) { if (!following && !st) place(getCurrent(), anim); },
      follow(a, b, p) {
        if (!a || !b || !a.offsetWidth || st) return;
        if (!following) { following = true; el.classList.add("follow"); }
        const t = clamp(p, 0, 1);
        el.style.setProperty("--ix", (a.offsetLeft + (b.offsetLeft - a.offsetLeft) * t).toFixed(1) + "px");
        el.style.setProperty("--iw", (a.offsetWidth + (b.offsetWidth - a.offsetWidth) * t).toFixed(1) + "px");
      },
      release(anim) {
        if (st) return;
        if (following) {
          following = false;
          void el.offsetWidth;
          el.classList.remove("follow");
        }
        place(getCurrent(), anim);
      }
    };
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => { if (!following && !st) place(getCurrent(), false); });
      ro.observe(el);
      for (const b of items()) ro.observe(b);
    }
    g.sync(false);
    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      if (following) { following = false; el.classList.remove("follow"); }
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, hover: -1, lx: e.clientX, lt: performance.now(), vx: 0 };
      if (isPill) {
        el.classList.add("pressing");
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        const bs = items(), x = e.clientX - el.getBoundingClientRect().left;
        const b = bs.find((c) => x >= c.offsetLeft && x < c.offsetLeft + c.offsetWidth);
        if (b) { el.style.setProperty("--ix", inPill(b.offsetLeft, b.offsetWidth) + "px"); st.hover = bs.indexOf(b); }
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
      el.style.setProperty("--ix", (isPill ? inPill(clamp(x - w / 2, lo, hi), w) : clamp(x - w / 2, lo, hi)) + "px");
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
        place(getCurrent(), true);
        return;
      }
      el.classList.remove("dragging");
      suppressUntil = performance.now() + 450;
      const b = items()[s.hover];
      if (!cancel && b && b !== getCurrent()) pick(b);
      place(getCurrent(), true);
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
  const PILL = { track: [0.1, 0.94], settle: [0.44, 0.74], stretch: [0.26, 0.58], lift: [0.32, 0.78] };
  function springGlider(el, getCurrent, pick, opts) {
    const o = Object.assign({ speed: 1, blur: 1, contain: false, threshold: 6, tapSlow: 1, trackSpeed: 1 }, opts);
    let tapK = 1;
    const SETTLE = [PILL.settle[0] * o.speed, PILL.settle[1]], STRETCH = [PILL.stretch[0] * o.speed, PILL.stretch[1]], LIFT = [PILL.lift[0] * o.speed, PILL.lift[1]];
    el.classList.add("spring");
    const ind = el.querySelector(".ind");
    const lens = document.createElement("span");
    lens.className = "lens";
    lens.setAttribute("aria-hidden", "true");
    el.appendChild(lens);
    const items = () => [...el.children].filter((c) => c !== ind && c !== lens && !c.hidden);
    const mid = (b) => b.offsetLeft + b.offsetWidth / 2;
    const c = mkSpring(0), w = mkSpring(0), od = mkSpring(0), s = mkSpring(1), lift = mkSpring(0), dg = mkSpring(0);
    let placed = false, st = null, suppressUntil = 0, noTravelUntil = 0, travel = false, raf = 0, last = 0, lastBk = -1;
    const TRACK = [PILL.track[0] * o.trackSpeed, PILL.track[1]];
    const RUB = 22;
    const rubber = (d) => Math.sign(d) * RUB * (1 - 1 / (Math.abs(d) / RUB * 0.7 + 1));
    const box = { w: 0, h: 0, top: 0, ih: 0 };
    function measure() {
      box.w = el.clientWidth; box.h = el.clientHeight;
      box.top = ind.offsetTop; box.ih = ind.offsetHeight;
    }
    function draw() {
      const m3 = root.dataset.skin === "m3e";
      const lf = clamp(lift.x, 0, 1.25);
      const sx = Math.max(0.6, s.x);
      const base = Math.max(1, w.x);
      let width = Math.max(0, (w.x + Math.abs(od.x)) * sx + (m3 ? 0 : 6 * lf));
      let left = c.x + od.x / 2 - width / 2;
      const squash = clamp((sx - 1) * 0.55 + Math.abs(od.x) / base * 0.35, -0.1, 0.22);
      let sy = (1 + (m3 ? 0 : 0.1 * lf)) * (1 - squash);
      if (o.contain && box.w > 0) {
        const m = 2, lo = m, hi = box.w - m;
        if (width > hi - lo) width = hi - lo;
        if (left < lo) left = lo;
        if (left + width > hi) left = hi - width;
        if (box.ih > 0) sy = Math.min(sy, (box.ih + 2 * Math.max(0, Math.min(box.top, box.h - box.top - box.ih) - m)) / box.ih);
      }
      const tf = "translate3d(" + left.toFixed(2) + "px,0,0) scaleY(" + sy.toFixed(4) + ")";
      const wd = width.toFixed(2) + "px";
      ind.style.width = lens.style.width = wd;
      ind.style.transform = lens.style.transform = tf;
      ind.style.setProperty("--gs", (width / base).toFixed(4));
      const amt = (clamp(dg.x, 0, 1) * 1.25 + Math.min(3.75, Math.abs(sx - 1) * 13 + Math.abs(od.x) * 0.12)) * o.blur;
      const bk = lf < 0.02 ? 0 : Math.round(lf * amt * 4) / 4;
      lens.style.opacity = clamp(lf, 0, 1).toFixed(3);
      if (bk !== lastBk) { lastBk = bk; lens.style.setProperty("--bk", bk + "px"); }
    }
    function track() {
      const geo = st.geo;
      if (!geo.length) return;
      const lo = geo[0].c, hi = geo[geo.length - 1].c;
      const raw = st.fx + st.grab;
      const cl = clamp(raw, lo, hi);
      c.to = cl;
      od.to = rubber(raw - cl);
      let i = 0, best = Infinity;
      geo.forEach((g, k) => { const d = Math.abs(g.c - raw); if (d < best) { best = d; i = k; } });
      w.to = geo[i].w;
      if (i !== st.hover) { if (st.hover >= 0) haptic("tick"); st.hover = i; }
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const dragging = !!(st && st.drag);
      if (dragging) track();
      const mv = dragging || (st && st.press) ? TRACK : SETTLE;
      stepSpring(c, dt, mv[0] * tapK, mv[1]);
      stepSpring(w, dt, mv[0] * tapK, mv[1]);
      stepSpring(od, dt, mv[0] * tapK, mv[1]);
      s.to = 1 + Math.min(0.3, Math.abs(c.v) * o.speed / 2600);
      stepSpring(s, dt, STRETCH[0], STRETCH[1]);
      if (travel && Math.abs(c.x - c.to) < 3) { travel = false; lift.to = 0; }
      stepSpring(lift, dt, LIFT[0], LIFT[1]);
      stepSpring(dg, dt, LIFT[0], 1);
      draw();
      const busy = dragging || (st && st.press) || travel || !springIdle(c, 0.1) || !springIdle(w, 0.1) || !springIdle(od, 0.1) ||
        !springIdle(s, 0.002) || !springIdle(lift, 0.003) || !springIdle(dg, 0.003);
      if (busy) { raf = requestAnimationFrame(frame); return; }
      last = 0;
      for (const sp of [c, w, od, s, lift, dg]) snapSpring(sp, sp.to);
      draw();
    }
    const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const g = {
      sync(anim) {
        const b = getCurrent();
        if (!b || !b.offsetWidth) return;
        if (st && st.drag) return;
        measure();
        const tc = mid(b), tw = b.offsetWidth;
        if (!anim || !placed || reduceMotion.matches) {
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
          snapSpring(c, tc); snapSpring(w, tw); snapSpring(od, 0); snapSpring(s, 1);
          if (!st) { snapSpring(lift, 0); snapSpring(dg, 0); }
          travel = false; placed = true; last = 0;
          draw();
          return;
        }
        if (Math.abs(c.to - tc) > 1 && !st && performance.now() > noTravelUntil) { travel = true; lift.to = 1; }
        c.to = tc; w.to = tw; placed = true;
        kick();
      }
    };
    if ("ResizeObserver" in window) {
      let rw = 0;
      new ResizeObserver(() => {
        if (el.clientWidth === rw) return;
        rw = el.clientWidth;
        if (!st && !raf) g.sync(false);
      }).observe(el);
    }
    g.sync(false);
    el.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      const r = el.getBoundingClientRect();
      const bs = items();
      const geo = bs.map((b) => ({ c: mid(b), w: b.offsetWidth }));
      const x = e.clientX - r.left;
      const cur = getCurrent();
      const ci = bs.indexOf(cur);
      const hi = bs.findIndex((b) => x >= b.offsetLeft && x < b.offsetLeft + b.offsetWidth);
      const onCur = hi >= 0 && hi === ci;
      measure();
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, left: r.left, fx: x, geo, drag: false, hover: hi >= 0 ? hi : ci, grab: onCur ? geo[ci].c - x : 0, press: hi >= 0, onCur };
      tapK = o.tapSlow;
      if (hi >= 0 && !onCur && !reduceMotion.matches) {
        travel = false;
        c.to = geo[hi].c; w.to = geo[hi].w; lift.to = 1;
        kick();
      } else if (onCur && !reduceMotion.matches) { travel = false; lift.to = 1; kick(); }
    });
    el.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      st.fx = e.clientX - st.left;
      if (!st.drag) {
        if (Math.abs(dx) > o.threshold && Math.abs(dx) > Math.abs(dy)) {
          st.drag = true;
          tapK = 1;
          try { el.setPointerCapture(st.id); } catch (err) {}
          el.classList.add("dragging");
          if (o.pauseFx) document.body.classList.add("fx-drag");
          if (!st.onCur) st.grab = 0;
          travel = false;
          if (!reduceMotion.matches) { lift.to = 1; dg.to = 1; }
        } else if (Math.abs(dy) > 10) {
          st = null; lift.to = 0; dg.to = 0; kick();
          return;
        } else return;
      }
      if (reduceMotion.matches) {
        track();
        for (const sp of [c, w, od]) snapSpring(sp, sp.to);
        draw();
        return;
      }
      kick();
    });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st;
      st = null;
      el.classList.remove("dragging");
      if (o.pauseFx) document.body.classList.remove("fx-drag");
      lift.to = 0; dg.to = 0; od.to = 0;
      if (s0.drag) {
        suppressUntil = noTravelUntil = performance.now() + 450;
        const b = items()[s0.hover];
        if (!cancel && b && b !== getCurrent()) pick(b);
      } else if (!cancel) {
        const b = items()[s0.hover];
        if (b && b !== getCurrent()) { suppressUntil = performance.now() + 450; pick(b); }
      }
      g.sync(true);
      kick();
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
  function stretchyBack(btn) {
    const icon = btn.querySelector(".i");
    const tx = mkSpring(0), ty = mkSpring(0), a = mkSpring(0), pz = mkSpring(1), ex = mkSpring(0);
    const CAP = 18, BLUR_MAX = 4.5, A_MAX = 0.2;
    const STRETCH_AT = 4, STRETCH_MAX = 8.82, SQUASH = 0.2;
    let ang = 0;
    const PILL_VARS = ["--bx", "--by", "--ba", "--bsx", "--bsy", "--bix", "--biy", "--bio"];
    const rub = (d) => CAP * (1 - 1 / (d / CAP * 0.55 + 1));
    let st = null, raf = 0, last = 0, lastBl = -1;
    function draw() {
      btn.style.transform = "translate3d(" + tx.x.toFixed(2) + "px," + ty.x.toFixed(2) + "px,0) scale(" + pz.x.toFixed(4) + ")";
      const bl = Math.round((Math.pow(clamp(Math.abs(a.x) / A_MAX, 0, 1), 1.3) * BLUR_MAX + clamp(ex.x / STRETCH_MAX, 0, 1) * 4) * 4) / 4;
      if (bl !== lastBl) { lastBl = bl; icon.style.setProperty("--bbl", bl + "px"); }
      const e = Math.max(-4, ex.x), c = Math.cos(ang), s = Math.sin(ang), k = clamp(e / STRETCH_MAX, 0, 1);
      btn.style.setProperty("--bx", e.toFixed(2) + "px");
      btn.style.setProperty("--by", (e * SQUASH).toFixed(2) + "px");
      btn.style.setProperty("--ba", (ang * 180 / Math.PI).toFixed(1) + "deg");
      btn.style.setProperty("--bsx", (c * e * 0.3).toFixed(2) + "px");
      btn.style.setProperty("--bsy", (s * e * 0.3).toFixed(2) + "px");
      btn.style.setProperty("--bix", (c * Math.max(0, e) * 0.3).toFixed(2) + "px");
      btn.style.setProperty("--biy", (s * Math.max(0, e) * 0.3).toFixed(2) + "px");
      btn.style.setProperty("--bio", (1 - Math.pow(k, 1.4) * 0.92).toFixed(3));
    }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      const held = !!st;
      const mv = held ? [0.12, 0.9] : [0.42, 0.52];
      stepSpring(tx, dt, mv[0], mv[1]);
      stepSpring(ty, dt, mv[0], mv[1]);
      stepSpring(a, dt, held ? 0.14 : 0.36, held ? 0.9 : 0.42);
      stepSpring(pz, dt, 0.3, held ? 0.72 : 0.55);
      stepSpring(ex, dt, held ? 0.2 : 0.42, held ? 0.86 : 0.48);
      draw();
      if (held || !springIdle(tx, 0.05) || !springIdle(ty, 0.05) || !springIdle(a, 0.0008) || !springIdle(pz, 0.0008) || !springIdle(ex, 0.05)) {
        raf = requestAnimationFrame(frame);
        return;
      }
      last = 0;
      for (const sp of [tx, ty, a, pz, ex]) snapSpring(sp, sp.to);
      btn.style.transform = "";
      for (const v of PILL_VARS) btn.style.removeProperty(v);
      icon.style.removeProperty("--bbl");
      lastBl = -1;
    }
    const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    btn.addEventListener("pointerdown", (e) => {
      if (e.button || root.dataset.skin !== "miuix" || reduceMotion.matches) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId };
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      btn.classList.add("pressed");
      pz.to = 1.12;
      kick();
    });
    btn.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y, d = Math.hypot(dx, dy);
      if (d < 0.5) { tx.to = ty.to = a.to = ex.to = 0; return; }
      const r = rub(d);
      const over = Math.max(0, d - STRETCH_AT);
      ex.to = STRETCH_MAX * (1 - 1 / (over / STRETCH_MAX * 0.45 + 1));
      if (d > 4) ang = Math.atan2(dy, dx);
      tx.to = dx / d * r;
      ty.to = dy / d * r;
      a.to = r / CAP * A_MAX;
      kick();
    });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st;
      st = null;
      btn.classList.remove("pressed");
      tx.to = ty.to = a.to = ex.to = 0;
      pz.to = 1;
      kick();
      const d = Math.hypot(e.clientX - s0.x, e.clientY - s0.y);
      if (!cancel && d < 44) history.back();
    };
    btn.addEventListener("pointerup", (e) => end(e, false));
    btn.addEventListener("pointercancel", (e) => end(e, true));
    btn.addEventListener("click", (e) => {
      if (e.detail > 0 && root.dataset.skin === "miuix" && !reduceMotion.matches) return;
      history.back();
    });
  }
  function setSlider(id, v) {
    const inp = $(id);
    if (!$(id + "Slider").classList.contains("pressed")) inp.value = v;
    paintSlider(id);
  }
  function paintSlider(id) {
    const inp = $(id);
    const min = +inp.min, max = +inp.max, v = +inp.value;
    $(id + "Slider").style.setProperty("--p", ((v - min) / (max - min)).toFixed(4));
    if (id === "bt" || id === "abt") { paintTemp(id, v); return; }
    $(id + "Val").textContent = id === "ed" && v === 0 ? "Right away" : v + "\u200As";
    inp.setAttribute("aria-valuetext", id === "ed" && v === 0 ? "right away" : v + " seconds");
  }
  const BT_COLORS = [[53,102,199],[55,116,207],[59,129,215],[63,143,224],[66,156,230],[63,169,229],[41,169,210],[0,164,190],
    [0,159,170],[0,154,149],[0,152,128],[0,162,117],[0,174,111],[39,185,107],[67,197,101],[95,206,85],[98,194,62],[93,182,47],
    [90,169,33],[89,157,17],[100,145,0],[131,142,0],[157,143,0],[182,144,0],[206,144,0],[227,137,0],[234,122,12],[233,105,26],
    [228,88,34],[223,69,40],[219,44,43]];
  function tempColor(v) {
    const c = BT_COLORS[v - BT_MIN];
    return c ? "rgb(" + c.join(",") + ")" : "";
  }
  const BLUR_MAX = 24, BLUR_MS = 120, ANIM_MS = 150;
  function blurFrames(show) {
    const out = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, w = 7.43;
      const q = i === 16 ? 1 : 1 - Math.exp(-w * t) * (1 + w * t);
      const b = BLUR_MAX * Math.pow(show ? 1 - q : q, 0.7);
      out.push({ offset: (t * BLUR_MS) / ANIM_MS, filter: "blur(" + b.toFixed(2) + "px)" });
    }
    out.push({ offset: 1, filter: "blur(" + (show ? 0 : BLUR_MAX) + "px)" });
    return out;
  }
  const SPRING = "linear(0, 0.0231, 0.0796, 0.1546, 0.2381, 0.3232, 0.4058, 0.4832, 0.5541, 0.6177, 0.6742, 0.7236, 0.7666, 0.8036, 0.8353, 0.8623, 0.8852, 0.9045, 0.9207, 0.9343, 0.9457, 0.9552, 0.9631, 0.9696, 0.975, 0.9795, 0.9832, 0.9862, 0.9887, 0.9908, 0.9925, 0.9939, 1)";
  const collapseAnimEls = new Set();
  let followRaf = 0;
  function followExpand(el) {
    const scr = el.closest(".screen");
    if (!scr) return;
    cancelAnimationFrame(followRaf);
    const gap = 24;
    const want = () => scr.scrollTop + el.getBoundingClientRect().bottom - scr.getBoundingClientRect().bottom + gap;
    const max = () => Math.max(0, scr.scrollHeight - scr.clientHeight);
    if (!el._anim) {
      const y = Math.min(max(), want());
      if (y > scr.scrollTop) scr.scrollTop = y;
      return;
    }
    const sp = mkSpring(scr.scrollTop);
    let last = 0;
    const stop = () => {
      cancelAnimationFrame(followRaf);
      followRaf = 0;
      scr.removeEventListener("pointerdown", stop);
      scr.removeEventListener("touchstart", stop);
      scr.removeEventListener("wheel", stop);
    };
    scr.addEventListener("pointerdown", stop);
    scr.addEventListener("touchstart", stop, { passive: true });
    scr.addEventListener("wheel", stop, { passive: true });
    const frame = (now) => {
      if (Math.abs(scr.scrollTop - sp.x) > 2) { stop(); return; }
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      sp.to = Math.min(max(), Math.max(sp.to, want()));
      stepSpring(sp, dt, 0.22, 1);
      scr.scrollTop = sp.x;
      if (!el._anim && springIdle(sp, 0.5)) { scr.scrollTop = sp.to; stop(); return; }
      followRaf = requestAnimationFrame(frame);
    };
    followRaf = requestAnimationFrame(frame);
  }
  function setCollapse(el, show, follow) {
    const animate = collapseAnimEls.delete(el);
    const shown = !el.hidden && el.dataset.closing !== "1";
    if (show === shown) return;
    if (el._anim) { el._anim.forEach((a) => a.cancel()); el._anim = null; }
    el.style.overflow = "";
    el.dataset.closing = "";
    if (!animate || reduceMotion.matches || !el.animate) {
      el.hidden = !show;
      if (follow && animate && show) followExpand(el);
      return;
    }
    el.hidden = false;
    const cs = getComputedStyle(el);
    const gap = parseFloat(getComputedStyle(el.parentElement).rowGap) || 0;
    const full = { height: el.offsetHeight + "px", minHeight: cs.minHeight === "auto" ? "0px" : cs.minHeight, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, marginTop: cs.marginTop, opacity: 1 };
    const zero = { height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", marginTop: -gap + "px", opacity: 0 };
    el.style.overflow = "hidden";
    if (!show) el.dataset.closing = "1";
    const a = el.animate(show ? [zero, full] : [full, zero], { duration: ANIM_MS, easing: SPRING });
    el._anim = [a];
    if (root.dataset.skin === "miuix") el._anim.push(el.animate(blurFrames(show), { duration: ANIM_MS, easing: "linear" }));
    a.onfinish = () => {
      el._anim = null;
      el.style.overflow = "";
      if (!show) { el.hidden = true; el.dataset.closing = ""; }
    };
    if (follow && show) followExpand(el);
  }
  function paintTemp(id, v) {
    const inp = $(id);
    const val = $(id + "Val");
    val.textContent = btLabel(v);
    val.style.color = tempColor(v);
    inp.setAttribute("aria-valuetext", v >= BT_MIN ? v + " degrees Celsius" + (v <= 15 ? ", cold" : v >= 35 ? ", hot" : "") : "default, real temperature");
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
      st = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, axis: "" };
      try { s.setPointerCapture(e.pointerId); } catch (err) {}
      clearTimeout(snackTimer);
      s.style.transition = "none";
    });
    s.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.axis && Math.hypot(dx, dy) > 6) st.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      if (st.axis === "y") {
        const y = dy > 0 ? dy : dy * 0.2;
        s.style.translate = "0 " + y + "px";
        s.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / 140));
      } else if (st.axis === "x") {
        s.style.translate = dx + "px 0";
        s.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 260));
      }
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y, dt = Math.max(1, performance.now() - st.t), axis = st.axis;
      const v = dx / dt, vy = dy / dt;
      st = null;
      s.style.transition = "";
      if (axis === "y" && (dy > 44 || (dy > 12 && vy > .4))) {
        s.style.translate = "0 " + (s.offsetHeight + 120) + "px";
        s.style.opacity = "0";
        haptic("tick");
        setTimeout(() => { s.classList.remove("show"); s.hidden = true; s.style.translate = s.style.opacity = ""; }, 220);
      } else if (axis === "x" && (Math.abs(dx) > 90 || Math.abs(v) > .5)) {
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
  function dialog({ title, body, buttons, warn, icon, lvl, extra, check, sheet }) {
    return new Promise((resolve) => {
      dlgReturn = document.activeElement;
      document.querySelector("#dlg .dialog").classList.toggle("sheet", !!sheet || root.dataset.skin === "miuix");
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
      $("dlgIcon").hidden = !(warn || icon);
      $("dlgIcon").querySelector("use").setAttribute("href", icon === "refresh" ? "#ic-refresh-" + (root.dataset.skin === "miuix" ? "mx" : "m3") : "#ic-warn");
      if (icon) $("dlgIcon").dataset.kind = icon; else delete $("dlgIcon").dataset.kind;
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
    const EXMAX = .05, ex = mkSpring(0);
    let st = null, exRaf = 0, exT = 0;
    const mx = () => root.dataset.skin === "miuix";
    const setExtra = (x) => {
      if (x === 0) { box.style.scale = ""; box.style.transformOrigin = ""; }
      else { box.style.transformOrigin = "50% 100%"; box.style.scale = (1 + x).toFixed(4); }
    };
    const resetExtra = () => { cancelAnimationFrame(exRaf); exRaf = 0; snapSpring(ex, 0); setExtra(0); };
    const exFrame = (now) => {
      exRaf = 0;
      const dt = Math.min(.034, Math.max(0, (now - exT) / 1000));
      exT = now;
      stepSpring(ex, dt, .3, .5);
      if (springIdle(ex, .0005)) { snapSpring(ex, 0); setExtra(0); return; }
      setExtra(Math.max(-.02, ex.x));
      exRaf = requestAnimationFrame(exFrame);
    };
    const retract = () => {
      ex.to = 0;
      cancelAnimationFrame(exRaf);
      exT = performance.now();
      exRaf = requestAnimationFrame(exFrame);
    };
    box.addEventListener("pointerdown", (e) => {
      if (e.button || e.target.closest("button, input, label, .slider, .sort-list")) return;
      if (!e.target.closest(".dlg-grip") && box.scrollTop > 0) return;
      st = { y: e.clientY, x: e.clientX, t: performance.now(), id: e.pointerId, drag: false, down: false, up: false, cap: 0 };
    });
    box.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dy = e.clientY - st.y, dx = e.clientX - st.x;
      if (!st.drag) {
        if (dy > 8 && dy > Math.abs(dx)) {
          st.drag = true;
          try { box.setPointerCapture(st.id); } catch (err) {}
        } else if (mx() && dy < -8 && -dy > Math.abs(dx)) {
          st.drag = true;
          try { box.setPointerCapture(st.id); } catch (err) {}
          resetExtra();
          st.cap = clamp((window.innerWidth - 8) / box.offsetWidth - 1, 0, EXMAX);
          st.len = Math.max(20, st.cap * box.offsetHeight);
        } else if (Math.abs(dx) > 10 || dy < -10) { st = null; return; } else return;
      }
      if (dy > 0 || !mx()) {
        if (!st.down) { st.down = true; box.style.transition = "none"; }
        if (st.up) { st.up = false; box.classList.remove("dlg-glow"); resetExtra(); }
        box.style.translate = "0 " + Math.max(0, dy) + "px";
      } else {
        if (st.down) { st.down = false; box.style.transition = ""; box.style.translate = ""; }
        if (!st.up) { st.up = true; box.classList.add("dlg-glow"); haptic("tick"); }
        const up = -dy;
        snapSpring(ex, st.cap * (1 - Math.exp(-up / st.len)));
        setExtra(ex.x);
      }
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const s0 = st;
      st = null;
      if (!s0.drag) return;
      const dy = e.clientY - s0.y, v = dy / Math.max(1, performance.now() - s0.t);
      box.style.transition = "";
      box.classList.remove("dlg-glow");
      if (dy > 110 || v > .6) {
        resetExtra();
        box.style.translate = "0 " + (window.innerHeight * .6) + "px";
        haptic("tick");
        closeDialog(undefined);
        setTimeout(() => { box.style.translate = ""; }, 260);
      } else {
        box.style.translate = "";
        if (ex.x > .0005) retract(); else resetExtra();
      }
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
  let tapGate = 0;
  function lockBehind(on) {
    tapGate = performance.now() + 280;
    document.body.classList.toggle("modal", on);
    for (const el of document.querySelectorAll(".screen, .pillnav")) el.inert = on || el.hasAttribute("data-off");
  }
  let swallowClick = false;
  document.addEventListener("pointerdown", () => { swallowClick = false; }, true);
  const tapBusy = () => document.body.classList.contains("modal") || !!document.querySelector(".dd-layer:not([hidden]), .scrim.show");
  document.addEventListener("pointerdown", () => { document.documentElement.classList.toggle("tap-mute", tapBusy() || performance.now() < tapGate); }, true);
  let muteT = 0;
  for (const t of ["pointerup", "pointercancel"]) document.addEventListener(t, () => {
    clearTimeout(muteT);
    muteT = setTimeout(() => document.documentElement.classList.remove("tap-mute"), 280);
  }, true);
  document.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  function swallowNextClick() {
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 600);
  }
  function lockSoon() {
    requestAnimationFrame(() => setTimeout(() => {
      if (document.querySelector(".scrim.show") || (dd.open && !dd.closing)) lockBehind(true);
    }, 0));
  }
  function unlockSoon() {
    requestAnimationFrame(() => {
      if (document.querySelector(".scrim.show") || (dd.open && !dd.closing)) return;
      lockBehind(false);
    });
  }
  function openScrim(el) {
    const bd = el.querySelector(".dialog.busy");
    if (bd) bd.classList.toggle("sheet", root.dataset.skin === "miuix");
    el.hidden = false;
    void el.offsetHeight;
    el.classList.add("show");
    lockSoon();
  }
  function closeScrim(el) {
    el.classList.remove("show");
    unlockSoon();
    setTimeout(() => {
      if (!el.classList.contains("show")) el.hidden = true;
    }, reduceMotion.matches ? 0 : el.querySelector(".dialog.sheet") && root.dataset.skin === "miuix" ? 230 : 200);
  }
  $("dlg").addEventListener("pointerdown", (e) => { if (e.target === $("dlg") && !e.button) { swallowNextClick(); closeDialog(undefined); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("dlg").hidden) closeDialog(undefined); });
  const DD_OPTS = {
    skin: { get: () => S.ui.skin, set: (v) => setSkin(v), later: true, items: [["miuix", "Miuix"], ["m3e", "Material 3 Expressive"]] },
    theme: { get: () => S.ui.theme, set: (v) => setTheme(v), later: false, items: [["system", "System default"], ["light", "Light"], ["dark", "Dark"]] }
  };
  const DD_RADIUS = 40;
  const DD_SPRING = {
    open: { pos: [0.272, 0.7], w: [0.272, 0.7], h: [0.272, 0.7] },
    close: { pos: [0.211, 1], w: [0.211, 1], h: [0.211, 1] }
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const dd = { open: false, closing: false, key: "", opt: null, trig: null, mode: "", picked: undefined, raf: 0, t0: 0, timer: 0, sp: null, par: null, from: null, to: null, drag: null, draggedUntil: 0 };
  function ddInset(name) {
    return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
  }
  function ddReopen() {
    dd.blurOff = 0;
    dd.closing = false;
    dd.picked = undefined;
    $("ddLayer").classList.remove("out");
    lockSoon();
    dd.trig.classList.add("morph");
    const cur = dd.opt.get();
    for (const b of $("ddList").children) b.setAttribute("aria-selected", b.dataset.val === cur ? "true" : "false");
    dd.par = DD_SPRING.open;
    for (const k in dd.sp) dd.sp[k].to = 1;
    haptic("tick");
    cancelAnimationFrame(dd.raf);
    dd.t0 = performance.now();
    dd.raf = requestAnimationFrame(ddFrame);
  }
  function ddOpen(key, trig) {
    if (dd.open) {
      if (!dd.closing) return;
      if (dd.mode === "mx" && dd.trig === trig && (dd.picked === undefined || !dd.opt.later) && !reduceMotion.matches) { ddReopen(); return; }
      ddFinish();
    }
    const o = DD_OPTS[key], layer = $("ddLayer"), shell = $("ddShell"), list = $("ddList");
    const mx = root.dataset.skin === "miuix", cur = o.get();
    list.replaceChildren();
    o.items.forEach(([val, name], i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dd-item";
      b.dataset.val = val;
      b.tabIndex = -1;
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", val === cur ? "true" : "false");
      b.style.setProperty("--i", i);
      const n = document.createElement("span");
      n.className = "dd-name";
      n.textContent = name;
      b.appendChild(n);
      b.insertAdjacentHTML("beforeend", '<svg class="i dd-tick" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-check"/></svg>');
      list.appendChild(b);
    });
    list.setAttribute("aria-labelledby", trig.querySelector(".dd-title").id);
    dd.blurOff = 0;
    dd.open = true; dd.closing = false; dd.key = key; dd.opt = o; dd.trig = trig; dd.mode = mx ? "mx" : "m3"; dd.picked = undefined;
    layer.classList.remove("show", "out", "kb");
    layer.removeAttribute("data-up");
    shell.style.cssText = "visibility:hidden";
    list.style.cssText = "";
    layer.hidden = false;
    lockSoon();
    trig.classList.add("open");
    trig.setAttribute("aria-expanded", "true");
    haptic("tick");
    const vw = window.innerWidth, vh = window.innerHeight, insT = ddInset("--inset-top"), insB = ddInset("--inset-bottom");
    if (mx) {
      list.style.width = "max-content";
      list.style.maxWidth = (vw - 26) + "px";
      const lw = Math.ceil(list.getBoundingClientRect().width) + 1, lh = list.offsetHeight;
      const ir = trig.querySelector(".dd-ic-mx").getBoundingClientRect();
      const sl = ir.left, sr = ir.right;
      const st = ir.top, sb = ir.bottom;
      const W = clamp(lw + 2, 184, vw - 24), H = Math.min(lh + 2, vh - 24 - insT - insB);
      const L = clamp(sr - W, 12, vw - 12 - W), T = clamp(st - 4, 12 + insT, vh - 12 - insB - H);
      list.style.maxWidth = "";
      list.style.width = (W - 2) + "px";
      list.style.height = (H - 2) + "px";
      if (lh + 2 > H) list.style.overflowY = "auto";
      dd.from = { cx: (sl + sr) / 2, cy: (st + sb) / 2, w: (sr - sl) * .5, h: (sb - st) * .5 };
      dd.to = { l: L, t: T, w: W, h: H };
      dd.to.cx = L + W / 2;
      dd.to.cy = T + H / 2;
      shell.style.left = L.toFixed(2) + "px";
      shell.style.top = T.toFixed(2) + "px";
      shell.style.width = W + "px";
      shell.style.height = H + "px";
      dd.sp = { pos: mkSpring(0), w: mkSpring(0), h: mkSpring(0) };
      dd.sp.pos.to = dd.sp.w.to = dd.sp.h.to = 1;
      dd.par = DD_SPRING.open;
      trig.classList.add("morph");
      if (reduceMotion.matches) for (const k in dd.sp) snapSpring(dd.sp[k], 1);
      ddPaint();
      shell.style.visibility = "";
      if (!reduceMotion.matches) {
        dd.t0 = performance.now();
        dd.raf = requestAnimationFrame(ddFrame);
      }
    } else {
      const fr = trig.getBoundingClientRect();
      shell.style.left = fr.left + "px";
      shell.style.top = "0px";
      shell.style.width = fr.width + "px";
      const h = shell.offsetHeight, below = vh - fr.bottom - 12 - insB, above = fr.top - 12 - insT;
      const up = h > below && above > below, H = Math.min(h, up ? above : below);
      shell.style.maxHeight = H + "px";
      shell.style.top = (up ? fr.top - H : fr.bottom) + "px";
      if (up) layer.dataset.up = "";
      shell.style.visibility = "";
      void layer.offsetHeight;
      layer.classList.add("show");
    }
    setTimeout(() => {
      if (!dd.open || dd.closing) return;
      const f = list.querySelector('[aria-selected="true"]') || list.firstChild;
      if (f) f.focus({ preventScroll: true });
    }, 30);
  }
  function ddPaint() {
    const sh = $("ddShell").style, sp = dd.sp, a = dd.from, b = dd.to;
    const cx = lerp(a.cx, b.cx, sp.pos.x), cy = lerp(a.cy, b.cy, sp.pos.x);
    const w = Math.max(2, lerp(a.w, b.w, sp.w.x)), h = Math.max(2, lerp(a.h, b.h, sp.h.x));
    const sx = w / b.w, sy = h / b.h, tx = cx - b.cx, ty = cy - b.cy;
    sh.transform = "translate(" + tx.toFixed(2) + "px," + ty.toFixed(2) + "px) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")";
    const r = Math.min(DD_RADIUS, w / 2, h / 2);
    sh.borderRadius = (r / sx).toFixed(2) + "px / " + (r / sy).toFixed(2) + "px";
    sh.opacity = Math.min(1, Math.max(sp.w.x, sp.h.x, 0) * 8).toFixed(3);
    const ls = $("ddList").style;
    const lo = clamp((Math.min(sp.w.x, sp.h.x) - 0.15) / 0.5, 0, 1);
    ls.opacity = (lo * lo * (3 - 2 * lo)).toFixed(3);
    const prog = clamp(Math.min(sp.w.x, sp.h.x), 0, 1);
    const vel = Math.max(Math.abs(sp.w.v), Math.abs(sp.h.v));
    const tail = dd.closing ? 0 : clamp(vel * 0.12, 0, 0.35);
    const full = !dd.closing && Math.min(sp.w.x, sp.h.x) >= 1;
    if (full && !dd.blurOff) dd.blurOff = performance.now();
    const end = dd.blurOff && !dd.closing ? 1 - clamp((performance.now() - dd.blurOff) / 60, 0, 1) : 1;
    const k = clamp(Math.max(Math.pow(1 - prog, 0.7), tail), 0, 1) * end;
    sh.setProperty("--dd-ob", (k * 20).toFixed(2) + "px");
    sh.setProperty("--dd-sat", (k * 1.6).toFixed(2));
    if (lo === 0) { ls.transform = "none"; return; }
    const isx = 1 / sx, isy = 1 / sy, c0x = b.w / 2 - 1, c0y = b.h / 2 - 1;
    ls.transform = "translate(" + (c0x * (1 - isx) - tx * isx).toFixed(2) + "px," + (c0y * (1 - isy) - ty * isy).toFixed(2) + "px) scale(" + isx.toFixed(4) + "," + isy.toFixed(4) + ")";
  }
  function ddRelaxStretch(soft) {
    const shell = $("ddShell");
    shell.classList.remove("dd-stretching");
    shell.classList.toggle("dd-relax", !!soft);
    if (soft) setTimeout(() => shell.classList.remove("dd-relax"), 600);
    shell.style.setProperty("--dd-sx", "1");
    shell.style.setProperty("--dd-sy", "1");
    shell.style.setProperty("--dd-tx", "0px");
    shell.style.setProperty("--dd-ty", "0px");
    shell.style.setProperty("--dd-gl", "0");
    shell.style.setProperty("--dd-bl", "0px");
    if (dd.to) shell.style.borderRadius = Math.min(DD_RADIUS, dd.to.w / 2, dd.to.h / 2).toFixed(2) + "px";
  }
  function ddTrackGlow(e) {
    const r = ddShell.getBoundingClientRect();
    ddShell.style.setProperty("--dd-glow-x", clamp((e.clientX - r.left) / Math.max(1, r.width) * 100, 0, 100).toFixed(1) + "%");
    ddShell.style.setProperty("--dd-glow-y", clamp((e.clientY - r.top) / Math.max(1, r.height) * 100, 0, 100).toFixed(1) + "%");
  }
  function ddFrame(now) {
    dd.raf = 0;
    if (!dd.open) return;
    const dt = Math.min(0.05, Math.max(0, (now - dd.t0) / 1000)), sp = dd.sp, par = dd.par;
    dd.t0 = now;
    stepSpring(sp.pos, dt, par.pos[0], par.pos[1]);
    stepSpring(sp.w, dt, par.w[0], par.w[1]);
    stepSpring(sp.h, dt, par.h[0], par.h[1]);
    if (dd.closing) {
      if (sp.w.x < 0.25 && sp.h.x < 0.25) dd.trig.classList.remove("morph");
      if (sp.w.x < 0.03 && sp.h.x < 0.03) { ddFinish(); return; }
    }
    ddPaint();
    if (springIdle(sp.pos, 0.002) && springIdle(sp.w, 0.002) && springIdle(sp.h, 0.002)) {
      const to = sp.pos.to;
      for (const k in sp) snapSpring(sp[k], to);
      ddPaint();
      if (dd.closing) ddFinish();
      return;
    }
    dd.raf = requestAnimationFrame(ddFrame);
  }
  function ddClose(v, instant) {
    if (!dd.open || (dd.closing && !instant)) return;
    dd.closing = true;
    dd.picked = v;
    dd.drag = null;
    ddRelaxStretch();
    $("ddLayer").classList.add("out");
    unlockSoon();
    if (instant || reduceMotion.matches) { ddFinish(); return; }
    if (dd.mode === "mx") {
      dd.par = DD_SPRING.close;
      dd.sp.pos.to = dd.sp.w.to = dd.sp.h.to = 0;
      cancelAnimationFrame(dd.raf);
      dd.t0 = performance.now();
      dd.raf = requestAnimationFrame(ddFrame);
    } else {
      $("ddLayer").classList.remove("show");
      dd.timer = setTimeout(ddFinish, 112.5);
    }
  }
  function ddFinish() {
    clearTimeout(dd.timer);
    cancelAnimationFrame(dd.raf);
    dd.raf = 0;
    const layer = $("ddLayer"), trig = dd.trig, o = dd.opt, v = dd.picked;
    layer.hidden = true;
    layer.classList.remove("show", "out");
    $("ddShell").style.cssText = "";
    $("ddShell").classList.remove("dd-stretching", "dd-glow-active", "dd-relax");
    dd.drag = null;
    $("ddList").style.cssText = "";
    $("ddList").replaceChildren();
    trig.classList.remove("open", "morph");
    trig.setAttribute("aria-expanded", "false");
    dd.open = false;
    dd.closing = false;
    if (!document.querySelector(".scrim.show")) lockBehind(false);
    try { trig.focus({ preventScroll: true }); } catch (e) {}
    if (o.later && v !== undefined && v !== o.get()) o.set(v);
  }
  function ddPick(v) {
    if (!dd.open || dd.closing) return;
    haptic("click");
    if (!dd.opt.later && v !== dd.opt.get()) dd.opt.set(v);
    ddClose(v);
  }
  for (const k in DD_OPTS) {
    const b = $(k + "Dd");
    b.addEventListener("click", () => ddOpen(k, b));
  }
  $("ddLayer").addEventListener("pointerdown", (e) => {
    if (e.target !== $("ddLayer")) return;
    e.preventDefault();
    swallowNextClick();
    if (dd.closing && dd.mode === "mx" && dd.trig && !reduceMotion.matches) {
      const r = dd.trig.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { ddOpen(dd.key, dd.trig); return; }
    }
    ddClose(undefined);
  });
  const ddShell = $("ddShell");
  ddShell.addEventListener("pointerenter", (e) => {
    if (dd.open && !dd.closing && e.pointerType === "mouse") {
      ddShell.classList.add("dd-glow-active");
      ddTrackGlow(e);
    }
  });
  ddShell.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") ddShell.classList.remove("dd-glow-active");
  });
  ddShell.addEventListener("pointerdown", (e) => {
    if (!dd.open || dd.closing || dd.mode !== "mx" || e.button !== 0) return;
    ddShell.classList.add("dd-glow-active");
    ddTrackGlow(e);
    dd.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), vx: 0, vy: 0, active: false, axis: null };
  });
  ddShell.addEventListener("pointermove", (e) => {
    if (dd.open && !dd.closing && (e.pointerType === "mouse" || dd.drag && e.pointerId === dd.drag.id)) ddTrackGlow(e);
    const d = dd.drag;
    if (!d || e.pointerId !== d.id || dd.closing) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y, now = performance.now();
    d.vx = d.vx * .6 + .4 * ((e.clientX - d.lx) / Math.max(1, now - d.lt));
    d.vy = d.vy * .6 + .4 * ((e.clientY - d.ly) / Math.max(1, now - d.lt));
    d.lx = e.clientX; d.ly = e.clientY; d.lt = now;
    if (!d.active && Math.hypot(dx, dy) > 6) {
      d.active = true;
      d.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      try { ddShell.setPointerCapture(e.pointerId); } catch (err) {}
      ddShell.classList.add("dd-stretching");
    }
    if (!d.active) return;
    e.preventDefault();
    const speed = Math.min(.045, Math.hypot(d.vx, d.vy) * .032);
    const primary = d.axis === "x" ? dx : dy;
    const cross = d.axis === "x" ? dy : dx;
    let sx, sy, tx, ty, intensity;
    if (d.axis === "x") {
      const amount = Math.min(.13, Math.abs(primary) / 620) + speed;
      sx = 1 + amount;
      sy = 1 - amount * .32;
      tx = clamp(primary * .10, -24, 24);
      ty = clamp(cross * .035, -5, 5);
      intensity = Math.abs(primary) / 110;
    } else {
      const amount = Math.min(.12, Math.abs(primary) / 520) + speed;
      sx = 1 - amount * .22;
      sy = 1 + amount;
      tx = clamp(cross * .035, -5, 5);
      ty = clamp(primary * .10, -22, 22);
      intensity = Math.abs(primary) / 100;
    }
    ddShell.style.setProperty("--dd-sx", sx.toFixed(3));
    ddShell.style.setProperty("--dd-sy", sy.toFixed(3));
    const baseRadius = Math.min(DD_RADIUS, dd.to.w / 2, dd.to.h / 2);
    ddShell.style.borderRadius = (baseRadius / sx).toFixed(2) + "px / " + (baseRadius / sy).toFixed(2) + "px";
    ddShell.style.setProperty("--dd-tx", tx.toFixed(1) + "px");
    ddShell.style.setProperty("--dd-ty", ty.toFixed(1) + "px");
    ddShell.style.setProperty("--dd-gl", String(Math.round(Math.min(.62, .28 + speed + intensity * .12) * 100) / 100));
    ddShell.style.setProperty("--dd-bl", (Math.round(Math.min(6, intensity * 1.5) * 4) / 4).toFixed(2) + "px");
  });
  function ddEndDrag(e) {
    const d = dd.drag;
    if (!d || e.pointerId !== d.id) return;
    dd.drag = null;
    if (d.active) {
      dd.draggedUntil = performance.now() + 350;
      try { if ($("ddShell").hasPointerCapture(e.pointerId)) $("ddShell").releasePointerCapture(e.pointerId); } catch (err) {}
      ddRelaxStretch(true);
    }
    ddShell.classList.remove("dd-glow-active");
  }
  $("ddShell").addEventListener("pointerup", ddEndDrag);
  $("ddShell").addEventListener("pointercancel", ddEndDrag);
  $("ddList").addEventListener("click", (e) => {
    if (performance.now() < dd.draggedUntil) { e.preventDefault(); e.stopPropagation(); return; }
    const b = e.target.closest(".dd-item");
    if (b) ddPick(b.dataset.val);
  });
  document.addEventListener("keydown", (e) => {
    if (!dd.open || dd.closing) return;
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); ddClose(undefined); return; }
    const its = [...$("ddList").children], i = its.indexOf(document.activeElement);
    $("ddLayer").classList.add("kb");
    let n;
    if (e.key === "ArrowDown") n = (i + 1) % its.length;
    else if (e.key === "ArrowUp") n = (i <= 0 ? its.length : i) - 1;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = its.length - 1;
    else return;
    e.preventDefault();
    its[n].focus({ preventScroll: true });
  });
  window.addEventListener("resize", () => ddClose(undefined, true));
  window.addEventListener("popstate", () => ddClose(undefined, true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) ddClose(undefined, true); });
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
  const backFx = () => root.dataset.skin === "miuix" && !reduceMotion.matches;
  function grainTile(node) {
    const px = 256 / (window.devicePixelRatio || 1);
    node.style.background = "url(assets/grain.png) 0 0 / " + px + "px " + px + "px";
    node.style.imageRendering = "pixelated";
  }
  const Veil = (() => {
    let el = null, lo = null, hi = null, gr = null, anims = [];
    function ensure() {
      if (el) return;
      el = document.createElement("div");
      el.className = "back-veil";
      el.setAttribute("aria-hidden", "true");
      el.hidden = true;
      lo = document.createElement("i");
      lo.className = "bv-lo";
      hi = document.createElement("i");
      hi.className = "bv-hi";
      gr = document.createElement("i");
      gr.className = "bv-grain";
      grainTile(gr);
      el.append(lo, hi, gr);
      document.body.appendChild(el);
    }
    const FLOOR = 0.25;
    const ease = (q) => { q = clamp(q, 0, 1); return q + 1.5 * q * Math.pow(1 - q, 6); };
    const strength = (q, floor) => floor ? FLOOR + (1 - FLOOR) * ease(q) : ease(q);
    const parts = (q, floor) => { const v = strength(q, floor === undefined ? true : floor); return [clamp(v * 2, 0, 1), clamp(v * 2 - 1, 0, 1)]; };
    function stop() { const a = anims; anims = []; for (const x of a) x.cancel(); }
    function paint(q) {
      const [a, b] = q <= 0 ? [0, 0] : parts(q);
      lo.style.opacity = a.toFixed(3);
      hi.style.opacity = b.toFixed(3);
      gr.style.opacity = ((a + b) / 2).toFixed(3);
    }
    function set(q) { ensure(); stop(); el.hidden = false; paint(q); }
    function off() { if (!el) return; stop(); el.hidden = true; paint(0); }
    function animate(from, to, duration, easing) {
      ensure(); stop(); el.hidden = false; paint(to);
      const n = 10, fa = [], fb = [], fg = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, q = from + (to - from) * t;
        const fade = to <= 0 ? clamp((1 - t) / 0.35, 0, 1) : from <= 0 ? clamp(t / 0.35, 0, 1) : 1;
        let [a, b] = parts(q);
        if (fade < 1) { const v = strength(q, true) * fade; a = clamp(v * 2, 0, 1); b = clamp(v * 2 - 1, 0, 1); }
        fa.push({ opacity: a, offset: i / n });
        fb.push({ opacity: b, offset: i / n });
        fg.push({ opacity: (a + b) / 2, offset: i / n });
      }
      anims = [lo.animate(fa, { duration, easing }), hi.animate(fb, { duration, easing }), gr.animate(fg, { duration, easing })];
      return anims.slice();
    }
    return { set, off, animate };
  })();
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
  const tabFxState = new WeakMap();
  function tabFx(el, x) {
    let s = tabFxState.get(el);
    if (!s) { s = { ts: el.querySelectorAll(".topbar-title, .page-head .large-title"), f: "", d: "" }; tabFxState.set(el, s); }
    const p = Math.min(1, Math.abs(x) / W());
    const f = clamp((p - 0.04) / 0.62, 0, 1).toFixed(3);
    const d = (-x * 0.45).toFixed(1) + "px";
    if (f === s.f && d === s.d) return;
    s.f = f; s.d = d;
    for (const t of s.ts) { t.style.setProperty("--tfx", f); t.style.setProperty("--tdx", d); }
  }
  const navBtn = (kind) => kind === "settings" ? $("navSettings") : $("navHome");
  function setNavCurrent(kind) {
    const home = kind === "home";
    $("navHome").toggleAttribute("aria-current", home);
    $("navSettings").toggleAttribute("aria-current", !home);
    (home ? $("navHome") : $("navSettings")).setAttribute("aria-current", "page");
  }
  let tabFxRaf = 0;
  function trackTabFx(els, nav) {
    cancelAnimationFrame(tabFxRaf);
    let shown = "";
    const step = () => {
      let xi = 0;
      for (const el of els) { xi = new DOMMatrixReadOnly(getComputedStyle(el).transform).m41; tabFx(el, xi); }
      if (nav) {
        const k = Math.abs(xi) < W() / 2 ? nav[1] : nav[0];
        if (k !== shown) { shown = k; setNavCurrent(k); }
      }
      tabFxRaf = requestAnimationFrame(step);
    };
    step();
  }
  function clearTabFx(keepLayer) {
    cancelAnimationFrame(tabFxRaf);
    tabFxRaf = 0;
    for (const k in SCREENS) {
      const el = SCREENS[k];
      el.classList.remove("tab-transit");
      if (!keepLayer) el.classList.remove("swipe-layer");
      const s = tabFxState.get(el);
      if (s) {
        s.f = s.d = "";
        for (const t of s.ts) { t.style.removeProperty("--tfx"); t.style.removeProperty("--tdx"); }
      }
    }
  }
  const FX_RESUME = 70;
  let fxHoldT = 0, fxTabT = 0;
  function transition(from, to, dir) {
    const my = ++tseq;
    for (const a of running) a.cancel();
    running = [];
    clearTabFx(document.body.classList.contains("swiping"));
    const fromEl = elOf(from), toEl = elOf(to);
    const tab = dir === "tab-fwd" || dir === "tab-back";
    for (const k in SCREENS) {
      const el = SCREENS[k];
      el.classList.remove("on-top");
      if (el !== fromEl && el !== toEl) setOff(el, true);
    }
    if (document.activeElement === $("q") && to !== "home") { qNoReturn = true; $("q").blur(); }
    prepare(to);
    fitCollapse(toEl);
    document.body.dataset.screen = kindOf(to);
    $("pillnav").classList.toggle("away", isSub(to));
    if (!isSub(to)) {
      setNavCurrent(kindOf(to));
      if (G.nav) G.nav.sync(true);
    }
    document.body.classList.toggle("sub-open", isSub(to) || (isSub(from) && dir !== "instant" && !reduceMotion.matches));
    clearTimeout(fxHoldT);
    if (isSub(to)) document.body.classList.add("fx-hold");
    else if (document.body.classList.contains("fx-hold")) {
      if (dir === "instant" || reduceMotion.matches) document.body.classList.remove("fx-hold");
      else fxHoldT = setTimeout(() => { if (!isSub(top())) document.body.classList.remove("fx-hold"); }, FX_RESUME);
    }
    if (fromEl === toEl) return;
    const anim = dir !== "instant" && !reduceMotion.matches;
    if (anim) for (const el of [fromEl, toEl]) el.classList.add("swipe-layer");
    if (anim && tab) {
      for (const el of [fromEl, toEl]) el.classList.add("tab-transit", "fx-hold");
      clearTimeout(fxTabT);
      fxTabT = setTimeout(() => { for (const el of [fromEl, toEl]) el.classList.remove("fx-hold"); }, FX_RESUME);
    }
    setOff(toEl, false);
    if (dir !== "instant") fromEl.inert = true;
    for (const k in G) if (k !== "nav" || isSub(to)) G[k].sync(false);
    onScroll(fromEl);
    onScroll(toEl);
    const done = () => {
      if (my !== tseq) return;
      clearTabFx(document.body.classList.contains("swiping"));
      document.body.classList.toggle("sub-open", isSub(top()));
      if (!isSub(top())) document.body.classList.remove("fx-hold");
      setOff(fromEl, true);
      fromEl.classList.remove("on-top");
      toEl.classList.remove("on-top");
      running = [];
      Veil.off();
    };
    Veil.off();
    if (reduceMotion.matches || dir === "instant") { done(); return; }
    const m3 = root.dataset.skin === "m3e";
    const ease = m3 ? "cubic-bezier(.05,.7,.1,1)" : "cubic-bezier(.22,.9,.25,1)";
    const dur = m3 ? 420 : 460;
    const X = (v) => ({ transform: "translateX(" + v + ")" });
    const fx = backFx();
    let a1, a2, va = [];
    if (dir === "push") {
      toEl.classList.add("on-top");
      a1 = toEl.animate([X("100%"), X("0")], { duration: dur, easing: ease });
      a2 = fromEl.animate([X("0"), X("-30%")], { duration: dur, easing: ease, fill: "forwards" });
      if (fx) va = Veil.animate(0, 1, dur, ease);
    } else if (dir === "pop") {
      fromEl.classList.add("on-top");
      a1 = fromEl.animate([X("0"), X("100%")], { duration: dur * 0.85, easing: ease, fill: "forwards" });
      a2 = toEl.animate([X("-30%"), X("0")], { duration: dur * 0.85, easing: ease });
      if (fx) va = Veil.animate(1, 0, dur * 0.85, ease);
    } else {
      const s = dir === "tab-fwd" ? 1 : -1;
      a1 = toEl.animate([X(s * 100 + "%"), X("0")], { duration: 380, easing: ease });
      a2 = fromEl.animate([X("0"), X(-s * 100 + "%")], { duration: 380, easing: ease, fill: "forwards" });
      trackTabFx([fromEl, toEl]);
    }
    running = [a1, a2].concat(va);
    Promise.all([a1.finished, a2.finished]).then(() => { done(); a1.cancel(); a2.cancel(); }, () => {});
  }
  function go(next, dir) {
    if (SEL.on) selExit(true);
    const from = top();
    stack = next;
    transition(from, top(), dir);
  }
  function push(v) {
    const next = stack.concat(v);
    if (!navBackPending) history.pushState({ v: next }, "");
    go(next, "push");
    maybeSwipeHint(elOf(v));
  }
  let navBackPending = false;
  function goTop(name, instant) {
    if (isSub(top()) || kindOf(top()) === name) return;
    if (!instant) haptic("tick");
    if (name === "settings") {
      if (!navBackPending) history.pushState({ v: ["settings"] }, "");
      go(["settings"], instant ? "instant" : "tab-fwd");
    } else if (navBackPending) {
      go(["home"], instant ? "instant" : "tab-back");
    } else if (history.state && history.state.v && history.state.v.length === 1 && history.state.v[0] === "settings") {
      go(["home"], instant ? "instant" : "tab-back");
      navBackPending = true;
      history.back();
    } else {
      history.replaceState({ v: ["home"] }, "");
      go(["home"], instant ? "instant" : "tab-back");
    }
  }
  function backInstant() {
    if (stack.length < 2) return;
    go(stack.slice(0, -1), "instant");
    if (!navBackPending) { navBackPending = true; history.back(); }
  }
  let vw = window.innerWidth;
  window.addEventListener("resize", () => { vw = window.innerWidth; });
  const W = () => vw;
  let swipeClick = false, swipeClickUntil = 0;
  const lockClick = () => { swipeClick = true; swipeClickUntil = performance.now() + 400; };
  document.addEventListener("pointerdown", () => { swipeClick = false; }, true);
  const noLeftSwipe = (el) => el === SCREENS.app || el === SCREENS.licenses;
  let swipeJob = null;
  function settleSwipe() {
    const j = swipeJob;
    if (!j) return;
    swipeJob = null;
    for (const an of j.anims) an.cancel();
    j.finish();
  }
  function pageSwipe(scr) {
    let st = null;
    const setX = (el, x) => { el.style.transform = x ? "translateX(" + x + "px)" : ""; };
    let down = null;
    scr.addEventListener("pointerdown", (e) => {
      settleSwipe();
      down = { x: e.clientX, y: e.clientY };
      if (e.button || document.body.classList.contains("modal") || scr.hasAttribute("data-off")) return;
      if (e.target.closest(".glider, .slider, input, .snackbar, .back-btn")) return;
      if (e.clientX < 24 || e.clientX > W() - 24) return;
      st = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, mode: null, samples: [{ t: performance.now(), x: e.clientX }] };
    });
    scr.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      const now = performance.now();
      st.samples.push({ t: now, x: e.clientX });
      while (st.samples.length > 2 && now - st.samples[0].t > 100) st.samples.shift();
      if (!st.mode) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
        for (const a of running) a.cancel();
        running = [];
        const cur = top();
        if (isSub(cur)) {
          if (noLeftSwipe(elOf(cur)) && dx < 0) { st = null; return; }
          st.mode = "back"; st.other = elOf(stack[stack.length - 2]);
          st.fx = backFx();
        }
        else if (kindOf(cur) === "home" && dx < 0) { st.mode = "tab"; st.other = SCREENS.settings; st.to = "settings"; st.nav = "home"; }
        else if (kindOf(cur) === "settings" && dx > 0) { st.mode = "tab"; st.other = SCREENS.home; st.to = "home"; st.nav = "settings"; }
        else { st = null; return; }
        clearTabFx(false);
        onScroll(scr);
        if (st.other) { setOff(st.other, false); onScroll(st.other); }
        if (st.fx) { st.q = 1; Veil.set(1); }
        if (st.mode === "back") scr.classList.add("on-top");
        if (st.mode === "tab") { clearTimeout(fxTabT); scr.classList.add("tab-transit", "fx-hold"); st.other.classList.add("tab-transit", "fx-hold"); }
        try { scr.setPointerCapture(st.id); } catch (err) {}
        scr.classList.add("swiping", "swipe-layer");
        if (st.other) st.other.classList.add("swipe-layer");
        document.body.classList.add("swiping");
        st.x = e.clientX - Math.sign(dx) * 4;
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
        const cover = 1 - Math.min(1, Math.abs(bd) / W());
        const dpr = window.devicePixelRatio || 1;
        setX(st.other, Math.round(-0.3 * W() * cover * dpr) / dpr);
        if (st.fx) { st.q = cover; Veil.set(cover); }
      } else if (st.mode === "tab") {
        const dd = st.to === "settings" ? Math.min(0, d) : Math.max(0, d);
        setX(scr, dd);
        setX(st.other, dd + (st.to === "settings" ? W() : -W()));
        tabFx(scr, dd);
        tabFx(st.other, dd + (st.to === "settings" ? W() : -W()));
        const kind = Math.abs(dd) > W() / 2 ? st.to : kindOf(top());
        if (kind !== st.nav) { st.nav = kind; setNavCurrent(kind); }
        if (G.nav) G.nav.follow(navBtn(kindOf(top())), navBtn(st.to), Math.abs(dd) / W());
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
      lockClick();
      const d = e.clientX - s0.x;
      const sm = s0.samples, sa = sm[0], sb = sm[sm.length - 1];
      const v = sb.t > sa.t && performance.now() - sb.t < 90 ? (sb.x - sa.x) / (sb.t - sa.t) : 0;
      const m3 = root.dataset.skin === "m3e";
      const ease = m3 ? "cubic-bezier(.05,.7,.1,1)" : "cubic-bezier(.22,.9,.25,1)";
      const cur = (el) => el.style.transform || "translateX(0px)";
      const anim = (el, to) => el.animate([{ transform: cur(el) }, { transform: to }], { duration: 300, easing: ease, fill: "forwards" });
      const veilTo = (q) => { if (s0.fx) Veil.animate(s0.q, q, 300, ease); };
      const tabSw = s0.mode === "tab";
      const fling = Math.abs(v) > (tabSw ? .18 : .45) && Math.abs(d) > (tabSw ? 12 : 40) && Math.sign(v) === Math.sign(d);
      const far = Math.abs(d) > W() * (tabSw ? .1 : .3);
      const tabGo = tabSw && !cancel && (far || fling) && Math.sign(d) === (s0.to === "settings" ? -1 : 1);
      if (tabSw) { scr.classList.remove("fx-hold"); if (s0.other) s0.other.classList.remove("fx-hold"); }
      let anims, commit;
      if (s0.mode === "back" && !cancel && (far || fling) && !(noLeftSwipe(scr) && d < 0)) {
        const out = d < 0 ? -W() : W();
        scr.inert = true;
        anims = [anim(scr, "translateX(" + out + "px)"), anim(s0.other, "translateX(0)")];
        veilTo(0);
        if (stack.length === 2) {
          clearTimeout(fxHoldT);
          document.body.classList.remove("fx-hold");
          $("pillnav").classList.remove("away");
          if (G.nav) G.nav.sync(false);
        }
        commit = () => {
          backInstant();
          setX(scr, 0); setX(s0.other, 0); Veil.off();
        };
      } else if (tabGo) {
        anims = [anim(scr, "translateX(" + (s0.to === "settings" ? -W() : W()) + "px)"), anim(s0.other, "translateX(0)")];
        commit = () => {
          goTop(s0.to, true);
          setX(scr, 0); setX(s0.other, 0);
        };
      } else {
        anims = [anim(scr, "translateX(0)")];
        if (s0.other) anims.push(anim(s0.other, s0.mode === "back" ? "translateX(" + (-0.3 * W()) + "px)" : "translateX(" + (s0.to === "settings" ? W() : -W()) + "px)"));
        veilTo(1);
        commit = () => {
          if (tabSw) setNavCurrent(kindOf(top()));
          setX(scr, 0);
          if (s0.other) { setX(s0.other, 0); if (s0.other !== elOf(top())) setOff(s0.other, true); }
          if (s0.fx) Veil.off();
          scr.classList.remove("on-top");
        };
      }
      if (tabSw) {
        setNavCurrent(tabGo ? s0.to : kindOf(top()));
        if (G.nav) G.nav.release(true);
      }
      if (tabSw) trackTabFx([scr, s0.other], [kindOf(top()), s0.to]);
      if (tabSw) { const c0 = commit; commit = () => { c0(); clearTabFx(false); }; }
      const job = { anims, done: false, finish() { if (job.done) return; job.done = true; if (swipeJob === job) swipeJob = null; for (const an of anims) an.cancel(); commit(); } };
      swipeJob = job;
      Promise.all(anims.map((a) => a.finished)).then(() => job.finish(), () => {});
    };
    scr.addEventListener("pointerup", (e) => {
      if (down && Math.abs(e.clientX - down.x) > 12 && Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y) * 1.15) lockClick();
      down = null;
    });
    scr.addEventListener("pointerup", (e) => end(e, false));
    scr.addEventListener("pointercancel", (e) => end(e, true));
    scr.addEventListener("click", (e) => {
      if (swipeClick && performance.now() < swipeClickUntil) { swipeClick = false; e.preventDefault(); e.stopPropagation(); }
    }, true);
  }
  let hintTimer = 0, hintAnim = null;
  function hideSwipeHint() {
    if (hintAnim) { const a = hintAnim; hintAnim = null; a.cancel(); }
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
      hintAnim = a;
      a.finished.then(() => {
        if (hintAnim === a) hintAnim = null;
        if (prev !== elOf(top()) && !document.body.classList.contains("swiping")) setOff(prev, true);
      }, () => {});
      clearTimeout(hintTimer);
      hintTimer = setTimeout(hideSwipeHint, 3600);
    }, 550);
  }
  window.addEventListener("popstate", (e) => {
    const next = (e.state && Array.isArray(e.state.v) && e.state.v.length) ? e.state.v : ["home"];
    if (navBackPending) {
      navBackPending = false;
      if (next.join("|") !== stack.join("|")) history.pushState({ v: stack.slice() }, "");
      return;
    }
    if (next.join("|") === stack.join("|")) return;
    const dir = next.length < stack.length ? "pop" : next.length > stack.length ? "push" : (kindOf(next[0]) === "settings" ? "tab-fwd" : "tab-back");
    go(next, dir);
  });
  for (const bar of document.querySelectorAll(".topbar")) {
    for (let i = 0; i < 3; i++) {
      const l = document.createElement("i");
      l.className = "tb-pb";
      l.setAttribute("aria-hidden", "true");
      bar.insertBefore(l, bar.firstChild);
    }
  }
  for (const b of document.querySelectorAll(".back-btn")) stretchyBack(b);
  function fitCollapse(scr) {
    const bar = scr.querySelector(".topbar"), t = scr.querySelector(".large-title, .app-title");
    const wrap = scr.querySelector(":scope > .bounce");
    if (!bar || !t || !wrap || !scr.clientHeight) return;
    const need = Math.max(8, t.offsetTop + t.offsetHeight - bar.offsetHeight) + 36 + 12;
    let mh = Math.ceil(scr.clientHeight + need) + "px";
    if (scr.id === "scrHome") {
      const q = $("q"), row = q.closest(".search-row");
      if (document.activeElement === q) {
        const room = Math.ceil(row.offsetTop - bar.offsetHeight - 8 + scr.clientHeight);
        if (room > parseFloat(mh)) mh = room + "px";
      }
    }
    if (wrap.style.minHeight === mh) return;
    const y0 = scr.scrollTop;
    wrap.style.minHeight = mh;
    const dy = y0 - scr.scrollTop;
    if (dy > 0.5) {
      onScroll(scr);
      if (!reduceMotion.matches && !scr.hasAttribute("data-off")) {
        wrap.animate([{ translate: "0 " + (-dy).toFixed(1) + "px" }, { translate: "0 0" }],
          { duration: 420, easing: "cubic-bezier(.2,.9,.25,1)" });
      }
    }
  }
  const fitAll = () => { for (const k in SCREENS) fitCollapse(SCREENS[k]); };
  const scrollParts = new WeakMap();
  function onScroll(scr) {
    let sp = scrollParts.get(scr);
    if (!sp) scrollParts.set(scr, sp = { bar: scr.querySelector(".topbar"), t: scr.querySelector(".large-title, .app-title") });
    const bar = sp.bar, t = sp.t;
    const st = Math.round(scr.scrollTop) + "px";
    if (scr.dataset.st !== st) { scr.dataset.st = st; if (bar) bar.style.setProperty("--st", st); }
    if (!bar || !t) return;
    if (stretched.has(scr)) return;
    const max = scr.scrollHeight - scr.clientHeight;
    const y = Math.min(Math.max(0, scr.scrollTop), max);
    const limit = t.offsetTop + t.offsetHeight - bar.offsetHeight;
    const end = Math.max(8, limit), start = Math.max(0, end - 36);
    const p = clamp((y - start) / Math.max(1, end - start), 0, 1).toFixed(3);
    if (scr.dataset.tp !== p) { scr.dataset.tp = p; t.style.setProperty("--tp", p); }
    const tc = clamp((y - end) / 36, 0, 1).toFixed(3);
    if (scr.dataset.tc !== tc) { scr.dataset.tc = tc; bar.style.setProperty("--tc", tc); }
    bar.classList.toggle("show", y > end);
    bar.classList.toggle("scrolled", y > 4);
    bar.classList.toggle("lifted", y > 14);
  }
  for (const k in SCREENS) SCREENS[k].addEventListener("scroll", () => onScroll(SCREENS[k]), { passive: true });
  for (const k in SCREENS) pageSwipe(SCREENS[k]);
  let touchAt = 0, bounceActive = 0;
  const edgeBuzz = new WeakMap();
  const atTop = (scr) => scr.scrollTop <= 1;
  const scrollEnds = new WeakMap();
  function scrollEnd(scr) {
    const calc = Math.max(0, scr.scrollHeight - scr.clientHeight), e = scrollEnds.get(scr);
    return e && e.calc === calc ? e.max : calc;
  }
  function learnScrollEnd(scr, y) {
    const calc = Math.max(0, scr.scrollHeight - scr.clientHeight);
    if (y < calc - 48 || y > calc) return false;
    scrollEnds.set(scr, { calc, max: y });
    return true;
  }
  const atBottom = (scr) => scr.scrollTop >= scrollEnd(scr) - 1;
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
      release(off) { if (off >= armAt * 0.9) { launch(); return true; } end(); return false; },
      reset() { el.classList.remove("gone"); }
    };
  }
  const ROCKET_TRAVEL = 40;
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
    const maxScroll = () => scrollEnd(scr);
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
      const t0 = performance.now() - Math.min(dur, lead || 0);
      const mine = { raf: 0, get currentTime() { return performance.now() - t0; }, cancel() { cancelAnimationFrame(mine.raf); mine.raf = 0; } };
      anim = mine;
      off = 0; shown = 0;
      const frame = () => {
        mine.raf = 0;
        if (anim !== mine) return;
        if (performance.now() - t0 >= dur) {
          anim = null; traj = null;
          off = 0; shown = 0; wrap.style.transform = "";
          setStretched(false);
          return;
        }
        wrap.style.transform = "translate3d(0," + animOffset().toFixed(2) + "px,0)";
        mine.raf = requestAnimationFrame(frame);
      };
      frame();
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
        if (v > 0 && scr.scrollTop < y - 1 && learnScrollEnd(scr, scr.scrollTop)) { mraf = 0; edgeBounce(v); return; }
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
        if (pull <= 0 || pull < g.peak - Math.max(28, g.peak * 0.3)) { g.on = false; if (rk) rk.end(); spring(0); return; }
        if (g.dir > 0 && scr.scrollTop > 0) scr.scrollTop = 0;
        else if (g.dir < 0 && scr.scrollTop < g.max) scr.scrollTop = g.max;
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
      if (rk && g.dir > 0) {
        rk.pull(off, g.cx - g.x);
        g.hist.push({ t: now, o: off });
        while (g.hist.length > 1 && now - g.hist[0].t > 160) g.hist.shift();
      }
      draf = requestAnimationFrame(dragFrame);
    }
    let sy = scr.scrollTop, st = 0, sv = 0, wallRaf = 0;
    function watchWall(y, v, t0) {
      cancelAnimationFrame(wallRaf);
      let n = 0;
      const f = () => {
        wallRaf = 0;
        if (touching || mraf || scr.scrollTop !== y) return;
        if (++n < 3) { wallRaf = requestAnimationFrame(f); return; }
        if (!learnScrollEnd(scr, y)) return;
        edgeBounce(v, Math.min(34, performance.now() - t0) + BOUNCE.step);
        if (performance.now() - touchAt < 2500) buzzEdge(scr, "bottom");
      };
      wallRaf = requestAnimationFrame(f);
    }
    scr.addEventListener("scroll", () => {
      const now = performance.now(), y = scr.scrollTop, dt = now - st;
      const prev = sv, prevY = sy, prevT = st;
      sv = dt > 0 && dt < 120 ? ((y - sy) / dt) * 1000 : 0;
      sy = y; st = now;
      const top = atTop(scr), bottom = atBottom(scr);
      if (!touching && !mraf && !KB.sc && now - touchEnd < 4000 && (top || bottom)) {
        const v = bottom ? Math.max(sv, prev) : Math.min(sv, prev);
        if (bottom ? v > 0 : v < 0) {
          const edgeY = bottom ? maxScroll() : 0;
          const tEdge = prevT + Math.abs(edgeY - prevY) / Math.max(1e-3, Math.abs(v) / 1000);
          edgeBounce(v, Math.max(0, Math.min(34, now - tEdge)) + BOUNCE.step);
        }
      } else if (!touching && !mraf && !KB.sc && now - touchEnd < 4000 && sv > 300 && y >= maxScroll() - 48) watchWall(y, sv, now);
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
      if (e.target.closest(".slider, input:focus, .snackbar, .back-btn")) return;
      stopSpring();
      h = scr.clientHeight || h;
      const t = e.touches[0];
      g = { x: t.clientX, cx: t.clientX, y: t.clientY, py: t.clientY, slop: false, on: false, dir: 0, base: 0,
            native: false, manual: false, peak: 0, max: maxScroll(), samples: [], iv: 8, down: 0, hist: [] };
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
      if (t.clientY - g.y > g.down) g.down = t.clientY - g.y;
      addSample(e.timeStamp, t.clientY);
      if (!g.slop) {
        const dy = t.clientY - g.y, dx = t.clientX - g.x;
        if (Math.abs(dy) < 6 || Math.abs(dx) > Math.abs(dy)) { g.py = t.clientY; return; }
        g.slop = true;
      }
      const step = t.clientY - g.py;
      g.py = t.clientY;
      if (!g.on) {
        let dir = step > 0 && atTop(scr) ? 1 : step < 0 && atBottom(scr) ? -1 : 0;
        if (!dir && step < 0) {
          const y = scr.scrollTop;
          if (y === g.wy) { g.wd -= step; if (g.wd >= 12 && learnScrollEnd(scr, y)) dir = -1; }
          else { g.wy = y; g.wd = 0; }
        }
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
        if (s.on && s.dir > 0 && s.down >= ROCKET_TRAVEL && e.type === "touchend" && off > 0) rk.release(Math.max(off, ...s.hist.map((h) => h.o)));
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
    syncClearQ();
    renderList();
  });
  $("emptyDym").onclick = () => {
    const l = $("emptyDym").dataset.label;
    if (!l) return;
    haptic("click");
    $("q").value = l;
    S.query = l;
    syncClearQ();
    renderList();
  };
  $("emptyMore").onclick = () => {
    const kind = $("emptyMore").dataset.kind;
    if (kind === "all") setTab("all");
    else if (kind === "sys" && !S.ui.sysApps) { $("rowSysApps").onclick(); renderList(); }
  };
  const syncClearQ = () => { $("clearQ").hidden = !(document.activeElement === $("q") || $("q").value); };
  $("clearQ").onclick = () => {
    const had = !!$("q").value;
    $("q").value = "";
    S.query = "";
    if (had) renderList();
    $("q").blur();
    syncClearQ();
  };
  for (const t of ["pointerdown", "mousedown"]) $("clearQ").addEventListener(t, (e) => { if (document.activeElement === $("q")) e.preventDefault(); });
  const qAnim = (open) => {
    const row = $("q").closest(".search-row");
    clearTimeout(row._qa);
    row.classList.add("q-anim");
    row.classList.toggle("q-open", open);
    row._qa = setTimeout(() => row.classList.remove("q-anim"), 420);
  };
  $("q").addEventListener("focus", () => { syncClearQ(); qAnim(true); });
  $("q").addEventListener("blur", () => { syncClearQ(); qAnim(false); });
  const KB = { base: window.innerHeight, w: window.innerWidth, h: window.innerHeight, open: false, raf: 0, last: 0, sc: 0 };
  const kbLift = mkSpring(0);
  const visH = () => window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
  function kbFrame(now) {
    KB.raf = 0;
    const dt = Math.min(0.034, KB.last ? (now - KB.last) / 1000 : 1 / 60);
    KB.last = now;
    stepSpring(kbLift, dt, 0.3, 0.95);
    const done = springIdle(kbLift, 0.3);
    if (done) kbLift.x = kbLift.to;
    $("pillnav").style.marginBottom = Math.abs(kbLift.x) < 0.5 ? "" : kbLift.x.toFixed(1) + "px";
    if (!done) KB.raf = requestAnimationFrame(kbFrame); else KB.last = 0;
  }
  function kbUpdate() {
    const h = window.innerHeight;
    if (window.innerWidth !== KB.w) { KB.w = window.innerWidth; KB.base = h; }
    if (h > KB.base) KB.base = h;
    if (h !== KB.h) {
      if (!reduceMotion.matches) kbLift.x += h - KB.h;
      KB.h = h;
    }
    kbLift.to = Math.max(0, h - visH());
    if (reduceMotion.matches) kbLift.x = kbLift.to;
    const open = KB.base - Math.min(h, visH()) > 120;
    if (KB.open && !open && document.activeElement === $("q")) $("q").blur();
    KB.open = open;
    if (document.body.classList.contains("kb-open") !== open) flipEmpty(() => { document.body.classList.toggle("kb-open", open); fitEmpty(); });
    if (!KB.raf) { KB.last = 0; KB.raf = requestAnimationFrame(kbFrame); }
  }
  window.addEventListener("resize", kbUpdate);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", kbUpdate);
    window.visualViewport.addEventListener("scroll", kbUpdate);
  }
  function springScroll(scr, to, response, damping, done) {
    cancelAnimationFrame(KB.sc);
    const sp = mkSpring(scr.scrollTop);
    sp.to = to;
    if (reduceMotion.matches) { scr.scrollTop = to; if (done) done(); return; }
    let last = 0;
    const stop = (fin) => {
      cancelAnimationFrame(KB.sc); KB.sc = 0;
      scr.removeEventListener("pointerdown", stop); scr.removeEventListener("touchstart", stop);
      if (done) done();
    };
    scr.addEventListener("pointerdown", stop);
    scr.addEventListener("touchstart", stop, { passive: true });
    const f = (now) => {
      const dt = Math.min(0.034, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      stepSpring(sp, dt, response, damping);
      scr.scrollTop = sp.x;
      if (springIdle(sp, 0.5)) { scr.scrollTop = sp.to; stop(); return; }
      KB.sc = requestAnimationFrame(f);
    };
    KB.sc = requestAnimationFrame(f);
  }
  let qOrigin = null, qNoReturn = false;
  $("q").addEventListener("focus", () => {
    const scr = $("scrHome");
    fitCollapse(scr);
    const bar = scr.querySelector(".topbar"), row = $("searchBox").parentElement;
    const to = Math.max(0, row.offsetTop - bar.offsetHeight - 8);
    qOrigin = scr.scrollTop;
    qNoReturn = false;
    if (scr.scrollTop < to - 1) springScroll(scr, to, 0.32, 1);
    else qOrigin = null;
  });
  let ptrDown = 0;
  document.addEventListener("pointerdown", () => { ptrDown++; }, true);
  const ptrUp = () => { ptrDown = Math.max(0, ptrDown - 1); };
  document.addEventListener("pointerup", ptrUp, true);
  document.addEventListener("pointercancel", ptrUp, true);
  $("q").addEventListener("blur", () => {
    const scr = $("scrHome"), back = qOrigin;
    qOrigin = null;
    const settle = () => {
      if (document.activeElement === $("q")) return;
      if (back === null || qNoReturn || scr.hasAttribute("data-off") || stack.length !== 1 || kindOf(stack[0]) !== "home" || document.body.classList.contains("modal")) {
        fitCollapse(scr);
        return;
      }
      springScroll(scr, back, 0.42, 0.86, () => fitCollapse(scr));
    };
    if (!ptrDown) { settle(); return; }
    const wait = () => {
      document.removeEventListener("pointerup", wait, true);
      document.removeEventListener("pointercancel", wait, true);
      setTimeout(() => requestAnimationFrame(settle), 0);
    };
    document.addEventListener("pointerup", wait, true);
    document.addEventListener("pointercancel", wait, true);
  });
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
    if (!row) return;
    if (SEL.on) { selToggle(row.dataset.pkg); return; }
    push("app:" + row.dataset.pkg);
  });
  const FAB_SPRING = (() => {
    const w = 2 * Math.PI / 0.42, z = 0.62, wd = w * Math.sqrt(1 - z * z), N = 40, T = 0.52, f = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N * T, p = i === N ? 1 : 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + z * w / wd * Math.sin(wd * t));
      const bl = 14 * Math.pow(Math.max(0, 1 - p), 0.7);
      f.push({ transform: "scale(" + (0.35 + 0.65 * p).toFixed(4) + ")", filter: "blur(" + bl.toFixed(2) + "px)", opacity: Math.min(1, i / N * 7).toFixed(3), offset: i / N });
    }
    return f;
  })();
  function showSelUi(show) {
    const els = [$("selFab"), $("selX")], mx = root.dataset.skin === "miuix";
    for (const el of els) {
      if (el._a) { const a = el._a; el._a = null; a.cancel(); }
      if (show) el.hidden = false;
    }
    const ctl = $("ctl");
    clearTimeout(ctl._t);
    if (show) {
      if (document.activeElement === $("q")) $("q").blur();
      ctl.classList.add("clip", "gone");
    } else {
      ctl.classList.remove("gone");
      ctl._t = setTimeout(() => { if (!ctl.classList.contains("gone")) ctl.classList.remove("clip"); fitCollapse($("scrHome")); }, 470);
    }
    if (reduceMotion.matches) { for (const el of els) el.hidden = !show; return; }
    const run = (el, frames, opts) => {
      const a = el.animate(frames, opts);
      el._a = a;
      a.onfinish = () => { if (el._a !== a) return; el._a = null; if (!show) el.hidden = true; };
    };
    const inFrames = mx ? FAB_SPRING : FAB_SPRING.map((f) => ({ transform: f.transform, opacity: f.opacity, offset: f.offset }));
    const outFrames = mx ? [{ transform: "none", filter: "blur(0px)", opacity: 1 }, { transform: "scale(.6)", filter: "blur(8px)", opacity: 0 }]
      : [{ transform: "none", opacity: 1 }, { transform: "scale(.5)", opacity: 0 }];
    els.forEach((el, i) => {
      if (show) run(el, inFrames, { duration: 520, delay: i * 75, easing: "linear", fill: "backwards" });
      else run(el, outFrames, { duration: 180, easing: "cubic-bezier(.4, 0, 1, 1)" });
    });
  }
  function selUi() {
    for (const p of [...SEL.set]) if (!S.conf.apps.has(p)) SEL.set.delete(p);
    const n = SEL.set.size;
    $("selCount").textContent = n;
    $("selFab").setAttribute("aria-label", "Reset " + n + (n === 1 ? " app" : " apps") + " to stock");
  }
  function selEnter(pkg) {
    if (SEL.on) return;
    SEL.on = true;
    SEL.set.clear();
    SEL.set.add(pkg);
    $("list").classList.add("selecting");
    for (const r of rowCache.values()) paintSel(r);
    selUi();
    paintClearBtn();
    showSelUi(true);
    history.pushState({ v: stack.slice(), sel: 1 }, "");
  }
  function selExit(fromHistory) {
    if (!SEL.on) return;
    SEL.on = false;
    SEL.set.clear();
    $("list").classList.remove("selecting");
    for (const r of rowCache.values()) paintSel(r);
    paintClearBtn();
    showSelUi(false);
    if (!fromHistory && history.state && history.state.sel) { SEL.pop = true; history.back(); }
  }
  function selToggle(pkg) {
    if (!S.conf.apps.has(pkg)) return;
    if (SEL.set.has(pkg)) SEL.set.delete(pkg); else SEL.set.add(pkg);
    haptic("tick");
    if (!SEL.set.size) { selExit(); return; }
    const r = rowCache.get(pkg);
    if (r) paintSel(r);
    selUi();
  }
  window.addEventListener("popstate", (e) => {
    if (SEL.pop) { SEL.pop = false; return; }
    if (SEL.on) { selExit(true); return; }
    if (e.state && e.state.sel) history.back();
  });
  let lp = null;
  const lpCancel = (e) => { if (lp && (!e || e.pointerId === lp.id)) { clearTimeout(lp.t); lp = null; } };
  $("list").addEventListener("pointerdown", (e) => {
    lpCancel();
    if (e.button || SEL.on) return;
    const row = e.target.closest(".app-row");
    if (!row || !S.conf.apps.has(row.dataset.pkg)) return;
    lp = { id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(() => {
      lp = null;
      if (document.body.classList.contains("modal") || document.body.classList.contains("swiping") || !S.conf.apps.has(row.dataset.pkg)) return;
      haptic("heavy");
      swallowNextClick();
      selEnter(row.dataset.pkg);
    }, 450) };
  });
  $("list").addEventListener("pointermove", (e) => {
    if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) lpCancel();
  });
  $("list").addEventListener("pointerup", lpCancel);
  $("list").addEventListener("pointercancel", lpCancel);
  $("list").addEventListener("contextmenu", (e) => e.preventDefault());
  $("scrHome").addEventListener("scroll", () => lpCancel(), { passive: true });
  $("selX").onclick = () => { haptic("click"); selExit(); };
  $("selFab").onclick = async () => {
    const pkgs = [...SEL.set].filter((p) => S.conf.apps.has(p)), n = pkgs.length;
    if (!n) { selExit(); return; }
    haptic("click");
    const ok = await dialog({
      title: n === 1 ? "Reset 1 app to stock?" : "Reset " + n + " apps to stock?",
      body: [n === 1 ? "The selected app will be switched off and removed from your boosted apps." : "The " + n + " selected apps will be switched off and removed from your boosted apps.",
        "They'll run on stock performance again until you pick a mode for them."],
      warn: true,
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "Reset", value: true, kind: "danger" }]
    });
    if (!ok || !SEL.on) return;
    const keep = new Map(pkgs.map((p) => [p, Object.assign({}, S.conf.apps.get(p))]));
    for (const p of pkgs) addRecent(p);
    for (const [p, e] of keep) if (e.bt != null) S.ui.btMem[p] = { v: e.bt, on: !!e.btOn, chg: !!e.btChg };
    selExit();
    changeConf((c) => { for (const p of pkgs) c.apps.delete(p); }, n === 1 ? "Removed 1 app" : "Removed " + n + " apps",
      () => changeConf((c) => { for (const [p, e] of keep) c.apps.set(p, e); normalizeFlags(c); }));
  };
  $("sortBtn").onclick = pickSort;
  $("clearBoosted").onclick = async () => {
    const n = S.conf.apps.size;
    if (!n) return;
    haptic("click");
    const ok = await dialog({
      title: "Remove all boosted apps?",
      body: [n === 1 ? "The boosted app will be switched off and removed from this list." : "All " + n + " boosted apps will be switched off and removed from this list.",
        "They'll run on stock performance again until you pick a mode for them."],
      warn: true,
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "OK", value: true, kind: "danger" }]
    });
    if (!ok) return;
    const keep = cloneConf(S.conf).apps;
    for (const pkg of keep.keys()) addRecent(pkg);
    for (const [pkg, e] of keep) if (e.bt != null) S.ui.btMem[pkg] = { v: e.bt, on: !!e.btOn, chg: !!e.btChg };
    changeConf((c) => { c.apps.clear(); }, n === 1 ? "Removed 1 boosted app" : "Removed " + n + " boosted apps",
      () => changeConf((c) => { for (const [p, e] of keep) c.apps.set(p, e); normalizeFlags(c); }));
  };
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
      if (id === "off") {
        const x = c.apps.get(pkg);
        if (x && x.bt != null) { S.ui.btMem[pkg] = { v: x.bt, on: !!x.btOn, chg: !!x.btChg }; saveUi(); }
        c.apps.delete(pkg);
        return;
      }
      let e = c.apps.get(pkg);
      if (!e) {
        const m = S.ui.btMem[pkg];
        e = { preset: id, t: 1, h: isPerf(id) ? 1 : 0, b: 0, bt: m ? m.v : null, btOn: m ? m.on : false, btChg: m ? m.chg : false };
        if (m) { delete S.ui.btMem[pkg]; saveUi(); }
      }
      if (isPerf(id) !== isPerf(e.preset)) { e.h = isPerf(id) ? 1 : 0; if (isPerf(id)) e.t = 1; }
      if (!touchOk(e.preset) && touchOk(id)) e.t = 1;
      e.preset = id;
      c.apps.set(pkg, e);
      normalizeFlags(c);
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
  let flagBusy = false;
  async function flipFlag(row, flag) {
    const pkg = S.current;
    const e = S.conf.apps.get(pkg);
    if (!e || flagBusy || row.disabled) return;
    flagBusy = true;
    const on = !e[flag];
    const feature = { t: "Touch boosting", h: "Thermal limits", b: "Battery limits" }[flag];
    $("busyTitle").textContent = feature;
    $("busyBody").textContent = (on ? "Enabling…" : "Disabling…");
    openScrim($("busy"));
    await paint();
    await new Promise((r) => setTimeout(r, 300));
    closeScrim($("busy"));
    flagBusy = false;
    changeConf((c) => { const x = c.apps.get(pkg); if (x) x[flag] = on ? 1 : 0; }, S.ui.moduleOn ? null : "Changes will apply when the module is active");
    addRecent(pkg);
  }
  $("rowTouch").onclick = () => { if (flagBusy) return; haptic("click"); flipFlag($("rowTouch"), "t"); };
  $("rowThermal").onclick = () => { if (flagBusy) return; haptic("click"); flipFlag($("rowThermal"), "h"); };
  $("rowBatoc").onclick = async () => {
    const e = S.conf.apps.get(S.current);
    if (!e || flagBusy) return;
    haptic("click");
    if (!e.b && !S.ui.noWarn.batoc) {
      const w = BATOC_WARN;
      const ok = await dialog({
        title: w.title, body: w.body, warn: true, lvl: "ext", check: "Don't show this again",
        buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: w.btn, value: true, kind: w.kind }]
      });
      if (!ok) { renderApp(); return; }
      if ($("dlgCheckBox").checked) { S.ui.noWarn.batoc = true; saveUi(); }
    }
    flipFlag($("rowBatoc"), "b");
  };
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
  $("rowStatusCard").onclick = () => {
    S.ui.statusCard = !S.ui.statusCard;
    haptic("click");
    renderStatus();
    renderSettings();
    fitCollapse($("scrHome"));
    saveUi();
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
  $("rowSysApps").onclick = () => {
    S.ui.sysApps = !S.ui.sysApps;
    setSwitch($("rowSysApps"), S.ui.sysApps);
    haptic("click");
    requestAnimationFrame(() => setTimeout(async () => {
      saveUi();
      await loadApps();
      lastOrder = "";
      renderList();
      appsBanner();
    }, 0));
  };
  function plusTap(btn) {
    const ic = btn.classList.contains("empty-sw") && btn.querySelector(".i");
    if (!ic || !ic.animate || reduceMotion.matches) return;
    for (const a of ic.getAnimations()) a.cancel();
    ic.animate([
      { scale: 1, easing: "cubic-bezier(.2, .8, .3, 1)" },
      { scale: 1.3, offset: 0.45, easing: "cubic-bezier(.45, 0, .55, 1)" },
      { scale: 1 }
    ], { duration: 80 });
  }
  $("swatches").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    if (b.dataset.id === "custom") { plusTap(b); customColour(); return; }
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
  function bindTempSlider(id, commitVal) {
    const inp = $(id), sl = $(id + "Slider");
    const setV = (v) => {
      const prev = +inp.value;
      if (v === prev) return;
      inp.value = v;
      sliderTicks(sliderSteps(inp, v, prev));
      paintSlider(id);
    };
    const commit = () => commitVal(btFromSlider(+inp.value));
    sliderDrag(sl, inp, setV, commit);
    inp.addEventListener("input", () => { paintSlider(id); sliderTicks(1); });
    inp.addEventListener("change", commit);
  }
  bindTempSlider("bt", (v) => {
    if (S.conf.batTempOn && S.conf.batTemp !== v) changeConf((c) => { c.batTemp = v; });
  });
  bindTempSlider("abt", (v) => {
    const pkg = S.current, e = S.conf.apps.get(pkg);
    if (!e || !e.btOn || e.bt === v) return;
    changeConf((c) => { const x = c.apps.get(pkg); if (x) x.bt = v; });
    addRecent(pkg);
  });
  $("rowGbt").onclick = () => {
    if ($("rowGbt").disabled) return;
    haptic("click");
    const on = !S.conf.batTempOn;
    collapseAnimEls.add($("btRow"));
    collapseAnimEls.add($("rowGbtChg"));
    changeConf((c) => { c.batTempOn = on; });
  };
  $("rowAbt").onclick = () => {
    const pkg = S.current, e = S.conf.apps.get(pkg);
    if (!e || flagBusy || $("rowAbt").disabled) return;
    haptic("click");
    const on = !e.btOn;
    collapseAnimEls.add($("abtRow"));
    collapseAnimEls.add($("rowAbtChg"));
    changeConf((c) => {
      const x = c.apps.get(pkg);
      if (!x) return;
      x.btOn = on;
      if (x.bt == null) x.bt = 0;
    });
    addRecent(pkg);
  };
  async function confirmChgWarn() {
    if (S.ui.noWarn.btchg) return true;
    const w = BT_CHG_WARN;
    const ok = await dialog({
      title: w.title, body: w.body, warn: true, lvl: "ext", check: "Don't show this again",
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: w.btn, value: true, kind: w.kind }]
    });
    if (ok && $("dlgCheckBox").checked) { S.ui.noWarn.btchg = true; saveUi(); }
    return ok;
  }
  $("rowGbtChg").onclick = async () => {
    if ($("rowGbtChg").disabled) return;
    haptic("click");
    const on = !S.conf.batTempChg;
    if (on && !(await confirmChgWarn())) return;
    changeConf((c) => { c.batTempChg = on; });
  };
  $("rowAbtChg").onclick = async () => {
    const pkg = S.current, e = S.conf.apps.get(pkg);
    if (!e || flagBusy || $("rowAbtChg").disabled) return;
    haptic("click");
    const on = !e.btChg;
    if (on && !(await confirmChgWarn())) return;
    changeConf((c) => { const x = c.apps.get(pkg); if (x) x.btChg = on; });
    addRecent(pkg);
  };
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
          { parts: ["If you encounter any issue while using the module, send it to me on Telegram: ", { text: "@DonkeyKongG3me", url: "https://t.me/DonkeyKongG3me" }, "."] }],
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
      title: "Restart watcher?",
      body: ["Restarting the watcher reloads the watcher and app list. Use this feature if the boosting stops working."],
      icon: "refresh",
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "OK", value: true, kind: "primary" }]
    });
    if (!ok) return;
    const r = await withBusy("Restarting watcher", "Please wait…",
      () => run(ctlCmd("restart"), 60000));
    if (r.errno === 0) snack("Watcher restarted");
    else snack("Couldn't restart watcher" + errText(r), null, true);
    refreshStatus();
  };
  $("rowReset").onclick = async () => {
    haptic("click");
    const ok = await dialog({
      title: "Reset module?",
      body: ["This will revert everything you configured in this app, including your configurations, settings and boosted apps. This cannot be undone.",
        "Are you sure?"],
      warn: true,
      buttons: [{ label: "Cancel", value: false, kind: "secondary" }, { label: "OK", value: true, kind: "danger" }]
    });
    if (!ok) return;
    const r = await withBusy("Resetting module", "Wiping settings...", async () => {
      const a = await run(ctlCmd("setconf", "''", 5, 2, 0, 0, 0));
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
  $("rowReleases").onclick = () => { haptic("click"); openUrl("https://t.me/DKStuff"); };
  $("rowSupport").onclick = () => { haptic("click"); openUrl("https://t.me/DKStuffChat"); };
  $("rowDiscord").onclick = () => { haptic("click"); copyText("donkeykong69"); };
  $("rowVersion").onclick = () => { haptic("click"); openUrl(RELEASES_URL); };
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
      if (mag > 1.65) {
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
      setShaking(shaking ? shk >= .08 : shk >= .165);
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
    }
    ctl = modDir + "/script/ctl.sh";
    history.replaceState({ v: ["home"] }, "", location.pathname + location.search);
    buildPresetList();
    G.tabs = springGlider($("tabs"), () => document.querySelector('.tab[aria-selected="true"]'), (b) => setTab(b.dataset.tab), { contain: true, pauseFx: true });
    $("pillnav").addEventListener("pointerdown", settleSwipe, true);
    G.nav = glider($("pillnav"), () => $("pillnav").querySelector('[aria-current="page"]'), (b) => goTop(b.dataset.val));
    window.addEventListener("resize", () => { syncGliders(false); fitAll(); flipEmpty(fitEmpty); });
    const params = new URLSearchParams(location.search);
    await Promise.all([loadConf(), loadUi(), refreshStatus(), loadCaps()]);
    renderChipNote();
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
    const probe = cloneConf(S.conf);
    normalizeFlags(probe);
    if ([...probe.apps].some(([p, e]) => { const o = S.conf.apps.get(p); return o.t !== e.t || o.h !== e.h || o.b !== e.b; })) changeConf(normalizeFlags);
    allowAppList();
    await loadApps();
    if (S.ui.sort === "new" || S.ui.sort === "old") await loadDates();
    S.loaded = true;
    appsBanner();
    renderList();
    renderStatus();
    renderFacts();
    fitAll();
    if (!hasKsu && params.get("tab") === "settings") goTop("settings");
    if (!hasKsu && params.get("app")) push("app:" + params.get("app"));
    if (!hasKsu && params.get("lic")) { goTop("settings"); push("licenses"); }
    setInterval(() => { if (!document.hidden) refreshStatus(); }, 4000);
  }
  init();
})();
