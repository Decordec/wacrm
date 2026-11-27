'use client';

// ============================================================
// "Connect WhatsApp (keep on phone)" — Meta Embedded Signup with the
// WhatsApp Business app feature (Coexistence). The business logs in with
// Facebook, picks its WhatsApp Business app number and scans a QR code in
// the app; the number keeps working on the phone and becomes available
// in the CRM, with contacts and recent chat history imported.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Smartphone, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FbLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}
interface FbSdk {
  init: (opts: Record<string, unknown>) => void;
  login: (cb: (r: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

interface EsConfig {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
}

const NO_PIPELINE = '__none__';

function loadFbSdk(appId: string, version: string): Promise<FbSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB!);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Could not load the Facebook SDK (check ad blockers).'));
    document.body.appendChild(s);
  });
}

export function ConnectWhatsAppButton({ onConnected }: { onConnected: () => void }) {
  const [config, setConfig] = useState<EsConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [pipelineId, setPipelineId] = useState<string>(NO_PIPELINE);
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sdk, setSdk] = useState<FbSdk | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  // Filled by Meta's postMessage when the popup finishes.
  const session = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    fetch('/api/whatsapp/embedded-signup')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
    createClient()
      .from('pipelines')
      .select('id, name')
      .order('created_at')
      .then(({ data }) => setPipelines((data as { id: string; name: string }[]) ?? []));
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      let data: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string } };
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'CANCEL') {
        setBusy(false);
        return;
      }
      if (data.data?.waba_id) session.current.wabaId = data.data.waba_id;
      if (data.data?.phone_number_id) session.current.phoneNumberId = data.data.phone_number_id;
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Load the Facebook SDK as soon as the dialog opens, so the click on
  // "Continue with Facebook" can open Meta's window synchronously. Opening
  // it after an await loses the user gesture and Chrome blocks the popup.
  useEffect(() => {
    if (!open || sdk || !config?.appId) return;
    let alive = true;
    loadFbSdk(config.appId, config.graphVersion)
      .then((fb) => alive && setSdk(fb))
      .catch((e) => alive && setSdkError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [open, sdk, config?.appId, config?.graphVersion]);

  if (!config?.enabled || !config.appId || !config.configId) return null;

  function start() {
    if (!config?.appId || !config.configId) return;
    if (!sdk) {
      toast.error(sdkError ?? 'Facebook is still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    session.current = {};
    try {
      sdk.login(
        (response) => {
          const code = response.authResponse?.code;
          if (!code) {
            setBusy(false);
            toast.error('WhatsApp connection was cancelled.');
            return;
          }
          // Meta posts the WABA id just before (or right after) the login
          // callback; give it a moment.
          void finish(code);
        },
        {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
          },
        },
      );
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : 'Could not start WhatsApp signup.');
    }
  }

  async function finish(code: string) {
    for (let i = 0; i < 20 && !session.current.wabaId; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!session.current.wabaId) {
      setBusy(false);
      toast.error('Meta did not report which WhatsApp account was connected. Please try again.');
      return;
    }
    try {
      const res = await fetch('/api/whatsapp/embedded-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          waba_id: session.current.wabaId,
          phone_number_id: session.current.phoneNumberId,
          label,
          pipeline_id: pipelineId === NO_PIPELINE ? null : pipelineId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success(
        `${data.verified_name || data.display_phone_number || 'WhatsApp number'} connected` +
          (data.coexistence ? ' — still works on the phone. Importing contacts and chat history…' : '.'),
      );
      setOpen(false);
      setLabel('');
      onConnected();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Connecting WhatsApp failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Smartphone className="size-4" />
        Connect WhatsApp (keep on phone)
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) setBusy(false); setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect a WhatsApp Business app number</DialogTitle>
            <DialogDescription>
              The number keeps working in the WhatsApp Business app on your phone. You&apos;ll log in
              with Facebook, choose the number and scan a QR code in the app. Contacts and up to 6
              months of chats are imported.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="es-label">Brand / label</Label>
              <Input
                id="es-label"
                placeholder="e.g. Decordec"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pipeline for new chats</Label>
              <Select value={pipelineId} onValueChange={(v) => setPipelineId(String(v ?? NO_PIPELINE))}>
                <SelectTrigger className="w-full" aria-label="Pipeline for new chats">
                  <SelectValue>
                    {pipelineId === NO_PIPELINE
                      ? 'No pipeline'
                      : pipelines.find((p) => p.id === pipelineId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PIPELINE}>No pipeline</SelectItem>
                  {pipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                New conversations on this number open a lead in this pipeline.
              </p>
            </div>
            {busy && (
              <p className="text-xs text-muted-foreground">
                A Facebook window should be open. If you don&apos;t see it, check for a blocked-popup
                icon in the address bar, allow popups for this site, then press Cancel and try again.
              </p>
            )}
            {sdkError && <p className="text-xs text-destructive">{sdkError}</p>}
            <p className="text-xs text-muted-foreground">
              Before you start: if the number is linked to another WhatsApp partner, disconnect it in
              the WhatsApp Business app first (Settings → Account → Business Platform).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBusy(false); setOpen(false); }}>
              Cancel
            </Button>
            <Button onClick={start} disabled={busy || (!sdk && !sdkError)}>
              {(busy || (!sdk && !sdkError)) && <Loader2 className="size-4 animate-spin" />}
              Continue with Facebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
