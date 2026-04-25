/**
 * generateStreakImage
 *
 * Draws a social-share card onto an off-screen canvas using the 2D Canvas API
 * (no external dependencies needed) and returns it as a PNG Blob.
 *
 * Output: 1200 × 630 px (ideal for Twitter, LinkedIn, WhatsApp link previews)
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────────────┐
 *  │ ▬▬▬▬▬▬▬▬▬▬▬▬▬▬ gradient top border ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ │
 *  │                                                          │
 *  │  🔥  [streak]  day streak          [avatar]  [name]     │
 *  │                                                          │
 *  │ ─────────────────── divider ─────────────────────────── │
 *  │                                                          │
 *  │  STUDY HISTORY · last 28 days      [commit grid]        │
 *  │                                                          │
 *  │  Openclass_learner                         openclass_learner.app      │
 *  └──────────────────────────────────────────────────────────┘
 */

export interface StreakImageOptions {
  streak: number;
  studyDays: string[];   // YYYY-MM-DD strings (server's last-365 array)
  userName: string;
  avatarUrl?: string;    // loaded cross-origin; falls back to initials circle
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function subtractDays(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

async function loadCrossOriginImage(src: string): Promise<HTMLImageElement> {
  // DiceBear SVG URLs taint the canvas — swap to the PNG endpoint instead
  const pngSrc = src.includes('dicebear.com') && src.includes('/svg?')
    ? src.replace('/svg?', '/png?') + (src.includes('size=') ? '' : '&size=128')
    : src;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('avatar timeout')); }
    }, 5000);
    img.onload = () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(img); } };
    img.onerror = () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('avatar load error')); } };
    img.src = pngSrc;
  });
}

function drawInitialsAvatar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  name: string,
) {
  // Circle fill
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, '#6e45e2');
  grad.addColorStop(1, '#3b0e8c');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // Initial letter
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  ctx.font = `bold ${Math.round(r * 0.9)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, cx, cy + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateStreakImage(opts: StreakImageOptions): Promise<Blob> {
  const W = 600, H = 315;
  const DPR = 2; // retina: actual pixel dimensions 1200×630

  const canvas = document.createElement('canvas');
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);

  // ── 1. Background ──────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d0a1a');
  bg.addColorStop(0.6, '#080810');
  bg.addColorStop(1, '#040408');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Large warm-orange radial glow: centred behind the flame/number area
  const fireGlow = ctx.createRadialGradient(155, 105, 0, 155, 105, 195);
  fireGlow.addColorStop(0,   'hsla(25, 100%, 58%, 0.22)');
  fireGlow.addColorStop(0.45,'hsla(22, 95%,  52%, 0.09)');
  fireGlow.addColorStop(1,   'transparent');
  ctx.fillStyle = fireGlow;
  ctx.fillRect(0, 0, W, H);

  // Subtle top-edge gradient accent line
  const topLine = ctx.createLinearGradient(0, 0, W, 0);
  topLine.addColorStop(0,   'transparent');
  topLine.addColorStop(0.2, 'hsla(22, 100%, 62%, 0.55)');
  topLine.addColorStop(0.5, 'hsla(35, 100%, 65%, 0.70)');
  topLine.addColorStop(0.8, 'hsla(22, 100%, 62%, 0.55)');
  topLine.addColorStop(1,   'transparent');
  ctx.fillStyle = topLine;
  ctx.fillRect(0, 0, W, 2);

  // Card border
  roundRectPath(ctx, 0.5, 0.5, W - 1, H - 1, 16);
  ctx.strokeStyle = 'hsla(22, 80%, 55%, 0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── 2. Flame emoji ─────────────────────────────────────────────────────────
  ctx.font = '62px serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('🔥', 32, 100);

  // ── 3. Streak number ───────────────────────────────────────────────────────
  const numStr = String(opts.streak);
  ctx.font = `bold 82px system-ui, -apple-system, 'Helvetica Neue', sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'hsla(22, 95%, 60%, 0.50)';
  ctx.shadowBlur = 18;
  ctx.fillText(numStr, 104, 96);
  ctx.shadowBlur = 0;

  // ── 4. "day streak" sub-label ──────────────────────────────────────────────
  ctx.font = `600 17px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.textBaseline = 'middle';
  ctx.fillText('day streak', 106, 138);

  // XP / motivation line
  const motivations = [
    opts.streak >= 30 ? '🏆 Legendary learner!' :
    opts.streak >= 14 ? '⚡ On fire!' :
    opts.streak >= 7  ? '🌟 Great consistency!' :
    opts.streak >= 3  ? '💪 Building the habit!' :
                        '🚀 Every day counts!',
  ];
  ctx.font = `500 13px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'hsla(22, 100%, 68%, 0.70)';
  ctx.textBaseline = 'middle';
  ctx.fillText(motivations[0], 106, 162);

  // ── 5. Avatar area ─────────────────────────────────────────────────────────
  const AVX = W - 60, AVY = 100, AVR = 42;

  // Glow halo behind avatar
  const avGlow = ctx.createRadialGradient(AVX, AVY, AVR * 0.4, AVX, AVY, AVR + 22);
  avGlow.addColorStop(0,  'hsla(22, 100%, 60%, 0.28)');
  avGlow.addColorStop(0.5,'hsla(22, 100%, 55%, 0.12)');
  avGlow.addColorStop(1,  'transparent');
  ctx.fillStyle = avGlow;
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR + 22, 0, Math.PI * 2);
  ctx.fill();

  // Avatar image or initials fallback
  if (opts.avatarUrl) {
    try {
      const img = await loadCrossOriginImage(opts.avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(AVX, AVY, AVR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, AVX - AVR, AVY - AVR, AVR * 2, AVR * 2);
      ctx.restore();
    } catch {
      drawInitialsAvatar(ctx, AVX, AVY, AVR, opts.userName);
    }
  } else {
    drawInitialsAvatar(ctx, AVX, AVY, AVR, opts.userName);
  }

  // Glowing ring around avatar
  ctx.beginPath();
  ctx.arc(AVX, AVY, AVR, 0, Math.PI * 2);
  ctx.strokeStyle = 'hsla(22, 95%, 62%, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = 'hsla(22, 100%, 60%, 0.50)';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // User name below avatar
  ctx.font = `600 13px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const displayName = opts.userName.length > 14 ? opts.userName.slice(0, 13) + '…' : opts.userName;
  ctx.fillText(displayName, AVX, AVY + AVR + 10);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // ── 6. Divider ─────────────────────────────────────────────────────────────
  const dividerY = 186;
  const divLine = ctx.createLinearGradient(0, 0, W, 0);
  divLine.addColorStop(0,   'transparent');
  divLine.addColorStop(0.1, 'rgba(255,255,255,0.10)');
  divLine.addColorStop(0.9, 'rgba(255,255,255,0.10)');
  divLine.addColorStop(1,   'transparent');
  ctx.strokeStyle = divLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(28, dividerY);
  ctx.lineTo(W - 28, dividerY);
  ctx.stroke();

  // ── 7. Commit grid — last 28 days ──────────────────────────────────────────
  const GRID_LABEL_Y = 199;
  ctx.font = `600 9.5px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '0.1em';
  ctx.fillText('STUDY HISTORY  ·  LAST 28 DAYS', 32, GRID_LABEL_Y);
  ctx.letterSpacing = '0em';

  const today = todayLocal();
  const studySet = new Set(opts.studyDays);
  const last28: { date: string; studied: boolean }[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = subtractDays(today, i);
    last28.push({ date, studied: studySet.has(date) });
  }

  const COLS = 7, ROWS = 4;
  const DOT = 11, GAP = 4;
  const GRID_X = 32, GRID_Y = 216;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const idx = row * COLS + col;
      const { studied } = last28[idx];
      const x = GRID_X + col * (DOT + GAP);
      const y = GRID_Y + row * (DOT + GAP);

      roundRectPath(ctx, x, y, DOT, DOT, 2.5);

      if (studied) {
        ctx.fillStyle = 'hsl(22, 95%, 55%)';
        ctx.shadowBlur = 7;
        ctx.shadowColor = 'hsla(22, 100%, 55%, 0.65)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.055)';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;

  // Study count badge beside the grid
  const studiedCount = last28.filter((d) => d.studied).length;
  const badgeX = GRID_X + COLS * (DOT + GAP) + 14;
  const badgeCY = GRID_Y + (ROWS * (DOT + GAP) - GAP) / 2;

  ctx.font = `bold 22px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${studiedCount}`, badgeX, badgeCY - 9);

  ctx.font = `500 10px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('days studied', badgeX, badgeCY + 11);

  // ── 8. Footer branding ─────────────────────────────────────────────────────
  const FOOTER_Y = H - 14;

  // Openclass_learner wordmark  
  ctx.font = `700 12px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'hsla(22, 100%, 65%, 0.50)';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Openclass_learner', 32, FOOTER_Y);

  ctx.textAlign = 'right';
  ctx.font = `500 10.5px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillText('openclass_learner.app', W - 32, FOOTER_Y);
  ctx.textAlign = 'left';

  // ── 9. Return as PNG blob ──────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas toBlob failed'));
    }, 'image/png');
  });
}

/** Share via Web Share API (mobile) or download PNG (desktop). */
export async function shareOrDownloadStreak(blob: Blob, streakDays: number): Promise<void> {
  const fileName = `openclass_learner-streak-${streakDays}days.png`;

  if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: 'image/png' })] })) {
    // Native share sheet (iOS Safari, Android Chrome, etc.)
    await navigator.share({
      title: `I'm on a ${streakDays}-day learning streak on Openclass_learner! 🔥`,
      text:  `Check out my ${streakDays}-day study streak on Openclass_learner – the adaptive AI learning platform. #Openclass_learner #StudyStreak`,
      files: [new File([blob], fileName, { type: 'image/png' })],
    });
  } else {
    // Desktop fallback: download the PNG
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}
