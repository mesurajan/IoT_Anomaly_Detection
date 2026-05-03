import {  useEffect,useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, RefreshCw, ShieldAlert, ShieldX, Download } from "lucide-react";
import { toast } from "sonner";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import { getConfig } from "@/lib/config";
import { useAuth } from "@/auth/AuthContext";
import { LoadingBlock, BackendUnavailable, EmptyState } from "@/components/sentinel/States";
import { SeverityBadge, StatusBadge } from "@/components/sentinel/Badges";
import { TimeRangePicker, rangeLabel } from "@/components/sentinel/TimeRangePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { AlertItem, AlertSeverity } from "@/lib/types";

export default function Alerts() {
  const cfg = getConfig();
  const { user } = useAuth();
  const [limit, setLimit] = useState<number>(cfg.defaultLimit);
  const [rangeMinutes, setRangeMinutes] = useState(() => {
  const saved = localStorage.getItem("alerts.rangeMinutes");
  return saved ? Number(saved) : 15;
});

useEffect(() => {
  localStorage.setItem("alerts.rangeMinutes", String(rangeMinutes));
}, [rangeMinutes]);
  const { data, loading, degraded, refresh } = usePolling(() => sentinel.alerts(limit, rangeMinutes), 12000, [limit, rangeMinutes]);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<AlertSeverity | "all">("all");
  const [protocol, setProtocol] = useState<string>("all");
  const [working, setWorking] = useState<string | null>(null);

  const protocols = useMemo(() => Array.from(new Set((data ?? []).map(a => a.protocol))).sort(), [data]);

  const filtered: AlertItem[] = useMemo(() => {
    return (data ?? []).filter(a => {
      if (severity !== "all" && a.severity !== severity) return false;
      if (protocol !== "all" && a.protocol !== protocol) return false;
      if (search) {
        const s = search.toLowerCase();
        if (![a.sourceIp, a.destinationIp, a.description].some(x => x.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [data, severity, protocol, search]);

  const act = async (id: string, fn: () => Promise<void>, ok: string) => {
    setWorking(id);
    try { await fn(); toast.success(ok); refresh(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setWorking(null); }
  };

  const exportCsv = () => {
    const rows = [
      ["timestamp", "severity", "protocol", "source", "destination", "status", "description"].join(","),
      ...filtered.map(a => [a.timestamp, a.severity, a.protocol, a.sourceIp, a.destinationIp, a.status, JSON.stringify(a.description)].join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `alerts-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Alerts exported");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">Investigate, acknowledge, and label detection events.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TimeRangePicker rangeMinutes={rangeMinutes} onRangeChange={setRangeMinutes} onRefresh={refresh} />
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      {degraded && <BackendUnavailable feature="Alerts API" />}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input placeholder="Search IP or description..." value={search} onChange={e => setSearch(e.target.value)} className="w-72" />
        <Select value={severity} onValueChange={(v) => setSeverity(v as AlertSeverity | "all")}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={protocol} onValueChange={setProtocol}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Protocol" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All protocols</SelectItem>
            {protocols.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200, 500].map(n => <SelectItem key={n} value={String(n)}>Limit {n}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {data?.length ?? 0} - {rangeLabel(rangeMinutes)}</span>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {loading ? <LoadingBlock className="m-4" /> :
          filtered.length === 0 ? <EmptyState title="No alerts match your filters" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Source to Destination</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{format(new Date(a.timestamp), "yyyy-MM-dd HH:mm:ss")}</TableCell>
                    <TableCell><SeverityBadge severity={a.severity} /></TableCell>
                    <TableCell className="font-mono text-xs">{a.protocol}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.sourceIp} {"->"} {a.destinationIp}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm">{a.description}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={working === a.id || a.status !== "open"}
                          onClick={() => act(a.id, () => sentinel.acknowledgeAlert(a.id), "Alert acknowledged")}>
                          <Check className="mr-1 h-3.5 w-3.5" />Ack
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={working === a.id}
                          onClick={() => act(a.id, () => sentinel.feedbackAlert(a.id, "true_attack"), "Marked as true attack")}>
                          <ShieldAlert className="mr-1 h-3.5 w-3.5" />Attack
                        </Button>
                        <Button size="sm" variant="ghost" className="text-success" disabled={working === a.id}
                          onClick={() => act(a.id, () => sentinel.feedbackAlert(a.id, "false_positive"), "Marked as false positive")}>
                          <ShieldX className="mr-1 h-3.5 w-3.5" />FP
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </div>
      {user?.role === "analyst" && (
        <p className="text-xs text-muted-foreground">Analyst view - destructive operational actions are restricted to admins.</p>
      )}
    </div>
  );
}
