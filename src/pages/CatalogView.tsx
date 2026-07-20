import { useEffect, useState } from 'react';
import { api, Category, Product, getUploadsBase } from '../api/client';
import PhotoPicker from '../components/PhotoPicker';

type Props = {
  products: Product[];
  categories: Category[];
  symbol: string;
  canProducts: boolean;
  canCategories: boolean;
  onChanged: () => Promise<void>;
};

const emptyProduct = {
  id: '',
  name: '',
  price: '',
  category: '',
  quantity: '0',
  trackStock: true,
  img: '',
};

export default function CatalogView({
  products,
  categories,
  symbol,
  canProducts,
  canCategories,
  onChanged,
}: Props) {
  const [tab, setTab] = useState<'products' | 'categories'>(
    canProducts ? 'products' : 'categories'
  );
  const [list, setList] = useState(products);
  const [cats, setCats] = useState(categories);
  const [form, setForm] = useState(emptyProduct);
  const [catName, setCatName] = useState('');
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const uploads = getUploadsBase();

  useEffect(() => {
    setList(products);
    setCats(categories);
    setSelected((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products, categories]);

  const saveProduct = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append('id', form.id);
    fd.append('name', form.name.trim());
    fd.append('price', form.price || '0');
    fd.append('category', form.category);
    fd.append('quantity', form.quantity || '0');
    fd.append('stock', form.trackStock ? '1' : 'on');
    fd.append('img', form.img);
    await api.saveProduct(fd);
    setForm(emptyProduct);
    await onChanged();
  };

  const editProduct = (p: Product) => {
    setForm({
      id: String(p.id),
      name: p.name,
      price: String(p.price),
      category: p.category,
      quantity: String(p.quantity),
      trackStock: !!p.stock,
      img: p.img || '',
    });
    setTab('products');
  };

  const removeProduct = async (id: number) => {
    if (!confirm('Delete this product?')) return;
    await api.deleteProduct(id);
    await onChanged();
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const visible = list.filter(
    (p) =>
      !filter ||
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(filter.toLowerCase()) ||
      String(p.id).includes(filter)
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((p) => selected.includes(p.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visible.map((p) => p.id));
      setSelected((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      setSelected((prev) => Array.from(new Set([...prev, ...visible.map((p) => p.id)])));
    }
  };

  const bulkDelete = async () => {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} selected product(s)?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteProducts(selected);
      setSelected([]);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed');
    } finally {
      setBusy(false);
    }
  };

  const seedDemo = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.seedDemo();
      await onChanged();
      alert(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    if (editCatId) {
      await api.updateCategory({ id: editCatId, name: catName.trim() });
    } else {
      await api.saveCategory({ name: catName.trim() });
    }
    setCatName('');
    setEditCatId(null);
    await onChanged();
  };

  const removeCategory = async (id: number) => {
    if (!confirm('Delete this category?')) return;
    await api.deleteCategory(id);
    await onChanged();
  };

  return (
    <div>
      <div className="chips" style={{ paddingLeft: 0, border: 0, marginBottom: '1rem' }}>
        {canProducts && (
          <button
            type="button"
            className={`chip ${tab === 'products' ? 'active' : ''}`}
            onClick={() => setTab('products')}
          >
            Products
          </button>
        )}
        {canCategories && (
          <button
            type="button"
            className={`chip ${tab === 'categories' ? 'active' : ''}`}
            onClick={() => setTab('categories')}
          >
            Categories
          </button>
        )}
        {canProducts && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
            <button type="button" className="btn" disabled={busy} onClick={seedDemo}>
              Seed demo
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !selected.length}
              onClick={bulkDelete}
            >
              Delete selected ({selected.length})
            </button>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {tab === 'products' && canProducts && (
        <div className="page-grid">
          <div className="panel" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>{form.id ? 'Edit product' : 'New product'}</h3>
            <div className="field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Price</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">None</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <label
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <input
                type="checkbox"
                checked={form.trackStock}
                onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
              />
              Track inventory
            </label>
            {form.trackStock && (
              <div className="field">
                <label>Quantity on hand</label>
                <input
                  type="number"
                  min={0}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
              </div>
            )}
            <PhotoPicker
              value={form.img}
              onChange={(img) => setForm({ ...form, img })}
              suggestedQuery={form.name || form.category}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary" onClick={saveProduct}>
                {form.id ? 'Update' : 'Add'} product
              </button>
              {form.id && (
                <button type="button" className="btn" onClick={() => setForm(emptyProduct)}>
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="panel" style={{ padding: '1rem' }}>
            <div className="field">
              <label>Search catalog</label>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Name, category, or ID"
              />
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      title="Select all visible"
                      aria-label="Select all visible"
                    />
                  </th>
                  <th />
                  <th>ID</th>
                  <th>Name</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td>
                      {p.img ? (
                        <img
                          src={`${uploads}/${p.img}`}
                          alt=""
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: 'cover',
                            borderRadius: 6,
                            border: '1px solid var(--line)',
                          }}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{p.id}</td>
                    <td>
                      <div>{p.name}</div>
                      <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>
                        {p.category || 'Uncategorized'}
                      </div>
                    </td>
                    <td>
                      {symbol}
                      {Number(p.price).toFixed(2)}
                    </td>
                    <td>{p.stock ? p.quantity : '—'}</td>
                    <td>
                      <button type="button" className="btn" onClick={() => editProduct(p)}>
                        Edit
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => removeProduct(p.id)}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <div className="empty">No products yet</div>}
          </div>
        </div>
      )}

      {tab === 'categories' && canCategories && (
        <div className="page-grid">
          <div className="panel" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0 }}>{editCatId ? 'Edit category' : 'New category'}</h3>
            <div className="field">
              <label>Name</label>
              <input value={catName} onChange={(e) => setCatName(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveCategory}>
              {editCatId ? 'Update' : 'Add'} category
            </button>
          </div>
          <div className="panel" style={{ padding: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setEditCatId(c.id);
                          setCatName(c.name);
                        }}
                      >
                        Edit
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => removeCategory(c.id)}
                      >
                        Del
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

