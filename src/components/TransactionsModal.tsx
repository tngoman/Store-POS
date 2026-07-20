import { useEffect, useState } from 'react';
import { api, Transaction, User } from '../api/client';
import Modal from './Modal';

type Props = {
  open?: boolean;
  embedded?: boolean;
  onClose: () => void;
  users?: User[];
  symbol: string;
};

/** Format a Date for <input type="datetime-local"> in local time. */
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse datetime-local value as local time → ISO UTC for the API. */
function localInputToIso(value: string, endOfMinute = false) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  if (endOfMinute) d.setSeconds(59, 999);
  return d.toISOString();
}

function defaultRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
}

export default function TransactionsModal({
  open = true,
  embedded = false,
  onClose,
  symbol,
}: Props) {
  const initial = defaultRange();
  const [rows, setRows] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [userId, setUserId] = useState(0);
  const [till, setTill] = useState(0);
  const [status, setStatus] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const [list, allUsers] = await Promise.all([
        api.getByDate({
          start: localInputToIso(start),
          end: localInputToIso(end, true),
          user: userId,
          till,
          status,
        }),
        api.getUsers().catch(() => [] as User[]),
      ]);
      setRows(list);
      setUsers(allUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open || embedded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on open; Filter button refreshes
  }, [open, embedded]);

  const body = (
    <>
      {error && <div className="error">{error}</div>}
      <div className="filters">
        <div className="field">
          <label>From</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label>To</label>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <div className="field">
          <label>Cashier</label>
          <select value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
            <option value={0}>All</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullname}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Till</label>
          <input
            type="number"
            min={0}
            value={till}
            onChange={(e) => setTill(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(Number(e.target.value))}>
            <option value={1}>Paid</option>
            <option value={0}>Unpaid / Hold</option>
          </select>
        </div>
        <button className="btn btn-primary" type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Filter'}
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Cashier</th>
            <th>Till</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Paid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{new Date(r.date).toLocaleString()}</td>
              <td>{r.user}</td>
              <td>{r.till}</td>
              <td>{r.customer_name}</td>
              <td>
                {symbol}
                {Number(r.total).toFixed(2)}
              </td>
              <td>
                {symbol}
                {Number(r.paid).toFixed(2)}
              </td>
              <td>{r.status === 1 ? 'Paid' : 'Open'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && !loading && <div className="empty">No transactions in this range</div>}
    </>
  );

  if (embedded) {
    return (
      <div className="panel" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <strong>Transactions</strong>
          <button className="btn" type="button" onClick={onClose}>
            Back to till
          </button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Modal title="Transactions" open={open} onClose={onClose} wide>
      {body}
    </Modal>
  );
}
