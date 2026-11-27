'use client';

// Picks which connected WhatsApp number to send from (migration 061).
// Renders nothing for an account with a single number, so single-number
// setups look exactly as before.

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NumberOption {
  id: string;
  label: string | null;
  phone_number_id: string;
  is_default: boolean;
}

export function NumberPicker({
  value,
  onChange,
  onNumbersLoaded,
  onSelectedDetails,
}: {
  value: string | null;
  onChange: (id: string) => void;
  /** All numbers, default first (labels resolved), once loaded. */
  onNumbersLoaded?: (numbers: { id: string; label: string }[]) => void;
  /** Fires with id + label whenever the user picks a number. */
  onSelectedDetails?: (n: { id: string; label: string }) => void;
}) {
  const t = useTranslations('MultiNumber');
  const [numbers, setNumbers] = useState<NumberOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from('whatsapp_config')
        .select('id, label, phone_number_id, is_default')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (cancelled || !data) return;
      setNumbers(data as NumberOption[]);
      onNumbersLoaded?.(
        (data as NumberOption[]).map((n) => ({ id: n.id, label: n.label || n.phone_number_id })),
      );
      // Preselect the default number so the value is never ambiguous.
      if (!value && data.length > 0) onChange(data[0].id);
    })();
    return () => {
      cancelled = true;
    };
    // Load once; `value`/`onChange` only seed the first selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (numbers.length < 2) return null;
  const current = numbers.find((n) => n.id === value);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-muted-foreground">{t('fromNumber')}</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => {
          if (!v) return;
          const id = String(v);
          onChange(id);
          const n = numbers.find((x) => x.id === id);
          if (n) onSelectedDetails?.({ id, label: n.label || n.phone_number_id });
        }}
      >
        <SelectTrigger className="w-full sm:w-72" aria-label={t('fromNumber')}>
          <SelectValue>{current ? current.label || current.phone_number_id : t('fromNumber')}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {numbers.map((n) => (
            <SelectItem key={n.id} value={n.id}>
              {n.label || n.phone_number_id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('fromNumberHint')}</p>
    </div>
  );
}
