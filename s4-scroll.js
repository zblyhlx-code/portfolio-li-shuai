/* ============================================================================
   第四屏 · 滚动叙事（2026-10-13 从 _draft-s4-scroll.html 接入 index.html）
   ----------------------------------------------------------------------------
   由 index.html 末尾的懒加载器注入：先 three.min.js，再本文件。
   所以本文件执行时 THREE 一定已就绪，DOM 也早已解析完。
   进度 p = 本 section 在视口里滚了多少（420vh 的行程），不依赖任何主站变量。
   ⚠️ 改这个文件之后，记得把 index.html 懒加载器里 s4-scroll.js?v= 的版本号一起改掉，
      否则浏览器/CDN 会继续吃缓存（与屏2/屏3 的 v= 同一规矩）。
   ============================================================================ */
(function () {
  'use strict';

  /* ============================================================
     0. 工具
     ============================================================ */
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var smooth = function (t) { return t * t * (3 - 2 * t); };
  var fadeOut = function (p, s, e) { return 1 - smooth(clamp((p - s) / (e - s), 0, 1)); };
  var fadeIn  = function (p, s, e) { return smooth(clamp((p - s) / (e - s), 0, 1)); };
  function mixHex(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    var g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    var bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ============================================================
     1. 素材（先用项目里现有的 8 张作品图）
     ============================================================ */
  var IMGS = [
    'assets/posters/01-maybach.jpg',
    'assets/posters/02-scott.jpg',
    'assets/posters/03-razer.jpg',
    'assets/posters/04-tofu.jpg',
    'assets/posters/05-goat-milk.jpg',
    'assets/razer-detail.jpg',
    'assets/scott-detail.jpg',
    'assets/pahei-cover.jpg'
  ];
  var CAPS = ['Maybach', 'Scott', 'Razer', 'Tofu', 'Goat Milk', 'Razer Detail', 'Scott Detail', 'Pahei'];

  /* ============================================================
     2. 滚动进度
     ============================================================ */
  var s4 = document.getElementById('s4');
  var sticky = document.getElementById('sticky');
  var segText = document.getElementById('segText');
  var segTunnel = document.getElementById('segTunnel');
  var tunMark = document.querySelector('.tun__mark');
  var tunVeil = document.getElementById('tunVeil');
  var rail = document.getElementById('rail');
  var railDots = rail ? rail.querySelectorAll('i') : [];
  var p = 0;

  /* 调试：?freeze=0.5 把进度钉死在某个值（headless 下滚动不可靠） */
  var FREEZE = null;
  var _f = new URLSearchParams(location.search).get('freeze');
  if (_f !== null && !isNaN(parseFloat(_f))) FREEZE = clamp(parseFloat(_f), 0, 1);

  function readScroll() {
    if (FREEZE !== null) { p = FREEZE; return; }
    var total = s4.offsetHeight - vpH();
    if (total <= 0) { p = 0; return; }
    p = clamp(-s4.getBoundingClientRect().top / total, 0, 1);
  }

  /* 三段进度区间（2026-10-13 二次改版：删掉「点停在中心」那一拍）
     A 圆柱文字 0.00–0.32 → B「句号→通道」0.30–0.58 → C 隧道推进 0.58–1.00
     A 段内部其实分两拍：k 从 0 转到 9 ——
       k=6 的那一瞬，末尾那个句号正好落到画面正中（p≈0.21）；
       之后 k 继续 6→9，其余行全部转到背面退场，只剩句号留在正中。
     接着由【一条 smootherstep】接手（B 段不再分子曲线、也没有停顿拍）：
       tGrow/eGrow : 0.30–0.58  窗口 0 → 覆盖全屏
       窗口 <90px 由纯黑保底层盖住 → 始终是那个"黑点"，不会露出灰雾显小；
       文字层退场改绑窗口尺寸：窗口长到 22px（＝句号）开始淡、62px 时消失。 */
  var A0 = 0.00, A1 = 0.32;
  var B0 = 0.32, B1 = 0.58;
  var C0 = 0.58, C1 = 1.00;

  /* ============================================================
     3. 段落 A —— CSS 3D 圆柱文字
     ============================================================ */
  var lines = Array.prototype.slice.call(document.querySelectorAll('.t3d__line'));
  var CYL_R = 340;    // 圆柱半径(px)：越大越"平"，越小越"卷"
  var CYL_STEP = 21;  // 每行间隔角度(deg)
  /* 【句号这条线的关键】圆柱要转到"DOT_LINE=6"那一步，末尾的句号才正好落在画面正中。
     但此时前面的行只偏了 21°~126°，还清清楚楚挂在画面上（实测：DESIGNER 还有 87% 不透明度）。
     所以 k 要再往后转 3 格（K_END=9）—— 其余行全部转到背面退场，而句号单独冻结在中心。
     这样才是"文字滚走了，只留下一个句号"。 */
  var DOT_LINE = lines.length - 1;
  var K_END = DOT_LINE + 3;

  /* 滚动方向（2026-10-12 定稿 = B 版）：
       -1 → 静止时 LI SHUAI 排最上、往下依次排列；页面下滚时文字整体往上走
       +1 → 反向（静止时首行在最下、下滚时文字往下走）
     诊断口子：?dir=down 切回 +1 对照。 */
  var T3D_DIR = -1;
  (function () {
    var q = new URLSearchParams(location.search).get('dir');
    if (q === 'down' || q === '1' || q === 'old') T3D_DIR = 1;
  })();

  /* 【A 段的落点 = 圆柱末尾那个句号】
     ⚠️ 2026-10-13 改版：原先是把「DESIGNER」原地缩到 0、再在中心冒出一个圆点；
        用户要的是"文字后面跟着的一个句号滚到中心，然后继续滚动进入 C" ——
        所以现在圆柱第 7 行就是「.」，它【滚】到中心（不是缩到中心），
        A 段结束的那一刻它正好在画面正中，由 B 段的圆窗接手长大。
     几何是硬的：pp=1 时它的角度 a=(6-6)*21=0 → rotateX(0) translateZ(340)
     → 正对相机、投影落在画面正中（实测视口 1440×900 下 cy=450）。 */

  /* 逐行渲染。
     k 从 0 转到 K_END（9）：每行绕 X 轴转到自己的角度、推到圆柱半径上。
     句号那一行单独冻结 —— k 超过 DOT_LINE(6) 之后它不再往前走，永远停在画面正中。
     不透明度用 cos² 衰减，转到圆柱背面（cos<0）自然归零。 */
  function renderText(pp) {
    var k = pp * K_END;
    for (var i = 0; i < lines.length; i++) {
      var ki = (i === DOT_LINE) ? Math.min(k, DOT_LINE) : k;
      var a = (i - ki) * CYL_STEP * T3D_DIR;
      var rad = a * Math.PI / 180;
      var cos = Math.cos(rad);
      lines[i].style.transform = 'translate(-50%,-50%) rotateX(' + a.toFixed(3) + 'deg) translateZ(' + CYL_R + 'px)';
      lines[i].style.opacity = (cos <= 0.02 ? 0 : Math.pow(cos, 2.0)).toFixed(3);
    }
  }

  /* ============================================================
     4. 段落 C —— Three.js 黑底照片隧道
        对应 React Bits「Passage Gallery」，按官方 props 语义复刻。
        ⚠️ 2026-10-12 修正：初版我做成了「圆柱形照片环」——那是错的。
           官方是一条【矩形走廊】：地板 / 天花板 / 左墙 / 右墙四个面，
           各自铺【方格瓷砖网格】，照片是【贴在面上】的，不是正对相机的卡片。
           决定"走廊感"的三个参数恰好是用户没贴的那三个：
             lanes        地板/天花板横向格数（默认 5）
             photoFill    有照片的格子占比（默认 0.30，其余是墙色 + 细网格线）
             lineOpacity  网格线不透明度（默认 0.12）
        props 映射：
          lanes        5     地板/天花板横向格数；墙高 3 格
          gap          0.04  瓷砖相对格子的内缩量
          radius       0.06  瓷砖圆角（0=方，1=圆）
          photoFill    0.30  照片占比
          accentFill   0     渐变强调块占比（本次 0 → 无）
          lineOpacity  0.12  网格线不透明度
          fov          72°   与官方默认一致
          blur         0.7   官方=高速运动模糊；本页无后期通道 → 改用它控制雾的衰减距离
          look         1.5   指针视差 / 视向偏移
          seed         15    决定哪些格子放照片
          speed/boost  官方=恒定巡航 + 按住加速；本页由滚动驱动 + 恒定巡航
        未实现：hover 提亮 / focusOnClick 飞出 / captions —— 三者都需要逐块 mesh + 射线拾取，
                本版是"整张贴图"方案，先跑通观感再说。
     ============================================================ */
  var TUN_CFG = {
    /* ⚠️ 竖屏（手机/平板竖握）会把这两者【对调】，即走廊原地转 90° —— 见上方
       「竖屏：把横着的矩形隧道竖起来」开关。想改横比就改这两个数，别改别处。 */
    lanes: 5,          // 地板 / 天花板横向格数（横屏）→ 竖屏时变成【墙高】
    wallLanes: 3,      // 墙高（格，横屏）→ 竖屏时变成【地板/天花板横向格数】
    gap: 0.04,
    radius: 0.06,
    photoFill: 0.30,
    accentFill: 0,
    lineOpacity: 0.12,
    blur: 0.7,
    look: 1.5,
    seed: 15,
    fov: 72,
    colors: ['#CCFF00', '#9CFF3D'],   // 官方是紫→粉渐变，这里换品牌绿
    bg: '#111111'
  };
  var TUN_BG = 0x111111;
  var TUN_CELL = 1;    // 一个格子的世界尺寸（三轴统一，所以格子是正方形）
  var TUN_LOOP = 40;   // 贴图覆盖 40 格。必须 > 雾的可见距离，否则能看出图案在重复
  var TUN_LEN = 200;   // 四个平面的长度（世界单位）
  var TUN_Z = -80;     // 平面中心 z：向前铺 180、向后留 20，相机位移时不会露出平面边缘

  var tunnel = { ready: false };

  /* ---------- 竖屏：「把横着的矩形隧道竖起来」开关（2026-10-13 用户反馈）--------
     ⚠️ 现象：手机竖屏（390×844）下整条隧道是【横躺】的 —— 天花板和地板各占画面上下
        一大块、左右墙被挤成两条细边，看着像一条很宽很扁的走廊。
     原因：走廊横截面是 5 格宽 × 3 格高（5:3 的【横】矩形），而手机是 0.46 的竖屏幕。
     修法：竖屏时把横截面【原地转 90°】→ 3 格宽 × 5 格高（3:5 的【竖】矩形）。
           格数总和不变（5+3 = 3+5 = 8），贴图格子总数 640 一格不差
           → 照片密度、贴图尺寸、UV 映射、射线拾取全部自动跟着走，零额外成本。

     ⚠️⚠️ 必须【两处一起转】，只转一处比不转更糟：
        ① 走廊横截面（initTunnel 里的 NW / NH）
        ② B 段那个"窗口"长成的形状（tick 里的 5:3 矩形）
        因为【窗口＝隧道口】：窗口长成的形状必须和走廊口一模一样，
        这正是"黑点撑开 → 露出走廊"这段连贯感的全部来源。
          只转窗口 → 窗口竖着、走廊口横着，剪影对不上，一眼假；
          只转走廊 → 窗口横着切一条竖走廊。

     ⚠️ 判定用【真视口】的高 > 宽（vpH / vpW），绝不用 window.inner*（见下方 471 行）。
     横屏（含 3440 超宽屏、iPad 横握）走原路 —— 一个像素都不动。
     当场对照：?ar=wide 强制横版 / ?ar=tall 强制竖版。 */
  function tunIsPortrait() {
    var f = /[?&]ar=(wide|tall)/.exec(location.search);
    if (f) return f[1] === 'tall';
    return vpH() > vpW();
  }
  /* 走廊横截面的格数（宽 × 高）—— 竖屏就是横屏的 90° 旋转。 */
  function tunLanes() {
    return tunIsPortrait()
      ? { w: TUN_CFG.wallLanes, h: TUN_CFG.lanes }       // 竖屏 3 × 5
      : { w: TUN_CFG.lanes,     h: TUN_CFG.wallLanes };  // 横屏 5 × 3
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* 照片按 cover 填满格子（不变形） */
  function drawCover(ctx, img, x, y, w, h) {
    if (!img || !img.width || !img.height) { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(x, y, w, h); return; }
    var ir = img.width / img.height, cr = w / h, sx, sy, sw, sh;
    if (ir > cr) { sh = img.height; sw = sh * cr; sx = (img.width - sw) / 2; sy = 0; }
    else { sw = img.width; sh = sw / cr; sx = 0; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  /* 一张贴图 = 一块 cols×rows 的瓷砖网格：墙色底 + 细网格线 + 30% 照片 + accentFill 渐变块
     out（可选）：把每格"是第几张图"写回一个 Int16Array（-1 = 这格没照片），
                  供射线拾取反查「点到的是哪张作品」用（见 4.1 节）。 */
  function paintGrid(canvas, cols, rows, cellPx, imgs, rnd, out) {
    var W = cols * cellPx, H = rows * cellPx;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = TUN_CFG.bg;                      // 墙面 = backgroundColor
    ctx.fillRect(0, 0, W, H);

    var pad = cellPx * TUN_CFG.gap / 2;              // gap：瓷砖相对格子内缩
    var tile = cellPx - pad * 2;
    var rad = TUN_CFG.radius * 0.5 * tile;           // radius：0=方 1=圆

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = c * cellPx + pad, y = r * cellPx + pad;
        var roll = rnd();
        var photoOf = -1;                            // 这一格用的第几张图（-1 = 无）
        if (roll < TUN_CFG.photoFill && imgs.length) {
          photoOf = (r * cols + c) % imgs.length;
          ctx.save();
          roundRectPath(ctx, x, y, tile, tile, rad);
          ctx.clip();
          /* 用 (r*cols+c) % 池子长度 轮流取图 → 相邻格必定不同图，不会糊成一片 */
          drawCover(ctx, imgs[photoOf], x, y, tile, tile);
          ctx.restore();
        } else if (roll < TUN_CFG.photoFill + TUN_CFG.accentFill) {
          ctx.save();
          roundRectPath(ctx, x, y, tile, tile, rad);
          ctx.clip();
          var g = ctx.createLinearGradient(x, y, x + tile, y + tile);
          g.addColorStop(0, TUN_CFG.colors[0]);
          g.addColorStop(1, TUN_CFG.colors[1]);
          ctx.fillStyle = g;
          ctx.fillRect(x, y, tile, tile);
          ctx.restore();
        }
        if (out) out[r * cols + c] = photoOf;
      }
    }

    /* 极细网格线（lineOpacity）—— 走廊的"骨架"就靠它。
       ⚠️ 这里没法像原版那样画 1px 屏幕线：贴图会被 mipmap 缩小，
          太细的线在掠射角上会被平均掉、直接消失。所以线宽取格子像素的 3.2%，
          让它在远端也留得住（观感对齐 0.12 的线不透明度）。 */
    ctx.strokeStyle = 'rgba(255,255,255,' + TUN_CFG.lineOpacity + ')';
    ctx.lineWidth = Math.max(2, cellPx * 0.026);
    ctx.beginPath();
    for (var i = 0; i <= cols; i++) { ctx.moveTo(i * cellPx, 0); ctx.lineTo(i * cellPx, H); }
    for (var j = 0; j <= rows; j++) { ctx.moveTo(0, j * cellPx); ctx.lineTo(W, j * cellPx); }
    ctx.stroke();
  }

  /* 拆掉上一次的隧道（只在【竖屏↔横屏切换】重建时用到）。
     ⚠️ 必须连 geometry / material / texture 一起 dispose —— 只丢引用的话
        WebGL 资源会一直挂着，转几次屏就爆显存。
     ⚠️⚠️ <canvas> 必须【整个换新的】，不能原地复用：
        forceContextLoss() 之后同一张 canvas 上再 getContext('webgl') 会返回 null，
        新建的 WebGLRenderer 直接抛 "reading 'precision' of null"（实测踩到）。
        换法是 cloneNode(false)：id / class / 内联样式全部照抄 → #tunnel 的
        CSS（position:absolute;inset:0;width/height:100%）继续生效，只是位图是空的。
     ⚠️ 换了 canvas 就得重挂监听（见 bindTunnelCanvas），否则转向后照片点不开。 */
  function disposeTunnel() {
    if (!tunnel.renderer) return false;
    if (tunnel._onResize) window.removeEventListener('resize', tunnel._onResize);
    if (tunnel.scene) {
      tunnel.scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        var m = o.material;
        if (m) { if (m.map) m.map.dispose(); m.dispose(); }
      });
    }
    try { tunnel.renderer.dispose(); } catch (e) {}
    try { tunnel.renderer.forceContextLoss(); } catch (e) {}
    var old = document.getElementById('tunnel');
    if (old && old.parentNode) old.parentNode.replaceChild(old.cloneNode(false), old);
    tunnel.renderer = null; tunnel.scene = null; tunnel.camera = null;
    tunnel.pickables = null; tunnel.pickMeshes = null;
    tunnel.ready = false;
    return true;                 // true = canvas 换过了，调用方要重挂监听
  }

  function initTunnel() {
    if (!window.THREE) { console.warn('[tunnel] THREE 未加载'); return; }
    /* 竖屏 ↔ 横屏切换（转手机/转平板）时重建：横截面格数变了，
       Uint16 格矩阵、四张贴图画布、四个 PlaneGeometry 都得按新格数重做。
       正常加载路径上 tunnel.renderer 是 null → 这段不会执行、canvas 原封不动。 */
    var swapped = disposeTunnel();
    tunnel.portrait = tunIsPortrait();
    var canvas = document.getElementById('tunnel');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    /* ⚡ 手机性能（2026-10-16 实测「手机端很卡」）：DPR 上限从 2 降到 1.5。
       手机屏 DPR 常为 3，取 2 已等于 4× 像素量，弱 GPU 机型直接被拖到 15fps；
       1.5 倍在手机上几乎看不出差别，填充率却降到原来的 56%。 */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    /* 项目自带的是旧版 three（无 outputColorSpace）：必须显式声明 sRGB 输出，
       否则 sRGB 贴图被解码成线性却不再编码 → 整个画面被压暗一档 */
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    else if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    var gl = renderer.getContext();
    var maxTex = (gl && gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
    var P = maxTex >= 6144 ? 128 : 96;               // 每格像素（保证 40*P 不超上限）

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(TUN_BG);
    /* blur 越大 → 衰减越慢（看得越远）。远端雾化成墙色，"隧道尽头"是虚空 */
    scene.fog = new THREE.Fog(TUN_BG, 1.5, 22 + 16 * TUN_CFG.blur);

    var camera = new THREE.PerspectiveCamera(TUN_CFG.fov, 1, 0.1, 400);
    camera.position.set(0, 0, 0);

    /* 走廊横截面：横屏 5 宽 × 3 高，竖屏 [3 宽 × 5 高]（原地转 90°，见上方竖屏开关）。
       ⚠️ 下面所有派生量（半宽/半高、两张贴图的画布尺寸、两个 PlaneGeometry、
          格矩阵长度、射线拾取的 cols/rows）都从 NW/NH 推出来 —— 换向时不需要别处再改。 */
    var _L = tunLanes();
    var NW = _L.w;                 // 走廊宽（格）：横屏 5 / 竖屏 3
    var NH = _L.h;                 // 走廊高（格）：横屏 3 / 竖屏 5
    var HW = NW * TUN_CELL / 2;    // 半宽
    var HV = NH * TUN_CELL / 2;    // 半高

    var cFloor = document.createElement('canvas');
    var cWall = document.createElement('canvas');
    /* 每面各持一份 Texture：Texture 对象才是"共享画布 + 独立 offset"的单位。
       四面共用两份画布（省显存），但给天花板/右墙各加半圈偏移 →
       同一时刻上下、左右不会出现同一张图的镜像对称（否则墙上会左右各站一个相同的 logo）。 */
    var tFloor = new THREE.CanvasTexture(cFloor);
    var tCeil = new THREE.CanvasTexture(cFloor);
    var tWallL = new THREE.CanvasTexture(cWall);
    var tWallR = new THREE.CanvasTexture(cWall);
    var maxAniso = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ? renderer.capabilities.getMaxAnisotropy() : 1;
    [tFloor, tCeil, tWallL, tWallR].forEach(function (t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      /* 走廊四面都是极掠射角，没有各向异性过滤 → 远端会糊成一片、网格线直接消失 */
      t.anisotropy = maxAniso;
      if ('colorSpace' in t && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      else if ('encoding' in t && THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
    });
    /* 让世界空间里的格子 = 1×1（正方形）：repeat = 平面尺寸 / (贴图格数 × 格尺寸) */
    tFloor.repeat.set(1, TUN_LEN / (TUN_LOOP * TUN_CELL));   // 横向 1、纵向 5
    tCeil.repeat.copy(tFloor.repeat);
    tWallL.repeat.set(TUN_LEN / (TUN_LOOP * TUN_CELL), 1);   // 横向 5、纵向 1
    tWallR.repeat.copy(tWallL.repeat);

    /* 逐格记录"这格是不是照片、是哪一张"（射线拾取时反查用）。
       ⚠️ 必须在两次 paintGrid 之前建好，照片重绘时用【同一个数组】原地覆盖。 */
    var cellsFloor = new Int16Array(NW * TUN_LOOP); cellsFloor.fill(-1);
    var cellsWall = new Int16Array(TUN_LOOP * NH); cellsWall.fill(-1);

    /* 先画一张"没有照片"的底（黑色走廊 + 网格线），照片载入后再重画 */
    paintGrid(cFloor, NW, TUN_LOOP, P, [], mulberry32(TUN_CFG.seed + 1));
    paintGrid(cWall, TUN_LOOP, NH, P, [], mulberry32(TUN_CFG.seed + 2));

    function mkMat(map) {
      return new THREE.MeshBasicMaterial({ map: map, fog: true, side: THREE.DoubleSide });
    }
    var gFloor = new THREE.PlaneGeometry(NW * TUN_CELL, TUN_LEN);
    var gWall = new THREE.PlaneGeometry(TUN_LEN, NH * TUN_CELL);

    /* 地板：rotX(-90°) → 局部 +v 映射到世界 -z（越远），所以 offset.y 直接沿隧道推进 */
    var floor = new THREE.Mesh(gFloor, mkMat(tFloor));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -HV, TUN_Z);
    scene.add(floor);

    /* 天花板：必须用【和地板同一个旋转】，UV 方向才一致，才能共用画布同步滚动
       （这样从下方看到的是背面，DoubleSide 渲染；靠半圈 offset 错开内容） */
    var ceil = new THREE.Mesh(gFloor, mkMat(tCeil));
    ceil.rotation.x = -Math.PI / 2;
    ceil.position.set(0, HV, TUN_Z);
    scene.add(ceil);

    /* 左右墙：同为 rotY(+90°) → 局部 +u 映射到世界 -z，共用画布，offset.x 沿隧道推进 */
    var wallL = new THREE.Mesh(gWall, mkMat(tWallL));
    wallL.rotation.y = Math.PI / 2;
    wallL.position.set(-HW, 0, TUN_Z);
    scene.add(wallL);

    var wallR = new THREE.Mesh(gWall, mkMat(tWallR));
    wallR.rotation.y = Math.PI / 2;
    wallR.position.set(HW, 0, TUN_Z);
    scene.add(wallR);

    /* --- 载入作品图，全部就绪后重画网格 --- */
    var imgs = [], loaded = 0;
    function onOne() {
      if (++loaded < IMGS.length) return;
      paintGrid(cFloor, NW, TUN_LOOP, P, imgs, mulberry32(TUN_CFG.seed + 1), cellsFloor);
      paintGrid(cWall, TUN_LOOP, NH, P, imgs, mulberry32(TUN_CFG.seed + 2), cellsWall);
      tFloor.needsUpdate = tCeil.needsUpdate = tWallL.needsUpdate = tWallR.needsUpdate = true;
    }
    for (var i = 0; i < IMGS.length; i++) {
      var im = new Image();
      im.onload = onOne;
      im.onerror = onOne;          // 有一张挂了也不卡住
      im.src = IMGS[i];
      imgs.push(im);
    }

    tunnel.renderer = renderer;
    tunnel.scene = scene;
    tunnel.camera = camera;
    tunnel.tFloor = tFloor;
    tunnel.tCeil = tCeil;
    tunnel.tWallL = tWallL;
    tunnel.tWallR = tWallR;

    /* --- 点击拾取登记表：每个面 ↔ 它的贴图 + 格矩阵 ---
       地板/天花板共用一张画布（格矩阵同源），左右墙共用另一张。
       ⚠️ cells 数组是【引用】，照片重绘时原地覆盖 → 这里无需再同步。 */
    var pickables = [
      { face: 'floor', mesh: floor, tex: tFloor, canvas: cFloor, cellPx: P, cells: cellsFloor, cols: NW,       rows: TUN_LOOP },
      { face: 'ceil',  mesh: ceil,  tex: tCeil,  canvas: cFloor, cellPx: P, cells: cellsFloor, cols: NW,       rows: TUN_LOOP },
      { face: 'wallL', mesh: wallL, tex: tWallL, canvas: cWall,  cellPx: P, cells: cellsWall,  cols: TUN_LOOP, rows: NH },
      { face: 'wallR', mesh: wallR, tex: tWallR, canvas: cWall,  cellPx: P, cells: cellsWall,  cols: TUN_LOOP, rows: NH }
    ];
    var pickMeshes = [floor, ceil, wallL, wallR];
    pickables.forEach(function (pk) { pk.mesh.userData.pick = pk; });
    tunnel.pickables = pickables;
    tunnel.pickMeshes = pickMeshes;

    tunnel.ready = true;

    function resizeTunnel() {
      /* ⚠️ 别退到 window.inner*（移动端是 layout viewport，会把相机纵横比算歪） */
      var w = canvas.clientWidth || document.documentElement.clientWidth;
      var h = canvas.clientHeight || document.documentElement.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      /* 转向了（竖屏↔横屏）→ 横截面格数也得跟着转，整条隧道重建一次。
         放在 resize 末尾：initTunnel 会自己再 resizeTunnel 一遍，
         而且重建后 tunnel.portrait 已是新值 → 不会来回反复。 */
      if (tunnel.ready && tunnel.portrait !== tunIsPortrait()) initTunnel();
    }
    resizeTunnel();
    tunnel._onResize = resizeTunnel;
    window.addEventListener('resize', resizeTunnel);
    tunnel.resize = resizeTunnel;
    /* 重建时 canvas 是新的，上面一个监听都没有 → 重挂（正常加载不会走到这里） */
    if (swapped) bindTunnelCanvas();
  }

  /* 指针视差（look 参数） */
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  /* 视差阻尼：B 段（黑点撑开成通道）必须把视差压到 10% ——
     走廊会随指针偏移，圆心＝灭点这个前提才守得住，通道才像"从那个点长出来"的。
     C 段恢复 1，保留原有手感。由主循环每帧写入。 */
  var tunnelLookDamp = 1;
  /* B 段那个"点"的交接半径（px）。它必须【等于句号字形的半径】——圆窗长到这么大时
     正好盖住句号，两者尺寸重合，交班看不出换手。
     实测：视口 1440×900 下句号字形直径 22px → 半径 11px（字号随 clamp 变，这个值在
     1440 基准下成立；窄屏字号小、圆窗会略大一点点，肉眼看不出）。 */
  var TUN_DOT_R = 11;
  var TUN_DOT_D = TUN_DOT_R * 2;   // 同上的直径：22px

  /* --- C 段前进速度（2026-10-13 用户："滚轮一滚动在隧道里太快了，看不清任何东西"） ---
     travel 的单位是「格」，走廊宽 5 格。
     ⚠️ 旧值 180 格跑完 C 段 ≈ 1.34 格/vh —— 滚 3.7vh 就穿过一整个走廊宽，
        滚轮点一下直接飞过去半条隧道，任何一张图都不可能看清。
     现在 62：约 10vh（≈ 一次滚轮）走一个走廊宽，是原来的 34%。
     巡航（不碰滚轮时自己往前飘）：滚动速度降了 66%，当时把巡航也一起降到 0.42 ——
     ⚠️ 但巡航和滚动不是一回事：滚动降速是为了"看清"，而巡航太快并不会看不清（手一碰滚轮
        它就归滚动那套速度了）。所以 0.42 降过头了，静止时几乎察觉不到画面在动、像卡住了。
     2026-10-13 用户要"比现在快、取之前的中间值" → 1.1 与 0.42 取中 = 0.76 格/秒
        （穿过一个走廊宽 5 格 = 6.6 秒；旧 0.42 要 11.9 秒、最早 1.1 是 4.5 秒）。 */
  var TRAVEL_ROLL = 62;       // 滚动全程（C 段）前进的格数
  var TRAVEL_CRUISE = 0.76;   // 静止时的巡航速度（格/秒）
  /* 阻尼：不直接吃滚动值，而是让 travelSmooth 慢慢追上去 ——
     滚轮是"一格一格跳"的，直接吃会让画面一顿一顿。 */
  var TRAVEL_EASE = 0.085;
  /* ?tspeed=1 一键恢复旧速度，对照用 */
  if (/[?&]tspeed=1/.test(location.search)) { TRAVEL_ROLL = 180; TRAVEL_CRUISE = 1.1; }
  /* ?cruise=<数字> 直接指定巡航速度，方便当场微调（例 ?cruise=1.2 更飘、?cruise=0.4 更沉） */
  var mCruise = /[?&]cruise=([0-9]*\.?[0-9]+)/.exec(location.search);
  if (mCruise) TRAVEL_CRUISE = parseFloat(mCruise[1]);

  /* 窗口形状开关：?win=circle 切回旧的圆窗版本，方便滚着直接对照。 */
  var WIN_CIRCLE = /[?&]win=circle/.test(location.search);

  /* clip-path 的 inset(... round ...) 在老 Safari 上不一定有圆角参数实现，
     先探测再决定走哪条路 —— 不赌。两条路算出的是同一个形状。 */
  var CAN_INSET_ROUND = (function () {
    try { return CSS.supports('clip-path', 'inset(1px round 1px)'); }
    catch (e) { return false; }
  })();

  /* 居中的圆角矩形裁剪串。vw/vh = 视口，w/h = 窗口尺寸，r = 圆角半径。
     窗口比视口大时自动退化成"铺满"（负缩进取 0）。 */
  function rectClip(vw, vh, w, h, r) {
    var dx = Math.max(0, (vw - w) / 2);
    var dy = Math.max(0, (vh - h) / 2);
    if (CAN_INSET_ROUND) {
      /* inset 两值语法：第 1 个是上下、第 2 个是左右 */
      return 'inset(' + dy.toFixed(2) + 'px ' + dx.toFixed(2) + 'px round ' + r.toFixed(2) + 'px)';
    }
    /* 兜底：path() 用绝对像素（Safari 13.1+）。R=0 时 A 命令按规范退化为直线段。 */
    var x0 = dx, y0 = dy, x1 = dx + w, y1 = dy + h;
    var R = Math.max(0, Math.min(r, w / 2, h / 2));
    var A = 'A' + R.toFixed(2) + ' ' + R.toFixed(2) + ' 0 0 1 ';
    return 'path("M' + (x0 + R).toFixed(2) + ' ' + y0.toFixed(2)
         + 'H' + (x1 - R).toFixed(2) + A + x1.toFixed(2) + ' ' + (y0 + R).toFixed(2)
         + 'V' + (y1 - R).toFixed(2) + A + (x1 - R).toFixed(2) + ' ' + y1.toFixed(2)
         + 'H' + (x0 + R).toFixed(2) + A + x0.toFixed(2) + ' ' + (y1 - R).toFixed(2)
         + 'V' + (y0 + R).toFixed(2) + A + (x0 + R).toFixed(2) + ' ' + y0.toFixed(2)
         + 'Z")';
  }

  function setClip(str) {
    segTunnel.style.clipPath = str;
    segTunnel.style.webkitClipPath = str;
  }

  /* ---------- 视口基准 ----------------------------------------------------
     ⚠️⚠️ 移动端最大的一个坑，务必用这两个函数、不要直接读 window.inner*：
     `window.innerWidth/innerHeight` 在移动端给的是 **layout viewport**。
     只要页面存在任何横向溢出，Chrome / iOS 会把 layout viewport 整体撑大、
     再等比缩放到屏幕上 —— 实测手机上 innerWidth=473 / innerHeight=1024，
     而元素真实尺寸只有 390×844（= 100vh / visualViewport）。
     拿它算 inset 的像素值会直接冲出元素边界：
       p=0.30 时 dy=(1024−39)/2=492.5、dx=(473−39)/2=217，
       加起来高 985 > 844、宽 434 > 390 —— 窗口被裁成**负尺寸、完全不可见**，
       B 段"黑点长大成通道"在手机上整个消失（只剩 A 段那个正在淡出的句号）。
     一律以 #segTunnel 的实际尺寸为准：它是 inset:0 撑满 sticky 容器的，
     既是 100vh 的真实值，也是 clip-path 的参照盒 → 与 inset 天生同基准。 */
  function vpW() {
    var e = segTunnel;
    return (e && e.clientWidth) || document.documentElement.clientWidth || window.innerWidth;
  }
  function vpH() {
    var e = segTunnel;
    return (e && e.clientHeight) || document.documentElement.clientHeight || window.innerHeight;
  }

  window.addEventListener('pointermove', function (e) {
    /* 用 vpW/vpH 而不是 window.inner*：移动端 inner* 是 layout viewport，
       手机上会被横向溢出撑到 1.21 倍 —— 视差归一化会缩到 65%，手感变钝。 */
    pointer.tx = (e.clientX / vpW() - 0.5) * 2;
    pointer.ty = (e.clientY / vpH() - 0.5) * 2;
  }, { passive: true });

  /* 阻尼后的前进位置（格）。null = 还没初始化，第一帧直接归位、不要从 0 滑过去。 */
  var travelSmooth = null;
  /* 冻结：打开大图期间隧道一动不动 —— ①退出时照片能精确飞回它原来那个格子；
     ②滚轮不再把身后的隧道推走，用户可以安心看图。 */
  var tunFrozen = false;
  var frzTravel = 0, frzPx = 0, frzPy = 0, frzP = 0;
  /* 打开大图期间也要冻住【时间推进】（2026-10-15 用户：「点击后退回去再进隧道这个过渡不很自然，
     隧道会快速进一段」）：tSec 原来一直累计 —— 浮层开 30 秒，解冻瞬间 target 就多了
     30 × TRAVEL_CRUISE(0.76) ≈ 23 格，隧道会当场猛冲一段。
     做法：记下冻结时刻，解冻时把这段时长补给 offset，tSec 从冻结时的值无缝续上。 */
  var tFrozenAt = -1, tOffset = 0;

  function freezeTunnel() {
    if (tunFrozen) return;
    frzTravel = (travelSmooth === null) ? 0 : travelSmooth;
    frzPx = pointer.x; frzPy = pointer.y;
    /* 连滚动进度一起冻住。锁滚动用的是 html{overflow:hidden}，
       而某些浏览器在那一刻会把 scrollTop 归零 —— p 一旦跳回 0，
       背后的窗口（clip）会当场缩回一个小圆。冻住 p 就万无一失。 */
    frzP = p;
    tunFrozen = true;
    if (tFrozenAt < 0) tFrozenAt = performance.now();
  }
  function thawTunnel() {
    if (tFrozenAt > 0) { tOffset += (performance.now() - tFrozenAt) / 1000; tFrozenAt = -1; }
    tunFrozen = false;
  }

  function renderTunnel(pp, tSec) {
    if (!tunnel.ready) return;

    /* 前进距离（单位=格）：滚动推进 + 恒定巡航。
       ⚠️ 不吃 pp 的瞬时值，而是让 travelSmooth 阻尼追上去 ——
          滚轮一格是"跳"的，直接吃会让隧道一顿一顿。冻结时连视差一起冻住。 */
    if (tunFrozen) {
      travelSmooth = frzTravel;
      pointer.x = frzPx; pointer.y = frzPy;
    } else {
      var target = pp * TRAVEL_ROLL + tSec * TRAVEL_CRUISE;
      if (travelSmooth === null) travelSmooth = target;
      travelSmooth += (target - travelSmooth) * TRAVEL_EASE;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
    }

    /* offset 的单位是"整张贴图"：一张贴图 = TUN_LOOP 格 = TUN_LOOP 个世界单位 */
    var k = travelSmooth / (TUN_LOOP * TUN_CELL);
    var HALF = 0.5;                 // 半圈 = TUN_LOOP/2 格，整格对齐 → 网格线仍然连续
    tunnel.tFloor.offset.y = k;
    tunnel.tCeil.offset.y = k + HALF;
    tunnel.tWallL.offset.x = k;
    tunnel.tWallR.offset.x = k + HALF;

    /* look：视点位移 + 视向偏移，一起朝指针偏（整体乘 tunnelLookDamp，见变量处的说明） */
    var lk = TUN_CFG.look * tunnelLookDamp;
    tunnel.camera.position.x = pointer.x * 0.9 * lk;
    tunnel.camera.position.y = -pointer.y * 0.7 * lk;
    tunnel.camera.lookAt(pointer.x * 0.7 * tunnelLookDamp, pointer.y * 0.5 * tunnelLookDamp, -12);

    tunnel.renderer.render(tunnel.scene, tunnel.camera);
  }

  initTunnel();

  /* ============================================================
     4.1 悬停浮现 + 点开某张照片 → 飞到正面看大图
         官方 props 的 focusOnClick 是让照片在 3D 里飞到镜头前；
         但走廊里的照片是斜的、退进雾里、还被 cover 裁过，放大了也看不清作品本身。
         所以"看大图"这件事仍然交给 DOM 层 —— 目的是"看清作品"，不是"看动效"。
         ⚠️ 2026-10-13 用户反馈：原来的开关太生硬（照片凭空跳出来 / 点开就没了）。
            改成：悬停时墙上那一块亮起来 → 点击后照片【从墙上飞出来】到正面、
            退出时【沿原路飞回去】，中间先冻住隧道，所以飞回去的位置一丝不差。
     ============================================================ */
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbName = document.getElementById('lbName');
  var lbIdx = document.getElementById('lbIdx');
  var lbFly = document.getElementById('lbFly');
  var lbFlyImg = document.getElementById('lbFlyImg');
  var lbOpen = false;
  var segTunnelOpacity = 0;   // 由主循环每帧写入；A 段时 canvas 也在 DOM 里，靠它挡掉误点

  var tunHov = document.getElementById('tunHov');
  var tunHovImg = document.getElementById('tunHovImg');
  var tunTip = document.getElementById('tunTip');
  var hovKey = '';            // 当前悬停的格（face:cx:cy），'' = 没悬停
  var hovCell = null;
  var lbQuad = null;          // 打开时冻住的那份四边形；退出时飞回它

  var FLY_MS = 620;
  var FLY_EASE = 'cubic-bezier(.22,.72,.16,1)';
  var flyTimer = 0;
  var flyReady = false;        // flyIn 的"图片就绪"闸门（见 flyIn 开头的说明）

  function canPick() { return segTunnelOpacity >= 0.6 && !lbOpen; }

  /* ---------- 从"格"反算它在屏幕上的四边形 ----------
     墙面照片不是独立物体，是画进共享贴图里的一个格子，拿不到自己的 transform，
     所以只能走 UV 反解：格 → 贴图 UV → 几何 UV → 平面局部坐标 → 世界 → 屏幕。
     这套公式必须与 pickCell 逐项对偶（同一组 repeat/offset），否则框会错位。 */
  var _v3 = new THREE.Vector3();

  function cellQuad(c) {
    var pk = c.pk, t = pk.tex, cols = pk.cols, rows = pk.rows;
    var tu = c.uv.x * t.repeat.x + t.offset.x;
    var tv = c.uv.y * t.repeat.y + t.offset.y;
    /* 贴图是无限重复的：同一列号 cx 在隧道里会出现 repeat.x 次以上。
       只用 frac 反解会解回到别的墙面上去，所以取【包含命中点】的那一圈重复 n。 */
    var nu = Math.round(tu - (c.cx + 0.5) / cols);
    var nv = Math.round(tv - (1 - (c.cy + 0.5) / rows));
    var tu0 = nu + c.cx / cols,           tu1 = nu + (c.cx + 1) / cols;
    /* v 方向有 flipY（CanvasTexture 默认），格 cy 对应的是 tv 的小数部分从大到小 */
    var tv0 = nv + 1 - (c.cy + 1) / rows, tv1 = nv + 1 - c.cy / rows;
    /* 贴图 UV → 几何 UV（pickCell 里那一步的逆运算） */
    var u0 = (tu0 - t.offset.x) / t.repeat.x, u1 = (tu1 - t.offset.x) / t.repeat.x;
    var v0 = (tv0 - t.offset.y) / t.repeat.y, v1 = (tv1 - t.offset.y) / t.repeat.y;

    var g = pk.mesh.geometry.parameters;
    var cv = tunnel.renderer.domElement.getBoundingClientRect();
    /* 四角按【图片自身的左上 → 右上 → 右下 → 左下】输出，
       与 .tun__hov / .lb__fly 那四个 CSS 角一一对应。
       ⚠️ 不要按屏幕位置重新排序！贴图上的像素出现在屏幕哪个位置，是渲染管线算好的；
          按 UV 拓扑对应过去，得到的画面与 Three 渲染出来的那一格逐像素一致，
          完全不依赖四边形的手性（墙面从正面/背面看手性相反，排序法会翻车）。
       ⚠️ PlaneGeometry 的映射是 localX=(u-0.5)*w、localY=(v-0.5)*h（见 buildPlane）——
          上一版把 x 写成了 (0.5-u)*w，整个四边形被镜像到屏幕另一侧去了。 */
    var uvq = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    var out = [];
    for (var q = 0; q < 4; q++) {
      _v3.set((uvq[q][0] - 0.5) * g.width, (uvq[q][1] - 0.5) * g.height, 0)
         .applyMatrix4(pk.mesh.matrixWorld)
         .project(tunnel.camera);
      out.push([(_v3.x * 0.5 + 0.5) * cv.width + cv.left,
                (-_v3.y * 0.5 + 0.5) * cv.height + cv.top]);
    }
    return out;
  }

  /* 8×8 高斯消元（带部分主元）。解不出来返回 null。 */
  function solve8(A, b) {
    var n = 8, i, j, k;
    for (i = 0; i < n; i++) A[i] = A[i].concat([b[i]]);
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j;
      if (Math.abs(A[piv][i]) < 1e-9) return null;
      var tmp = A[i]; A[i] = A[piv]; A[piv] = tmp;
      for (j = i + 1; j < n; j++) {
        var f = A[j][i] / A[i][i];
        if (!f) continue;
        for (k = i; k <= n; k++) A[j][k] -= f * A[i][k];
      }
    }
    var x = [];
    for (i = n - 1; i >= 0; i--) {
      var s = A[i][n];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  /* 求把 4 个源点映到 4 个目标点的单应矩阵，返回可直接用的 CSS matrix3d（列主序）。 */
  function quadMatrix(from, to) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var x = from[i][0], y = from[i][1], X = to[i][0], Y = to[i][1];
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    var h = solve8(A, b);
    if (!h) return null;
    return 'matrix3d(' + [
      h[0], h[3], 0, h[6],
      h[1], h[4], 0, h[7],
      0, 0, 1, 0,
      h[2], h[5], 0, 1
    ].join(',') + ')';
  }

  /* 四边形外接框的"等效边长"。格子本身是正方形，所以取宽高均值当边长最稳。 */
  function sideOf(q) {
    var xs = [q[0][0], q[1][0], q[2][0], q[3][0]];
    var ys = [q[0][1], q[1][1], q[2][1], q[3][1]];
    return ((Math.max.apply(null, xs) - Math.min.apply(null, xs))
          + (Math.max.apply(null, ys) - Math.min.apply(null, ys))) / 2;
  }

  /* ---------- 悬停浮现 ----------
     cellQuad 给的是【屏幕坐标】，而悬停层活在 .tun__hbox 的局部坐标系里
     （它是 absolute，原点在 segTunnel 左上角）。平时两者重合，
     页面滚过 s4、sticky 松开时就不是了 —— 所以统一减掉画布的原点。 */
  var hovOX = 0, hovOY = 0;

  function updateHover() {
    if (!hovCell) return;
    var qq = cellQuad(hovCell);
    if (!qq) return;
    var S = sideOf(qq);
    if (!(S > 1)) return;
    var m = quadMatrix([[0, 0], [S, 0], [S, S], [0, S]], qq);
    if (!m) return;
    var cvr = tunnel.renderer.domElement.getBoundingClientRect();
    hovOX = cvr.left; hovOY = cvr.top;
    tunHov.style.width = S.toFixed(2) + 'px';
    tunHov.style.height = S.toFixed(2) + 'px';
    tunHov.style.transform = 'translate(' + (-hovOX).toFixed(2) + 'px,'
                           + (-hovOY).toFixed(2) + 'px) ' + m;
  }
  function hoverOn(idx, cell) {
    var key = cell.pk.face + ':' + cell.cx + ':' + cell.cy;
    if (key !== hovKey) {
      hovKey = key;
      tunHovImg.src = IMGS[idx];
    }
    hovCell = cell;
    updateHover();
    tunHov.classList.add('on');
    tunTip.classList.add('on');
  }
  function hoverOff() {
    if (!hovKey) return;
    hovKey = ''; hovCell = null;
    tunHov.classList.remove('on');
    tunTip.classList.remove('on');
  }

  /* ---------- 滚动锁：打开大图期间页面不许动 ---------- */
  var savedY = 0, savedPR = '';
  function lockScroll() {
    savedY = window.pageYOffset || document.documentElement.scrollTop || 0;
    /* ⚠️ 必须补上滚动条那点宽度：overflow:hidden 会让滚动条消失、视口突然变宽 ~15px，
        画面会当场"抻"一下。补 padding 之后布局宽度不变，看不出接管。
       ⚠️ 但这个差值只在桌面可信 —— 移动端 innerWidth 是 layout viewport，
        有横向溢出时手机上是 473−390=83px 的**假数**，补上去页面会横向缩掉一大块。
        真机移动端滚动条是覆盖式的（宽 0）。所以给个上限收口：超过 24px 一律当假象。 */
    var sw = window.innerWidth - document.documentElement.clientWidth;
    if (!(sw > 0) || sw > 24) sw = 0;
    savedPR = document.documentElement.style.paddingRight;
    if (sw > 0) document.documentElement.style.paddingRight = sw + 'px';
    document.documentElement.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.documentElement.style.overflow = '';
    document.documentElement.style.paddingRight = savedPR;
    window.scrollTo(0, savedY);
  }

  /* ---------- 开 / 关 ---------- */
  function openLightbox(index, cell) {
    if (index < 0 || index >= IMGS.length) return;
    var pad = function (n) { return ('0' + n).slice(-2); };
    lbImg.src = IMGS[index];
    lbImg.alt = CAPS[index] || '';
    lbFlyImg.src = IMGS[index];
    lbFlyImg.alt = CAPS[index] || '';
    lbName.textContent = CAPS[index] || '';
    lbIdx.textContent = pad(index + 1) + ' / ' + pad(IMGS.length);

    hoverOff();
    /* ① 先冻住隧道：退出时能飞回原位，靠的就是这一步。
       ② 锁住页面滚动，否则背后的窗口（clip）会跟着滚轮变。 */
    freezeTunnel();
    lockScroll();
    lbQuad = cell ? cellQuad(cell) : null;

    lbImg.classList.remove('shown');
    lb.classList.add('on');
    lb.setAttribute('aria-hidden', 'false');
    lbOpen = true;
    document.body.classList.add('lb-open');

    if (lbQuad) flyIn();
    else { lbFly.classList.remove('on'); lbFly.style.opacity = '0'; lbImg.classList.add('shown'); }
  }

  function flyIn() {
    /* ⚠️ 先等【飞行图】（lbFlyImg）真正就绪再飞（2026-10-16 用户：「点开始后闪一下」）——
       否则飞出来的是 .lb__fly 的 #0d0d0d 深灰方块，图片 decode 完的瞬间"啪"地贴上去 = 闪。
       ⚠️ 原注释"隧道里已经加载过同一张"是错的：隧道用的是 canvas 纹理（paintGrid 画进去的），
          不会给 <img> 元素提供缓存 —— 这里一定是首次加载（好在同 URL 已在 HTTP 缓存里，很快）。
       400ms 兜底：图加载失败也要让用户进得去（显示灰底而不是卡住）。 */
    if (!flyReady) {
      var go = function () { if (flyReady) return; flyReady = true; flyIn(); };
      if (lbFlyImg.complete && lbFlyImg.naturalWidth > 0) { go(); return; }
      lbFlyImg.addEventListener('load', go);
      lbFlyImg.addEventListener('error', go);
      setTimeout(go, 400);
      return;
    }
    flyReady = false;                      // 一次飞行只用一次就绪检查
    var r = lbImg.getBoundingClientRect();
    /* 图还没就绪（几乎不会：隧道里已经加载过同一张）→ 等一次 load 再飞，别飞到一个 0×0 的框上 */
    if ((r.width < 4 || r.height < 4) && !lbImg.complete) {
      lbImg.addEventListener('load', function once() {
        lbImg.removeEventListener('load', once);
        flyIn();
      });
      return;
    }
    if (r.width < 4 || r.height < 4) { lbImg.classList.add('shown'); return; }

    var S = sideOf(lbQuad);
    /* 起点：站到墙上那个格子上。正方形尺寸 + 单应矩阵 → 与墙面那一块逐像素重合。 */
    lbFly.style.transition = 'none';
    lbFly.style.width = S.toFixed(2) + 'px';
    lbFly.style.height = S.toFixed(2) + 'px';
    lbFly.style.transform = quadMatrix([[0, 0], [S, 0], [S, S], [0, S]], lbQuad);
    lbFly.classList.add('on');
    lbFly.style.opacity = '1';
    void lbFly.offsetWidth;      // 强制落一次盘，否则下面改 transition 会连起点一起跳过

    /* 终点：尺寸 = 大图的真实显示尺寸，平移到它的位置。
       ⚠️ width/height 也参与过渡是有意的：容器比例从"正方形"渐变成"图片比例"，
          cover 的裁切量随之降到 0 —— 照片是【展开】出全貌，不是"换了一张图"。 */
    lbFly.style.transition = 'transform ' + FLY_MS + 'ms ' + FLY_EASE
                           + ',width ' + FLY_MS + 'ms ' + FLY_EASE
                           + ',height ' + FLY_MS + 'ms ' + FLY_EASE;
    lbFly.style.width = r.width.toFixed(2) + 'px';
    lbFly.style.height = r.height.toFixed(2) + 'px';
    lbFly.style.transform = 'translate(' + r.left.toFixed(2) + 'px,' + r.top.toFixed(2) + 'px)';

    clearTimeout(flyTimer);
    flyTimer = setTimeout(function () {
      /* ⚠️ 交接必须【瞬间】（2026-10-16 第三轮排查，MutationObserver 实测定案）：
         .lb__img 自带 0.16s 的 opacity 渐显，若它渐显、lbFly 同时立即消失，
         这 0.16s 里照片会"先变淡、再变实" —— 就是肉眼看到的"闪一下"。
         做法：临时关掉过渡 → add('shown') → 强制落盘 → 恢复过渡（0.16s 只留给别的场合用）。 */
      lbImg.style.transition = 'none';
      lbImg.classList.add('shown');
      void lbImg.offsetWidth;
      lbImg.style.transition = '';
      lbFly.classList.remove('on');
      lbFly.style.opacity = '0';
    }, FLY_MS - 80);
  }

  function closeLightbox() {
    if (!lbOpen) return;
    if (!lbQuad) { finishClose(); return; }
    /* 退出：从大图位置沿原路飞回墙上那一格。
       隧道是冻住的，所以"原来那一格"和打开时一模一样。
       ⚠️ 2026-10-15 修「退出时闪一下」：顺序必须是
          【先把飞行图在图的位置摆好并显示】→【再隐藏正面大图】。
       原先反着来（先 remove('shown')），中间会空出一帧 —— 大图没了、飞行图还没出现 = 闪。 */
    var r = lbImg.getBoundingClientRect();
    var S = sideOf(lbQuad);
    lbFly.style.transition = 'none';
    lbFly.style.width = r.width.toFixed(2) + 'px';
    lbFly.style.height = r.height.toFixed(2) + 'px';
    lbFly.style.transform = 'translate(' + r.left.toFixed(2) + 'px,' + r.top.toFixed(2) + 'px)';
    lbFly.classList.add('on');
    lbFly.style.opacity = '1';
    void lbFly.offsetWidth;      // 强制落盘：此时飞行图已与原大图完全重合，下面才敢隐藏大图
    /* ⚠️ 大图必须【瞬间】隐藏（2026-10-16 用户：「进后退出再闪一下」）——
       .lb__img 自带 0.16s 的 opacity 渐隐，而飞行图是瞬间就位的：
       直接 remove('shown') 会让两张图叠加错位整整 0.16 秒（且两者不完全重合）= 闪。 */
    lbImg.style.transition = 'none';
    lbImg.classList.remove('shown');
    void lbImg.offsetWidth;
    lbImg.style.transition = '';

    lbFly.style.transition = 'transform ' + FLY_MS + 'ms ' + FLY_EASE
                           + ',width ' + FLY_MS + 'ms ' + FLY_EASE
                           + ',height ' + FLY_MS + 'ms ' + FLY_EASE;
    lbFly.style.width = S.toFixed(2) + 'px';
    lbFly.style.height = S.toFixed(2) + 'px';
    lbFly.style.transform = quadMatrix([[0, 0], [S, 0], [S, S], [0, S]], lbQuad);
    /* 文字条先撤（照片已经在半路了，标题不该还留着） */
    lb.classList.remove('on');

    clearTimeout(flyTimer);
    flyTimer = setTimeout(finishClose, FLY_MS - 80);
  }

  function finishClose() {
    lb.classList.remove('on');
    lb.setAttribute('aria-hidden', 'true');
    lbFly.classList.remove('on');
    lbFly.style.opacity = '0';
    lbImg.classList.remove('shown');
    lbOpen = false;
    document.body.classList.remove('lb-open');
    lbQuad = null;
    /* ⚠️ 顺序要紧（2026-10-15 修「白屏」）：必须先 unlockScroll 再 thawTunnel ——
       锁滚动期间 html{overflow:hidden} 可能让 scrollTop 归零，如果先解冻，
       主循环会在那一帧读到 p=0（A 段白底）→ 屏幕闪白；先恢复滚动位置就万无一失。 */
    unlockScroll();
    thawTunnel();
  }

  var raycaster = new THREE.Raycaster();
  var ndc = new THREE.Vector2();

  /* 屏幕坐标 → 命中的【格子】（返回 {pk, cx, cy}，没命中返回 null）。
     拆出格子这一层，是为了能单独验证"uv → 格"的映射是否正确。 */
  function pickCell(clientX, clientY) {
    if (!tunnel.ready || !tunnel.pickables) return null;
    var cv = tunnel.renderer.domElement;
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;

    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, tunnel.camera);

    var hits = raycaster.intersectObjects(tunnel.pickMeshes, false);
    if (!hits.length || !hits[0].uv) return null;

    var hit = hits[0];
    var pk = hit.object.userData.pick;
    if (!pk) return null;
    /* 几何 UV →（加当前滚动偏移）→ 贴图 UV → 落在贴图里的哪一格。
       CanvasTexture 默认 flipY=true，所以 canvas 的行号要拿 (1-v) 反算。 */
    var tu = hit.uv.x * pk.tex.repeat.x + pk.tex.offset.x;
    var tv = hit.uv.y * pk.tex.repeat.y + pk.tex.offset.y;
    var cx = Math.floor((tu - Math.floor(tu)) * pk.cols);
    var cy = Math.floor((1 - (tv - Math.floor(tv))) * pk.rows);
    cx = cx < 0 ? 0 : (cx > pk.cols - 1 ? pk.cols - 1 : cx);
    cy = cy < 0 ? 0 : (cy > pk.rows - 1 ? pk.rows - 1 : cy);
    /* uv 一并带出去：cellQuad() 要靠它确定"是哪一圈重复"（贴图是无限重复的，
       同一张图在隧道里出现好几次，只用 cx/cy 会解回到别的墙面上）。 */
    return { pk: pk, cx: cx, cy: cy, uv: hit.uv };
  }

  /* 屏幕坐标 → 命中的照片序号（没命中照片返回 -1） */
  function pickPhoto(clientX, clientY) {
    var c = pickCell(clientX, clientY);
    return c ? c.pk.cells[c.cy * c.pk.cols + c.cx] : -1;
  }

  /* ⚠️ 画布上的三个监听单独抽出来，因为它是【可重绑】的：
     转向重建会把 <canvas> 整块换成新的（旧上下文已失效，见 disposeTunnel），
     新 canvas 上没有任何监听 —— 不重绑的话转向后照片就点不开了。
     正常加载只会绑一次（模块加载时这一次）。 */
  function bindTunnelCanvas() {
    var cv = document.getElementById('tunnel');
    if (!cv) return;

    cv.addEventListener('click', function (e) {
      if (!canPick()) return;
      var c = pickCell(e.clientX, e.clientY);
      if (!c) return;
      var idx = c.pk.cells[c.cy * c.pk.cols + c.cx];
      /* 把格子一并交给 openLightbox：飞行要知道这张照片贴在墙上的哪个四边形 */
      if (idx >= 0) openLightbox(idx, c);
    });

    /* 悬停浮现：墙上那一块亮起来 + 指针旁一个词。
       ⚠️ 这里只负责"认格"，位置由主循环每帧重算 —— 隧道一直在往前跑，
          悬停框必须跟着它走，否则会看到框从照片上滑下去。 */
    cv.addEventListener('pointermove', function (e) {
      tunTip.style.transform = 'translate(' + (e.clientX + 16 - hovOX) + 'px,'
                             + (e.clientY + 18 - hovOY) + 'px)';
      if (!canPick()) { cv.style.cursor = ''; hoverOff(); return; }
      var c = pickCell(e.clientX, e.clientY);
      var idx = c ? c.pk.cells[c.cy * c.pk.cols + c.cx] : -1;
      cv.style.cursor = idx >= 0 ? 'pointer' : '';
      if (idx >= 0) hoverOn(idx, c);
      else hoverOff();
    }, { passive: true });
    cv.addEventListener('pointerleave', function () { cv.style.cursor = ''; hoverOff(); });
  }
  bindTunnelCanvas();

  (function bindLightbox() {
    document.getElementById('lbClose').addEventListener('click', closeLightbox);
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });
    /* 滚动锁之外的第二道保险：浮层内滚轮一律吞掉 */
    lb.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
  })();

  /* ============================================================
     5. 主循环
     ============================================================ */
  var t0 = performance.now();

  function tick() {
    /* - tOffset：浮层打开期间的时间补偿（见 tFrozenAt 处的说明），tSec 因此无缝续上 */
    var tSec = (performance.now() - t0) / 1000 - tOffset;
    readScroll();
    /* 打开大图期间进度也冻住（见 freezeTunnel 的说明） */
    if (tunFrozen) p = frzP;

    /* ⚡ 性能（2026-10-16 用户：「鼠标移动有延迟、滚动一顿一顿、之前没问题」）：
       Performance 实测 —— 页面【静置 3 秒】就产生 250 次样式重算 + 224 次布局，
       鼠标每移动一次主线程要花 ~56ms。根因是 s4 的动画层（文字/隧道）【不在视野时也每帧改 DOM】。
       所以先算一次"本段是否在视野"，A 段文字与 C 段隧道共用这个判断。 */
    var s4r = s4.getBoundingClientRect();
    var s4InView = s4r.bottom > -80 && s4r.top < vpH() + 80;

    /* --- A：圆柱文字（末尾那个句号也在这条链上，一路滚到正中） --- */
    var aP = clamp((p - A0) / (A1 - A0), 0, 1);
    if (s4InView) renderText(aP);            // 离屏不写那 9 行 transform（省下大量样式重算）

    /* --- B：句号 → 通道口 -------------------------------------------------
       起点是 A 段末尾停在画面正中的那个句号（22px 正圆），唯一的驱动量是"窗口的尺寸"。
       窗口中心钉在画面正中，而走廊的灭点也正好在正中（实测灭点 = 视口中心），
       于是"窗口撑开"和"走廊从灭点向外展开"是同一件事 —— 连贯性由此而来。

       ⚠️ 2026-10-13 重做（用户反馈"到了中心不动 / 中间缩了一下 / 要更流畅"）：
       上一版把生长拆成 tDot(0.32–0.38) + 【停顿 0.38–0.44】+ tGrow(0.44–0.61) pow2.6。
       实测的毛病有两处，都是这版设计自带的：
         ① 停顿那 6% 的滚动距离里窗口死死停在 22px —— 用户的直觉是"到中心就该长大了"，
            我原本想的是"让这是个点被看清"，但他要的是连续，这一拍纯属多余；
         ② pow(t,2.6) 前段太慢后段太炸：0.44→0.48 只从 22 长到 41px，
            而 0.56→0.60 从 597 直接蹦到 1220px，观感是"憋住然后炸开"。
       现在改成【一条曲线到底，全程没有停顿】，起点提到 0.28（大字还在退场的时候）。
       ⚠️ 曲线形状也调过一次：先试 smootherstep，结果数学上很"软"，实际却是
          0.28→0.32 这 4% 的滚动距离（= 14vh）里窗口只从 0 长到 3px —— 屏幕上就是
          "滚了半天没反应"，用户的第一句不满（"到这个位置就该变大了"）原样还在。
          根因：任何幂次 >1 的曲线在 t≈0 附近导数都是 0。
          最终用 pow(smooth(t), 0.75)：起步就有速度（滚一点就看得见在长），
          收尾仍然平（smooth' 在 1 处为 0，0.75 次幂不改这一点）。 */
    var tGrow = clamp((p - 0.28) / 0.30, 0, 1);   // 0.28–0.58：0 → 覆盖全屏，全程不停顿
    var eGrow = Math.pow(smooth(tGrow), 0.75);
    var vw = vpW(), vh = vpH();
    var dotWin;   // 窗口的「特征尺寸」（矩形取高、圆取直径）——句号退场与黑色保底都看它

    var growR;   // 0→1 的成长进度，供【标题浮现 / 点击闸门 / 底色翻黑】三条曲线共用

    if (WIN_CIRCLE) {
      /* ============ 旧版：正圆窗口（?win=circle，留作对照） ============ */
      var rFull = Math.sqrt(vw * vw + vh * vh) / 2;   // 覆盖全屏所需半径
      var tunR = eGrow * rFull;
      growR = tunR / rFull;
      dotWin = tunR * 2;
      setClip('circle(' + tunR.toFixed(2) + 'px at 50% 50%)');
    } else {
      /* ============ 新版：圆角矩形 → 直角矩形 ============ */
      /* 窗口最终长成的【宽高比】—— 必须和走廊口的横截面一致：
         横屏 5:3（横矩形）/ 竖屏 3:5（竖矩形）。同一个 tunLanes()，
         所以"竖屏把隧道竖起来"这件事在窗口和走廊上永远同步，不会各转各的。 */
      var AR = (function () { var L = tunLanes(); return L.w / L.h; })();
      /* 覆盖全屏所需的窗口【高度】。宽高比锁死 AR，所以宽或高谁先到边不一定，
         取更严的那个 —— 超宽屏（3440×1440）上 W×(1/AR) 会大于 H，就得以它为准。
         竖屏（AR=0.6）反过来：H 一定先到边，窗口是"竖着长"。 */
      var hFull = Math.max(vh, vw / AR);
      var hWin = eGrow * hFull;
      /* 形状进度改绑【尺寸】而不是【时间】，而且【推迟起步】：
         窗口长到 70px 之前保持正圆 —— 那一段是"句号在长大"，圆必须站得住；
         70px 之后才开始变方，到全屏高度的 72% 时定完形。
         ⚠️ 上一版写成 tGrow/0.60（按时间、且从 22px 就开始变），
            结果窗口刚到 98px 已经是 1.12 的圆角方块了，"圆点"这个阶段基本没看见；
            按尺寸挂、再推迟到 70px 起步之后，圆 → 圆角矩形 → 直角矩形这条链
            才真正摊开在 70→650px 上，肉眼能一段段看出来。 */
      var tForm = clamp((hWin - 70) / (hFull * 0.72 - 70), 0, 1);
      var wWin = hWin * (1 + (AR - 1) * tForm);          // 宽高比 1:1 → AR
      var radW = (hWin / 2) * (1 - tForm);               // 圆角：半短边(=正圆) → 0(=直角)
      growR = hWin / hFull;
      dotWin = hWin;
      setClip(rectClip(vw, vh, wWin, hWin, radW));
      /* 【黑色保底】窗口 90px 之前全黑（它就是那个句号），90→390px 之间淡出、之后露出隧道。
         窗口小于 90px 时它才是个"点"，必须保住纯黑 —— 否则隧道在灭点处的雾色（偏灰、发虚）
         会被看成"点缩小/变淡了"。 */
      tunVeil.style.opacity = (1 - smooth(clamp((hWin - 90) / 300, 0, 1))).toFixed(3);
    }
    /* 文字层退场改绑【窗口尺寸】而不是时间：窗口长到和句号一样大（22px）才开始淡，
       62px 时彻底消失 —— 那一刻窗口已经是句号的 3 倍，所以看不出是换了个东西。
       绑时间的话会出现"句号先没了、小点才冒出来"的空档。 */
    segText.style.opacity = (1 - clamp((dotWin - TUN_DOT_D) / 40, 0, 1)).toFixed(3);
    /* 「Passage 作品集 · 隧道」——必须等窗口大到"整块标题都落在窗口内"才浮现。
       ⚠️ 实测踩过：阈值太小时标题会被窗口边缘横向切断、还是半透明的灰字，很难看。
          这里按【窗口尺寸 / 覆盖全屏所需尺寸】给阈值 ——
          圆窗看半径比，矩形窗口顶到边的是左右两边，但决定标题横向空间的是高度，
          所以统一用高度口径，0.30 起淡入、0.58 起全显。 */
    tunMark.style.opacity = clamp((growR - 0.30) / 0.28, 0, 1).toFixed(3);

    /* --- C：隧道推进 --- */
    var cP = clamp((p - C0) / (C1 - C0), 0, 1);
    /* B 段把指针视差压到 10% —— 守住"圆心＝灭点"，通道才像从这个点长出来的；C 段恢复原手感 */
    tunnelLookDamp = 1 - (smooth(clamp((p - 0.36) / 0.10, 0, 1))
                        * (1 - smooth(clamp((p - 0.62) / 0.14, 0, 1)))) * 0.9;
    /* ⚡ 手机性能（2026-10-16）：隧道离开视野后停止渲染。
       ⚠️ 别用 p 判断 —— readScroll 里 p 被 clamp 到 0~1，「已滚过」表达不出来（第一版栽在这）。
       改用 section 自身的视口位置（s4InView 在 tick 开头算好，与 A 段文字共用）。
       浮层冻结时例外，保证背景画面不丢。 */
    if (s4InView || tunFrozen) renderTunnel(cP, tSec);
    /* 点击闸门：可见范围已由窗口的 clip 决定，所以改看"窗口张开了多大" */
    segTunnelOpacity = clamp((growR - 0.55) / 0.20, 0, 1);
    /* 悬停框每帧重算：隧道在动，它必须跟着手指下那张照片走 */
    if (hovCell && !tunFrozen) updateHover();

    /* --- 底色：白 → 黑 -----------------------------------------------------
       ⚠️ 只在窗口快要铺满时才翻，窗口铺满之前【必须保持白底】——
          "白底上有个黑洞在撑开"才是要看的画面；底色提前变黑，窗口就没有轮廓、
          整段过渡会糊成一坨。这一句纯粹是补一层防抗锯齿白边的保险。
       ⚠️ 矩形窗口【先到边的往往是横屏的宽 / 竖屏的高】（看 vh 与 vw/AR 谁更大），
          剩下那条边在最后 10~15% 的行程里才贴满 —— "一边满了、另一边还在张"
          正是走廊两侧先出画的感觉，不要提前翻黑。 */
    sticky.style.background = mixHex('#F4F4F1', '#111111', smooth(clamp((growR - 0.86) / 0.14, 0, 1)));

    /* rail 是 position:fixed —— 不这样处理它会飘在主站**所有**屏上面。
       判据用 s4 与视口是否相交（p 被 clamp 在 0~1，滚到屏4 前也是 0，判不出来）。 */
    var _rr = s4.getBoundingClientRect();
    rail.style.opacity = (_rr.top < vpH() && _rr.bottom > 0) ? '1' : '0';

    /* --- 进度点（三段：A / B / C） --- */
    var act = p < A1 ? 0 : (p < B1 ? 1 : 2);
    for (var i = 0; i < railDots.length; i++) {
      railDots[i].className = (i === act) ? 'on' : '';
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* 调试入口：?p=0.5 直接定位到某进度 */
  var qp = new URLSearchParams(location.search).get('p');
  if (qp !== null) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        var total = s4.offsetHeight - vpH();
        window.scrollTo(0, s4.offsetTop + total * parseFloat(qp));
      }, 400);
    });
  }

  /* 调试：?probe=1 输出 B 段的关键量（窗口裁剪串、隧道标题透明度）+ 圆柱各行状态 */
  var _probe = new URLSearchParams(location.search).get('probe');
  if (_probe !== null) {
    /* CDP 探针用：把实时量挂到 window。
       探针脚本不能直接读闭包里的变量，而 ?probe=1 本来就是调试通道 ——
       巡航速度这种"要按真实秒数才量得出来"的量，只能这样实时取。 */
    window.__probeTravel = function () { return travelSmooth; };
    window.__probeCruise = function () { return TRAVEL_CRUISE; };
    window.__probeT = function () { return p; };
    setTimeout(function () {
      var out = [];
      for (var i = 0; i < lines.length; i++) {
        var r = lines[i].getBoundingClientRect();
        var sc = /scale\(([\d.]+)\)/.exec(lines[i].style.transform) || [];
        out.push({
          txt: lines[i].textContent,
          cy: +(r.top + r.height / 2).toFixed(1),
          op: lines[i].style.opacity,
          sc: sc[1] === undefined ? 1 : +sc[1]
        });
      }
      /* 窗口裁剪串原样带出去，探针侧自己解析 —— rect 走 inset / path 两条路，
         不要在这里写死正则去猜形状。 */
      document.title = 'PROBE::' + JSON.stringify({
        W: vpW(), H: vpH(),
        clip: segTunnel.style.clipPath || '',
        veil: tunVeil ? tunVeil.style.opacity : null,
        textOp: segText.style.opacity,
        insetRound: CAN_INSET_ROUND,
        cruise: TRAVEL_CRUISE,
        roll: TRAVEL_ROLL,
        travel: travelSmooth === null ? null : +travelSmooth.toFixed(3),
        mark: tunMark ? tunMark.style.opacity : null,
        lines: out
      });
    }, 2500);
  }
})();
