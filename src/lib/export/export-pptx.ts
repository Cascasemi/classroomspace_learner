/**
 * PPTX Export — converts a NeuroSpace classroom into a PowerPoint file.
 *
 * Supports rich-text section format (lesson + quiz scenes).
 *
 * Libraries: pptxgenjs (slide builder), file-saver (file download)
 */

import PptxGenJS from 'pptxgenjs';
import { saveAs } from 'file-saver';
import type { ClassroomData, Scene, ContentSection, AgentConfig } from '@/lib/playback/types';

// ==================== Theme ====================
const THEME = {
  bg: '0f1117',          // dark background
  card: '1a1d27',        // slide background
  accent: '3b82f6',      // NeuroSpace blue
  accentAlt: '8b5cf6',   // purple accent
  text: 'e2e8f0',        // primary text
  muted: '94a3b8',       // secondary text
  heading: 'ffffff',     // heading white
  calloutInfo: '0ea5e9',
  calloutWarn: 'f59e0b',
  calloutTip: '10b981',
  calloutSuccess: '22c55e',
  code: '1e293b',
  codeText: '7dd3fc',
} as const;

const FONT = 'Calibri';
const SLIDE_W = 10; // inches
const SLIDE_H = 5.63; // 16:9

// ==================== Helpers ====================

function hexColor(hex: string) {
  return hex.replace('#', '');
}

function addBackground(slide: PptxGenJS.Slide) {
  slide.background = { color: THEME.card };
}

function addAccentLine(slide: PptxGenJS.Slide) {
  slide.addShape('rect', {
    x: 0,
    y: SLIDE_H - 0.08,
    w: SLIDE_W,
    h: 0.08,
    fill: { color: THEME.accent },
    line: { color: THEME.accent },
  });
}

// ==================== Title Slide ====================

function addTitleSlide(pptx: PptxGenJS, classroom: ClassroomData) {
  const slide = pptx.addSlide();
  addBackground(slide);

  // Big accent background block on left
  slide.addShape('rect', {
    x: 0, y: 0, w: 0.18, h: SLIDE_H,
    fill: { color: THEME.accent },
    line: { color: THEME.accent },
  });

  // NeuroSpace logo text
  slide.addText('NeuroSpace', {
    x: 0.4, y: 0.3, w: 4, h: 0.4,
    fontSize: 11,
    color: THEME.accent,
    bold: true,
    fontFace: FONT,
  });

  // Classroom title
  slide.addText(classroom.title, {
    x: 0.4, y: 0.9, w: SLIDE_W - 0.8, h: 1.5,
    fontSize: 32,
    bold: true,
    color: THEME.heading,
    fontFace: FONT,
    wrap: true,
  });

  // Description
  if (classroom.description) {
    slide.addText(classroom.description, {
      x: 0.4, y: 2.5, w: SLIDE_W - 0.8, h: 0.9,
      fontSize: 14,
      color: THEME.muted,
      fontFace: FONT,
      wrap: true,
    });
  }

  // Agent personas
  const agents = classroom.agentConfigs ?? [];
  if (agents.length > 0) {
    const agentText = agents.map((a) => `${a.name} (${a.role})`).join('  •  ');
    slide.addText(`Faculty: ${agentText}`, {
      x: 0.4, y: 4.8, w: SLIDE_W - 0.8, h: 0.4,
      fontSize: 10,
      color: THEME.muted,
      fontFace: FONT,
    });
  }

  addAccentLine(slide);
}

// ==================== Scene Header ====================

function addSceneHeader(
  slide: PptxGenJS.Slide,
  sceneTitle: string,
  sceneNum: number,
  totalScenes: number,
) {
  slide.addShape('rect', {
    x: 0, y: 0, w: SLIDE_W, h: 0.62,
    fill: { color: THEME.bg },
    line: { color: THEME.bg },
  });

  slide.addText(sceneTitle, {
    x: 0.35, y: 0.09, w: SLIDE_W - 1.2, h: 0.44,
    fontSize: 15,
    bold: true,
    color: THEME.heading,
    fontFace: FONT,
  });

  // Scene counter
  slide.addText(`${sceneNum} / ${totalScenes}`, {
    x: SLIDE_W - 1.1, y: 0.09, w: 0.8, h: 0.44,
    fontSize: 9,
    color: THEME.muted,
    fontFace: FONT,
    align: 'right',
  });

  // Thin separator line
  slide.addShape('line', {
    x: 0.35, y: 0.64, w: SLIDE_W - 0.7, h: 0,
    line: { color: THEME.accent + '44', width: 0.5 },
  });
}

// ==================== Content Section Rendering ====================

interface CursorY {
  y: number;
}

const MARGIN_X = 0.35;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;
const CONTENT_Y_START = 0.78;
const LINE_GAP = 0.06;

function addSection(slide: PptxGenJS.Slide, section: ContentSection, cur: CursorY) {
  if (cur.y > SLIDE_H - 0.5) return; // overflow guard

  switch (section.type) {
    case 'heading': {
      const level = section.level ?? 1;
      const size = level === 1 ? 18 : level === 2 ? 15 : 13;
      slide.addText(section.content ?? '', {
        x: MARGIN_X, y: cur.y, w: CONTENT_W, h: 0.42,
        fontSize: size,
        bold: true,
        color: THEME.heading,
        fontFace: FONT,
        wrap: true,
      });
      cur.y += 0.42 + LINE_GAP;
      break;
    }

    case 'text': {
      const lines = Math.ceil((section.content?.length ?? 0) / 90) || 1;
      const h = Math.min(lines * 0.22, 1.2);
      slide.addText(section.content ?? '', {
        x: MARGIN_X, y: cur.y, w: CONTENT_W, h,
        fontSize: 11,
        color: THEME.text,
        fontFace: FONT,
        wrap: true,
      });
      cur.y += h + LINE_GAP;
      break;
    }

    case 'callout': {
      const variantColor: Record<string, string> = {
        info: THEME.calloutInfo,
        warning: THEME.calloutWarn,
        tip: THEME.calloutTip,
        success: THEME.calloutSuccess,
      };
      const color = variantColor[section.variant ?? 'info'];
      const lines = Math.ceil((section.content?.length ?? 0) / 85) || 1;
      const h = Math.min(lines * 0.22 + 0.18, 1.4);

      slide.addShape('rect', {
        x: MARGIN_X, y: cur.y, w: CONTENT_W, h,
        fill: { color: color + '22' },
        line: { color, width: 1.2 },
      });
      slide.addShape('rect', {
        x: MARGIN_X, y: cur.y, w: 0.06, h,
        fill: { color },
        line: { color },
      });
      slide.addText(section.content ?? '', {
        x: MARGIN_X + 0.14, y: cur.y + 0.06, w: CONTENT_W - 0.2, h: h - 0.12,
        fontSize: 10.5,
        color: THEME.text,
        fontFace: FONT,
        wrap: true,
      });
      cur.y += h + LINE_GAP;
      break;
    }

    case 'list': {
      const items = section.items ?? [];
      const h = Math.min(items.length * 0.26, 2.0);
      slide.addText(
        items.map((item) => ({ text: `• ${item}`, options: { breakLine: true } })),
        {
          x: MARGIN_X, y: cur.y, w: CONTENT_W, h,
          fontSize: 10.5,
          color: THEME.text,
          fontFace: FONT,
          wrap: true,
        },
      );
      cur.y += h + LINE_GAP;
      break;
    }

    case 'definition': {
      slide.addText(section.term ?? '', {
        x: MARGIN_X, y: cur.y, w: CONTENT_W, h: 0.28,
        fontSize: 11.5,
        bold: true,
        color: THEME.accentAlt,
        fontFace: FONT,
      });
      cur.y += 0.28;
      const lines = Math.ceil((section.definition?.length ?? 0) / 90) || 1;
      const h = Math.min(lines * 0.22, 1.0);
      slide.addText(section.definition ?? '', {
        x: MARGIN_X + 0.15, y: cur.y, w: CONTENT_W - 0.15, h,
        fontSize: 10.5,
        color: THEME.muted,
        fontFace: FONT,
        wrap: true,
      });
      cur.y += h + LINE_GAP;
      break;
    }

    case 'code': {
      const lines = (section.content ?? '').split('\n').length;
      const h = Math.min(lines * 0.2 + 0.2, 1.8);
      slide.addShape('rect', {
        x: MARGIN_X, y: cur.y, w: CONTENT_W, h,
        fill: { color: THEME.code },
        line: { color: THEME.accent + '55', width: 0.8 },
      });
      slide.addText(section.content ?? '', {
        x: MARGIN_X + 0.12, y: cur.y + 0.08, w: CONTENT_W - 0.24, h: h - 0.16,
        fontSize: 9,
        color: THEME.codeText,
        fontFace: 'Courier New',
        wrap: true,
      });
      cur.y += h + LINE_GAP;
      break;
    }

    case 'formula': {
      slide.addShape('rect', {
        x: MARGIN_X, y: cur.y, w: CONTENT_W, h: 0.44,
        fill: { color: THEME.accentAlt + '18' },
        line: { color: THEME.accentAlt + '66', width: 0.8 },
      });
      slide.addText(section.latex ?? section.content ?? '', {
        x: MARGIN_X + 0.12, y: cur.y + 0.06, w: CONTENT_W - 0.24, h: 0.32,
        fontSize: 12,
        color: THEME.accentAlt,
        fontFace: 'Cambria Math',
        italic: true,
      });
      cur.y += 0.44 + LINE_GAP;
      break;
    }

    default:
      break;
  }
}

// ==================== Lesson Slide ====================

function addLessonSlide(
  pptx: PptxGenJS,
  scene: Scene,
  sceneNum: number,
  totalScenes: number,
) {
  const slide = pptx.addSlide();
  addBackground(slide);
  addSceneHeader(slide, scene.title, sceneNum, totalScenes);

  const sections =
    scene.content.type === 'lesson' ? scene.content.sections : [];

  const cur: CursorY = { y: CONTENT_Y_START };
  for (const section of sections) {
    addSection(slide, section, cur);
  }

  addAccentLine(slide);
}

// ==================== Quiz Slide ====================

function addQuizSlide(
  pptx: PptxGenJS,
  scene: Scene,
  sceneNum: number,
  totalScenes: number,
) {
  const slide = pptx.addSlide();
  addBackground(slide);
  addSceneHeader(slide, `Quiz: ${scene.title}`, sceneNum, totalScenes);

  if (scene.content.type !== 'quiz') return;

  const questions = scene.content.questions;
  const cur: CursorY = { y: CONTENT_Y_START };

  questions.forEach((q, qi) => {
    if (cur.y > SLIDE_H - 0.6) return;

    slide.addText(`Q${qi + 1}. ${q.question}`, {
      x: MARGIN_X, y: cur.y, w: CONTENT_W, h: 0.32,
      fontSize: 11,
      bold: true,
      color: THEME.text,
      fontFace: FONT,
      wrap: true,
    });
    cur.y += 0.34;

    if (q.options) {
      q.options.forEach((opt) => {
        if (cur.y > SLIDE_H - 0.4) return;
        const isCorrect = q.answer?.includes(opt.value);
        slide.addText(`  ${opt.label}. ${opt.value}`, {
          x: MARGIN_X + 0.15, y: cur.y, w: CONTENT_W - 0.15, h: 0.24,
          fontSize: 10,
          color: isCorrect ? THEME.calloutSuccess : THEME.muted,
          fontFace: FONT,
          bold: isCorrect,
        });
        cur.y += 0.24;
      });
    }
    cur.y += LINE_GAP * 2;
  });

  addAccentLine(slide);
}

// ==================== Public Export ====================

/**
 * Build and download a PowerPoint file from a NeuroSpace classroom.
 */
export function exportClassroomToPptx(classroom: ClassroomData): void {
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 inches (16:9)
  pptx.title = classroom.title;
  pptx.subject = 'NeuroSpace Classroom Export';
  pptx.company = 'NeuroSpace';

  const totalScenes = classroom.scenes.length;

  // Title slide
  addTitleSlide(pptx, classroom);

  // One slide per scene
  classroom.scenes.forEach((scene, i) => {
    if (scene.type === 'lesson') {
      addLessonSlide(pptx, scene, i + 1, totalScenes);
    } else {
      addQuizSlide(pptx, scene, i + 1, totalScenes);
    }
  });

  // Download
  const safeName = classroom.title.replace(/[^a-z0-9 ]/gi, '').trim() || 'classroom';
  pptx.writeFile({ fileName: `${safeName}.pptx` });
}
