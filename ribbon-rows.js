/* ============================================================
   ribbon-rows.js —— RibbonType 的无依赖原生复刻（Three.js）
   ------------------------------------------------------------
   来源：React Bits Pro 的 <RibbonType />（pro.reactbits.dev/docs/components/ribbon-type）
   为什么不用原组件：本站在「零构建纯静态」路线上 —— 没有 package.json / components.json /
   node_modules，也不是 React 项目，且原组件需要 REACTBITS_LICENSE_KEY（付费授权）。
   所以按官方 35 个 props 的语义逐条原生复刻，参数值逐字照搬用户给的那一版 config。

   ── 复刻的原理（三层）──
   ① 几何：一块沿 X 展开的细长平面（每 4px 一段），每帧按空间曲线重写顶点 ——
      中线走 y = A·sin(2π·freq·s)，z = (D/2)·sin(2π·freq·s + π/2)（椭圆截面的空间波），
      带面再绕「自身长轴」转 twist 角（顶点沿 (0, cos a, sin a) 方向张开）。
   ② 贴图：canvas 上画「logo 图 + 名称 + 分隔符」，整条沿 U 无限平铺；
      文字流动 = 只推 uOffset 这个 uniform（几何不动），所以是一条真的在跑的带子。
   ③ 着色：ShaderMaterial，片元里按带面朝向加缎面边缘光（sheen），
      band=true 时贴图带底色（实体缎带），band=false 时只有字在悬空扭转。

   ── 与屏3 现有交互的兼容 ──
   LogoLoop 的对外接口被保留：this.opt / set(k,v) / _dims()，
   所以调参面板里那 6 个拉杆、btnDir、btnCopy、以及 #loop1/#loop2 上的
   mouseenter（暂停自动巡播）全部零修改继续工作。

   依赖：window.THREE（assets/vendor/three.min.js）
   ============================================================ */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  /* 用户给的 exact configuration。
     ⚠️ 2026-10-13 17:20 用户看完 A/B 对照后定稿：**要 A 种 —— 不要实体缎带背景**，
        但保留「上下两条」。所以 band 回 false。
     ⚠️ 仍与用户原文有 3 处不同（autoTwist / rollMax / rollSpan），都是可读性阀门，
        用 ?exact=1 可一键还原成原文 1:1。 */
  var CONFIG = {
    /* ============================================================
       2026-10-14 用户自己在面板里调定稿的一整套（原文 JSON 固化）。
       关键形态：实体缎带（band）= 品牌绿带 + 黑字；波浪/深度/扭转全关（平直带）；
       大名字（nameScale 2.5）+ 粗体 900；速度 130；自动翻转 6.6s / 0.32 圈。
       ⚠️ 面板滑杆的 value 必须与此逐项一致（曾被"面板覆盖 CONFIG"坑过一次）。
       ============================================================ */
    colors: ['#0A0A0A', '#CCFF00'],   // [缎带色, 文字色]——品牌配色，**深色在上、绿色在下**
                                       //   （用户 2026-10-14 11:49：「绿色实体背景放在下面深的放上面」）
                                       //   → 第一行 深带绿字 / 第二行 绿带黑字
    band: true,                        // 实体缎带（用户 2026-10-14 定稿开启）
    ribbons: 2,
    gap: 28,                           // 【项间距】项与项之间（名字/分隔符之后的空间）
    iconGap: 24,                       // 【新增】图标 ↔ 文字的距离（与项间距独立；
                                       //   用户：「要不我控制项间距，文字和 LOGO 也会改动」）
    ribbonWidth: 60,
    textScale: 0.185,                  // = 面板 logoH 10 / (60 × 0.9)；面板绑定时会覆盖
    fontWeight: 900,                   // 用户调回 900（配合实带大字）
    letterSpacing: 0.03,
    amplitude: 0,                      // 无波浪（平直带）
    frequency: 0,
    depth: 0,                          // 无纵深摆动
    twist: 0,                          // 无持续扭转
    twistSpeed: 0.34,
    speed: 45,                         // 流动速度 px/s
    flow: 0.85,
    tilt: 0,                           // 面板拆成 rTilt1/rTilt2 各自控制
    perspective: 5,
    shading: 1,
    sheen: 0,
    hoverSpeed: 0.2,
    autoTwist: 13,                     // 自动翻转间隔（秒）
    path: 'wave',
    direction: 'left',
    separator: ' · ',
    quality: 1,
    scale: 0.9,
    rollMax: 0.3,                      // 自动翻转幅度（圈）
    rollSpan: 0.065,                   // 翻滚波宽度（点击波宽度也跟随它）
    twistDir: 1,                       // 【新增】翻滚波方向：1=向右跑 / -1=向左跑。
                                       //   用户：「自动播放是两边交叉的，但转波是同步一个方向的」
                                       //   → loop2 设 -1，两行交替换向滚（skills-stage.html 初始化）
    clickTwist: true,
    clickAmp: 0.3,                     // 点击翻转幅度（圈）——与自动翻转 0.32 基本一致（用户要求）
    clickSpan: 0.024,
    clickFlow: 0.55,
    nameScale: 2.5,                    // 大名字（用户定稿）
    nameAlpha: 0.95,
    iconScale: 3.6,
    showNames: true,
    hoverTint: true,
    hoverLift: 1,                      // 选中亮度（盖白强度 0~1，不受明暗压制）
    hoverTintColor: '#FFFFFF',        // 悬停高亮色（2026-10-14：两行选中都【变白】——
                                      //   图标+文字点亮、带子底色不动，见 FRAG 的底色分层）
    iconAlpha: 1
  };

  /* 用户原文的那 3 个值。`?exact=1` 用它覆盖 CONFIG，用来对着官方 demo 逐帧比对。
     ⚠️ band 现在两版都是 false —— 用户明确不要实体缎带，这一版已经不是分歧点了。 */
  var EXACT = { autoTwist: 0.5, rollMax: 1, rollSpan: 0.22 };
  if (typeof location !== 'undefined' && /[?&]exact=1/.test(location.search)) {
    for (var ex in EXACT) if (EXACT.hasOwnProperty(ex)) CONFIG[ex] = EXACT[ex];
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ------------------------------------------------------------
     贴图：把「logo 图 + 名称 + 分隔符」画成一条可无缝平铺的长条。
     用 canvas 而不是文本字符串，是因为屏3 每项还带一张 logo PNG ——
     原版 RibbonType 只吃纯文本，这里是按同一套语义做的扩展。
     ------------------------------------------------------------ */
  /* 裁掉图标 PNG 的透明边距。
     ⚠️ 为什么必须做（2026-10-13 22:5x 实测）：icons-final/ 里的 PNG 全是 208×208 带大片透明边
        （内容只占 82-87% 宽、56-85% 高，且各图标比例不同）——
        contain 算的是"PNG 完整尺寸"，结果：① 图标视觉比目标小一半；② 各图标视觉大小参差。
        裁到内容 bbox 后：**图标高 = f × iconScale**，可以直接对表屏幕像素（黑盒标定）。 */
  function trimImage(im) {
    try {
      if (!im || !im.naturalWidth) return im;
      var c = document.createElement('canvas');
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      var cx = c.getContext('2d');
      cx.drawImage(im, 0, 0);
      var d = cx.getImageData(0, 0, c.width, c.height).data;
      var x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (var y = 0; y < c.height; y++) {
        var row = y * c.width;
        for (var x = 0; x < c.width; x++) {
          if (d[(row + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < x0 + 1 || y1 < y0 + 1) return im;          // 全透明/异常 → 原样
      var t = document.createElement('canvas');
      t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
      t.getContext('2d').drawImage(im, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
      return t;                                            // drawImage 接受 canvas ✓
    } catch (e) { return im; }                             // 万一被 taint → 原样返回
  }

  function loadImages(items, done) {
    var cache = {}, pending = 0, fired = false;
    function fin() { if (!fired && pending <= 0) { fired = true; done(cache); } }
    items.forEach(function (it) {
      if (!it.icon) return;
      pending++;
      var im = new Image();
      im.onload = im.onerror = function () {
        cache[it.icon] = (im.naturalWidth ? trimImage(im) : im);
        pending--; fin();
      };
      im.src = it.icon;
    });
    fin();
    return cache;
  }

  function fontStack(root) {
    try {
      var f = getComputedStyle(root).fontFamily;
      if (f && f.trim()) return f.trim();
    } catch (e) {}
    return '"Lexend","Helvetica Neue",Arial,sans-serif';
  }

  function buildTexture(cache, items, o, root, maxTex) {
    var fam = fontStack(root);
    var probe = document.createElement('canvas').getContext('2d');
    var inner = Math.max(2, Math.round(o.gap));             // 【项间距】（面板"项间距"拉杆）
    /* 【图标↔文字】独立距离（2026-10-14 新增）：以前两者共用 o.gap，拖项间距时图标与文字
       的距离也跟着变 —— 现在拆开。纯图标模式下不生效（没有名字）。 */
    var innerIcon = Math.max(0, Math.round(o.iconGap == null ? inner : o.iconGap));

    /* 贴图里所有尺寸对 ss 都是线性的 → 先用 ss=1 量一次总宽，就能反推出
       「不撞设备 maxTextureSize」的安全超采样倍率。 */
    /* 字号规则（量 + 画必须共用，见 _paintWhenFontReady 的注释）：
         基准 f  → 图标那一格（logo 方格宽 = 1.32f）
         文字 nf → f × nameScale（用户 2026-10-13：「字太粗、喧宾夺主，图标应该是主要的」） */
    function setFont(ctx, px) {
      ctx.font = o.fontWeight + ' ' + px + 'px ' + fam;
      try { ctx.letterSpacing = (o.letterSpacing * px) + 'px'; } catch (e) {}
    }
    function measure(scale) {
      var f = Math.max(8, Math.round(o.ribbonWidth * scale * o.textScale));
      var nf = Math.max(6, Math.round(f * (o.nameScale == null ? 0.36 : o.nameScale)));
      var names = !!o.showNames;                           // 纯图标 = 不量名称、不量分隔符
      var t = 0, list = [];
      items.forEach(function (it) {
        setFont(probe, nf);                                // 文字宽度必须用 nf 量（否则间距错乱）
        var logoW = Math.round(f * 3.6),                   // logo 方格（与 iconScale 同步，55px 方形要装得下）
            nameW = names ? probe.measureText(it.name).width : 0,
            sepW = names ? probe.measureText(o.separator).width : 0;
        var w = names
          ? (logoW + innerIcon + nameW + inner + sepW + inner)
          : (logoW + inner);                              /* 纯图标：只有项间距 */
        list.push({ it: it, x0: t, logoW: logoW, nameW: nameW, sepW: sepW, w: w });  // x0：贴图里的起点（供悬停命中）
        t += w;
      });
      return { total: t, list: list, f: f, nf: nf };
    }

    var m1 = measure(1);
    /* 2× 超采样（带子一直在 3D 里扭，1:1 贴图经过透视采样会发软）。
       ⚠️ 但整条内容很长（ROW1 一个周期就 4300px 宽），2× 会到 8600px ——
          超过 iPad 部分机型的 maxTextureSize(4096/8192) 就直接建不出纹理。
          所以让步：能 2× 就 2×，撞上限就降到刚好装得下。 */
    var ss = clamp((maxTex || 8192) / Math.max(1, m1.total), 0.5, 2);
    var m = Math.abs(ss - 1) < 0.01 ? m1 : measure(ss);

    var H = Math.max(24, Math.round(o.ribbonWidth * ss));  // 贴图高 = 缎带宽 × 超采样
    var fpx = m.f;
    var units = m.list;
    var CW = Math.max(2, Math.ceil(m.total));

    var cv = document.createElement('canvas');
    cv.width = CW; cv.height = H;
    var ctx = cv.getContext('2d');

    var bg = o.colors[o.ribbonIndex % 2], fg = o.colors[(o.ribbonIndex + 1) % 2];
    /* ⚠️ band=false（用户 10-13 定稿：不要实体缎带）时配色必须重定，
       不能沿用 band=true 那套「底色 / 文字色互补」规则 ——
       原规则 row1 = 白字、row2 = 紫字。可一旦没有实体带子，紫字直接压在近黑背景上，
       实测对比度只有约 2.3:1（#5227FF on #111111），而 row1 的白字是 17:1：
       上下两条一条清楚一条糊，看起来像 bug。
       处理：无缎带时【两行文字与 logo 统一用近白】，品牌紫只留给分隔符 · 当点缀。
       `?violet=1` 可回到"第二行紫字"那一版给用户对照。 */
    if (!o.band && !(typeof location !== 'undefined' && /[?&]violet=1/.test(location.search))) {
      fg = o.colors[1];
    }
    /* 无缎带时 · 用品牌紫；有缎带时跟该带文字色走 */
    var sepCol = o.band ? fg : o.colors[0];
    /* ⚠️ 浅色带子上的 logo 会"隐形"：icons-final/ 里全是给深色背景做的浅色 PNG
       （页面上本来还压着 opacity:.5），贴到第二条 #F5F3FF 近白带子上就只剩一点点灰。
       处理：底色亮 → 把 logo 用该带子的文字色染成剪影，和同带文字同色，视觉统一。
       底色暗 → 原样贴，保留 logo 原色。 */
    /* 2026-10-14 12:0x 用户：「把上一行的图标换成绿色（因为图标是白的、文字是绿色）；
       下面那行图标和文字一样颜色」→ 实带上【一律】把图标染成该行的文字色：
         · 第一行（深带绿字）→ 图标也绿  · 第二行（绿带黑字）→ 图标也黑（本来如此）
       无实带（band=false）时保持原色不变。 */
    var tintLogo = !!o.band;
    var tmp = null, tctx = null;
    if (tintLogo) { tmp = document.createElement('canvas'); tctx = tmp.getContext('2d'); }

    /* ⚠️ 2026-10-14 12:4x：实体缎带的底色【不再画进贴图】——
       改由 shader 的 uBandColor 提供（见 FRAG）。这样贴图里只有图标/文字，
       悬停高亮才可以"只点亮内容、不动底色"。
       bg 变量仍在这里计算（用于 sepCol / tintLogo 的配色判断）。 */

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    var nf = m.nf;
    var names = !!o.showNames;
    var x = 0, logoBox = fpx * 3.6, maxLogoH = fpx * (o.iconScale == null ? 3.6 : o.iconScale);
    units.forEach(function (u) {
      /* logo：contain 塞进方格并垂直居中（透明 PNG 原样贴，不做任何再加工） */
      var im = cache[u.it.icon];
      if (im && im.width) {
        /* 保高优先（旧版 img 是 height:42px 宽度自适应）；只有超宽图才会被格宽卡住 */
        var sc = maxLogoH / im.height;
        if (im.width * sc > logoBox) sc = logoBox / im.width;
        var dw = im.width * sc, dh = im.height * sc;
        var dx = x + (u.logoW - dw) / 2, dy = (H - dh) / 2;
        if (tintLogo) {
          tmp.width = Math.max(1, Math.ceil(dw)); tmp.height = Math.max(1, Math.ceil(dh));
          tctx.globalCompositeOperation = 'source-over';
          tctx.clearRect(0, 0, tmp.width, tmp.height);
          tctx.drawImage(im, 0, 0, dw, dh);
          tctx.globalCompositeOperation = 'source-in';   // 只给已有像素上色，透明区保持透明
          tctx.fillStyle = fg;
          tctx.fillRect(0, 0, tmp.width, tmp.height);
          ctx.drawImage(tmp, dx, dy);
        } else {
          ctx.drawImage(im, dx, dy, dw, dh);
        }
      } else if (u.it.abbr) {
        /* 没有 png 的（Stable Diffusion）：字母占位 —— 它是"图标"的替身，用图标级字号 */
        setFont(ctx, fpx);
        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.fillText(u.it.abbr, x + u.logoW / 2, H / 2);
        ctx.textAlign = 'left';
      }
      x += u.logoW + (names ? innerIcon : inner);       /* 纯图标没有"图标↔文字"，退回项间距 */
      if (names) {
        /* 文字：独立小一号 + 细一档 + 半透明 —— 视觉主角让给图标 */
        setFont(ctx, nf);
        ctx.globalAlpha = o.nameAlpha == null ? 0.78 : o.nameAlpha;
        ctx.fillStyle = fg;
        ctx.fillText(u.it.name, x, H / 2);
        ctx.globalAlpha = 1;
        x += u.nameW + inner;
        ctx.globalAlpha = o.band ? 0.55 : 0.92;   // 分隔符弱一档，不抢名称
        ctx.fillStyle = sepCol;
        ctx.fillText(o.separator, x, H / 2);
        ctx.globalAlpha = 1;
        x += u.sepW + inner;
      }
    });

    return { canvas: cv, height: H, units: units, tileWorld: CW / ss };
  }

  function hx(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function lum(hex) {
    var c = hx(hex);
    return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
  }
  function mixHex(a, b, t) {
    var A = hx(a), B = hx(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ','
      + Math.round(A[1] + (B[1] - A[1]) * t) + ','
      + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  /* ------------------------------------------------------------
     着色器：位置已在 CPU 端算好，这里只负责
     ① 沿 U 推平铺偏移（＝文字流动）；② 按带面朝向补缎面边缘光。
     ------------------------------------------------------------ */
  var VERT = [
    'attribute float aAngle;',
    'uniform float uOffset;',
    'uniform float uTile;',
    'varying vec2 vUv;',
    'varying float vFace;',
    'void main(){',
    '  vUv = vec2(uv.x + uOffset, uv.y);',
    '  vFace = sin(aAngle);',           /* 带面法线的"朝向相机"分量 */
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'uniform sampler2D uMap;',
    'uniform float uSheen;',
    'uniform float uShading;',
    'uniform vec2 uHover;',            /* 悬停高亮的贴图 uv 区间（空区间时 A>=B，不染） */
    'uniform vec3 uHoverTint;',
    'uniform float uIconAlpha;',       /* 默认存在感（无带模式的内容透明度） */
    /* ⚠️ 2026-10-14 12:4x【底色与内容分层】：实体缎带的底色从贴图移到 uBandColor，
       贴图里只有图标/文字 —— 于是悬停可以只【点亮内容本身】，
       而不会把丝带的底色也染成一块色块（用户：「背景不会被这样遮挡」）。 */
    'uniform vec3 uBandColor;',
    'uniform float uBandOn;',          /* 1 = 有实体带（整条不透明） / 0 = 只有内容 */
    'uniform float uHoverLift;',       /* 选中亮度（0~1）：盖白的强度，不受明暗压制 */
    'varying vec2 vUv;',
    'varying float vFace;',
    'void main(){',
    '  vec4 t = texture2D(uMap, vUv);',
    '  float inH = 0.0;',
    '  if (uHover.y > uHover.x) {',
    '    float uu = fract(vUv.x);',
    '    inH = step(uHover.x, uu) * step(uu, uHover.y);',
    '  }',
    '  vec3 content = t.rgb;',
    '  float contentA = t.a * uIconAlpha;',
    '  if (inH > 0.5) contentA = t.a;     /* 选中：内容回满不透明 */',
    '  vec3 col;',
    '  float alpha;',
    '  if (uBandOn > 0.5) {',
    '    col = mix(uBandColor, content, contentA);',
    '    alpha = 1.0;',
    '  } else {',
    '    if (contentA < 0.004) discard;',
    '    col = content;',
    '    alpha = contentA;',
    '  }',
    /* sheen：带子侧向时加一道缎面亮边 */
    '  float rim = pow(1.0 - abs(vFace), 2.4) * uSheen;',
    '  col += vec3(rim) * (0.55 + 0.45 * alpha);',
    /* shading：正面平色、侧向压暗 */
    '  col *= 1.0 - uShading * 0.5 * (1.0 - abs(vFace));',
    /* ★ 悬停高亮放在 shading【之后】—— 用户 2026-10-14 14:4x：
       「鼠标触碰时候的白色不要被原本的明暗束缚，要不然看不清（选中）的是哪个」。
       盖白只作用于内容像素（t.a），底色不动；强度由 uHoverLift（选中亮度）控制。 */
    '  if (inH > 0.5) {',
    '    col = mix(col, uHoverTint, clamp(inH * t.a * uHoverLift, 0.0, 1.0));',
    '  }',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------
     RibbonRow：一条丝带（一个 canvas / 一个 WebGL context）。
     对外暴露 LogoLoop 同款接口：opt / set() / _dims() / dispose()。
     ------------------------------------------------------------ */
  /* 整体缩放（用户 2026-10-13 要求"大小还是按原来那两行图标的大小"）。
     只动【尺寸】不动【造型】：group.scale 把整条丝带（带高、波浪、纵深、字、图标）
     等比缩小，画布高也跟着缩，所以透视关系和波浪形状一模一样，只是变小了。
     ⚠️ 不能改成去调 ribbonWidth/amplitude —— 那会改变字与波的比例，等于重新设计。 */
  RibbonRow.prototype._scale = function () {
    var s = this.opt.scale;
    return (s == null || s <= 0) ? 1 : s;
  };
  /* 画布的世界高度（未乘 scale）—— **相机标定的唯一基准**。
     ⚠️ 2026-10-13 栽的坑：原来这里是 `band ? ribbonWidth : 字高`（band=false 时收紧到 139），
        结果画布一变矮 → `camera.position.z = (canvasH/2)/tan(fov/2)` 也跟着变小 →
        depth=400 的波峰（z=+200，靠近镜头）处视锥半宽只剩 259px，而丝带半宽 1044px，
        **中段整条被裁掉**（表现是两行文字只剩右边一小截，左边一大片全黑）。
     正确关系：相机距离必须挂在【固定的世界高度】上，缩放只改「1 世界单位 = 多少 CSS 像素」。
       1 世界单位 = canvasH / worldH = scale 个 CSS px  →  camZ = (worldH/2)/tan(fov/2) */
  RibbonRow.prototype._worldH = function () {
    var o = this.opt;
    return Math.max(180, Math.round(o.ribbonWidth + o.amplitude * 2 + 40));
  };
  /* 行槽（用户看到的这一行）的世界高度：band=true 要装下整条实体带；
     band=false 只有字和图标，按「字高 + 波浪行程 + 余量」算，省掉上下透明死区。 */
  RibbonRow.prototype._inkH = function () {
    var o = this.opt;
    var ink = Math.round(o.ribbonWidth * o.textScale);
    return Math.max(24, Math.round((o.band ? o.ribbonWidth : ink) + o.amplitude * 2 + 8));
  };

  /* 统一重算三件套并落到 DOM 上：
       worldH   世界高度（相机基准，固定）
       canvasH  画布 CSS 高 = worldH × scale   （1 世界单位 = scale 个 CSS px）
       slotH    行槽 CSS 高 = inkH × scale     （用户看到的行高）
     ⚠️ 画布比行槽高，多出来的部分是透明死区 → 画布绝对定位、往上偏移
        (worldH − inkH)/2 × scale，让墨带正好落在行槽中间。
     ⚠️ 改这里必须同时改 _resize() 里的相机距离（用 worldH，不用 canvasH）。 */
  RibbonRow.prototype._layout = function () {
    var o = this.opt, s = this._scale();
    this.worldH = this._worldH();
    var inkH = this._inkH();
    var canvasH = Math.max(24, Math.round(this.worldH * s));
    var slotH = Math.max(20, Math.round(inkH * s));
    var top = -Math.round((this.worldH - inkH) / 2 * s);
    var changed = (canvasH !== this.canvasH) || (slotH !== this.slotH);
    this.canvasH = canvasH; this.slotH = slotH;
    this.root.style.height = slotH + 'px';
    if (this.canvas) {
      this.canvas.style.height = canvasH + 'px';
      this.canvas.style.top = top + 'px';
    }
    return changed;
  };

  function RibbonRow(root, options) {
    if (!root) throw new Error('[ribbon] root 不存在');
    if (!global.THREE) { console.warn('[ribbon] THREE 未加载'); return; }

    this.root = root;
    this.opt = Object.assign({}, CONFIG, options || {});
    this.opt.ribbonIndex = this.opt.ribbonIndex || 0;
    this.items = this.opt.items || [];
    this.hovered = false;
    this.t = 0;
    this.offsetPx = 0;
    this.waves = [];                   // 点击拧转的扭转波队列（见 twistFrom / _step）
    this._last = 0;
    this._imgCache = {};
    this._tex = null;
    this._tileW = 1;
    this._disposed = false;
    /* 调试探针用（`const loop1` 不挂 window，外部脚本够不到） */
    (global.__ribbons = global.__ribbons || []).push(this);

    var self = this;
    this._layout();
    root.style.position = 'relative';
    root.style.overflow = 'hidden';
    /* 两端淡出：**已按用户要求移除**（2026-10-14 16:1x：「这两边不用透明度」）——
       保留一行注释说明历史：原来是 `linear-gradient(to right, transparent 0, #000 7%,
       #000 93%, transparent 100%)` 的横向遮罩，让两端渐隐；现在两端直接硬切。 */

    var cv = document.createElement('canvas');
    /* 绝对定位：画布比行槽高（多出的是透明死区），靠 top 把墨带挪进行槽中间 */
    /* ⚠️ canvas 不吃指针事件：它比行槽高（画布 143px vs 行槽 76px，波浪要占空间），
       相邻两行的 canvas 纵向重叠 67px —— 若由 canvas 接点击，"点下一行"会被上一行抢走。
       行槽（root）不重叠、且覆盖全部可见内容（字画在行槽中心），事件一律挂 root。 */
    cv.style.cssText = 'display:block;position:absolute;left:0;top:0;width:100%;pointer-events:none;';
    root.appendChild(cv);
    this.canvas = cv;
    this._layout();

    this.renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearAlpha(0);
    /* ⚠️ 贴图超采样倍率的上限依据 = min(设备能力, 8192)。
       为什么锁上限（2026-10-13 23:4x 挖出的深坑）：ss = maxTex / 内容周期宽，
       而内容很长（图标+名字，一周期 ~12000px）——
         · RTX 3060 的 maxTextureSize = 32768 → ss = 2（满血）
         · SwiftShader 软渲染只有 8192 → ss = 0.6
       两端 ss 差 3.3 倍 ⟹ 屏幕上所有尺寸差 3 倍 ⟹ 我在软渲染里标定的值在你真机上全错位。
       锁到 8192 后两端行为一致；代价只是超采样被限制（屏幕上 1 贴图px ≈ 0.36 屏px，
       等效仍有 ~2.8 倍过采样，清晰度足够）。 */
    this._maxTex = Math.min(this.renderer.capabilities.maxTextureSize || 8192, 8192);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.opt.perspective, 1, 1, 20000);

    this.group = new THREE.Group();
    /* tilt：绕【自身长轴】转，＝带面朝你/离你倾斜（对齐文档 "toward or away from you"）。
       ⚠️ 试过用 rotation.z（画面内翻滚）—— 一条 1440px 宽的带子转 21°
         垂直跨度要 1440·sin21° ≈ 516px，比整块画布还高，两端直接被裁掉，排除。 */
    this.group.rotation.x = this.opt.tilt * DEG;
    /* roll：画面内旋转（与 tilt 独立）——用户 2026-10-14 12:4x：
       「增加一个上下两个丝带角度的控制，我想看看交叉会什么效果」
       → 两行设相反角度（+8 / -8）即可看到"X 形交叉"。 */
    this.group.rotation.z = (this.opt.roll || 0) * DEG;
    this.group.scale.setScalar(this._scale());
    this.scene.add(this.group);

    this._resize();
    this._onResize = function () { self._resize(); };
    global.addEventListener('resize', this._onResize);

    /* 悬停：整条带子降速（hoverSpeed），文字才停得住给人读 */
    root.addEventListener('pointerenter', function () { self.hovered = true; });
    root.addEventListener('pointerleave', function () {
      self.hovered = false;
      self.hoverFrom(NaN);             // 离开 → 清悬停高亮
    });

    /* ---- 事件：归属判定 + 处理（2026-10-14 修复"点这里判定成别处"）----
       ⚠️ 两行在 cLoopGap<0 且 rY1/rY2 有偏移时 DOM 区域会重叠（实测 23px），
          浏览器只把事件发给最上层那行 → 点第一行被判定成第二行。
          统一按"指针到两行带状中心的距离"取最近行，不是自己就【转交】。
       ⚠️ 监听仍挂 root（行槽），不挂 canvas —— 理由见 canvas 创建处的注释。 */
    root.addEventListener('pointermove', function (e) {
      var t = self._routeEvent(e);
      if (t) t.hoverFrom(e.clientX);
    }, { passive: true });
    root.addEventListener('pointerdown', function (e) {
      var t = self._routeEvent(e);
      if (t) t._pressAt(e.clientX, e.clientY, e.pointerId);
    });
    root.addEventListener('pointerup', function (e) {
      var t = self._routeEvent(e);
      if (t) t._releaseAt(e.clientX, e.clientY, e.pointerId);
    });

    loadImages(this.items, function (cache) {
      if (self._disposed) return;
      self._imgCache = cache;
      self._paintWhenFontReady();
      /* ⚠️ 页面 load 后再补一次重绘（2026-10-14 00:4x 实测的兜底）：
         在 SwiftShader 软渲染里，"初始 _paint" 与 "运行中重绘" 有一次可见差异 ——
         同参数下初始版的名字不上屏、运行时重绘后正常（怀疑 CanvasTexture 首次上传
         与字体就绪/首帧的竞态，未完全定位）。这里在 load 后 150ms 再重建一次贴图，
         幂等、代价约一次 10-30ms 的重绘，换取两路径结果一致。 */
      /* ⚠️ 字体晚到必须重绘（与主页面 setup 末尾的 document.fonts.ready 同因）：
         实测（首次加载）：初始 _paint 时 Lexend 还没就绪 → canvas 的 measureText
         与 fillText 用上不同字体（fallback vs 真字体）→ 名字宽度算错、画到错位置/不可见。
         ⚠️ 不能只靠 _paintWhenFontReady 里的 fonts.load('<weight> 16px') ——
            它只等那一种字重，resolve 时机早于"所有字体就绪"。
         这里再挂全局 fonts.ready 兜底重绘一次（幂等，代价一次 ~10-30ms 重建）。 */
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(function () {
          if (!self._disposed) self._repaintSoon();
        });
      }
    });

    this._start();
  }

  RibbonRow.prototype._resize = function () {
    var w = this.root.clientWidth || this.root.offsetWidth || 1;
    var h = this.canvasH;                       // 画布 CSS 高（= worldH × scale）
    var q = clamp(this.opt.quality, 0.5, 1);
    var dpr = Math.min(global.devicePixelRatio || 1, 2) * q;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    /* fov 就是 perspective 参数；相机距离挂在【世界高度】上，不是画布高 ——
       这样 1 世界单位 = scale 个 CSS 像素，缩放就只是整体变小，几何/透视/波浪全不变。
       （曾按画布高算，画布一矮视锥就窄，depth 的波峰直接把丝带中段裁掉。） */
    this.camera.position.z = (this.worldH / 2) / Math.tan(this.camera.fov * DEG / 2);
    this.camera.updateProjectionMatrix();
    this.viewW = w;
    this.viewH = h;
    this._geometry();
  };

  /* 几何：沿 X 每 4px 一段的细长平面 */
  RibbonRow.prototype._geometry = function () {
    if (!this._tex) return;
    var segX = clamp(Math.round(this.viewW / 4), 80, 900);
    /* 几何宽度：屏幕在世界单位下的可见宽 = viewW / scale（1 世界单位 = scale 个 CSS px），
       所以要比视口长 45% 的话，世界长度得除以 scale —— 否则缩小后丝带两头够不到屏幕边，
       中间会露出一道透明断口。除以 scale 后「屏幕上看到多少道波浪」与缩放无关。 */
    var W = this.viewW * 1.45 / this._scale();
    this.W = W; this.segX = segX;
    var count = (segX + 1) * 2, idx = [];
    for (var i = 0; i < segX; i++) {
      var a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    var pos = new Float32Array(count * 3);
    var uv = new Float32Array(count * 2);
    var ang = new Float32Array(count);
    var tile = this._tileW || this._tex.width;      // 世界单位下的贴图周期（canvas 宽 ÷ 超采样）
    for (var k = 0; k <= segX; k++) {
      var x = -W / 2 + (k / segX) * W;
      uv[k * 4] = x / tile;          // 贴图沿 X 按「1 canvas px = 1 世界单位」平铺
      uv[k * 4 + 2] = x / tile;
      /* ⚠️ V 方向必须跟着顶点顺序走：下面 position 是先写「上缘」再写「下缘」，
         所以 k*2 那个顶点要 v=1（CanvasTexture 默认 flipY，图片顶边对应 v=1）。
         这里写反过一次 —— 表现是两行文字整个上下颠倒（照镜子）。 */
      uv[k * 4 + 1] = 1;             // 上缘
      uv[k * 4 + 3] = 0;             // 下缘
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aAngle', new THREE.BufferAttribute(ang, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), W);

    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    var tex = new THREE.CanvasTexture(this._tex);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    tex.generateMipmaps = true;
    this.tex = tex;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uOffset: { value: 0 },
        uTile: { value: tile },
        uSheen: { value: this.opt.sheen },
        uShading: { value: this.opt.shading },
        uHover: { value: new THREE.Vector2(0, 0) },      /* 悬停高亮区间 */
        uHoverTint: { value: new THREE.Color(this.opt.hoverTintColor || '#CCFF00') },
        /* ⚠️ 2026-10-14：原来 band=1 时强制 1.0，导致用户在实体带模式下拖「图标亮度」没反应。
           现在两种模式都直接用 iconAlpha —— band=1 时它只作用于"内容叠加权重"（contentA），
           影响的是内容相对底色的可见度，不会让整条带子变透明（alpha 单独算）。 */
        uIconAlpha: { value: this.opt.iconAlpha == null ? 0.85 : this.opt.iconAlpha },
        uHoverLift: { value: this.opt.hoverLift == null ? 1 : this.opt.hoverLift },
        /* 实体缎带底色（与贴图内容分层；band=0 时无意义） */
        uBandColor: { value: new THREE.Color(this.opt.colors[this.opt.ribbonIndex % 2] || '#000000') },
        uBandOn: { value: this.opt.band ? 1 : 0 }
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide            // twist 转过 90° 会露出背面
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.group.add(this.mesh);
    /* 交缠的两条丝带要能分出前后 → 按实例给一点 z 偏置 */
    this.group.position.z = this.opt.ribbonIndex * 40 - 20;
  };

  RibbonRow.prototype._paint = function () {
    var t = buildTexture(this._imgCache, this.items, this.opt, this.root, this._maxTex);
    this._tex = t.canvas;
    this.units = t.units;
    this._tileW = t.tileWorld;
    if (this.tex) this.tex.dispose();
    this._geometry();
  };

  RibbonRow.prototype._start = function () {
    var self = this;
    function frame(now) {
      if (self._disposed) return;
      if (!self._last) self._last = now;
      var dt = Math.min(0.05, (now - self._last) / 1000);
      self._last = now;
      /* ⚡ 手机性能（2026-10-16）：宿主页离开视野时跳过 step + render（WebGL 每帧渲染很贵）。
         ⚠️ _last 已在上面照常更新 → 恢复时 dt 正常、不会跳变。
         标志由宿主页（skills-stage.html）维护；独立使用时不存在 → 恒为 true。 */
      if (window.__skillsPageOn !== false) {
        self._step(dt);
        self.renderer.render(self.scene, self.camera);
      }
      self._raf = requestAnimationFrame(frame);
    }
    this._raf = requestAnimationFrame(frame);
  };

  RibbonRow.prototype._step = function (dt) {
    var o = this.opt;
    if (o.paused) return;              /* 暂停：整条丝带冻住（面板「暂停」开关） */
    this.t += dt;

    /* 点击波 ≡ 自动波（用户 2026-10-14 11:49：「点击的交互效果和自动的
       速度以及丝带圈数一致，按我调的自动的去改点击的」）：
         · 幅度 = rollMax          · 宽度 = rollSpan
         · 速度 = 自动波的速度 1.7 参数 / autoTwist 秒（autoTwist=0 关自动时退回 clickFlow） */
    var cFlow = (o.waveSpeed == null)
      ? ((o.autoTwist > 0) ? (1.7 / Math.max(0.12, o.autoTwist)) : (o.clickFlow || 0.55))
      : o.waveSpeed;
    var cSpan = Math.max(0.01, o.rollSpan || 0.06);
    var cAmpT = TAU * (o.rollMax == null ? 0.32 : o.rollMax);
    /* 波滚出带子范围（s < -0.3 或 > 1.3）后不可能再回来 → 回收 */
    if (this.waves.length) {
      var keepW = [];
      for (var wi0 = 0; wi0 < this.waves.length; wi0++) {
        var wv0 = this.waves[wi0];
        var wc0 = wv0.s + wv0.dir * (this.t - wv0.t0) * cFlow;
        if (wc0 > -0.3 && wc0 < 1.3) keepW.push(wv0);
      }
      this.waves = keepW;
    }

    /* 速度：hover → hoverSpeed 倍（原版语义），方向 left/right 决定正负 */
    var k = this.hovered ? o.hoverSpeed : 1;
    var dir = o.direction === 'right' ? -1 : 1;
    this.offsetPx += o.speed * k * dt * dir;

    if (!this.mesh || !this._tex) return;

    /* 文字流动：只推 uniform，几何不动 */
    var uOff = this.offsetPx / this._tileW;
    this.material.uniforms.uOffset.value = uOff;
    this.material.uniforms.uSheen.value = o.sheen;
    this.material.uniforms.uShading.value = o.shading;

    /* 形变：中线走椭圆空间波 + 带面绕长轴 twist */
    var pos = this.mesh.geometry.attributes.position.array;
    var ang = this.mesh.geometry.attributes.aAngle.array;
    var hw = o.ribbonWidth / 2;
    var W = this.W, segX = this.segX;
    var flowPh = TAU * o.flow * this.t;
    var per = Math.max(0.12, o.autoTwist);
    var localT = (this.t % per) / per;
    /* 翻滚波方向：默认 -0.35→1.35（向右跑）；twistDir=-1 时 1.35→-0.35（向左跑）。
       2026-10-14 用户要求两行"交叉"（自动播放两行方向相反，转波也应当如此）。
       ⚠️ 2026-10-14 12:0x：波速与间隔【解耦】—— 原来波在"间隔秒数"内正好滚完 1.7 参数
       （速度 = 1.7/per，两者绑死）；现在用独立的 waveSpeed（参数/秒）：
           travel 的推进量 = per × waveSpeed（默认 7.4×0.23 = 1.7，与旧行为等价） */
    var waveSpeed = (o.waveSpeed == null) ? (1.7 / Math.max(0.12, o.autoTwist)) : o.waveSpeed;
    var span2 = per * waveSpeed;
    var travel = (o.twistDir === -1)
      ? (1.35 - localT * span2)
      : (-0.35 + localT * span2);

    for (var i = 0; i <= segX; i++) {
      var x = -W / 2 + (i / segX) * W;
      var s = i / segX;
      var ph = TAU * o.frequency * s + flowPh;
      var cy = o.amplitude * Math.sin(ph);
      var cz = (o.depth / 2) * Math.sin(ph + Math.PI / 2);
      /* twist：持续的小幅摆动（±twist 圈，永不越过 90°）+ autoTwist 的翻滚波
         ⚠️ 翻滚波必须【封顶在 90° 以内】+【收窄到一条波】。原文 autoTwist 是
            「整条带子每 0.5s 转满 360°」——转过 90° 后露的是背面，
            贴图看起来就是镜像文字（`_s3r_font2` 那张实拍：Vadjd/njouboylc 全是反的）。
            带子上印的是 17 个工具名，是【信息】不是装饰，镜像 = 信息作废。
            现在：rollMax 圈数上限（默认 0.16 ≈ 58°）+ rollSpan 波宽（默认 0.085，
            从原来的 0.22 收窄，原来那一下要卷掉整条丝带 44% 的长度）。 */
      var a = TAU * o.twist * Math.sin(TAU * (o.twistSpeed * this.t - s));
      if (o.autoTwist > 0) {
        var env = Math.exp(-Math.pow((s - travel) / (o.rollSpan || 0.22), 2));
        a += TAU * (o.rollMax == null ? 1 : o.rollMax) * env;
      }
      /* 点击拧转波（clickTwist）：与 autoTwist 的"小幅度保读"不同，
         这里是【一整圈】幅度 —— 波峰处带面转过 360°，两侧过渡区拧成麻花。
         用户 2026-10-13：「我在这里点击一下他两边就拧成麻花」。 */
      for (var wi = 0; wi < this.waves.length; wi++) {
        var wv = this.waves[wi];
        var wc = wv.s + wv.dir * (this.t - wv.t0) * cFlow;
        a += cAmpT * Math.exp(-Math.pow((s - wc) / cSpan, 2));
      }
      var ca = Math.cos(a), sa = Math.sin(a);
      var p = i * 6;
      pos[p] = x; pos[p + 1] = cy + hw * ca; pos[p + 2] = cz + hw * sa;
      pos[p + 3] = x; pos[p + 4] = cy - hw * ca; pos[p + 5] = cz - hw * sa;
      ang[i * 2] = a; ang[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aAngle.needsUpdate = true;
  };

  /* 点击拧转：从点击处（带子参数 s0，0~1）向【两侧】各发一个整圈扭转波。
     ⚠️ 波挂在【几何参数】上，不是纹理坐标 —— 用户点的是屏幕上看到的那个字母，
        但贴图一直在流动，几百毫秒后那个字母就飘走了；拧的位置跟着"带子上的那一处"
        走，观感才成立（用户描述：「点一下他两边就拧成麻花」）。 */
  RibbonRow.prototype.twistFrom = function (s0) {
    if (!this.opt.clickTwist) return;
    s0 = clamp(s0, 0, 1);
    this.waves.push({ s: s0, dir: 1, t0: this.t });
    this.waves.push({ s: s0, dir: -1, t0: this.t });
  };

  /* 指针 x → 它下面压着哪个 item。
     量纲与 _geometry/_step 严格对齐：uv = x / tileW，采样坐标 vUv = uv + offsetPx / tileW，
     所以 texPx = fract((worldX + offsetPx) / tileW) × CW。
     ⚠️ 旧版 LogoLoop 是 DOM（每个 li 挂 mouseenter），换成 canvas 后必须几何反算 ——
        这就是「悬停/点击图标 → 上方主角位切换」（onItemHover）在丝带版里丢了的原因。 */
  RibbonRow.prototype._itemAt = function (clientX) {
    if (!this._tex || !this.units || !this.units.length) return null;
    var r = this.root.getBoundingClientRect();
    var u = (clientX - r.left) / Math.max(1, r.width);
    var sc = this._scale();
    /* ⚠️ 2026-10-14 16:2x 修正（"点这里命中别处"）：
       屏幕 x → 缩放后世界（(u-0.5)×viewW/scale）→ 【几何】坐标要再除一次 group.scale
       （mesh 在 group 里被 scale 缩放；uv = 几何x / tileW）。
       原实现漏了这次除法 → 命中位置随 x 线性偏移（实测屏幕右侧偏 ~115px）。 */
    var worldX = (u - 0.5) * (r.width / sc);      /* 缩放后世界 */
    var geomX = worldX / sc;                       /* 几何坐标 */
    var CW = this._tex.width;
    var vU = (geomX + this.offsetPx) / (this._tileW || 1);
    var texPx = (((vU % 1) + 1) % 1) * CW;
    var units = this.units;
    for (var i = 0; i < units.length; i++) {
      var uu = units[i];
      if (texPx >= uu.x0 && texPx < uu.x0 + uu.w) return uu.it;
    }
    return null;
  };

  /* 事件归属：这个指针事件该归哪一行（按指针到两行带状中心的距离取最近）。
     返回归属行；不是自己时顺手清掉自己的悬停高亮（避免残影）。 */
  RibbonRow.prototype._routeEvent = function (e) {
    var all = global.__ribbons || [];
    var inBand = null;                 /* 指针落在"带子可见条带"内的行（循环递增 → 取最上层） */
    var nearest = this, nd = Infinity; /* 都不在带内时的兜底：离行槽中心最近者 */
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      if (!r || r._disposed || !r.root) continue;
      var rc = r.root.getBoundingClientRect();
      if (e.clientX < rc.left || e.clientX > rc.right) continue;
      var cy = rc.top + rc.height / 2;
      var d = Math.abs(e.clientY - cy);
      if (d < nd) { nd = d; nearest = r; }
      /* ⚠️ 2026-10-14 12:0x 用户：「鼠标在后面（下一行）却选中了前面一个」。
         两行重叠时，重叠区【视觉上显示的是 z 序上层那条带子】（实带不透明，
         后创建的行盖在上面）——所以"指针落在谁的带内"就归谁；
         两条带都覆盖时归【数组靠后 = 视觉上层】的那条（循环不 break 即为上层）。
         带半高 = 带宽 × scale ÷ 2，+4 容差。 */
      if (d <= (r.opt.ribbonWidth * r._scale()) / 2 + 4) inBand = r;
    }
    var best = inBand || nearest || this;
    /* ⚠️ 2026-10-14 15:3x 用户：「他是两个都被选中」——
       旧逻辑只清"自己"（归别人时），但反过来"归自己"时没人清"别人"，
       于是从 B 行移到 A 行时 B 的高亮留在屏幕上。
       修法：无论归谁，把【所有非归属行】的悬停都清掉（hoverFrom(NaN) 自带去重，安全）。 */
    for (var j = 0; j < all.length; j++) {
      var other = all[j];
      if (other && other !== best && !other._disposed) other.hoverFrom(NaN);
    }
    return best;
  };

  /* 悬停处理（可被转交调用；NaN = 清除）。去重用 _hoverIt —— 实例属性，
     转交场景下也要保证"同项不重复触发 onItemHover"。 */
  RibbonRow.prototype.hoverFrom = function (clientX) {
    var it = (clientX === clientX) ? this._itemAt(clientX) : null;   // NaN 检查
    if (it === this._hoverIt) return;
    this._setHover(it);
    if (it && this.opt.onItemHover) this.opt.onItemHover(it);
  };

  RibbonRow.prototype._pressAt = function (clientX, clientY, pointerId) {
    this._dnX = clientX; this._dnY = clientY;
    this._dnT = performance.now(); this._dnId = pointerId;
  };

  /* 点击拧转（官方 clickTwist）：位移 < 8px 且 650ms 内算"点击" */
  RibbonRow.prototype._releaseAt = function (clientX, clientY, pointerId) {
    if (pointerId !== this._dnId) return;
    if (Math.abs(clientX - this._dnX) > 8 || Math.abs(clientY - this._dnY) > 8) return;
    if (performance.now() - this._dnT > 650) return;
    this.hoverFrom(clientX);           // 触摸点击没有 pointermove → 这里补一次主角位联动
    /* 屏幕 x → 带子参数 s：带子世界宽 W = viewW × 1.45 / scale，屏幕可见的
       只是它的中间 1/1.45 段（两端伸在画布外）。z=0 平面近似。 */
    var r = this.root.getBoundingClientRect();
    var u = (clientX - r.left) / Math.max(1, r.width);
    this.twistFrom((u + 0.225) / 1.45);
  };

  /* 悬停高亮：把该 item 的贴图 uv 区间写进 shader（零重绘） */
  RibbonRow.prototype._setHover = function (it) {
    this._hoverIt = it || null;
    if (!this.material) return;
    var h = this.material.uniforms.uHover;
    if (!h) return;
    if (!it || !this._tex || !this.opt.hoverTint) { h.value.set(0, 0); return; }
    var units = this.units || [], CW = this._tex.width;
    for (var i = 0; i < units.length; i++) {
      if (units[i].it === it) {
        /* ⚠️ 2026-10-14 13:0x：区间放开为【整个 item】（图标+文字都要点亮）。
           此前收窄到图标格是因为"整项染绿"会把丝带底色也染成一块色块（很丑）——
           现在底色已移到 shader 的 uBandColor（见 FRAG 分层），
           高亮只作用于"内容像素"（图标/文字），区间放开【不会再遮挡背景】。 */
        h.value.set(units[i].x0 / CW, (units[i].x0 + units[i].w) / CW);
        return;
      }
    }
    h.value.set(0, 0);
  };

  /* LogoLoop 兼容层：调参面板与既有代码调用的是这几个 */
  RibbonRow.prototype.set = function (k, v) {
    /* 面板的"卡片高度"拉杆接管文字大小：v=42 → textScale 0.42，恰好对上配置里的默认值 */
    if (k === 'logoHeight') {
      /* 面板"文字大小"按【屏幕像素】走，和原 LogoLoop 的 logoHeight 语义一致
         （用户从 2026-09 起就习惯"拖到 42 = 42px 高"）。
         而 textScale 是「占带高的比例」，要乘上 scale 才是屏幕像素：
           屏幕px = ribbonWidth × textScale × scale
        → textScale = v / (ribbonWidth × scale)
         ⚠️ 所以这个滑杆的 value 不是"等于 CONFIG 的 textScale"，
            而是"等于屏幕像素高度"，别按老注释去对表。 */
      this.opt.logoHeight = v;
      this.opt.textScale = v / (this.opt.ribbonWidth * this._scale());
      return this._repaintSoon();
    }
    this.opt[k] = v;
    if (k === 'speed' || k === 'direction' || k === 'hoverSpeed') return;
    /* 点击波参数只被 _step 每帧读取，改完即生效 */
    if (k === 'clickTwist' || k === 'clickAmp' || k === 'clickSpan' || k === 'clickFlow') return;
    /* 这几个改的是贴图内容（字号/字距/透明度/图标格/显示名称）→ 必须重绘 */
    if (k === 'nameScale' || k === 'nameAlpha' || k === 'fontWeight' || k === 'iconScale' || k === 'showNames') return this._repaintSoon();
    if (k === 'iconGap') return this._repaintSoon();          // 图标↔文字距离也改贴图
    if (k === 'letterSpacing') return this._repaintSoon();
    /* 渲染质量改的是 renderer 的 pixelRatio → 走一次 _resize */
    if (k === 'quality') { this._resize(); return; }
    /* 运行时参数（每帧读 opt）：smooth 生效，不重绘 */
    if (k === 'paused' || k === 'twistSpeed' || k === 'speed' || k === 'flow') return;
    /* 悬停高亮 / 存在感：只动 uniform，不重绘 */
    if (k === 'hoverTintColor') { if (this.material) this.material.uniforms.uHoverTint.value.set(v); return; }
    if (k === 'iconAlpha') { if (this.material) this.material.uniforms.uIconAlpha.value = v; return; }
    if (k === 'hoverLift') { if (this.material) this.material.uniforms.uHoverLift.value = v; return; }
    if (k === 'hoverTint') { this._setHover(v ? this._hoverIt : null); return; }
    /* 改带宽 → 画布高（= 带宽 + 波浪 + 余量）与贴图高度都要跟着重算 */
    if (k === 'ribbonWidth') { this._applyConfig(); return this._repaintSoon(); }
    if (k === 'gap' || k === 'band' || k === 'separator' || k === 'colors') return this._repaintSoon();
    this._applyConfig();
  };
  RibbonRow.prototype._repaintSoon = function () {
    var self = this;
    clearTimeout(this._paintT);
    this._paintT = setTimeout(function () { self._paintWhenFontReady(); }, 0);
  };

  /* ⚠️ canvas 的 measureText 与 fillText 必须用同一个字体，否则「量出来的宽度」和
     「实际画出来的宽度」不一致 → 项与项之间的间距会错乱（实测项宽差 18%）。
     而 Lexend 是自托管 webfont，首帧时往往还没进缓存：measure 走 fallback、fillText
     走真字体（或反过来）。所以画之前必须先显式把字体 load 出来，不能只等 fonts.ready
     —— 那个 promise 可能在字体被请求之前就已经 resolve 了。 */
  RibbonRow.prototype._paintWhenFontReady = function () {
    var self = this;
    var fam = fontStack(this.root);
    var go = function () { if (!self._disposed) self._paint(); };
    if (document.fonts && document.fonts.load) {
      var p = null;
      try { p = document.fonts.load(this.opt.fontWeight + ' 16px ' + fam); } catch (e) {}
      if (p && p.then) { p.then(go, go); return; }
    }
    go();
  };
  RibbonRow.prototype._applyConfig = function () {
    var o = this.opt;
    if (this.camera) { this.camera.fov = o.perspective; this.camera.position.z = (this.worldH / 2) / Math.tan(o.perspective * DEG / 2); this.camera.updateProjectionMatrix(); }
    if (this.group) this.group.rotation.x = o.tilt * DEG;
    if (this.material) { this.material.uniforms.uSheen.value = o.sheen; this.material.uniforms.uShading.value = o.shading; }
    if (this.group) { this.group.scale.setScalar(this._scale()); }
    if (this._layout()) this._resize();
  };
  RibbonRow.prototype._dims = function () { this._resize(); };
  RibbonRow.prototype.dispose = function () {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    global.removeEventListener('resize', this._onResize);
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
    if (this.tex) this.tex.dispose();
    try { this.renderer.dispose(); } catch (e) {}
  };

  global.RibbonRow = RibbonRow;
  global.RIBBON_CONFIG = CONFIG;
})(window);
