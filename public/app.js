const main = document.querySelector('#main');
const navigation = document.querySelector('#navigation');
const dialog = document.querySelector('#product-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const checkoutDrafts = new Map(); // Personal details stay in this page's memory only.
const icon = (name, className = '') => {
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    box: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 5 9-5M12 12v9M7 5l10 5"/>',
    shop: '<path d="M4 10v10h16V10M3 10l2-7h14l2 7M9 20v-7h6v7M3 10q2 4 5 0 4 4 8 0 3 4 5 0"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
    link: '<path d="m10 13 4-4m-7 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 0)"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    phone: '<path d="m7 3-3 1q-3 12 13 17l3-3-4-4-3 2-5-5 2-3-3-5Z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shop}</svg>`;
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => `Nu. ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = items => {
  const total = items.reduce((amount, item) => amount + BigInt(item.price.replace('.', '')) * BigInt(item.quantity), 0n);
  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
};
let seller = null;
let renderVersion = 0;
let toastTimer;
let navigationIdentity = '';
let productStore = '';
const receipts = new Map();
const shopsById = new Map();
function rememberShop(shop) {
  const saved = { ...shopsById.get(shop.id), ...shop };
  shopsById.set(shop.id, saved);
  return saved;
}
function shopPath(shop, section = '') {
  const known = typeof shop === 'string' ? shopsById.get(shop) : shop;
  if (known?.slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(known.slug) && known.slug.length <= 63) {
    return `/${known.slug}/${section ? `${section}/` : ''}`;
  }
  const id = typeof shop === 'string' ? shop : shop.id;
  return section ? `/${section}/${id}` : `/stores/${id}`;
}
function parseCarts(saved) {
  const valid = {};
  for (const [id, items] of Object.entries(saved || {})) {
    if (/^[1-9]\d{0,18}$/.test(id) && Array.isArray(items)) {
      valid[id] = items.filter(item => item && typeof item.id === 'string' && /^[1-9]\d{0,18}$/.test(item.id) && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99)
        .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index).slice(0, 50);
    }
  }
  return valid;
}
let carts = {};
let lastStore = '';
try {
  carts = parseCarts(JSON.parse(localStorage.getItem('tshongkhang_carts') || '{}'));
  lastStore = localStorage.getItem('tshongkhang_last_store') || '';
} catch { /* Browsing still works when browser storage is unavailable. */ }

async function api(path, options = {}) {
  const { raw = false, ...fetchOptions } = options;
  const response = await fetch(`/api${path}`, {
    ...fetchOptions,
    headers: { ...(options.body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body === undefined ? undefined : raw ? options.body : JSON.stringify(options.body),
  });
  let body;
  try { body = response.status === 204 ? null : await response.json(); }
  catch { throw new Error('The server returned an unreadable response. Please try again'); }
  if (!response.ok) {
    const labels = { slug: 'Shop address', business_name: 'Shop name', customer_name: 'Full name', customer_phone: 'Phone number', customer_address: 'Delivery address', image_url: 'Product image', price: 'Price', stock: 'Stock', phone: 'Contact number' };
    const error = new Error(body.details?.map(item => `${labels[item.path] || item.path}: ${item.message}`).join('; ') || body.error || 'Request failed');
    error.status = response.status;
    error.details = body.details;
    if (response.status === 401) { seller = null; updateNavigation(); }
    throw error;
  }
  return body;
}

function updateNavigation() {
  const routeStore = location.pathname.match(/^\/(?:stores|cart|checkout)\/(\d+)$/)?.[1];
  const slug = location.pathname.split('/')[1];
  const currentShop = [...shopsById.values()].find(shop => shop.slug === slug);
  const cartStore = routeStore || currentShop?.id || (location.pathname.startsWith('/products/') && productStore) || lastStore;
  const count = (carts[cartStore] || []).reduce((total, item) => total + item.quantity, 0);
  const identity = `${seller?.id || 'guest'}:${cartStore}`;
  const cartMarkup = cartStore && /^[1-9]\d{0,18}$/.test(cartStore)
    ? `<a class="cart-link" href="${shopPath(cartStore, 'cart')}" data-link data-cart-link>${icon('bag')}<span>Cart (${count})</span></a>` : '';
  if (navigationIdentity !== identity) {
    navigationIdentity = identity;
    navigation.innerHTML = `<a href="/" data-link>Browse shops</a>${cartMarkup}${seller
      ? `<a href="/seller" class="button small" data-link>${icon('shop')}My dashboard</a><button class="text-button" id="logout">Log out</button>`
      : '<a href="/login" data-link>Seller login</a><a href="/register" class="button secondary small" data-link>Open a shop</a>'}`;
    document.querySelector('#mobile-controls').innerHTML = `${cartMarkup}<button id="menu-toggle" class="icon-button" type="button" aria-label="Open menu" aria-controls="navigation" aria-expanded="false">${icon('menu')}</button>`;
    document.querySelector('#menu-toggle').onclick = () => {
      const open = navigation.dataset.open !== 'true';
      navigation.dataset.open = String(open);
      document.querySelector('#menu-toggle').setAttribute('aria-expanded', String(open));
      document.querySelector('#menu-toggle').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
  }
  document.querySelectorAll('[data-cart-link]').forEach(link => {
    link.querySelector('span').textContent = `Cart (${count})`;
    link.href = shopPath(cartStore, 'cart');
  });
  navigation.querySelectorAll('a').forEach(link => {
    const active = new URL(link.href).pathname === location.pathname;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const logout = document.querySelector('#logout');
  if (logout) logout.onclick = async () => {
    if (dirtyForm() && !(await askDiscard())) return;
    logout.disabled = true;
    try { await api('/auth/logout', { method: 'POST', body: {} }); seller = null; await navigate('/', { force: true }); toast('You have logged out'); }
    catch (error) { toast(error.message); logout.disabled = false; }
  };
}
function closeMenu() {
  navigation.dataset.open = 'false';
  const toggle = document.querySelector('#menu-toggle');
  toggle?.setAttribute('aria-expanded', 'false');
  toggle?.setAttribute('aria-label', 'Open menu');
}

function toast(message, action) {
  const element = document.querySelector('#toast');
  const content = document.createElement('span');
  content.textContent = message;
  if (action) {
    const link = document.createElement('a');
    link.href = action.href;
    link.dataset.link = '';
    link.textContent = action.label;
    content.append(' ', link);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.textContent = '×';
  dismiss.onclick = clearToast;
  element.replaceChildren(content, dismiss);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.textContent = ''; }, action ? 12000 : 4500);
}

function clearToast() {
  clearTimeout(toastTimer);
  document.querySelector('#toast').replaceChildren();
}

function saveCart(storeId) {
  lastStore = storeId;
  try {
    localStorage.setItem('tshongkhang_carts', JSON.stringify(carts));
    localStorage.setItem('tshongkhang_last_store', lastStore);
  } catch { toast('Your browser cannot save the cart. Keep this tab open while shopping'); }
  updateNavigation();
}

function addToCart(product, quantity) {
  const items = carts[product.seller_id] ||= [];
  const existing = items.find(item => item.id === product.id);
  const total = (existing?.quantity || 0) + quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || total > Math.min(99, product.stock)) {
    throw new Error(`You can add up to ${Math.min(99, product.stock)} of this product to your cart`);
  }
  if (existing) existing.quantity = total;
  else {
    if (items.length >= 50) throw new Error('Your cart can contain up to 50 different products');
    items.push({ id: product.id, quantity });
  }
  saveCart(product.seller_id);
  toast(`${product.name} added to cart.`, { href: shopPath(product.seller_id, 'cart'), label: 'View cart' });
}

function dirtyForm() {
  return (dialog.open && dialog.querySelector('form[data-dirty="true"]')) || main.querySelector('form[data-dirty="true"]');
}
async function askDiscard() {
  if (confirmDialog.open) return false;
  confirmDialog.innerHTML = `<div class="confirm-content"><div class="dialog-symbol">${icon('settings')}</div><h2 id="confirm-title">Discard your changes?</h2><p>Your changes haven’t been saved. You can keep editing or discard them.</p><div class="actions"><button class="button secondary" data-keep>Keep editing</button><button class="button danger" data-discard>Discard changes</button></div></div>`;
  confirmDialog.showModal();
  return new Promise(resolve => {
    const finish = value => { confirmDialog.close(); resolve(value); };
    confirmDialog.querySelector('[data-keep]').onclick = () => finish(false);
    confirmDialog.querySelector('[data-discard]').onclick = () => finish(true);
    confirmDialog.oncancel = event => { event.preventDefault(); finish(false); };
  });
}
async function navigate(path, { force = false } = {}) {
  const dirty = dirtyForm();
  if (!force && dirty && !(await askDiscard())) return;
  history.replaceState({ ...history.state, scroll: window.scrollY }, '', location.href);
  clearToast();
  closeMenu();
  history.pushState({}, '', path);
  await render();
  window.scrollTo(0, 0);
}
document.addEventListener('click', event => {
  const passwordToggle = event.target.closest('[data-password-toggle]');
  if (passwordToggle) {
    const input = document.getElementById(passwordToggle.getAttribute('aria-controls'));
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    passwordToggle.textContent = show ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    return;
  }
  const link = event.target.closest('a[data-link]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const url = new URL(link.href);
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', async () => {
  if (dirtyForm() && !(await askDiscard())) { history.pushState({}, '', renderedUrl); return; }
  clearToast(); closeMenu();
  await render();
  window.scrollTo(0, history.state?.scroll || 0);
});
window.addEventListener('storage', event => {
  if (event.key === 'tshongkhang_carts') {
    try {
      carts = parseCarts(JSON.parse(event.newValue || '{}'));
      lastStore = localStorage.getItem('tshongkhang_last_store') || lastStore;
      updateNavigation();
      if (/\/(?:cart|checkout)\/?$/.test(location.pathname) && !dirtyForm()) render();
    }
    catch { /* An invalid cross-tab update does not erase this tab's cart. */ }
  }
});
window.addEventListener('beforeunload', event => {
  if (dirtyForm()) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('error', event => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains('catalog-image')) {
    event.target.replaceWith(Object.assign(document.createElement('span'), { className: 'product-placeholder', textContent: '◈' }));
  }
}, true);

let pageCleanup = () => {};
let renderedUrl = location.href;
function setPage(html, title) {
  pageCleanup(); pageCleanup = () => {};
  renderedUrl = location.href;
  main.innerHTML = html;
  document.title = `${title} · Tshongkhang`;
  main.focus({ preventScroll: true });
}
function picture(product) {
  return `<div class="product-picture">${product.image_url ? `<img class="catalog-image" src="${escape(product.image_url)}" alt="${escape(product.name)}" loading="lazy">` : `<span class="product-placeholder" aria-hidden="true">${escape(product.name[0])}</span>`}</div>`;
}
const breadcrumbs = (items) => `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map(([name, url]) => url ? `<a href="${url}" data-link title="${escape(name)}">${escape(name)}</a>` : `<span aria-current="page" title="${escape(name)}">${escape(name)}</span>`).join('<span aria-hidden="true">/</span>')}</nav>`;
const field = (label, name, { type = 'text', value = '', required = true, max = 150, autocomplete = '', extra = '', help = '' } = {}) => {
  const input = `<input id="field-${name}" name="${name}" type="${type}" ${help ? `aria-describedby="help-${name}"` : ''} value="${escape(value)}" ${required ? 'required' : ''} maxlength="${max}" ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${extra}>`;
  return `<div class="field"><label for="field-${name}">${label}</label>${type === 'password' ? `<div class="password-input">${input}<button type="button" data-password-toggle aria-controls="field-${name}" aria-label="Show password">Show</button></div>` : input}${help ? `<small id="help-${name}">${help}</small>` : ''}</div>`;
};

function validateForm(form) {
  let first;
  form.querySelectorAll('input,textarea,select').forEach(input => {
    if (input.name === 'customer_phone') input.setCustomValidity(/^\+?[0-9][0-9 ()-]{5,24}$/.test(input.value.trim()) ? '' : 'Enter a valid phone number');
    const invalid = !input.checkValidity();
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    let message = input.closest('.field')?.querySelector('.field-error');
    if (!message && input.closest('.field')) {
      message = document.createElement('small'); message.className = 'field-error';
      input.closest('.field').append(message);
    }
    if (message) {
      message.id = `${input.id || input.name}-error`;
      input.setAttribute('aria-describedby', [...new Set([...(input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean), message.id])].join(' '));
      message.textContent = invalid ? input.validationMessage : '';
    }
    if (invalid && !first) first = input;
  });
  if (first) {
    first.closest('details')?.setAttribute('open', '');
    const focus = first.type === 'file' ? first.closest('.image-picker')?.querySelector('[data-choose-image]') : first;
    focus?.focus(); return false;
  }
  return true;
}
function bindForm(form, action, { onSettled } = {}) {
  form.noValidate = true;
  form.addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid');
    const error = event.target.closest('.field')?.querySelector('.field-error');
    if (error) error.textContent = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.busy || !validateForm(form)) return;
    const errorBox = form.querySelector('.error');
    const button = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const controls = [...form.querySelectorAll('input,textarea,select,button[type="button"]')].filter(input => !input.disabled);
    controls.forEach(input => { input.disabled = true; });
    const original = button.innerHTML;
    form.dataset.busy = 'true'; button.disabled = true; button.setAttribute('aria-busy', 'true');
    const busyLabel = form.id === 'checkout-form' ? 'Placing your order…' : form.id === 'auth-form' ? (location.pathname.includes('register') ? 'Creating your shop…' : 'Logging in…') : 'Saving…';
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${busyLabel}`;
    const modal = form.closest('dialog');
    const close = modal?.querySelector('[aria-label="Close dialog"]');
    if (close) close.disabled = true;
    errorBox.textContent = '';
    try { await action(data); }
    catch (error) {
      errorBox.textContent = error.message === 'Failed to fetch' ? 'Could not reach the server. Check your connection and try again.' : error.message;
      if (error.status === 401 && form.id !== 'auth-form') {
        const login = document.createElement('a');
        login.href = '/login'; login.dataset.link = ''; login.textContent = 'Log in again';
        errorBox.append(' ', login);
      }
      for (const detail of error.details || []) {
        const input = form.elements.namedItem(detail.path);
        if (input instanceof HTMLElement) {
          input.setAttribute('aria-invalid', 'true');
          const message = input.closest('.field')?.querySelector('.field-error');
          if (message) message.textContent = detail.message;
        }
      }
      errorBox.setAttribute('tabindex', '-1'); errorBox.focus();
    } finally {
      delete form.dataset.busy;
      button.disabled = false; button.innerHTML = original; button.removeAttribute('aria-busy');
      controls.forEach(input => { input.disabled = false; });
      if (close) close.disabled = false;
      if (form.isConnected) onSettled?.();
    }
  });
}

function avatar(shop, className = '') {
  return `<span class="shop-avatar ${className}">${shop.logo_url ? `<img class="catalog-image" src="${escape(shop.logo_url)}" alt="">` : escape(shop.business_name[0])}</span>`;
}
function emptyState(title, description, action = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon('bag')}</span><h2>${escape(title)}</h2><p>${escape(description)}</p>${action}</div>`;
}
function syncQuery(values) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
  history.replaceState(history.state, '', url.pathname + url.search);
}
function sortProducts(products, sort) {
  return [...products].sort((a, b) => sort === 'price-low' ? Number(a.price) - Number(b.price)
    : sort === 'price-high' ? Number(b.price) - Number(a.price) : sort === 'name' ? a.name.localeCompare(b.name) : Number(b.id) - Number(a.id));
}
function searchControl(id, label, placeholder, value = '') {
  return `<label class="search-control">${icon('search')}<span class="sr-only">${label}</span><input id="${id}" type="search" placeholder="${placeholder}" value="${escape(value)}" autocomplete="off"></label>`;
}
function sortControl(value = 'latest') {
  return `<label class="sort-control"><span class="sr-only">Sort products</span><select id="sort-products"><option value="latest" ${value === 'latest' ? 'selected' : ''}>Newest first</option><option value="price-low" ${value === 'price-low' ? 'selected' : ''}>Price: low to high</option><option value="price-high" ${value === 'price-high' ? 'selected' : ''}>Price: high to low</option><option value="name" ${value === 'name' ? 'selected' : ''}>Name: A to Z</option></select></label>`;
}
function bindProductButtons(container, products) {
  container.querySelectorAll('[data-add]').forEach(button => {
    button.onclick = () => {
      try {
        const product = products.find(item => item.id === button.dataset.add);
        addToCart(product, 1);
        const count = (carts[product.seller_id] || []).find(item => item.id === product.id)?.quantity || 0;
        const label = button.closest('.product-card').querySelector('[data-in-cart]');
        label.textContent = `${count} in your cart`;
        label.hidden = false;
        button.disabled = count >= Math.min(99, product.stock);
        if (button.disabled) button.textContent = 'In your cart';
      } catch (error) { toast(error.message); }
    };
  });
}

async function home(version) {
  const [shops, products] = await Promise.all([api('/sellers'), api('/products')]);
  if (version !== renderVersion) return;
  shops.forEach(rememberShop);
  updateNavigation();
  const featured = products.filter(product => product.stock > 0).slice(-4).reverse();
  const query = new URLSearchParams(location.search).get('q') || '';
  setPage(`<section class="market-hero"><div class="hero-copy"><span class="place-label">${icon('pin')}Independent shops across Bhutan</span><h1>Shop from the people<br>close to home.</h1><p>Discover local pantry favourites, handcrafted goods and everyday finds. Browse a shop, fill your cart and order directly.</p><a class="button" href="#shops">Explore local shops ${icon('arrow')}</a><a class="hero-seller-link" href="/register" data-link>Have a business? Open your shop</a></div><div class="hero-collection" aria-label="A few local finds">${featured.length ? featured.map(product => `<a class="hero-product" href="/products/${product.id}" data-link>${picture(product)}<span>${escape(product.name)}</span></a>`).join('') : `<div class="hero-shop-mark"><img src="/images/mark.svg" alt="" width="120" height="120"><span>A little space for local businesses.</span></div>`}</div></section>
    <div class="market-search">${searchControl('market-search', 'Search shops and products', 'Search for a shop or something you love', query)}<span>${icon('shop')}Shop directly with local sellers</span></div>
    <section id="shops"><div class="section-heading"><div><h2>Meet your local shops</h2><p class="muted">Find a familiar favourite. Discover someone new.</p></div><span id="shop-results" class="result-count"></span></div><div id="shop-grid" class="shop-grid"></div></section>
    <section id="featured"><div class="section-heading"><div><h2>Find something local</h2><p class="muted">Products from the shops in our community.</p></div><span id="product-results" class="result-count"></span></div><div id="market-products" class="product-grid"></div></section>
    <section class="seller-invitation"><div>${icon('shop')}<h2>Your business deserves a place online.</h2><p>Add your products, get a shareable shop address and let customers order directly.</p></div><a href="/register" data-link class="button secondary">Open a shop</a></section>`, 'Shops close to home');
  const input = document.querySelector('#market-search');
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const matches = shops.filter(shop => `${shop.business_name} ${shop.location} ${shop.description}`.toLowerCase().includes(q)
      || products.some(product => product.seller_id === shop.id && product.name.toLowerCase().includes(q)));
    document.querySelector('#shop-results').textContent = `${matches.length} ${matches.length === 1 ? 'shop' : 'shops'}`;
    document.querySelector('#shop-grid').classList.toggle('single-shop', matches.length === 1);
    document.querySelector('#shop-grid').innerHTML = matches.map(shop => {
      const count = products.filter(product => product.seller_id === shop.id).length;
      return `<article class="store-card"><div class="store-band">${avatar(shop)}<span class="location">${icon('pin')}${escape(shop.location || 'Bhutan')}</span></div><div class="store-body"><h3><a href="${shopPath(shop)}" data-link>${escape(shop.business_name)}</a></h3><p>${escape(shop.description || 'A local business with something to share. Step inside and see what’s on the shelves.')}</p><div class="store-card-footer"><span>${count ? `${count} ${count === 1 ? 'product' : 'products'}` : 'Getting started'}</span><a class="store-visit" href="${shopPath(shop)}" data-link>Visit shop ${icon('arrow')}</a></div></div></article>`;
    }).join('') || emptyState(q ? 'No shops match your search' : 'Your shop could be the first', q ? 'Try a shop name, town or different product.' : 'Open your shop and add your first products.', q ? '<button class="button secondary" id="clear-market-search">Clear search</button>' : '<a href="/register" class="button" data-link>Open a shop</a>');
    const found = products.filter(product => `${product.name} ${product.description} ${shopsById.get(product.seller_id)?.business_name || ''}`.toLowerCase().includes(q));
    const shown = sortProducts(found, 'latest').slice(0, q ? 50 : 8);
    document.querySelector('#product-results').textContent = `${found.length} ${found.length === 1 ? 'product' : 'products'}`;
    const grid = document.querySelector('#market-products');
    grid.innerHTML = shown.map(product => productCard(product, true)).join('') || emptyState('No products here yet', q ? 'Try another search or explore the shops above.' : 'Our local sellers are getting their shelves ready.');
    bindProductButtons(grid, products);
    document.querySelector('#clear-market-search')?.addEventListener('click', () => { input.value = ''; draw(); input.focus(); });
    syncQuery({ q: input.value.trim() });
  };
  input.oninput = draw;
  draw();
}

async function authPage(mode) {
  if (seller) { await navigate('/seller', { force: true }); return; }
  const register = mode === 'register';
  setPage(`<div class="auth-layout"><aside class="auth-intro"><span class="auth-brand-mark"><img src="/images/mark.svg" width="56" height="56" alt=""></span><h2>${register ? 'Your products.<br>Your customers.<br>Your little shop online.' : 'A little care for your shop goes a long way.'}</h2><p>${register ? 'Make a home for your business on Tshongkhang. Start with a shop name, then add the products you love.' : 'Keep your collection fresh, update your shop and share it with customers.'}</p><ul class="benefit-list"><li>${icon('shop')}Your own shareable shop address</li><li>${icon('box')}Simple product and stock management</li><li>${icon('bag')}Customers can order without signing up</li></ul><a href="/" data-link>Explore the local shops ${icon('arrow')}</a></aside><section class="auth-panel"><h1>${register ? 'Open your shop' : 'Welcome back.'}</h1><p class="muted">${register ? 'A few details to get your shop started.' : 'Log in to your seller account.'}</p><form id="auth-form">
    ${register ? `<fieldset><legend>Your shop</legend>${field('Shop name', 'business_name', { autocomplete: 'organization' })}${field('Shop address (optional)', 'slug', { required: false, max: 63, extra: 'pattern="[a-z0-9]+(?:-[a-z0-9]+)*" autocapitalize="none" spellcheck="false"', help: 'Use letters, numbers and single hyphens. You can choose this or use the suggested address.' })}<div class="address-preview"><span>Your shop will be at</span><strong id="address-preview">${escape(location.host)}/your-shop/</strong><span id="address-availability" role="status"></span></div>${field('Town or dzongkhag (optional)', 'location', { required: false, max: 250, autocomplete: 'address-level2' })}</fieldset><fieldset><legend>Your seller account</legend>` : ''}
    ${field('Email address', 'email', { type: 'email', max: 254, autocomplete: 'username' })}
    ${field('Password', 'password', { type: 'password', max: 128, autocomplete: register ? 'new-password' : 'current-password', extra: register ? 'minlength="8"' : '', help: register ? 'Use at least 8 characters. A longer, unique password keeps your shop safer.' : '' })}
    ${register ? '</fieldset>' : ''}<div class="error" role="alert"></div><button class="button full" type="submit">${register ? 'Create my shop' : 'Log in'}${icon('arrow')}</button></form><p class="form-footer">${register ? 'Already have a shop? <a href="/login" data-link>Log in</a>' : 'New to Tshongkhang? <a href="/register" data-link>Open a shop</a>'}</p></section></div>`, register ? 'Open a shop' : 'Seller login');
  const form = document.querySelector('#auth-form');
  if (register) {
    const name = form.elements.business_name;
    const slug = form.elements.slug;
    let edited = false, timer, sequence = 0;
    const update = () => {
      if (!edited) {
        let suggestion = name.value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63).replace(/-$/, '');
        if (['api','admin','auth','login','register','seller','store','stores','products','cart','checkout','receipt','images','assets','www','health','help','support','about','contact','settings'].includes(suggestion)) suggestion += '-shop';
        slug.value = suggestion;
      }
      document.querySelector('#address-preview').textContent = `${location.host}/${slug.value || 'your-shop'}/`;
      const status = document.querySelector('#address-availability');
      status.textContent = '';
      slug.setCustomValidity('');
      clearTimeout(timer);
      const current = ++sequence;
      if (!slug.value || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.value)) return;
      timer = setTimeout(async () => {
        try {
          const result = await api(`/shops/${slug.value}/availability`);
          if (current !== sequence || !status.isConnected) return;
          status.textContent = result.available ? 'This address is available' : 'Already in use. Choose another address.';
          status.dataset.available = String(result.available);
          slug.setCustomValidity(result.available ? '' : 'This shop address is already taken');
        } catch { if (current === sequence && status.isConnected) status.textContent = 'We’ll check this address when you create your shop.'; }
      }, 350);
    };
    name.oninput = update;
    slug.oninput = () => { edited = true; update(); };
  }
  bindForm(form, async data => {
    seller = rememberShop(await api(`/auth/${mode}`, { method: 'POST', body: Object.fromEntries(data) }));
    await navigate('/seller', { force: true });
    toast(register ? 'Your shop is ready. Add your first product' : 'Welcome back');
  });
}

function workspace(shop, active, content) {
  return `<div class="workspace"><aside class="workspace-sidebar"><div class="workspace-shop">${avatar(shop)}<div><strong>${escape(shop.business_name)}</strong><span>Seller workspace</span></div></div><nav aria-label="Seller workspace"><a href="/seller" data-link ${active === 'products' ? 'aria-current="page"' : ''}>${icon('box')}Products</a><a href="/seller/shop" data-link ${active === 'shop' ? 'aria-current="page"' : ''}>${icon('settings')}Shop details</a></nav><div class="workspace-tip">${icon('link')}<p>Your shop has its own address. Share it with customers whenever you’re ready.</p></div></aside><section class="workspace-content"><div class="workspace-heading"><div><p class="muted">Your seller dashboard</p><h1>${escape(shop.business_name)}</h1></div><a href="${shopPath(shop)}" class="button secondary" data-link>View my storefront ${icon('arrow')}</a></div>${content}</section></div>`;
}
function sharePanel(shop) {
  return `<div class="shop-address"><div>${icon('link')}<div><span>Your shop address</span><a href="${shopPath(shop)}" data-link>${escape(location.origin)}${shopPath(shop)}</a></div></div><button type="button" class="button secondary small" id="copy-shop-link">Copy link</button></div>`;
}
function bindShare(shop) {
  document.querySelector('#copy-shop-link')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${shopPath(shop)}`); toast('Shop link copied'); }
    catch { toast('Select and copy the shop address shown on your dashboard'); }
  });
}
async function dashboard(version, section = 'products') {
  const currentSeller = await api('/auth/me');
  const products = await api(`/products?seller_id=${currentSeller.id}`);
  if (version !== renderVersion) return;
  seller = rememberShop(currentSeller);
  updateNavigation();
  if (section === 'shop') {
    setPage(workspace(seller, 'shop', `<div class="section-heading"><div><h2>Shop details</h2><p class="muted">Give customers a clear introduction and a way to reach you.</p></div></div><div class="settings-layout"><form id="shop-settings" class="panel"><h3>About your shop</h3>${field('Shop name', 'business_name', { value: seller.business_name, autocomplete: 'organization' })}<label class="field">About your shop<textarea name="description" maxlength="2000" rows="4" placeholder="What do you sell? What makes your shop yours?">${escape(seller.description)}</textarea></label>${field('Town or dzongkhag', 'location', { value: seller.location, required: false, max: 250, autocomplete: 'address-level2' })}${field('Contact number (optional)', 'phone', { type: 'tel', value: seller.phone, required: false, max: 26, autocomplete: 'tel', help: 'Shown on your storefront so customers can contact you.' })}<h3 class="form-section-title">Shop logo</h3>${imagePickerMarkup('shop-image', seller.logo_url)}<div class="error" role="alert"></div><div class="form-actions"><span id="settings-state" class="muted">Your changes appear on your public shop after saving.</span><button type="submit" class="button">Save shop details</button></div></form><aside><div class="panel"><h3>Your public address</h3><p class="muted">Your address stays the same when you rename your shop.</p><a href="${shopPath(seller)}" data-link class="settings-shop-link">${escape(location.origin)}${shopPath(seller)}</a><button type="button" class="button secondary full" id="copy-shop-link">Copy link</button></div><div class="settings-note">${icon('shop')}<p>Keep your description, contact number and product availability up to date so customers know what to expect.</p></div></aside></div>`), 'Shop details');
    bindShare(seller);
    const form = document.querySelector('#shop-settings');
    const picker = bindImagePicker(form, 'shop-image', seller.logo_url);
    pageCleanup = picker.dispose;
    trackDirty(form);
    bindForm(form, async data => {
      await api(`/sellers/${seller.id}/profile`, { method: 'PATCH', body: { business_name: data.get('business_name'), description: data.get('description'), location: data.get('location'), phone: data.get('phone') || null, logo_url: await picker.imageUrl() } });
      delete form.dataset.dirty;
      await render(); toast('Shop details saved');
    });
    return;
  }
  const profileComplete = Boolean(seller.phone && seller.description);
  const setup = !products.length || !profileComplete ? `<section class="setup-panel"><div><h2>Make your shop ready to share</h2><p>A few small steps help customers feel at home.</p></div><div class="setup-tasks"><div class="setup-task ${products.length ? 'is-complete' : ''}"><span>${products.length ? icon('check') : icon('box')}</span><div><strong>Add your first product</strong><p>A name, photo, price and available stock.</p></div>${products.length ? '<span class="task-done">Done</span>' : '<button class="text-button" id="setup-product">Add a product</button>'}</div><div class="setup-task ${profileComplete ? 'is-complete' : ''}"><span>${profileComplete ? icon('check') : icon('shop')}</span><div><strong>Introduce your shop</strong><p>Add a description and contact number.</p></div><button class="text-button" id="edit-shop">${profileComplete ? 'Edit details' : 'Edit shop details'}</button></div></div></section>` : '';
  const query = new URLSearchParams(location.search);
  setPage(workspace(seller, 'products', `${sharePanel(seller)}${setup}<div class="stats"><div class="stat"><strong>${products.length}</strong><span>Products in your shop</span></div><div class="stat"><strong>${products.filter(product => product.stock > 0).length}</strong><span>Available to order</span></div><div class="stat"><strong>${products.reduce((total, product) => total + product.stock, 0).toLocaleString()}</strong><span>Items in stock</span></div></div><div class="section-heading"><div><h2>Your products</h2><p class="muted">Manage what customers see on your shelves.</p></div><button class="button" id="add-product">${icon('plus')}Add product</button></div>${products.length ? `<div class="catalog-toolbar">${searchControl('seller-search', 'Search your products', 'Search your products', query.get('q') || '')}<label class="sort-control"><span class="sr-only">Filter by stock</span><select id="stock-filter"><option value="all">All stock</option><option value="available" ${query.get('stock') === 'available' ? 'selected' : ''}>In stock</option><option value="empty" ${query.get('stock') === 'empty' ? 'selected' : ''}>Out of stock</option></select></label><span id="seller-results" class="result-count"></span></div>` : ''}<div id="seller-products"></div>${profileComplete ? '<div class="section-note"><span>Need to update your shop’s description or contact number?</span><button class="text-button" id="edit-shop">Edit shop details</button></div>' : ''}`), 'My dashboard');
  bindShare(seller);
  document.querySelector('#add-product').onclick = () => productForm();
  document.querySelector('#setup-product')?.addEventListener('click', () => productForm());
  document.querySelector('#edit-shop')?.addEventListener('click', () => navigate('/seller/shop'));
  const container = document.querySelector('#seller-products');
  const draw = () => {
    const search = document.querySelector('#seller-search');
    const filter = document.querySelector('#stock-filter');
    const q = search?.value.trim().toLowerCase() || '';
    const stock = filter?.value || 'all';
    const found = products.filter(product => product.name.toLowerCase().includes(q) && (stock === 'all' || (stock === 'available' ? product.stock > 0 : product.stock === 0)));
    if (search) { syncQuery({ q: search.value.trim(), stock: stock === 'all' ? '' : stock }); document.querySelector('#seller-results').textContent = `${found.length} of ${products.length}`; }
    container.innerHTML = found.length ? `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th class="align-right">Actions</th></tr></thead><tbody>${found.map(product => `<tr><td><div class="table-product">${picture(product)}<div><a href="/products/${product.id}" data-link>${escape(product.name)}</a><span>${escape(product.description.slice(0, 70) || 'No description added')}</span></div></div></td><td data-label="Price">${money(product.price)}</td><td data-label="Stock"><span class="badge ${product.stock ? '' : 'empty'}">${product.stock ? `${product.stock} available` : 'Out of stock'}</span></td><td class="product-actions"><div class="actions"><button class="button secondary small" data-edit="${product.id}">Edit<span class="sr-only"> ${escape(product.name)}</span></button><button class="text-button danger" data-delete="${product.id}">Delete<span class="sr-only"> ${escape(product.name)}</span></button></div></td></tr>`).join('')}</tbody></table></div>` : emptyState(products.length ? 'No matching products' : 'Let’s fill your shelves', products.length ? 'Try a different name or stock filter.' : 'Add your first product with a photo, price and available stock. It appears on your shop straight away.', products.length ? '<button class="button secondary" id="clear-seller-filters">Clear filters</button>' : '<button class="button secondary" id="empty-add-product">Add your first product</button>');
    container.querySelectorAll('[data-edit]').forEach(button => { button.onclick = () => productForm(products.find(product => product.id === button.dataset.edit)); });
    container.querySelectorAll('[data-delete]').forEach(button => { button.onclick = () => deleteProduct(products.find(product => product.id === button.dataset.delete)); });
    document.querySelector('#empty-add-product')?.addEventListener('click', () => productForm());
    document.querySelector('#clear-seller-filters')?.addEventListener('click', () => { search.value = ''; filter.value = 'all'; draw(); });
  };
  draw();
  document.querySelector('#seller-search')?.addEventListener('input', draw);
  document.querySelector('#stock-filter')?.addEventListener('change', draw);
}

let modalCleanup = () => {};
function openDialog(title, content) {
  clearToast();
  modalCleanup(); modalCleanup = () => {};
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="product-dialog-title">${escape(title)}</h2><button class="icon-button" aria-label="Close dialog" type="button">${icon('close')}</button></div>${content}`;
  dialog.querySelector('[aria-label="Close dialog"]').onclick = requestCloseDialog;
  dialog.showModal();
}
async function requestCloseDialog() {
  if (dialog.querySelector('form[data-busy]')) return;
  if (dialog.querySelector('form[data-dirty="true"]') && !(await askDiscard())) return;
  dialog.querySelector('form')?.removeAttribute('data-dirty');
  dialog.close();
}
dialog.addEventListener('close', () => { modalCleanup(); modalCleanup = () => {}; });
dialog.addEventListener('cancel', event => { event.preventDefault(); requestCloseDialog(); });
function trackDirty(form) {
  const snapshot = () => JSON.stringify([...new FormData(form)].map(([key, value]) => [key, value instanceof File ? (value.name ? `${value.name}:${value.size}:${value.lastModified}` : '') : value]));
  const initial = snapshot();
  form.addEventListener('input', () => { form.dataset.dirty = String(snapshot() !== initial); });
  form.addEventListener('change', () => { form.dataset.dirty = String(snapshot() !== initial); });
}
function imagePickerMarkup(id, current) {
  return `<div class="image-picker" id="${id}"><div class="image-preview">${current ? `<img src="${escape(current)}" alt="Selected image">` : `<span>${icon('image')}<small>Add a clear product or shop photo</small></span>`}</div><div class="image-picker-controls"><button class="button secondary small" type="button" data-choose-image>${icon('image')}Choose image</button><input class="sr-only" tabindex="-1" aria-label="Choose image file" id="${id}-file" name="${id}-file" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG or WebP. Up to 10 MB. We’ll resize it for your shop.</small><button class="text-button danger" type="button" data-remove-image ${current ? '' : 'hidden'}>Remove image</button><p class="field-error" data-image-error></p></div><details class="image-link-details"><summary>Or use an image link</summary>${field('Product image URL (optional)', `${id}-url`, { type: 'url', required: false, max: 2048, value: current?.startsWith('http') ? current : '', help: 'Paste a direct link to a JPG, PNG or WebP image.' })}</details></div>`;
}
async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG or WebP image');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Choose another file'); }
  try {
    if (bitmap.width * bitmap.height > 24_000_000) throw new Error('This image is too large. Choose a smaller photo');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .86));
    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('Choose a smaller image and try again');
    return blob;
  } finally { bitmap.close(); }
}
function bindImagePicker(form, id, initialUrl) {
  const root = form.querySelector(`#${id}`);
  const file = root.querySelector('[type="file"]');
  const link = root.querySelector('[type="url"]');
  const preview = root.querySelector('.image-preview');
  const remove = root.querySelector('[data-remove-image]');
  const error = root.querySelector('[data-image-error]');
  let current = initialUrl || null, prepared = null, uploaded = null, previewUrl = null;
  const dispose = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; };
  const draw = url => {
    preview.innerHTML = url ? '<img alt="Selected image">' : `<span>${icon('image')}<small>Add a clear photo</small></span>`;
    if (url) {
      const image = preview.querySelector('img');
      image.onerror = () => { error.textContent = 'Preview unavailable. Check the image link or choose a file.'; };
      image.src = url;
    }
    remove.hidden = !url;
  };
  root.querySelector('[data-choose-image]').onclick = () => file.click();
  file.onchange = () => {
    file.setCustomValidity(''); error.textContent = ''; uploaded = null;
    if (!file.files[0]) return;
    const chosen = file.files[0];
    if (!['image/jpeg','image/png','image/webp'].includes(chosen.type) || chosen.size > 10 * 1024 * 1024) {
      file.setCustomValidity('Choose a JPG, PNG or WebP image smaller than 10 MB');
      error.textContent = file.validationMessage;
      prepared = null; return;
    }
    dispose(); previewUrl = URL.createObjectURL(chosen); draw(previewUrl); link.value = '';
    prepared = prepareImage(chosen).then(blob => ({ blob }), issue => {
      file.setCustomValidity(issue.message); error.textContent = issue.message;
      return { error: issue };
    });
  };
  link.oninput = () => {
    dispose(); prepared = null; uploaded = null; file.value = ''; file.setCustomValidity(''); error.textContent = '';
    current = link.value || null; draw(current);
  };
  remove.onclick = () => {
    dispose(); current = null; prepared = null; uploaded = null; file.value = ''; link.value = ''; file.setCustomValidity(''); error.textContent = ''; draw(null); form.dataset.dirty = 'true';
  };
  return { dispose, async imageUrl() {
    if (uploaded) return uploaded;
    if (prepared) {
      const result = await prepared;
      if (result.error) throw result.error;
      const response = await api('/uploads/products', { method: 'POST', raw: true, headers: { 'Content-Type': result.blob.type }, body: result.blob });
      uploaded = response.image_url; return uploaded;
    }
    return current;
  } };
}
function productForm(product = null) {
  openDialog(product ? 'Edit product' : 'Add a product', `<p class="dialog-intro">${product ? 'Keep the details and availability up to date for your customers.' : 'Give customers a clear picture of what’s on your shelves.'}</p><form id="product-form"><h3 class="form-section-title">Product image</h3>${imagePickerMarkup('product-image', product?.image_url)}${field('Product name', 'name', { value: product?.name })}<label class="field">Description<textarea name="description" maxlength="2000" rows="3" placeholder="Size, materials, ingredients, or what makes it special">${escape(product?.description)}</textarea></label><div class="form-row">${field('Price (Nu.)', 'price', { type: 'number', value: product?.price, extra: 'min="0.01" max="9999999999.99" step="0.01" inputmode="decimal"' })}${field('Stock available', 'stock', { type: 'number', value: product?.stock ?? '', extra: 'min="0" max="2147483647" step="1" inputmode="numeric"', help: 'Use 0 if it’s currently unavailable.' })}</div><div class="error" role="alert"></div><div class="dialog-actions"><button type="button" class="button secondary" data-cancel>Cancel</button><button type="submit" class="button">${product ? 'Save product' : 'Add product'}</button></div></form>`);
  const form = dialog.querySelector('form');
  const picker = bindImagePicker(form, 'product-image', product?.image_url);
  modalCleanup = picker.dispose;
  trackDirty(form);
  form.querySelector('[data-cancel]').onclick = requestCloseDialog;
  bindForm(form, async data => {
    const price = Number(data.get('price')).toFixed(2);
    await api(product ? `/products/${product.id}` : '/products', { method: product ? 'PUT' : 'POST', body: { name: data.get('name'), description: data.get('description'), price, stock: Number(data.get('stock')), image_url: await picker.imageUrl() } });
    delete form.dataset.dirty;
    dialog.close(); await render(); toast(product ? 'Product saved' : 'Product added to your shop');
  });
}
function deleteProduct(product) {
  openDialog('Delete product?', `<p>Remove <strong>${escape(product.name)}</strong> from your shop? Customers won’t be able to order it. Existing orders will keep their original details.</p><form><div class="error" role="alert"></div><div class="dialog-actions"><button class="button secondary" type="button" id="cancel-delete">Keep product</button><button class="button danger" type="submit">Delete product</button></div></form>`);
  dialog.querySelector('#cancel-delete').onclick = () => dialog.close();
  bindForm(dialog.querySelector('form'), async () => { await api(`/products/${product.id}`, { method: 'DELETE' }); dialog.close(); await render(); toast('Product deleted'); });
}
function productCard(product, showShop = false) {
  const count = (carts[product.seller_id] || []).find(item => item.id === product.id)?.quantity || 0;
  const limit = Math.min(99, product.stock);
  const shop = shopsById.get(product.seller_id);
  return `<article class="product-card"><a class="product-image-link" href="/products/${product.id}" data-link aria-label="View ${escape(product.name)}">${picture(product)}${product.stock ? '' : '<span class="sold-out-label">Sold out</span>'}</a><div class="product-info">${showShop && shop ? `<a class="product-shop" href="${shopPath(shop)}" data-link>${escape(shop.business_name)}</a>` : ''}<h3><a href="/products/${product.id}" data-link>${escape(product.name)}</a></h3><p>${escape(product.description || 'Find out more about this local product.')}</p><span class="in-cart-note" data-in-cart ${count ? '' : 'hidden'}>${count} in your cart</span><div class="product-bottom"><span class="price">${money(product.price)}</span><button class="button small ${!product.stock ? 'secondary' : ''}" data-add="${product.id}" ${!product.stock || count >= limit ? 'disabled' : ''}>${!product.stock ? 'Sold out' : count >= limit ? 'In your cart' : 'Add to cart'}</button></div></div></article>`;
}

async function storefront(id, version, knownShop) {
  const [shop, products] = await Promise.all([knownShop || api(`/sellers/${id}`), api(`/products?seller_id=${id}`)]);
  if (version !== renderVersion) return;
  rememberShop(shop); updateNavigation();
  const query = new URLSearchParams(location.search);
  setPage(`${breadcrumbs([['All shops', '/'], [shop.business_name]])}<section class="shop-cover"><div class="shop-cover-pattern" aria-hidden="true"></div><div class="shop-cover-content">${avatar(shop, 'large')}<div class="shop-introduction"><span class="place-label">${icon('pin')}${escape(shop.location || 'Bhutan')}</span><h1>${escape(shop.business_name)}</h1><p>${escape(shop.description || 'Welcome to our little shop. Take a look at what’s on the shelves.')}</p></div>${shop.phone ? `<a class="button secondary" href="tel:${escape(shop.phone.replace(/[^+0-9]/g, ''))}">${icon('phone')}Contact shop</a>` : ''}</div><div class="shop-bottom-bar"><a href="#shop-products" class="shop-tab active">All products <span>${products.length}</span></a><a href="#shop-about" class="shop-tab">About this shop</a><span>Order directly from this shop</span></div></section>
    <section id="shop-products"><div class="section-heading"><div><h2>On the shelves</h2><p class="muted">A little something from ${escape(shop.business_name)}.</p></div></div>${products.length ? `<div class="catalog-toolbar">${searchControl('search', 'Search products', 'Search in this shop', query.get('q') || '')}${sortControl(query.get('sort') || 'latest')}<label class="checkbox-label"><input id="available-only" type="checkbox" ${query.get('available') === 'true' ? 'checked' : ''}>In stock only</label></div><div class="catalog-result-row"><span id="product-results" class="result-count" role="status"></span><button class="text-button" id="clear-product-filters" hidden>Clear filters</button></div>` : ''}<div id="product-grid" class="product-grid"></div>${products.length ? '' : emptyState('Something good is on its way', 'This shop hasn’t added products yet. Discover another local shop in the meantime.', '<a href="/" data-link class="button secondary">Browse shops</a>')}</section>
    <section id="shop-about" class="shop-about"><div><span class="section-symbol">${icon('shop')}</span><h2>A little about the shop</h2><p class="description">${escape(shop.description || 'This independent shop is part of the Tshongkhang community.')}</p></div><div class="shop-about-details"><p>${icon('pin')}<span><strong>Based in</strong>${escape(shop.location || 'Bhutan')}</span></p>${shop.phone ? `<p>${icon('phone')}<span><strong>Contact the shop</strong><a href="tel:${escape(shop.phone.replace(/[^+0-9]/g, ''))}">${escape(shop.phone)}</a></span></p>` : ''}<p>${icon('bag')}<span><strong>Ordering here</strong>Place your order online. Delivery and payment are arranged with the shop.</span></p></div></section>`, shop.business_name);
  if (!products.length) return;
  const search = document.querySelector('#search');
  const sort = document.querySelector('#sort-products');
  const available = document.querySelector('#available-only');
  const grid = document.querySelector('#product-grid');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const found = sortProducts(products.filter(product => `${product.name} ${product.description}`.toLowerCase().includes(q) && (!available.checked || product.stock > 0)), sort.value);
    grid.innerHTML = found.map(product => productCard(product)).join('') || emptyState('No products match just yet', 'Try another search or clear your filters.');
    document.querySelector('#product-results').textContent = `${found.length} ${found.length === 1 ? 'product' : 'products'}${q ? ` matching “${search.value.trim()}”` : ''}`;
    document.querySelector('#clear-product-filters').hidden = !q && !available.checked && sort.value === 'latest';
    syncQuery({ q: search.value.trim(), sort: sort.value === 'latest' ? '' : sort.value, available: available.checked ? 'true' : '' });
    bindProductButtons(grid, products);
  };
  search.oninput = draw; sort.onchange = draw; available.onchange = draw;
  document.querySelector('#clear-product-filters').onclick = () => { search.value = ''; sort.value = 'latest'; available.checked = false; draw(); search.focus(); };
  draw();
}
function quantityControl(id, name, value, max, extra = '') {
  return `<div class="quantity-control"><button type="button" data-step="-1" aria-label="Decrease quantity for ${escape(name)}" ${value <= 1 ? 'disabled' : ''}>−</button><input id="${id}" type="number" inputmode="numeric" aria-label="Quantity for ${escape(name)}" value="${value}" min="1" max="${Math.max(1, max)}" required ${max ? '' : 'disabled'} ${extra}><button type="button" data-step="1" aria-label="Increase quantity for ${escape(name)}" ${value >= max ? 'disabled' : ''}>+</button></div>`;
}
function bindQuantity(container, onChange) {
  const input = container.querySelector('input');
  const buttons = container.querySelectorAll('[data-step]');
  const update = () => {
    buttons.forEach(button => { button.disabled = input.disabled || (Number(button.dataset.step) < 0 ? Number(input.value) <= 1 : Number(input.value) >= Number(input.max)); });
  };
  buttons.forEach(button => { button.onclick = () => {
    input.value = Number(input.value) + Number(button.dataset.step);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }; });
  input.onchange = () => { onChange(input); update(); };
  update();
}
async function productDetail(id, version) {
  const product = await api(`/products/${id}`);
  const shop = await api(`/sellers/${product.seller_id}`);
  if (version !== renderVersion) return;
  rememberShop(shop); productStore = shop.id; updateNavigation();
  const count = () => (carts[shop.id] || []).find(item => item.id === product.id)?.quantity || 0;
  const remaining = Math.max(0, Math.min(99, product.stock) - count());
  setPage(`${breadcrumbs([['All shops', '/'], [shop.business_name, shopPath(shop)], [product.name]])}<div class="detail"><div class="detail-media">${picture(product)}<div class="product-shop-note">${avatar(shop)}<span>From <a href="${shopPath(shop)}" data-link>${escape(shop.business_name)}</a><small>${escape(shop.location || 'Bhutan')}</small></span></div></div><section class="detail-content"><a class="product-shop" href="${shopPath(shop)}" data-link>${escape(shop.business_name)}</a><h1>${escape(product.name)}</h1><p class="detail-price">${money(product.price)}</p><span class="badge ${product.stock ? '' : 'empty'}">${product.stock ? `${product.stock} available` : 'Out of stock'}</span><p class="description">${escape(product.description || 'Contact the shop if you’d like to know more about this product.')}</p><form id="add-form"><div class="detail-quantity"><label for="detail-quantity">Quantity</label>${quantityControl('detail-quantity', product.name, 1, remaining, 'name="quantity" required')}<span class="muted" id="detail-in-cart">${count() ? `${count()} already in your cart` : ''}</span></div><div class="error" role="alert"></div><div class="detail-purchase"><button type="submit" class="button" ${remaining ? '' : 'disabled'}>${icon('bag')}${!product.stock ? 'Out of stock' : !remaining ? 'All available items are in your cart' : 'Add to cart'}</button><a href="${shopPath(shop, 'cart')}" data-link class="button secondary">View cart</a></div></form><div class="purchase-notes"><p>${icon('shop')}<span><strong>Buying directly from ${escape(shop.business_name)}</strong>The shop will confirm your order and arrange delivery with you.</span></p><p>${icon('bag')}<span><strong>No payment taken at checkout</strong>Agree on payment directly with the shop.</span></p></div>${shop.phone ? `<a class="contact-product" href="tel:${escape(shop.phone.replace(/[^+0-9]/g, ''))}">${icon('phone')}Have a question? Contact the shop</a>` : ''}</section></div>`, product.name);
  const quantity = document.querySelector('.quantity-control');
  bindQuantity(quantity, input => { if (!input.checkValidity()) { input.value = '1'; input.reportValidity(); } });
  bindForm(document.querySelector('#add-form'), async data => {
    addToCart(product, Number(data.get('quantity')));
  }, { onSettled() {
    const input = document.querySelector('#detail-quantity');
    const left = Math.max(0, Math.min(99, product.stock) - count());
    input.max = Math.max(1, left); input.value = '1'; input.disabled = !left;
    const button = document.querySelector('#add-form [type="submit"]');
    button.disabled = !left;
    button.innerHTML = `${icon('bag')}${!product.stock ? 'Out of stock' : !left ? 'All available items are in your cart' : 'Add to cart'}`;
    document.querySelector('#detail-in-cart').textContent = `${count()} already in your cart`;
    bindQuantity(quantity, value => { if (!value.checkValidity()) { value.value = '1'; value.reportValidity(); } });
  } });
}

function orderProgress(step) {
  const stages = ['Cart', 'Details', 'Review'];
  const current = step === 'cart' ? 0 : step === 'details' ? 1 : step === 'review' ? 2 : 3;
  return `<ol class="checkout-progress" aria-label="Order progress">${stages.map((label, index) => `<li class="${index < current ? 'is-complete' : index === current ? 'is-current' : ''}" ${index === current ? 'aria-current="step"' : ''}><span>${index < current ? icon('check') : index + 1}</span>${label}</li>`).join('')}</ol>`;
}
function orderSummary(shop, items, checkout) {
  const available = items.filter(item => item.product);
  const total = sum(available.map(item => ({ price: item.product.price, quantity: item.quantity })));
  const valid = items.every(item => item.product && item.quantity <= item.product.stock);
  const count = items.reduce((value, item) => value + item.quantity, 0);
  return `<aside class="panel summary"><div class="summary-heading"><h2>Order summary</h2><a href="${shopPath(shop)}" data-link>${escape(shop.business_name)}</a></div><details class="summary-breakdown" ${matchMedia('(min-width: 761px)').matches ? 'open' : ''}><summary>Items in your order <span>${count}</span></summary><div>${available.map(item => `<div class="summary-line" data-summary-item="${item.id}"><span>${escape(item.product.name)} × ${item.quantity}</span><strong>${money(sum([{ price: item.product.price, quantity: item.quantity }]))}</strong></div>`).join('')}</div></details><div class="summary-line delivery-line"><span>Delivery</span><span>Arranged with the shop</span></div><div class="summary-line total"><span>Product total</span><span data-order-total>${money(total)}</span></div>${checkout ? '' : `<a href="${shopPath(shop, 'checkout')}" data-link class="button full" ${valid ? '' : 'hidden'}>Continue to checkout ${icon('arrow')}</a>`}<p class="summary-note">${icon('shop')}<span>No payment is collected here. The shop will confirm delivery and payment with you.</span></p></aside>`;
}
function checkoutForm(shop, id, total) {
  const draft = checkoutDrafts.get(id) || {};
  return `<form id="checkout-form" class="panel checkout-form"><div class="checkout-fields"><div class="form-heading"><span>${icon('pin')}</span><div><h2>Your contact & delivery details</h2><p>So the shop knows how to reach you.</p></div></div>${field('Full name', 'customer_name', { value: draft.customer_name, max: 100, autocomplete: 'name' })}${field('Phone number', 'customer_phone', { type: 'tel', value: draft.customer_phone, max: 26, autocomplete: 'tel', extra: 'inputmode="tel" minlength="6"', help: 'The seller will contact you using this number.' })}<label class="field">Delivery address<textarea name="customer_address" maxlength="500" autocomplete="street-address" required rows="3" placeholder="House or building, street, town and dzongkhag">${escape(draft.customer_address)}</textarea></label><label class="field">Note for the seller (optional)<textarea name="note" maxlength="1000" rows="2" placeholder="A landmark or anything the shop should know">${escape(draft.note)}</textarea></label></div><div class="checkout-review" hidden><div class="form-heading"><span>${icon('check')}</span><div><h2>Review your order</h2><p>Check the details below before sending it to the shop.</p></div></div><div class="review-section-heading"><h3>Contact & delivery</h3><button type="button" class="text-button" id="edit-checkout-details">Edit details</button></div><dl id="review-details" class="review-details"></dl><div class="order-agreement">${icon('shop')}<div><strong>What happens next?</strong><p>The shop will confirm your order, delivery arrangements and payment. No online payment is collected now.</p></div></div></div><div class="error" role="alert"></div><a class="review-cart" href="${shopPath(shop, 'cart')}" data-link hidden>Review updated prices and availability</a><div class="checkout-actions"><a href="${shopPath(shop, 'cart')}" data-link class="text-button">Back to cart</a><button type="button" class="button" id="review-order">Review order ${icon('arrow')}</button><button type="submit" class="button" hidden>Place order · ${money(total)}</button></div></form>`;
}
function bindCheckoutReview(form, id) {
  const fields = form.querySelector('.checkout-fields');
  const review = form.querySelector('.checkout-review');
  const next = form.querySelector('#review-order');
  const submit = form.querySelector('[type="submit"]');
  const remember = () => { checkoutDrafts.set(id, Object.fromEntries(new FormData(form))); };
  form.addEventListener('input', remember);
  next.onclick = () => {
    if (!validateForm(form)) return;
    remember();
    const data = checkoutDrafts.get(id);
    form.querySelector('#review-details').innerHTML = [['Name', data.customer_name], ['Phone', data.customer_phone], ['Address', data.customer_address], ...(data.note ? [['Note for the shop', data.note]] : [])].map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('');
    fields.hidden = true; review.hidden = false; next.hidden = true; submit.hidden = false;
    document.querySelector('#order-progress').innerHTML = orderProgress('review');
    review.querySelector('h2').setAttribute('tabindex', '-1'); review.querySelector('h2').focus({ preventScroll: true });
    form.scrollIntoView({ block: 'start' });
  };
  form.querySelector('#edit-checkout-details').onclick = () => {
    fields.hidden = false; review.hidden = true; next.hidden = false; submit.hidden = true;
    document.querySelector('#order-progress').innerHTML = orderProgress('details');
    form.elements.customer_name.focus();
  };
  // Enter in a contact field should review, never place an unreviewed order.
  form.addEventListener('submit', event => {
    if (review.hidden) { event.preventDefault(); event.stopImmediatePropagation(); next.click(); }
  });
}

function receiptPage(id) {
  let receipt = receipts.get(id);
  try { receipt ||= JSON.parse(sessionStorage.getItem(`receipt_${id}`)); } catch { /* Storage is optional. */ }
  const valid = receipt && receipt.order?.id === id && /^[1-9]\d{0,18}$/.test(receipt.shop?.id)
    && typeof receipt.shop.business_name === 'string' && typeof receipt.order.total === 'string' && /^\d{1,14}\.\d{2}$/.test(receipt.order.total)
    && Array.isArray(receipt.order.items) && receipt.order.items.length > 0 && receipt.order.items.length <= 50
    && receipt.order.items.every(item => item && typeof item.product_name === 'string' && typeof item.unit_price === 'string' && /^\d{1,10}\.\d{2}$/.test(item.unit_price)
      && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99);
  if (!valid) {
    setPage('<div class="empty-state"><h1>Receipt unavailable</h1><p>Receipts are kept in the browser tab where you placed the order. Your order reference is in this page’s address.</p><a href="/" data-link class="button">Browse shops</a></div>', 'Receipt unavailable');
    return;
  }
  const { order } = receipt;
  const shop = rememberShop(receipt.shop);
  const contact = typeof shop.phone === 'string' ? shop.phone.replace(/[^+0-9]/g, '') : '';
  setPage(`<section class="panel success"><div class="success-mark">${icon('check')}</div><h1>Your order is placed.</h1><p>Your order has been saved for <strong>${escape(shop.business_name)}</strong>. Keep the reference below for your records.</p><div class="reference"><span>Order reference</span><strong>${escape(order.id)}</strong><button class="text-button" id="copy-reference" type="button">Copy reference</button></div><h2 class="receipt-items-heading">Your items</h2>${order.items.map(item => `<div class="summary-line"><span>${escape(item.product_name)} × ${item.quantity}</span><strong>${money(sum([{ price: item.unit_price, quantity: item.quantity }]))}</strong></div>`).join('')}<div class="summary-line total"><span>Product total</span><span>${money(order.total)}</span></div><div class="receipt-next"><h2>What happens next?</h2><p>The shop will contact you to confirm availability, delivery and payment. <strong>No payment has been collected.</strong></p>${contact ? `<a href="tel:${escape(contact)}" class="contact-product">${icon('phone')}Contact ${escape(shop.business_name)}</a>` : ''}</div><div class="actions"><a href="${shopPath(shop)}" data-link class="button">Back to the shop</a><button class="button secondary" id="print-receipt">Print receipt</button></div></section>`, 'Order placed');
  document.querySelector('#print-receipt').onclick = () => window.print();
  document.querySelector('#copy-reference').onclick = async () => {
    try { await navigator.clipboard.writeText(order.id); toast('Order reference copied'); }
    catch { toast('Select and copy the order reference above'); }
  };
}

function checkoutState(id, items) {
  const fingerprint = JSON.stringify({ id, items });
  try {
    const saved = JSON.parse(sessionStorage.getItem(`checkout_${id}`));
    if (saved?.fingerprint === fingerprint && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(saved.key)) {
      return { fingerprint, key: saved.key, submitted: saved.submitted === true };
    }
  } catch { /* A missing or damaged key starts a fresh checkout. */ }
  return { fingerprint, key: crypto.randomUUID(), submitted: false };
}

function persistCheckout(id, state) {
  try { sessionStorage.setItem(`checkout_${id}`, JSON.stringify(state)); } catch { /* In-memory retries still work. */ }
}

async function cartPage(id, checkout, version, knownShop) {
  const [shop, products] = await Promise.all([knownShop || api(`/sellers/${id}`), api(`/products?seller_id=${id}`)]);
  if (version !== renderVersion) return;
  rememberShop(shop);
  updateNavigation();
  const stored = (carts[id] || []).map(item => ({ ...item }));
  const items = stored.map(item => ({ ...item, product: products.find(product => product.id === item.id) }));
  const valid = items.length > 0 && items.every(item => item.product && item.product.stock >= item.quantity);
  const total = sum(items.filter(item => item.product).map(item => ({ price: item.product.price, quantity: item.quantity })));
  const state = checkout ? checkoutState(id, stored) : null;
  const title = checkout ? 'Checkout' : 'Your cart';
  const crumbs = [['All shops', '/'], [shop.business_name, shopPath(shop)]];
  if (checkout) crumbs.push(['Your cart', shopPath(shop, 'cart')]);
  crumbs.push([title]);
  if (!items.length) {
    setPage(`${breadcrumbs(crumbs)}<div class="empty-state"><h1>Your cart is waiting</h1><p>Find something you like at ${escape(shop.business_name)} to get started.</p><a class="button" href="${shopPath(shop)}" data-link>Browse this shop</a></div>`, title);
    return;
  }
  // A previous submission may already have consumed the last stock. Allow an
  // exact retry with its saved key so the server can return the existing order.
  if (checkout && !valid && !state.submitted) {
    setPage(`${breadcrumbs(crumbs)}<div class="empty-state"><h2>Your cart needs a quick update</h2><p>A product was removed or no longer has enough stock. Review your cart before placing the order.</p><a class="button" href="${shopPath(shop, 'cart')}" data-link>Review cart</a></div>`, title);
    return;
  }
  const summary = orderSummary(shop, items, checkout);
  const rows = `<section class="cart-items" aria-label="Cart items"><div class="error cart-warning" role="alert" ${valid ? 'hidden' : ''}>Some items are unavailable or exceed the current stock. Update or remove them to continue.</div><div class="cart-list">${items.map(item => `<article class="cart-row">${item.product ? picture(item.product) : `<div class="product-picture"><span class="product-placeholder">${icon('box')}</span></div>`}<div class="cart-body"><h3>${item.product ? `<a href="/products/${item.id}" data-link>${escape(item.product.name)}</a>` : 'Product no longer available'}</h3><span class="cart-unit-price">${item.product ? `${money(item.product.price)} each` : ''}</span><div class="cart-controls">${item.product ? quantityControl(`cart-quantity-${item.id}`, item.product.name, item.quantity, Math.min(99, item.product.stock), `data-quantity="${item.id}"`) : ''}<button class="text-button danger" data-remove="${item.id}">Remove<span class="sr-only"> ${escape(item.product?.name || 'unavailable product')}</span></button></div>${item.product ? `<small class="availability-note" data-stock-warning="${item.id}" ${item.quantity <= item.product.stock ? 'hidden' : ''}>${item.product.stock} available</small>` : ''}</div><strong class="cart-row-total" data-line-total="${item.id}">${item.product ? money(sum([{ price: item.product.price, quantity: item.quantity }])) : ''}</strong></article>`).join('')}</div><a class="continue-shopping" href="${shopPath(shop)}" data-link>Continue shopping at ${escape(shop.business_name)}</a></section>`;
  setPage(`${breadcrumbs(crumbs)}<div class="checkout-heading"><div><h1>${title}</h1><p class="muted">${checkout ? 'Review the details. Send your order directly to the shop.' : `Your finds from ${escape(shop.business_name)}.`}</p></div><div id="order-progress">${orderProgress(checkout ? 'details' : 'cart')}</div></div><div class="split ${checkout ? 'checkout-split' : ''}">${checkout ? checkoutForm(shop, id, total) : rows}${summary}</div>`, title);
  if (checkout) {
    // Keep this key and exact payload for a network retry; persist only the key,
    // never a customer's personal details, in browser session storage.
    persistCheckout(id, state);
    bindCheckoutReview(document.querySelector('#checkout-form'), id);
    if (state.submitted) {
      const notice = document.createElement('p');
      notice.className = 'notice';
      notice.textContent = 'A previous submission may have gone through. Re-enter the same contact details and note to check it safely.';
      document.querySelector('#checkout-form h2').after(notice);
    }
    let retryPayload;
    bindForm(document.querySelector('#checkout-form'), async data => {
      const form = document.querySelector('#checkout-form');
      const payload = retryPayload || {
        ...Object.fromEntries(data), checkout_key: state.key, expected_total: total,
        items: stored.map(item => ({ product_id: item.id, quantity: item.quantity })),
      };
      let order;
      state.submitted = true;
      persistCheckout(id, state);
      try {
        order = await api(`/stores/${id}/orders`, { method: 'POST', body: payload });
      } catch (error) {
        // A lost response may already have committed. Retry the identical payload.
        if (!error.status || error.status >= 500) {
          retryPayload = payload;
          form.querySelectorAll('input, textarea').forEach(input => { input.readOnly = true; });
          error.message = 'We could not confirm the order. Your details are kept here; try again to safely check the same submission';
        } else {
          state.submitted = false;
          persistCheckout(id, state);
          if (error.status === 409) form.querySelector('.review-cart').hidden = false;
        }
        throw error;
      }
      carts[id] = (carts[id] || []).flatMap(item => {
        const purchased = payload.items.find(entry => entry.product_id === item.id)?.quantity || 0;
        return item.quantity > purchased ? [{ ...item, quantity: item.quantity - purchased }] : [];
      });
      saveCart(id);
      checkoutDrafts.delete(id);
      try { sessionStorage.removeItem(`checkout_${id}`); } catch { /* Optional browser storage. */ }
      const receipt = { order, shop: { id: shop.id, slug: shop.slug, business_name: shop.business_name, phone: shop.phone } };
      receipts.set(order.id, receipt);
      try { sessionStorage.setItem(`receipt_${order.id}`, JSON.stringify(receipt)); } catch { /* Memory works for this tab. */ }
      if (version === renderVersion) {
        history.replaceState({}, '', `/receipt/${order.id}`);
        await render();
        toast('Your order has been saved');
      } else toast('Your order has been saved.', { href: `/receipt/${order.id}`, label: 'View receipt' });
    });
  } else {
    document.querySelectorAll('[data-remove]').forEach(button => { button.onclick = () => {
      carts[id] = stored.filter(item => item.id !== button.dataset.remove); saveCart(id); render(); toast('Product removed from cart');
    }; });
    document.querySelectorAll('.quantity-control').forEach(control => {
      bindQuantity(control, input => {
        const item = stored.find(item => item.id === input.dataset.quantity);
        if (!input.checkValidity() || !Number.isInteger(Number(input.value)) || Number(input.value) < 1) { input.reportValidity(); input.value = item.quantity; return; }
        item.quantity = Number(input.value); carts[id] = stored; saveCart(id);
        const updated = stored.map(entry => ({ ...entry, product: products.find(product => product.id === entry.id) }));
        const ready = updated.every(entry => entry.product && entry.quantity <= entry.product.stock);
        const product = products.find(product => product.id === item.id);
        const amount = money(sum([{ price: product.price, quantity: item.quantity }]));
        const line = document.querySelector(`[data-summary-item="${item.id}"]`);
        line.querySelector('span').textContent = `${product.name} × ${item.quantity}`;
        line.querySelector('strong').textContent = amount;
        document.querySelector(`[data-line-total="${item.id}"]`).textContent = amount;
        document.querySelector('[data-order-total]').textContent = money(sum(updated.filter(entry => entry.product).map(entry => ({ price: entry.product.price, quantity: entry.quantity }))));
        document.querySelector('.summary a.button').hidden = !ready;
        document.querySelector('.cart-warning').hidden = ready;
        document.querySelector(`[data-stock-warning="${item.id}"]`).hidden = item.quantity <= product.stock;
        document.querySelector('.summary-breakdown summary span').textContent = updated.reduce((value, entry) => value + entry.quantity, 0);
      });
    });
  }
}

async function render() {
  const version = ++renderVersion;
  if (dialog.open) dialog.close();
  updateNavigation();
  main.innerHTML = '<div class="page-skeleton" aria-busy="true" role="status"><span class="sr-only">Loading…</span><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div><div class="skeleton-grid"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div></div></div>';
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const match = path.match(/^\/(stores|store|products|cart|checkout)\/([1-9]\d{0,18})$/);
  const namedShop = path.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(cart|checkout))?$/);
  try {
    if (path === '/') await home(version);
    else if (path === '/login' || path === '/register') await authPage(path.slice(1));
    else if (path === '/seller' || path === '/seller/shop') await dashboard(version, path === '/seller/shop' ? 'shop' : 'products');
    else if (/^\/receipt\/[a-f0-9-]{36}$/i.test(path)) receiptPage(path.split('/')[2]);
    else if (match) {
      const [, page, id] = match;
      if (page === 'products') await productDetail(id, version);
      else {
        const shop = await api(`/sellers/${id}`);
        if (version !== renderVersion) return;
        rememberShop(shop);
        history.replaceState({}, '', shopPath(shop, page === 'cart' || page === 'checkout' ? page : ''));
        await render();
      }
    } else if (namedShop) {
      const [, slug, section] = namedShop;
      const shop = await api(`/shops/${slug}`);
      if (version !== renderVersion) return;
      if (section) await cartPage(shop.id, section === 'checkout', version, shop);
      else await storefront(shop.id, version, shop);
    } else setPage('<div class="empty-state"><h1>Page not found</h1><p>Find your way back to the local shops.</p><a href="/" class="button" data-link>Browse shops</a></div>', 'Page not found');
  } catch (error) {
    if (version !== renderVersion) return;
    if (error.status === 401 && path.startsWith('/seller')) { navigate('/login'); return; }
    setPage(`<div class="empty-state"><h1>${error.status === 404 ? 'We couldn’t find that' : 'Couldn’t open this page'}</h1><p>${escape(error.message === 'Failed to fetch' ? 'Check your connection and try again.' : error.message)}</p><div class="actions"><button class="button" id="retry">Try again</button><a href="/" class="button secondary" data-link>Browse shops</a></div></div>`, 'Something went wrong');
    document.querySelector('#retry').onclick = render;
  }
}

try { seller = rememberShop(await api('/auth/me')); } catch { /* Browsing does not require an account. */ }
await render();
