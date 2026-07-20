import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  api,
  clearSession,
  getStoredToken,
  getStoredUser,
  setBaseUrl,
  storeSession,
  User,
  healthCheck,
} from '../api/client';
import type { ApiInfo } from '../vite-env';
import { getPosBridge } from '../bridge';

type AuthState = {
  ready: boolean;
  user: User | null;
  token: string | null;
  apiInfo: ApiInfo | null;
  serverError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshApiInfo: () => Promise<ApiInfo>;
  hasPerm: (perm: keyof User) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(getStoredUser());
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [apiInfo, setApiInfo] = useState<ApiInfo | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const refreshApiInfo = async () => {
    const bridge = getPosBridge();
    const info = await bridge.getApiInfo();
    setBaseUrl(info.baseUrl);
    setApiInfo(info);
    try {
      await healthCheck(info.healthUrl);
      setServerError(null);
    } catch {
      setServerError(
        info.mode === 'Network Point of Sale Terminal'
          ? `Cannot reach server at ${info.serverIp || '(no IP set)'}. Check Network Server IP in settings.`
          : 'Local API server is not responding. Prefer the Electron app window from `npm run dev`.'
      );
    }
    return info;
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshApiInfo();
        if (getStoredToken() && getStoredUser()) {
          try {
            const fresh = await api.getUser(getStoredUser()!._id);
            setUser(fresh);
            storeSession(getStoredToken()!, fresh);
          } catch {
            clearSession();
            setUser(null);
            setToken(null);
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    await refreshApiInfo();
    const result = await api.login(username, password);
    storeSession(result.token, result.user);
    setToken(result.token);
    setUser(result.user);
  };

  const logout = async () => {
    if (user) {
      try {
        await api.logout(user._id);
      } catch {
        /* ignore */
      }
    }
    clearSession();
    setToken(null);
    setUser(null);
  };

  const hasPerm = (perm: keyof User) => {
    if (!user) return false;
    if (user._id === 1) return true;
    return Boolean(user[perm]);
  };

  const value = useMemo(
    () => ({
      ready,
      user,
      token,
      apiInfo,
      serverError,
      login,
      logout,
      refreshApiInfo,
      hasPerm,
    }),
    [ready, user, token, apiInfo, serverError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
