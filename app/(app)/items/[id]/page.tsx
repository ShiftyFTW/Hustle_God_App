'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Zap,
  Check,
  X,
  RefreshCw,
  RotateCcw,
  Copy,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Camera,
  ShieldCheck,
  FileText,
  Upload,
  Pencil,
  Save,
  Info,
  DollarSign,
  Tag,
  BarChart2,
  Trash2,
} from 'lucide-react';
import { supabase, getAuthToken } from '@/lib/supabase';
import {
  SneakerItem,
  SneakerImage,
  AiIdentification,
  ConditionAssessment,
  ConditionGrade,
  CompResearch,
  ListingContent,
  PlatformListing,
  ItemType,
  STATUS_LABELS,
  STATUS_COLORS,
  CONDITION_LABELS,
  ITEM_TYPE_LABELS,
  Platform,
  PLATFORM_LABELS,
  PLATFORM_STATUS_COLORS,
} from '@/lib/types';
import { cn, safeExternalUrl } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize-html';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ImageUploader from '@/components/items/ImageUploader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab =
  | 'identification'
  | 'condition'
  | 'comps'
  | 'pricing'
  | 'listings'
  | 'photos'
  | 'publish';

type StepId =
  | 'upload'
  | 'detect'
  | 'identify'
  | 'verify'
  | 'condition'
  | 'comps'
  | 'listings'
  | 'complete';

type StepStatus = 'pending' | 'running' | 'done' | 'failed';

interface PipelineStep {
  id: StepId;
  label: string;
  status: StepStatus;
  error?: string;
}

const STEP_DEFS: { id: StepId; label: string }[] = [
  { id: 'upload',    label: 'Upload received'   },
  { id: 'detect',    label: 'Detecting item'    },
  { id: 'identify',  label: 'Identifying item'  },
  { id: 'verify',    label: 'Verifying details' },
  { id: 'condition', label: 'Checking condition'},
  { id: 'comps',     label: 'Researching comps' },
  { id: 'listings',  label: 'Writing listings'  },
  { id: 'complete',  label: 'Ready for review'  },
];

function freshSteps(): PipelineStep[] {
  return STEP_DEFS.map((s) => ({ ...s, status: 'pending' }));
}

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'identification', label: 'Identification', icon: ShieldCheck },
  { id: 'condition',      label: 'Condition',       icon: Camera },
  { id: 'comps',          label: 'Comps',           icon: BarChart2 },
  { id: 'pricing',        label: 'Pricing',         icon: DollarSign },
  { id: 'listings',       label: 'Listings',        icon: FileText },
  { id: 'photos',         label: 'Photos',          icon: Upload },
  { id: 'publish',        label: 'Publish',         icon: Tag },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS as Record<string, string>;
  const labels = STATUS_LABELS as Record<string, string>;
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium', colors[status] || 'bg-secondary text-muted-foreground')}>
      {labels[status] || status}
    </span>
  );
}

function EmptySection({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary border border-border flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/60 mt-1">{hint ?? 'Click Analyze Item above to run the full pipeline'}</p>
    </div>
  );
}

// ─── Pipeline progress strip ─────────────────────────────────────────────────

function PipelineProgress({
  steps,
  phase,
  onRetryFailed,
  onRetryAll,
}: {
  steps: PipelineStep[];
  phase: 'running' | 'failed' | 'done';
  onRetryFailed: () => void;
  onRetryAll: () => void;
}) {
  const failedStep = steps.find((s) => s.status === 'failed');

  return (
    <div className={cn(
      'border rounded-xl p-4 mb-6',
      phase === 'failed'  ? 'bg-red-950/20 border-red-500/30' :
      phase === 'done'    ? 'bg-emerald-950/20 border-emerald-500/30' :
                            'bg-primary/5 border-primary/20'
    )}>
      {/* Step strip */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {steps.map((step, i) => (
          <span key={step.id} className="flex items-center gap-1">
            <span className={cn(
              'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
              step.status === 'running' && 'bg-primary/20 text-primary font-medium',
              step.status === 'done'    && 'bg-emerald-900/50 text-emerald-400',
              step.status === 'failed'  && 'bg-red-900/50 text-red-400 font-medium',
              step.status === 'pending' && 'text-muted-foreground/50',
            )}>
              {step.status === 'running' && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
              {step.status === 'done'    && <Check className="w-2.5 h-2.5" />}
              {step.status === 'failed'  && <X className="w-2.5 h-2.5" />}
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            )}
          </span>
        ))}
      </div>

      {phase === 'running' && (
        <p className="text-xs text-muted-foreground">Do not close this tab — analysis takes 30–60 seconds.</p>
      )}

      {phase === 'failed' && failedStep && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-red-400">{failedStep.label} failed</p>
            {failedStep.error && <p className="text-xs text-red-400/70 mt-0.5">{failedStep.error}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onRetryFailed} className="h-7 text-xs gap-1.5 border-red-500/30 hover:border-red-500/60">
              <RefreshCw className="w-3 h-3" /> Retry Failed Step
            </Button>
            <Button size="sm" variant="ghost" onClick={onRetryAll} className="h-7 text-xs gap-1.5">
              <RotateCcw className="w-3 h-3" /> Restart
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Analysis complete — all tabs updated with results
        </p>
      )}
    </div>
  );
}

// ─── Category-aware field maps ────────────────────────────────────────────────

type FieldDef = { key: string; label: string; mono?: boolean };

const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  sneaker: [
    { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' },
    { key: 'nickname', label: 'Colorway' }, { key: 'style_code', label: 'Style Code', mono: true },
    { key: 'upc', label: 'UPC', mono: true }, { key: 'size', label: 'Size' },
    { key: 'color', label: 'Color' }, { key: 'gender', label: 'Gender' },
    { key: 'materials', label: 'Materials' }, { key: 'production_dates', label: 'Release Year' },
    { key: 'authenticity_notes', label: 'Auth Notes' },
  ],
  clothing: [
    { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
    { key: 'size', label: 'Size' }, { key: 'color', label: 'Color' },
    { key: 'materials', label: 'Material' }, { key: 'measurements', label: 'Measurements' },
    { key: 'gender', label: 'Gender' }, { key: 'production_dates', label: 'Era' },
    { key: 'authenticity_notes', label: 'Notes' },
  ],
  electronics: [
    { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
    { key: 'model', label: 'Model' }, { key: 'model_number', label: 'Model Number', mono: true },
    { key: 'serial_number', label: 'Serial Number', mono: true }, { key: 'color', label: 'Color' },
    { key: 'testing_status', label: 'Testing Status' },
    { key: 'included_accessories', label: 'Included' }, { key: 'missing_accessories', label: 'Missing' },
    { key: 'authenticity_notes', label: 'Notes' },
  ],
  tool: [
    { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
    { key: 'model_number', label: 'Model Number', mono: true },
    { key: 'serial_number', label: 'Serial Number', mono: true },
    { key: 'measurements', label: 'Voltage / Specs' }, { key: 'testing_status', label: 'Testing Status' },
    { key: 'included_accessories', label: 'Included' }, { key: 'missing_accessories', label: 'Missing' },
  ],
  watch: [
    { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
    { key: 'model', label: 'Collection' }, { key: 'model_number', label: 'Reference No.', mono: true },
    { key: 'serial_number', label: 'Serial Number', mono: true },
    { key: 'color', label: 'Dial Color' }, { key: 'materials', label: 'Case / Bracelet' },
    { key: 'measurements', label: 'Case Size' }, { key: 'production_dates', label: 'Year' },
    { key: 'authenticity_notes', label: 'Auth Notes' },
    { key: 'included_accessories', label: 'Included' },
  ],
  jewelry: [
    { key: 'brand', label: 'Brand / Designer' }, { key: 'product_name', label: 'Description' },
    { key: 'color', label: 'Metal Color' }, { key: 'materials', label: 'Metal / Stones' },
    { key: 'measurements', label: 'Measurements' }, { key: 'authenticity_notes', label: 'Hallmarks / Auth' },
    { key: 'included_accessories', label: 'Included' },
  ],
  collectible: [
    { key: 'brand', label: 'Manufacturer' }, { key: 'product_name', label: 'Item Name' },
    { key: 'model', label: 'Series / Set' }, { key: 'model_number', label: 'Issue / Card No.', mono: true },
    { key: 'serial_number', label: 'Serial / Edition', mono: true },
    { key: 'production_dates', label: 'Year' }, { key: 'authenticity_notes', label: 'Auth / Grade' },
    { key: 'included_accessories', label: 'Included' },
  ],
  toy: [
    { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
    { key: 'model_number', label: 'Item Number', mono: true }, { key: 'color', label: 'Color' },
    { key: 'production_dates', label: 'Year' },
    { key: 'included_accessories', label: 'Included' }, { key: 'missing_accessories', label: 'Missing' },
  ],
  appliance: [
    { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
    { key: 'model', label: 'Model' }, { key: 'model_number', label: 'Model Number', mono: true },
    { key: 'serial_number', label: 'Serial Number', mono: true }, { key: 'color', label: 'Color' },
    { key: 'testing_status', label: 'Testing Status' },
    { key: 'included_accessories', label: 'Included' }, { key: 'missing_accessories', label: 'Missing' },
  ],
};

// Default fields for home_good, auto_part, motorcycle_part, book_media, sporting_good, general_unknown
const DEFAULT_FIELDS: FieldDef[] = [
  { key: 'brand', label: 'Brand' }, { key: 'product_name', label: 'Product Name' },
  { key: 'model', label: 'Model' }, { key: 'model_number', label: 'Model Number', mono: true },
  { key: 'serial_number', label: 'Serial Number', mono: true }, { key: 'color', label: 'Color' },
  { key: 'materials', label: 'Material' }, { key: 'measurements', label: 'Dimensions' },
  { key: 'testing_status', label: 'Testing Status' },
  { key: 'included_accessories', label: 'Included' }, { key: 'missing_accessories', label: 'Missing' },
  { key: 'authenticity_notes', label: 'Notes' },
];

function getFields(itemType: string): FieldDef[] {
  return CATEGORY_FIELDS[itemType] || DEFAULT_FIELDS;
}

// ─── Identification section ───────────────────────────────────────────────────

function IdentificationSection({
  item,
  identification,
  itemId,
  onRefresh,
  onIdentificationChanged,
}: {
  item: SneakerItem;
  identification: AiIdentification | null;
  itemId: string;
  onRefresh: () => void;
  onIdentificationChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const itemType = item.item_type || 'general_unknown';

  const blankForm = () => ({
    brand: item.brand || '',
    model: item.model || '',
    product_name: item.product_name || '',
    model_number: item.model_number || '',
    serial_number: item.serial_number || '',
    nickname: item.nickname || '',
    style_code: item.style_code || '',
    upc: item.upc || '',
    size: item.size || '',
    color: item.color || '',
    measurements: item.measurements || '',
    gender: item.gender || '',
    category: item.category || '',
    materials: identification?.materials || '',
    production_dates: identification?.production_dates || '',
    included_accessories: identification?.included_accessories || '',
    missing_accessories: identification?.missing_accessories || '',
    testing_status: identification?.testing_status || '',
    authenticity_notes: identification?.authenticity_notes || '',
    verified: identification?.verified ?? false,
  });

  const [form, setForm] = useState(blankForm);
  useEffect(() => { setForm(blankForm()); }, [item, identification]);

  async function save() {
    setSaving(true);
    const previousForm = blankForm();

    // Detect if any identification-critical fields changed
    const idFields = ['brand', 'model', 'product_name', 'model_number', 'serial_number',
      'nickname', 'style_code', 'upc', 'size', 'color', 'measurements', 'gender',
      'category', 'materials', 'production_dates', 'included_accessories',
      'missing_accessories', 'testing_status', 'authenticity_notes'] as const;
    const anyIdFieldChanged = idFields.some((k) => form[k] !== previousForm[k]);

    // Recalculate missing_info: any field that's still empty is "missing"
    const allFields: [string, string][] = [
      ['brand', form.brand], ['model', form.model], ['product_name', form.product_name],
      ['model_number', form.model_number], ['serial_number', form.serial_number],
      ['nickname', form.nickname], ['style_code', form.style_code], ['upc', form.upc],
      ['size', form.size], ['color', form.color], ['measurements', form.measurements],
      ['gender', form.gender], ['category', form.category],
    ];
    const missingInfo = allFields.filter(([, v]) => !v.trim()).map(([k]) => k);
    const filledCount = allFields.length - missingInfo.length;
    const newConfidence = Math.round((filledCount / allFields.length) * 100);

    await supabase.from('sneaker_items').update({
      brand: form.brand || null, model: form.model || null,
      product_name: form.product_name || null, model_number: form.model_number || null,
      serial_number: form.serial_number || null, nickname: form.nickname || null,
      style_code: form.style_code || null, upc: form.upc || null,
      size: form.size || null, color: form.color || null,
      measurements: form.measurements || null, gender: form.gender || null,
      category: form.category || null,
    }).eq('id', itemId);
    if (identification) {
      await supabase.from('ai_identification').update({
        brand: form.brand || null, model: form.model || null,
        product_name: form.product_name || null, model_number: form.model_number || null,
        serial_number: form.serial_number || null, nickname: form.nickname || null,
        style_code: form.style_code || null, upc: form.upc || null,
        size: form.size || null, color: form.color || null,
        measurements: form.measurements || null, gender: form.gender || null,
        category: form.category || null, materials: form.materials || null,
        production_dates: form.production_dates || null,
        included_accessories: form.included_accessories || null,
        missing_accessories: form.missing_accessories || null,
        testing_status: form.testing_status || null,
        authenticity_notes: form.authenticity_notes || null,
        verified: form.verified,
        missing_info: missingInfo,
        confidence_score: Math.max(newConfidence, identification.confidence_score),
      }).eq('item_id', itemId);
    }
    setSaving(false);
    setEditing(false);
    await onRefresh();
    if (anyIdFieldChanged) {
      await onIdentificationChanged();
    }
  }

  const fi = (label: string, key: keyof typeof form, mono = false) => (
    <div key={label}>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Input
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={cn('h-8 text-sm', mono && 'font-mono')}
      />
    </div>
  );

  const fields = getFields(itemType);
  const confidence = identification?.confidence_score;

  // Value resolver: check sneaker_items first, then ai_identification
  const resolve = (key: string): string | undefined => {
    const itemVal = (item as unknown as Record<string, unknown>)[key];
    if (itemVal) return String(itemVal);
    const idVal = (identification as unknown as Record<string, unknown> | null)?.[key];
    if (idVal) return String(idVal);
    return undefined;
  };

  if (!identification && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Identification</p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Add Manually
          </Button>
        </div>
        <EmptySection icon={ShieldCheck} title="No identification data yet" hint="Click Analyze Item or add manually" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Identification</p>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7 gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1.5">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>

      {!editing && identification && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Confidence</p>
              {identification.verified && (
                <span className="flex items-center gap-1 text-[10px] bg-emerald-900/50 text-emerald-300 px-1.5 py-0.5 rounded font-medium">
                  <Check className="w-2.5 h-2.5" /> Verified
                </span>
              )}
              {identification.category_confidence > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Category: {identification.category_confidence}%
                </span>
              )}
            </div>
            <span className={cn('text-xl font-bold',
              (confidence ?? 0) >= 90 ? 'text-emerald-400' :
              (confidence ?? 0) >= 70 ? 'text-amber-400' : 'text-red-400'
            )}>{confidence ?? 0}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div className={cn('h-2 rounded-full transition-all',
              (confidence ?? 0) >= 90 ? 'bg-emerald-500' :
              (confidence ?? 0) >= 70 ? 'bg-amber-500' : 'bg-red-500'
            )} style={{ width: `${confidence ?? 0}%` }} />
          </div>
          {(confidence ?? 100) < 90 && identification.missing_info?.length > 0 && (
            <p className="text-xs text-amber-400 mt-2">Missing: {identification.missing_info.join(', ')}</p>
          )}
        </div>
      )}

      {editing ? (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {fields.map((f) => fi(f.label, f.key as keyof typeof form, f.mono))}
          </div>
          {/* Visible flaws */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Visible Flaws (one per line)</label>
            <Textarea
              value={(identification?.visible_flaws || []).join('\n')}
              onChange={() => {}}
              className="text-sm min-h-[60px]"
              placeholder="Note visible flaws…"
              readOnly
            />
          </div>
          <div className="flex items-center gap-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">Manually verified</span>
            <button
              type="button"
              onClick={() => setForm({ ...form, verified: !form.verified })}
              className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                form.verified ? 'bg-emerald-500' : 'bg-secondary border border-border'
              )}
            >
              <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                form.verified ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {fields.map((f) => (
              <div key={f.key}>
                <p className="text-xs text-muted-foreground mb-0.5">{f.label}</p>
                <p className={cn('text-sm text-foreground', f.mono && 'font-mono')}>
                  {resolve(f.key) || <span className="text-muted-foreground/50">—</span>}
                </p>
              </div>
            ))}
          </div>
          {(identification?.visible_flaws?.length ?? 0) > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Visible Flaws</p>
              <ul className="space-y-1">
                {identification!.visible_flaws!.map((f, i) => (
                  <li key={i} className="text-xs text-amber-400 flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0 mt-1.5" />{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Condition section ────────────────────────────────────────────────────────

const WEAR_OPTIONS = ['none', 'light', 'moderate', 'heavy'] as const;
const SURFACE_OPTIONS = ['none', 'minor', 'moderate', 'significant'] as const;

function ConditionSection({
  assessment,
  itemId,
  itemType,
  onRefresh,
  onConditionGradeChanged,
}: {
  assessment: ConditionAssessment | null;
  itemId: string;
  itemType: string;
  onRefresh: () => void;
  onConditionGradeChanged: (newGrade: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reassessing, setReassessing] = useState(false);
  const [form, setForm] = useState({
    grade: assessment?.grade || '',
    outsole_wear: assessment?.outsole_wear || '',
    heel_drag: assessment?.heel_drag || '',
    toe_box_creasing: assessment?.toe_box_creasing || '',
    scuffs: assessment?.scuffs || '',
    stains: assessment?.stains || '',
    yellowing: assessment?.yellowing || '',
    lace_condition: assessment?.lace_condition || '',
    box_condition: assessment?.box_condition || '',
    missing_insoles: assessment?.missing_insoles ?? false,
    sole_separation: assessment?.sole_separation ?? false,
    odor_risk: assessment?.odor_risk ?? false,
    detailed_notes: assessment?.detailed_notes || '',
  });

  useEffect(() => {
    if (assessment) setForm({
      grade: assessment.grade || '', outsole_wear: assessment.outsole_wear || '',
      heel_drag: assessment.heel_drag || '', toe_box_creasing: assessment.toe_box_creasing || '',
      scuffs: assessment.scuffs || '', stains: assessment.stains || '',
      yellowing: assessment.yellowing || '', lace_condition: assessment.lace_condition || '',
      box_condition: assessment.box_condition || '',
      missing_insoles: assessment.missing_insoles ?? false,
      sole_separation: assessment.sole_separation ?? false,
      odor_risk: assessment.odor_risk ?? false,
      detailed_notes: assessment.detailed_notes || '',
    });
  }, [assessment]);

  async function save() {
    setSaving(true);
    const previousGrade = assessment?.grade || '';
    const gradeChanged = form.grade && form.grade !== previousGrade;

    const payload = {
      grade: (form.grade || null) as ConditionGrade | null,
      outsole_wear: form.outsole_wear || null, heel_drag: form.heel_drag || null,
      toe_box_creasing: form.toe_box_creasing || null, scuffs: form.scuffs || null,
      stains: form.stains || null, yellowing: form.yellowing || null,
      lace_condition: form.lace_condition || null, box_condition: form.box_condition || null,
      missing_insoles: form.missing_insoles, sole_separation: form.sole_separation,
      odor_risk: form.odor_risk, detailed_notes: form.detailed_notes || null,
    };
    if (assessment) {
      await supabase.from('condition_assessment').update(payload).eq('item_id', itemId);
    } else {
      await supabase.from('condition_assessment').insert({ item_id: itemId, photo_feedback: [], ...payload });
    }
    if (form.grade) {
      await supabase.from('sneaker_items').update({ condition_grade: form.grade as ConditionGrade }).eq('id', itemId);
    }
    setSaving(false);
    setEditing(false);
    onRefresh();

    if (gradeChanged && form.grade) {
      setReassessing(true);
      await onConditionGradeChanged(form.grade);
      setReassessing(false);
    }
  }

  const BoolToggle = ({ label, field }: { label: string; field: 'missing_insoles' | 'sole_separation' | 'odor_risk' }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-foreground">{label}</span>
      <button type="button" onClick={() => setForm({ ...form, [field]: !form[field] })}
        className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          form[field] ? 'bg-red-500' : 'bg-secondary border border-border'
        )}
      >
        <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          form[field] ? 'translate-x-4' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  );

  const isSneaker = itemType === 'sneaker';

  if (!assessment && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Condition</p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Add Manually
          </Button>
        </div>
        <EmptySection icon={Camera} title="No condition assessment yet" hint="Click Analyze Item or add manually" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Condition</p>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7 gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1.5">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>

      {reassessing && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Re-analyzing affected data</p>
            <p className="text-xs text-muted-foreground">
              Updating pricing and listings to reflect the corrected condition…
            </p>
          </div>
        </div>
      )}

      {editing ? (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <label className="text-xs text-muted-foreground block mb-2">Condition Grade</label>
            <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select grade…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isSneaker && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sneaker-Specific Wear</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  ['Outsole Wear', 'outsole_wear', WEAR_OPTIONS],
                  ['Heel Drag', 'heel_drag', WEAR_OPTIONS],
                  ['Toe Creasing', 'toe_box_creasing', WEAR_OPTIONS],
                  ['Lace Condition', 'lace_condition', ['original','replaced','dirty','missing']],
                  ['Box Condition', 'box_condition', ['excellent','good','fair','damaged','not_present']],
                ] as [string, keyof typeof form, readonly string[]][]).map(([label, field, opts]) => (
                  <div key={field as string}>
                    <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                    <Select value={form[field] as string} onValueChange={(v) => setForm({ ...form, [field]: v })}>
                      <SelectTrigger className="h-8 text-sm capitalize"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {opts.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Surface Condition</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(['scuffs', 'stains', 'yellowing'] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs text-muted-foreground block mb-1 capitalize">{field}</label>
                  <Select value={form[field]} onValueChange={(v) => setForm({ ...form, [field]: v })}>
                    <SelectTrigger className="h-8 text-sm capitalize"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {SURFACE_OPTIONS.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Issue Flags</p>
            <BoolToggle label="Missing Insoles / Parts" field="missing_insoles" />
            <BoolToggle label="Structural Separation" field="sole_separation" />
            <BoolToggle label="Odor Risk" field="odor_risk" />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <label className="text-xs text-muted-foreground block mb-2">Condition Notes (shown in listings)</label>
            <Textarea value={form.detailed_notes} onChange={(e) => setForm({ ...form, detailed_notes: e.target.value })}
              className="text-sm min-h-[100px]" placeholder="Describe condition honestly for buyers…" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Condition Grade</p>
            <span className="text-lg font-bold text-foreground">
              {assessment?.grade ? CONDITION_LABELS[assessment.grade] : '—'}
            </span>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              {([
                ['Scuffs', assessment?.scuffs],
                ['Stains', assessment?.stains],
                ['Yellowing', assessment?.yellowing],
                ...(isSneaker ? [
                  ['Outsole Wear', assessment?.outsole_wear],
                  ['Heel Drag', assessment?.heel_drag],
                  ['Toe Creasing', assessment?.toe_box_creasing],
                  ['Lace Condition', assessment?.lace_condition],
                  ['Box Condition', assessment?.box_condition],
                ] : []),
              ] as [string, string | null | undefined][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm text-foreground mt-0.5 capitalize">{value || '—'}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 grid grid-cols-3 gap-4">
              {([
                ['Missing Parts', assessment?.missing_insoles],
                ['Structural Issue', assessment?.sole_separation],
                ['Odor Risk', assessment?.odor_risk],
              ] as [string, boolean | undefined][]).map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn('text-sm font-semibold mt-0.5', value ? 'text-red-400' : 'text-emerald-400')}>
                    {value ? 'Yes' : 'No'}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {assessment?.detailed_notes && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted-foreground mb-2">Condition Notes</p>
              <p className="text-sm text-foreground leading-relaxed">{assessment.detailed_notes}</p>
            </div>
          )}
          {(assessment?.photo_feedback?.length ?? 0) > 0 && (
            <div className="bg-blue-950/20 border border-blue-500/30 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-300 mb-2 flex items-center gap-1.5">
                <Info className="w-4 h-4" /> Photo Suggestions
              </p>
              <ul className="space-y-1">
                {assessment?.photo_feedback?.map((f, i) => (
                  <li key={i} className="text-xs text-blue-400 flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0 mt-1.5" />{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Comps section ────────────────────────────────────────────────────────────

function CompsSection({ comps, onRerun }: { comps: CompResearch | null; onRerun?: () => Promise<void> }) {
  const rawComps = comps as CompResearch & {
    not_worth_listing?: boolean;
    disposition_recommendation?: string;
    pricing_notes?: string;
    market_summary?: string;
    raw_response?: { pricing_notes?: string; market_summary?: string };
  };

  if (!comps || (!comps.sold_listings?.length && !comps.active_listings?.length && !rawComps?.not_worth_listing)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Comps</p>
          {onRerun && (
            <Button variant="outline" size="sm" onClick={onRerun} className="h-7 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Re-run Comps
            </Button>
          )}
        </div>
        <EmptySection icon={BarChart2} title="No comp data yet" hint="Click Re-run Comps or Analyze Item" />
      </div>
    );
  }

  const pricingNotes = rawComps?.raw_response?.pricing_notes || rawComps?.pricing_notes;
  const marketSummary = rawComps?.raw_response?.market_summary || rawComps?.market_summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Comps</p>
        {onRerun && (
          <Button variant="outline" size="sm" onClick={onRerun} className="h-7 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Re-run Comps
          </Button>
        )}
      </div>
      {rawComps?.not_worth_listing && rawComps.disposition_recommendation && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-300 flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4" /> May not be worth listing online
          </p>
          <p className="text-xs text-amber-400">Recommendation: {rawComps.disposition_recommendation}</p>
        </div>
      )}
      {pricingNotes && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pricing Notes</p>
          <p className="text-sm text-foreground leading-relaxed">{pricingNotes}</p>
        </div>
      )}
      {marketSummary && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Market Summary</p>
          <p className="text-sm text-foreground leading-relaxed">{marketSummary}</p>
        </div>
      )}
      {comps.sold_listings?.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <p className="text-sm font-semibold text-foreground">Sold / Completed</p>
          </div>
          <div className="divide-y divide-border">
            {comps.sold_listings.map((l, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{l.platform}{l.date ? ` · ${l.date}` : ''}</p>
                </div>
                <p className="text-sm font-semibold text-emerald-400 shrink-0">${l.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {comps.active_listings?.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <p className="text-sm font-semibold text-foreground">Active Asking Prices</p>
            <span className="text-xs text-muted-foreground">(not sold)</span>
          </div>
          <div className="divide-y divide-border">
            {comps.active_listings.map((l, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{l.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{l.platform}{l.condition ? ` · ${l.condition}` : ''}</p>
                </div>
                <p className="text-sm font-semibold text-amber-400 shrink-0">${l.price}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pricing section ──────────────────────────────────────────────────────────

function PricingSection({
  item, comps, itemId, onRefresh,
}: {
  item: SneakerItem; comps: CompResearch | null; itemId: string; onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    list_price: item.list_price?.toString() || '',
    accept_offer_floor: item.accept_offer_floor?.toString() || '',
    do_not_sell_below: item.do_not_sell_below?.toString() || '',
    local_cash_price: item.local_cash_price?.toString() || '',
  });
  useEffect(() => {
    setForm({
      list_price: item.list_price?.toString() || '',
      accept_offer_floor: item.accept_offer_floor?.toString() || '',
      do_not_sell_below: item.do_not_sell_below?.toString() || '',
      local_cash_price: item.local_cash_price?.toString() || '',
    });
  }, [item]);

  async function save() {
    setSaving(true);
    await supabase.from('sneaker_items').update({
      list_price: form.list_price ? parseFloat(form.list_price) : null,
      accept_offer_floor: form.accept_offer_floor ? parseFloat(form.accept_offer_floor) : null,
      do_not_sell_below: form.do_not_sell_below ? parseFloat(form.do_not_sell_below) : null,
      local_cash_price: form.local_cash_price ? parseFloat(form.local_cash_price) : null,
    }).eq('id', itemId);
    setSaving(false); setEditing(false); onRefresh();
  }

  const priceInput = (label: string, key: keyof typeof form) => (
    <div key={key}>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input type="number" value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="h-8 text-sm pl-6" placeholder="0" />
      </div>
    </div>
  );

  if (!comps && !item.list_price && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Pricing</p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Set Prices
          </Button>
        </div>
        <EmptySection icon={DollarSign} title="No pricing data yet" hint="Click Analyze Item or set prices manually" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Pricing</p>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} className="h-7 gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1.5">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Prices</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {priceInput('List Price', 'list_price')}
              {priceInput('Offer Floor', 'accept_offer_floor')}
              {priceInput('Do Not Sell Below', 'do_not_sell_below')}
              {priceInput('Local Cash Price', 'local_cash_price')}
            </div>
          </div>
          {comps && (
            <div className="bg-secondary/30 border border-border rounded-xl p-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI Recommendations (reference)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Recommended', value: comps.recommended_price },
                  { label: 'Fast Sale',   value: comps.fast_sale_price },
                  { label: 'Offer Floor', value: comps.accept_offer_floor },
                  { label: 'Local Cash',  value: comps.local_cash_price },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-foreground">{value ? `$${value.toFixed(0)}` : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">List Price</p>
            <p className="text-4xl font-bold text-foreground">
              {item.list_price ? `$${item.list_price.toFixed(0)}` : comps?.recommended_price ? `$${comps.recommended_price.toFixed(0)}` : '—'}
            </p>
            {comps?.expected_sell_days && (
              <p className="text-xs text-muted-foreground mt-2">Expected sell time: ~{comps.expected_sell_days} days</p>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Offer Floor',       value: item.accept_offer_floor  || comps?.accept_offer_floor,  color: 'text-amber-400' },
              { label: 'Do Not Sell Below', value: item.do_not_sell_below   || comps?.do_not_sell_below,   color: 'text-red-400' },
              { label: 'Fast Sale',         value: comps?.fast_sale_price,                                 color: 'text-blue-400' },
              { label: 'Local Cash',        value: item.local_cash_price    || comps?.local_cash_price,    color: 'text-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                <p className={cn('text-lg font-bold', color)}>{value ? `$${value.toFixed(0)}` : '—'}</p>
              </div>
            ))}
          </div>
          {(comps as CompResearch & { platform_strategy?: string })?.platform_strategy && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Platform Strategy</p>
              <p className="text-sm text-foreground leading-relaxed">
                {(comps as CompResearch & { platform_strategy?: string }).platform_strategy}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Listings section ─────────────────────────────────────────────────────────

function ListingsSection({
  item, listing, itemId, onRefresh,
}: {
  item: SneakerItem; listing: ListingContent | null; itemId: string; onRefresh: () => void;
}) {
  const [activePlatform, setActivePlatform] = useState<'ebay' | 'facebook' | 'mercari' | 'offerup'>('ebay');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const blankForm = () => ({
    ebay_title: listing?.ebay_title || '',
    facebook_title: listing?.facebook_title || '',
    mercari_title: listing?.mercari_title || '',
    offerup_title: listing?.offerup_title || '',
    ebay_description: listing?.ebay_description || '',
    facebook_description: listing?.facebook_description || '',
    mercari_description: listing?.mercari_description || '',
    offerup_description: listing?.offerup_description || '',
    item_specifics: listing?.item_specifics
      ? Object.entries(listing.item_specifics).map(([k, v]) => ({ k, v }))
      : [] as { k: string; v: string }[],
    keyword_bank: listing?.keyword_bank?.join(', ') || '',
    hashtags: listing?.hashtags?.join(' ') || '',
    platform_strategy: listing?.platform_strategy || '',
  });
  const [form, setForm] = useState(blankForm);
  useEffect(() => { setForm(blankForm()); }, [listing]);

  async function save() {
    setSaving(true);
    const specifics: Record<string, string> = {};
    form.item_specifics.forEach(({ k, v }) => { if (k.trim()) specifics[k.trim()] = v; });
    const payload = {
      item_id: itemId,
      ebay_title: form.ebay_title || null, facebook_title: form.facebook_title || null,
      mercari_title: form.mercari_title || null, offerup_title: form.offerup_title || null,
      ebay_description: form.ebay_description || null,
      facebook_description: form.facebook_description || null,
      mercari_description: form.mercari_description || null,
      offerup_description: form.offerup_description || null,
      item_specifics: specifics,
      keyword_bank: form.keyword_bank ? form.keyword_bank.split(',').map((s) => s.trim()).filter(Boolean) : [],
      hashtags: form.hashtags ? form.hashtags.split(' ').map((s) => s.trim()).filter(Boolean) : [],
      platform_strategy: form.platform_strategy || null,
    };
    if (listing) {
      await supabase.from('listing_content').update(payload).eq('item_id', itemId);
    } else {
      await supabase.from('listing_content').insert({ ...payload, photo_feedback: [] });
    }
    setSaving(false); setEditing(false); onRefresh();
  }

  const platforms = [
    { id: 'ebay' as const, label: 'eBay' }, { id: 'facebook' as const, label: 'Facebook' },
    { id: 'mercari' as const, label: 'Mercari' }, { id: 'offerup' as const, label: 'OfferUp' },
  ];

  const PlatformTabs = () => (
    <div className="flex gap-1 bg-secondary/50 border border-border rounded-lg p-1 w-fit">
      {platforms.map(({ id, label }) => (
        <button key={id} onClick={() => setActivePlatform(id)}
          className={cn('px-4 py-1.5 rounded text-sm font-medium transition-colors',
            activePlatform === id ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'
          )}>{label}</button>
      ))}
    </div>
  );

  if (!listing && !editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Listings</p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Write Manually
          </Button>
        </div>
        <EmptySection icon={FileText} title="No listings generated yet" hint="Click Analyze Item or write manually" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-foreground">Listings</p>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setForm(blankForm()); }} className="h-7 gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1.5">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>
      <PlatformTabs />
      {editing ? (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Title</label>
            <div className="relative">
              <Input value={form[`${activePlatform}_title` as keyof typeof form] as string}
                onChange={(e) => setForm({ ...form, [`${activePlatform}_title`]: e.target.value })}
                className="text-sm pr-12" placeholder="Title…" />
              {activePlatform === 'ebay' && (
                <span className={cn('absolute right-3 top-1/2 -translate-y-1/2 text-xs',
                  (form.ebay_title || '').length > 80 ? 'text-red-400' : 'text-muted-foreground')}>
                  {(form.ebay_title || '').length}/80
                </span>
              )}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Description</label>
            <Textarea value={form[`${activePlatform}_description` as keyof typeof form] as string}
              onChange={(e) => setForm({ ...form, [`${activePlatform}_description`]: e.target.value })}
              className="text-sm min-h-[160px]" placeholder="Description…" />
          </div>
          {activePlatform === 'ebay' && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item Specifics</label>
                <button type="button"
                  onClick={() => setForm({ ...form, item_specifics: [...form.item_specifics, { k: '', v: '' }] })}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">+ Add Row</button>
              </div>
              <div className="space-y-2">
                {form.item_specifics.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input value={row.k} onChange={(e) => { const n = [...form.item_specifics]; n[i] = { ...n[i], k: e.target.value }; setForm({ ...form, item_specifics: n }); }}
                      className="h-7 text-xs flex-1" placeholder="Key" />
                    <Input value={row.v} onChange={(e) => { const n = [...form.item_specifics]; n[i] = { ...n[i], v: e.target.value }; setForm({ ...form, item_specifics: n }); }}
                      className="h-7 text-xs flex-1" placeholder="Value" />
                    <button type="button" onClick={() => setForm({ ...form, item_specifics: form.item_specifics.filter((_, j) => j !== i) })}
                      className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {form.item_specifics.length === 0 && <p className="text-xs text-muted-foreground/50">No item specifics — click Add Row</p>}
              </div>
            </div>
          )}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Keywords (comma-separated)</label>
              <Textarea value={form.keyword_bank} onChange={(e) => setForm({ ...form, keyword_bank: e.target.value })} className="text-sm min-h-[60px]" placeholder="keyword1, keyword2…" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Hashtags (space-separated)</label>
              <Textarea value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} className="text-sm min-h-[60px]" placeholder="#tag1 #tag2…" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Platform Strategy</label>
              <Textarea value={form.platform_strategy} onChange={(e) => setForm({ ...form, platform_strategy: e.target.value })} className="text-sm min-h-[80px]" placeholder="Platform notes…" />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</p>
              <div className="flex items-center gap-2">
                {activePlatform === 'ebay' && (
                  <span className={cn('text-xs', ((listing![`${activePlatform}_title` as keyof ListingContent] as string) || '').length > 80 ? 'text-red-400' : 'text-muted-foreground')}>
                    {((listing![`${activePlatform}_title` as keyof ListingContent] as string) || '').length}/80
                  </span>
                )}
                <CopyButton text={(listing![`${activePlatform}_title` as keyof ListingContent] as string) || ''} />
              </div>
            </div>
            <p className="text-sm font-medium text-foreground">{(listing![`${activePlatform}_title` as keyof ListingContent] as string) || '—'}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</p>
              <CopyButton text={(listing![`${activePlatform}_description` as keyof ListingContent] as string) || ''} />
            </div>
            <div className="text-sm text-foreground leading-relaxed prose prose-sm prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(listing![`${activePlatform}_description` as keyof ListingContent] as string) }} />
          </div>
          {activePlatform === 'ebay' && listing!.item_specifics && Object.keys(listing!.item_specifics).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Item Specifics</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(listing!.item_specifics).map(([k, v]) => (
                  <div key={k} className="bg-secondary/50 rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">{k}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(listing!.keyword_bank?.length ?? 0) > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Keywords</p>
                  <CopyButton text={listing!.keyword_bank.join(', ')} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{listing!.keyword_bank.join(', ')}</p>
              </div>
            )}
            {(listing!.hashtags?.length ?? 0) > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hashtags</p>
                  <CopyButton text={listing!.hashtags.join(' ')} />
                </div>
                <p className="text-xs text-blue-400 leading-relaxed">{listing!.hashtags.join(' ')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Publish section ──────────────────────────────────────────────────────────

function PublishSection({
  item,
  images,
  identification,
  assessment,
  comps,
  listing,
  platforms,
  onApprove,
  onPublishEbay,
  onUpdatePlatform,
  approving,
  publishing,
}: {
  item: SneakerItem;
  images: SneakerImage[];
  identification: AiIdentification | null;
  assessment: ConditionAssessment | null;
  comps: CompResearch | null;
  listing: ListingContent | null;
  platforms: PlatformListing[];
  onApprove: () => Promise<void>;
  onPublishEbay: () => void;
  onUpdatePlatform: (platform: Platform, updates: Partial<PlatformListing>) => void;
  approving: boolean;
  publishing: boolean;
}) {
  const nonEbayPlatforms: Platform[] = ['facebook', 'mercari', 'offerup', 'poshmark'];

  const warnings: string[] = [];
  if (images.length === 0)  warnings.push('No photos uploaded');
  if (!identification)      warnings.push('Identification not run');
  if (!assessment)          warnings.push('Condition assessment not run');
  if (!comps)               warnings.push('Comp research not run');
  if (!listing)             warnings.push('Listings not generated');
  if (!item.list_price)     warnings.push('No list price set');
  if (!item.condition_grade) warnings.push('No condition grade set');
  if (identification && identification.confidence_score < 90) {
    warnings.push(`Identification confidence is ${identification.confidence_score}% (below 90%)`);
  }

  const getPlatform = (p: Platform) =>
    platforms.find((pl) => pl.platform === p) || { platform: p, status: 'not_started' as const };

  const copyPacket = (platform: Platform) => {
    if (!listing) return '';
    const key = platform as 'facebook' | 'mercari' | 'offerup';
    const titleKey = `${key}_title` as keyof ListingContent;
    const descKey  = `${key}_description` as keyof ListingContent;
    return `TITLE: ${(listing[titleKey] as string) || ''}\n\nDESCRIPTION:\n${(listing[descKey] as string) || ''}\n\nPRICE: $${item.list_price || ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-300 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            {warnings.length} item{warnings.length !== 1 ? 's' : ''} need attention
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-400 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sold warning */}
      {item.status === 'sold' && (
        <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-4">
          <p className="text-sm font-bold text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Item sold — delist from ALL platforms immediately
          </p>
        </div>
      )}

      {/* eBay approval + publish */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <p className="text-sm font-semibold text-foreground">eBay</p>

        {item.status === 'listed' && item.ebay_listing_url ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-emerald-400 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Published to eBay
            </span>
            {safeExternalUrl(item.ebay_listing_url) && (
              <a href={safeExternalUrl(item.ebay_listing_url)!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                View listing <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : item.status === 'needs_review' ? (
          <Button onClick={onApprove} disabled={approving} className="gap-2">
            {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {approving ? 'Approving...' : 'Approve for Listing'}
          </Button>
        ) : item.status === 'ready_to_list' ? (
          <Button onClick={onPublishEbay} disabled={warnings.length > 0 || publishing} className="gap-2">
            {publishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {publishing ? 'Publishing...' : 'Publish to eBay'}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Run analysis and approve the item before publishing.
          </p>
        )}
      </div>

      {/* Other platforms */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-foreground">Other Platforms</p>
        {nonEbayPlatforms.map((platform) => {
          const pl = getPlatform(platform);
          const packet = copyPacket(platform);

          return (
            <div key={platform} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <p className="font-medium text-foreground text-sm">{PLATFORM_LABELS[platform]}</p>
                <Select
                  value={pl.status}
                  onValueChange={(v) => onUpdatePlatform(platform, { status: v as PlatformListing['status'] })}
                >
                  <SelectTrigger className="w-28 h-7 text-xs">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', PLATFORM_STATUS_COLORS[pl.status])}>
                      {pl.status.replace('_', ' ')}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {(['not_started', 'drafted', 'listed', 'sold', 'removed'] as const).map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-center mb-2">
                <Input
                  placeholder="Paste listing URL when live..."
                  value={(pl as PlatformListing).listing_url || ''}
                  onChange={(e) => onUpdatePlatform(platform, { listing_url: e.target.value })}
                  className="h-7 text-xs"
                />
                {safeExternalUrl((pl as PlatformListing).listing_url) && (
                  <a href={safeExternalUrl((pl as PlatformListing).listing_url)!} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 shrink-0">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              {listing && packet && (
                <button
                  onClick={() => navigator.clipboard.writeText(packet)}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy listing packet
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Edit panel ───────────────────────────────────────────────────────────────

function EditPanel({
  item,
  onUpdate,
  onClose,
  onConditionGradeChanged,
  onIdentificationChanged,
}: {
  item: SneakerItem;
  onUpdate: (u: SneakerItem) => void;
  onClose: () => void;
  onConditionGradeChanged?: (newGrade: string) => Promise<void>;
  onIdentificationChanged?: () => Promise<void>;
}) {
  const [form, setForm] = useState({ ...item });
  const [saving, setSaving] = useState(false);
  const [reassessing, setReassessing] = useState(false);

  async function save() {
    setSaving(true);
    const gradeChanged = form.condition_grade && form.condition_grade !== item.condition_grade;
    const idFields = ['brand', 'model', 'nickname', 'style_code', 'upc', 'size', 'gender', 'category'] as const;
    const anyIdFieldChanged = idFields.some((k) => (form[k] ?? null) !== (item[k] ?? null));

    const { data } = await supabase
      .from('sneaker_items')
      .update({
        brand: form.brand, model: form.model, nickname: form.nickname,
        style_code: form.style_code, upc: form.upc, size: form.size,
        gender: form.gender, category: form.category,
        condition_grade: form.condition_grade, status: form.status,
        list_price: form.list_price, accept_offer_floor: form.accept_offer_floor,
        do_not_sell_below: form.do_not_sell_below, local_cash_price: form.local_cash_price,
        notes: form.notes,
      })
      .eq('id', item.id)
      .select()
      .single();
    if (data) onUpdate(data);

    // Sync brand/model/etc. to ai_identification and recalc missing_info
    if (anyIdFieldChanged) {
      await supabase.from('ai_identification').update({
        brand: form.brand || null, model: form.model || null,
        nickname: form.nickname || null, style_code: form.style_code || null,
        upc: form.upc || null, size: form.size || null,
        gender: form.gender || null, category: form.category || null,
      }).eq('item_id', item.id);
    }

    setSaving(false);
    const needsReanalysis = gradeChanged || anyIdFieldChanged;
    if (needsReanalysis) {
      setReassessing(true);
      onClose();
      if (gradeChanged && form.condition_grade && onConditionGradeChanged) {
        await onConditionGradeChanged(form.condition_grade);
      } else if (anyIdFieldChanged && onIdentificationChanged) {
        await onIdentificationChanged();
      }
      setReassessing(false);
    } else {
      onClose();
    }
  }

  const f = (label: string, key: keyof SneakerItem, mono = false) => (
    <div key={label}>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Input
        value={(form[key] as string) || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={cn('h-8 text-sm', mono && 'font-mono')}
      />
    </div>
  );

  const nf = (label: string, key: keyof SneakerItem) => (
    <div key={label}>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Input
        type="number"
        value={(form[key] as number) || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value ? parseFloat(e.target.value) : null })}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <div className="mt-4 bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Edit Details</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 gap-1.5">
            <X className="w-3.5 h-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="h-7 gap-1.5">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {f('Brand', 'brand')}
        {f('Model', 'model')}
        {f('Colorway / Nickname', 'nickname')}
        {f('Style Code', 'style_code', true)}
        {f('UPC', 'upc', true)}
        {f('Size', 'size')}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Status</label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as SneakerItem['status'] })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Condition</label>
          <Select value={form.condition_grade || ''} onValueChange={(v) => setForm({ ...form, condition_grade: v as SneakerItem['condition_grade'] })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(CONDITION_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {nf('List Price', 'list_price')}
        {nf('Offer Floor', 'accept_offer_floor')}
        {nf('Do Not Sell Below', 'do_not_sell_below')}
        {nf('Local Cash Price', 'local_cash_price')}
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notes</label>
        <Textarea
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="text-sm min-h-[80px]"
          placeholder="Internal notes..."
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get('tab') as Tab | null) ?? 'identification'
  );

  const [item, setItem]                       = useState<SneakerItem | null>(null);
  const [images, setImages]                   = useState<SneakerImage[]>([]);
  const [identification, setIdentification]   = useState<AiIdentification | null>(null);
  const [assessment, setAssessment]           = useState<ConditionAssessment | null>(null);
  const [comps, setComps]                     = useState<CompResearch | null>(null);
  const [listing, setListing]                 = useState<ListingContent | null>(null);
  const [platformListings, setPlatformListings] = useState<PlatformListing[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [editing, setEditing]                 = useState(false);
  const [approving, setApproving]             = useState(false);
  const [markingSold, setMarkingSold]           = useState(false);
  const [deleting, setDeleting]                 = useState(false);

  // Pipeline state
  const [steps, setSteps]     = useState<PipelineStep[]>(freshSteps);
  const [phase, setPhase]     = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [globalReassessing, setGlobalReassessing] = useState(false);

  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [itemRes, imgRes, idRes, condRes, compsRes, listRes, platRes] = await Promise.all([
      supabase.from('sneaker_items').select('*').eq('id', id).single(),
      supabase.from('sneaker_images').select('*').eq('item_id', id).order('sort_order'),
      supabase.from('ai_identification').select('*').eq('item_id', id).maybeSingle(),
      supabase.from('condition_assessment').select('*').eq('item_id', id).maybeSingle(),
      supabase.from('comp_research').select('*').eq('item_id', id).maybeSingle(),
      supabase.from('listing_content').select('*').eq('item_id', id).maybeSingle(),
      supabase.from('platform_listings').select('*').eq('item_id', id),
    ]);
    if (itemRes.error) { router.push('/items'); return; }
    setItem(itemRes.data);
    setImages(imgRes.data || []);
    setIdentification(idRes.data || null);
    setAssessment(condRes.data || null);
    setComps(compsRes.data || null);
    setListing(listRes.data || null);
    setPlatformListings(platRes.data || []);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Pipeline runner ─────────────────────────────────────────────────────────
  function setStepStatus(stepId: StepId, status: StepStatus, error?: string) {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, status, error } : s)));
  }

  async function callEdge(slug: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) return { ok: false, error: 'Not signed in.' };
      const res = await fetch(`${supabaseUrl}/functions/v1/${slug}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || `Server error (${res.status})` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  async function runPipeline(startFromIndex = 0) {
    setPhase('running');

    const run = async (
      stepId: StepId,
      idx: number,
      action: () => Promise<{ ok: boolean; error?: string }>
    ): Promise<boolean> => {
      if (idx < startFromIndex) return true;
      setStepStatus(stepId, 'running');
      const result = await action();
      if (!result.ok) {
        setStepStatus(stepId, 'failed', result.error);
        setPhase('failed');
        return false;
      }
      setStepStatus(stepId, 'done');
      return true;
    };

    const pipeline: [StepId, () => Promise<{ ok: boolean; error?: string }>][] = [
      ['upload', async () => {
        if (images.length === 0) return { ok: false, error: 'No photos uploaded. Go to the Photos tab first.' };
        return { ok: true };
      }],
      ['detect',    () => callEdge('detect-category')],
      ['identify',  () => callEdge('identify-sneaker')],
      ['verify',    () => callEdge('verify-sneaker')],
      ['condition', () => callEdge('condition-sneaker')],
      ['comps',     () => callEdge('comps-sneaker')],
      ['listings',  () => callEdge('listings-sneaker')],
    ];

    for (let i = 0; i < pipeline.length; i++) {
      const [stepId, action] = pipeline[i];
      const ok = await run(stepId, i, action);
      if (!ok) return;
    }

    setStepStatus('complete', 'running');
    await supabase.from('sneaker_items').update({ status: 'needs_review' }).eq('id', id);
    setStepStatus('complete', 'done');
    setPhase('done');
    await loadAll();
  }

  function retryFromFailed() {
    const failedIdx = steps.findIndex((s) => s.status === 'failed');
    if (failedIdx < 0) return;
    setSteps((prev) => prev.map((s, i) => (i >= failedIdx ? { ...s, status: 'pending', error: undefined } : s)));
    runPipeline(failedIdx);
  }

  function retryAll() {
    setSteps(freshSteps());
    runPipeline(0);
  }

  async function handleConditionGradeChanged(_newGrade: string) {
    setGlobalReassessing(true);
    try {
      const token = await getAuthToken();
      const res1 = await fetch(`${supabaseUrl}/functions/v1/comps-sneaker/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res1.ok) {
        const d = await res1.json().catch(() => ({}));
        console.error('Re-assessment comps failed:', d.error || res1.status);
      }

      const res2 = await fetch(`${supabaseUrl}/functions/v1/listings-sneaker/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res2.ok) {
        const d = await res2.json().catch(() => ({}));
        console.error('Re-assessment listings failed:', d.error || res2.status);
      }
    } catch (err) {
      console.error('Re-assessment error:', err);
    }
    await loadAll();
    setGlobalReassessing(false);
  }

  // Re-run comps + listings after any identification field changes
  async function handleIdentificationChanged() {
    setGlobalReassessing(true);
    try {
      const token = await getAuthToken();
      const res1 = await fetch(`${supabaseUrl}/functions/v1/comps-sneaker/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res1.ok) {
        const d = await res1.json().catch(() => ({}));
        console.error('Re-analysis comps failed:', d.error || res1.status);
      }

      const res2 = await fetch(`${supabaseUrl}/functions/v1/listings-sneaker/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res2.ok) {
        const d = await res2.json().catch(() => ({}));
        console.error('Re-analysis listings failed:', d.error || res2.status);
      }
    } catch (err) {
      console.error('Re-analysis error:', err);
    }
    await loadAll();
    setGlobalReassessing(false);
  }

  // Re-run just comps (used by Comps tab Re-run button)
  async function handleRerunComps() {
    setGlobalReassessing(true);
    try {
      await callEdge('comps-sneaker');
    } catch (err) {
      console.error('Re-run comps error:', err);
    }
    await loadAll();
    setGlobalReassessing(false);
  }

  // ── Mark as Sold / Delete ──────────────────────────────────────────────────
  async function handleMarkSold() {
    setMarkingSold(true);
    const { data } = await supabase
      .from('sneaker_items')
      .update({ status: 'sold' })
      .eq('id', id)
      .select()
      .single();
    if (data) setItem(data);
    setMarkingSold(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const token = await getAuthToken();
    const res = await fetch(`/api/items/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      router.push('/dashboard');
    } else {
      const d = await res.json().catch(() => ({}));
      console.error('Delete failed:', d.error);
      setDeleting(false);
    }
  }

  // ── Approve / Publish ───────────────────────────────────────────────────────
  async function handleApprove() {
    setApproving(true);
    const { data } = await supabase
      .from('sneaker_items')
      .update({ status: 'ready_to_list' })
      .eq('id', id)
      .select()
      .single();
    if (data) setItem(data);
    setApproving(false);
  }

  async function publishEbay() {
    setPublishing(true);
    const token = await getAuthToken();
    const res = await fetch(`/api/items/${id}/publish`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    if (res.ok && data.item) setItem(data.item);
    setPublishing(false);
  }

  async function handleUpdatePlatform(platform: Platform, updates: Partial<PlatformListing>) {
    const existing = platformListings.find((p) => p.platform === platform);
    const { data } = await supabase
      .from('platform_listings')
      .upsert({ item_id: id, platform, ...(existing || {}), ...updates })
      .select()
      .single();
    if (data) {
      setPlatformListings((prev) => {
        const exists = prev.find((p) => p.platform === platform);
        if (exists) return prev.map((p) => (p.platform === platform ? { ...p, ...data } : p));
        return [...prev, data];
      });
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading || !item) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mainPhoto = images.find((i) => i.label === 'hero') || images[0];
  const title = [item.brand, item.model || item.product_name].filter(Boolean).join(' ') || 'Unknown Item';
  const subtitle = [item.nickname, item.style_code].filter(Boolean).join(' · ');

  return (
    <div>
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* Hero card */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <div className="flex gap-5 items-start">
          {/* Photo */}
          <div className="w-36 h-36 md:w-44 md:h-44 rounded-xl overflow-hidden border border-border bg-secondary/50 shrink-0 flex items-center justify-center">
            {mainPhoto ? (
              <img
                src={mainPhoto.public_url}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/40 p-4 text-center">
                <Upload className="w-8 h-8" />
                <p className="text-[10px]">No photos</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-mono text-xs text-muted-foreground mb-0.5">{item.item_id}</p>
                <h1 className="text-xl font-bold text-foreground leading-tight">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
              </div>
              {item.list_price && (
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-foreground">${item.list_price.toFixed(0)}</p>
                  {item.do_not_sell_below && (
                    <p className="text-xs text-red-400">floor ${item.do_not_sell_below.toFixed(0)}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <StatusBadge status={item.status} />
              {item.condition_grade && (
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                  {CONDITION_LABELS[item.condition_grade]}
                </span>
              )}
              {item.size && (
                <span className="text-xs text-muted-foreground">Size {item.size}</span>
              )}
              {/* Item type badge + override */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground/60">Category:</span>
                <Select
                  value={item.item_type || 'general_unknown'}
                  onValueChange={async (v) => {
                    try {
                      const token = await getAuthToken();
                      await fetch(`${supabaseUrl}/functions/v1/detect-category/${id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ item_type: v }),
                      });
                      await loadAll();
                    } catch {}
                  }}
                >
                  <SelectTrigger className="h-6 text-xs border-0 bg-secondary hover:bg-secondary/80 gap-1 pr-2 pl-2 rounded focus:ring-0 focus:ring-offset-0 w-auto">
                    <SelectValue>{ITEM_TYPE_LABELS[item.item_type as ItemType] || 'Unknown'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ITEM_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              <Button
                onClick={() => runPipeline(0)}
                disabled={phase === 'running'}
                className="gap-2 font-semibold"
              >
                {phase === 'running' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {phase === 'running' ? 'Analyzing...' : 'Analyze Item'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing((e) => !e)}
                className="gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Details
              </Button>
              {item.status !== 'sold' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkSold}
                  disabled={markingSold}
                  className="gap-1.5 border-emerald-600/40 text-emerald-400 hover:bg-emerald-900/20"
                >
                  {markingSold ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <DollarSign className="w-3.5 h-3.5" />}
                  Mark as Sold
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-red-600/30 text-red-400 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the item, its photos, and all analysis data (identification, condition, comps, listings). This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 text-white hover:bg-red-700"
                      disabled={deleting}
                    >
                      {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Delete Permanently'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Inline edit panel */}
        {editing && (
          <EditPanel
            item={item}
            onUpdate={(u) => setItem(u)}
            onClose={() => setEditing(false)}
            onConditionGradeChanged={handleConditionGradeChanged}
            onIdentificationChanged={handleIdentificationChanged}
          />
        )}
      </div>

      {/* Analyze Now banner — shown when photos exist but pipeline hasn't run */}
      {images.length > 0 && phase === 'idle' && !identification && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Photos uploaded — ready to analyze</p>
              <p className="text-xs text-muted-foreground">Click Analyze Now to identify the item, assess condition, research comps, and generate listings.</p>
            </div>
          </div>
          <Button onClick={() => runPipeline(0)} className="gap-2 font-semibold shrink-0">
            <Zap className="w-4 h-4" /> Analyze Now
          </Button>
        </div>
      )}

      {/* Pipeline progress */}
      {(phase === 'running' || phase === 'failed' || phase === 'done') && (
        <PipelineProgress
          steps={steps}
          phase={phase}
          onRetryFailed={retryFromFailed}
          onRetryAll={retryAll}
        />
      )}

      {globalReassessing && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3 mb-6">
          <RefreshCw className="w-4 h-4 animate-spin text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Re-analyzing affected data</p>
            <p className="text-xs text-muted-foreground">
              Updating comps and listings to reflect your changes…
            </p>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-0.5 overflow-x-auto border-b border-border mb-6 pb-0">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              activeTab === tabId
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-64">
        {activeTab === 'identification' && (
          <IdentificationSection item={item} identification={identification} itemId={id} onRefresh={loadAll} onIdentificationChanged={handleIdentificationChanged} />
        )}
        {activeTab === 'condition' && (
          <ConditionSection
            assessment={assessment}
            itemId={id}
            itemType={item.item_type || 'general_unknown'}
            onRefresh={loadAll}
            onConditionGradeChanged={handleConditionGradeChanged}
          />
        )}
        {activeTab === 'comps' && (
          <CompsSection comps={comps} onRerun={handleRerunComps} />
        )}
        {activeTab === 'pricing' && (
          <PricingSection item={item} comps={comps} itemId={id} onRefresh={loadAll} />
        )}
        {activeTab === 'listings' && (
          <ListingsSection item={item} listing={listing} itemId={id} onRefresh={loadAll} />
        )}
        {activeTab === 'photos' && (
          <ImageUploader itemId={id} images={images} onImagesChange={setImages} />
        )}
        {activeTab === 'publish' && (
          <PublishSection
            item={item}
            images={images}
            identification={identification}
            assessment={assessment}
            comps={comps}
            listing={listing}
            platforms={platformListings}
            onApprove={handleApprove}
            onPublishEbay={publishEbay}
            onUpdatePlatform={handleUpdatePlatform}
            approving={approving}
            publishing={publishing}
          />
        )}
      </div>
    </div>
  );
}
