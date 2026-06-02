import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Edit3,
  PackagePlus,
  RefreshCcw,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  Users,
  XCircle
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const emptyProduct = { name: '', sku: '', price: '', quantity_in_stock: '' };
const emptyCustomer = { full_name: '', email: '', phone_number: '' };
const emptyOrder = { customer_id: '', product_id: '', quantity: 1 };

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function App() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [customerForm, setCustomerForm] = useState(emptyCustomer);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [query, setQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  async function request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });

    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.detail === 'string' ? data.detail : 'Request failed. Check the data and try again.';
      throw new Error(message);
    }
    return data;
  }

  async function loadData() {
    setLoading(true);
    try {
      const [nextProducts, nextCustomers, nextOrders, nextDashboard] = await Promise.all([
        request('/products'),
        request('/customers'),
        request('/orders'),
        request('/dashboard')
      ]);
      setProducts(nextProducts);
      setCustomers(nextCustomers);
      setOrders(nextOrders);
      setDashboard(nextDashboard);
      setSelectedOrder((current) => nextOrders.find((order) => order.id === current?.id) || nextOrders[0] || null);
    } catch (error) {
      showNotice(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function showNotice(message, type = 'success') {
    setNotice({ message, type });
    window.clearTimeout(showNotice.timeout);
    showNotice.timeout = window.setTimeout(() => setNotice(null), 4500);
  }

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return products;
    return products.filter((product) =>
      [product.name, product.sku].some((value) => value.toLowerCase().includes(search))
    );
  }, [products, query]);

  async function submitProduct(event) {
    event.preventDefault();
    const payload = {
      ...productForm,
      price: Number(productForm.price),
      quantity_in_stock: Number(productForm.quantity_in_stock)
    };
    try {
      if (editingProductId) {
        await request(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(payload) });
        showNotice('Product updated.');
      } else {
        await request('/products', { method: 'POST', body: JSON.stringify(payload) });
        showNotice('Product added.');
      }
      setProductForm(emptyProduct);
      setEditingProductId(null);
      await loadData();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  async function submitCustomer(event) {
    event.preventDefault();
    try {
      await request('/customers', { method: 'POST', body: JSON.stringify(customerForm) });
      setCustomerForm(emptyCustomer);
      showNotice('Customer added.');
      await loadData();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  async function submitOrder(event) {
    event.preventDefault();
    try {
      const order = await request('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: Number(orderForm.customer_id),
          items: [{ product_id: Number(orderForm.product_id), quantity: Number(orderForm.quantity) }]
        })
      });
      setOrderForm(emptyOrder);
      setSelectedOrder(order);
      showNotice('Order created and inventory updated.');
      await loadData();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  async function remove(path, successMessage) {
    try {
      await request(path, { method: 'DELETE' });
      showNotice(successMessage);
      await loadData();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  }

  function editProduct(product) {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      sku: product.sku,
      price: product.price,
      quantity_in_stock: product.quantity_in_stock
    });
  }

  const selectedProduct = products.find((product) => product.id === Number(orderForm.product_id));
  const estimatedOrderValue = selectedProduct ? Number(selectedProduct.price) * Number(orderForm.quantity || 0) : 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Inventory Operations</p>
          <h1>Inventory & Order Management</h1>
        </div>
        <button className="ghost-button" onClick={loadData} title="Refresh data">
          <RefreshCcw size={18} />
          <span>Refresh</span>
        </button>
      </header>

      {notice && (
        <div className={`notice ${notice.type}`}>
          {notice.type === 'error' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{notice.message}</span>
        </div>
      )}

      <section className="metrics-grid" aria-label="Dashboard summary">
        <Metric icon={<Boxes />} label="Products" value={dashboard?.total_products ?? products.length} />
        <Metric icon={<Users />} label="Customers" value={dashboard?.total_customers ?? customers.length} />
        <Metric icon={<ClipboardList />} label="Orders" value={dashboard?.total_orders ?? orders.length} />
        <Metric
          icon={<AlertTriangle />}
          label="Low Stock"
          value={dashboard?.low_stock_products?.length ?? 0}
          tone="warning"
        />
      </section>

      <section className="workspace-grid">
        <div className="panel products-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Products</p>
              <h2>Stock Catalog</h2>
            </div>
            <label className="search-box">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products"
              />
            </label>
          </div>

          <form className="form-grid product-form" onSubmit={submitProduct}>
            <input required placeholder="Product name" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
            <input required placeholder="SKU/code" value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} />
            <input required min="0.01" step="0.01" type="number" placeholder="Price" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} />
            <input required min="0" step="1" type="number" placeholder="Stock" value={productForm.quantity_in_stock} onChange={(event) => setProductForm({ ...productForm, quantity_in_stock: event.target.value })} />
            <button className="primary-button" type="submit">
              <PackagePlus size={18} />
              <span>{editingProductId ? 'Update Product' : 'Add Product'}</span>
            </button>
            {editingProductId && (
              <button className="ghost-button" type="button" onClick={() => { setEditingProductId(null); setProductForm(emptyProduct); }}>
                Cancel
              </button>
            )}
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td><code>{product.sku}</code></td>
                    <td>{money(product.price)}</td>
                    <td>
                      <span className={product.quantity_in_stock <= 5 ? 'stock-pill low' : 'stock-pill'}>
                        {product.quantity_in_stock}
                      </span>
                    </td>
                    <td className="actions">
                      <button title="Edit product" onClick={() => editProduct(product)}><Edit3 size={16} /></button>
                      <button title="Delete product" onClick={() => remove(`/products/${product.id}`, 'Product deleted.')}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
                {!filteredProducts.length && <tr><td colSpan="5" className="empty-row">{loading ? 'Loading...' : 'No products yet.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Customers</p>
              <h2>Customer Directory</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={submitCustomer}>
            <input required placeholder="Full name" value={customerForm.full_name} onChange={(event) => setCustomerForm({ ...customerForm, full_name: event.target.value })} />
            <input required type="email" placeholder="Email address" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} />
            <input required placeholder="Phone number" value={customerForm.phone_number} onChange={(event) => setCustomerForm({ ...customerForm, phone_number: event.target.value })} />
            <button className="primary-button" type="submit">
              <UserPlus size={18} />
              <span>Add Customer</span>
            </button>
          </form>
          <div className="list">
            {customers.map((customer) => (
              <div className="list-row" key={customer.id}>
                <div>
                  <strong>{customer.full_name}</strong>
                  <span>{customer.email}</span>
                </div>
                <button title="Delete customer" onClick={() => remove(`/customers/${customer.id}`, 'Customer deleted.')}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {!customers.length && <p className="muted">{loading ? 'Loading...' : 'No customers yet.'}</p>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Orders</p>
              <h2>Create Order</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={submitOrder}>
            <select required value={orderForm.customer_id} onChange={(event) => setOrderForm({ ...orderForm, customer_id: event.target.value })}>
              <option value="">Select customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
            </select>
            <select required value={orderForm.product_id} onChange={(event) => setOrderForm({ ...orderForm, product_id: event.target.value })}>
              <option value="">Select product</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.quantity_in_stock} in stock)</option>)}
            </select>
            <input required min="1" step="1" type="number" value={orderForm.quantity} onChange={(event) => setOrderForm({ ...orderForm, quantity: event.target.value })} />
            <div className="order-estimate">
              <span>Estimated value</span>
              <strong>{money(estimatedOrderValue)}</strong>
            </div>
            <button className="primary-button" type="submit">
              <ShoppingCart size={18} />
              <span>Create Order</span>
            </button>
          </form>
          <div className="list order-list">
            {orders.map((order) => (
              <button
                className={`order-row ${selectedOrder?.id === order.id ? 'active' : ''}`}
                key={order.id}
                onClick={() => setSelectedOrder(order)}
              >
                <span>#{order.id} {order.customer_name}</span>
                <strong>{money(order.total_amount)}</strong>
              </button>
            ))}
            {!orders.length && <p className="muted">{loading ? 'Loading...' : 'No orders yet.'}</p>}
          </div>
        </div>

        <div className="panel order-detail">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Order Details</p>
              <h2>{selectedOrder ? `Order #${selectedOrder.id}` : 'No Order Selected'}</h2>
            </div>
            {selectedOrder && (
              <button title="Delete order" onClick={() => remove(`/orders/${selectedOrder.id}`, 'Order deleted.')}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
          {selectedOrder ? (
            <>
              <div className="detail-strip">
                <span>{selectedOrder.customer_name}</span>
                <strong>{money(selectedOrder.total_amount)}</strong>
              </div>
              <div className="table-wrap compact">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.product_name}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">Create or select an order to inspect its line items.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon, label, value, tone = 'default' }) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
