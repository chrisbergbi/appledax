import type { QueryRunStatus, QueryTab } from './types';

const STORAGE_KEY = 'appledax-query-state';

interface PersistedQueryState {
  tabs: QueryTab[];
  activeTabId: string;
}

export class QueryStateStore {
  private tabs: QueryTab[];
  private activeTabId: string;
  private runStatus: QueryRunStatus = 'idle';

  constructor() {
    const restored = this.restore();
    this.tabs = restored.tabs;
    this.activeTabId = restored.activeTabId;
  }

  public getTabs(): QueryTab[] {
    return this.tabs;
  }

  public getActiveTabId(): string {
    return this.activeTabId;
  }

  public getActiveTab(): QueryTab {
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    return tab ?? this.tabs[0];
  }

  public setRunStatus(status: QueryRunStatus): void {
    this.runStatus = status;
  }

  public getRunStatus(): QueryRunStatus {
    return this.runStatus;
  }

  public setActiveTab(tabId: string): void {
    const exists = this.tabs.some((t) => t.id === tabId);
    if (!exists) return;
    this.activeTabId = tabId;
    this.persist();
  }

  public createTab(name = 'Query'): QueryTab {
    const tab: QueryTab = {
      id: createId(),
      name,
      queryText: 'EVALUATE\n    ROW("Sample", 1)',
    };
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.persist();
    return tab;
  }

  public closeTab(tabId: string): void {
    if (this.tabs.length === 1) return;
    const idx = this.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    this.tabs.splice(idx, 1);
    if (this.activeTabId === tabId) {
      this.activeTabId = this.tabs[Math.max(0, idx - 1)].id;
    }
    this.persist();
  }

  public renameTab(tabId: string, name: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.name = name.trim() || 'Query';
    this.persist();
  }

  public setQueryText(tabId: string, text: string): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.queryText = text;
    this.persist();
  }

  private restore(): PersistedQueryState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw) as PersistedQueryState;
      if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return defaultState();
      const activeExists = parsed.tabs.some((t) => t.id === parsed.activeTabId);
      return {
        tabs: parsed.tabs,
        activeTabId: activeExists ? parsed.activeTabId : parsed.tabs[0].id,
      };
    } catch {
      return defaultState();
    }
  }

  private persist(): void {
    const state: PersistedQueryState = {
      tabs: this.tabs,
      activeTabId: this.activeTabId,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }
}

function defaultState(): PersistedQueryState {
  const tab: QueryTab = {
    id: createId(),
    name: 'Query 1',
    queryText: 'EVALUATE\n    ROW("Sample", 1)',
  };
  return {
    tabs: [tab],
    activeTabId: tab.id,
  };
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
