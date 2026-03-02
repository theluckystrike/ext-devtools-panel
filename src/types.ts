/**
 * Type definitions for ext-devtools-panel
 */

export interface NetworkRequest {
  id: number;
  url: string;
  method: string;
  status: number;
  statusText: string;
  startTime: number;
  endTime: number;
  duration: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  size: number;
  mimeType: string;
  fromCache: boolean;
  fromServiceWorker: boolean;
  tabId: number | null;
}

export interface NetworkResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  mimeType: string;
}

export interface StorageData {
  area: string;
  data: Record<string, any>;
  bytesInUse: number;
  timestamp: number;
}

export interface ConsoleMessage {
  id: number;
  type: string;
  args: string[];
  source: string;
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
}

export interface PerformanceMark {
  name: string;
  time: number;
}

export interface PerformanceMeasure {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  timestamp: number;
}

export interface DevToolsOptions {
  networkMaxRequests?: number;
  consoleMaxMessages?: number;
  autoStart?: boolean;
}
