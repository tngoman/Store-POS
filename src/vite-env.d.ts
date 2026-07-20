/// <reference types="vite/client" />

export type LocalConfig = {
  mode: string;
  serverIp: string;
  till: number;
  apiPort: number;
};

export type ApiInfo = {
  baseUrl: string;
  healthUrl: string;
  mode: string;
  serverIp: string;
  till: number;
  lanIp: string;
  localServerRunning: boolean;
};

export type PosBridge = {
  getPaths: () => Promise<{ uploads: string; userData: string }>;
  getLocalConfig: () => Promise<LocalConfig>;
  setLocalConfig: (config: Partial<LocalConfig>) => Promise<LocalConfig>;
  getLanIp: () => Promise<string>;
  getApiInfo: () => Promise<ApiInfo>;
  quit: () => void;
  reload: () => void;
};

declare global {
  interface Window {
    pos: PosBridge;
  }
}

export {};
