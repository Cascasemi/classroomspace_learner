import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, type CatalogueEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  CheckCircle2,
  Loader2,
  Bot,
  ChevronDown,
  Image as ImageIcon,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LLMEntry extends CatalogueEntry {
  tier: string;
  requiresPremium: boolean;
}

interface ProviderGroup {
  provider: string;
  displayName: string;
  logo: string | null;
  models: LLMEntry[];
  hasFree: boolean;
}

// ── Provider logo resolver ────────────────────────────────────────────────────

const PROVIDER_LOGOS: Record<string, string> = {
  gemini:     '/logos/gemini.svg',
  google:     '/logos/gemini.svg',
  openai:     '/logos/openai.svg',
  anthropic:  '/logos/claude.svg',
  deepseek:   '/logos/deepseek.svg',
  groq:       '/logos/groq.svg',
  grok:       '/logos/grok.svg',
  xai:        '/logos/grok.svg',
  qwen:       '/logos/qwen.svg',
  dashscope:  '/logos/qwen.svg',
  glm:        '/logos/glm.svg',
  zhipu:      '/logos/glm.svg',
  doubao:     '/logos/doubao.svg',
  volcengine: '/logos/doubao.svg',
  kimi:       '/logos/kimi.png',
  moonshot:   '/logos/kimi.png',
  minimax:    '/logos/minimax.svg',
  azure:      '/logos/azure.svg',
  siliconflow:'/logos/siliconflow.svg',
  elevenlabs: '/logos/elevenlabs.svg',
  browser:    '/logos/browser.svg',
};

function getProviderLogo(provider: string): string | null {
  return PROVIDER_LOGOS[provider.toLowerCase()] ?? null;
}

const PROVIDER_NAMES: Record<string, string> = {
  gemini:    'Google Gemini',
  openai:    'OpenAI',
  anthropic: 'Anthropic (Claude)',
  deepseek:  'DeepSeek',
  groq:      'Groq',
  grok:      'xAI (Grok)',
  qwen:      'Alibaba (Qwen)',
  glm:       'Zhipu (GLM)',
  doubao:    'Volcengine (Doubao)',
  kimi:      'Moonshot (Kimi)',
  minimax:   'MiniMax',
  azure:     'Azure OpenAI',
  siliconflow:'SiliconFlow',
};

function getProviderName(provider: string): string {
  return PROVIDER_NAMES[provider.toLowerCase()] ?? provider;
}

// ── Group LLMs by provider ───────────────────────────────────────────────────

function groupByProvider(models: LLMEntry[]): ProviderGroup[] {
  const map = new Map<string, LLMEntry[]>();
  for (const m of models) {
    const key = m.provider.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }

  return Array.from(map.entries()).map(([provider, groupModels]) => ({
    provider,
    displayName: getProviderName(provider),
    logo: getProviderLogo(provider),
    models: groupModels,
    hasFree: groupModels.some((m) => m.tier === 'free'),
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const isPremium = user?.subscription === 'premium';

  // LLM state
  const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('gemini-2.5-flash');
  const [savingModel, setSavingModel] = useState<string | null>(null);
  const [savedModel, setSavedModel] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Media catalogues
  const [imageModels, setImageModels] = useState<CatalogueEntry[]>([]);
  const [videoModels, setVideoModels] = useState<CatalogueEntry[]>([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCatalogues();
  }, []);

  async function loadCatalogues() {
    try {
      const [catData, modelsData] = await Promise.all([
        api.getSettingsCatalogues(),
        api.getAvailableModels(),
      ]);

      setProviderGroups(groupByProvider(catData.llm as LLMEntry[]));
      setCurrentModel(modelsData.currentModel);
      setImageModels(catData.image);
      setVideoModels(catData.video);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function selectModel(modelId: string) {
    if (modelId === currentModel) return;
    setSavingModel(modelId);
    try {
      const { user: updatedUser } = await api.updateSettings({ preferredModel: modelId });
      setCurrentModel(modelId);
      setSavedModel(modelId);
      updateUser(updatedUser);
      setTimeout(() => setSavedModel(null), 2500);
    } catch (err) {
      console.error('Failed to update model:', err);
    } finally {
      setSavingModel(null);
    }
  }

  // Which provider owns the currently selected model?
  const activeProvider = providerGroups.find((g) =>
    g.models.some((m) => m.id === currentModel),
  )?.provider ?? null;

  return (
    <div className="flex-1">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* ── Account ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account</h2>
          <div className="bg-card border border-border/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium text-foreground">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span
                className={cn(
                  'text-xs font-semibold px-2.5 py-0.5 rounded-full',
                  isPremium
                    ? 'bg-primary/15 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {isPremium ? '⭐ Premium' : 'Free'}
              </span>
            </div>
            {!isPremium && (
              <div className="pt-2 border-t border-border/20">
                <p className="text-xs text-muted-foreground">
                  Upgrade to Premium to unlock advanced AI models, unlimited classrooms and more.
                </p>
                <Button size="sm" className="mt-2 gap-1.5 h-8">
                  <Sparkles className="w-3.5 h-3.5" />
                  Upgrade to Premium
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* ── AI Model selector (grouped by provider) ─────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AI Model
            </h2>
            {!isPremium && (
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Premium feature
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {isPremium
              ? 'Choose the AI model used to power your classrooms and tutor. All models run on Openclass_learner servers — no API key needed.'
              : 'Free accounts use Gemini Flash — a fast and capable model. Upgrade to Premium to choose a different model.'}
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {providerGroups.map((group) => {
                const isActive = activeProvider === group.provider;
                const isExpanded = expandedProvider === group.provider;
                const allPremium = !group.hasFree;
                const isSelectable = isPremium || group.hasFree;
                const activeModelInGroup = group.models.find((m) => m.id === currentModel);

                return (
                  <div
                    key={group.provider}
                    className={cn(
                      'rounded-xl border transition-all overflow-hidden',
                      isActive
                        ? 'border-primary/50 bg-primary/5 shadow-sm'
                        : 'border-border/30 bg-card',
                      !isSelectable && 'opacity-50',
                    )}
                  >
                    {/* Provider header — click to expand */}
                    <button
                      onClick={() => setExpandedProvider(isExpanded ? null : group.provider)}
                      className={cn(
                        'w-full text-left p-4 flex items-center justify-between transition-colors',
                        isSelectable && !isActive && 'hover:bg-muted/20',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                            isActive ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/60',
                          )}
                        >
                          {group.logo ? (
                            <img
                              src={group.logo}
                              alt={group.displayName}
                              className="w-5 h-5 object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <Bot className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{group.displayName}</span>
                            {group.hasFree && (
                              <span className="text-[9px] bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded-full font-medium">
                                FREE
                              </span>
                            )}
                            {allPremium && (
                              <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                PREMIUM
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {activeModelInGroup
                              ? `Using ${activeModelInGroup.label}`
                              : `${group.models.length} model${group.models.length > 1 ? 's' : ''} available`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isActive && (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                        )}
                        <ChevronDown
                          size={16}
                          className={cn(
                            'text-muted-foreground transition-transform',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </div>
                    </button>

                    {/* Expanded model list */}
                    {isExpanded && (
                      <div className="border-t border-border/20 px-4 pb-3 pt-1 space-y-1">
                        {group.models.map((model) => {
                          const isModelActive = currentModel === model.id;
                          const modelSelectable = isPremium || model.tier === 'free';
                          const isSaving = savingModel === model.id;
                          const isJustSaved = savedModel === model.id;

                          return (
                            <button
                              key={model.id}
                              onClick={() => modelSelectable ? selectModel(model.id) : undefined}
                              disabled={!modelSelectable || isSaving}
                              className={cn(
                                'w-full text-left rounded-lg px-3 py-2.5 transition-all flex items-center justify-between',
                                isModelActive
                                  ? 'bg-primary/10'
                                  : 'hover:bg-muted/30',
                                !modelSelectable && 'opacity-40 cursor-not-allowed',
                              )}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{model.label}</span>
                                  {model.tier === 'free' && (
                                    <span className="text-[9px] bg-green-500/15 text-green-500 px-1.5 py-0.5 rounded-full font-medium">
                                      FREE
                                    </span>
                                  )}
                                  {!model.available && (
                                    <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                                      COMING SOON
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                              </div>

                              {isSaving ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                              ) : isJustSaved ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                              ) : isModelActive ? (
                                <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
                              ) : (
                                <div className="w-2.5 h-2.5 rounded-full border-2 border-border/50 shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Image Generation ────────────────────────────────────────── */}
        {imageModels.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ImageIcon size={12} />
              Image Generation
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI models available for generating images in your classrooms and lessons.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {imageModels.map((model) => {
                const logo = getProviderLogo(model.provider);
                return (
                  <div
                    key={model.id}
                    className={cn(
                      'rounded-xl border p-4 transition-all',
                      model.available
                        ? 'border-border/30 bg-card'
                        : 'border-border/20 bg-card/50 opacity-60',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                        {logo ? (
                          <img
                            src={logo}
                            alt={model.provider}
                            className="w-5 h-5 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{model.label}</span>
                          {!model.available && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium shrink-0">
                              COMING SOON
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Video Generation ────────────────────────────────────────── */}
        {videoModels.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Video size={12} />
              Video Generation
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              AI models available for generating videos from text prompts.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {videoModels.map((model) => {
                const logo = getProviderLogo(model.provider);
                return (
                  <div
                    key={model.id}
                    className={cn(
                      'rounded-xl border p-4 transition-all',
                      model.available
                        ? 'border-border/30 bg-card'
                        : 'border-border/20 bg-card/50 opacity-60',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                        {logo ? (
                          <img
                            src={logo}
                            alt={model.provider}
                            className="w-5 h-5 object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Video className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{model.label}</span>
                          {!model.available && (
                            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium shrink-0">
                              COMING SOON
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── About ───────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">About</h2>
          <div className="bg-card border border-border/30 rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">App</span>
              <span className="text-sm font-medium text-foreground">Openclass Learner</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Version</span>
              <span className="text-sm text-muted-foreground">1.0.0</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}