/* =========================================================
   Video Stage (embeddable) — 交互层
   - 1972×798 画布等比缩放
   - 3D 朝向按参考图；hover 回正 + 跟随 + 放大
   - SLOTS 为精调后的最终参数（直接用，无需 slots.js）
   ========================================================= */

// 嵌入主页时隐藏独立顶部导航
if (new URLSearchParams(location.search).get("embed") === "1") {
  document.body.classList.add("embed");
}

const WORKS = [
  { id: "01", brand: "MAYBACH",   type: "BRAND VIDEO",      cn: "品牌 | 产品视频",     desc: "光影、节奏与情绪的结合，\n打造具有品牌记忆点的视觉内容。", src: "assets/maybach-ad.mp4", poster: "assets/pahei-cover.jpg" },
  { id: "02", brand: "SCOTT",     type: "BRAND FILM",       cn: "品牌 | 情感短片",     desc: "山地车型的动态张力，\n泥土与风里的自由呼吸。",         src: "assets/scott-ad.mp4",   poster: "assets/scott-detail.jpg" },
  { id: "03", brand: "RAZER",     type: "E-COMMERCE VIDEO", cn: "电商 | 产品主图视频", desc: "20 周年机械鼠标，\n电竞基因的视觉爆发。",          src: "assets/razer-ad.mp4",   poster: "assets/razer-detail.jpg" },
  { id: "04", brand: "TOFU",      type: "MOTION VIDEO",     cn: "创意 | 动画短片",     desc: "家常豆腐的温润质感，\n生活气的轻快表达。",         src: "assets/tofu-ad.mp4",    poster: "" },
  { id: "05", brand: "GOAT MILK", type: "PROMOTION VIDEO",  cn: "活动 | 宣传视频",     desc: "现挤羊奶的纯净诉求，\n自然本味的信任感。",         src: "assets/goat-milk-ad.mp4", poster: "" },
];

// —— 原始精调槽位（用户提供的原版；未改动前后/尺寸/位置）——
const SLOTS = [
  { x: 269, y: 169, z: 800, scale: 0.377, rx: 15, ry: -20, opacity: 1,   zIndex: 30 },
  { x: 161, y: 47,  z: 400, scale: 0.45, rx: -2, ry: 38,  opacity: 0.80, zIndex: 11 },
  { x: 351, y: 46,  z: 400, scale: 0.42, rx: 0,  ry: 21,  opacity: 0.80, zIndex: 12 },
  { x: 514, y: 130, z: 400, scale: 0.44, rx: 2,  ry: -60, opacity: 0.80, zIndex: 12 },
  { x: 509, y: 254, z: 400, scale: 0.45, rx: 2,  ry: -60, opacity: 0.78, zIndex: 10 },
];

const EASE = "power3.out";
const DUR = 0.8;

// —— 透视参数（与 CSS .gallery 保持一致，用于按 z 改深度时的尺寸/位置补偿）——
const PERSP = 1100;                                   // perspective
const POX = 513, POY = 279;                           // perspective-origin 45%×1140 / 45%×620
const CARD_W = 440, CARD_H = 248;                     // --card-w / --card-h
const HOVER_Z = 900;                                  // 悬停时提到最前（> active 800 > 其余 400）
const FS_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

const gallery = document.getElementById("gallery");
const cards = [];
const fsMuteUpdaters = [];

let currentIndex = 0;
let soundOn = true;
let breatheTween = null;
const finePointer = window.matchMedia("(pointer: fine)").matches;

// —— 嵌入模式下，把鼠标坐标同步给父页面，由父站统一绘制光标 ——
const isEmbed = new URLSearchParams(location.search).get("embed") === "1";
if (isEmbed && window.parent !== window) {
  function sendCursor(x, y, visible) {
    try {
      window.parent.postMessage({ type: "cursor", x, y, visible }, "*");
    } catch (e) {}
  }
  window.addEventListener("mousemove", (e) => sendCursor(e.clientX, e.clientY, true), { passive: true });
  window.addEventListener("mouseleave", () => sendCursor(0, 0, false));
}

// —— 点状指示器（可选，若 HTML 中无 #infoRail 则跳过）——
const infoRail = document.getElementById("infoRail");
const railDots = [];
if (infoRail) {
  WORKS.forEach((w, i) => {
    const dot = document.createElement("i");
    dot.className = "rail__dot";
    dot.setAttribute("title", w.id + " " + w.brand);
    dot.addEventListener("click", () => { if (!document.body.classList.contains("embed-lock")) focus(i); });
    infoRail.appendChild(dot);
    railDots.push(dot);
  });
}

// —— 构建卡片 ——
WORKS.forEach((w, i) => {
  const card = document.createElement("div");
  card.className = "video-card";
  card.dataset.index = i;
  card.dataset.slot = String(i);

  const float = document.createElement("div");
  float.className = "video-card__float";

  const video = document.createElement("video");
  video.src = w.src;
  if (w.poster) video.poster = w.poster;
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

  const fs = document.createElement("button");
  fs.className = "video-card__fs";
  fs.type = "button";
  fs.setAttribute("aria-label", "全屏播放 " + w.brand);
  fs.innerHTML = FS_ICON;

  const progress = document.createElement("div");
  progress.className = "video-card__progress";

  const fsControls = document.createElement("div");
  fsControls.className = "fs-controls";
  fsControls.innerHTML = `
    <button class="fs-controls__btn fs-controls__play" type="button" aria-label="播放/暂停">
      <svg class="fs-controls__play-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <svg class="fs-controls__pause-icon" viewBox="0 0 24 24" aria-hidden="true" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
    </button>
    <div class="fs-controls__progress"><div class="fs-controls__progress-fill"></div></div>
    <span class="fs-controls__time">00:00 / 00:00</span>
    <button class="fs-controls__btn fs-controls__mute" type="button" aria-label="切换声音">
      <svg class="fs-controls__mute-on" viewBox="0 0 24 24" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
      <svg class="fs-controls__mute-off" viewBox="0 0 24 24" aria-hidden="true" style="display:none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
    </button>
    <button class="fs-controls__btn fs-controls__exit" type="button" aria-label="退出全屏">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
    </button>
  `;

  float.append(video, sheen, fs, progress, fsControls);
  card.append(float, num, label);
  gallery.appendChild(card);
  cards.push(card);

  const fsProgress = fsControls.querySelector(".fs-controls__progress");
  const fsProgressFill = fsControls.querySelector(".fs-controls__progress-fill");
  const fsTime = fsControls.querySelector(".fs-controls__time");
  const fsPlay = fsControls.querySelector(".fs-controls__play");
  const fsPlayIcon = fsControls.querySelector(".fs-controls__play-icon");
  const fsPauseIcon = fsControls.querySelector(".fs-controls__pause-icon");
  const fsMute = fsControls.querySelector(".fs-controls__mute");
  const fsMuteOn = fsControls.querySelector(".fs-controls__mute-on");
  const fsMuteOff = fsControls.querySelector(".fs-controls__mute-off");
  const fsExit = fsControls.querySelector(".fs-controls__exit");

  function updatePlayIcon() {
    if (video.paused) { fsPlayIcon.style.display = "block"; fsPauseIcon.style.display = "none"; }
    else { fsPlayIcon.style.display = "none"; fsPauseIcon.style.display = "block"; }
  }

  function fmtTime(s) {
    if (!isFinite(s)) return "00:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }
  function updateFsMuteIcon() {
    if (soundOn) { fsMuteOn.style.display = "block"; fsMuteOff.style.display = "none"; fsMute.classList.remove("is-muted"); }
    else { fsMuteOn.style.display = "none"; fsMuteOff.style.display = "block"; fsMute.classList.add("is-muted"); }
  }
  fsMuteUpdaters.push(updateFsMuteIcon);
  function updateFsProgress() {
    if (video.duration) {
      fsProgressFill.style.width = (video.currentTime / video.duration) * 100 + "%";
      fsTime.textContent = fmtTime(video.currentTime) + " / " + fmtTime(video.duration);
    }
  }

  video.addEventListener("timeupdate", () => {
    if (video.duration) progress.style.width = (video.currentTime / video.duration) * 100 + "%";
    updateFsProgress();
  });
  video.addEventListener("loadedmetadata", updateFsProgress);
  video.addEventListener("play", updatePlayIcon);
  video.addEventListener("pause", updatePlayIcon);

  card.addEventListener("click", () => focus(i));
  fs.addEventListener("click", (e) => {
    e.stopPropagation();
    unlockSound();
    const fl = card.querySelector(".video-card__float");
    if (fl.requestFullscreen) fl.requestFullscreen().catch(() => {});
    else if (fl.webkitRequestFullscreen) fl.webkitRequestFullscreen();
  });

  fsProgress.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = fsProgress.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (video.duration) video.currentTime = p * video.duration;
  });
  fsPlay.addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.paused) { video.play().catch(() => {}); }
    else { video.pause(); }
  });
  fsMute.addEventListener("click", (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    cards.forEach((c) => { const v = c.querySelector("video"); v.muted = !soundOn; });
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundIcon.textContent = soundOn ? "🔊" : "🔇";
    soundLabel.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
    updateAllFsMuteIcons();
  });
  fsExit.addEventListener("click", (e) => {
    e.stopPropagation();
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  });

  function onFsChange() {
    const isFs = document.fullscreenElement === float || document.webkitFullscreenElement === float;
    if (isFs) {
      video.muted = !soundOn;
      video.play().catch(() => {});
      updateFsMuteIcon();
      updateFsProgress();
    } else {
      if (i !== currentIndex) video.pause();
      else video.play().catch(() => {});
    }
  }
  float.addEventListener("fullscreenchange", onFsChange);
  float.addEventListener("webkitfullscreenchange", onFsChange);

  if (finePointer) {
    const qRX = gsap.quickTo(float, "rotationX", { duration: 0.45, ease: "power3.out" });
    const qRY = gsap.quickTo(float, "rotationY", { duration: 0.45, ease: "power3.out" });
    const baseOf = () => SLOTS[parseInt(card.dataset.slot, 10) || 0];
    const zoomOf = () => (i === currentIndex ? 1.4 : 1.14);

    card.addEventListener("pointerenter", () => {
      if (i !== currentIndex) { video.muted = true; video.play().catch(() => {}); }
      const b = baseOf();
      // 悬停：提到最前(HOVER_Z)，并用透视系数 R 补偿 x/y/scale，做到“原地浮起、不漂移”
      const R = (PERSP - HOVER_Z) / (PERSP - b.z);
      const xh = POX - CARD_W / 2 + (b.x + CARD_W / 2 - POX) * R;
      const yh = POY - CARD_H / 2 + (b.y + CARD_H / 2 - POY) * R;
      gsap.to(card, {
        rotationX: 0, rotationY: 0,
        x: xh, y: yh,
        scale: b.scale * zoomOf() * R,
        z: HOVER_Z,
        duration: 0.45, ease: EASE, overwrite: "auto",
      });
    });

    card.addEventListener("pointermove", (e) => {
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
      qRX(0); qRY(0);
      const b = baseOf();
      gsap.to(card, {
        rotationX: b.rx, rotationY: b.ry,
        x: b.x, y: b.y,
        scale: b.scale, z: b.z,
        duration: 0.55, ease: EASE, overwrite: "auto",
      });
      if (i !== currentIndex) video.pause();
    });
  }
});

function applySlot(card, slot, active) {
  const float = card.querySelector(".video-card__float");
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
  const idx = document.getElementById("infoIndex");
  const typ = document.getElementById("infoType");
  const dsc = document.getElementById("infoDesc");
  if (idx) idx.textContent = w.id;
  if (typ) typ.textContent = w.type;
  if (dsc) dsc.innerHTML = w.desc.replace(/\n/g, "<br>");
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

// —— 声音（默认开启；浏览器策略要求首次交互后才能真正出声）——
function updateAllFsMuteIcons() { fsMuteUpdaters.forEach((fn) => fn()); }
const soundBtn = document.getElementById("soundBtn");
const soundIcon = document.getElementById("soundIcon");
const soundLabel = document.getElementById("soundLabel");

// 初始 UI 标记为 SOUND ON（声音将在首次交互后解锁）
soundBtn.setAttribute("aria-pressed", "true");
soundIcon.textContent = "🔊";
soundLabel.textContent = "SOUND ON";

let soundUnlocked = false;
function unlockSound() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  cards.forEach((c) => { c.querySelector("video").muted = false; });
  const v = cards[currentIndex].querySelector("video");
  v.play().catch(() => {});
}
["pointerdown", "keydown", "touchstart"].forEach((ev) =>
  document.addEventListener(ev, unlockSound, { capture: true })
);

soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.setAttribute("aria-pressed", String(soundOn));
  soundIcon.textContent = soundOn ? "🔊" : "🔇";
  soundLabel.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
  cards.forEach((c) => { const v = c.querySelector("video"); v.muted = !soundOn; });
  updateAllFsMuteIcons();
  if (soundOn) { unlockSound(); cards[currentIndex].querySelector("video").play().catch(() => {}); }
});

// —— 箭头 / 键盘 / 触屏 ——
function step(dir) { focus((currentIndex + dir + WORKS.length) % WORKS.length); }
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
if (prevBtn) prevBtn.addEventListener("click", () => step(-1));
if (nextBtn) nextBtn.addEventListener("click", () => step(1));
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

// —— 画布等比缩放（iframe 内 = 填满 iframe 视口）——
const stage = document.getElementById("stage");
const DESIGN = { w: 1972, h: 798 };
function fitStage() {
  const availW = Math.min(window.innerWidth, 1440);
  const s = Math.min(availW / DESIGN.w, window.innerHeight / DESIGN.h);
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

// —— 绿色圆形沿细线滑动（无发光，低调）——
(function initFlowNodes() {
  const path = document.querySelector(".stage-deco__line");
  const node = document.querySelector(".stage-deco__node");
  if (!path || !node) return;
  const len = path.getTotalLength();
  let t = 0;
  function frame() {
    t = (t + 0.0009) % 1;
    const pt = path.getPointAtLength(t * len);
    node.setAttribute("cx", pt.x.toFixed(1));
    node.setAttribute("cy", pt.y.toFixed(1));
    requestAnimationFrame(frame);
  }
  frame();
})();

