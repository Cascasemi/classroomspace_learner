/**
 * Whiteboard Reducer
 *
 * Pure function: applies a WBAction to the current WhiteboardState and returns
 * the next state. Keeps all mutation logic in one place so both the
 * ClassroomPage and any future server-side preview can share it.
 */

import type {
  WhiteboardState,
  WBAction,
  WBElement,
  WBTextElement,
  WBShapeElement,
  WBChartElement,
  WBLatexElement,
  WBTableElement,
  WBLineElement,
  WBShapeKind,
} from './types';

// Re-export so consumers can import everything from one path
export { createEmptyWhiteboard } from './types';

// ==================== Helpers ====================

function resolveId(params?: Record<string, unknown>): string {
  return (params?.elementId as string) || crypto.randomUUID();
}

// ==================== Reducer ====================

export function applyWBAction(state: WhiteboardState, action: WBAction): WhiteboardState {
  switch (action.name) {
    case 'wb_open':
      return { ...state, isOpen: true };

    case 'wb_close':
      return { ...state, isOpen: false };

    case 'wb_clear':
      return { ...state, isOpen: true, elements: [] };

    case 'wb_delete': {
      const targetId = action.params?.elementId as string | undefined;
      if (!targetId) return state;
      return {
        ...state,
        elements: state.elements.filter((el) => el.id !== targetId),
      };
    }

    case 'wb_draw_text': {
      const p = action.params ?? {};
      const el: WBTextElement = {
        id: resolveId(p as Record<string, unknown>),
        type: 'text',
        content: String(p.content ?? ''),
        x: Number(p.x ?? 50),
        y: Number(p.y ?? 50),
        width: p.width != null ? Number(p.width) : undefined,
        height: p.height != null ? Number(p.height) : undefined,
        fontSize: p.fontSize != null ? Number(p.fontSize) : 18,
        color: (p.color as string) ?? '#f1f5f9',
        bold: Boolean(p.bold),
        italic: Boolean(p.italic),
      };
      return { ...state, isOpen: true, elements: addOrReplace(state.elements, el) };
    }

    case 'wb_draw_shape': {
      const p = action.params ?? {};
      const el: WBShapeElement = {
        id: resolveId(p as Record<string, unknown>),
        type: 'shape',
        shape: ((p.shape ?? p.type ?? 'rectangle') as WBShapeKind),
        x: Number(p.x ?? 50),
        y: Number(p.y ?? 50),
        width: Number(p.width ?? 120),
        height: Number(p.height ?? 80),
        fill: (p.fill as string) ?? 'rgba(59,130,246,0.15)',
        stroke: (p.stroke as string) ?? '#3b82f6',
        strokeWidth: p.strokeWidth != null ? Number(p.strokeWidth) : 2,
        label: p.label as string | undefined,
      };
      return { ...state, isOpen: true, elements: addOrReplace(state.elements, el) };
    }

    case 'wb_draw_chart': {
      const p = action.params ?? {};
      // Accept flat arrays or nested datasets
      const rawData = p.data as Record<string, unknown> | undefined;
      const labels: string[] =
        (Array.isArray(p.labels) ? p.labels : rawData?.labels ?? []) as string[];
      const datasets = Array.isArray(p.datasets)
        ? (p.datasets as { label: string; data: number[]; color?: string }[])
        : rawData?.datasets
          ? (rawData.datasets as { label: string; data: number[]; color?: string }[])
          : [{ label: '', data: (rawData?.values ?? []) as number[] }];

      const el: WBChartElement = {
        id: resolveId(p as Record<string, unknown>),
        type: 'chart',
        chartType: ((p.chartType ?? p.type ?? 'bar') as WBChartElement['chartType']),
        labels,
        datasets,
        x: Number(p.x ?? 50),
        y: Number(p.y ?? 50),
        width: Number(p.width ?? 400),
        height: Number(p.height ?? 250),
        title: p.title as string | undefined,
      };
      return { ...state, isOpen: true, elements: addOrReplace(state.elements, el) };
    }

    case 'wb_draw_latex': {
      const p = action.params ?? {};
      const el: WBLatexElement = {
        id: resolveId(p as Record<string, unknown>),
        type: 'latex',
        latex: String(p.latex ?? ''),
        x: Number(p.x ?? 50),
        y: Number(p.y ?? 50),
        height: Number(p.height ?? 80),
        color: (p.color as string) ?? '#f1f5f9',
      };
      return { ...state, isOpen: true, elements: addOrReplace(state.elements, el) };
    }

    case 'wb_draw_table': {
      const p = action.params ?? {};
      const el: WBTableElement = {
        id: resolveId(p as Record<string, unknown>),
        type: 'table',
        data: (p.data as string[][]) ?? [['Header']],
        x: Number(p.x ?? 50),
        y: Number(p.y ?? 50),
        width: Number(p.width ?? 400),
        height: Number(p.height ?? 180),
      };
      return { ...state, isOpen: true, elements: addOrReplace(state.elements, el) };
    }

    case 'wb_draw_line': {
      const p = action.params ?? {};
      const pts = Array.isArray(p.points) ? (p.points as string[]) : [];
      const el: WBLineElement = {
        id: resolveId(p as Record<string, unknown>),
        type: 'line',
        startX: Number(p.startX ?? p.x1 ?? 50),
        startY: Number(p.startY ?? p.y1 ?? 50),
        endX: Number(p.endX ?? p.x2 ?? 200),
        endY: Number(p.endY ?? p.y2 ?? 200),
        stroke: (p.stroke as string) ?? '#94a3b8',
        strokeWidth: p.strokeWidth != null ? Number(p.strokeWidth) : 2,
        points: pts.length > 0 ? pts : undefined,
      };
      return { ...state, isOpen: true, elements: addOrReplace(state.elements, el) };
    }

    default:
      return state;
  }
}

/** Replace existing element with same id, or append */
function addOrReplace(elements: WBElement[], newEl: WBElement): WBElement[] {
  const idx = elements.findIndex((e) => e.id === newEl.id);
  if (idx >= 0) {
    const copy = [...elements];
    copy[idx] = newEl;
    return copy;
  }
  return [...elements, newEl];
}

/** Apply an ordered list of actions to a starting state */
export function replayWBActions(
  initial: WhiteboardState,
  actions: WBAction[],
): WhiteboardState {
  return actions.reduce((st, action) => applyWBAction(st, action), initial);
}
