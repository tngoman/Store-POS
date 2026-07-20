import { useEffect, useState } from 'react';
import { api, Settings } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getPosBridge } from '../bridge';
import PhotoPicker from '../components/PhotoPicker';

type Props = {
  settings: Settings | null;
  onSaved: () => Promise<void>;
};

const MODES = [
  'Standalone Point of Sale',
  'Network Point of Sale Server',
  'Network Point of Sale Terminal',
] as const;

export default function SettingsView({ settings, onSaved }: Props) {
  const { apiInfo, refreshApiInfo } = useAuth();
  const [form, setForm] = useState({
    app: MODES[0] as string,
    store: '',
    address_one: '',
    address_two: '',
    contact: '',
    tax: '',
    symbol: '$',
    percentage: '0',
    charge_tax: false,
    footer: '',
    img: '',
    till: '1',
    ip: '',
    pexels_api_key: '',
  });
  const [lanIp, setLanIp] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const info = await refreshApiInfo();
      setLanIp(info.lanIp);
      const s = settings;
      setForm({
        app: s?.app || MODES[0],
        store: s?.store || '',
        address_one: s?.address_one || '',
        address_two: s?.address_two || '',
        contact: s?.contact || '',
        tax: s?.tax || '',
        symbol: s?.symbol || '$',
        percentage: String(s?.percentage ?? 0),
        charge_tax: !!s?.charge_tax,
        footer: s?.footer || '',
        img: s?.img || '',
        till: String(s?.till || info.till || 1),
        ip: s?.ip || info.serverIp || '',
        pexels_api_key: s?.pexels_api_key || '',
      });
    })();
  }, [settings]);

  const save = async () => {
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'charge_tax') fd.append(k, form.charge_tax ? '1' : '0');
        else fd.append(k, String(v));
      });

      await getPosBridge().setLocalConfig({
        mode: form.app,
        serverIp: form.ip,
        till: parseInt(form.till, 10) || 1,
      });

      if (form.app !== 'Network Point of Sale Terminal') {
        await api.saveSettings(fd);
      } else {
        try {
          await api.saveSettings(fd);
        } catch {
          /* local prefs still saved */
        }
      }

      setMessage('Saved. Restart the app if you changed Standalone / Server / Terminal mode.');
      await refreshApiInfo();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const isTerminal = form.app === 'Network Point of Sale Terminal';
  const isServer = form.app === 'Network Point of Sale Server';

  const seedDemo = async () => {
    setError(null);
    setMessage(null);
    setDemoBusy(true);
    try {
      const result = await api.seedDemo();
      setMessage(result.message);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setDemoBusy(false);
    }
  };

  const clearDemo = async () => {
    if (
      !confirm(
        'Delete ALL products, categories, sales history, and customers (except Walk-in)? This cannot be undone.'
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    setDemoBusy(true);
    try {
      const result = await api.clearDemo();
      setMessage(result.message);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div className="panel" style={{ padding: '1.25rem', maxWidth: 880 }}>
      {error && <div className="error">{error}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="page-grid">
        <div>
          <h3 style={{ marginTop: 0 }}>Store</h3>
          <div className="field">
            <label>Store name</label>
            <input
              value={form.store}
              onChange={(e) => setForm({ ...form, store: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Address</label>
            <input
              value={form.address_one}
              onChange={(e) => setForm({ ...form, address_one: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Address line 2</label>
            <input
              value={form.address_two}
              onChange={(e) => setForm({ ...form, address_two: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Contact</label>
            <input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Receipt footer</label>
            <input
              value={form.footer}
              onChange={(e) => setForm({ ...form, footer: e.target.value })}
            />
          </div>
          <PhotoPicker
            label="Store logo"
            value={form.img}
            onChange={(img) => setForm({ ...form, img })}
            suggestedQuery={form.store || 'store logo'}
          />
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Register</h3>
          <div className="field">
            <label>Mode</label>
            <select value={form.app} onChange={(e) => setForm({ ...form, app: e.target.value })}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m.replace(' Point of Sale', '')}
                </option>
              ))}
            </select>
          </div>
          {isTerminal && (
            <div className="field">
              <label>Server IP</label>
              <input
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                placeholder="192.168.1.10"
              />
            </div>
          )}
          {isServer && (
            <p className="muted">
              Terminals should connect to <strong>{lanIp}</strong> on port 8001.
            </p>
          )}
          <div className="field">
            <label>Till number</label>
            <input
              type="number"
              min={1}
              value={form.till}
              onChange={(e) => setForm({ ...form, till: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Currency symbol</label>
            <input
              value={form.symbol}
              onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            />
          </div>
          <label
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}
          >
            <input
              type="checkbox"
              checked={form.charge_tax}
              onChange={(e) => setForm({ ...form, charge_tax: e.target.checked })}
            />
            Charge tax on sales
          </label>
          {form.charge_tax && (
            <>
              <div className="field">
                <label>Tax label</label>
                <input
                  value={form.tax}
                  onChange={(e) => setForm({ ...form, tax: e.target.value })}
                  placeholder="VAT"
                />
              </div>
              <div className="field">
                <label>Tax %</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.percentage}
                  onChange={(e) => setForm({ ...form, percentage: e.target.value })}
                />
              </div>
            </>
          )}
          {apiInfo && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              API {apiInfo.baseUrl}
            </p>
          )}

          <h3>Media</h3>
          <div className="field">
            <label>Pexels API key</label>
            <input
              type="password"
              value={form.pexels_api_key}
              onChange={(e) => setForm({ ...form, pexels_api_key: e.target.value })}
              placeholder="Paste key from pexels.com/api"
              autoComplete="off"
            />
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Used to search and download product photos into a local library on this server.
            Get a free key at{' '}
            <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer">
              pexels.com/api
            </a>
            .
          </p>
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={save} style={{ marginTop: '1rem' }}>
        Save settings
      </button>

      <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--line)' }}>
        <h3 style={{ marginTop: 0 }}>Demo data</h3>
        <p className="muted" style={{ fontSize: '0.9rem', marginTop: 0 }}>
          Seed a sample South African catalog (categories, products, customers), or wipe catalog and
          sales data for a clean slate. Staff and settings are kept.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={demoBusy} onClick={seedDemo}>
            Seed demo catalog
          </button>
          <button type="button" className="btn btn-danger" disabled={demoBusy} onClick={clearDemo}>
            Bulk delete catalog &amp; sales
          </button>
        </div>
      </div>
    </div>
  );
}
