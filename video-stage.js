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
  { id: "01", brand: "迈巴赫",     type: "BRAND VIDEO",      desc: "光影、节奏与情绪的结合，\n打造具有品牌记忆点的视觉内容。", src: "assets/maybach-ad.mp4" },
  { id: "02", brand: "SCOTT 山地车", type: "BRAND FILM",       desc: "山地车型的动态张力，\n泥土与风里的自由呼吸。",         src: "assets/scott-ad.mp4" },
  { id: "03", brand: "雷蛇",        type: "E-COMMERCE VIDEO", desc: "20 周年机械鼠标，\n电竞基因的视觉爆发。",          src: "assets/razer-ad.mp4" },
  { id: "04", brand: "豆腐",        type: "MOTION VIDEO",     desc: "家常豆腐的温润质感，\n生活气的轻快表达。",         src: "assets/tofu-ad.mp4" },
  { id: "05", brand: "现挤羊奶",    type: "PROMOTION VIDEO",  desc: "现挤羊奶的纯净诉求，\n自然本味的信任感。",         src: "assets/goat-milk-ad.mp4" },
];

// —— 原始精调槽位（用户提供的原版；未改动前后/尺寸/位置）——
// perspective-origin: 508px 284px（CSS .gallery 的 --pox / --poy，默认 508 284）
const SLOTS = [
  { x: 278, y: 159, z: 800, scale: 0.487, rx: 20, ry: -20, rz: 0,   opacity: 1,    zIndex: 30 },
  { x: 186, y: -23, z: 400, scale: 0.580, rx: -2, ry: 38,  rz: 0,   opacity: 0.8,  zIndex: 11 },
  { x: 420, y: -35, z: 400, scale: 0.530, rx: -2, ry: 18,  rz: 0,   opacity: 0.8,  zIndex: 12 },
  { x: 631, y: 97,  z: 400, scale: 0.560, rx: 23, ry: -69, rz: -18, opacity: 0.8,  zIndex: 12 },
  { x: 631, y: 260, z: 400, scale: 0.570, rx: 23, ry: -69, rz: -18, opacity: 0.78, zIndex: 10 },
];

const EASE = "power3.out";
const DUR = 0.8;

// —— 透视参数（与 CSS .gallery 保持一致，用于按 z 改深度时的尺寸/位置补偿）——
const PERSP = 1100;                                   // perspective
let POX = 508, POY = 284;                             // perspective-origin 45%×1140 / 45%×620（debug 下可拖动）
const CARD_W = 440, CARD_H = 248;                     // --card-w / --card-h
const HOVER_Z = 900;                                  // 悬停时提到最前（> active 800 > 其余 400）
let STAGE_SCALE = 1;                                  // 当前画布缩放比（fitStage 更新，debug 拖拽换算用）
const DBG_MODE = new URLSearchParams(location.search).get("debug") === "1" || location.hash.includes("debug");   // ?debug=1 或 #debug 拖拽调参模式
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
    const goDot = () => { if (!document.body.classList.contains("embed-lock")) focus(i); };
    dot.addEventListener("click", goDot);
    dot.addEventListener("pointerup", goDot);
    dot.addEventListener("touchend", goDot);
    dot.dataset.slotIndex = String(i);   // 用于 document 委托
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
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  // 首屏只让当前视频预加载元数据，其余默认不加载，切到再 load
  video.preload = i === 0 ? "metadata" : "none";
  video.setAttribute("playsinline", "");
  if (i !== 0) video.setAttribute("loading", "lazy");

  const sheen = document.createElement("div");
  sheen.className = "video-card__sheen";

  const num = document.createElement("div");
  num.className = "video-card__num";
  num.textContent = w.id;

  const label = document.createElement("div");
  label.className = "video-card__label";
  const cns = document.createElement("span");
  cns.className = "video-card__label-cn";
  cns.textContent = w.brand;
  const ens = document.createElement("span");
  ens.className = "video-card__label-en";
  ens.textContent = w.type;
  label.append(cns, ens);

  const desc = document.createElement("div");
  desc.className = "video-card__desc";
  desc.innerHTML = w.desc.replace(/\n/g, "<br>");

  const fs = document.createElement("button");
  fs.className = "video-card__fs";
  fs.type = "button";
  fs.setAttribute("aria-label", "全屏播放 " + w.brand);
  fs.innerHTML = FS_ICON;

  const divider = document.createElement("span");
  divider.className = "video-card__divider";
  divider.setAttribute("aria-hidden", "true");

  const meta = document.createElement("div");
  meta.className = "video-card__meta";
  meta.append(label, divider, desc, fs);

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

  float.append(video, sheen, progress, fsControls);
  card.append(float, num, meta);
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
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
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

  // debug 模式下禁用 JS 的 3D 悬停浮起/倾斜，否则拖动时卡片会自己位移打架。
  // CSS 的 :hover（黑框升起、描述浮现）不受影响，仍可正常预览。
  if (finePointer && !DBG_MODE) {
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
        rotationX: 0, rotationY: 0, rotationZ: 0,
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
        rotationX: b.rx, rotationY: b.ry, rotationZ: b.rz || 0,
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
  // rz 必须作用在 card 上：num / meta 是 card 的直接子元素（float 的兄弟），
  // 放 float 上会导致只有视频转、文字框不跟随。
  gsap.to(card, {
    x: slot.x, y: slot.y, z: slot.z,
    rotationX: slot.rx, rotationY: slot.ry, rotationZ: slot.rz || 0,
    scale: slot.scale,
    duration: DUR, ease: EASE, overwrite: "auto",
  });
  gsap.to(float, {
    opacity: slot.opacity,
    duration: DUR, ease: EASE, overwrite: "auto",
  });
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
    if (i === to) {
      v.preload = "metadata";
      v.load();
      v.muted = !soundOn;
      v.play().catch(() => {});
    } else {
      v.pause();
      v.preload = "none";
    }
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

// 初始 UI 标记为 SOUND ON（声音将在首次交互后解锁）
soundBtn.setAttribute("aria-pressed", "true");
soundBtn.textContent = "🔊";

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

// 按钮事件统一封装：click + pointerup + touchend 三重保险，按处理器独立去重（合并同一手势的多次触发）
// 修复三点：
//   1) lastTap 改为每个 fn 独立持有 —— 旧版全局共享，点完声音 300ms 内点箭头/圆点会被吞掉（表现为"按了没反应"）
//   2) 转发参数 —— 旧版 fn() 不传参，doDot(idx) 拿不到索引，会变成 focus(undefined) 直接抛 TypeError
//   3) 去重窗口 300ms → 120ms —— 旧版太长，连续切换视频时第二次点击会被吃掉
function guarded(fn) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last < 120) return;
    last = now;
    const e = args[0];
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    return fn(...args);
  };
}

// —— 声音 ——
const doToggleSound = guarded(toggleSound);
soundBtn.addEventListener("click", doToggleSound);
soundBtn.addEventListener("pointerup", doToggleSound);
soundBtn.addEventListener("touchend", doToggleSound);
document.addEventListener("click", (e) => { if (e.target.closest("#soundBtn")) doToggleSound(e); });
document.addEventListener("pointerup", (e) => { if (e.target.closest("#soundBtn")) doToggleSound(e); });
document.addEventListener("touchend", (e) => { if (e.target.closest("#soundBtn")) doToggleSound(e); });

function toggleSound() {
  soundOn = !soundOn;
  soundBtn.setAttribute("aria-pressed", String(soundOn));
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
  cards.forEach((c) => { const v = c.querySelector("video"); v.muted = !soundOn; });
  updateAllFsMuteIcons();
  if (soundOn) { unlockSound(); cards[currentIndex].querySelector("video").play().catch(() => {}); }
}

// —— 箭头 / 键盘 / 触屏 ——
function step(dir) { focus((currentIndex + dir + WORKS.length) % WORKS.length); }
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const doPrev = guarded(() => step(-1));
const doNext = guarded(() => step(1));
if (prevBtn) {
  prevBtn.addEventListener("click", doPrev);
  prevBtn.addEventListener("pointerup", doPrev);
  prevBtn.addEventListener("touchend", doPrev);
}
if (nextBtn) {
  nextBtn.addEventListener("click", doNext);
  nextBtn.addEventListener("pointerup", doNext);
  nextBtn.addEventListener("touchend", doNext);
}
// document 委托：兼容 WorkBuddy 预览/iframe 对直接 click 绑定的拦截
document.addEventListener("click", (e) => {
  if (e.target.closest("#prevBtn")) doPrev(e);
  if (e.target.closest("#nextBtn")) doNext(e);
});
document.addEventListener("pointerup", (e) => {
  if (e.target.closest("#prevBtn")) doPrev(e);
  if (e.target.closest("#nextBtn")) doNext(e);
});
document.addEventListener("touchend", (e) => {
  if (e.target.closest("#prevBtn")) doPrev(e);
  if (e.target.closest("#nextBtn")) doNext(e);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
// 右侧 rail 五个点：document 委托（click / pointerup / touchend）
const doDot = guarded((idx) => focus(idx));
document.addEventListener("click", (e) => {
  const dot = e.target.closest(".rail__dot");
  if (!dot || document.body.classList.contains("embed-lock")) return;
  const idx = parseInt(dot.dataset.slotIndex, 10);
  if (!isNaN(idx)) doDot(idx);
});
document.addEventListener("pointerup", (e) => {
  const dot = e.target.closest(".rail__dot");
  if (!dot || document.body.classList.contains("embed-lock")) return;
  const idx = parseInt(dot.dataset.slotIndex, 10);
  if (!isNaN(idx)) doDot(idx);
});
document.addEventListener("touchend", (e) => {
  const dot = e.target.closest(".rail__dot");
  if (!dot || document.body.classList.contains("embed-lock")) return;
  const idx = parseInt(dot.dataset.slotIndex, 10);
  if (!isNaN(idx)) doDot(idx);
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
// 文字层（stage-overlay）已改成和 .stage 同一套 1972×798 设计稿坐标系，
// 必须施加同样的 scale，否则窄屏时画布缩放、文字层不缩放 → intro/info/foot 挤在一起重叠。
const overlay = document.getElementById("stageOverlay");
const DESIGN = { w: 1972, h: 798 };
function fitStage() {
  const availW = Math.min(window.innerWidth, 1440);
  const s = Math.min(availW / DESIGN.w, window.innerHeight / DESIGN.h);
  STAGE_SCALE = s;   // 供 debug 拖拽换算屏幕像素 → 设计稿坐标
  stage.style.transform = "scale(" + s + ")";
  if (overlay) overlay.style.transform = "scale(" + s + ")";
}
window.addEventListener("resize", fitStage);

// —— 启动 ——
fitStage();
layout();
updateInfo(0);
cards[0].querySelector("video").play().catch(() => {});

const settled = new URLSearchParams(location.search).get("settled") === "1";
if (finePointer && !settled) {
  gsap.from(".intro > *, .intro__cta--stage-bottom", { y: 24, opacity: 0, stagger: 0.08, duration: 0.8, ease: "power3.out", delay: 0.1 });
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


// ============================================================
// DEBUG 拖拽模式 —— 访问 ?debug=1 开启
// 拖动卡片改 x/y，滚轮改 scale，实时显示数值，一键复制 SLOTS
// ============================================================
if (DBG_MODE) {
  initDebug();
}

function initDebug() {
  const panel = document.createElement("div");
  panel.className = "dbg";
  panel.innerHTML =
    '<div class="dbg__hd">SLOTS 调试 · 滚轮缩放 · 点下面按钮切换拖动模式</div>' +
    '<div class="dbg__mode" id="dbgMode">' +
    '<button type="button" data-mode="move" class="is-active">拖动：移动</button>' +
    '<button type="button" data-mode="rotate3d">拖动：3D转</button>' +
    '<button type="button" data-mode="rotate2d">拖动：平面转</button>' +
    '</div>' +
    '<div class="dbg__tip">透视要固定不变，靠下面「纯2D模式」开关：开着时所有卡片 rx/ry 强制归零，转 rz 只是正矩形斜着摆、形状不再变形；关掉则恢复原来的 3D 立体倾斜。复制 SLOTS 会按当前开关状态输出。</div>' +
    '<div class="dbg__rows" id="dbgRows"></div>' +
    '<div class="dbg__row dbg__row--persp">' +
    '<span class="dbg__idx">透视点</span>' +
    '<label>X<input type="number" id="dbgPOX" value="' + Math.round(POX) + '" step="1"></label>' +
    '<label>Y<input type="number" id="dbgPOY" value="' + Math.round(POY) + '" step="1"></label>' +
    '<button type="button" id="dbgPerspReset" class="dbg__mini">重置 513,279</button>' +
    '</div>' +
    '<div class="dbg__tip">画面上那个绿色十字圆点就是透视原点，直接拖它；深度固定 1100。</div>' +
    '<label class="dbg__freeze"><input type="checkbox" id="dbgFlat">' +
    '<b>纯2D模式</b>：全部卡片 rx/ry 归零，透视固定不变形（当前关闭=保留3D立体倾斜）</label>' +
    '<label class="dbg__freeze"><input type="checkbox" id="dbgFreeze" checked>' +
    '冻结未勾选卡片</label>' +
    '<div class="dbg__acts">' +
    '<button type="button" id="dbgSelAll">全选/清空</button>' +
    '<button type="button" id="dbgCopy">复制 SLOTS</button>' +
    '</div>' +
    '<div class="dbg__acts">' +
    '<button type="button" id="dbgAll">逐个激活预览</button>' +
    '<button type="button" id="dbgReTilt">恢复3D倾斜</button>' +
    '</div>' +
    '<textarea class="dbg__out" id="dbgOut" readonly></textarea>';
  document.body.appendChild(panel);

  const rowsBox = panel.querySelector("#dbgRows");
  const KEYS = ["x", "y", "scale", "rx", "ry", "rz"];
  const selected = new Set([0]);   // 多选集合（默认选中激活位）
  let freezeOn = true;             // 冻结开关状态
  let dragMode = "move";           // 当前拖动模式：move | rotate3d | rotate2d
  // 默认关闭：当前这版 SLOTS 是带 3D 倾斜调出来的，开着会把 rx/ry 抹平、看不出真实效果
  let flatOn = false;              // 纯2D模式：全局强制 rx/ry=0，透视不再因旋转而变形

  // 原始 3D 倾斜设计值（硬编码快照）：平面转会把 rx/ry 归零，点「恢复3D倾斜」可撤销
  const DEFAULT_TILT = [
    { rx: 15, ry: -20 }, { rx: -2, ry: 38 }, { rx: 0, ry: 21 },
    { rx: 2, ry: -60 }, { rx: 2, ry: -60 },
  ];

  // 拖动模式切换（点按钮即可，不用记 Shift/Ctrl 快捷键）
  const modeBtns = panel.querySelectorAll("#dbgMode button");
  function setMode(m) {
    dragMode = m;
    modeBtns.forEach(function (b) { b.classList.toggle("is-active", b.dataset.mode === m); });
  }
  panel.querySelector("#dbgMode").addEventListener("click", function (e) {
    const b = e.target.closest("button");
    if (!b) return;
    setMode(b.dataset.mode);
  });

  SLOTS.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "dbg__row";
    row.innerHTML =
      '<input type="checkbox" name="dbgSel" data-slot="' + i + '"' + (i === 0 ? " checked" : "") + ">" +
      '<span class="dbg__idx">' + (i === 0 ? "激活" : i) + "</span>" +
      KEYS.map(function (k) {
        const step = k === "scale" ? 0.005 : 1;
        return '<label>' + k + '<input type="number" data-i="' + i + '" data-k="' + k +
               '" value="' + s[k] + '" step="' + step + '"></label>';
      }).join("");
    rowsBox.appendChild(row);
  });

  // 勾选哪几行 = 解锁哪几张卡（其余冻结）；拖动/滚轮会同步作用于所有勾选项
  rowsBox.addEventListener("change", function (e) {
    const r = e.target;
    if (r.name !== "dbgSel") return;
    const i = parseInt(r.dataset.slot, 10);
    if (r.checked) selected.add(i); else selected.delete(i);
    applyFreeze();
  });

  panel.querySelector("#dbgFreeze").addEventListener("change", function (e) {
    freezeOn = e.target.checked;
    applyFreeze();
  });

  // 纯2D模式总开关：切换后立刻重刷全部卡片（拖动和填数字都会经过 applyDbg，一并生效）
  panel.querySelector("#dbgFlat").addEventListener("change", function (e) {
    flatOn = e.target.checked;
    SLOTS.forEach(function (_, i) { applyDbg(i); });
  });

  // —— 透视原点（perspective-origin）可视化 + 可拖动 ——
  // 标记挂在 .stage 的 2D 层，不进 .gallery 的 3D 空间，免得被卡片的 translateZ 排序盖住。
  const stageEl = document.querySelector(".stage");
  const galleryEl = document.getElementById("gallery");
  const perspDot = document.createElement("div");
  perspDot.className = "dbg-persp";
  perspDot.innerHTML = '<span class="dbg-persp__label">透视点</span>';
  if (stageEl) stageEl.appendChild(perspDot);

  const perspLabel = perspDot.querySelector(".dbg-persp__label");
  function updatePersp() {
    if (stageEl && galleryEl) {
      // 设计稿坐标 → stage 坐标：gallery 自身偏移 + 透视原点
      perspDot.style.left = (galleryEl.offsetLeft + POX) + "px";
      perspDot.style.top = (galleryEl.offsetTop + POY) + "px";
      galleryEl.style.setProperty("--pox", POX + "px");
      galleryEl.style.setProperty("--poy", POY + "px");
    }
    perspLabel.textContent = "透视点 " + Math.round(POX) + ", " + Math.round(POY);
    const ix = panel.querySelector("#dbgPOX");
    const iy = panel.querySelector("#dbgPOY");
    if (ix) ix.value = Math.round(POX);
    if (iy) iy.value = Math.round(POY);
  }
  updatePersp();

  let pOn = false, psx = 0, psy = 0;
  perspDot.addEventListener("pointerdown", function (e) {
    pOn = true; psx = e.clientX; psy = e.clientY;
    perspDot.setPointerCapture(e.pointerId);
    perspDot.classList.add("is-dragging");
    e.preventDefault();
    e.stopPropagation();
  });
  perspDot.addEventListener("pointermove", function (e) {
    if (!pOn) return;
    // 屏幕位移 → 设计稿坐标（画布整体被 scale 过，要除掉）
    POX += (e.clientX - psx) / STAGE_SCALE;
    POY += (e.clientY - psy) / STAGE_SCALE;
    psx = e.clientX; psy = e.clientY;
    updatePersp();
  });
  function perspEnd() { pOn = false; perspDot.classList.remove("is-dragging"); }
  perspDot.addEventListener("pointerup", perspEnd);
  perspDot.addEventListener("pointercancel", perspEnd);

  panel.querySelector("#dbgPOX").addEventListener("input", function (e) {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { POX = v; updatePersp(); }
  });
  panel.querySelector("#dbgPOY").addEventListener("input", function (e) {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { POY = v; updatePersp(); }
  });
  panel.querySelector("#dbgPerspReset").addEventListener("click", function () {
    POX = 508; POY = 284; updatePersp();
  });

  // —— 鼠标十字准星：深色画面上光标看不清，用十字+实时设计稿坐标定位 ——
  const cross = document.createElement("div");
  cross.className = "dbg-cross";
  cross.innerHTML = '<span class="dbg-cross__txt"></span>';
  document.body.appendChild(cross);
  const crossTxt = cross.querySelector(".dbg-cross__txt");

  document.addEventListener("pointermove", function (e) {
    cross.style.left = e.clientX + "px";
    cross.style.top = e.clientY + "px";
    const r = stage.getBoundingClientRect();
    const dx = Math.round((e.clientX - r.left) / STAGE_SCALE);
    const dy = Math.round((e.clientY - r.top) / STAGE_SCALE);
    crossTxt.textContent = dx + ", " + dy;
  });

  // 全选 / 全不选
  panel.querySelector("#dbgSelAll").addEventListener("click", function () {
    const all = selected.size === SLOTS.length;
    SLOTS.forEach(function (_, i) {
      if (all) selected.delete(i); else selected.add(i);
      const box = rowsBox.querySelector('[data-slot="' + i + '"]');
      if (box) box.checked = !all;
    });
    applyFreeze();
  });

  // 恢复 3D 倾斜：把勾选卡（未勾则全部）的 rx/ry 还原为设计值、rz 归零
  // 纯2D模式开着时 rx/ry 会被强制归零，这里顺手取消勾选，保证按钮看得见效果
  panel.querySelector("#dbgReTilt").addEventListener("click", function () {
    if (flatOn) {
      flatOn = false;
      panel.querySelector("#dbgFlat").checked = false;
    }
    const targets = selected.size
      ? Array.from(selected)
      : SLOTS.map(function (_, i) { return i; });
    targets.forEach(function (i) {
      const t = DEFAULT_TILT[i];
      if (!t) return;
      SLOTS[i].rx = t.rx;
      SLOTS[i].ry = t.ry;
      SLOTS[i].rz = 0;
      applyDbg(i);
    });
  });

  // 开局先按 flatOn 全量刷一遍，让纯2D模式立刻生效（否则要等第一次拖动才变）
  SLOTS.forEach(function (_, i) { applyDbg(i); });
  applyFreeze();

  // 手动改输入框 → 立即应用
  rowsBox.addEventListener("input", function (e) {
    const inp = e.target;
    if (inp.dataset.i === undefined) return;
    const i = parseInt(inp.dataset.i, 10);
    const k = inp.dataset.k;
    const v = parseFloat(inp.value);
    if (isNaN(v)) return;
    SLOTS[i][k] = v;
    applyDbg(i);
  });

  // slot → card 反查。cards[i] 与 SLOTS[i] 不是固定对应：
  // 每次 focus() 会重排 dataset.slot（激活卡占 0，被换下的卡继承原 slot）。
  // 直接用 cards[i] 会把数值 set 到别的卡上 —— 表现为"拖一张、其他跟着变"。
  function cardOfSlot(i) {
    return cards.find(function (c) {
      return (parseInt(c.dataset.slot, 10) || 0) === i;
    });
  }

  function slotOf(card) {
    return parseInt(card.dataset.slot, 10) || 0;
  }

  function applyDbg(i) {
    const card = cardOfSlot(i);
    if (!card) return;
    const s = SLOTS[i];
    // rz 作用在 card 上，保证视频 + 编号 + 文字框整体一起旋转
    // 纯2D模式（flatOn）：强制 rx/ry=0，卡片变正矩形，
    // perspective 只剩 translateZ 的缩放，不会再扭曲形状 —— 透视固定不变。
    gsap.set(card, {
      x: s.x, y: s.y, z: s.z, scale: s.scale,
      rotationX: flatOn ? 0 : s.rx,
      rotationY: flatOn ? 0 : s.ry,
      rotationZ: s.rz || 0,
      opacity: s.opacity, zIndex: s.zIndex,
    });
    card.classList.toggle("is-active", i === 0);
    const row = rowsBox.children[i];
    if (row) {
      row.querySelector('[data-k="x"]').value = Math.round(SLOTS[i].x);
      row.querySelector('[data-k="y"]').value = Math.round(SLOTS[i].y);
      row.querySelector('[data-k="scale"]').value = SLOTS[i].scale.toFixed(3);
      if (row.querySelector('[data-k="rx"]')) row.querySelector('[data-k="rx"]').value = Math.round(SLOTS[i].rx);
      if (row.querySelector('[data-k="ry"]')) row.querySelector('[data-k="ry"]').value = Math.round(SLOTS[i].ry);
      if (row.querySelector('[data-k="rz"]')) row.querySelector('[data-k="rz"]').value = Math.round(SLOTS[i].rz);
    }
  }

  // —— 冻结：只让"勾选中的 slot"的卡片接收鼠标，其余 pointer-events:none ——
  // 这样调 A 卡时未勾选的卡完全静止，不会因鼠标掠过而浮起/变亮干扰观察。
  function applyFreeze() {
    cards.forEach(function (c) {
      const s = slotOf(c);
      c.classList.toggle("dbg-frozen", freezeOn && !selected.has(s));
    });
  }

  // 拖动 + 滚轮（作用于所有勾选项，保持它们的相对布局一起动）
  cards.forEach(function (card) {
    card.classList.add("dbg-drag");
    let on = false, sx = 0, sy = 0;
    let startPos = {};   // { slotIndex: {x, y} } 拖动开始时的坐标快照

    card.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".video-card__fs")) return;   // 不拦全屏按钮
      if (e.target.closest(".fs-controls")) return;
      const i = slotOf(card);
      // 拖未勾选的卡时，自动只选它（避免"拖了没反应"）
      if (!selected.has(i)) {
        selected.clear();
        selected.add(i);
        syncCheckboxes();
        applyFreeze();
      }
      on = true;
      sx = e.clientX; sy = e.clientY;
      startPos = {};
      selected.forEach(function (si) {
        startPos[si] = { x: SLOTS[si].x, y: SLOTS[si].y, rx: SLOTS[si].rx, ry: SLOTS[si].ry, rz: SLOTS[si].rz };
      });
      card.setPointerCapture(e.pointerId);
      card.classList.add("is-dragging");
      e.preventDefault();
    });

    card.addEventListener("pointermove", function (e) {
      if (!on) return;
      selected.forEach(function (si) {
        const st = startPos[si];
        if (!st) return;
        const mode = e.shiftKey ? "rotate3d" : e.ctrlKey ? "rotate2d" : dragMode;
        if (mode === "rotate3d") {
          // 3D倾斜：水平拖 → rotationY，垂直拖 → rotationX（0.5°/px）
          SLOTS[si].ry = st.ry + (e.clientX - sx) * 0.5;
          SLOTS[si].rx = st.rx - (e.clientY - sy) * 0.5;
        } else if (mode === "rotate2d") {
          // 平面2D旋转：水平拖 → rotationZ（0.5°/px）
          // 是否去掉 3D 倾斜由「纯2D模式」总开关决定（在 applyDbg 里统一处理），
          // 这里只管改 rz，保证拖动和填数字两条路径行为一致。
          SLOTS[si].rz = st.rz + (e.clientX - sx) * 0.5;
        } else {
          // 位移（按各自 z 的透视系数，视觉同步）
          const pf = PERSP / (PERSP - SLOTS[si].z);
          SLOTS[si].x = st.x + (e.clientX - sx) / STAGE_SCALE / pf;
          SLOTS[si].y = st.y + (e.clientY - sy) / STAGE_SCALE / pf;
        }
        applyDbg(si);
      });
    });

    function end() { on = false; card.classList.remove("is-dragging"); }
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);

    // 滚轮：按倍率缩放所有勾选项（保持彼此大小比例，不会一齐拉成同样大）
    card.addEventListener("wheel", function (e) {
      e.preventDefault();
      const i = slotOf(card);
      if (!selected.has(i)) {
        selected.clear();
        selected.add(i);
        syncCheckboxes();
        applyFreeze();
      }
      const f = e.deltaY > 0 ? 0.97 : 1.03;
      selected.forEach(function (si) {
        SLOTS[si].scale = Math.max(0.05, Math.min(3, SLOTS[si].scale * f));
        applyDbg(si);
      });
    }, { passive: false });
  });

  function syncCheckboxes() {
    SLOTS.forEach(function (_, i) {
      const box = rowsBox.querySelector('[data-slot="' + i + '"]');
      if (box) box.checked = selected.has(i);
    });
  }

  // 复制当前 SLOTS
  panel.querySelector("#dbgCopy").addEventListener("click", function () {
    const txt =
      "// perspective-origin: " + Math.round(POX) + "px " + Math.round(POY) + "px" +
      "（CSS .gallery 的 --pox / --poy，默认 508 284）\n" +
      "const SLOTS = [\n" +
      SLOTS.map(function (s) {
        // 纯2D模式下按"实际看到的效果"输出：rx/ry 归零，免得合入正式版后又变回3D倾斜
        return "  { x: " + Math.round(s.x) + ", y: " + Math.round(s.y) + ", z: " + s.z +
               ", scale: " + s.scale.toFixed(3) +
               ", rx: " + (flatOn ? 0 : s.rx) + ", ry: " + (flatOn ? 0 : s.ry) +
               ", rz: " + s.rz +
               ", opacity: " + s.opacity + ", zIndex: " + s.zIndex + " },";
      }).join("\n") +
      "\n];";
    const out = panel.querySelector("#dbgOut");
    out.value = txt;
    out.select();
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(function () {});
    out.scrollIntoView({ block: "nearest" });
  });

  // 依次把每张卡切到激活位（方便逐个调）
  panel.querySelector("#dbgAll").addEventListener("click", function () {
    let n = 0;
    const timer = setInterval(function () {
      if (n >= cards.length) { clearInterval(timer); applyFreeze(); return; }
      focus(n);
      // 切完激活卡占 slot 0，把选中集合收敛到它，避免选中错位的卡
      selected.clear();
      selected.add(0);
      syncCheckboxes();
      applyFreeze();                                    // slot 重排后必须重算冻结
      n++;
    }, 900);
  });

  // 卡片被点击切换时（非 debug 的常规交互）也要重算冻结
  cards.forEach(function (c) {
    c.addEventListener("click", function () { setTimeout(applyFreeze, 50); });
  });

  // 拖拽 debug 面板本身：按住标题栏拖动，限制在窗口内
  (function makePanelDraggable(p) {
    const handle = p.querySelector(".dbg__hd");
    let dragging = false, sx = 0, sy = 0, dx = 0, dy = 0;
    function start(e) {
      const point = e.touches ? e.touches[0] : e;
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      const rect = p.getBoundingClientRect();
      p.style.left = rect.left + "px";
      p.style.top = rect.top + "px";
      p.style.right = "auto";
      p.style.bottom = "auto";
      sx = point.clientX;
      sy = point.clientY;
      dx = rect.left;
      dy = rect.top;
      handle.style.cursor = "grabbing";
      if (e.pointerId != null) {
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }
    function move(e) {
      if (!dragging) return;
      const point = e.touches ? e.touches[0] : e;
      let nx = dx + (point.clientX - sx);
      let ny = dy + (point.clientY - sy);
      const rect = p.getBoundingClientRect();
      nx = Math.max(0, Math.min(nx, window.innerWidth - rect.width));
      ny = Math.max(0, Math.min(ny, window.innerHeight - rect.height));
      p.style.left = nx + "px";
      p.style.top = ny + "px";
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = "move";
    }
    handle.addEventListener("pointerdown", start);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("touchstart", start, { passive: false });
    handle.addEventListener("touchmove", move, { passive: false });
    handle.addEventListener("touchend", end);
    handle.addEventListener("touchcancel", end);
    handle.addEventListener("mousedown", start);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  })(panel);
}
