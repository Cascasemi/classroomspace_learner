import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type {
  WBElement,
  WBTextElement,
  WBShapeElement,
  WBChartElement,
  WBLatexElement,
  WBTableElement,
  WBLineElement,
} from '@/lib/whiteboard/types';
import './whiteboard.css';

const CANVAS_W = 1000;
const CANVAS_H = 562;

const CHART_COLORS = [
  '#3b82f6', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#38bdf8',
  '#4ade80', '#facc15', '#f87171', '#c084fc',
];

export type WhiteboardCanvasHandle = {
  resetView: () => void;
};

interface WhiteboardCanvasProps {
  elements: WBElement[];
  isClearing: boolean;
  onViewModifiedChange?: (modified: boolean) => void;
  readyText?: string;
  readyHintText?: string;
}

function TextEl({ el }: { el: WBTextElement }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        fontSize: el.fontSize ?? 18,
        color: el.color ?? '#111827',
        fontWeight: el.bold ? 'bold' : 'normal',
        fontStyle: el.italic ? 'italic' : 'normal',
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: "'Inter', sans-serif",
        pointerEvents: 'none',
      }}
    >
      {el.content}
    </div>
  );
}

function ShapeEl({ el }: { el: WBShapeElement }) {
  const fill = el.fill ?? 'rgba(59,130,246,0.15)';
  const stroke = el.stroke ?? '#3b82f6';
  const sw = el.strokeWidth ?? 2;

  const svgShape = () => {
    switch (el.shape) {
      case 'circle':
        return (
          <ellipse
            cx={el.width / 2}
            cy={el.height / 2}
            rx={el.width / 2 - sw}
            ry={el.height / 2 - sw}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
          />
        );
      case 'triangle': {
        const pts = `${el.width / 2},${sw} ${el.width - sw},${el.height - sw} ${sw},${el.height - sw}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'diamond': {
        const cx = el.width / 2;
        const cy = el.height / 2;
        const pts = `${cx},${sw} ${el.width - sw},${cy} ${cx},${el.height - sw} ${sw},${cy}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'arrow': {
        const hw = el.height * 0.35;
        const headW = el.width * 0.3;
        const bodyRight = el.width - headW;
        const cy = el.height / 2;
        const pts = `0,${cy - hw / 2} ${bodyRight},${cy - hw / 2} ${bodyRight},${cy - el.height * 0.45} ${el.width},${cy} ${bodyRight},${cy + el.height * 0.45} ${bodyRight},${cy + hw / 2} 0,${cy + hw / 2}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      case 'parallelogram': {
        const offset = Math.min(el.width * 0.18, 28);
        const pts = `${offset},0 ${el.width},0 ${el.width - offset},${el.height} 0,${el.height}`;
        return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      }
      default:
        return (
          <rect
            x={sw / 2}
            y={sw / 2}
            width={el.width - sw}
            height={el.height - sw}
            rx={4}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
          />
        );
    }
  };

  return (
    <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, pointerEvents: 'none' }}>
      <svg width={el.width} height={el.height} overflow="visible">
        {svgShape()}
        {el.label && (
          <text
            x={el.width / 2}
            y={el.height / 2}
            dominantBaseline="middle"
            textAnchor="middle"
            fill={stroke}
            fontSize={14}
            fontFamily="Inter, sans-serif"
          >
            {el.label}
          </text>
        )}
      </svg>
    </div>
  );
}

function ChartEl({ el }: { el: WBChartElement }) {
  const data = el.labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    el.datasets.forEach((ds) => {
      row[ds.label || 'value'] = ds.data[i] ?? 0;
    });
    return row;
  });

  const renderChart = () => {
    // Alias mapping: column → bar, ring → pie
    const effectiveType = el.chartType === 'column' ? 'bar'
      : el.chartType === 'ring' ? 'pie'
      : el.chartType;

    if (effectiveType === 'pie') {
      const flat = el.labels.map((label, i) => ({
        name: label,
        value: el.datasets[0]?.data[i] ?? 0,
      }));
      return (
        <PieChart>
          <Pie data={flat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={Math.min(el.width, el.height) * 0.35}>
            {flat.map((_, idx) => (
              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
        </PieChart>
      );
    }

    if (effectiveType === 'line') {
      return (
        <LineChart data={data}>
          <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
          {el.datasets.map((ds, i) => (
            <Line key={i} type="monotone" dataKey={ds.label || 'value'} stroke={ds.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      );
    }

    if (effectiveType === 'area') {
      return (
        <AreaChart data={data}>
          <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
          <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827', fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
          {el.datasets.map((ds, i) => (
            <Area
              key={i}
              type="monotone"
              dataKey={ds.label || 'value'}
              stroke={ds.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              fill={ds.color ? `${ds.color}33` : `${CHART_COLORS[i % CHART_COLORS.length]}33`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </AreaChart>
      );
    }

    return (
      <BarChart data={data}>
        <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
        <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827', fontSize: 11 }} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} />
        {el.datasets.map((ds, i) => (
          <Bar key={i} dataKey={ds.label || 'value'} fill={ds.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    );
  };

  return (
    <div style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, pointerEvents: 'none' }}>
      {el.title && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
          {el.title}
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        {renderChart()}
      </ResponsiveContainer>
    </div>
  );
}

function LatexEl({ el }: { el: WBLatexElement }) {
  // Derive font-size from explicit override or proportional heuristic
  const fontSize = el.fontSize ?? Math.min(Math.round(el.height * 0.5), 80);

  const html = useMemo(() => {
    try {
      return katex.renderToString(el.latex, {
        throwOnError: false,
        displayMode: true,
        output: 'html',
        trust: false,
      });
    } catch {
      return el.latex;
    }
  }, [el.latex]);

  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        minHeight: el.height,
        color: el.color ?? '#111827',
        fontSize,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function TableEl({ el }: { el: WBTableElement }) {
  const [header, ...rows] = el.data;
  const colCount = header?.length ?? 1;
  const colW = Math.floor((el.width - 2) / colCount);

  return (
    <div
      style={{
        position: 'absolute',
        left: el.x,
        top: el.y,
        width: el.width,
        height: el.height,
        overflow: 'hidden',
        pointerEvents: 'none',
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        border: '1px solid #d1d5db',
        borderRadius: 6,
        background: '#ffffff',
      }}
    >
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        {header && (
          <thead>
            <tr style={{ background: 'rgba(139,92,246,0.12)' }}>
              {header.map((cell, i) => (
                <th
                  key={i}
                  style={{
                    width: colW,
                    padding: '4px 8px',
                    color: '#6d28d9',
                    fontWeight: 600,
                    textAlign: 'left',
                    borderBottom: '1px solid #d1d5db',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fafafa' : '#ffffff' }}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    width: colW,
                    padding: '4px 8px',
                    color: '#111827',
                    borderBottom: '1px solid #f3f4f6',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineEl({ el }: { el: WBLineElement }) {
  const minX = Math.min(el.startX, el.endX);
  const minY = Math.min(el.startY, el.endY);
  const w = Math.abs(el.endX - el.startX) + 20;
  const h = Math.abs(el.endY - el.startY) + 20;
  const ox = 10;
  const oy = 10;
  const sx = el.startX - minX + ox;
  const sy = el.startY - minY + oy;
  const ex = el.endX - minX + ox;
  const ey = el.endY - minY + oy;
  const hasArrow = el.points?.includes('arrow');
  const markerId = `arrow-${el.id}`;

  return (
    <div style={{ position: 'absolute', left: minX - ox, top: minY - oy, width: w, height: h, pointerEvents: 'none' }}>
      <svg width={w} height={h} overflow="visible">
        {hasArrow && (
          <defs>
            <marker id={markerId} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={el.stroke ?? '#374151'} />
            </marker>
          </defs>
        )}
        <line
          x1={sx}
          y1={sy}
          x2={ex}
          y2={ey}
          stroke={el.stroke ?? '#374151'}
          strokeWidth={el.strokeWidth ?? 2}
          markerEnd={hasArrow ? `url(#${markerId})` : undefined}
          strokeDasharray={el.points?.includes('dashed') ? '6 4' : undefined}
        />
      </svg>
    </div>
  );
}

function WhiteboardElement({ el }: { el: WBElement }) {
  switch (el.type) {
    case 'text':
      return <TextEl el={el} />;
    case 'shape':
      return <ShapeEl el={el} />;
    case 'chart':
      return <ChartEl el={el} />;
    case 'latex':
      return <LatexEl el={el} />;
    case 'table':
      return <TableEl el={el} />;
    case 'line':
      return <LineEl el={el} />;
    default:
      return null;
  }
}

function AnimatedElement({
  element,
  index,
  isClearing,
  totalElements,
  shouldAnimateIn,
}: {
  element: WBElement;
  index: number;
  isClearing: boolean;
  totalElements: number;
  shouldAnimateIn: boolean;
}) {
  const clearDelay = isClearing ? (totalElements - 1 - index) * 55 : 0;
  const clearRotate = isClearing ? `${(index % 2 === 0 ? 1 : -1) * (2 + index * 0.4)}deg` : '0deg';
  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: isClearing ? 'none' : undefined,
    animationDelay: isClearing ? `${clearDelay}ms` : shouldAnimateIn ? `${index * 50}ms` : undefined,
    ['--ns-wb-clear-rotate' as string]: clearRotate,
  };

  const className = isClearing
    ? 'ns-wb-element-clearing'
    : shouldAnimateIn
      ? 'ns-wb-element-enter'
      : undefined;

  return (
    <div className={className} style={style}>
      <div style={{ pointerEvents: 'auto' }}>
        <WhiteboardElement el={element} />
      </div>
    </div>
  );
}

export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(
  function WhiteboardCanvas(
    { elements, isClearing, onViewModifiedChange, readyText = 'Whiteboard ready', readyHintText = 'Agents will write or draw here.' },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [viewZoom, setViewZoom] = useState(1);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isPanning, setIsPanning] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const prevElementsLengthRef = useRef(elements.length);
    const resetTimerRef = useRef<number | null>(null);
    const seenIdsRef = useRef<Set<string>>(new Set());

    const canvasWidth = CANVAS_W;
    const canvasHeight = CANVAS_H;
    const isViewModified = viewZoom !== 1 || panX !== 0 || panY !== 0;

    useEffect(() => {
      onViewModifiedChange?.(isViewModified);
    }, [isViewModified, onViewModifiedChange]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      });
      observer.observe(container);
      setContainerSize({ width: container.clientWidth, height: container.clientHeight });
      return () => observer.disconnect();
    }, []);

    const containerScale = useMemo(() => {
      if (containerSize.width === 0 || containerSize.height === 0) return 1;
      return Math.min(containerSize.width / canvasWidth, containerSize.height / canvasHeight);
    }, [containerSize.width, containerSize.height, canvasWidth, canvasHeight]);

    const clampPan = useCallback(
      (x: number, y: number, zoom: number) => {
        const totalScale = containerScale * zoom;
        const maxPanX = canvasWidth / 2 + containerSize.width / (2 * totalScale);
        const maxPanY = canvasHeight / 2 + containerSize.height / (2 * totalScale);
        return {
          x: Math.max(-maxPanX, Math.min(maxPanX, x)),
          y: Math.max(-maxPanY, Math.min(maxPanY, y)),
        };
      },
      [canvasWidth, canvasHeight, containerSize.width, containerSize.height, containerScale],
    );

    const resetView = useCallback((animate: boolean) => {
      setIsPanning(false);
      setIsResetting(animate);
      setViewZoom(1);
      setPanX(0);
      setPanY(0);

      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }

      if (!animate) return;

      resetTimerRef.current = window.setTimeout(() => {
        setIsResetting(false);
        resetTimerRef.current = null;
      }, 250);
    }, []);

    useImperativeHandle(ref, () => ({ resetView: () => resetView(true) }), [resetView]);

    useEffect(() => {
      return () => {
        if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      };
    }, []);

    useEffect(() => {
      const prevLength = prevElementsLengthRef.current;
      const nextLength = elements.length;
      prevElementsLengthRef.current = nextLength;

      const clearedBoard = prevLength > 0 && nextLength === 0;
      const firstContentLoaded = prevLength === 0 && nextLength > 0;
      if (!clearedBoard && !firstContentLoaded) return;

      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) resetView(false);
      });
      return () => {
        cancelled = true;
      };
    }, [elements.length, resetView]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, [panX, panY]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const effectiveScale = Math.max(containerScale * viewZoom, 0.001);
      const nextPanX = panStartRef.current.panX + dx / effectiveScale;
      const nextPanY = panStartRef.current.panY + dy / effectiveScale;
      const clamped = clampPan(nextPanX, nextPanY, viewZoom);
      setPanX(clamped.x);
      setPanY(clamped.y);
    }, [clampPan, containerScale, isPanning, viewZoom]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
      setIsPanning(false);
    }, []);

    useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (elements.length === 0) return;
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

        setViewZoom((prevZoom) => {
          const newZoom = Math.min(5, Math.max(0.2, prevZoom * zoomFactor));
          const rect = el.getBoundingClientRect();
          const cursorX = e.clientX - rect.left;
          const cursorY = e.clientY - rect.top;
          const oldScale = containerScale * prevZoom;
          const newScale = containerScale * newZoom;
          const scaleDiff = 1 / newScale - 1 / oldScale;

          setPanX((prev) => {
            const candidate = prev + (cursorX - containerSize.width / 2) * scaleDiff;
            const maxPX = canvasWidth / 2 + containerSize.width / (2 * newScale);
            return Math.max(-maxPX, Math.min(maxPX, candidate));
          });

          setPanY((prev) => {
            const candidate = prev + (cursorY - containerSize.height / 2) * scaleDiff;
            const maxPY = canvasHeight / 2 + containerSize.height / (2 * newScale);
            return Math.max(-maxPY, Math.min(maxPY, candidate));
          });

          return newZoom;
        });
      };

      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }, [elements.length, canvasHeight, canvasWidth, containerScale, containerSize.height, containerSize.width]);

    const handleDoubleClick = useCallback((e?: React.MouseEvent) => {
      e?.preventDefault();
      resetView(true);
    }, [resetView]);

    const totalScale = containerScale * viewZoom;
    const canvasScreenX = (containerSize.width - canvasWidth * totalScale) / 2 + panX * totalScale;
    const canvasScreenY = (containerSize.height - canvasHeight * totalScale) / 2 + panY * totalScale;
    const canvasTransform = `translate(${canvasScreenX}px, ${canvasScreenY}px) scale(${totalScale})`;

    const newlyAdded = new Set<string>();
    for (const element of elements) {
      if (!seenIdsRef.current.has(element.id)) newlyAdded.add(element.id);
    }

    useEffect(() => {
      const next = new Set<string>();
      for (const element of elements) next.add(element.id);
      seenIdsRef.current = next;
    }, [elements]);

    return (
      <div ref={containerRef} className="w-full h-full overflow-hidden">
        <div
          ref={viewportRef}
          className="w-full h-full relative select-none"
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
        >
          <div
            className="absolute bg-white shadow-2xl rounded-lg border border-gray-200"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              left: 0,
              top: 0,
              transform: canvasTransform,
              transformOrigin: '0 0',
              transition: isResetting ? 'transform 0.25s ease-out' : undefined,
            }}
          >
            {elements.length === 0 && !isClearing && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <p className="text-lg font-medium">{readyText}</p>
                  <p className="text-sm mt-1">{readyHintText}</p>
                </div>
              </div>
            )}

            <div className="absolute inset-0">
              {elements.map((element, index) => (
                <AnimatedElement
                  key={element.id}
                  element={element}
                  index={index}
                  isClearing={isClearing}
                  totalElements={elements.length}
                  shouldAnimateIn={newlyAdded.has(element.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
