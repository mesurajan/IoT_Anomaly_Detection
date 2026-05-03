import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Database, Loader2, Play, RefreshCw, Square, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import type { DetectionJob } from "@/lib/types";
import { StatCard } from "@/components/sentinel/StatCard";
import { TimeRangePicker } from "@/components/sentinel/TimeRangePicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REPLAY_JOB_KEY = "sentinel.activeReplayJobId";
const FINISHED_STATUSES = ["completed", "failed", "stopped"];

export default function ReplayDetection() {
  const [logsLimit, setLogsLimit] = useState(50);
  const [rangeMinutes, setRangeMinutes] = useState(() => {
  const saved = localStorage.getItem("alerts.rangeMinutes");
  return saved ? Number(saved) : 15;
});


useEffect(() => {
  localStorage.setItem("alerts.rangeMinutes", String(rangeMinutes));
}, [rangeMinutes]);

  const stats = usePolling(() => sentinel.stats(rangeMinutes, "dataset_replay"), 5000, [rangeMinutes]);
  const logs = usePolling(() => sentinel.logs(logsLimit, rangeMinutes, "dataset_replay"), 8000, [rangeMinutes, logsLimit]);
  const refreshStats = stats.refresh;
  const refreshLogs = logs.refresh;
  const datasets = usePolling(() => sentinel.datasets(), 0);
  const currentModel = usePolling(() => sentinel.currentModel(), 0);
  const modelHistory = usePolling(() => sentinel.modelHistory(), 0);
  const [datasetId, setDatasetId] = useState("");
  const [modelVersion, setModelVersion] = useState("");
  const [job, setJob] = useState<DetectionJob | null>(null);
  const [busy, setBusy] = useState<"upload" | "start" | "stop" | "delete" | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    title: string;
    description: string;
    logIds: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!datasetId && datasets.data?.length) setDatasetId(datasets.data[0].id);
  }, [datasetId, datasets.data]);

  useEffect(() => {
    if (modelVersion) return;
    const production = modelHistory.data?.find(item => item.status === "production");
    const fallback = currentModel.data?.version || production?.version || modelHistory.data?.[0]?.version || "";
    if (fallback) setModelVersion(fallback);
  }, [currentModel.data, modelHistory.data, modelVersion]);

  useEffect(() => {
    const availableLogIds = new Set((logs.data ?? []).map(item => item.id));
    setSelectedLogIds(previous => previous.filter(id => availableLogIds.has(id)));
  }, [logs.data]);

  useEffect(() => {
    if (!deleteMode) {
      setSelectedLogIds([]);
    }
  }, [deleteMode]);

  useEffect(() => {
    let cancelled = false;
    async function restoreJob() {
      const savedJobId = localStorage.getItem(REPLAY_JOB_KEY);
      if (!savedJobId) return;
      try {
        const latest = await sentinel.detectionJob(savedJobId);
        if (cancelled || latest.mode !== "dataset") return;
        setJob(latest);
        if (FINISHED_STATUSES.includes(latest.status)) localStorage.removeItem(REPLAY_JOB_KEY);
      } catch {
        localStorage.removeItem(REPLAY_JOB_KEY);
      }
    }
    restoreJob();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!job?.jobId || FINISHED_STATUSES.includes(job.status)) return;
    localStorage.setItem(REPLAY_JOB_KEY, job.jobId);
    const id = setInterval(async () => {
      try {
        const latest = await sentinel.detectionJob(job.jobId);
        setJob(latest);
        if (FINISHED_STATUSES.includes(latest.status)) localStorage.removeItem(REPLAY_JOB_KEY);
        refreshStats();
        refreshLogs();
      } catch (error) {
        toast.error((error as Error).message);
      }
    }, 2500);
    return () => clearInterval(id);
  }, [job?.jobId, job?.status, refreshLogs, refreshStats]);

  const selectedDataset = datasets.data?.find(item => item.id === datasetId);
  const selectedModel = modelHistory.data?.find(item => item.version === modelVersion) ?? currentModel.data;
  const running = job ? ["queued", "running"].includes(job.status) : false;
  const visibleLogs = logs.data ?? [];
  const selectedCount = selectedLogIds.length;
  const allLogsSelected = visibleLogs.length > 0 && selectedCount === visibleLogs.length;
  const someLogsSelected = selectedCount > 0 && selectedCount < visibleLogs.length;

  const toggleLogSelection = (logId: string) => {
    setSelectedLogIds(previous => (
      previous.includes(logId)
        ? previous.filter(id => id !== logId)
        : [...previous, logId]
    ));
  };

  const setAllLogSelections = (checked: boolean) => {
    setSelectedLogIds(checked ? visibleLogs.map(item => item.id) : []);
  };

  const deleteLogsById = async (logIds: string[]) => {
    if (!logIds.length) {
      toast.info("Select at least one detection log to delete");
      return;
    }

    setBusy("delete");
    try {
      const result = await sentinel.deleteLogs(logIds);
      if (result.deleted > 0) {
        toast.success(result.deleted === 1 ? "Detection log deleted" : `Deleted ${result.deleted} detection logs`);
      } else {
        toast.info("No detection logs were deleted");
      }
      if (result.failed > 0) {
        toast.warning(`${result.failed} detection logs could not be deleted`);
      }
      setDeleteMode(false);
      setSelectedLogIds([]);
      refreshLogs();
      refreshStats();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete detection logs");
    } finally {
      setBusy(null);
    }
  };

  const deleteSelectedLogs = () => {
    if (!selectedLogIds.length) {
      toast.info("Select at least one detection log to delete");
      return;
    }

    setDeleteConfirm({
      title: selectedLogIds.length === 1 ? "Delete selected detection log?" : `Delete ${selectedLogIds.length} selected detection logs?`,
      description: "This permanently removes the selected detection logs from Elasticsearch.",
      logIds: selectedLogIds,
    });
  };

  const deleteSingleLog = (timestamp: string, logId: string) => {
    setDeleteConfirm({
      title: `Delete detection log at ${format(new Date(timestamp), "HH:mm:ss")}?`,
      description: "This permanently removes this detection event from Elasticsearch.",
      logIds: [logId],
    });
  };

  const refreshAll = () => {
    refreshStats();
    refreshLogs();
    datasets.refresh();
  };

  const onUpload = async (file: File) => {
    setBusy("upload");
    try {
      const result = await sentinel.uploadDataset(file);
      await datasets.refresh();
      setDatasetId(result.datasetId);
      toast.success(`Dataset uploaded: ${result.name}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startReplay = async () => {
    if (!datasetId) return;
    setBusy("start");
    try {
      const result = await sentinel.startDatasetDetection({ dataset: "raw", datasetId, delay: 0.1, reportEvery: 50, modelVersion });
      localStorage.setItem(REPLAY_JOB_KEY, result.jobId);
      setJob({
        jobId: result.jobId,
        mode: "dataset",
        status: "queued",
        logs: "[INFO] Dataset detection queued",
        modelVersion,
        modelAlgorithm: selectedModel?.algorithm,
        modelDataset: selectedModel?.datasetName,
      });
      toast.success("Dataset replay started");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const stopReplay = async () => {
    setBusy("stop");
    try {
      await sentinel.stopMonitoring(job?.jobId);
      localStorage.removeItem(REPLAY_JOB_KEY);
      if (job) setJob({ ...job, status: "stopped", logs: `${job.logs ?? ""}\n[INFO] Stop requested` });
      toast.success("Replay stopped");
      refreshAll();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "delete"}
              onClick={() => {
                const ids = deleteConfirm?.logIds ?? [];
                setDeleteConfirm(null);
                void deleteLogsById(ids);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dataset Replay Detection</h1>
          <p className="text-sm text-muted-foreground">Upload or choose a labelled CSV dataset, replay it through the model, and store results in Elasticsearch.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TimeRangePicker rangeMinutes={rangeMinutes} onRangeChange={setRangeMinutes} onRefresh={refreshAll} />
          <Button variant="outline" size="sm" className="h-10" onClick={refreshAll}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Replay State" value={running ? "Active" : "Paused"} tone={running ? "success" : "warning"} hint={job?.jobId ?? "No active replay"} />
        <StatCard label="Events In Range" value={stats.data?.totalTraffic?.toLocaleString() ?? "-"} tone="info" />
        <StatCard label="Anomalies In Range" value={stats.data?.anomalies?.toLocaleString() ?? "-"} tone="danger" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Replay source</h2>
          <p className="mt-1 text-xs text-muted-foreground">Preset and uploaded CSV files are read by the backend detector.</p>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Dataset</Label>
              <Select value={datasetId} onValueChange={setDatasetId} disabled={datasets.loading || !datasets.data?.length}>
                <SelectTrigger><SelectValue placeholder="Select a dataset" /></SelectTrigger>
                <SelectContent>
                  {(datasets.data ?? []).map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name} ({item.source})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Detection model</Label>
              <Select value={modelVersion} onValueChange={setModelVersion} disabled={modelHistory.loading || !modelHistory.data?.length}>
                <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
                <SelectContent>
                  {(modelHistory.data ?? []).map(item => (
                    <SelectItem key={item.version} value={item.version}>
                      {item.version} ({item.algorithm}) - {item.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedModel ? `Using ${selectedModel.version} (${selectedModel.algorithm}).` : "Choose the model for this replay run."}
              </p>
            </div>

            {selectedDataset && (
              <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
                <div className="flex items-center gap-2 font-medium">
                  <Database className="h-3.5 w-3.5" /> {selectedDataset.filename}
                </div>
                <p className="mt-1 text-muted-foreground">{selectedDataset.path}</p>
                <p className="mt-1 text-muted-foreground">{(selectedDataset.sizeBytes / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Upload labelled CSV</Label>
              <div className="flex gap-2">
                <Input ref={fileRef} type="file" accept=".csv" onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])} />
                <Button variant="outline" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
                  {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={startReplay} disabled={!datasetId || busy !== null || running} className="bg-success text-success-foreground hover:opacity-90">
                {busy === "start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Start Replay Detection
              </Button>
              <Button variant="destructive" onClick={stopReplay} disabled={!running || busy !== null}>
                {busy === "stop" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                Stop
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">Replay job log</h2>
            <p className="text-xs text-muted-foreground">{job ? `${job.jobId} - ${job.status}` : "Start replay detection to see output here."}</p>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {job?.logs || "Replay logs will appear here live."}
          </pre>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div>
            <h2 className="text-sm font-semibold">Recent Detection Events</h2>
            <p className="text-xs text-muted-foreground">Events stored in Elasticsearch for the selected time range.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(logsLimit)} onValueChange={(v) => setLogsLimit(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>Limit {n}</SelectItem>)}
              </SelectContent>
            </Select>
            {deleteMode ? (
              <>
                <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
                <Button variant="outline" size="sm" onClick={() => setDeleteMode(false)} disabled={busy === "delete"}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={deleteSelectedLogs} disabled={busy === "delete" || selectedCount === 0}>
                  {busy === "delete" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Delete Selected
                </Button>
              </>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setDeleteMode(true)} disabled={busy === "delete" || !visibleLogs.length}>
                <Trash2 className="mr-2 h-4 w-4" />
                Select to Delete
              </Button>
            )}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              {deleteMode && (
                <TableHead className="w-12">
                  <Checkbox
                    aria-label="Select all detection logs"
                    checked={allLogsSelected ? true : someLogsSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => setAllLogSelections(checked === true)}
                  />
                </TableHead>
              )}
              <TableHead>Time</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead>Class</TableHead>
              {!deleteMode && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleLogs.map(item => (
              <TableRow key={item.id}>
                {deleteMode && (
                  <TableCell className="w-12">
                    <Checkbox
                      aria-label={`Select detection log at ${format(new Date(item.timestamp), "HH:mm:ss")}`}
                      checked={selectedLogIds.includes(item.id)}
                      onCheckedChange={() => toggleLogSelection(item.id)}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-xs">{format(new Date(item.timestamp), "HH:mm:ss")}</TableCell>
                <TableCell className="font-mono text-xs">{item.protocol}</TableCell>
                <TableCell className="font-mono text-xs">{item.sourceIp}</TableCell>
                <TableCell className="font-mono text-xs">{item.destinationIp}</TableCell>
                <TableCell className={item.classification === "anomaly" ? "font-medium text-destructive" : "text-success"}>{item.classification}</TableCell>
                {!deleteMode && (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={`Delete detection log at ${format(new Date(item.timestamp), "HH:mm:ss")}`}
                      disabled={busy === "delete"}
                      onClick={() => deleteSingleLog(item.timestamp, item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
