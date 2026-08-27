/* =========================================================
   Video Stage (fresh) — 交互层 + 校准模式
   - 1972×798 画布等比缩放
   - 3D 朝向按参考图；hover 回正 + 跟随 + 放大
   - 校准模式：拖卡片对准参考图 + 数字面板 + 复制参数
   ========================================================= */

const WORKS = [
  { id: "01", brand: "MAYBACH",   type: "BRAND VIDEO",      cn: "品牌 | 产品视频",     desc: "光影、节奏与情绪的结合，\n打造具有品牌记忆点的视觉内容。", src: "videos/video01.mp4" },
  { id: "02", brand: "SCOTT",     type: "BRAND FILM",       cn: "品牌 | 情感短片",     desc: "山地车型的动态张力，\n泥土与风里的自由呼吸。",         src: "videos/video02.mp4" },
  { id: "03", brand: "RAZER",     type: "E-COMMERCE VIDEO", cn: "电商 | 产品主图视频", desc: "20 周年机械鼠标，\n电竞基因的视觉爆发。",          src: "videos/video03.mp4" },
  { id: "04", brand: "TOFU",      type: "MOTION VIDEO",     cn: "创意 | 动画短片",     desc: "家常豆腐的温润质感，\n生活气的轻快表达。",         src: "videos/video04.mp4" },
  { id: "05", brand: "GOAT MILK", type: "PROMOTION VIDEO",  cn: "活动 | 宣传视频",     desc: "现挤羊奶的纯净诉求，\n自然本味的信任感。",         src: "videos/video05.mp4" },
];

// —— 槽位（gallery 局部；数据来自 slots.js，编辑器保存即覆盖）——
// 兜底：slots.js 未加载时用此默认值
const SLOTS = (window.SLOTS && window.SLOTS.length === 5) ? window.SLOTS : [
  { x: 420,  y: 190, z: 80,   scale: 1.28, rx: 1,   ry: -6,  opacity: 1,    zIndex: 30 },
  { x: 0,    y: 20,  z: -200, scale: 0.54, rx: 9,   ry: 20,  opacity: 0.80, zIndex: 11 },
  { x: 640,  y: -25, z: -160, scale: 0.57, rx: 7,   ry: -16, opacity: 0.80, zIndex: 12 },
  { x: 1000, y: 80,  z: -180, scale: 0.53, rx: 6,   ry: 16,  opacity: 0.80, zIndex: 12 },
  { x: 950,  y: 330, z: -220, scale: 0.51, rx: -4,  ry: 14,  opacity: 0.78, zIndex: 10 },
];

const EASE = "power3.out";
const DUR = 0.8;
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const FULLSCREEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3H4zm16 0h-2V6h-3V4h5v5zM4 15h2v3h3v2H4v-5zm16 0v5h-5v-2h3v-3h2z"/></svg>';

const gallery = document.getElementById("gallery");
const cards = [];

// —— 消失点编辑层（覆盖 gallery，无 perspective，仅编辑器显示）——
const VP_FOCAL = 1100;
const CARD_W = 440;
const CARD_H = 248;
const vpLayer = document.createElement("div");
vpLayer.className = "vp-layer";
vpLayer.id = "vpLayer";
document.getElementById("stage").appendChild(vpLayer);
const vpLinesSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
vpLinesSvg.setAttribute("class", "vp-lines");
vpLayer.appendChild(vpLinesSvg);
const vpHandles = [];
const vpLines = [];
for (let k = 0; k < 4; k++) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  vpLinesSvg.appendChild(line);
  vpLines.push(line);
}

let currentIndex = 0;
let soundOn = false;
let breatheTween = null;
let isCalibrate = false;
let selectedIndex = -1;
let stageScaleVal = 1;
const finePointer = window.matchMedia("(pointer: fine)").matches;

// —— 点状指示器 ——
const infoRail = document.getElementById("infoRail");
const railDots = [];
WORKS.forEach((w, i) => {
  const dot = document.createElement("i");
  dot.className = "rail__dot";
  dot.setAttribute("title", w.id + " " + w.brand);
  dot.addEventListener("click", () => { if (!isCalibrate) focus(i); });
  infoRail.appendChild(dot);
  railDots.push(dot);
});

// —— 构建卡片 ——
WORKS.forEach((w, i) => {
  const card = document.createElement("div");
  card.className = "video-card";
  card.dataset.index = i;

  const float = document.createElement("div");
  float.className = "video-card__float";

  const video = document.createElement("video");
  video.src = w.src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("playsinline", "");

  const sheen = document.createElement("div");
  sheen.className = "video-card__sheen";

  const num = document.createElement("div");
  num.className = "video-card__num";
  num.textContent = w.id;

  const label = document.createElement("div");
  label.className = "video-card__label";
  const cns = document.createElement("span");
  cns.className = "video-card__label-cn";
  cns.textContent = w.cn;
  const ens = document.createElement("span");
  ens.className = "video-card__label-en";
  ens.textContent = w.type;
  label.append(cns, ens);

  const play = document.createElement("button");
  play.className = "video-card__play";
  play.type = "button";
  play.setAttribute("aria-label", "播放 " + w.brand);
  play.innerHTML = PLAY_ICON;

  const fs = document.createElement("button");
  fs.className = "video-card__fullscreen";
  fs.type = "button";
  fs.setAttribute("aria-label", "全屏 " + w.brand);
  fs.innerHTML = FULLSCREEN_ICON;

  const progress = document.createElement("div");
  progress.className = "video-card__progress";

  float.append(video, sheen, num, label, play, fs, progress);
  card.appendChild(float);
  gallery.appendChild(card);
  cards.push(card);
  createVPHandle(i);

  video.addEventListener("timeupdate", () => {
    if (video.duration) progress.style.width = (video.currentTime / video.duration) * 100 + "%";
  });

  card.addEventListener("click", () => { if (!isCalibrate) focus(i); });
  play.addEventListener("click", (e) => { e.stopPropagation(); if (!isCalibrate) focus(i); });
  fs.addEventListener("click", (e) => { e.stopPropagation(); if (!isCalibrate) toggleFullscreen(video); });

  if (finePointer) {
    const qRX = gsap.quickTo(float, "rotationX", { duration: 0.45, ease: "power3.out" });
    const qRY = gsap.quickTo(float, "rotationY", { duration: 0.45, ease: "power3.out" });
    const baseOf = () => SLOTS[parseInt(card.dataset.slot, 10) || 0];
    const zoomOf = () => (i === currentIndex ? 1.06 : 1.14);
    const liftOf = () => (i === currentIndex ? 30 : 60);

    card.addEventListener("pointerenter", () => {
      if (isCalibrate) return;
      if (i !== currentIndex) { video.muted = true; video.play().catch(() => {}); }
      const b = baseOf();
      gsap.set(card, { zIndex: 40 });
      gsap.to(card, {
        rotationX: 0, rotationY: 0,
        scale: b.scale * zoomOf(),
        z: b.z + liftOf(),
        duration: 0.45, ease: EASE, overwrite: "auto",
      });
    });

    card.addEventListener("pointermove", (e) => {
      if (isCalibrate) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const m = i === currentIndex ? 10 : 13;
      qRX(-py * m * 2);
      qRY(px * m * 2);
      sheen.style.setProperty("--mx", ((px + 0.5) * 100).toFixed(1) + "%");
      sheen.style.setProperty("--my", ((py + 0.5) * 100).toFixed(1) + "%");
    });

    card.addEventListener("pointerleave", () => {
      if (isCalibrate) return;
      qRX(0); qRY(0);
      const b = baseOf();
      gsap.set(card, { zIndex: b.zIndex });
      gsap.to(card, {
        rotationX: b.rx, rotationY: b.ry,
        scale: b.scale, z: b.z,
        duration: 0.55, ease: EASE, overwrite: "auto",
      });
      if (i !== currentIndex) video.pause();
    });
  }

  // —— 编辑器拖动（拖 = 改 x/y；Alt+拖 = 改透视深度 z；选中后滚轮 = 改 scale）——
  let drag = null;
  card.addEventListener("pointerdown", (e) => {
    if (!isCalibrate || e.target.closest("button")) return;
    e.preventDefault();
    // 点哪张先选中哪张
    if (selectedIndex !== i) selectCard(i);
    drag = {
      baseX: gsap.getProperty(card, "x"),
      baseY: gsap.getProperty(card, "y"),
      baseZ: gsap.getProperty(card, "z"),
      sx: e.clientX,
      sy: e.clientY,
      alt: e.altKey,
    };
    try { card.setPointerCapture(e.pointerId); } catch (_) {}
  });
  card.addEventListener("pointermove", (e) => {
    if (!isCalibrate || !drag) return;
    const dx = (e.clientX - drag.sx) / stageScaleVal;
    const dy = (e.clientY - drag.sy) / stageScaleVal;
    if (e.altKey || drag.alt) {
      // Alt+竖向拖动 → 透视深度 z（正=靠近/放大感，负=远离）
      const nz = drag.baseZ + dy * 1.4;
      gsap.set(card, { z: nz });
      setInput(i, "z", nz);
    } else {
      gsap.set(card, { x: drag.baseX + dx, y: drag.baseY + dy });
      setInput(i, "x", drag.baseX + dx);
      setInput(i, "y", drag.baseY + dy);
      syncVP(i);
    }
  });
  const endDrag = () => { drag = null; };
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
  // 滚轮 = 缩放 scale（仅编辑器、且选中本卡）
  card.addEventListener("wheel", (e) => {
    if (!isCalibrate || selectedIndex !== i) return;
    e.preventDefault();
    const cur = +gsap.getProperty(card, "scale");
    const ns = Math.min(1.8, Math.max(0.25, cur + (e.deltaY < 0 ? 0.02 : -0.02)));
    gsap.set(card, { scale: ns });
    setInput(i, "scale", ns);
  }, { passive: false });
});

function toggleFullscreen(video) {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    const el = video.requestFullscreen ? video : document.documentElement;
    el.requestFullscreen().catch(() => {});
  }
}

function applySlot(card, slot, active) {
  const float = card.querySelector(".video-card__float");
  gsap.set(card, { zIndex: slot.zIndex });
  card.classList.toggle("is-active", active);
  gsap.to(card, {
    x: slot.x, y: slot.y, z: slot.z,
    rotationX: slot.rx, rotationY: slot.ry,
    scale: slot.scale,
    duration: DUR, ease: EASE, overwrite: "auto",
  });
  gsap.to(float, { opacity: slot.opacity, duration: DUR, ease: EASE, overwrite: "auto" });
  if (!active) gsap.set(float, { boxShadow: "0 0 0 rgba(204, 255, 0, 0)" });
}

function focus(to) {
  if (to === currentIndex) return;
  const from = currentIndex;
  const targetSlotNum = parseInt(cards[to].dataset.slot, 10) || to;
  applySlot(cards[to], SLOTS[0], true);
  cards[to].dataset.slot = "0";
  applySlot(cards[from], SLOTS[targetSlotNum], false);
  cards[from].dataset.slot = String(targetSlotNum);
  currentIndex = to;
  cards.forEach((c, i) => {
    const v = c.querySelector("video");
    if (i === to) { v.muted = !soundOn; v.play().catch(() => {}); }
    else v.pause();
  });
  updateInfo(to);
  startBreathe(cards[to]);
}

function updateInfo(i) {
  const w = WORKS[i];
  document.getElementById("infoIndex").textContent = w.id;
  document.getElementById("infoType").textContent = w.type;
  document.getElementById("infoDesc").innerHTML = w.desc.replace(/\n/g, "<br>");
  railDots.forEach((d, j) => d.classList.toggle("is-active", j === i));
}

function startBreathe(card) {
  const float = card.querySelector(".video-card__float");
  if (breatheTween) breatheTween.kill();
  gsap.set(float, { boxShadow: "0 0 24px rgba(204, 255, 0, 0.35)" });
  breatheTween = gsap.to(float, {
    boxShadow: "0 0 42px rgba(204, 255, 0, 0.55)",
    duration: 1.6, yoyo: true, repeat: -1, ease: "sine.inOut",
  });
}

function layout() {
  cards.forEach((card, i) => {
    card.dataset.slot = String(i);
    applySlot(card, SLOTS[i], i === 0);
  });
  if (currentIndex === 0) startBreathe(cards[0]);
}

// —— 声音 ——
const soundBtn = document.getElementById("soundBtn");
const soundIcon = document.getElementById("soundIcon");
const soundLabel = document.getElementById("soundLabel");
soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.setAttribute("aria-pressed", String(soundOn));
  soundIcon.textContent = soundOn ? "🔊" : "🔇";
  soundLabel.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
  const v = cards[currentIndex].querySelector("video");
  v.muted = !soundOn;
  if (soundOn) v.play().catch(() => {});
});

// —— 箭头 / 键盘 / 触屏 ——
function step(dir) { focus((currentIndex + dir + WORKS.length) % WORKS.length); }
document.getElementById("nextBtn").addEventListener("click", () => { if (!isCalibrate) step(1); });
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
let touchX = 0;
const stageEl = document.getElementById("stage");
stageEl.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
stageEl.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
});

// —— 参考图对照层 ——
const trace = document.getElementById("trace");
const traceToggle = document.getElementById("traceToggle");
let traceOn = new URLSearchParams(location.search).get("trace") !== "off";
trace.classList.toggle("is-on", traceOn);
traceToggle.textContent = traceOn ? "✕ 关闭对照" : "🔍 参考图对照";
traceToggle.addEventListener("click", () => {
  if (isCalibrate) return;
  traceOn = !traceOn;
  trace.classList.toggle("is-on", traceOn);
  traceToggle.textContent = traceOn ? "✕ 关闭对照" : "🔍 参考图对照";
});
document.getElementById("traceImg").addEventListener("error", () => {
  trace.classList.remove("is-on");
  traceToggle.style.display = "none";
});

// —— 可视化编辑器（点选 + 拖动 + 滚轮缩放 + Alt 拖深度 + 方向键转朝向 + 滑块 + 一键落盘）——
const FIELDS = [
  { k: "x", label: "X 横移", min: -400, max: 1200, step: 1, fmt: 0 },
  { k: "y", label: "Y 纵移", min: -400, max: 800, step: 1, fmt: 0 },
  { k: "z", label: "Z 透视", min: -400, max: 400, step: 1, fmt: 0 },
  { k: "rx", label: "RX 俯仰", min: -60, max: 60, step: 1, fmt: 0 },
  { k: "ry", label: "RY 朝向", min: -60, max: 60, step: 1, fmt: 0 },
  { k: "scale", label: "缩放", min: 0.25, max: 1.8, step: 0.01, fmt: 2 },
];
const inputs = [];      // inputs[i][k] = { range, num, val }
const edPanel = document.getElementById("editorPanel");
const edTitle = document.getElementById("edTitle");
const edCur = document.getElementById("edCur");

function buildEditorPanel() {
  FIELDS.forEach((f) => {
    const row = document.createElement("div");
    row.className = "ed__row";
    const lab = document.createElement("label");
    lab.className = "ed__lab";
    lab.textContent = f.label;
    const range = document.createElement("input");
    range.type = "range";
    range.min = f.min; range.max = f.max; range.step = f.step;
    const num = document.createElement("input");
    num.type = "number";
    num.min = f.min; num.max = f.max; num.step = f.step;
    num.className = "ed__num";
    range.addEventListener("input", () => setField(selectedIndex, f.k, parseFloat(range.value)));
    num.addEventListener("input", () => setField(selectedIndex, f.k, parseFloat(num.value)));
    row.append(lab, range, num);
    edPanel.appendChild(row);
    inputs.push({ k: f.k, range, num });
  });
}
buildEditorPanel();

// 把某卡某字段设成某值（滑块/数字/拖拽/键盘统一走这里）
function setField(i, k, v) {
  if (i < 0 || !Number.isFinite(v)) return;
  const prop = k === "rx" ? "rotationX" : k === "ry" ? "rotationY" : k;
  gsap.set(cards[i], { [prop]: v });
  refreshPanel(i);
  if (k === "rx" || k === "ry") syncVP(i);
}
function refreshPanel(i) {
  if (i < 0) return;
  inputs.forEach((rec) => {
    const prop = rec.k === "rx" ? "rotationX" : rec.k === "ry" ? "rotationY" : rec.k;
    const raw = +gsap.getProperty(cards[i], prop);
    const v = Math.round(raw * 1000) / 1000;
    rec.range.value = v;
    rec.num.value = v;
  });
}
// 拖拽/滚轮写回滑块
function setInput(i, k, v) {
  if (i < 0) return;
  const rec = inputs.find((r) => r.k === k);
  if (!rec) return;
  const val = Math.round(v * 1000) / 1000;
  rec.range.value = val;
  rec.num.value = val;
}

// —— 消失点手柄：每张卡一个，编辑器内可拖拽 ——
function createVPHandle(i) {
  const h = document.createElement("div");
  h.className = "vp-handle";
  h.dataset.index = i;
  h.title = "消失点 " + WORKS[i].id + " " + WORKS[i].brand;
  let drag = null;
  h.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    selectCard(i);
    const off = getVPOffset(i);
    drag = { sx: e.clientX, sy: e.clientY, dx0: off.dx, dy0: off.dy };
    try { h.setPointerCapture(e.pointerId); } catch (_) {}
  });
  h.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.sx) / stageScaleVal + drag.dx0;
    const dy = (e.clientY - drag.sy) / stageScaleVal + drag.dy0;
    const rot = rotationFromVP(dx, dy);
    setField(i, "rx", rot.rx);
    setField(i, "ry", rot.ry);
    syncVP(i);
  });
  const endDrag = () => { drag = null; };
  h.addEventListener("pointerup", endDrag);
  h.addEventListener("pointercancel", endDrag);
  vpLayer.appendChild(h);
  vpHandles.push(h);
}

function getVPOffset(i) {
  const rx = +gsap.getProperty(cards[i], "rotationX");
  const ry = +gsap.getProperty(cards[i], "rotationY");
  return vpFromRotation(rx, ry);
}
function vpFromRotation(rx, ry) {
  const radX = rx * Math.PI / 180;
  const radY = ry * Math.PI / 180;
  return {
    dx: -VP_FOCAL * Math.tan(radY),
    dy: VP_FOCAL * Math.tan(radX),
  };
}
function rotationFromVP(dx, dy) {
  return {
    rx: Math.atan2(dy, VP_FOCAL) * 180 / Math.PI,
    ry: -Math.atan2(dx, VP_FOCAL) * 180 / Math.PI,
  };
}
function syncVP(i) {
  if (i < 0 || !vpHandles[i]) return;
  const cx = +gsap.getProperty(cards[i], "x") + CARD_W / 2;
  const cy = +gsap.getProperty(cards[i], "y") + CARD_H / 2;
  const off = getVPOffset(i);
  const hx = cx + off.dx;
  const hy = cy + off.dy;
  gsap.set(vpHandles[i], { x: hx, y: hy });
  if (i === selectedIndex) drawVPLines(i, hx, hy);
}
function drawVPLines(i, hx, hy) {
  const x = +gsap.getProperty(cards[i], "x");
  const y = +gsap.getProperty(cards[i], "y");
  const corners = [[x, y], [x + CARD_W, y], [x + CARD_W, y + CARD_H], [x, y + CARD_H]];
  vpLines.forEach((line, k) => {
    line.setAttribute("x1", corners[k][0].toFixed(1));
    line.setAttribute("y1", corners[k][1].toFixed(1));
    line.setAttribute("x2", hx.toFixed(1));
    line.setAttribute("y2", hy.toFixed(1));
  });
}
function clearVPLines() {
  vpLines.forEach((line) => {
    line.setAttribute("x1", 0); line.setAttribute("y1", 0);
    line.setAttribute("x2", 0); line.setAttribute("y2", 0);
  });
}
function updateVPSelection() {
  vpHandles.forEach((h, j) => h.classList.toggle("is-selected", j === selectedIndex));
  if (selectedIndex < 0) clearVPLines();
  else syncVP(selectedIndex);
}

function selectCard(i) {
  selectedIndex = i;
  cards.forEach((c, j) => c.classList.toggle("is-selected", j === i));
  updateVPSelection();
  const w = WORKS[i];
  edTitle.textContent = "编辑中：" + w.id + " " + w.brand;
  edCur.textContent = w.type;
  refreshPanel(i);
}

// 方向键转朝向（仅编辑器 + 有选中）
document.addEventListener("keydown", (e) => {
  if (!isCalibrate || selectedIndex < 0) return;
  const step = e.shiftKey ? 5 : 1;
  const card = cards[selectedIndex];
  if (e.key === "ArrowLeft")  { setField(selectedIndex, "ry", +gsap.getProperty(card, "rotationY") - step); e.preventDefault(); }
  else if (e.key === "ArrowRight") { setField(selectedIndex, "ry", +gsap.getProperty(card, "rotationY") + step); e.preventDefault(); }
  else if (e.key === "ArrowUp")    { setField(selectedIndex, "rx", +gsap.getProperty(card, "rotationX") - step); e.preventDefault(); }
  else if (e.key === "ArrowDown")  { setField(selectedIndex, "rx", +gsap.getProperty(card, "rotationX") + step); e.preventDefault(); }
});

function buildSlotsText() {
  const arr = cards.map((c, i) => {
    const gx = Math.round(+gsap.getProperty(c, "x"));
    const gy = Math.round(+gsap.getProperty(c, "y"));
    const gz = Math.round(+gsap.getProperty(c, "z"));
    const grx = Math.round(+gsap.getProperty(c, "rotationX"));
    const gry = Math.round(+gsap.getProperty(c, "rotationY"));
    const gs = Math.round(+gsap.getProperty(c, "scale") * 100) / 100;
    return "  { x: " + gx + ", y: " + gy + ", z: " + gz +
      ", scale: " + gs + ", rx: " + grx + ", ry: " + gry +
      ", opacity: " + SLOTS[i].opacity + ", zIndex: " + SLOTS[i].zIndex + " },";
  });
  return "window.SLOTS = [\n" + arr.join("\n") + "\n];";
}

// 复制参数
document.getElementById("edCopy").addEventListener("click", async () => {
  const txt = buildSlotsText();
  try { await navigator.clipboard.writeText(txt); } catch (_) {}
  const btn = document.getElementById("edCopy");
  btn.textContent = "✓ 已复制";
  setTimeout(() => { btn.textContent = "⧉ 复制参数"; }, 1500);
});

// 保存落盘：POST 到本地 server，直接覆盖 slots.js
document.getElementById("edSave").addEventListener("click", async () => {
  const btn = document.getElementById("edSave");
  const payload = { slots: cards.map((c, i) => ({
    x: Math.round(+gsap.getProperty(c, "x")),
    y: Math.round(+gsap.getProperty(c, "y")),
    z: Math.round(+gsap.getProperty(c, "z")),
    scale: Math.round(+gsap.getProperty(c, "scale") * 100) / 100,
    rx: Math.round(+gsap.getProperty(c, "rotationX")),
    ry: Math.round(+gsap.getProperty(c, "rotationY")),
    opacity: SLOTS[i].opacity, zIndex: SLOTS[i].zIndex,
  })) };
  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) { btn.textContent = "✓ 已保存到 slots.js"; }
    else { btn.textContent = "✗ 保存失败"; }
  } catch (err) {
    btn.textContent = "✗ 需编辑器端口";
  }
  setTimeout(() => { btn.textContent = "💾 保存参数"; }, 1800);
});

// 退出编辑器
document.getElementById("edExit").addEventListener("click", exitEditor);

function enterEditor() {
  isCalibrate = true;
  // 进入时把卡片复位到当前 SLOTS 基础态，清掉 hover 残留
  cards.forEach((c, i) => {
    c.classList.remove("is-selected");
    gsap.set(c, {
      x: SLOTS[i].x, y: SLOTS[i].y, z: SLOTS[i].z,
      rotationX: SLOTS[i].rx, rotationY: SLOTS[i].ry, scale: SLOTS[i].scale,
    });
    syncVP(i);
  });
  document.body.classList.remove("is-clean");
  trace.classList.add("is-on");
  traceToggle.style.display = "none";
  calib.hidden = false;
  vpLayer.classList.add("is-on");
  selectCard(0);
}
function exitEditor() {
  isCalibrate = false;
  selectedIndex = -1;
  cards.forEach((c) => c.classList.remove("is-selected"));
  calib.hidden = true;
  vpLayer.classList.remove("is-on");
  clearVPLines();
  trace.classList.remove("is-on");
  traceToggle.style.display = "";
  if (!debugOn) document.body.classList.add("is-clean");
  layout();
}

// —— 校准模式（保留旧入口按钮，等价于进入编辑器）——
const calib = document.getElementById("calib");
const calibToggle = document.getElementById("calibToggle");
calibToggle.addEventListener("click", () => {
  if (isCalibrate) exitEditor(); else enterEditor();
  calibToggle.textContent = isCalibrate ? "✓ 编辑器 ON" : "🧲 编辑器";
});

// 自动进入：URL 带 ?editor=1
if (new URLSearchParams(location.search).get("editor") === "1") {
  calibToggle.textContent = "✓ 编辑器 ON";
  enterEditor();
}

// —— 画布等比缩放 ——
const stage = document.getElementById("stage");
const DESIGN = { w: 1972, h: 798 };
function fitStage() {
  const s = Math.min(window.innerWidth / DESIGN.w, window.innerHeight / DESIGN.h);
  stageScaleVal = s;
  stage.style.transform = "scale(" + s + ")";
}
window.addEventListener("resize", fitStage);

// —— 启动 ——
fitStage();
layout();
updateInfo(0);
cards[0].querySelector("video").play().catch(() => {});

const settled = new URLSearchParams(location.search).get("settled") === "1";
if (finePointer && !settled) {
  gsap.from(".intro > *", { y: 24, opacity: 0, stagger: 0.08, duration: 0.8, ease: "power3.out", delay: 0.1 });
  gsap.from(".info", { y: 24, opacity: 0, duration: 0.8, ease: "power3.out", delay: 0.3 });
  gsap.from(".foot", { y: 18, opacity: 0, duration: 0.8, ease: "power3.out", delay: 0.4 });
}

// —— 调试按钮默认隐藏，只有 ?debug=1 才显示 ——
const debugOn = new URLSearchParams(location.search).get("debug") === "1";
if (!debugOn) document.body.classList.add("is-clean");

// —— 绿色曲线上的流动节点 ——
(function initFlowNodes() {
  const path = document.getElementById("flowPath");
  const nodes = document.querySelectorAll(".stage-deco__node");
  if (!path || !nodes.length) return;
  const len = path.getTotalLength();
  const positions = [0.22, 0.58, 0.88];
  let t = 0;
  function frame() {
    t += 0.0008;
    nodes.forEach((node, i) => {
      const p = (positions[i] + t) % 1;
      const pt = path.getPointAtLength(p * len);
      node.setAttribute("cx", pt.x.toFixed(1));
      node.setAttribute("cy", pt.y.toFixed(1));
    });
    requestAnimationFrame(frame);
  }
  frame();
})();
