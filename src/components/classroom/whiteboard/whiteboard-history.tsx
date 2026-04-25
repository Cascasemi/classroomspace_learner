import { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { WhiteboardSnapshot } from '@/hooks/use-whiteboard-history';
import './whiteboard.css';

interface WhiteboardHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: WhiteboardSnapshot[];
  isClearing: boolean;
  onRestore: (index: number) => void;
}

export function WhiteboardHistory({
  isOpen,
  onClose,
  snapshots,
  isClearing,
  onRestore,
}: WhiteboardHistoryProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={panelRef}
      className="ns-whiteboard-history absolute right-0 top-full mt-2 z-[130] w-72 max-h-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Whiteboard history</span>
        <span className="text-xs text-gray-400">{snapshots.length > 0 ? `${snapshots.length}` : ''}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {snapshots.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            No history yet
          </div>
        ) : (
          <div className="py-1">
            {[...snapshots].reverse().map((snap, reverseIdx) => {
              const realIdx = snapshots.length - 1 - reverseIdx;
              return (
                <div
                  key={`${snap.timestamp}-${realIdx}`}
                  className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                      {`#${realIdx + 1}`}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {formatTime(snap.timestamp)} · {snap.elements.length} element(s)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(realIdx)}
                    disabled={isClearing}
                    className="ml-2 px-2 py-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
