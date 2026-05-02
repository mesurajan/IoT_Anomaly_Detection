import { useEffect, useState } from "react";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import { StatCard } from "@/components/sentinel/StatCard";
import { LoadingBlock } from "@/components/sentinel/States";
import { Cpu, MemoryStick, Server, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

const stateClass: Record<string, string> = {
  up: "text-success", down: "text-destructive", degraded: "text-warning",
};

export default function Health() {
  const { data, loading } = usePolling(() => sentinel.systemHealth(), 8000);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading || !data) return <LoadingBlock />;

  const baseUptime = Number(data.uptimeSec ?? 0);

  const uptimeSec = Math.max(0, baseUptime + tick);
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = Math.floor(uptimeSec % 60);
  const uptimeLabel = uptimeSec > 0
    ? `${days}d ${hours}h ${minutes}m ${seconds}s`
    : "just started";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
        <p className="text-sm text-muted-foreground">Subsystem status and resource utilization.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="API" value={data.api} tone="success" icon={<Server className="h-4 w-4" />} />
        <StatCard label="Ingest" value={data.ingest} tone={data.ingest === "up" ? "success" : "warning"} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Model service" value={data.modelService} tone="success" icon={<Cpu className="h-4 w-4" />} />
        <StatCard label="Kibana" value={data.kibana} tone={data.kibana === "up" ? "success" : "warning"} icon={<Server className="h-4 w-4" />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><Cpu className="h-4 w-4" />CPU</h2>
            <span className="font-mono text-sm">{data.cpuPct}%</span>
          </div>
          <Progress value={data.cpuPct} className="mt-3" />
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2"><MemoryStick className="h-4 w-4" />Memory</h2>
            <span className="font-mono text-sm">{data.memPct}%</span>
          </div>
          <Progress value={data.memPct} className="mt-3" />
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Uptime</p>
        <p className="mt-1 font-mono text-lg">{uptimeLabel}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          API: <span className={stateClass[data.api]}>{data.api}</span> -
          Ingest: <span className={stateClass[data.ingest]}> {data.ingest}</span> -
          Model: <span className={stateClass[data.modelService]}> {data.modelService}</span> -
          Kibana: <span className={stateClass[data.kibana]}> {data.kibana}</span>
        </p>
      </section>
    </div>
  );
}
