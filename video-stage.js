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
  /* poster = 封面帧（用浏览器从各视频抽的一帧，1100 宽 jpg，5 张合计约 326KB）。
     用户 2026-09-18 反馈：滚动到屏2 时只有大卡有画面、其余卡片全黑，必须鼠标碰上去才出画面。
     根因是原来只有第 0 张 preload=metadata、其余 preload=none（浏览器压根不取数据）。
     现在用封面图兜底：卡片一出现就有画面，且**不用预载整段视频**（5 段共 28MB）。
     完整视频仍然只在鼠标移入 / 点击时才加载播放。 */
  { id: "01", brand: "迈巴赫",     type: "BRAND VIDEO",      desc: "光影、节奏与情绪的结合，\n打造具有品牌记忆点的视觉内容。", src: "assets/maybach-ad.mp4",   poster: "assets/posters/01-maybach.jpg" },
  { id: "02", brand: "SCOTT 山地车", type: "BRAND FILM",       desc: "山地车型的动态张力，\n泥土与风里的自由呼吸。",         src: "assets/scott-ad.mp4",     poster: "assets/posters/02-scott.jpg" },
  { id: "03", brand: "雷蛇",        type: "E-COMMERCE VIDEO", desc: "20 周年机械鼠标，\n电竞基因的视觉爆发。",          src: "assets/razer-ad.mp4",     poster: "assets/posters/03-razer.jpg" },
  { id: "04", brand: "豆腐",        type: "MOTION VIDEO",     desc: "家常豆腐的温润质感，\n生活气的轻快表达。",         src: "assets/tofu-ad.mp4",      poster: "assets/posters/04-tofu.jpg" },
  { id: "05", brand: "现挤羊奶",    type: "PROMOTION VIDEO",  desc: "现挤羊奶的纯净诉求，\n自然本味的信任感。",         src: "assets/goat-milk-ad.mp4", poster: "assets/posters/05-goat-milk.jpg" },
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
/* 触屏：刚做过「横向划动切卡」之后的一小段屏蔽窗。
   划动切卡走 stage 的 touchend→step()，但浏览器紧接着还会补一个 click，
   那个 click 会再 focus 一次（甚至因为「再点当前卡 = 切回原始姿态」把它切回去），
   表现就是「滑了一下没反应 / 又弹回来」。所以划动后 400ms 内忽略卡片 click。 */
let swipeGuardUntil = 0;
const finePointer = window.matchMedia("(pointer: fine)").matches;

/* —— 触屏（平板 / 手机）没有 hover ——
   桌面靠 pointerenter 把卡片「浮起 + 回正 + 放大」，触屏上这些事件不会触发，
   于是 iPad 上点了卡片它仍是设计稿的斜角姿态（用户 2026-10-02 反馈）。
   这里按桌面 hover 的**同一套公式**算一份等价槽位（位置/深度沿用 SLOTS[0]）：
     R = (透视距离 − 提升后的 z) / (透视距离 − 原 z)
     x/y 用 R 把偏移按比例收回中心，scale 同步乘 R → 卡片**中心点不动、只是变大**。
   实测（对数）：z 800→900 的透视放大 = (1100/200) ÷ (1100/300) = 1.5，
                 scale = 0.487 × 1.4 × 0.66667 = 0.45453
                 → 0.9333 × 1.5 = 1.40，净放大正好 1.4 倍（与桌面 hover 的大卡一致）。
   三轴旋转归零 → 正对观众。lift 12 与桌面 hover 同源（大卡上抬，顶边与大标题齐平）。 */
const FRONT_ZOOM = 1.4;
const FRONT_LIFT = 12;
const FRONT_R = (PERSP - HOVER_Z) / (PERSP - SLOTS[0].z);
const SLOT_FRONTFACE = Object.assign({}, SLOTS[0], {
  rx: 0, ry: 0, rz: 0,
  z: HOVER_Z,
  x: POX - CARD_W / 2 + (SLOTS[0].x + CARD_W / 2 - POX) * FRONT_R,
  y: POY - CARD_H / 2 + (SLOTS[0].y + CARD_H / 2 - POY) * FRONT_R - FRONT_LIFT,
  scale: SLOTS[0].scale * FRONT_ZOOM * FRONT_R,
});
/* 触屏当前大卡是否处于「正对 + 放大」预览态；再点一次同一张卡可在
   「预览态」与「设计稿原始姿态 SLOTS[0]」之间来回切（用户 2026-10-02：
   「他不会变回起始状态了」）。 */
let touchFront = false;

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
  /* 不在这里直接设 src —— 只把地址存进 dataset，等真要播的时候再挂上去。
     原因：实测浏览器会忽略 preload 的提示把整段视频拉下来，5 段合计约 28MB，手机流量扛不住。
     卡片挂了 poster 封面后本来就有画面，视频数据延后到「鼠标移入 / 点击 / 进全屏」那一刻才请求。
     ⚠️ 配套：下面把 video.play 包了一层 —— 任何地方调 play() 都会先确保 src 已设，
     所以 focus() / pointerenter / fsPlay / fullscreenchange 这些调用点一处都不用改。 */
  video.dataset.src = w.src;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  if (w.poster) video.poster = w.poster;
  video.preload = "none";
  video.setAttribute("playsinline", "");
  const nativePlay = video.play.bind(video);
  video.play = function () {
    if (!video.getAttribute("src") && video.dataset.src) video.src = video.dataset.src;
    return nativePlay();
  };

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

  card.addEventListener("click", () => {
    if (performance.now() < swipeGuardUntil) return;   // 刚划过屏 → 这一下 click 是划动的余波，忽略
    focus(i);
  });
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
      /* 当前大卡悬停时额外上抬，让它的顶边与大标题（VIDEO）上沿齐平 —— 用户 2026-09-19。
         理由：大标题本来就压在卡片后面的图层，抬齐后两者起于同一条线，视觉更整。
         ⚠️ 数值踩过坑：GSAP 写的 y 会被卡片自身的 scale 一起放大，而且比例接近 4 倍。
         实测三点：lift 0 → 卡片顶 156；lift 19 → 81；lift 66 → -106。
         即每 1 单位 y ≈ 3.96px 页面位移，所以想上移 48px 应为 48 / 3.96 ≈ 12。
         ⚠️ 只对当前大卡生效；其余卡片各自浮起、位置不动，避免小卡被顶出画面。 */
      const lift = (i === currentIndex) ? 12 : 0;
      gsap.to(card, {
        rotationX: 0, rotationY: 0, rotationZ: 0,
        x: xh, y: yh - lift,
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
  /* 触屏没有 hover —— 点开的大卡直接摆成「正对观众」（用户 2026-10-02）。
     桌面维持原样（沿用 SLOTS[0] 的斜角姿态，靠 hover 回正）。 */
  const frontOnly = !finePointer && !DBG_MODE;
  const bigSlot = frontOnly ? SLOT_FRONTFACE : SLOTS[0];
  if (to === currentIndex) {
    /* 再点一次当前卡：
       - 桌面：无动作（hover 会自己回正）。
       - 触屏：在「正对 + 放大预览」与「设计稿原始姿态」之间切换，
         让用户随时能退回起始状态（用户 2026-10-02：「他不会变回起始状态了」）。 */
    if (frontOnly) {
      touchFront = !touchFront;
      applySlot(cards[to], touchFront ? SLOT_FRONTFACE : SLOTS[0], true);
    }
    return;
  }
  const from = currentIndex;
  const targetSlotNum = parseInt(cards[to].dataset.slot, 10) || to;
  applySlot(cards[to], bigSlot, true);
  cards[to].dataset.slot = "0";
  applySlot(cards[from], SLOTS[targetSlotNum], false);
  cards[from].dataset.slot = String(targetSlotNum);
  currentIndex = to;
  if (frontOnly) touchFront = true;   // 触屏点开的卡默认就进「正对 + 放大」预览态
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
  touchFront = false;   // 重新排布 = 回到设计稿原始姿态（触屏预览态一并复位）
  cards.forEach((card, i) => {
    card.dataset.slot = String(i);
    applySlot(card, SLOTS[i], i === 0);
  });
  if (currentIndex === 0) startBreathe(cards[0]);
  _lastK = -1;    // 重排后强制重算（槽位分配可能变了，边界钳制结果也随之变化）
  applyEnter();   // 2026-10-15：重排后立即按当前滚动进度校正一次（避免首帧 is-active 未就位时的残留）
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
  if (Math.abs(dx) > 40) {
    step(dx < 0 ? 1 : -1);
    swipeGuardUntil = performance.now() + 400;   // 挡住划动后补发的那个 click
  }
});

// —— 画布等比缩放（iframe 内 = 填满 iframe 视口）——
const stage = document.getElementById("stage");
// 文字层（stage-overlay）已改成和 .stage 同一套 1972×798 设计稿坐标系，
// 必须施加同样的 scale，否则窄屏时画布缩放、文字层不缩放 → intro/info/foot 挤在一起重叠。
const overlay = document.getElementById("stageOverlay");
// 文案层（stage-copy）同样是 1972×798 坐标系，也要一起缩放；区别只在 z-index 更低（在卡片之下）
const copyLayer = document.getElementById("stageCopy");
const DESIGN = { w: 1972, h: 798 };
function fitStage() {
  const availW = Math.min(window.innerWidth, 1440);
  const s = Math.min(availW / DESIGN.w, window.innerHeight / DESIGN.h);
  STAGE_SCALE = s;   // 供 debug 拖拽换算屏幕像素 → 设计稿坐标
  stage.style.transform = "scale(" + s + ")";
  if (overlay) overlay.style.transform = "scale(" + s + ")";
  if (copyLayer) copyLayer.style.transform = "scale(" + s + ")";
}
window.addEventListener("resize", () => {
  fitStage();
  clearTimeout(window.__mmT);
  window.__mmT = setTimeout(measureMaps, 300);   // 尺寸变了 → 映射要重测
});

/* ============================================================
   屏2 进出场动画（2026-10-15 用户要求）
   ------------------------------------------------------------
   需求：4 个小卡在「滚动接近屏2」时从屏幕两侧边缘滑到当前位置；
        继续下滚离开屏2 时滑回侧边；向上滚回屏2 时再滑回中间 —— 可逆。
   实现要点：
   1) 驱动 = iframe 自身在父页视口中的进度 p（0 = 未进入/已离开，1 = 完全居中）。
      同源下 window.frameElement 可用 → iframe 内自算，不改父页、不走 postMessage。
      独立打开（非 embed）时 frameElement 为 null → p 恒 1 = 「现在的样子」，零影响。
   2) 只作用于【非 is-active 的 4 张小卡】—— 大卡是主角，保持不动（用户点名"4 个小屏幕"）。
   3) 位移用 CSS 独立的 translate 属性（--ex）作用在 .video-card 上：按规范它是最外层变换，
      不被 GSAP 的 scale 缩小、不受卡片 3D 旋转扭曲（曾试过挂 float，实测屏幕位移 -59048px、不可控），
      与 GSAP 的 transform 完全两条通道、零冲突。
   4) 阻尼 0.18：滚动驱动跟手但不生硬；反向滚动天然可逆。
   5) 左右方向按该卡【当前槽位】(dataset.slot) 的中心 x 判：左半 → 从左外来，右半 → 从右外来；
      位移量按 1/scale 补偿（卡有缩放，局部坐标要换算成屏幕位移）。
   6) ⚠️ 回退基线：backups/video-stage-{html,css,js}-before-scrollenter-20261015.*
   ============================================================ */
const ENTER_CANVAS_W = 1972;               // 设计画布宽（.gallery 世界宽）
const ENTER_STAGE_H = 798;                 // 设计画布高（边界钳制用）
let ENTER_OUT = 1540;                      // 「两侧分布」预设用的出屏距离（用户 2026-10-15 第 2 版调定）
/* 逐卡起始参数（2026-10-15 v2：用户要能逐卡调「在哪出现」和角度）：
   ENTER_START[槽位] = { dx, dy, rot, s }
     dx/dy = 起始位置相对【固定位置(SLOTS)】的偏移（画布坐标）；
     rot = 起始角度（平面旋转）；s = 起始缩放值（1 = 不缩小）。
   三个通道（translate/rotate/scale）都作用在 GSAP transform 的最外层，
   k=1 时全部呈现、k=0 时全置 none → GSAP 的 SLOTS 姿态完整回归（固定位置不变）。
   槽位索引 0 = 大卡（不参与动画），1..4 = 四张小卡。
   ⚠️ 起始位置在 applyEnter 里会被【边界钳制】到画布内（卡片最低点不出舞台）。 */
const ENTER_OFFSETS = [[-26, -16], [26, -14], [-18, 18], [20, 20]];   // 「大卡后堆叠」的错开量
function defaultEnterStart() {
  /* 起始偏移量直接采用【浏览器实测值】：让每张小卡的屏幕中心落在大视频框（大卡）矩形内。
     实测方法：对每张卡用单轴位移测出「画布→屏幕」系数，再反算"要进大卡需要的 translate"。
     用户 2026-10-15：「我上面的 2 号 3 号直接到下面去了，只要在大视频背后就好了」。
     ⚠️ 之前的自动钳制试了 6 轮都没稳定生效（3D 透视 + 各卡深度/旋转不同），这里先用实测值保证效果。 */
  return [null,
    { dx: 284, dy: 203, rot: -88, s: 0.2 },     // 卡1（实测要进大卡 ≈ 284/203）
    { dx: 187, dy: 206, rot: -18, s: 0.24 },    // 卡2（≈ 187/206）
    { dx: 152, dy: 150, rot: 0, s: 0.2 },       // 卡3（≈ 152/150）
    { dx: 148, dy: 215, rot: -41, s: 0.2 }];    // 卡4（≈ 148/215）
}
let ENTER_START = defaultEnterStart();
let enterFrozen = false;                   // true = 4 张小卡固定在 SLOTS 原位（面板「回到固定位置」）
let enterPreview = false;                  // true = 原地强制显示"起始态"（面板「预览起始态」，不用滚动就能看）
let ENTER_FX = true;                       // 抛洒效果（旋转+缩放）开关 —— 面板可关，用于性能 A/B 定位
let enterP = 1, enterTarget = 1;
let _lastK = -1;                           // 上一次生效的 k：值没变就跳过写样式（性能，见 applyEnter）
let _pTick = 0, _pCache = 1;               // 进度的节流缓存（见 enterTargetP）
let _measuring = false;                    // 测量期间冻结 applyEnter（否则临时写入会被下一帧覆盖）

function enterTargetP() {
  /* ⚡ 性能（用户 2026-10-15：「现在还是很卡」）：
     从 iframe 里对父文档元素调 getBoundingClientRect 会【强制父页同步布局】——
     原来每帧查一次，等于整页滚动时每帧一次 layout thrashing，滚到哪都卡。
     改成每 3 帧真查一次、其余帧复用缓存：进度最多滞后 ~50ms，肉眼不可辨。 */
  if ((_pTick++ % 3) !== 0) return _pCache;
  const fe = window.frameElement;
  if (!fe) { _pCache = 1; return 1; }      // 独立打开 / 跨域 → 恒等于「已就位」
  const r = fe.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const pIn = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.55)));
  const pOut = Math.max(0, Math.min(1, r.bottom / (vh * 0.55)));
  _pCache = Math.min(pIn, pOut);
  return _pCache;
}

/* 每张卡的「画布位移 → 屏幕位移」线性映射（2026-10-15 第 3 轮实测加入）：
   卡片的 z 深度不同 → 透视放大不同 → 同一个画布偏移在屏幕上走的距离不同
   （实测卡1：画布 +532px → 屏幕 +644px，系数 1.21）。
   所以要精确实现「卡片不出大视频框」，必须逐卡实测映射，再拿大卡的【屏幕矩形】去钳制。
   两点法：把 translate 临时设为 none 与 (100,100) 各测一次 rect，得到系数与基准点。 */
let _mapK = [];
let _bigR = null;
function measureMaps() {
  _measuring = true;      // ⚠️ 冻结动画写入：否则 enterLoop 下一帧就会把临时 translate 覆盖掉（实测污染过系数）
  _bigR = cards[0] ? cards[0].getBoundingClientRect() : null;   // 大卡屏幕矩形（缓存）
  _mapK = cards.map((c) => {
    const o = { kx: 1, ky: 1, cx: 0, cy: 0, hw: 0, hh: 0 };
    const prevT = c.style.translate, prevR = c.style.rotate, prevS = c.style.scale;
    c.style.translate = "none"; c.style.rotate = "none"; c.style.scale = "none";
    const r0 = c.getBoundingClientRect();
    /* ⚠️ 必须【单轴分别测】：卡片带 3D 旋转（如卡 3/4 的 ry=−69°），x 位移会串出 y 分量 ——
       用对角位移 (100,100) 测会把系数污染（实测 0.989 vs 真实 1.186），边界钳制因此失效。 */
    c.style.translate = "150px 0px";
    const r1 = c.getBoundingClientRect();
    c.style.translate = "0px 150px";
    const r2 = c.getBoundingClientRect();
    c.style.translate = prevT; c.style.rotate = prevR; c.style.scale = prevS;
    o.kx = Math.abs(r1.left - r0.left) / 150 || 1;
    o.ky = Math.abs(r2.top - r0.top) / 150 || 1;
    o.cx = r0.left + r0.width / 2;
    o.cy = r0.top + r0.height / 2;
    o.hw = r0.width / 2;
    o.hh = r0.height / 2;
    return o;
  });
  window.__mapK = _mapK;        // 调试暴露（诊断用）
  window.__bigR = _bigR;
  _measuring = false;
  /* ⚠️ 必须强制重算：_mapK 是延迟测好的，而 applyEnter 有「k 没变就跳过」的性能缓存 ——
     不重置的话卡片会一直停在【映射未就绪时】的退化钳制结果上（实测卡 3/卡 4 因此停在大卡外）。 */
  _lastK = -1;
  applyEnter();
}

function applyEnter() {
  /* k = 0 就位（固定位置） / k = 1 完全出屏（起始位置）。
     enterFrozen → 锁定 k=0；enterPreview → 锁定 k=1（原地预览起始态 —— 用户 2026-10-15：
     「现在我必须把屏幕放在上面或者下面我才能看到到底什么地方」）。 */
  const k = enterFrozen ? 0 : (enterPreview ? 1 : 1 - enterP);
  /* ⚡ 性能（2026-10-15 用户：「我不明白为什么这么卡」）：
     旧版每帧都无条件重写 5 张卡 × 3 个属性 = 15 次样式写入 —— 即使动画已停在终点也在写，
     持续触发样式重算 → 滚动卡顿。现在 k 没变化就直接跳过；阻尼收敛后彻底停写。 */
  if (_measuring) return;                   // 测量期间冻结（见 measureMaps）
  if (Math.abs(k - _lastK) < 0.0006) return;
  _lastK = k;
  /* 三个通道一起归零：translate / rotate / scale。
     ⚠️ 首帧时 is-active 类还没加上（layout() 在 enterLoop 之后才跑），大卡会被当成小卡写一次值；
     只在"就位态"归零的话那个值会永久残留 → 每帧先全部归零再赋值。 */
  cards.forEach((c) => { c.style.translate = "none"; c.style.rotate = "none"; c.style.scale = "none"; });
  if (k < 0.006) return;                   // 就位态：回归零开销
  cards.forEach((c, i) => {
    if (c.classList.contains("is-active")) return;      // 大卡是主角，不参与进出场（用户点名"4 个小屏幕"）
    const si = parseInt(c.dataset.slot, 10);
    const key = Number.isFinite(si) ? si : i;
    const st = ENTER_START[key] || { dx: 0, dy: 0, rot: 0, s: 1 };
    const slot = SLOTS[key] || SLOTS[i];
    /* 起始偏移 = 面板值 + 大卡画布矩形兜底钳制（防极端值）。
       ⚠️ 自动"屏幕级钳制"试了 6 轮：_mapK 的基准中心受 iframe 加载时序影响、实测不可信
       （同一环境两次测出 575 vs 1179），已放弃；改用【实测固化的默认值 + 用户手动微调】
       来保证"在大视频框背后"（用户 2026-10-15 的要求）。 */
    const bx0 = SLOTS[0].x - 260, bx1 = SLOTS[0].x + CARD_W + 260;
    const by0 = SLOTS[0].y - 40, by1 = SLOTS[0].y + CARD_H + 40;
    const ox = Math.min(Math.max(slot.x + st.dx, bx0), bx1);
    const oy = Math.min(Math.max(slot.y + st.dy, by0), by1);
    const cdx = ox - slot.x, cdy = oy - slot.y;
    /* ⚠️ 直接写 inline style（不用 CSS 变量：Chromium 对 individual transform properties 里的 var()
       支持不完整，实测算出 none）。按规范 translate → rotate → scale 作用在 GSAP transform 最外层。 */
    c.style.translate = (cdx * k).toFixed(1) + "px " + (cdy * k).toFixed(1) + "px";
    if (ENTER_FX) {                                   // 抛洒效果（可关：性能 A/B 用）
      c.style.rotate = (st.rot * k).toFixed(1) + "deg";
      c.style.scale = (1 - (1 - st.s) * k).toFixed(3);
    }
  });
}

(function enterLoop() {
  enterTarget = enterTargetP();
  /* ⚡ 手机性能（2026-10-16 实测「手机端很卡」）：iframe 完全离开视野且已收敛时，
     跳过阻尼计算与样式写入（手机端同页多个动画并存会互相拖垮帧率）。
     rAF 本身保留 —— 这样重新滚回来能立即恢复，不会有一帧迟滞。
     ⚠️ enterTargetP 自带"每 3 帧真查一次"的节流缓存，用它判断即可，不额外增加跨文档查询。 */
  const off = !enterFrozen && !enterPreview && enterTarget <= 0.0005 && enterP <= 0.0005;
  if (!off) {
    enterP += (enterTarget - enterP) * 0.22;
    if (Math.abs(enterTarget - enterP) < 0.004) enterP = enterTarget;   // 收敛即吸附
    applyEnter();
  }
  requestAnimationFrame(enterLoop);
})();

/* ============================================================
   出场调节器（2026-10-15 用户要求）
   ------------------------------------------------------------
   「⚙ 出场调节」浮动面板：实时调 出屏距离 / 抛洒旋转 / 抛洒缩放，
   外加「回到固定位置」—— 一键把 4 张小卡冻结在 SLOTS 精调原位
   （三通道全 none，之后滚动也不再进出场），再点一次恢复动画。
   独立打开 / embed 均可用；生产域名（github.io）自动隐藏 fab。
   ============================================================ */
(function initEnterPanel() {
  const fab = document.getElementById("enFab");
  const panel = document.getElementById("enPanel");
  if (!fab || !panel) return;
  /* 2026-10-16 用户要求：面板默认【隐藏】，只有 URL 带 ?edit=1 时才出现（成品状态干净）。
     调参时独立打开：video-stage.html?embed=1&edit=1 （屏3 同理：skills-stage.html?edit=1） */
  if (new URLSearchParams(location.search).get("edit") !== "1") { fab.style.display = "none"; return; }

  const $ = (id) => document.getElementById(id);

  /* 打开 / 收起面板
     ⚠️ 2026-10-15 补回：v2 重写这段逻辑时漏掉了这两行绑定 → 按钮显示正常但点击无反应
     （elementFromPoint 确认没被遮挡、JS click() 也无反应 = 监听器根本没绑）。 */
  fab.addEventListener("click", () => { panel.hidden = !panel.hidden; });
  const closeBtn = $("enClose");
  if (closeBtn) closeBtn.addEventListener("click", () => { panel.hidden = true; });

  let sel = 1;                                  // 当前选中的卡（槽位 1..4）
  const pad = (v, u) => (v > 0 ? "+" : "") + v + u;

  /* —— 工具：参与动画的卡 / 槽位换算（focus 交换槽位后依然正确）—— */
  function actCards() { return cards.map((c, i) => ({ c, i })).filter((o) => !o.c.classList.contains("is-active")); }
  function keyOf(o) { const si = parseInt(o.c.dataset.slot, 10); return Number.isFinite(si) ? si : o.i; }
  function slotOf(o) { const k = keyOf(o); return SLOTS[k] || SLOTS[o.i]; }
  function curStart() { return ENTER_START[sel] || (ENTER_START[sel] = { dx: 0, dy: 0, rot: 0, s: 1 }); }

  /* —— 四个逐卡滑杆 ↔ 当前选中卡 —— */
  const FIELDS = [
    ["enDx", "enDxV", "dx", (v) => pad(v, "px")],
    ["enDy", "enDyV", "dy", (v) => pad(v, "px")],
    ["enRot", "enRotV", "rot", (v) => pad(v, "°")],
    ["enScale", "enScaleV", "s", (v) => String(v)],
  ];
  function loadUI() {
    const st = curStart();
    FIELDS.forEach((f) => {
      const el = $(f[0]); if (!el) return;
      el.value = st[f[2]];
      const out = $(f[1]); if (out) out.textContent = f[3](parseFloat(el.value));
    });
  }
  FIELDS.forEach((f) => {
    const el = $(f[0]); if (!el) return;
    el.addEventListener("input", () => {
      const v = parseFloat(el.value);
      curStart()[f[2]] = v;
      const out = $(f[1]); if (out) out.textContent = f[3](v);
      applyEnter();
    });
  });
  loadUI();

  /* —— 卡选择器 —— */
  const seg = $("enCards");
  if (seg) {
    seg.addEventListener("click", (e) => {
      const b = e.target && e.target.closest ? e.target.closest(".en-seg__b") : null;
      if (!b) return;
      sel = parseInt(b.dataset.card, 10) || 1;
      Array.prototype.forEach.call(seg.children, (x) => x.classList.toggle("is-on", x === b));
      loadUI();
    });
  }

  /* —— 预设 1：两侧分布（按当前槽位 x 的中位数分界 = 2 左 2 右；旋转按左右反向）—— */
  const presetSide = $("enPresetSide");
  if (presetSide) presetSide.addEventListener("click", () => {
    const out = parseFloat($("enOut").value) || 1240;
    const act = actCards();
    const cxs = act.map((o) => slotOf(o).x + CARD_W / 2);
    const sorted = cxs.slice().sort((a, b) => a - b);
    const mid = sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : 0;
    act.forEach((o) => {
      const dir = (slotOf(o).x + CARD_W / 2) < mid ? -1 : 1;
      ENTER_START[keyOf(o)] = { dx: dir * out, dy: 0, rot: dir * 26, s: 0.72 };
    });
    loadUI(); applyEnter();
  });

  /* —— 预设 2：大卡后堆叠（起始位置 = 大卡位置附近 + 错开，像从大卡后面长出来）——
     ⚠️ 位移量打 0.55 折：卡 3/卡 4 带 ry=−69° 的强 3D 旋转，同样的画布位移在屏幕上被放大
     约 1.9 倍（实测），不打折它们会冲到大卡外面去（用户 2026-10-15：「你弄得这几个也是出去的」）。 */
  const presetBehind = $("enPresetBehind");
  if (presetBehind) presetBehind.addEventListener("click", () => {
    const big = SLOTS[0];
    actCards().forEach((o, idx) => {
      const off = ENTER_OFFSETS[idx % ENTER_OFFSETS.length];
      const slot = slotOf(o);
      ENTER_START[keyOf(o)] = {
        dx: Math.round((big.x + 40 + off[0] - slot.x) * 0.55),
        dy: Math.round((big.y + 30 + off[1] - slot.y) * 0.55),
        rot: -14 + idx * 9,
        s: 0.5,
      };
    });
    loadUI(); applyEnter();
  });

  /* —— 抛洒效果开关（性能 A/B）—— */
  const fxChk = $("enFx");
  if (fxChk) {
    fxChk.addEventListener("change", () => {
      ENTER_FX = fxChk.checked;
      _lastK = -1;                 // 强制重算（k 可能没变）
      applyEnter();
    });
  }

  /* —— 出屏距离（只影响下次点「两侧分布」的批量写入）—— */
  const enOutEl = $("enOut");
  if (enOutEl) {
    const applyOut = () => {
      ENTER_OUT = parseFloat(enOutEl.value) || 0;
      const o = $("enOutV"); if (o) o.textContent = ENTER_OUT + "px";
    };
    enOutEl.addEventListener("input", applyOut); applyOut();
  }

  /* —— 预览起始态（原地看"卡片从哪出现"，不用滚动）—— */
  const pvBtn = $("enPreview");
  if (pvBtn) {
    pvBtn.addEventListener("click", () => {
      enterPreview = !enterPreview;
      if (enterPreview && enterFrozen) {           // 两个锁定互斥
        enterFrozen = false;
        const hb = $("enHome");
        if (hb) { hb.textContent = "回到固定位置"; hb.classList.remove("is-on"); }
      }
      pvBtn.classList.toggle("is-on", enterPreview);
      pvBtn.textContent = enterPreview ? "退出预览（跟随滚动）" : "预览起始态";
      _lastK = -1;
      applyEnter();
    });
  }

  /* —— 回到固定位置（冻结 / 恢复，二合一）—— */
  const homeBtn = $("enHome");
  homeBtn.addEventListener("click", () => {
    enterFrozen = !enterFrozen;
    if (enterFrozen && enterPreview) {             // 两个锁定互斥
      enterPreview = false;
      if (pvBtn) { pvBtn.classList.remove("is-on"); pvBtn.textContent = "预览起始态"; }
    }
    homeBtn.textContent = enterFrozen ? "恢复出场动画" : "回到固定位置";
    homeBtn.classList.toggle("is-on", enterFrozen);
    _lastK = -1;
    applyEnter();
  });

  /* —— 恢复默认 —— */
  $("enReset").addEventListener("click", () => {
    ENTER_START = defaultEnterStart();
    ENTER_OUT = 1240;
    if (enOutEl) { enOutEl.value = 1240; const o = $("enOutV"); if (o) o.textContent = "1240px"; }
    sel = 1;
    if (seg) Array.prototype.forEach.call(seg.children, (x, i) => x.classList.toggle("is-on", i === 0));
    loadUI(); applyEnter();
  });

  /* —— 复制参数（发给助手固化：每张卡从哪出现、角度、缩放 + 固定位置原值）—— */
  const copyBtn = $("enCopy");
  copyBtn.addEventListener("click", async () => {
    const act = actCards();
    const cfg = {
      屏2出场动画: {
        出屏距离_px: ENTER_OUT,
        逐卡起始参数: act.map((o, idx) => {
          const key = keyOf(o);
          const st = ENTER_START[key] || { dx: 0, dy: 0, rot: 0, s: 1 };
          const slot = slotOf(o);
          return {
            小卡: idx + 1,
            槽位: key,
            起始位置_偏移: { dx: st.dx, dy: st.dy },
            起始位置_画布坐标: { x: Math.round(slot.x + st.dx), y: Math.round(slot.y + st.dy) },
            固定位置_画布坐标: { x: slot.x, y: slot.y },
            起始角度_deg: st.rot,
            起始缩放: st.s,
          };
        }),
      },
      固定位置_SLOTS_原值: SLOTS.map((s) => ({ x: s.x, y: s.y, z: s.z, scale: s.scale, rx: s.rx, ry: s.ry, rz: s.rz })),
      说明: "起始位置 = 未进入/离开屏2 时卡片停的位置；固定位置 = 屏2 居中时的就位姿态（动画终态）。",
    };
    const txt = JSON.stringify(cfg, null, 2);
    window.__enCfg = txt;
    try {
      await navigator.clipboard.writeText(txt);
      copyBtn.textContent = "已复制 ✓";
      const old = document.getElementById("enTa");
      if (old) old.style.display = "none";
    } catch (e) {
      /* 兜底：剪贴板被拒时，在面板里显示一个已全选的文本框（非阻塞，直接 Ctrl+C） */
      copyBtn.textContent = "请手动复制下方文本";
      let ta = document.getElementById("enTa");
      if (!ta) {
        ta = document.createElement("textarea");
        ta.id = "enTa";
        ta.className = "en-ta";
        ta.readOnly = true;
        panel.appendChild(ta);
      }
      ta.value = txt;
      ta.style.display = "block";
      ta.focus();
      ta.select();
    }
    setTimeout(() => { copyBtn.textContent = "复制参数（发给助手）"; }, 1800);
  });
})();

// —— 启动 ——
fitStage();
layout();
/* 等页面彻底稳定后再实测映射（边界钳制用）。
   ⚠️ 两个坑都踩过：
   ① 直接 setTimeout(1.1s) → 测到 GSAP 排布 tween 运动中的位置（系数被污染成 0.989，真实 ≈1.19）；
   ② 等到 4.5s 仍然太早 —— iframe 的内容布局/字体/poster 还在稳定，测出的基准中心偏差 600px。
   实测对比：17s 后测才准。所以这里至少等 10 秒（用户基本不会 10 秒内就滚到屏 2）。 */
/* 自动映射测量已停用（见 applyEnter 里的说明：_mapK 基准不可信，改用实测固化值）；
   保留函数与调用入口以便后续需要时恢复。 */
/* (function waitIdle(n) {
  if (n > 80) { measureMaps(); return; }
  const busy = n < 66 || (window.gsap && gsap.globalTimeline && gsap.globalTimeline.isActive());
  if (!busy) { measureMaps(); return; }
  setTimeout(() => waitIdle(n + 1), 150);
})(0); */
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
