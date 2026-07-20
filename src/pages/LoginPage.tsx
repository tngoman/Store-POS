import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getPosBridge } from '../bridge';

const MODES = [
  'Standalone Point of Sale',
  'Network Point of Sale Server',
  'Network Point of Sale Terminal',
] as const;

export default function LoginPage() {
  const { login, serverError, apiInfo, refreshApiInfo } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showConn, setShowConn] = useState(false);
  const [mode, setMode] = useState(apiInfo?.mode || MODES[0]);
  const [serverIp, setServerIp] = useState(apiInfo?.serverIp || '');
  const [connMsg, setConnMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await refreshApiInfo();
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const saveConnection = async () => {
    setConnMsg(null);
    await getPosBridge().setLocalConfig({
      mode,
      serverIp,
      till: apiInfo?.till || 1,
    });
    setConnMsg('Saved. Restart if you switched Server / Terminal mode.');
    await refreshApiInfo();
  };

  const needsConn =
    Boolean(serverError) ||
    apiInfo?.mode === 'Network Point of Sale Terminal';

  return (
    <div className="login-wrap">
      <form className="panel login-card" onSubmit={onSubmit}>
        <h1>Store POS</h1>
        <p>Sign in to open the till</p>

        {(serverError || error) && <div className="error">{serverError || error}</div>}

        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {(needsConn || showConn) && (
          <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--line)', paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              onClick={() => setShowConn((v) => !v)}
            >
              {showConn ? 'Hide' : 'Network'} connection
            </button>
            {showConn && (
              <>
                <div className="field">
                  <label>Mode</label>
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m.replace(' Point of Sale', '')}
                      </option>
                    ))}
                  </select>
                </div>
                {mode === 'Network Point of Sale Terminal' && (
                  <div className="field">
                    <label>Server IP</label>
                    <input
                      value={serverIp}
                      onChange={(e) => setServerIp(e.target.value)}
                      placeholder="192.168.1.10"
                    />
                  </div>
                )}
                {connMsg && <p className="muted">{connMsg}</p>}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-primary" onClick={saveConnection}>
                    Save
                  </button>
                  <button type="button" className="btn" onClick={() => refreshApiInfo()}>
                    Retry
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
