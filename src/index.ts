/**
 * Advanced DevTools Panel for Chrome Extensions
 * Provides network inspection, storage debugging, performance profiling, and console capturing
 */

import { DevTools, NetworkRequest, NetworkResponse, StorageData, ConsoleMessage } from './types';

export * from './types';

/**
 * Network Request/Response logger
 */
export class NetworkLogger {
  private requests: Map<number, NetworkRequest> = new Map();
  private listeners: Set<(request: NetworkRequest) => void> = new Set();
  private maxRequests: number = 1000;
  private enabled: boolean = false;

  constructor(options: { maxRequests?: number } = {}) {
    this.maxRequests = options.maxRequests || 1000;
  }

  /**
   * Start capturing network requests
   */
  start(): void {
    if (this.enabled) return;
    
    chrome.devtools.network.onRequestFinished.addListener(this.handleRequest.bind(this));
    this.enabled = true;
  }

  /**
   * Stop capturing network requests
   */
  stop(): void {
    if (!this.enabled) return;
    
    chrome.devtools.network.onRequestFinished.removeListener(this.handleRequest.bind(this));
    this.enabled = false;
  }

  /**
   * Handle completed network request
   */
  private async handleRequest(request: chrome.devtools.network.Request): Promise<void> {
    const networkRequest: NetworkRequest = {
      id: this.generateId(),
      url: request.request.url,
      method: request.request.method,
      status: request.response.status,
      statusText: request.response.statusText,
      startTime: request.startedDateTime.getTime(),
      endTime: request.startedDateTime.getTime() + request.time,
      duration: request.time,
      requestHeaders: request.request.headers,
      requestBody: request.request.postData?.text || null,
      responseHeaders: request.response.headers,
      responseBody: null,
      size: request.response.bodySize,
      mimeType: request.response.content?.mimeType || 'unknown',
      fromCache: request.response.fromCache,
      fromServiceWorker: request.response.fromServiceWorker,
      tabId: null // Will be set if available
    };

    // Get response body if possible
    try {
      const content = await request.getContent();
      networkRequest.responseBody = content;
    } catch (error) {
      networkRequest.responseBody = '[Unable to get response body]';
    }

    // Manage request storage
    if (this.requests.size >= this.maxRequests) {
      const firstKey = this.requests.keys().next().value;
      this.requests.delete(firstKey);
    }

    this.requests.set(networkRequest.id, networkRequest);

    // Notify listeners
    this.listeners.forEach(listener => listener(networkRequest));
  }

  /**
   * Subscribe to network events
   */
  onRequest(callback: (request: NetworkRequest) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get all captured requests
   */
  getRequests(filter?: {
    urlPattern?: RegExp;
    method?: string;
    status?: number;
    minDuration?: number;
  }): NetworkRequest[] {
    let requests = Array.from(this.requests.values());

    if (filter) {
      if (filter.urlPattern) {
        requests = requests.filter(r => filter.urlPattern!.test(r.url));
      }
      if (filter.method) {
        requests = requests.filter(r => r.method === filter.method);
      }
      if (filter.status) {
        requests = requests.filter(r => r.status === filter.status);
      }
      if (filter.minDuration) {
        requests = requests.filter(r => r.duration >= filter.minDuration!);
      }
    }

    return requests.sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Get request by ID
   */
  getRequest(id: number): NetworkRequest | undefined {
    return this.requests.get(id);
  }

  /**
   * Clear all captured requests
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Export requests to HAR format
   */
  async exportToHAR(): Promise<string> {
    const harLog = {
      version: '1.2',
      creator: { name: 'Chrome DevTools', version: '1.0' },
      entries: await Promise.all(
        Array.from(this.requests.values()).map(async (req) => ({
          startedDateTime: new Date(req.startTime).toISOString(),
          time: req.duration,
          request: {
            method: req.method,
            url: req.url,
            httpVersion: 'HTTP/1.1',
            headers: Object.entries(req.requestHeaders).map(([name, value]) => ({ name, value })),
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: req.requestBody ? req.requestBody.length : 0
          },
          response: {
            status: req.status,
            statusText: req.statusText,
            httpVersion: 'HTTP/1.1',
            headers: Object.entries(req.responseHeaders).map(([name, value]) => ({ name, value })),
            cookies: [],
            content: {
              size: req.size,
              mimeType: req.mimeType,
              text: req.responseBody || ''
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: req.size
          },
          cache: {},
          timings: { send: 0, wait: req.duration, receive: 0 }
        }))
      )
    };

    return JSON.stringify({ log: harLog }, null, 2);
  }

  private generateId(): number {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }
}

/**
 * Storage Inspector
 */
export class StorageInspector {
  private listeners: Set<(data: StorageData) => void> = new Set();

  /**
   * Get local storage for a tab
   */
  async getLocalStorage(tabId: number): Promise<StorageData> {
    const result = await chrome.storage.local.get(null);
    return {
      area: 'local',
      data: result,
      bytesInUse: await chrome.storage.local.getBytesInUse(null),
      timestamp: Date.now()
    };
  }

  /**
   * Get sync storage
   */
  async getSyncStorage(): Promise<StorageData> {
    const result = await chrome.storage.sync.get(null);
    return {
      area: 'sync',
      data: result,
      bytesInUse: await chrome.storage.sync.getBytesInUse(null),
      timestamp: Date.now()
    };
  }

  /**
   * Get session storage for a tab
   */
  async getSessionStorage(tabId: number): Promise<StorageData> {
    const result = await chrome.storage.session.get(null);
    return {
      area: 'session',
      data: result,
      bytesInUse: 0, // Session storage doesn't support getBytesInUse
      timestamp: Date.now()
    };
  }

  /**
   * Get all storage areas
   */
  async getAllStorage(): Promise<StorageData[]> {
    const [local, sync] = await Promise.all([
      this.getLocalStorage(0),
      this.getSyncStorage()
    ]);
    return [local, sync];
  }

  /**
   * Watch for storage changes
   */
  watch(callback: (data: StorageData) => void): () => void {
    const listener = (changes: any, areaName: string) => {
      callback({
        area: areaName,
        data: changes,
        bytesInUse: 0,
        timestamp: Date.now()
      });
    };

    chrome.storage.onChanged.addListener(listener);
    this.listeners.add(callback);

    return () => {
      chrome.storage.onChanged.removeListener(listener);
      this.listeners.delete(callback);
    };
  }

  /**
   * Export storage to JSON
   */
  async exportStorage(area: 'local' | 'sync' = 'local'): Promise<string> {
    const data = await chrome.storage[area].get(null);
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import storage from JSON
   */
  async importStorage(json: string, area: 'local' | 'sync' = 'local'): Promise<void> {
    const data = JSON.parse(json);
    await chrome.storage[area].set(data);
  }
}

/**
 * Console Message Capture
 */
export class ConsoleCapture {
  private messages: ConsoleMessage[] = [];
  private listeners: Set<(message: ConsoleMessage) => void> = new Set();
  private maxMessages: number = 500;
  private enabled: boolean = false;

  /**
   * Start capturing console messages
   */
  start(): void {
    if (this.enabled) return;

    // This would typically use chrome.debugger or chrome.devtools
    // For now, we'll implement a simpler version
    this.enabled = true;
  }

  /**
   * Stop capturing console messages
   */
  stop(): void {
    this.enabled = false;
  }

  /**
   * Add a console message
   */
  addMessage(type: string, args: any[], source?: string): void {
    const message: ConsoleMessage = {
      id: this.generateId(),
      type,
      args: args.map(arg => this.stringify(arg)),
      source: source || 'content',
      timestamp: Date.now(),
      level: type as any
    };

    if (this.messages.length >= this.maxMessages) {
      this.messages.shift();
    }

    this.messages.push(message);
    this.listeners.forEach(listener => listener(message));
  }

  /**
   * Subscribe to console messages
   */
  onMessage(callback: (message: ConsoleMessage) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get all captured messages
   */
  getMessages(filter?: {
    type?: string;
    source?: string;
    since?: number;
  }): ConsoleMessage[] {
    let messages = [...this.messages];

    if (filter) {
      if (filter.type) {
        messages = messages.filter(m => m.type === filter.type);
      }
      if (filter.source) {
        messages = messages.filter(m => m.source === filter.source);
      }
      if (filter.since) {
        messages = messages.filter(m => m.timestamp >= filter.since);
      }
    }

    return messages;
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Export messages to JSON
   */
  export(): string {
    return JSON.stringify(this.messages, null, 2);
  }

  private stringify(arg: any): string {
    try {
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    } catch {
      return '[Circular or non-serializable]';
    }
  }

  private generateId(): number {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }
}

/**
 * Performance Profiler
 */
export class PerformanceProfiler {
  private marks: Map<string, number> = new Map();
  private measures: PerformanceMeasure[] = [];
  private listeners: Set<(measure: PerformanceMeasure) => void> = new Set();

  /**
   * Create a performance mark
   */
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * Create a measure between two marks
   */
  measure(name: string, startMark: string, endMark?: string): number {
    const startTime = this.marks.get(startMark);
    if (!startTime) {
      console.warn(`Start mark "${startMark}" not found`);
      return 0;
    }

    const endTime = endMark ? this.marks.get(endMark) : performance.now();
    if (endMark && !endTime) {
      console.warn(`End mark "${endMark}" not found`);
      return 0;
    }

    const duration = endTime! - startTime;
    
    const measure: PerformanceMeasure = {
      name,
      startTime,
      endTime: endTime!,
      duration,
      timestamp: Date.now()
    };

    this.measures.push(measure);
    this.listeners.forEach(listener => listener(measure));

    return duration;
  }

  /**
   * Get all measures
   */
  getMeasures(filter?: { name?: string; minDuration?: number }): PerformanceMeasure[] {
    let measures = [...this.measures];

    if (filter) {
      if (filter.name) {
        measures = measures.filter(m => m.name === filter.name);
      }
      if (filter.minDuration) {
        measures = measures.filter(m => m.duration >= filter.minDuration!);
      }
    }

    return measures.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get average measure duration
   */
  getAverageDuration(name: string): number {
    const filtered = this.measures.filter(m => m.name === name);
    if (filtered.length === 0) return 0;
    
    const total = filtered.reduce((sum, m) => sum + m.duration, 0);
    return total / filtered.length;
  }

  /**
   * Clear all marks and measures
   */
  clear(): void {
    this.marks.clear();
    this.measures = [];
  }

  /**
   * Export performance data
   */
  export(): string {
    return JSON.stringify({
      marks: Array.from(this.marks.entries()),
      measures: this.measures
    }, null, 2);
  }
}

export interface PerformanceMeasure {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  timestamp: number;
}

/**
 * Main DevTools Panel Controller
 */
export class DevToolsPanel {
  public network: NetworkLogger;
  public storage: StorageInspector;
  public console: ConsoleCapture;
  public profiler: PerformanceProfiler;

  constructor() {
    this.network = new NetworkLogger();
    this.storage = new StorageInspector();
    this.console = new ConsoleCapture();
    this.profiler = new PerformanceProfiler();
  }

  /**
   * Initialize the panel
   */
  async initialize(): Promise<void> {
    this.network.start();
    this.console.start();
  }

  /**
   * Get panel data summary
   */
  getSummary(): {
    networkRequests: number;
    consoleMessages: number;
    performanceMeasures: number;
  } {
    return {
      networkRequests: this.network.getRequests().length,
      consoleMessages: this.console.getMessages().length,
      performanceMeasures: this.profiler.getMeasures().length
    };
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    this.network.stop();
    this.console.stop();
    this.network.clear();
    this.console.clear();
    this.profiler.clear();
  }
}

// Factory function
export function createDevToolsPanel(): DevToolsPanel {
  return new DevToolsPanel();
}

export default DevToolsPanel;
