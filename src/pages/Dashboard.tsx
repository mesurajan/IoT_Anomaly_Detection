import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ShieldCheck, Zap, Gauge, Server, RefreshCw, ArrowRight,
  CalendarDays, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format } from "date-fns";
import { useAuth } from "@/auth/AuthContext";
import { sentinel } from "@/lib/sentinel";
import { usePolling } from "@/lib/hooks";
import { getConfig } from "@/lib/config";
import { StatCard } from "@/components/sentinel/StatCard";
import { LoadingBlock } from "@/components/sentinel/States";
import { SeverityBadge, StatusBadge } from "@/components/sentinel/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PIE_COLORS = [
  "hsl(187 92% 52%)", "hsl(173 80% 45%)", "hsl(210 95% 60%)",
  "hsl(38 95% 58%)", "hsl(280 80% 60%)", "hsl(0 84% 60%)", "hsl(142 70% 45%)",
];

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

const COMMON_RANGES = [
  { label: "Today", minutes: 24 * 60 },
  { label: "This week", minutes: 7 * 24 * 60 },
  { label: "Last 1 minute", minutes: 1 },
  { label: "Last 15 minutes", minutes: 15 },
  { label: "Last 30 minutes", minutes: 30 },
  { label: "Last 1 hour", minutes: 60 },
  { label: "Last 24 hours", minutes: 24 * 60 },
  { label: "Last 7 days", minutes: 7 * 24 * 60 },
  { label: "Last 30 days", minutes: 30 * 24 * 60 },
  { label: "Last 90 days", minutes: 90 * 24 * 60 },
  { label: "Last 1 year", minutes: 365 * 24 * 60 },
];

const UNIT_TO_MINUTES = {
  Minutes: 1,
  Hours: 60,
  Days: 24 * 60,
} as const;

type TimeUnit = keyof typeof UNIT_TO_MINUTES;
const RANGE_STORAGE_KEY = "sentinel.dashboard.rangeMinutes";

function loadStoredRangeMinutes() {
  if (typeof window === "undefined") return 15;
  const raw = Number(window.localStorage.getItem(RANGE_STORAGE_KEY) || 15);
  return Number.isFinite(raw) && raw >= 1 ? raw : 15;
}

function rangeLabel(minutes: number) {
  const common = COMMON_RANGES.find(item => item.minutes === minutes);
  if (common) return common.label;
  if (minutes % (24 * 60) === 0) return `Last ${minutes / (24 * 60)} days`;
  if (minutes % 60 === 0) return `Last ${minutes / 60} hours`;
  return `Last ${minutes} minutes`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const cfg = getConfig();
  const [rangeMinutes, setRangeMinutes] = useState(loadStoredRangeMinutes);
  const [draftAmount, setDraftAmount] = useState(() => {
    const initial = loadStoredRangeMinutes();
    if (Number.isInteger(initial / UNIT_TO_MINUTES.Days) && initial >= UNIT_TO_MINUTES.Days) return initial / UNIT_TO_MINUTES.Days;
    if (Number.isInteger(initial / UNIT_TO_MINUTES.Hours) && initial >= UNIT_TO_MINUTES.Hours) return initial / UNIT_TO_MINUTES.Hours;
    return initial;
  });
  const [draftUnit, setDraftUnit] = useState<TimeUnit>(() => {
    const initial = loadStoredRangeMinutes();
    if (Number.isInteger(initial / UNIT_TO_MINUTES.Days) && initial >= UNIT_TO_MINUTES.Days) return "Days";
    if (Number.isInteger(initial / UNIT_TO_MINUTES.Hours) && initial >= UNIT_TO_MINUTES.Hours) return "Hours";
    return "Minutes";
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(60);
  const [timeOpen, setTimeOpen] = useState(false);

  const stats = usePolling(() => sentinel.stats(rangeMinutes), 8000, [rangeMinutes]);
  const trend = usePolling(() => sentinel.trend(rangeMinutes), 15000, [rangeMinutes]);
  const protos = usePolling(() => sentinel.protocolDistribution(cfg.defaultLimit, rangeMinutes), 15000, [rangeMinutes, cfg.defaultLimit]);
  const alerts = usePolling(() => sentinel.alerts(8, rangeMinutes), 10000, [rangeMinutes]);
  const logs = usePolling(() => sentinel.logs(8, rangeMinutes), 10000, [rangeMinutes]);
  const isAdmin = user?.role === "admin";

  const refreshDashboard = () => {
    stats.refresh();
    trend.refresh();
    protos.refresh();
    alerts.refresh();
    logs.refresh();
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refreshDashboard, Math.max(5, refreshSeconds) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshSeconds]);

  useEffect(() => {
    window.localStorage.setItem(RANGE_STORAGE_KEY, String(rangeMinutes));
  }, [rangeMinutes]);

  const applyDraftRange = () => {
    const minutes = Math.max(1, Math.floor(draftAmount || 1)) * UNIT_TO_MINUTES[draftUnit];
    setRangeMinutes(minutes);
    refreshDashboard();
    setTimeOpen(false);
  };

  const chooseRange = (minutes: number) => {
    setRangeMinutes(minutes);
    const dayValue = minutes / UNIT_TO_MINUTES.Days;
    const hourValue = minutes / UNIT_TO_MINUTES.Hours;
    if (Number.isInteger(dayValue) && dayValue >= 1) {
      setDraftAmount(dayValue);
      setDraftUnit("Days");
    } else if (Number.isInteger(hourValue) && hourValue >= 1) {
      setDraftAmount(hourValue);
      setDraftUnit("Hours");
    } else {
      setDraftAmount(minutes);
      setDraftUnit("Minutes");
    }
    refreshDashboard();
    setTimeOpen(false);
  };

  const chartTrend = useMemo(() => {
    const points = trend.data ?? [];
    const cutoff = Date.now() - rangeMinutes * 60_000;
    const filtered = points.filter(point => new Date(point.time).getTime() >= cutoff);
    const visible = filtered.length >= 2 ? filtered : points;
    return visible.map(p => ({
      ...p, label: format(new Date(p.time), "HH:mm"),
    }));
  }, [trend.data, rangeMinutes]);

  const s = stats.data;
  const totalTraffic = s?.totalTraffic ?? 0;
  const normalPct = totalTraffic ? (s?.normalTraffic ?? 0) / totalTraffic * 100 : 0;
  const anomalyPct = totalTraffic ? (s?.anomalies ?? 0) / totalTraffic * 100 : 0;
  const selectedRangeLabel = rangeLabel(rangeMinutes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user?.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Operational overview of the IoT detection pipeline." : "Live anomaly investigation workspace."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Popover open={timeOpen} onOpenChange={setTimeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 gap-2 border-border bg-card px-3 text-foreground hover:bg-secondary">
                <CalendarDays className="h-4 w-4 text-primary" />
                {selectedRangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(92vw,470px)] rounded-lg border-border bg-card p-0 shadow-card">
              <div className="relative">
                <div className="absolute -top-2 right-28 h-4 w-4 rotate-45 border-l border-t border-border bg-card" />
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Quick select</p>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]">
                    <Select defaultValue="Last">
                      <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Last">Last</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      value={draftAmount}
                      onChange={(event) => setDraftAmount(Number(event.target.value))}
                      className="h-9 bg-background"
                    />
                    <Select value={draftUnit} onValueChange={(value) => setDraftUnit(value as TimeUnit)}>
                      <SelectTrigger className="h-9 bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Minutes">Minutes</SelectItem>
                        <SelectItem value="Hours">Hours</SelectItem>
                        <SelectItem value="Days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-9 bg-primary text-primary-foreground hover:bg-primary/90" onClick={applyDraftRange}>
                      Apply
                    </Button>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-sm font-semibold">Commonly used</p>
                    <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                      {COMMON_RANGES.map(item => (
                        <button
                          key={item.label}
                          type="button"
                          className="text-left text-sm text-primary transition-colors hover:text-primary-glow"
                          onClick={() => chooseRange(item.minutes)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-border pt-3">
                    <p className="mb-2 text-sm font-semibold">Recently used date ranges</p>
                    <button type="button" className="text-left text-sm text-primary hover:text-primary-glow" onClick={() => chooseRange(7 * 24 * 60)}>
                      Last 7 days
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                    <span className="text-sm font-medium">Refresh every</span>
                    <Input
                      type="number"
                      min={5}
                      value={refreshSeconds}
                      onChange={(event) => setRefreshSeconds(Number(event.target.value))}
                      disabled={!autoRefresh}
                      className="h-9 w-24 bg-background"
                    />
                    <span className="text-sm text-muted-foreground">Seconds</span>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" className="h-10" onClick={refreshDashboard}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Traffic"
          value={s ? s.totalTraffic.toLocaleString() : "-"}
          icon={<Activity className="h-4 w-4" />}
          hint={selectedRangeLabel.toLowerCase()}
          variant="kibana"
        />
        <StatCard
          label="Normal"
          value={s ? s.normalTraffic.toLocaleString() : "-"}
          tone="success"
          icon={<ShieldCheck className="h-4 w-4" />}
          delta={totalTraffic ? `${normalPct.toFixed(1)}% of traffic` : undefined}
          variant="kibana"
        />
        <StatCard
          label="Anomalies"
          value={s ? s.anomalies.toLocaleString() : "-"}
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" />}
          delta={totalTraffic ? `${anomalyPct.toFixed(1)}% of traffic` : undefined}
          variant="kibana"
        />
        <StatCard
          label="Active Alerts"
          value={s ? s.activeAlerts : "-"}
          tone="warning"
          icon={<Zap className="h-4 w-4" />}
          variant="kibana"
        />
        <StatCard
          label="Model Accuracy"
          value={s ? `${(s.modelAccuracy * 100).toFixed(1)}%` : "-"}
          tone="info"
          icon={<Gauge className="h-4 w-4" />}
          variant="kibana"
        />
        <StatCard
          label="Latency"
          value={s ? `${s.latencyMs} ms` : "-"}
          tone="default"
          icon={<Server className="h-4 w-4" />}
          hint={s?.monitoring ? "Monitoring active" : "Monitoring paused"}
          variant="kibana"
        />
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="kbn-panel lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="kbn-panel-title">Anomaly Trend</h2>
              <p className="kbn-panel-subtitle">Normal vs anomalous traffic over time</p>
            </div>
          </div>
          {trend.loading ? <LoadingBlock /> : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gNormal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(187 92% 52%)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(187 92% 52%)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gAnom" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(0 84% 60%)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(0 84% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="normal" stroke="hsl(187 92% 52%)" fill="url(#gNormal)" strokeWidth={2} />
                  <Area type="monotone" dataKey="anomaly" stroke="hsl(0 84% 60%)" fill="url(#gAnom)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="kbn-panel">
          <h2 className="kbn-panel-title">Protocol Distribution</h2>
          <p className="kbn-panel-subtitle">Share of traffic by protocol</p>
          {protos.loading ? <LoadingBlock /> : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={protos.data ?? []} dataKey="count" nameKey="protocol" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {(protos.data ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="hsl(var(--card))" />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section className="kbn-panel">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="kbn-panel-title">Recent Traffic Activity</h2>
            <p className="kbn-panel-subtitle">Bytes per protocol observed in latest window</p>
          </div>
        </div>
        {protos.loading ? <LoadingBlock /> : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={protos.data ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="protocol" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(187 92% 52%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Tables */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="kbn-panel p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="kbn-panel-title">Recent Alerts</h2>
              <p className="kbn-panel-subtitle">Latest detection events</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/alerts">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
          </div>
          {alerts.loading ? <LoadingBlock className="m-4" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(alerts.data ?? []).slice(0, 6).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{format(new Date(a.timestamp), "HH:mm:ss")}</TableCell>
                    <TableCell><SeverityBadge severity={a.severity} /></TableCell>
                    <TableCell className="font-mono text-xs">{a.protocol}</TableCell>
                    <TableCell className="font-mono text-xs">{a.sourceIp}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="kbn-panel p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h2 className="kbn-panel-title">Recent Logs</h2>
              <p className="kbn-panel-subtitle">Latest classified flows</p>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/logs">View all <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
          </div>
          {logs.loading ? <LoadingBlock className="m-4" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Proto</TableHead>
                  <TableHead>Src to Dst</TableHead>
                  <TableHead className="text-right">Bytes</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs.data ?? []).slice(0, 6).map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{format(new Date(l.timestamp), "HH:mm:ss")}</TableCell>
                    <TableCell className="font-mono text-xs">{l.protocol}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{l.sourceIp} {"->"} {l.destinationIp}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{l.bytes.toLocaleString()}</TableCell>
                    <TableCell>
                      <span className={l.classification === "anomaly" ? "text-destructive font-medium" : "text-success"}>
                        {l.classification}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

    </div>
  );
}
