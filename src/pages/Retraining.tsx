import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Cpu, Database, Loader2, RefreshCw, Rocket, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { confirmAdminAction } from "@/lib/adminActionToast";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import type { TrainingJob } from "@/lib/types";
import { StatCard } from "@/components/sentinel/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const TRAINING_JOB_KEY = "sentinel.activeTrainingJobId";
const FINISHED_STATUSES = ["completed", "failed"];

export default function Retraining() {
  const current = usePolling(() => sentinel.currentModel(), 5000);
  const history = usePolling(() => sentinel.modelHistory(), 5000);
  const datasets = usePolling(() => sentinel.datasets(), 0);
  const algorithms = usePolling(() => sentinel.algorithms(), 0);
  const [datasetId, setDatasetId] = useState("");
  const [algorithm, setAlgorithm] = useState("random_forest");
  const [job, setJob] = useState<TrainingJob | null>(null);
  const [busy, setBusy] = useState<"upload" | "preprocess" | "train" | "promote" | "delete" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function restoreJob() {
      try {
        const savedJobId = localStorage.getItem(TRAINING_JOB_KEY);
        const latest = savedJobId
          ? await sentinel.retrainJob(savedJobId)
          : await sentinel.latestRetrainJob();
        if (cancelled || !latest) return;
        setJob(latest);
        if (FINISHED_STATUSES.includes(latest.status)) localStorage.removeItem(TRAINING_JOB_KEY);
        else localStorage.setItem(TRAINING_JOB_KEY, latest.jobId);
      } catch {
        try {
          const latest = await sentinel.latestRetrainJob();
          if (!cancelled && latest) {
            setJob(latest);
            localStorage.setItem(TRAINING_JOB_KEY, latest.jobId);
          }
        } catch { /* no active training job to restore */ }
      }
    }
    restoreJob();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!datasetId && datasets.data?.length) {
      setDatasetId(datasets.data[0].id);
    }
  }, [datasetId, datasets.data]);

  useEffect(() => {
    if (!job?.jobId || FINISHED_STATUSES.includes(job.status)) return;
    localStorage.setItem(TRAINING_JOB_KEY, job.jobId);
    const id = setInterval(async () => {
      try {
        const latest = await sentinel.retrainJob(job.jobId);
        setJob(latest);
        if (latest.status === "completed") {
          localStorage.removeItem(TRAINING_JOB_KEY);
          toast.success(`Training completed: ${latest.version ?? latest.model?.version ?? "candidate model"}`);
          current.refresh();
          history.refresh();
        }
        if (latest.status === "failed") {
          localStorage.removeItem(TRAINING_JOB_KEY);
          toast.error(latest.error ?? "Training failed");
        }
      } catch (e) {
        const message = (e as Error).message;
        setJob(prev => prev ? { ...prev, status: "failed", error: message } : prev);
        toast.error(message);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [job?.jobId, job?.status]);

  const selectedDataset = datasets.data?.find(d => d.id === datasetId);
  const latestCandidate = job?.model ?? history.data?.find(item => item.status === "candidate");
  const m = current.data;

  const deleteDataset = async (datasetIdToDelete: string) => {
    confirmAdminAction({
      action: "delete",
      target: "dataset",
      description: "Admin action required: delete this uploaded dataset.",
      onConfirm: async () => {
    setBusy("delete");
    try {
      await sentinel.deleteDataset(datasetIdToDelete);
      const remaining = (datasets.data ?? []).filter(item => item.id !== datasetIdToDelete);
      await datasets.refresh();
      if (datasetId === datasetIdToDelete) {
        setDatasetId(remaining[0]?.id ?? "");
      }
      toast.success("Dataset deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
      },
    });
  };

  const promoteLatest = async () => {
    const version = latestCandidate?.version;
    if (!version) return;
    confirmAdminAction({
      action: "promote",
      target: `model ${version}`,
      description: "Admin action required: promote this candidate to production.",
      onConfirm: async () => {
    setBusy("promote");
    try {
      await sentinel.promoteModel(version);
      toast.success(`Promoted ${version} to production`);
      await current.refresh();
      await history.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
      },
    });
  };

  const onUpload = async (file: File) => {
    setBusy("upload");
    try {
      const r = await sentinel.uploadDataset(file);
      await datasets.refresh();
      setDatasetId(r.datasetId);
      toast.success(`Dataset uploaded: ${r.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const preprocess = async () => {
    if (!datasetId) return;
    setBusy("preprocess");
    try {
      const result = await sentinel.preprocessDataset(datasetId);
      toast.success(`Preprocessed ${result.rows.toLocaleString()} rows`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

 const trigger = async () => {
  if (!datasetId) return;

  setBusy("train");
  try {
    const r = await sentinel.retrain({
      datasetName: datasetId,
      algorithm,
      maxRows: 0,
    });

    localStorage.setItem(TRAINING_JOB_KEY, r.jobId);

    setJob({
      jobId: r.jobId,
      status: "queued",
      logs: "[INFO] Job queued",
    });

    toast.success(`Retraining queued: ${r.jobId}`);
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    setBusy(null);
  }
};
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Model Retraining</h1>
          <p className="text-sm text-muted-foreground">Use preset backend CSV datasets or upload a labelled CSV, then train a candidate model.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { datasets.refresh(); current.refresh(); }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Current Version" value={m?.version ?? "-"} tone="info" hint={m?.algorithm} />
        <StatCard label="Last Trained" value={m ? format(new Date(m.trainedAt), "MMM d, HH:mm") : "-"} />
        <StatCard label="Validation Score" value={m ? `${(m.validationScore * 100).toFixed(1)}%` : "-"} tone="success" />
      </section>

      {latestCandidate && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Latest Training Result</h2>
              <p className="mt-1 text-xs text-muted-foreground">Candidate model is ready. Promote it to make it the live production model.</p>
            </div>
            <Button onClick={promoteLatest} disabled={busy === "promote" || latestCandidate.status === "production"} className="bg-success text-success-foreground hover:opacity-90">
              {busy === "promote" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Promote Candidate
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ResultField label="Version" value={latestCandidate.version} mono />
            <ResultField label="Model" value={latestCandidate.algorithm} />
            <ResultField label="Dataset" value={latestCandidate.datasetName} mono />
            <ResultField label="Score" value={`${(latestCandidate.validationScore * 100).toFixed(2)}%`} />
            <ResultField label="Status" value={latestCandidate.status} />
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">1. Choose dataset</h2>
          <p className="mt-1 text-xs text-muted-foreground">Preset datasets are read directly from Backend/data/raw. Uploaded CSVs are saved under Backend/data/uploads.</p>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Dataset</Label>
              <Select value={datasetId} onValueChange={setDatasetId} disabled={datasets.loading || !datasets.data?.length}>
                <SelectTrigger><SelectValue placeholder="Select a dataset" /></SelectTrigger>
                <SelectContent>
                  {(datasets.data ?? []).map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.source})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Training model</Label>
              <Select value={algorithm} onValueChange={setAlgorithm} disabled={algorithms.loading}>
                <SelectTrigger><SelectValue placeholder="Select model" /></SelectTrigger>
                <SelectContent>
                  {(algorithms.data ?? []).map(model => (
                    <SelectItem key={model.id} value={model.id} disabled={!model.available}>
                      {model.name}{model.available ? "" : " (not installed)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {(algorithms.data ?? []).find(item => item.id === algorithm)?.note ?? "Choose the algorithm used for retraining."} Training uses all rows in the selected CSV.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Upload labelled CSV</Label>
              <div className="flex gap-2">
                <Input ref={fileRef} type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
                <Button variant="outline" disabled={busy === "upload"} onClick={() => fileRef.current?.click()}>
                  {busy === "upload" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload
                </Button>
              </div>
            </div>

            <Button variant="outline" disabled={!datasetId || busy === "preprocess"} onClick={preprocess}>
              {busy === "preprocess" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Preprocess Selected Dataset
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">2. Train candidate model</h2>
          <p className="mt-1 text-xs text-muted-foreground">Training runs on the backend. The production model is changed only when you promote a completed candidate.</p>

          <div className="mt-4 rounded-md border border-border bg-secondary/40 p-4 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Selected dataset</p>
            <p className="mt-1 font-mono">{selectedDataset?.name ?? "No dataset selected"}</p>
            <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">Selected model</p>
            <p className="mt-1 font-mono">{(algorithms.data ?? []).find(item => item.id === algorithm)?.name ?? algorithm}</p>
          </div>

          {job && (
            <div className="mt-4 rounded-md border border-border bg-secondary/40 p-4 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Training job</p>
              <p className="mt-1 font-mono">{job.jobId}</p>
              <p className="mt-1">Status: <span className="font-medium">{job.status}</span></p>
              {job.error && <p className="mt-2 text-destructive">{job.error}</p>}
            </div>
          )}

          <div className="mt-4 rounded-md border border-border bg-background">
            <div className="border-b border-border px-4 py-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Training log</p>
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {job?.logs || "Training output will appear here after you start a job."}
            </pre>
          </div>

          <div className="mt-4 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={busy !== null || !datasetId || !(algorithms.data ?? []).find(item => item.id === algorithm)?.available} className="bg-gradient-primary text-primary-foreground">
                  {busy === "train" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cpu className="mr-2 h-4 w-4" />}
                  Retrain Model
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Trigger model retraining?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This queues {(algorithms.data ?? []).find(item => item.id === algorithm)?.name ?? algorithm} training using <span className="font-mono">{selectedDataset?.name}</span>. Promote the candidate from Model Management after validation.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={trigger}>Start retraining</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>

    </div>
  );
}

function ResultField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
