import {  useEffect,useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import { getConfig } from "@/lib/config";
import { LoadingBlock, BackendUnavailable, EmptyState } from "@/components/sentinel/States";
import { TimeRangePicker, rangeLabel } from "@/components/sentinel/TimeRangePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function Logs() {
  const cfg = getConfig();
  const [limit, setLimit] = useState<number>(cfg.defaultLimit);
  const [rangeMinutes, setRangeMinutes] = useState(() => {
  const saved = localStorage.getItem("alerts.rangeMinutes");
  return saved ? Number(saved) : 15;
});

useEffect(() => {
  localStorage.setItem("alerts.rangeMinutes", String(rangeMinutes));
}, [rangeMinutes]);

  const { data, loading, degraded, refresh } = usePolling(() => sentinel.logs(limit, rangeMinutes), 15000, [limit, rangeMinutes]);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<"all" | "normal" | "anomaly">("all");
  const [protocol, setProtocol] = useState("all");

  const protocols = useMemo(() => Array.from(new Set((data ?? []).map(d => d.protocol))).sort(), [data]);

  const filtered = useMemo(() => (data ?? []).filter(l => {
    if (classFilter !== "all" && l.classification !== classFilter) return false;
    if (protocol !== "all" && l.protocol !== protocol) return false;
    if (search) {
      const s = search.toLowerCase();
      if (![l.sourceIp, l.destinationIp].some(x => x.toLowerCase().includes(s))) return false;
    }
    return true;
  }), [data, classFilter, protocol, search]);

  const exportCsv = () => {
    const rows = [
      ["timestamp", "protocol", "source", "destination", "bytes", "packets", "class", "score"].join(","),
      ...filtered.map(l => [l.timestamp, l.protocol, l.sourceIp, l.destinationIp, l.bytes, l.packets, l.classification, l.score.toFixed(3)].join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `logs-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Logs exported");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Traffic Logs</h1>
          <p className="text-sm text-muted-foreground">Inspect classified flows from the detection pipeline.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TimeRangePicker rangeMinutes={rangeMinutes} onRangeChange={setRangeMinutes} onRefresh={refresh} />
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
        </div>
      </div>

      {degraded && <BackendUnavailable feature="Logs API" />}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input placeholder="Search IP..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <Select value={classFilter} onValueChange={(v) => setClassFilter(v as "all" | "normal" | "anomaly")}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="anomaly">Anomaly</SelectItem>
          </SelectContent>
        </Select>
        <Select value={protocol} onValueChange={setProtocol}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Protocol" /></SelectTrigger>
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
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} rows - {rangeLabel(rangeMinutes)}</span>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {loading ? <LoadingBlock className="m-4" /> :
          filtered.length === 0 ? <EmptyState title="No logs match your filters" /> : (
            <div className="max-h-[640px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Proto</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="text-right">Bytes</TableHead>
                    <TableHead className="text-right">Pkts</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">{format(new Date(l.timestamp), "HH:mm:ss")}</TableCell>
                      <TableCell className="font-mono text-xs">{l.protocol}</TableCell>
                      <TableCell className="font-mono text-xs">{l.sourceIp}</TableCell>
                      <TableCell className="font-mono text-xs">{l.destinationIp}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{l.bytes.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{l.packets}</TableCell>
                      <TableCell>
                        <span className={l.classification === "anomaly" ? "font-medium text-destructive" : "text-success"}>
                          {l.classification}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{l.score.toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </div>
    </div>
  );
}
