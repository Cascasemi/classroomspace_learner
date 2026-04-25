import { useEffect, useRef, useState } from 'react';
import { Eraser, History, Minimize2, PencilLine, RotateCcw } from 'lucide-react';
import { WhiteboardCanvas } from './whiteboard/whiteboard-canvas';
import type { WhiteboardCanvasHandle } from './whiteboard/whiteboard-canvas';
import { WhiteboardHistory } from './whiteboard/whiteboard-history';
import { useWhiteboardHistory } from '@/hooks/use-whiteboard-history';
import type { WhiteboardState } from '@/lib/whiteboard/types';
import './whiteboard/whiteboard.css';

interface WhiteboardProps {
  state: WhiteboardState;
  onClose: () => void;
  agentLabel?: string;
  onStateChange?: (next: WhiteboardState) => void;
  historyScopeKey?: string;
}

function cloneStateElements(state: WhiteboardState): WhiteboardState['elements'] {
  return JSON.parse(JSON.stringify(state.elements)) as WhiteboardState['elements'];
}

export default function Whiteboard({
  state,
  onClose,
  agentLabel,
  onStateChange,
  historyScopeKey,
}: WhiteboardProps) {
  const clearingRef = useRef(false);
  const canvasRef = useRef<WhiteboardCanvasHandle>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewModified, setViewModified] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const { snapshots, push, clear, getAt } = useWhiteboardHistory();

  const elementCount = state.elements.length;

  useEffect(() => {
    clear();
    setHistoryOpen(false);
    setViewModified(false);
  }, [historyScopeKey, clear]);

  const handleClear = async () => {
    if (!onStateChange || elementCount === 0 || clearingRef.current) return;
    clearingRef.current = true;
    push(state.elements);
    setIsClearing(true);

    const animMs = Math.min(380 + elementCount * 55, 1400);
    await new Promise((resolve) => window.setTimeout(resolve, animMs));

    onStateChange({ ...state, isOpen: true, elements: [] });
    setIsClearing(false);
    clearingRef.current = false;
  };

  const handleRestore = (index: number) => {
    if (!onStateChange || isClearing) return;
    const snapshot = getAt(index);
    if (!snapshot) return;

    if (JSON.stringify(state.elements) === JSON.stringify(snapshot.elements)) {
      setHistoryOpen(false);
      return;
    }

    if (state.elements.length > 0) {
      push(state.elements);
    }

    onStateChange({
      ...state,
      isOpen: true,
      elements: JSON.parse(JSON.stringify(snapshot.elements)) as WhiteboardState['elements'],
    });
    setHistoryOpen(false);
  };

  return (
    <div className="ns-whiteboard-shell absolute inset-0 pointer-events-auto bg-white/95 dark:bg-gray-800/95 backdrop-blur-2xl rounded-3xl shadow-[0_32px_80px_-20px_rgba(0,0,0,0.25)] border-2 border-purple-200/60 dark:border-purple-700/60 flex flex-col overflow-hidden z-[120] ring-4 ring-purple-100/40 dark:ring-purple-800/40">
      <div className="h-14 px-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0 bg-white/50 dark:bg-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <PencilLine className="w-4 h-4" />
          </div>
          <span className="font-bold text-gray-800 dark:text-gray-200 tracking-tight">
            {agentLabel ? `${agentLabel} — Whiteboard` : 'Whiteboard'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {viewModified && (
            <button
              type="button"
              onClick={() => canvasRef.current?.resetView()}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
              title="Reset view"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleClear}
            disabled={isClearing || elementCount === 0 || !onStateChange}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Clear whiteboard"
          >
            <div className={isClearing ? 'animate-pulse' : undefined}>
              <Eraser className="w-4 h-4" />
            </div>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              className="relative p-2 text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
              title="Whiteboard history"
            >
              <History className="w-4 h-4" />
              {snapshots.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {snapshots.length}
                </span>
              )}
            </button>

            <WhiteboardHistory
              isOpen={historyOpen}
              onClose={() => setHistoryOpen(false)}
              snapshots={snapshots}
              isClearing={isClearing}
              onRestore={handleRestore}
            />
          </div>

          <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Minimize whiteboard"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#374151_1px,transparent_1px)] [background-size:24px_24px] overflow-hidden">
        <WhiteboardCanvas
          ref={canvasRef}
          elements={cloneStateElements(state)}
          isClearing={isClearing}
          onViewModifiedChange={setViewModified}
          readyText="Whiteboard ready"
          readyHintText="Agents will write or draw here."
        />
      </div>
    </div>
  );
}
