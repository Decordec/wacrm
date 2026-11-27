'use client';

// ============================================================
// Connected numbers (migration 061)
//
// One account can run several WhatsApp numbers — e.g. one per brand —
// each with its own label and its own sales pipeline. This panel lists
// them, lets an admin pick which one the credentials form below edits,
// add another, and change the CRM-side settings (label, pipeline,
// auto-create deal, default) without re-entering Meta credentials.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Star, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface WhatsAppNumberSummary {
  id: string;
  label: string | null;
  phone_number_id: string;
  waba_id: string | null;
  status: string;
  is_default: boolean;
  pipeline_id: string | null;
  auto_create_deal: boolean;
}

interface PipelineOption {
  id: string;
  name: string;
}

const NO_PIPELINE = '__none__';

export function WhatsAppNumbersPanel({
  numbers,
  selectedId,
  onSelect,
  onAddNew,
  onChanged,
  canEdit,
}: {
  numbers: WhatsAppNumberSummary[];
  /** Number the credentials form is editing; null = adding a new one. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  /** Reload after a settings change. */
  onChanged: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations('Settings.whatsapp.numbers');
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from('pipelines')
        .select('id, name')
        .order('created_at', { ascending: true });
      if (!cancelled) setPipelines((data as PipelineOption[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLabels(Object.fromEntries(numbers.map((n) => [n.id, n.label ?? ''])));
  }, [numbers]);

  async function patch(id: string, body: Record<string, unknown>, okMessage?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/whatsapp/numbers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('saveFailed'));
      if (okMessage) toast.success(okMessage);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-foreground">{t('title')}</CardTitle>
          <CardDescription className="text-muted-foreground">{t('description')}</CardDescription>
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant={selectedId === null ? 'default' : 'outline'}
            onClick={onAddNew}
          >
            <Plus className="size-4" />
            {t('add')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {numbers.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        )}
        {numbers.map((n) => {
          const selected = n.id === selectedId;
          const pipelineName = pipelines.find((p) => p.id === n.pipeline_id)?.name;
          return (
            <div
              key={n.id}
              className={`rounded-lg border p-3 space-y-3 ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Phone className="size-4 text-muted-foreground" />
                <span className="font-medium text-foreground">
                  {n.label || t('unnamed')}
                </span>
                <span className="text-xs text-muted-foreground">ID {n.phone_number_id}</span>
                {n.is_default && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="size-3" />
                    {t('default')}
                  </Badge>
                )}
                <Badge variant={n.status === 'connected' ? 'default' : 'outline'}>
                  {n.status === 'connected' ? t('connected') : t('disconnected')}
                </Badge>
                <div className="ml-auto flex gap-2">
                  {!selected && (
                    <Button size="sm" variant="ghost" onClick={() => onSelect(n.id)}>
                      {t('editCredentials')}
                    </Button>
                  )}
                  {canEdit && !n.is_default && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === n.id}
                      onClick={() => patch(n.id, { is_default: true }, t('defaultSet'))}
                    >
                      {t('makeDefault')}
                    </Button>
                  )}
                </div>
              </div>

              {canEdit ? (
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('label')}</Label>
                    <Input
                      value={labels[n.id] ?? ''}
                      placeholder={t('labelPlaceholder')}
                      onChange={(e) => setLabels({ ...labels, [n.id]: e.target.value })}
                      onBlur={() => {
                        if ((labels[n.id] ?? '') !== (n.label ?? '')) {
                          void patch(n.id, { label: labels[n.id] ?? '' }, t('saved'));
                        }
                      }}
                      className="bg-muted border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t('pipeline')}</Label>
                    <Select
                      value={n.pipeline_id ?? NO_PIPELINE}
                      onValueChange={(v) =>
                        patch(n.id, { pipeline_id: v === NO_PIPELINE ? null : String(v) }, t('saved'))
                      }
                    >
                      <SelectTrigger className="w-full" aria-label={t('pipeline')}>
                        <SelectValue>{pipelineName ?? t('noPipeline')}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PIPELINE}>{t('noPipeline')}</SelectItem>
                        {pipelines.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground pb-2">
                    <Switch
                      checked={n.auto_create_deal}
                      disabled={!n.pipeline_id || busyId === n.id}
                      onCheckedChange={(v) => patch(n.id, { auto_create_deal: v === true }, t('saved'))}
                    />
                    {t('autoDeal')}
                  </label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('pipeline')}: {pipelineName ?? t('noPipeline')}
                </p>
              )}
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">{t('templatesNote')}</p>
      </CardContent>
    </Card>
  );
}
