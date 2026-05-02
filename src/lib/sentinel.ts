/**
 * Service layer. Tries real API first; on ApiUnavailableError, falls back to mock data
 * so the UI stays functional during development and demos.
 */
import { api, ApiUnavailableError, getAuthToken } from "./api";
import { getConfig } from "./config";
import {
  mockAlerts, mockAudit, mockCurrentModel, mockHealth, mockLogs,
  mockModelHistory, mockProtocolDistribution, mockStats, mockTrend,
  setMockMonitoring,
} from "./mock";
import type {
  AdminUser, AlertItem, AuditEntry, DatasetInfo, DetectionJob, LogItem, ModelAlgorithm, ModelInfo,
  ProtocolDistributionItem, Stats, SystemHealth, TrendPoint,
  TrainingJob, WiresharkInterfaceResponse,
} from "./types";

async function withFallback<T>(real: () => Promise<T>, fallback: () => T, tag: string): Promise<{ data: T; degraded: boolean; reason?: string }> {
  try {
    const data = await real();
    return { data, degraded: false };
  } catch (err) {
    if (err instanceof ApiUnavailableError) {
      return { data: fallback(), degraded: true, reason: `${tag}: backend unavailable` };
    }
    throw err;
  }
}

function emitAlertsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("sentinel:alerts-changed"));
}

function normalizeStats(raw: any): Stats {
  return {
    totalTraffic: Number(raw.totalTraffic ?? raw.total_events ?? 0),
    normalTraffic: Number(raw.normalTraffic ?? raw.normal ?? 0),
    anomalies: Number(raw.anomalies ?? 0),
    activeAlerts: Number(raw.activeAlerts ?? raw.anomalies ?? 0),
    modelAccuracy: Number(raw.modelAccuracy ?? raw.model_accuracy ?? 0.999),
    latencyMs: Number(raw.latencyMs ?? raw.latency_ms ?? 0),
    monitoring: Boolean(raw.monitoring ?? false),
  };
}

function normalizeAlert(raw: any): AlertItem {
  const severity = String(raw.severity ?? "LOW").toLowerCase();
  const status = String(raw.status ?? "open");
  return {
    id: String(raw.id ?? raw._id ?? `${raw.timestamp}-${raw.source_ip}`),
    timestamp: String(raw.timestamp ?? new Date().toISOString()),
    severity: ["low", "medium", "high", "critical"].includes(severity) ? severity as AlertItem["severity"] : "low",
    protocol: String(raw.protocol ?? "UNKNOWN"),
    sourceIp: String(raw.sourceIp ?? raw.source_ip ?? "UNKNOWN"),
    destinationIp: String(raw.destinationIp ?? raw.destination_ip ?? "UNKNOWN"),
    description: String(raw.description ?? `${raw.prediction ?? "ANOMALY"} traffic detected`),
    status: ["open", "acknowledged", "true_attack", "false_positive"].includes(status) ? status as AlertItem["status"] : "open",
  };
}

function normalizeLog(raw: any): LogItem {
  const prediction = String(raw.classification ?? raw.prediction ?? "").toLowerCase();
  return {
    id: String(raw.id ?? raw._id ?? `${raw.timestamp}-${raw.source_ip}`),
    timestamp: String(raw.timestamp ?? new Date().toISOString()),
    protocol: String(raw.protocol ?? "UNKNOWN"),
    sourceIp: String(raw.sourceIp ?? raw.source_ip ?? "UNKNOWN"),
    destinationIp: String(raw.destinationIp ?? raw.destination_ip ?? "UNKNOWN"),
    bytes: Number(raw.bytes ?? raw.packet_size ?? 0),
    packets: Number(raw.packets ?? 1),
    classification: prediction === "anomaly" ? "anomaly" : "normal",
    score: Number(raw.score ?? (prediction === "anomaly" ? 0.95 : 0.05)),
  };
}

function normalizeProtocol(raw: any): ProtocolDistributionItem[] {
  if (Array.isArray(raw)) return raw;
  const distribution = raw.distribution ?? {};
  return Object.entries(distribution).map(([protocol, count]) => ({
    protocol,
    count: Number(count),
  }));
}

function normalizeAudit(raw: any): AuditEntry {
  return {
    id: String(raw.id ?? `${raw.timestamp}-${raw.action}`),
    timestamp: String(raw.timestamp ?? new Date().toISOString()),
    actor: String(raw.actor ?? "unknown"),
    action: String(raw.action ?? "unknown"),
    target: raw.target ? String(raw.target) : undefined,
    outcome: raw.outcome === "failure" ? "failure" : "success",
  };
}

function normalizeHealth(raw: any): SystemHealth {
  const status = String(raw.status ?? (raw.ok ? "up" : "degraded"));
  const es = String(raw.elasticsearch_status ?? "degraded");
  const kibana = String(raw.kibana_status ?? "degraded");
  const model = String(raw.model_status ?? "degraded");
  const disk = raw.disk ?? {};
  return {
    api: status === "up" ? "up" : "degraded",
    ingest: es === "up" ? "up" : "degraded",
    modelService: model === "up" ? "up" : "degraded",
    kibana: kibana === "up" ? "up" : "degraded",
    cpuPct: Number(raw.cpuPct ?? 0),
    memPct: Number(raw.memPct ?? disk.usedPct ?? 0),
    uptimeSec: Number(raw.uptimeSec ?? 0),
  };
}

export const sentinel = {
  health: () => withFallback(() => api.get<any>("/api/health"), () => ({ status: "ok" }), "health"),
  stats: (rangeMinutes?: number, eventSource?: string) => withFallback(async () => normalizeStats(await api.get<any>("/api/stats", { rangeMinutes, eventSource })), mockStats, "stats"),
  alerts: (limit: number, rangeMinutes?: number, eventSource?: string) => withFallback(async () => {
    const raw = await api.get<any>("/api/alerts", { limit, rangeMinutes, eventSource });
    return (Array.isArray(raw) ? raw : raw.alerts ?? []).map(normalizeAlert);
  }, () => mockAlerts(limit), "alerts"),
  logs: (limit: number, rangeMinutes?: number, eventSource?: string) => withFallback(async () => {
    const raw = await api.get<any>("/api/logs", { limit, rangeMinutes, eventSource });
    return (Array.isArray(raw) ? raw : raw.logs ?? []).map(normalizeLog);
  }, () => mockLogs(limit), "logs"),
  protocolDistribution: (limit: number, rangeMinutes?: number, eventSource?: string) =>
    withFallback(async () => normalizeProtocol(await api.get<any>("/api/protocol-distribution", { limit, rangeMinutes, eventSource })), mockProtocolDistribution, "protocols"),
  users: () => withFallback(async () => {
    const raw = await api.get<any>("/api/users");
    return Array.isArray(raw) ? raw : raw.users ?? [];
  }, () => [], "users"),
  createUser: (payload: { username: string; password: string; role: "admin" | "analyst" }) =>
    api.post<{ user: AdminUser }>("/api/users", payload),
  updateUser: (userId: string, payload: { username: string; role: "admin" | "analyst"; password?: string }) =>
    api.put<{ user: AdminUser }>(`/api/users/${encodeURIComponent(userId)}`, payload),
  deleteUser: (userId: string) => api.del(`/api/users/${encodeURIComponent(userId)}`),
  trend: (rangeMinutes?: number, eventSource?: string) => withFallback(async () => {
    const raw = await api.get<any>("/api/trend", { rangeMinutes, eventSource, limit: 30 });
    return Array.isArray(raw) ? raw : raw.points ?? [];
  }, () => mockTrend(), "trend"),

  datasets: () => withFallback(async () => {
    const raw = await api.get<{ datasets: DatasetInfo[] }>("/api/datasets");
    return raw.datasets;
  }, () => [], "datasets"),
  algorithms: () => withFallback(async () => {
    const raw = await api.get<{ algorithms: ModelAlgorithm[] }>("/api/models/algorithms");
    return raw.algorithms;
  }, () => [{ id: "random_forest", name: "Random Forest", available: true, note: "Default model" }], "algorithms"),
  preprocessDataset: async (datasetId: string) => api.post<any>(`/api/datasets/${encodeURIComponent(datasetId)}/preprocess`),

  startMonitoring: async () => {
    try { return await api.post<{ jobId: string; status: string }>("/api/monitoring/start", { dataset: "raw", delay: 0.1, reportEvery: 50 }); }
    catch (err) { if (!(err instanceof ApiUnavailableError)) throw err; return { jobId: `mock-detect-${Date.now()}`, status: "queued" }; }
  },
  stopMonitoring: async (jobId?: string) => {
    try { await api.post("/api/monitoring/stop", jobId ? { jobId } : undefined); }
    catch (err) { if (!(err instanceof ApiUnavailableError)) throw err; }
    setMockMonitoring(false);
  },
  startDatasetDetection: (payload: { dataset?: "raw" | "sample"; datasetId?: string; input?: string; delay?: number; reportEvery?: number; modelVersion?: string }) =>
    api.post<{ jobId: string; status: string }>("/api/detection/start", payload),
  wiresharkInterfaces: () => withFallback(async () => {
    const raw = await api.get<WiresharkInterfaceResponse>("/api/wireshark/interfaces");
    return raw;
  }, () => ({ available: false, interfaces: [], message: "Backend unavailable" }), "wireshark-interfaces"),
  startWiresharkDetection: (payload: { interfaceId: string; maxPackets?: number; runForever?: boolean }) =>
    api.post<{ jobId: string; status: string }>("/api/wireshark/start", payload),
  detectionJob: (jobId: string) => api.get<DetectionJob>(`/api/detection/jobs/${jobId}`),
  latestDetectionJob: async () => {
    const raw = await api.get<{ job: DetectionJob | null }>("/api/detection/jobs/latest", { active: true });
    return raw.job;
  },

  retrain: async (payload: { datasetName?: string; datasetId?: string; maxRows?: number; algorithm?: string }) => {
    try { return await api.post<{ jobId: string; status: string }>("/api/retrain", payload); }
    catch (err) {
      if (err instanceof ApiUnavailableError) return { jobId: `mock-job-${Date.now()}`, status: "queued" };
      throw err;
    }
  },
  retrainJob: (jobId: string) => api.get<TrainingJob>(`/api/retrain/jobs/${jobId}`),
  latestRetrainJob: async () => {
    const raw = await api.get<{ job: TrainingJob | null }>("/api/retrain/jobs/latest", { active: true });
    return raw.job;
  },
  uploadDataset: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    try { return await api.post<{ datasetId: string; name: string }>("/api/datasets/upload", fd); }
    catch (err) {
      if (err instanceof ApiUnavailableError) return { datasetId: `mock-${Date.now()}`, name: file.name };
      throw err;
    }
  },

  currentModel: () => withFallback(() => api.get<ModelInfo>("/api/models/current"), mockCurrentModel, "model"),
  modelHistory: () => withFallback(() => api.get<ModelInfo[]>("/api/models/history"), mockModelHistory, "model-history"),
  promoteModel: async (version: string) => {
    try { await api.post(`/api/models/promote`, { version }); }
    catch (err) { if (!(err instanceof ApiUnavailableError)) throw err; }
  },

  acknowledgeAlert: async (id: string) => {
    try { await api.post(`/api/alerts/${encodeURIComponent(id)}/acknowledge`); emitAlertsChanged(); }
    catch (err) { if (!(err instanceof ApiUnavailableError)) throw err; }
  },
  feedbackAlert: async (id: string, label: "true_attack" | "false_positive") => {
    try { await api.post(`/api/alerts/${encodeURIComponent(id)}/feedback`, { label }); emitAlertsChanged(); }
    catch (err) { if (!(err instanceof ApiUnavailableError)) throw err; }
  },

  audit: (limit = 100, offset = 0) => withFallback(async () => {
    const raw = await api.get<any>("/api/audit/logs", { limit, offset });
    return (Array.isArray(raw) ? raw : raw.events ?? []).map(normalizeAudit);
  }, mockAudit, "audit"),
  recordAudit: async (payload: { action: string; target?: string; outcome?: "success" | "failure"; detail?: Record<string, unknown> }) => {
    try { await api.post("/api/audit/events", payload); }
    catch (err) { if (!(err instanceof ApiUnavailableError)) throw err; }
  },
  systemHealth: () => withFallback(async () => normalizeHealth(await api.get<any>("/api/health")), mockHealth, "system-health"),

  exportReport: async (type: "alerts" | "logs" = "alerts", format: "csv" | "json" = "csv") => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${getConfig().apiBaseUrl}/api/reports/export?type=${type}&format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  },
};

export type TrendData = TrendPoint[];
