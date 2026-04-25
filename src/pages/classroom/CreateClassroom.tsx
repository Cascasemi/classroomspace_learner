/**
 * ClassroomsPage — Lists all classroom sessions with a "Create" button
 * that opens a modal to create a new custom classroom.
 *
 * Replaces the old CreateClassroom component which showed the form directly.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api, type ClassroomSummary } from '@/lib/api';
import { classroomRuntimeStore } from '@/lib/classroom-runtime/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Plus,
  Sparkles,
  BookOpen,
  Loader2,
  Search,
  Clock,
  Trash2,
  ChevronRight,
  AlertCircle,
  FolderOpen,
  Zap,
  LayoutGrid,
  List,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';

export default function CreateClassroom() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  // Data
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isPremium = user?.subscription === 'premium';
  const freeRemaining = Math.max(0, 3 - (user?.freeClassroomsUsed || 0));

  // ── Load sessions ─────────────────────────────────────────────────────────

  const loadClassrooms = useCallback(async () => {
    try {
      const data = await api.listClassrooms();
      setClassrooms(Array.isArray(data) ? data : []);
    } catch {
      setClassrooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClassrooms();
  }, [loadClassrooms]);

  // ── Delete handler ────────────────────────────────────────────────────────

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(id);
    try {
      await api.deleteClassroom(id);
      classroomRuntimeStore.clearPersisted(id);
      setClassrooms((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  }

  // ── After classroom created ───────────────────────────────────────────────

  function onClassroomCreated(classroomId: string) {
    setShowCreateModal(false);
    refreshUser();
    navigate(`/classroom/${classroomId}`);
  }

  // ── Filtered classrooms ───────────────────────────────────────────────────

  const filtered = classrooms.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customTopic?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalSessions = classrooms.length;
  const readySessions = classrooms.filter((c) => c.status === 'ready').length;
  const generatingSessions = classrooms.filter((c) => c.status === 'generating').length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="p-6 max-w-6xl mx-auto space-y-6 pb-16">
        {/* ── Header row ───────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold mb-1">My Classrooms</h1>
            <p className="text-sm text-muted-foreground">
              All your generated classroom sessions in one place.
            </p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="gap-2 shrink-0"
          >
            <Plus size={16} />
            Create Classroom
            {!isPremium && (
              <span className="ml-1 text-[10px] opacity-80">
                ({freeRemaining} free)
              </span>
            )}
          </Button>
        </div>

        {/* ── Stats strip ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <MiniStat
            icon={<BookOpen size={14} className="text-primary" />}
            label="Total"
            value={totalSessions}
          />
          <MiniStat
            icon={<Sparkles size={14} className="text-green-500" />}
            label="Ready"
            value={readySessions}
          />
          <MiniStat
            icon={<Loader2 size={14} className="text-blue-500" />}
            label="Generating"
            value={generatingSessions}
          />
        </div>

        {/* ── Toolbar: search + view toggle ────────────────────────────── */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search sessions…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center border rounded-lg overflow-hidden h-9 shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'h-full px-2.5 transition-colors',
                viewMode === 'grid'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'h-full px-2.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span className="text-sm">Loading sessions…</span>
            </div>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!loading && filtered.length === 0 && (
          <div className="card-surface rounded-xl p-12 text-center">
            <FolderOpen
              size={36}
              className="mx-auto mb-4 text-muted-foreground/40"
            />
            <p className="text-muted-foreground font-medium mb-1">
              {searchQuery
                ? 'No matching sessions found'
                : 'No classrooms yet'}
            </p>
            <p className="text-sm text-muted-foreground/60 mb-4">
              {searchQuery
                ? 'Try a different search term.'
                : 'Create your first classroom to start learning!'}
            </p>
            {!searchQuery && (
              <Button
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="gap-1.5"
              >
                <Plus size={14} /> Create Classroom
              </Button>
            )}
          </div>
        )}

        {/* ── Session grid / list ──────────────────────────────────────── */}
        {!loading && filtered.length > 0 && (
          viewMode === 'grid' ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((cr) => (
                <SessionCardGrid
                  key={cr.id}
                  classroom={cr}
                  onNavigate={() => navigate(`/classroom/${cr.id}`)}
                  onDelete={(e) => handleDelete(cr.id, e)}
                  isDeleting={deletingId === cr.id}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((cr) => (
                <SessionCardList
                  key={cr.id}
                  classroom={cr}
                  onNavigate={() => navigate(`/classroom/${cr.id}`)}
                  onDelete={(e) => handleDelete(cr.id, e)}
                  isDeleting={deletingId === cr.id}
                />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── Create classroom modal ─────────────────────────────────────── */}
      <CreateClassroomModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreated={onClassroomCreated}
        isPremium={isPremium}
        freeRemaining={freeRemaining}
        defaultGrade={user?.grade || ''}
      />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Session Cards ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

interface SessionCardProps {
  classroom: ClassroomSummary;
  onNavigate: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
}

function SessionCardGrid({ classroom: cr, onNavigate, onDelete, isDeleting }: SessionCardProps) {
  const scenesCompleted = cr.progress?.completedScenes?.length || 0;
  const timeSpent = cr.progress?.totalTimeSpentMs
    ? Math.round(cr.progress.totalTimeSpentMs / 60000)
    : 0;
  const lastAccessed = cr.progress?.lastAccessedAt
    ? formatRelativeTime(cr.progress.lastAccessedAt)
    : cr.updatedAt
      ? formatRelativeTime(cr.updatedAt)
      : null;

  return (
    <div
      className="card-surface rounded-xl overflow-hidden card-hover cursor-pointer group flex flex-col"
      onClick={onNavigate}
    >
      {/* Status banner */}
      <div
        className={cn(
          'h-1.5',
          cr.status === 'ready'
            ? 'bg-gradient-to-r from-green-500/60 to-green-500/20'
            : cr.status === 'generating'
              ? 'bg-gradient-to-r from-blue-500/60 to-blue-500/20'
              : 'bg-gradient-to-r from-red-500/60 to-red-500/20',
        )}
      />

      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{cr.title}</h3>
            {cr.customTopic && (
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                {cr.customTopic}
              </p>
            )}
          </div>
          <StatusBadge status={cr.status} />
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3 mt-auto">
          {cr.status === 'ready' && (
            <>
              <span className="flex items-center gap-1">
                <BookOpen size={10} /> {scenesCompleted} scenes
              </span>
              {timeSpent > 0 && (
                <span className="flex items-center gap-1">
                  <Clock size={10} /> {timeSpent}m
                </span>
              )}
            </>
          )}
          {lastAccessed && <span>{lastAccessed}</span>}
        </div>

        {/* Tags */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {cr.isCustom && (
              <span className="text-[10px] bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full">
                Custom
              </span>
            )}
            {cr.grade && (
              <span className="text-[10px] bg-muted/60 px-2 py-0.5 rounded-full text-muted-foreground">
                {cr.grade}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
              title="Delete"
            >
              {isDeleting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </button>
            <ChevronRight
              size={14}
              className="text-muted-foreground group-hover:text-primary transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionCardList({ classroom: cr, onNavigate, onDelete, isDeleting }: SessionCardProps) {
  const scenesCompleted = cr.progress?.completedScenes?.length || 0;
  const timeSpent = cr.progress?.totalTimeSpentMs
    ? Math.round(cr.progress.totalTimeSpentMs / 60000)
    : 0;

  return (
    <div
      className="card-surface rounded-xl p-4 card-hover cursor-pointer group flex items-center gap-4"
      onClick={onNavigate}
    >
      {/* Icon */}
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
          cr.status === 'ready'
            ? 'bg-green-500/10'
            : cr.status === 'generating'
              ? 'bg-blue-500/10'
              : 'bg-red-500/10',
        )}
      >
        {cr.status === 'generating' ? (
          <Loader2 size={16} className="text-blue-500 animate-spin" />
        ) : cr.status === 'error' ? (
          <AlertCircle size={16} className="text-red-500" />
        ) : (
          <BookOpen size={16} className="text-green-600" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm truncate">{cr.title}</h3>
          {cr.isCustom && (
            <span className="text-[10px] bg-violet-500/10 text-violet-500 px-2 py-0.5 rounded-full shrink-0">
              Custom
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {cr.status === 'generating'
            ? 'Generating…'
            : cr.status === 'error'
              ? 'Generation failed'
              : `${scenesCompleted} scenes completed`}
          {timeSpent > 0 && ` • ${timeSpent}m`}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
          title="Delete"
        >
          {isDeleting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Trash2 size={12} />
          )}
        </button>
        <ChevronRight
          size={14}
          className="text-muted-foreground group-hover:text-primary transition-colors"
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') {
    return (
      <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">
        Ready
      </span>
    );
  }
  if (status === 'generating') {
    return (
      <span className="text-[10px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
        <Loader2 size={8} className="animate-spin" /> Generating
      </span>
    );
  }
  return (
    <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-medium">
      Error
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Create Classroom Modal ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function CreateClassroomModal({
  open,
  onOpenChange,
  onCreated,
  isPremium,
  freeRemaining,
  defaultGrade,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (classroomId: string) => void;
  isPremium: boolean;
  freeRemaining: number;
  defaultGrade: string;
}) {
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState(defaultGrade);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!topic.trim()) return;

    if (!isPremium && freeRemaining <= 0) {
      setError('Free classroom limit reached. Upgrade to Premium for unlimited classrooms.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await api.createCustomClassroom(topic.trim(), grade || undefined);
      onCreated(result.classroomId);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to create classroom',
      );
      setLoading(false);
    }
  }

  const exampleTopics = [
    'Introduction to Photosynthesis',
    'The Water Cycle and Weather Patterns',
    'Basic Algebra: Solving Linear Equations',
    'The American Revolution: Causes and Effects',
    'Introduction to Python Programming',
    'Understanding Fractions and Decimals',
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            Create a Classroom
          </DialogTitle>
          <DialogDescription>
            Enter any topic and our AI will create a personalized, interactive classroom.
            {!isPremium && (
              <span className="block mt-1 text-primary font-medium">
                {freeRemaining} free classroom{freeRemaining !== 1 ? 's' : ''} remaining.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Topic */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Topic
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Describe the topic you want to learn about…"
              rows={3}
              className="w-full bg-muted/10 border border-border/30 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              disabled={loading}
            />
          </div>

          {/* Grade */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Grade Level (optional)
            </label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g., Grade 5, High School, College"
              className="w-full bg-muted/10 border border-border/30 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          {/* Limit warning */}
          {!isPremium && freeRemaining <= 0 && (
            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3 flex items-center gap-2">
              <Zap size={14} />
              Free limit reached. Upgrade to Premium for unlimited classrooms.
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleCreate}
            disabled={!topic.trim() || loading || (!isPremium && freeRemaining <= 0)}
            className="w-full h-11 text-sm gap-2 rounded-xl"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating Classroom…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Classroom
              </>
            )}
          </Button>

          {/* Example topics */}
          <div>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Or try one of these
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {exampleTopics.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  disabled={loading}
                  className="text-left px-3 py-2 rounded-lg border border-border/20 bg-muted/5 hover:bg-muted/10 hover:border-primary/20 transition-all group"
                >
                  <span className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-foreground">
                    <BookOpen className="w-3 h-3 flex-shrink-0" />
                    {t}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Helpers ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="card-surface rounded-xl p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
