import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, RadioTower, RefreshCw, Square } from "lucide-react";
import { toast } from "sonner";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import type { DetectionJob } from "@/lib/types";
import { StatCard } from "@/components/sentinel/StatCard";
import { TimeRangePicker } from "@/components/sentinel/TimeRangePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const LIVE_JOB_KEY = "sentinel.activeLiveCaptureJobId";
const FINISHED_STATUSES = ["completed", "failed", "stopped"];

export default function LiveCapture() {
  const [rangeMinutes, setRangeMinutes] = useState(() => {
  const saved = localStorage.getItem("alerts.rangeMinutes");
  return saved ? Number(saved) : 15;
});

useEffect(() => {
  localStorage.setItem("alerts.rangeMinutes", String(rangeMinutes));
}, [rangeMinutes]);

  const wireshark = usePolling(() => sentinel.wiresharkInterfaces(), 0);
  const stats = usePolling(() => sentinel.stats(rangeMinutes, "live_capture"), 5000, [rangeMinutes]);
  const logs = usePolling(() => sentinel.logs(8, rangeMinutes, "live_capture"), 8000, [rangeMinutes]);
  const [interfaceId, setInterfaceId] = useState("");
  const [runForever, setRunForever] = useState(true);
  const [maxPackets, setMaxPackets] = useState(200);
  const [job, setJob] = useState<DetectionJob | null>(null);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);

  useEffect(() => {
    if (!interfaceId && wireshark.data?.interfaces?.length) {
      setInterfaceId(wireshark.data.interfaces[0].id);
    }
  }, [interfaceId, wireshark.data]);

  useEffect(() => {
    let cancelled = false;
    async function restoreJob() {
      const savedJobId = localStorage.getItem(LIVE_JOB_KEY);
      if (!savedJobId) return;
      try {
        const latest = await sentinel.detectionJob(savedJobId);
        if (cancelled || latest.mode !== "wireshark") return;
        setJob(latest);
        if (FINISHED_STATUSES.includes(latest.status)) localStorage.removeItem(LIVE_JOB_KEY);
      } catch {
        localStorage.removeItem(LIVE_JOB_KEY);
      }
    }
    restoreJob();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!job?.jobId || FINISHED_STATUSES.includes(job.status)) return;
    localStorage.setItem(LIVE_JOB_KEY, job.jobId);
    const id = setInterval(async () => {
      try {
        const latest = await sentinel.detectionJob(job.jobId);
        setJob(latest);
        if (FINISHED_STATUSES.includes(latest.status)) localStorage.removeItem(LIVE_JOB_KEY);
        stats.refresh();
        logs.refresh();
      } catch (error) {
        toast.error((error as Error).message);
      }
    }, 2500);
    return () => clearInterval(id);
  }, [job?.jobId, job?.status]);

  const running = job ? ["queued", "running"].includes(job.status) : false;

  const refreshAll = () => {
    wireshark.refresh();
    stats.refresh();
    logs.refresh();
  };

  const startCapture = async () => {
    if (!interfaceId) return;
    setBusy("start");
    try {
      const safeMaxPackets = Math.max(1, Math.floor(maxPackets || 1));
      const payload = runForever
        ? { interfaceId, runForever }
        : { interfaceId, runForever, maxPackets: safeMaxPackets };
      const result = await sentinel.startWiresharkDetection(payload);
      localStorage.setItem(LIVE_JOB_KEY, result.jobId);
      setJob({ jobId: result.jobId, mode: "wireshark", status: "queued", logs: "[INFO] Live Wireshark capture queued" });
      toast.success("Live Wireshark capture started");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const stopCapture = async () => {
    setBusy("stop");
    try {
      await sentinel.stopMonitoring(job?.jobId);
      localStorage.removeItem(LIVE_JOB_KEY);
      if (job) setJob({ ...job, status: "stopped", logs: `${job.logs ?? ""}\n[INFO] Stop requested` });
      toast.success("Live capture stopped");
      refreshAll();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live Wireshark Capture</h1>
          <p className="text-sm text-muted-foreground">Capture packets from a tshark interface, classify them with the active model, and stream results to Elasticsearch.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TimeRangePicker rangeMinutes={rangeMinutes} onRangeChange={setRangeMinutes} onRefresh={refreshAll} />
          <Button variant="outline" size="sm" className="h-10" onClick={refreshAll}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Capture State" value={running ? "Active" : "Paused"} tone={running ? "success" : "warning"} hint={job?.jobId ?? "No active capture"} />
        <StatCard label="Events In Range" value={stats.data?.totalTraffic?.toLocaleString() ?? "-"} tone="info" />
        <StatCard label="Active Alerts" value={stats.data?.activeAlerts?.toLocaleString() ?? "-"} tone="danger" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Capture controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">Choose a tshark interface and keep capture running until stopped, or stop after a packet limit.</p>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label>Capture device</Label>
              <Select value={interfaceId} onValueChange={setInterfaceId} disabled={!wireshark.data?.available || !wireshark.data.interfaces.length}>
                <SelectTrigger><SelectValue placeholder="No devices available" /></SelectTrigger>
                <SelectContent>
                  {(wireshark.data?.interfaces ?? []).map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.id}. {item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!wireshark.data?.available && (
                <p className="text-xs text-destructive">{wireshark.data?.message ?? "Wireshark/tshark is not available to the backend."}</p>
              )}
              {wireshark.data?.available && (
                <p className="text-xs text-muted-foreground">tshark: {wireshark.data.tsharkPath ?? "detected"}</p>
              )}
            </div>

            <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/40 p-3">
              <Switch checked={runForever} onCheckedChange={setRunForever} />
              <div>
                <p className="text-sm font-medium">Run until manually stopped</p>
                <p className="text-xs text-muted-foreground">Disable to capture a fixed number of packets.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Packet limit</Label>
              <Input
                type="number"
                min={1}
                value={maxPackets}
                onChange={(event) => setMaxPackets(Number(event.target.value) || 1)}
                className="max-w-48"
              />
              <p className="text-xs text-muted-foreground">Applies when run-until-stopped is disabled.</p>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={startCapture} disabled={busy !== null || running || !wireshark.data?.available || !interfaceId}>
                {busy === "start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RadioTower className="mr-2 h-4 w-4" />}
                Start Live Capture
              </Button>
              <Button variant="destructive" onClick={stopCapture} disabled={!running || busy !== null}>
                {busy === "stop" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                Stop
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Live capture log</h2>
            <p className="text-xs text-muted-foreground">{job ? `${job.jobId} - ${job.status}` : "Start live capture to see tshark and model output here."}</p>
          </div>
          <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {job?.logs || "Live capture logs will appear here live."}
          </pre>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">Recent Captured Events</h2>
          <p className="text-xs text-muted-foreground">Latest classified events in the selected time range.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Bytes</TableHead>
              <TableHead>Class</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs.data ?? []).map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{format(new Date(item.timestamp), "HH:mm:ss")}</TableCell>
                <TableCell className="font-mono text-xs">{item.protocol}</TableCell>
                <TableCell className="font-mono text-xs">{item.sourceIp}</TableCell>
                <TableCell className="font-mono text-xs">{item.destinationIp}</TableCell>
                <TableCell className="font-mono text-xs">{item.bytes.toLocaleString()}</TableCell>
                <TableCell className={item.classification === "anomaly" ? "font-medium text-destructive" : "text-success"}>{item.classification}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
