import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { confirmAdminAction } from "@/lib/adminActionToast";
import { sentinel } from "@/lib/sentinel";
import { applyOverride, getConfig, getConfigState, loadRuntimeConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Settings() {
  const cfg = getConfig();
  const cfgState = getConfigState();
  const [api, setApi] = useState(cfg.apiBaseUrl);
  const [kibana, setKibana] = useState(cfg.kibanaUrl);

  const save = async () => {
    confirmAdminAction({
      action: "update",
      target: "settings",
      description: "Admin action required: update runtime endpoints.",
      onConfirm: async () => {
    applyOverride({ apiBaseUrl: api.trim(), kibanaUrl: kibana.trim() });
    await loadRuntimeConfig();
    await sentinel.recordAudit({
      action: "settings.update",
      target: "runtime-endpoints",
      detail: { apiBaseUrl: api.trim(), kibanaUrl: kibana.trim() },
    });
    toast.success("Settings updated");
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Override backend URLs at runtime. Persisted to this browser only.</p>
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Endpoints</h2>
        <p className="text-xs text-muted-foreground">Defaults come from environment variables. Backend <span className="font-mono">/api/config</span> overrides env when present.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="api">API Base URL</Label>
            <Input id="api" value={api} onChange={(e) => setApi(e.target.value)} placeholder="https://api.example.com" />
            <p className="text-[11px] text-muted-foreground">Used by all <span className="font-mono">/api/*</span> requests.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kib">Kibana URL</Label>
            <Input id="kib" value={kibana} onChange={(e) => setKibana(e.target.value)} placeholder="https://kibana.example.com" />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={save}><Save className="mr-2 h-4 w-4" />Save settings</Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Runtime configuration</h2>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <Row k="App name" v={cfg.appName} />
          <Row k="Auth mode" v={cfg.authMode} />
          <Row k="Kibana embed" v={String(cfg.enableKibanaEmbed)} />
          <Row k="Default limit" v={String(cfg.defaultLimit)} />
          <Row k="Request timeout" v={`${cfg.requestTimeoutMs} ms`} />
          <Row k="Config source" v={cfgState.source} />
        </div>
        {cfgState.errors.length > 0 && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            <p className="font-medium">Missing env values</p>
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {cfgState.errors.map(e => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v || "-"}</span>
    </div>
  );
}
