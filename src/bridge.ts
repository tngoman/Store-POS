import type { ApiInfo, LocalConfig, PosBridge } from './vite-env';

const FALLBACK_PORT = 8001;

function browserFallback(): PosBridge {
  const storageKey = 'pos_local_config';

  const readConfig = (): LocalConfig => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return { ...defaults(), ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return defaults();
  };

  const defaults = (): LocalConfig => ({
    mode: 'Standalone Point of Sale',
    serverIp: '',
    till: 1,
    apiPort: FALLBACK_PORT,
  });

  return {
    getPaths: async () => ({ uploads: '', userData: '' }),
    getLocalConfig: async () => readConfig(),
    setLocalConfig: async (config) => {
      const next = { ...readConfig(), ...config };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    },
    getLanIp: async () => '127.0.0.1',
    getApiInfo: async () => {
      const config = readConfig();
      const isTerminal = config.mode === 'Network Point of Sale Terminal';
      const host = isTerminal ? config.serverIp || '127.0.0.1' : '127.0.0.1';
      const info: ApiInfo = {
        baseUrl: `http://${host}:${config.apiPort || FALLBACK_PORT}/api`,
        healthUrl: `http://${host}:${config.apiPort || FALLBACK_PORT}/`,
        mode: config.mode,
        serverIp: config.serverIp,
        till: config.till,
        lanIp: '127.0.0.1',
        localServerRunning: !isTerminal,
      };
      return info;
    },
    quit: () => {
      window.close();
    },
    reload: () => {
      window.location.reload();
    },
  };
}

export function getPosBridge(): PosBridge {
  if (typeof window !== 'undefined' && window.pos) {
    return window.pos;
  }
  return browserFallback();
}

export function isElectronBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.pos);
}
