import { useEffect, useMemo, useState } from 'react';
import {
  api,
  Category,
  Customer,
  Product,
  Settings,
  Transaction,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import AppShell, { NavView } from '../layout/AppShell';
import TillView from './TillView';
import CatalogView from './CatalogView';
import SettingsView from './SettingsView';
import TransactionsModal from '../components/TransactionsModal';

export default function PosPage() {
  const { hasPerm } = useAuth();
  const [view, setView] = useState<NavView>('till');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holdCount, setHoldCount] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);

  const symbol = settings?.symbol || '$';

  const loadAll = async () => {
    const [p, c, cust, s] = await Promise.all([
      api.getProducts(),
      api.getCategories(),
      api.getCustomers(),
      api.getSettings(),
    ]);
    setProducts(p);
    setCategories(c);
    setCustomers(cust);
    setSettings(s.settings);

    if (hasPerm('perm_transactions')) {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const sales = await api.getByDate({
          start: start.toISOString(),
          end: new Date().toISOString(),
          user: 0,
          till: 0,
          status: 1,
        });
        setTodayTotal(sales.reduce((sum: number, t: Transaction) => sum + Number(t.total || 0), 0));
      } catch {
        /* cashiers without perm already filtered */
      }
    }

    try {
      const holds = await api.getOnHold();
      setHoldCount(holds.length);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadAll().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!settings?.store && hasPerm('perm_settings')) {
      setView('settings');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const title = useMemo(() => {
    switch (view) {
      case 'till':
        return settings?.store ? `${settings.store} · Till` : 'Till';
      case 'catalog':
        return 'Catalog';
      case 'sales':
        return 'Sales history';
      case 'customers':
        return 'Customers';
      case 'team':
        return 'Team';
      case 'settings':
        return 'Settings';
      default:
        return 'Store POS';
    }
  }, [view, settings]);

  return (
    <AppShell
      view={view}
      onNavigate={setView}
      title={title}
      logo={settings?.img || ''}
      todaySales={
        hasPerm('perm_transactions')
          ? `${symbol}${todayTotal.toFixed(2)}`
          : undefined
      }
      stats={
        view === 'till' && holdCount > 0 ? (
          <span className="stat-pill">{holdCount} held</span>
        ) : null
      }
    >
      {error && (
        <div className="error">
          {error}{' '}
          <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      {view === 'till' && (
        <TillView
          products={products}
          categories={categories}
          customers={customers}
          settings={settings}
          holdCount={holdCount}
          onHoldCount={setHoldCount}
          onRefresh={loadAll}
        />
      )}

      {view === 'catalog' && (
        <CatalogView
          products={products}
          categories={categories}
          symbol={symbol}
          canProducts={hasPerm('perm_products')}
          canCategories={hasPerm('perm_categories')}
          onChanged={loadAll}
        />
      )}

      {view === 'sales' && (
        <TransactionsModal
          embedded
          open
          symbol={symbol}
          onClose={() => setView('till')}
        />
      )}

      {view === 'customers' && (
        <CustomersView customers={customers} onChanged={loadAll} />
      )}

      {view === 'team' && <TeamView />}

      {view === 'settings' && (
        <SettingsView settings={settings} onSaved={loadAll} />
      )}
    </AppShell>
  );
}

function CustomersView({
  customers,
  onChanged,
}: {
  customers: Customer[];
  onChanged: () => Promise<void>;
}) {
  // Reuse modal body as always-open panel by rendering CustomersModal embedded-style
  return (
    <CustomersPanel customers={customers} onChanged={onChanged} />
  );
}

function CustomersPanel({
  customers,
  onChanged,
}: {
  customers: Customer[];
  onChanged: () => Promise<void>;
}) {
  const [list, setList] = useState(customers);
  const [form, setForm] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  useEffect(() => setList(customers), [customers]);

  const save = async () => {
    if (!form.name.trim()) return;
    if (form.id) {
      await api.updateCustomer({
        _id: form.id,
        id: Number(form.id),
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
      });
    } else {
      await api.saveCustomer({
        name: form.name,
        phone: form.phone,
        email: form.email,
        address: form.address,
      });
    }
    setForm({ id: '', name: '', phone: '', email: '', address: '' });
    await onChanged();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete customer?')) return;
    await api.deleteCustomer(id);
    await onChanged();
  };

  return (
    <div className="page-grid">
      <div className="panel" style={{ padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit customer' : 'New customer'}</h3>
        <div className="field">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Phone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Email</label>
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Address</label>
          <textarea
            rows={3}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={save}>
          {form.id ? 'Update' : 'Add'} customer
        </button>
      </div>
      <div className="panel" style={{ padding: '1rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setForm({
                        id: String(c.id),
                        name: c.name,
                        phone: c.phone,
                        email: c.email,
                        address: c.address,
                      })
                    }
                  >
                    Edit
                  </button>{' '}
                  <button type="button" className="btn btn-danger" onClick={() => remove(c.id)}>
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamView() {
  return <UsersPanel />;
}

function UsersPanel() {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.getUsers>>>([]);
  const [form, setForm] = useState({
    id: '',
    username: '',
    password: '',
    fullname: '',
    perm_products: true,
    perm_categories: true,
    perm_transactions: true,
    perm_users: false,
    perm_settings: false,
  });
  const [error, setError] = useState<string | null>(null);

  const load = async () => setList(await api.getUsers());

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  const save = async () => {
    setError(null);
    if (!form.username.trim() || !form.fullname.trim()) {
      setError('Username and full name are required');
      return;
    }
    if (!form.id && !form.password) {
      setError('Password is required for new users');
      return;
    }
    try {
      await api.saveUser({ ...form });
      await load();
      setForm({
        id: '',
        username: '',
        password: '',
        fullname: '',
        perm_products: true,
        perm_categories: true,
        perm_transactions: true,
        perm_users: false,
        perm_settings: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div className="page-grid">
      <div className="panel" style={{ padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit user' : 'New user'}</h3>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label>Username</label>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Full name</label>
          <input
            value={form.fullname}
            onChange={(e) => setForm({ ...form, fullname: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Password {form.id ? '(blank = keep)' : ''}</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        {(
          [
            ['perm_products', 'Catalog products'],
            ['perm_categories', 'Categories'],
            ['perm_transactions', 'Sales history'],
            ['perm_users', 'Team'],
            ['perm_settings', 'Settings'],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}
          >
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <button type="button" className="btn btn-primary" onClick={save} style={{ marginTop: '0.75rem' }}>
          {form.id ? 'Update' : 'Add'} user
        </button>
      </div>
      <div className="panel" style={{ padding: '1rem' }}>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Name</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.fullname}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setForm({
                        id: String(u.id),
                        username: u.username,
                        password: '',
                        fullname: u.fullname,
                        perm_products: !!u.perm_products,
                        perm_categories: !!u.perm_categories,
                        perm_transactions: !!u.perm_transactions,
                        perm_users: !!u.perm_users,
                        perm_settings: !!u.perm_settings,
                      })
                    }
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
