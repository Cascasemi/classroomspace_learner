/**
 * ProfilePage — View and edit user profile, pick a DiceBear avatar.
 *
 * Shows user info (name, email, school, grade, programme), account details,
 * and a rich avatar picker with multiple DiceBear style categories.
 */
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, type User } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  Save,
  Loader2,
  CheckCircle2,
  User as UserIcon,
  Mail,
  School,
  GraduationCap,
  BookOpen,
  Calendar,
  Sparkles,
  Palette,
  Camera,
  Shield,
  Crown,
} from 'lucide-react';

// ── DiceBear avatar configuration ─────────────────────────────────────────────

/**
 * Each category uses a different DiceBear style.
 * We generate 7 deterministic seeds per category for variety.
 */
const DICEBEAR_CATEGORIES = [
  {
    id: 'adventurer',
    label: 'Adventurer',
    description: 'Illustrated character portraits',
    style: 'adventurer',
  },
  {
    id: 'avataaars',
    label: 'Avataaars',
    description: 'Cartoon‑style avatars',
    style: 'avataaars',
  },
  {
    id: 'bottts',
    label: 'Robots',
    description: 'Friendly robot faces',
    style: 'bottts',
  },
  {
    id: 'fun-emoji',
    label: 'Fun Emoji',
    description: 'Playful emoji characters',
    style: 'fun-emoji',
  },
  {
    id: 'lorelei',
    label: 'Lorelei',
    description: 'Soft, artistic portraits',
    style: 'lorelei',
  },
  {
    id: 'notionists',
    label: 'Notionists',
    description: 'Minimal line-art faces',
    style: 'notionists',
  },
  {
    id: 'pixel-art',
    label: 'Pixel Art',
    description: 'Retro pixel characters',
    style: 'pixel-art',
  },
  {
    id: 'thumbs',
    label: 'Thumbs',
    description: 'Abstract thumbprint faces',
    style: 'thumbs',
  },
] as const;

const SEEDS = ['felix', 'aneka', 'leon', 'zara', 'kai', 'maya', 'robin'];

function dicebearUrl(style: string, seed: string) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, updateUser, refreshUser } = useAuth();
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState(user?.preferredName ?? '');
  const [school, setSchool] = useState(user?.school ?? '');
  const [grade, setGrade] = useState(user?.grade ?? '');
  const [programme, setProgramme] = useState(user?.programOfStudy ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(DICEBEAR_CATEGORIES[0].id);

  // Keep form in sync if user object refreshes
  useEffect(() => {
    if (user) {
      setName(user.preferredName ?? '');
      setSchool(user.school ?? '');
      setGrade(user.grade ?? '');
      setProgramme(user.programOfStudy ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
  }, [user]);

  // Current avatar display URL (selected or fallback)
  const displayAvatar = avatarUrl || dicebearUrl('adventurer', user?.email ?? 'default');

  // Memoize avatar grid for active category
  const avatarsForCategory = useMemo(() => {
    const cat = DICEBEAR_CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return [];
    return SEEDS.map((seed) => ({
      seed,
      url: dicebearUrl(cat.style, seed),
    }));
  }, [activeCategory]);

  // ── Save handler ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const updates: Partial<User> = {
        preferredName: name.trim() || undefined,
        school: school.trim() || undefined,
        grade: grade.trim() || undefined,
        programOfStudy: programme.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
      };
      const res = await api.updateProfile(updates);
      updateUser(res.user);
      setSaved(true);
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      console.error('Profile save error:', err);
      toast({ title: 'Save failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isPremium = user?.subscription === 'premium';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {/* Current avatar */}
        <div className="relative group">
          <div className="w-20 h-20 rounded-2xl border-2 border-primary/20 overflow-hidden bg-primary/5 flex items-center justify-center">
            <img
              src={displayAvatar}
              alt="Profile avatar"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = dicebearUrl('adventurer', 'fallback'); }}
            />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Camera size={12} className="text-primary-foreground" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{user?.preferredName || 'Your Profile'}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {isPremium ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-full">
                <Crown size={10} /> Premium
              </span>
            ) : (
              <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                Free Plan
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              <Calendar size={10} className="inline mr-0.5 -mt-px" />Member since {memberSince}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Avatar Picker ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
          <Palette size={18} className="text-primary" /> Choose Your Avatar
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Pick a style category, then select the avatar you like best.
        </p>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 mb-5">
          {DICEBEAR_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Category description */}
        <p className="text-xs text-muted-foreground mb-3 italic">
          {DICEBEAR_CATEGORIES.find((c) => c.id === activeCategory)?.description}
        </p>

        {/* Avatar grid */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
          {avatarsForCategory.map(({ seed, url }) => {
            const isSelected = avatarUrl === url;
            return (
              <button
                key={seed}
                onClick={() => setAvatarUrl(url)}
                className={cn(
                  'relative aspect-square rounded-xl border-2 overflow-hidden transition-all duration-200 hover:scale-105 bg-card',
                  isSelected
                    ? 'border-primary ring-2 ring-primary/30 shadow-md'
                    : 'border-border/50 hover:border-primary/40',
                )}
              >
                <img
                  src={url}
                  alt={`Avatar ${seed}`}
                  className="w-full h-full object-cover p-1.5"
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <CheckCircle2 size={12} className="text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* ── Personal Information ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
          <UserIcon size={18} className="text-primary" /> Personal Information
        </h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {/* Preferred name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <UserIcon size={12} /> Display Name
            </Label>
            <Input
              id="profile-name"
              placeholder="Your preferred name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Mail size={12} /> Email
            </Label>
            <Input
              value={user?.email ?? ''}
              disabled
              className="h-10 opacity-60"
            />
            <p className="text-[10px] text-muted-foreground">Email cannot be changed.</p>
          </div>

          {/* School */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-school" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <School size={12} /> School
            </Label>
            <Input
              id="profile-school"
              placeholder="Your school or institution"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Grade */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-grade" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <GraduationCap size={12} /> Grade
            </Label>
            <Input
              id="profile-grade"
              placeholder="e.g. JHS 2, SHS 1"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Program of Study */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="profile-programme" className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BookOpen size={12} /> Programme of Study
            </Label>
            <Input
              id="profile-programme"
              placeholder="e.g. General Science, Visual Arts, Business"
              value={programme}
              onChange={(e) => setProgramme(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
      </section>

      <Separator />

      {/* ── Account Info ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
          <Shield size={18} className="text-primary" /> Account
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <InfoCard label="Account Type" value={user?.accountType === 'parent' ? 'Parent' : 'Student'} icon={<UserIcon size={14} className="text-primary" />} />
          <InfoCard label="Subscription" value={isPremium ? 'Premium' : 'Free'} icon={<Sparkles size={14} className="text-primary" />} />
          <InfoCard label="Classrooms Used" value={`${user?.freeClassroomsUsed ?? 0} / ${isPremium ? '∞' : '3'}`} icon={<BookOpen size={14} className="text-primary" />} />
          <InfoCard label="Member Since" value={memberSince} icon={<Calendar size={14} className="text-primary" />} />
        </div>
      </section>

      {/* ── Save button ────────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="min-w-[140px]"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" /> Saving…
            </>
          ) : saved ? (
            <>
              <CheckCircle2 size={16} className="mr-2" /> Saved!
            </>
          ) : (
            <>
              <Save size={16} className="mr-2" /> Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card-surface rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}