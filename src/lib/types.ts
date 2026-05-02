/**
 * Domain types for the Sentinel IoT app.
 */
export type Role = "admin" | "analyst";

export interface AdminUser {
  id: string;
  username: string;
  role: Role;
  createdAt?: string;
  updatedAt?: string;
  failedAttempts?: number;
  lockUntil?: number | null;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

export interface Stats {
  totalTraffic: number;
  normalTraffic: number;
  anomalies: number;
  activeAlerts: number;
  modelAccuracy: number; // 0..1
  latencyMs: number;
  monitoring: boolean;
}

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "true_attack" | "false_positive";

export interface AlertItem {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  protocol: string;
  sourceIp: string;
  destinationIp: string;
  description: string;
  status: AlertStatus;
}

export interface LogItem {
  id: string;
  timestamp: string;
  protocol: string;
  sourceIp: string;
  destinationIp: string;
  bytes: number;
  packets: number;
  classification: "normal" | "anomaly";
  score: number;
}

export interface ProtocolDistributionItem {
  protocol: string;
  count: number;
}

export interface TrendPoint {
  time: string;
  normal: number;
  anomaly: number;
}

export interface ModelInfo {
  version: string;
  trainedAt: string;
  validationScore: number;
  status: "production" | "candidate" | "archived";
  algorithm: string;
  datasetName: string;
}

export interface DatasetInfo {
  id: string;
  name: string;
  filename: string;
  source: "preset" | "uploaded";
  path: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface TrainingJob {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  version?: string;
  error?: string;
  logs?: string;
  model?: ModelInfo;
}

export interface ModelAlgorithm {
  id: "random_forest" | "tensorflow" | "xgboost" | "lightgbm";
  name: string;
  available: boolean;
  note: string;
}

export interface DetectionJob {
  jobId: string;
  mode: "dataset" | "wireshark";
  status: "queued" | "running" | "completed" | "failed" | "stopped";
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs?: string;
  modelVersion?: string;
  modelAlgorithm?: string;
  modelDataset?: string;
}

export interface WiresharkInterface {
  id: string;
  name: string;
}

export interface WiresharkInterfaceResponse {
  available: boolean;
  message?: string;
  tsharkPath?: string;
  interfaces: WiresharkInterface[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target?: string;
  outcome: "success" | "failure";
}

export interface SystemHealth {
  api: "up" | "down" | "degraded";
  ingest: "up" | "down" | "degraded";
  modelService: "up" | "down" | "degraded";
  kibana: "up" | "down" | "degraded";
  cpuPct: number;
  memPct: number;
  uptimeSec: number;
}
