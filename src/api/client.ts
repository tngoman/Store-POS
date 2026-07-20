const TOKEN_KEY = 'pos_token';
const USER_KEY = 'pos_user';

export type User = {
  _id: number;
  id: number;
  username: string;
  fullname: string;
  perm_products: number;
  perm_categories: number;
  perm_transactions: number;
  perm_users: number;
  perm_settings: number;
  status?: string;
};

export type Product = {
  _id: number;
  id: number;
  name: string;
  price: number;
  category: string;
  quantity: number;
  stock: number;
  img: string;
};

export type Category = {
  _id: number;
  id: number;
  name: string;
};

export type Customer = {
  _id: string;
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type Settings = {
  app: string;
  store: string;
  address_one: string;
  address_two: string;
  contact: string;
  tax: string;
  symbol: string;
  percentage: number;
  charge_tax: boolean;
  footer: string;
  img: string;
  till: number;
  ip: string;
  pexels_api_key?: string;
};

export type MediaItem = {
  id: number;
  filename: string;
  path: string;
  source: string;
  pexels_id?: number | null;
  photographer: string;
  alt: string;
  created_at: string;
};

export type PexelsPhoto = {
  id: number;
  photographer: string;
  alt: string;
  preview: string;
  download: string;
  url: string;
};

export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
  stock: number;
};

export type Transaction = {
  _id: number;
  id: number;
  ref_number: string;
  customer: string;
  customer_name: string;
  status: number;
  user_id: number;
  user: string;
  till: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  payment_type: number;
  items: CartItem[];
  date: string;
};

let baseUrl = 'http://127.0.0.1:8001/api';

export function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, '');
}

export function getBaseUrl() {
  return baseUrl;
}

export function getUploadsBase() {
  return baseUrl.replace(/\/api$/, '') + '/uploads';
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getStoredToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function healthCheck(healthUrl: string) {
  const res = await fetch(healthUrl, { method: 'GET' });
  if (!res.ok) throw new Error('Server unreachable');
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ user: User; token: string }>(
      '/users/login',
      { method: 'POST', body: JSON.stringify({ username, password }) },
      false
    ),

  checkUsers: () => request<{ ready: boolean }>('/users/check', {}, false),

  getUser: (id: number) => request<User>(`/users/user/${id}`),

  logout: (id: number) => request(`/users/logout/${id}`),

  getUsers: () => request<User[]>('/users/all'),

  saveUser: (body: Record<string, unknown>) =>
    request('/users/post', { method: 'POST', body: JSON.stringify(body) }),

  deleteUser: (id: number) =>
    request(`/users/user/${id}`, { method: 'DELETE' }),

  getProducts: () => request<Product[]>('/inventory/products'),

  saveProduct: (form: FormData) =>
    request('/inventory/product', { method: 'POST', body: form }),

  deleteProduct: (id: number) =>
    request(`/inventory/product/${id}`, { method: 'DELETE' }),

  deleteProducts: (ids: number[]) =>
    request<{ ok: boolean; deleted: number }>('/inventory/products/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  findBySku: (skuCode: string) =>
    request<Product | null>('/inventory/product/sku', {
      method: 'POST',
      body: JSON.stringify({ skuCode }),
    }),

  getCategories: () => request<Category[]>('/categories/all'),

  saveCategory: (body: { name: string }) =>
    request('/categories/category', { method: 'POST', body: JSON.stringify(body) }),

  updateCategory: (body: { id: number; name: string }) =>
    request('/categories/category', { method: 'PUT', body: JSON.stringify(body) }),

  deleteCategory: (id: number) =>
    request(`/categories/category/${id}`, { method: 'DELETE' }),

  getCustomers: () => request<Customer[]>('/customers/all'),

  saveCustomer: (body: Partial<Customer>) =>
    request('/customers/customer', { method: 'POST', body: JSON.stringify(body) }),

  updateCustomer: (body: Partial<Customer>) =>
    request('/customers/customer', { method: 'PUT', body: JSON.stringify(body) }),

  deleteCustomer: (id: number) =>
    request(`/customers/customer/${id}`, { method: 'DELETE' }),

  getSettings: () => request<{ _id: number; settings: Settings }>('/settings/get'),

  saveSettings: (form: FormData) =>
    request<{ _id: number; settings: Settings }>('/settings/post', {
      method: 'POST',
      body: form,
    }),

  getOnHold: () => request<Transaction[]>('/on-hold'),

  getCustomerOrders: () => request<Transaction[]>('/customer-orders'),

  getByDate: (params: {
    start: string;
    end: string;
    user: number;
    till: number;
    status: number;
  }) => {
    const q = new URLSearchParams({
      start: params.start,
      end: params.end,
      user: String(params.user),
      till: String(params.till),
      status: String(params.status),
    });
    return request<Transaction[]>(`/by-date?${q}`);
  },

  createTransaction: (body: Record<string, unknown>) =>
    request('/new', { method: 'POST', body: JSON.stringify(body) }),

  updateTransaction: (body: Record<string, unknown>) =>
    request('/new', { method: 'PUT', body: JSON.stringify(body) }),

  deleteTransaction: (orderId: number) =>
    request('/delete', { method: 'POST', body: JSON.stringify({ orderId }) }),

  getMediaLibrary: () => request<MediaItem[]>('/media/library'),

  uploadMedia: (file: File, alt = '') => {
    const fd = new FormData();
    fd.append('image', file);
    if (alt) fd.append('alt', alt);
    return request<MediaItem>('/media/upload', { method: 'POST', body: fd });
  },

  deleteMedia: (id: number) =>
    request(`/media/library/${id}`, { method: 'DELETE' }),

  seedDemo: () =>
    request<{
      ok: boolean;
      message: string;
      categoriesAdded: number;
      productsAdded: number;
      customersAdded: number;
    }>('/demo/seed', { method: 'POST', body: '{}' }),

  clearDemo: (options?: {
    products?: boolean;
    categories?: boolean;
    customers?: boolean;
    transactions?: boolean;
  }) =>
    request<{ ok: boolean; message: string; deleted: Record<string, number> }>(
      '/demo/clear',
      { method: 'POST', body: JSON.stringify(options || {}) }
    ),

  searchPexels: (q: string, page = 1) => {
    const params = new URLSearchParams({ q, page: String(page), per_page: '20' });
    return request<{
      page: number;
      per_page: number;
      total_results: number;
      photos: PexelsPhoto[];
    }>(`/media/pexels/search?${params}`);
  },

  downloadPexels: (body: {
    photoId: number;
    imageUrl: string;
    photographer?: string;
    alt?: string;
  }) =>
    request<MediaItem>('/media/pexels/download', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
