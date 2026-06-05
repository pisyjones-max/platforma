/* ═══════════════════════════════════════════════════════════════════════════
   PLATFORMA — script.js  v2.1 (fixed)
═══════════════════════════════════════════════════════════════════════════ */

// ══ STATE ══════════════════════════════════════════════════════════════════
let catalog = null, activeCat = null, srchQ = '', calcOpen = false;
let filterOpen = false;
let filters = { minPrice: 0, maxPrice: 999999, color: '', brand: '', sort: 'default' };
let cart = JSON.parse(localStorage.getItem('platforma_cart') || '[]');
let modalProd = null, modalVar = 0, modalImg = 0, modalQty = 1;
let subMethod = 'telegram';
let deliveryMethod = 'pvz'; // 'pvz' | 'courier'
let selectedPVZ = null;     // { id, address }
let loyaltyCard = JSON.parse(localStorage.getItem('platforma_loyalty') || 'null');
let currentView = 'groups'; // 'groups', 'categories', 'products'
let activeGroup = null;

const DISCOUNT_RATE = 0.93;
const CASHBACK_RATE = 0.005;

// ══ TOAST ══════════════════════════════════════════════════════════════════
function toast(msg, type = 'default', duration = 2600) {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ══ LOAD ════════════════════════════════════════════════════════════════════
async function loadCatalog() {
  showSkeleton();
  try {
    const r = await fetch('catalog.json');
    if (!r.ok) throw new Error();
    catalog = await r.json();
  } catch (e) {
    catalog = getDemoCatalog();
  }
  buildSidebar();
  const params = new URLSearchParams(location.search);
  const pId = params.get('product');
  const catSlug = params.get('cat');
  const groupSlug = params.get('group');
  
  if (groupSlug) {
    activeGroup = catalog.groups[groupSlug];
    if (activeGroup) {
      currentView = 'categories';
      renderCategories();
    }
  } else if (catSlug) {
    const c = catalog.categories.find(x => x.slug === catSlug);
    if (c) {
      activeCat = c;
      currentView = 'products';
    }
  }
  
  if (currentView === 'groups') {
    renderGroups();
  } else if (currentView === 'categories') {
    renderCategories();
  } else {
    renderProducts();
  }
  
  if (pId) { const p = findProd(pId); if (p) openProd(pId); }
  updateBadge();
}

function showSkeleton() {
  const cards = Array.from({ length: 8 }, () =>
    '<div class="skel-card">' +
    '<div class="skel skel-thumb"></div>' +
    '<div class="skel skel-line"></div>' +
    '<div class="skel skel-line short"></div>' +
    '<div class="skel skel-line price"></div>' +
    '<div class="skel skel-btn"></div>' +
    '</div>'
  ).join('');
  document.getElementById('content').innerHTML = '<div class="pgrid">' + cards + '</div>';
}

// ══ RENDER GROUPS ═══════════════════════════════════════════════════════
function renderGroups() {
  const content = document.getElementById('content');
  if (!catalog || !catalog.groups) {
    content.innerHTML = '<div class="loading">Загрузка каталога...</div>';
    return;
  }

  const totalCats = Object.keys(catalog.groups).length +
    catalog.categories.filter(cat =>
      !Object.values(catalog.groups).some(g => g.categories.includes(cat.slug))
    ).length;

  const heroHtml =
    '<div class="hero">' +
      '<div>' +
        '<h1>Каталог кровельных материалов</h1>' +
        '<p>Выберите категорию для просмотра товаров</p>' +
      '</div>' +
      '<div class="hero-right">' +
        '<div class="hero-stat"><span>' + catalog.meta.total_products + '</span><small>товаров</small></div>' +
        '<div class="hero-badge"><div class="hero-badge-val">−7%</div><div class="hero-badge-lbl">скидка</div></div>' +
      '</div>' +
    '</div>';

  const GROUP_ICONS = {
    izolyatsiya: '🧱', 'fasadnye-materialy': '🏠', vodostoki: '🌧️',
    krovelnyye: '🏗️', cherepitsa: '🔶', metallocherepitsa: '🔩',
    bitumnaya: '⬛', gibkaya: '🔷', profnastil: '📐', default: '📦'
  };

  const groupCards = Object.entries(catalog.groups).map(([slug, group]) => {
    const totalProducts = group.categories.reduce((sum, catSlug) => {
      const cat = catalog.categories.find(c => c.slug === catSlug);
      return sum + (cat ? cat.products.length : 0);
    }, 0);

    const previewImgs = [];
    for (const catSlug of group.categories) {
      const cat = catalog.categories.find(c => c.slug === catSlug);
      if (!cat) continue;
      for (const p of cat.products) {
        const img = p.variants?.[0]?.images?.[0];
        if (img && !previewImgs.includes(img)) { previewImgs.push(img); break; }
      }
      if (previewImgs.length >= 4) break;
    }

    const thumbHtml = previewImgs.length >= 2
      ? '<div class="gcard-thumbs gcard-thumbs-grid">' +
          previewImgs.slice(0, 4).map(src =>
            '<img src="' + src + '" loading="lazy">'
          ).join('') +
        '</div>'
      : previewImgs.length === 1
        ? '<div class="gcard-thumb"><img src="' + previewImgs[0] + '" loading="lazy"></div>'
        : '<div class="gcard-icon">' + (GROUP_ICONS[slug] || GROUP_ICONS.default) + '</div>';

    return (
      '<div class="gcard gcard-group" onclick="openGroup(\'' + slug + '\')">' +
        thumbHtml +
        '<div class="gcard-info">' +
          '<div class="gcard-title">' + group.name + '</div>' +
          '<div class="gcard-sub">' + group.categories.length + ' подкатегорий</div>' +
        '</div>' +
        '<div class="gcard-arrow">›</div>' +
      '</div>'
    );
  });

  const standaloneCategories = catalog.categories.filter(cat =>
    !Object.values(catalog.groups).some(g => g.categories.includes(cat.slug))
  );

  const standaloneCards = standaloneCategories.map(cat => {
    const previewImgs = [];
    for (const p of cat.products) {
      const img = p.variants?.[0]?.images?.[0];
      if (img && !previewImgs.includes(img)) previewImgs.push(img);
      if (previewImgs.length >= 3) break;
    }

    const thumbHtml = previewImgs.length > 1
      ? '<div class="gcard-thumbs">' +
          previewImgs.map(src =>
            '<img src="' + src + '" loading="lazy">'
          ).join('') +
        '</div>'
      : previewImgs.length === 1
        ? '<div class="gcard-thumb"><img src="' + previewImgs[0] + '" loading="lazy"></div>'
        : '<div class="gcard-icon">📦</div>';

    const prices = cat.products.flatMap(p => p.variants.map(v => v.price)).filter(x => x > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const priceHint = minPrice > 0 ? ' · <span class="gcard-price">от ' + fmt(Math.round(minPrice * 0.93)) + ' ₽</span>' : '';

    return (
      '<div class="gcard" onclick="openCategory(\'' + cat.slug + '\')">' +
        thumbHtml +
        '<div class="gcard-info">' +
          '<div class="gcard-title">' + cat.name + '</div>' +
          '<div class="gcard-sub">' + (priceHint ? priceHint.replace(" · ","") : '&nbsp;') + '</div>' +
        '</div>' +
        '<div class="gcard-arrow">›</div>' +
      '</div>'
    );
  });

  content.innerHTML = heroHtml + '<div class="ggrid">' + [...groupCards, ...standaloneCards].join('') + '</div>';
}

function openGroup(slug) {
  activeGroup = catalog.groups[slug];
  if (!activeGroup) return;
  
  currentView = 'categories';
  setURLParam('group', slug);
  removeURLParam('cat');
  renderCategories();
}

function openCategory(slug) {
  const cat = catalog.categories.find(c => c.slug === slug);
  if (!cat) return;

  const parentGroupEntry = Object.entries(catalog.groups || {}).find(([, g]) => g.categories.includes(slug));
  if (parentGroupEntry) {
    activeGroup = catalog.groups[parentGroupEntry[0]];
    setURLParam("group", parentGroupEntry[0]);
    expandSidebarGroup(parentGroupEntry[0]);
  }

  activeCat = cat;
  currentView = "products";
  setURLParam("cat", slug);
  highlightCat();
  renderProducts();
}

function goHome() {
  activeCat = null;
  activeGroup = null;
  currentView = 'groups';
  srchQ = '';
  filters = { minPrice: 0, maxPrice: 999999, color: '', sort: 'default' };
  const u = new URL(location);
  u.searchParams.delete('cat');
  u.searchParams.delete('group');
  u.searchParams.delete('product');
  history.replaceState({}, '', u);
  highlightCat();
  renderGroups();
}

function goToGroup(slug) {
  activeGroup = catalog.groups[slug];
  activeCat = null;
  currentView = 'categories';
  setURLParam('group', slug);
  removeURLParam('cat');
  removeURLParam('product');
  highlightCat();
  renderCategories();
}

// ══ RENDER CATEGORIES ══════════════════════════════════════════════════════
function renderCategories() {
  const content = document.getElementById('content');
  if (!activeGroup) {
    content.innerHTML = '<div class="loading">Категория не найдена</div>';
    return;
  }

  const breadcrumb =
    '<div class="breadcrumb">' +
      '<span class="bc-item bc-link" onclick="goHome()">Каталог</span>' +
      '<span class="bc-sep">›</span>' +
      '<span class="bc-item bc-cur">' + activeGroup.name + '</span>' +
    '</div>';

  const heroHtml =
    '<div class="hero">' +
      '<div>' +
        '<h1>' + activeGroup.name + '</h1>' +
        '<p>Выберите подкатегорию для просмотра товаров</p>' +
      '</div>' +
      '<div class="hero-right">' +
        '<div class="hero-stat"><span>' + activeGroup.categories.length + '</span><small>подкатегорий</small></div>' +
        '<div class="hero-badge"><div class="hero-badge-val">−7%</div><div class="hero-badge-lbl">скидка</div></div>' +
      '</div>' +
    '</div>';

  const categoryCards = activeGroup.categories.map(catSlug => {
    const cat = catalog.categories.find(c => c.slug === catSlug);
    if (!cat) return '';

    const previewImgs = [];
    for (const p of cat.products) {
      const img = p.variants?.[0]?.images?.[0];
      if (img && !previewImgs.includes(img)) previewImgs.push(img);
      if (previewImgs.length >= 3) break;
    }

    const thumbHtml = previewImgs.length > 1
      ? '<div class="gcard-thumbs">' +
          previewImgs.map(src =>
            '<img src="' + src + '" loading="lazy">'
          ).join('') +
        '</div>'
      : previewImgs.length === 1
        ? '<div class="gcard-thumb"><img src="' + previewImgs[0] + '" loading="lazy"></div>'
        : '<div class="gcard-icon">📦</div>';

    const prices = cat.products.flatMap(p => p.variants.map(v => v.price)).filter(x => x > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const priceHint = minPrice > 0 ? ' · <span class="gcard-price">от ' + fmt(Math.round(minPrice * 0.93)) + ' ₽</span>' : '';

    return (
      '<div class="gcard" onclick="openCategory(\'' + cat.slug + '\')">' +
        thumbHtml +
        '<div class="gcard-info">' +
          '<div class="gcard-title">' + cat.name + '</div>' +
          '<div class="gcard-sub">' + (priceHint ? priceHint.replace(" · ","") : '&nbsp;') + '</div>' +
        '</div>' +
        '<div class="gcard-arrow">›</div>' +
      '</div>'
    );
  }).filter(Boolean);

  content.innerHTML = breadcrumb + heroHtml + '<div class="ggrid">' + categoryCards.join('') + '</div>';
}

function buildSidebar() {
  ['catlist', 'mob-catlist'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';

    // Render groups first
    if (catalog.groups && Object.keys(catalog.groups).length > 0) {
      Object.entries(catalog.groups).forEach(([slug, group]) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'cgroup';
        groupEl.dataset.groupSlug = slug;

        const totalProducts = group.categories.reduce((sum, catSlug) => {
          const cat = catalog.categories.find(c => c.slug === catSlug);
          return sum + (cat ? cat.products.length : 0);
        }, 0);

        groupEl.innerHTML =
          '<div class="cgroup-hdr" onclick="toggleSidebarGroup(\'' + slug + '\')">' +
            '<span class="cgroup-name">' + group.name + '</span>' +
            '<span class="cgroup-meta">' + group.categories.length + ' подкатегорий</span>' +
            '<span class="cgroup-arrow" id="cga-' + id + '-' + slug + '">›</span>' +
          '</div>' +
          '<div class="cgroup-items" id="cgi-' + id + '-' + slug + '" style="display:none">' +
            group.categories.map(catSlug => {
              const cat = catalog.categories.find(c => c.slug === catSlug);
              if (!cat) return '';
              return '<div class="citem citem-sub" data-slug="' + cat.slug + '">' +
                '<span>' + cat.name + '</span>' +
                '<span class="ccnt">' + cat.products.length + '</span>' +
              '</div>';
            }).filter(Boolean).join('') +
          '</div>';

        // Add click handlers for sub-items
        el.appendChild(groupEl);
        groupEl.querySelectorAll('.citem-sub').forEach(item => {
          item.onclick = () => {
            const cat = catalog.categories.find(c => c.slug === item.dataset.slug);
            if (cat) { selectCat(cat); if (id === 'mob-catlist') closeMobDrawer(); }
          };
        });

        // Auto-expand active group
        if (activeGroup && Object.keys(catalog.groups).find(k => catalog.groups[k] === activeGroup) === slug) {
          expandSidebarGroup(slug);
        }
      });
    }

    // Standalone categories (not in any group)
    const standalones = catalog.categories.filter(cat =>
      !Object.values(catalog.groups || {}).some(g => g.categories.includes(cat.slug))
    );
    standalones.forEach(cat => {
      const d = document.createElement('div');
      d.className = 'citem';
      d.dataset.slug = cat.slug;
      d.innerHTML = '<span>' + cat.name + '</span><span class="ccnt">' + cat.products.length + '</span>';
      d.onclick = () => { selectCat(cat); if (id === 'mob-catlist') closeMobDrawer(); };
      el.appendChild(d);
    });
  });
  highlightCat();
}

function toggleSidebarGroup(slug) {
  ['catlist', 'mob-catlist'].forEach(id => {
    const items = document.getElementById('cgi-' + id + '-' + slug);
    const arrow = document.getElementById('cga-' + id + '-' + slug);
    if (!items) return;
    const isOpen = items.style.display !== 'none';
    items.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  });
}

function expandSidebarGroup(slug) {
  ['catlist', 'mob-catlist'].forEach(id => {
    const items = document.getElementById('cgi-' + id + '-' + slug);
    const arrow = document.getElementById('cga-' + id + '-' + slug);
    if (!items) return;
    items.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(90deg)';
  });
}

function highlightCat() {
  document.querySelectorAll('.citem').forEach(e =>
    e.classList.toggle('active', activeCat && e.dataset.slug === activeCat.slug));
}

function selectCat(cat) {
  activeCat = cat; srchQ = '';
  filters = { minPrice: 0, maxPrice: 999999, color: '', sort: 'default' };
  document.getElementById('srch').value = '';
  filterOpen = false;
  // Find + expand parent group
  const parentEntry = Object.entries(catalog.groups || {}).find(([, g]) => g.categories.includes(cat.slug));
  if (parentEntry) {
    activeGroup = catalog.groups[parentEntry[0]];
    setURLParam('group', parentEntry[0]);
    expandSidebarGroup(parentEntry[0]);
  }
  highlightCat();
  setURLParam('cat', cat.slug);
  removeURLParam('product');
  renderProducts();
}

// ══ URL ════════════════════════════════════════════════════════════════════
function setURLParam(k, v) { const u = new URL(location); u.searchParams.set(k, v); history.replaceState({}, '', u); }
function removeURLParam(k) { const u = new URL(location); u.searchParams.delete(k); history.replaceState({}, '', u); }

// ══ FILTER / SORT ══════════════════════════════════════════════════════════
function getFilteredProducts() {
  if (!activeCat) return [];
  let prods = [...(activeCat.products || [])];
  if (srchQ) {
    const q = srchQ.toLowerCase();
    prods = prods.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      JSON.stringify(p.features || {}).toLowerCase().includes(q));
  }
  prods = prods.filter(p => {
    const fp = Math.round(p.variants[0].price * DISCOUNT_RATE);
    return fp >= filters.minPrice && (filters.maxPrice >= 99999 || fp <= filters.maxPrice);
  });
  if (filters.color) {
    const q = filters.color.toLowerCase();
    prods = prods.filter(p => p.variants.some(v => (v.color || v.sku_name || '').toLowerCase().includes(q)));
  }
  if (filters.brand) {
    const q = filters.brand.toLowerCase();
    prods = prods.filter(p => {
      const featBrand = (p.features?.['Производитель'] || '').toLowerCase();
      const titleBrand = p.title.toLowerCase();
      return featBrand.includes(q) || titleBrand.includes(q);
    });
  }
  if (filters.sort === 'price_asc') prods.sort((a, b) => a.variants[0].price - b.variants[0].price);
  if (filters.sort === 'price_desc') prods.sort((a, b) => b.variants[0].price - a.variants[0].price);
  if (filters.sort === 'name') prods.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  return prods;
}

function toggleFilter() { filterOpen = !filterOpen; renderProducts(); }
function closeFilter() { filterOpen = false; renderProducts(); }
function applySort(v) { filters.sort = v; renderProducts(); }
function applyColor(v) { filters.color = v; renderProducts(); }
function clearColor() { filters.color = ''; renderProducts(); }
function applyBrand(v) { filters.brand = v; renderProducts(); }
function clearBrand() { filters.brand = ''; renderProducts(); }
function updatePriceFilter(v, max) {
  filters.maxPrice = parseInt(v);
  const el = document.getElementById('price-range-val');
  if (el) el.textContent = parseInt(v) >= max ? 'Любая' : fmt(v) + ' ₽';
}
function resetFilters() { filters = { minPrice: 0, maxPrice: 999999, color: '', brand: '', sort: 'default' }; filterOpen = false; renderProducts(); }

// ══ RENDER PRODUCTS ════════════════════════════════════════════════════════
function renderProducts() {
  const content = document.getElementById('content');
  if (!activeCat) { content.innerHTML = '<div class="loading">Выберите категорию</div>'; return; }
  const prods = getFilteredProducts();
  const total = activeCat.products.length;
  const maxP = Math.max(...(activeCat.products || []).map(p => Math.round(p.variants[0].price * DISCOUNT_RATE) || 0), 0);
  const allColors = [...new Set((activeCat.products || []).flatMap(p => p.variants.map(v => v.color || v.sku_name || '')).filter(Boolean))];

  // Собираем бренды из features['Производитель'] и из названий товаров
  const KNOWN_BRANDS = ['Технониколь', 'Docke', 'Ranilla', 'Rockwool', 'ISOVER', 'Grand Line', 'Металл Профиль', 'Изоспан', 'Ондулин'];
  const allBrands = [...new Set(
    (activeCat.products || []).map(p => {
      if (p.features?.['Производитель']) return p.features['Производитель'];
      const found = KNOWN_BRANDS.find(b => p.title.toLowerCase().includes(b.toLowerCase()));
      return found || null;
    }).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  // Build breadcrumb
  const groupEntry = Object.entries(catalog.groups || {}).find(([, g]) => g.categories.includes(activeCat.slug));
  let breadcrumb = '<div class="breadcrumb"><span class="bc-item bc-link" onclick="goHome()">Каталог</span>';
  if (groupEntry) {
    breadcrumb += '<span class="bc-sep">›</span><span class="bc-item bc-link" onclick="goToGroup(\'' + groupEntry[0] + '\')">' + groupEntry[1].name + '</span>';
  }
  breadcrumb += '<span class="bc-sep">›</span><span class="bc-item bc-cur">' + activeCat.name + '</span></div>';

  const heroHtml =
    '<div class="hero">' +
      '<div>' +
        '<h1>' + activeCat.name + '</h1>' +
        '<p>Высококачественные кровельные материалы · Доставка по России</p>' +
      '</div>' +
      '<div class="hero-right">' +
        '<div class="hero-stat"><span>' + total + '</span><small>товаров</small></div>' +
        '<div class="hero-badge"><div class="hero-badge-val">−7%</div><div class="hero-badge-lbl">скидка</div></div>' +
      '</div>' +
    '</div>';

  const calcHtml = calcOpen ? renderCalcPanel() : '';

  const sortOpts = [
    ['default', 'По умолчанию'],
    ['price_asc', 'Цена ↑'],
    ['price_desc', 'Цена ↓'],
    ['name', 'По названию']
  ].map(([v, l]) => '<option value="' + v + '"' + (filters.sort === v ? ' selected' : '') + '>' + l + '</option>').join('');

  const colorOpts = allColors.map(c =>
    '<option value="' + c + '"' + (filters.color === c ? ' selected' : '') + '>' + c + '</option>'
  ).join('');

  const priceVal = filters.maxPrice >= 99999 ? 'Любая' : fmt(filters.maxPrice) + ' ₽';
  const rangeMax = maxP || 10000;
  const rangeVal = Math.min(filters.maxPrice, rangeMax);

  // Чипы активных брендов в fbar
  const fbarHtml =
    '<div class="fbar">' +
      '<button class="fchip ' + (filterOpen ? 'active' : '') + '" onclick="toggleFilter()">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>Фильтры' +
      '</button>' +
      '<select class="sort-sel" onchange="applySort(this.value)">' + sortOpts + '</select>' +
      (filters.color ? '<button class="fchip active" onclick="clearColor()">Цвет: ' + filters.color + ' ✕</button>' : '') +
      (filters.brand ? '<button class="fchip active" onclick="applyBrand(\'\')">🏷 ' + filters.brand + ' ✕</button>' : '') +
      '<span class="rcnt">Найдено: ' + prods.length + '</span>' +
    '</div>' +
    '<div class="fpanel ' + (filterOpen ? 'open' : '') + '">' +
      '<div class="fpanel-grid">' +
        '<div><label>Цена, ₽</label>' +
          '<input type="range" min="0" max="' + rangeMax + '" step="100" value="' + rangeVal + '" oninput="updatePriceFilter(this.value,' + rangeMax + ')"/>' +
          '<div class="range-vals"><span>0 ₽</span><span id="price-range-val">' + priceVal + '</span></div>' +
        '</div>' +
        '<div><label>Цвет / вариант</label>' +
          '<select onchange="applyColor(this.value)"><option value="">Любой</option>' + colorOpts + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="fpanel-actions">' +
        '<button class="btn-sm" onclick="resetFilters()">Сбросить</button>' +
        '<button class="btn-sm primary" onclick="closeFilter()">Применить</button>' +
      '</div>' +
    '</div>';

  // Бренд-бар — горизонтальный ряд кнопок над карточками
  const brandBarHtml = allBrands.length
    ? '<div class="brand-bar">' +
        '<button class="brand-btn' + (!filters.brand ? ' active' : '') + '" onclick="applyBrand(\'\')">Все</button>' +
        allBrands.map(b => {
          const cnt = (activeCat.products || []).filter(p => {
            const fb = (p.features?.['Производитель'] || '').toLowerCase();
            const tb = p.title.toLowerCase();
            return fb.includes(b.toLowerCase()) || tb.includes(b.toLowerCase());
          }).length;
          return '<button class="brand-btn' + (filters.brand === b ? ' active' : '') + '" onclick="applyBrand(\'' + b + '\')">' +
            b + ' <span class="brand-count">' + cnt + '</span>' +
          '</button>';
        }).join('') +
      '</div>'
    : '';


  if (!prods.length) {
    content.innerHTML = breadcrumb + heroHtml + calcHtml + fbarHtml + brandBarHtml + '<div class="loading">Ничего не найдено</div>';
    return;
  }

  const loyaltyBanner =
    '<div class="banner-loyalty" onclick="openLoyaltyModal()">' +
      '<div class="bl-left">' +
        '<div class="bl-icon">💳</div>' +
        '<div class="bl-title">Карта PLATFORMA — ваш персональный баланс</div>' +
        '<div class="bl-sub">Реальные деньги на карте, которые можно тратить при каждой покупке. Кэшбэк 0.5% с каждого заказа автоматически.</div>' +
        '<div class="bl-chips">' +
          '<span class="bl-chip">Кэшбэк 0.5%</span>' +
          '<span class="bl-chip">Живой баланс</span>' +
          '<span class="bl-chip">Личный номер карты</span>' +
          '<span class="bl-chip">Не сгорает</span>' +
          '<span class="bl-chip">5 000 ₽ в подарок</span>' +
        '</div>' +
        '<button class="bl-btn">Оформить карту →</button>' +
      '</div>' +
      '<div class="bl-card">' +
        '<div class="bl-card-num">PLTF ···· 0000</div>' +
        '<div class="bl-card-bal">5 000 ₽</div>' +
        '<div class="bl-card-lbl">бонус при открытии</div>' +
      '</div>' +
    '</div>';

  const tgBanner =
    '<div class="banner-tg" onclick="window.open(\'https://t.me/platforma_channel\',\'_blank\')">' +
      '<div class="bt-icon">✈️</div>' +
      '<div class="bt-text">' +
        '<div class="bt-title">Telegram-канал PLATFORMA</div>' +
        '<div class="bt-sub">Эксклюзивные скидки, обзоры материалов и советы мастеров</div>' +
      '</div>' +
      '<button class="bt-btn">Подписаться</button>' +
    '</div>';

  const cardElements = prods.map(p => {
    const v = p.variants[0];
    const img = (v.images && v.images[0])
      ? '<img src="' + v.images[0] + '" alt="' + p.title + '" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=ph>📦</div>\'">'
      : '<div class="ph">📦</div>';
    const fp = Math.round(v.price * DISCOUNT_RATE);
    const pr = v.price > 0
      ? '<span class="pp">' + fmt(fp) + ' ₽</span><span class="pop">' + fmt(v.price) + ' ₽</span>'
      : '<span class="pp" style="font-size:12px;color:var(--muted)">По запросу</span>';
    const vl = p.variants.length > 1
      ? '<div class="pvars"><div class="pvars-dot"></div>' + p.variants.length + ' вариантов</div>' : '';

    // Бренд под названием
    const prodBrand = p.features?.['Производитель']
      || KNOWN_BRANDS.find(b => p.title.toLowerCase().includes(b.toLowerCase()))
      || null;
    const brandTag = prodBrand
      ? '<div class="pcard-brand" onclick="event.stopPropagation();applyBrand(\'' + prodBrand + '\')" title="Фильтровать по бренду">' + prodBrand + '</div>'
      : '';

    return (
      '<div class="pcard" onclick="openProd(\'' + p.id + '\')">' +
        (v.price > 0 ? '<div class="pcard-discount-tag">−7%</div>' : '') +
        '<div class="pthumb">' + img + '</div>' +
        '<div class="pinfo">' +
          '<div class="ptitle">' + p.title + '</div>' +
          brandTag +
          '<div class="psku">Арт. ' + p.sku_base + '</div>' +
          vl +
          '<div class="pprow">' + pr + '</div>' +
        '</div>' +
        '<button class="addbtn" id="ab-' + p.id + '" onclick="event.stopPropagation();quickAdd(\'' + p.id + '\')">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          'В корзину' +
        '</button>' +
      '</div>'
    );
  });

  if (cardElements.length > 4) cardElements.splice(4, 0, loyaltyBanner);
  if (cardElements.length > 10) cardElements.splice(10, 0, tgBanner);

  content.innerHTML = breadcrumb + heroHtml + calcHtml + fbarHtml + brandBarHtml + '<div class="pgrid">' + cardElements.join('') + '</div>';
}

// ══ CALCULATOR ══════════════════════════════════════════════════════════════
function toggleCalc() {
  calcOpen = !calcOpen;
  renderProducts();
  if (calcOpen) document.querySelector('.calc-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderCalcPanel() {
  return (
    '<div class="calc-panel">' +
      '<h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/></svg>Калькулятор кровли</h3>' +
      '<div class="calc-grid">' +
        '<div class="calc-inp-wrap"><label>Длина ската, м</label><input class="calc-inp" type="number" id="c-len" value="10" min="1" step="0.1" oninput="calcUpdate()"/></div>' +
        '<div class="calc-inp-wrap"><label>Ширина ската, м</label><input class="calc-inp" type="number" id="c-wid" value="6" min="1" step="0.1" oninput="calcUpdate()"/></div>' +
        '<div class="calc-inp-wrap"><label>Скатов (шт)</label><input class="calc-inp" type="number" id="c-slopes" value="2" min="1" max="8" oninput="calcUpdate()"/></div>' +
        '<div class="calc-inp-wrap"><label>Запас (%)</label><input class="calc-inp" type="number" id="c-margin" value="10" min="0" max="30" oninput="calcUpdate()"/></div>' +
      '</div>' +
      '<div class="calc-result">' +
        '<div class="cres-text">Площадь: <strong id="c-area">—</strong> · Листов: <strong id="c-sheets">—</strong></div>' +
        '<button class="calc-addbtn" onclick="calcAddToCart()">+ Добавить в корзину</button>' +
      '</div>' +
    '</div>'
  );
}

function calcUpdate() {
  const len = parseFloat(document.getElementById('c-len')?.value) || 10;
  const wid = parseFloat(document.getElementById('c-wid')?.value) || 6;
  const slopes = parseInt(document.getElementById('c-slopes')?.value) || 2;
  const margin = parseFloat(document.getElementById('c-margin')?.value) || 10;
  const areaM = len * wid * slopes * (1 + margin / 100);
  const sheets = Math.ceil(areaM / 0.9);
  const aEl = document.getElementById('c-area');
  const sEl = document.getElementById('c-sheets');
  if (aEl) aEl.textContent = areaM.toFixed(1) + ' м²';
  if (sEl) sEl.textContent = sheets + ' шт.';
  window._calcSheets = sheets;
  window._calcArea = areaM;
}

function calcAddToCart() {
  calcUpdate();
  const p = activeCat?.products[0];
  if (!p) { toast('Выберите категорию товаров для расчёта', 'error'); return; }
  const v = p.variants[0];
  const fp = Math.round(v.price * DISCOUNT_RATE);
  addToCart({ sku: v.sku, title: p.title + ' × ' + (window._calcSheets || 1) + ' шт. (расчёт)', price: fp, img: (v.images || [])[0] || '', qty: window._calcSheets || 1 });
  const b = document.querySelector('.calc-addbtn');
  if (b) {
    b.textContent = '✓ Добавлено!';
    b.style.background = 'var(--success)';
    setTimeout(() => { b.textContent = '+ Добавить в корзину'; b.style.background = ''; }, 1800);
  }
}
setTimeout(calcUpdate, 600);

// ══ PRODUCT MODAL ══════════════════════════════════════════════════════════
function findProd(id) {
  // Ищем точное совпадение по id (полный slug)
  for (const cat of catalog.categories) {
    const p = cat.products.find(x => x.id === id);
    if (p) return p;
  }
  // Fallback: ищем по последнему сегменту слага (для коротких URL из браузера)
  for (const cat of catalog.categories) {
    const p = cat.products.find(x => x.id && x.id.endsWith('--' + id) || x.id === id);
    if (p) return p;
  }
}



// ══ PRODUCT SCHEMA SEO ═════════════════════════════════════════════════════
function injectProductSchema(prod, variant) {

  const old = document.getElementById('product-schema');
  if (old) old.remove();

  const price = Math.round((variant.price || 0) * DISCOUNT_RATE);

  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",

    "name": prod.name + (variant.name ? ' — ' + variant.name : ''),
    "description": prod.description || '',
    "image": variant.images || [],

    "sku": variant.sku || prod.id,
    "mpn": variant.sku || prod.id,

    "brand": {
      "@type": "Brand",
      "name": prod.brand || "PLATFORMA"
    },

    "category": activeCat?.name || '',

    "offers": {
      "@type": "Offer",
      "url": window.location.href,
      "priceCurrency": "RUB",
      "price": price,
      "availability": "https://schema.org/InStock",
      "itemCondition": "https://schema.org/NewCondition",

      "seller": {
        "@type": "Organization",
        "name": "PLATFORMA"
      }
    }
  };

  if (prod.rating) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": prod.rating,
      "reviewCount": prod.reviewCount || 1
    };
  }

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'product-schema';
  script.textContent = JSON.stringify(schema);

  document.head.appendChild(script);
}

function openProd(id) {
  modalProd = findProd(id);
  if (!modalProd) return;
  modalVar = 0; modalImg = 0; modalQty = 1;
  renderModal();
  document.getElementById('movl').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  // В URL пишем только последний сегмент слага (красиво и без mk4s.ru)
  const urlSlug = (modalProd.id || id).split('--').pop();
  setURLParam('product', urlSlug);
}

function closeMod() {
  document.getElementById('movl').style.display = 'none';
  document.body.style.overflow = '';
  removeURLParam('product');
}

function handleMovl(e) { if (e.target === document.getElementById('movl')) closeMod(); }

function renderModal() {
  const p = modalProd;
  const v = p.variants[modalVar];
  const imgs = (v.images && v.images.length) ? v.images : [];

  document.getElementById('mgal-track').innerHTML = imgs.length
    ? imgs.map((src, i) =>
        '<div class="mgal-slide"><img src="' + src + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" alt="' + p.title + '" onclick="openZoom(' + i + ')"/></div>'
      ).join('')
    : '<div class="mgal-slide"><div class="ph-big">📦</div></div>';

  document.getElementById('mgal-dots').innerHTML = imgs.length > 1
    ? imgs.map((_, i) => '<div class="mgal-dot ' + (i === 0 ? 'active' : '') + '" onclick="selImg(' + i + ')"></div>').join('')
    : '';

  document.getElementById('mthbs').innerHTML = imgs.map((s, i) =>
    '<div class="mthb ' + (i === modalImg ? 'active' : '') + '" onclick="selImg(' + i + ')"><img src="' + s + '" loading="lazy"/></div>'
  ).join('');

  setupGalSwipe();

  const fp = Math.round(v.price * DISCOUNT_RATE);
  const pr = v.price > 0
    ? '<span class="mprice">' + fmt(fp) + ' ₽</span><span class="mop">' + fmt(v.price) + ' ₽</span><span class="m-disc-tag">−7%</span>'
    : '<span class="mprice" style="font-size:16px;color:var(--muted)">Цена по запросу</span>';

  const vars = p.variants.length > 1
    ? '<div><div class="vlabel">Вариант</div><div class="vlist">' +
        p.variants.map((vv, i) =>
          '<button class="vbtn ' + (i === modalVar ? 'active' : '') + '" onclick="selVar(' + i + ')">' + (vv.sku_name || vv.color || vv.sku) + '</button>'
        ).join('') +
      '</div></div>'
    : '';

  const desc = p.description
    ? '<div><div class="vlabel" style="margin-bottom:5px">Описание</div><div class="mdesc">' + p.description + '</div></div>'
    : '';

  const feats = Object.keys(p.features || {}).slice(0, 10);
  const featHtml = feats.length
    ? '<div><div class="vlabel" style="margin-bottom:7px">Характеристики</div><div class="fgrid">' +
        feats.map(k => '<div class="frow"><div class="fkey">' + k + '</div><div class="fval">' + p.features[k] + '</div></div>').join('') +
      '</div></div>'
    : '';

  const packNote = v.pack_quantity > 1 ? '<span style="font-size:11px;color:var(--muted)">× ' + v.pack_quantity + ' м²/уп</span>' : '';
  const productSlug = (p.id || '').split('--').pop() || p.id;
  const shareUrl = location.origin + location.pathname + '?cat=' + (activeCat?.slug || '') + '&product=' + encodeURIComponent(productSlug);

  document.getElementById('minfo').innerHTML =
    '<div class="mtitle">' + p.title + '</div>' +
    '<div class="msku">Арт. ' + v.sku + '</div>' +
    '<div class="mpb">' + pr + '</div>' +
    vars +
    '<div class="qrow">' +
      '<div class="vlabel">Кол-во:</div>' +
      '<button class="qbtn" onclick="chgQty(-1)">−</button>' +
      '<span class="qval" id="mq">' + modalQty + '</span>' +
      '<button class="qbtn" onclick="chgQty(1)">+</button>' +
      packNote +
    '</div>' +
    desc + featHtml +
    '<div class="share-row">' +
      '<button class="share-btn" id="share-btn-el" onclick="copyLink(\'' + shareUrl + '\')">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>' +
        'Скопировать ссылку' +
      '</button>' +
    '</div>' +
    '<button class="madd" onclick="addFromModal()">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      'Добавить в корзину' +
    '</button>';
}

function setupGalSwipe() {
  const track = document.getElementById('mgal-track');
  if (!track) return;
  // Убираем старый listener клонированием
  const newTrack = track.cloneNode(true);
  track.parentNode.replaceChild(newTrack, track);
  newTrack.addEventListener('scroll', () => {
    const idx = Math.round(newTrack.scrollLeft / (newTrack.clientWidth || 1));
    if (idx !== modalImg) { modalImg = idx; syncGalUI(); }
  }, { passive: true });
}

function syncGalUI() {
  document.querySelectorAll('.mgal-dot').forEach((d, i) => d.classList.toggle('active', i === modalImg));
  document.querySelectorAll('.mthb').forEach((d, i) => d.classList.toggle('active', i === modalImg));
}

function selVar(i) { modalVar = i; modalImg = 0; renderModal(); }

function selImg(i) {
  modalImg = i;
  const track = document.getElementById('mgal-track');
  if (track) track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  syncGalUI();
}

function chgQty(d) {
  modalQty = Math.max(1, modalQty + d);
  const e = document.getElementById('mq');
  if (e) e.textContent = modalQty;
}

function addFromModal() {
  const v = modalProd.variants[modalVar];
  const fp = Math.round(v.price * DISCOUNT_RATE);
  addToCart({ sku: v.sku, title: modalProd.title + (v.color ? ' (' + v.color + ')' : ''), price: fp, img: (v.images || [])[0] || '', qty: modalQty });
  closeMod();
  openCart();
}

function copyLink(url) {
  navigator.clipboard?.writeText(url).then(() => {
    const b = document.getElementById('share-btn-el');
    if (!b) return;
    b.textContent = '✓ Ссылка скопирована!';
    setTimeout(() => {
      b.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Скопировать ссылку';
    }, 2200);
  }).catch(() => toast('Не удалось скопировать', 'error'));
}

// ══ IMAGE ZOOM ═════════════════════════════════════════════════════════════
let zoomState = { isOpen: false, currentIndex: 0, images: [] };

function openZoom(index) {
  const p = modalProd;
  const v = p.variants[modalVar];
  zoomState.images = (v.images && v.images.length) ? v.images : [];
  zoomState.currentIndex = index;
  zoomState.isOpen = true;
  renderZoom();
  document.body.style.overflow = 'hidden';
}

function closeZoom() {
  zoomState.isOpen = false;
  document.getElementById('zoom-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function renderZoom() {
  if (!zoomState.isOpen || !zoomState.images.length) return;

  let overlay = document.getElementById('zoom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'zoom-overlay';
    overlay.className = 'zoom-overlay';
    overlay.innerHTML = `
      <div class="zoom-container">
        <button class="zoom-close" onclick="closeZoom()">✕</button>
        <button class="zoom-prev" onclick="navigateZoom(-1)" ${zoomState.images.length <= 1 ? 'style="display:none"' : ''}>‹</button>
        <button class="zoom-next" onclick="navigateZoom(1)" ${zoomState.images.length <= 1 ? 'style="display:none"' : ''}>›</button>
        <div class="zoom-image-container">
          <img id="zoom-img" src="" alt=""/>
        </div>
        <div class="zoom-dots" id="zoom-dots"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  overlay.style.display = 'flex';
  
  const img = document.getElementById('zoom-img');
  img.src = zoomState.images[zoomState.currentIndex];
  img.onclick = (e) => {
    e.stopPropagation();
    closeZoom();
  };

  // Update dots
  const dotsContainer = document.getElementById('zoom-dots');
  if (zoomState.images.length > 1) {
    dotsContainer.innerHTML = zoomState.images.map((_, i) => 
      '<div class="zoom-dot ' + (i === zoomState.currentIndex ? 'active' : '') + '" onclick="goToZoom(' + i + ')"></div>'
    ).join('');
  }

  // Update navigation buttons
  const prevBtn = overlay.querySelector('.zoom-prev');
  const nextBtn = overlay.querySelector('.zoom-next');
  if (prevBtn) prevBtn.style.display = zoomState.images.length <= 1 ? 'none' : '';
  if (nextBtn) nextBtn.style.display = zoomState.images.length <= 1 ? 'none' : '';

  // Keyboard navigation
  document.addEventListener('keydown', handleZoomKeydown);
}

function navigateZoom(direction) {
  if (!zoomState.images.length) return;
  
  zoomState.currentIndex = (zoomState.currentIndex + direction + zoomState.images.length) % zoomState.images.length;
  renderZoom();
}

function goToZoom(index) {
  zoomState.currentIndex = index;
  renderZoom();
}

function handleZoomKeydown(e) {
  if (!zoomState.isOpen) return;
  
  switch(e.key) {
    case 'Escape':
      closeZoom();
      break;
    case 'ArrowLeft':
      navigateZoom(-1);
      break;
    case 'ArrowRight':
      navigateZoom(1);
      break;
  }
}

// ══ QUICK ADD ══════════════════════════════════════════════════════════════
function quickAdd(id) {
  const p = findProd(id);
  if (!p) return;
  const v = p.variants[0];
  const fp = Math.round(v.price * DISCOUNT_RATE);
  addToCart({ sku: v.sku, title: p.title, price: fp, img: (v.images || [])[0] || '', qty: 1 });
  const btn = document.getElementById('ab-' + id);
  if (btn) {
    btn.classList.add('added');
    btn.textContent = '✓ Добавлено';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> В корзину';
    }, 1600);
  }
}

// ══ CART ═══════════════════════════════════════════════════════════════════
function addToCart(item) {
  const ex = cart.find(c => c.sku === item.sku);
  if (ex) ex.qty += item.qty;
  else cart.push(Object.assign({}, item));
  saveCart();
  updateBadge();
  toast(item.title.substring(0, 28) + '... добавлен', 'success');
}

function saveCart() { localStorage.setItem('platforma_cart', JSON.stringify(cart)); }

function updateBadge() {
  const t = cart.reduce((s, c) => s + c.qty, 0);
  ['cbadge', 'cbadge2'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.style.display = t > 0 ? 'flex' : 'none';
    b.textContent = t > 99 ? '99+' : t;
  });
}

function openCart() {
  renderCart();
  document.getElementById('covl').style.display = '';
  document.getElementById('cpanel').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  document.getElementById('covl').style.display = 'none';
  document.getElementById('cpanel').style.display = 'none';
  document.body.style.overflow = '';
}

function renderCart() {
  const el = document.getElementById('citems');
  const ftr = document.getElementById('cftr');
  if (!cart.length) {
    el.innerHTML = '<div class="cempty"><span class="cempty-icon">🛒</span>Корзина пуста<br><span style="font-size:11px">Добавьте товары из каталога</span></div>';
    ftr.innerHTML = '';
    return;
  }

  el.innerHTML = cart.map((item, i) =>
    '<div class="citem-card">' +
      (item.img
        ? '<img class="cimg" src="' + item.img + '" alt="">'
        : '<div class="cimg" style="display:flex;align-items:center;justify-content:center;font-size:24px;background:var(--surface2)">📦</div>') +
      '<div class="cii">' +
        '<div class="cititle">' + item.title + '</div>' +
        '<div class="cimeta">Арт. ' + item.sku + '</div>' +
        '<div class="cqrow">' +
          '<button class="cqbtn" onclick="changeCartQty(' + i + ',-1)">−</button>' +
          '<span class="cqval">' + item.qty + '</span>' +
          '<button class="cqbtn" onclick="changeCartQty(' + i + ',1)">+</button>' +
        '</div>' +
        '<div class="ciprice">' + (item.price > 0 ? fmt(item.price * item.qty) + ' ₽' : 'по запросу') + '</div>' +
      '</div>' +
      '<button class="crm" onclick="rmFromCart(' + i + ')">✕</button>' +
    '</div>'
  ).join('');

  const total = cart.reduce((s, c) => s + (c.price * c.qty), 0);
  const cashback = Math.round(total * CASHBACK_RATE);
  const lcBal = loyaltyCard ? loyaltyCard.balance : 0;

  ftr.innerHTML =
    '<div class="ctotal"><span class="ctlbl">Итого</span><span class="ctval">' + fmt(total) + ' ₽</span></div>' +
    (cashback > 0 ? '<div class="ccashback">💳 +' + fmt(cashback) + ' ₽ кэшбэк на карту PLATFORMA</div>' : '') +
    (lcBal > 0 ? '<div class="ccashback" style="color:var(--gold)">💰 Баланс карты: ' + fmt(lcBal) + ' ₽ (спишется при оформлении)</div>' : '') +
    '<button class="chkbtn" onclick="openCheckout()">Оформить заказ →</button>';
}

function changeCartQty(i, d) {
  cart[i].qty = Math.max(1, cart[i].qty + d);
  saveCart(); updateBadge(); renderCart();
}

function rmFromCart(i) { cart.splice(i, 1); saveCart(); updateBadge(); renderCart(); }

// ══ CHECKOUT ════════════════════════════════════════════════════════════════
function openCheckout() {
  if (!cart.length) return;
  closeCart();
  checkoutFormState = {};
  renderCheckout();
  document.getElementById('covl2').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeCheckout() {
  checkoutFormState = {};
  document.getElementById('covl2').style.display = 'none';
  document.body.style.overflow = '';
}

function handleCOvl(e) { if (e.target === document.getElementById('covl2')) closeCheckout(); }

function renderCheckout() {
  const total = cart.reduce((s, c) => s + (c.price * c.qty), 0);
  const cashback = Math.round(total * CASHBACK_RATE);
  const lcBal = loyaltyCard ? Math.min(loyaltyCard.balance, total) : 0;
  const finalTotal = Math.max(0, total - lcBal);

  const itemsHtml = cart.map(c =>
    '<div class="co-item-line">' +
      '<span>' + c.title + ' × ' + c.qty + '</span>' +
      '<span>' + (c.price > 0 ? fmt(c.price * c.qty) + ' ₽' : '—') + '</span>' +
    '</div>'
  ).join('');

  const lcRow = lcBal > 0
    ? '<div class="co-item-line" style="color:var(--gold)"><span>Списание с карты PLATFORMA</span><span>−' + fmt(lcBal) + ' ₽</span></div>'
    : '';

  const cbNote = cashback > 0
    ? '<div style="font-size:11px;color:var(--success);margin-top:6px">💳 +' + fmt(cashback) + ' ₽ вернётся на карту PLATFORMA</div>'
    : '';

  const lcField = loyaltyCard
    ? '<div class="finp-wrap"><label>Номер карты PLATFORMA</label><input class="finp" value="' + loyaltyCard.number + '" readonly style="opacity:.6"/></div>'
    : '';

  const dmActive = m => deliveryMethod === m ? ' active' : '';

  // Блок доставки: виджет ПВЗ или поле адреса курьера
  const pvzConfirm = selectedPVZ
    ? '<div style="margin-top:8px;padding:10px 14px;background:rgba(74,173,100,.12);border:1px solid var(--success);border-radius:8px;font-size:13px;color:var(--success)" id="pvz-confirm">✅ ' + selectedPVZ.address + '</div>'
    : '<div style="margin-top:8px;padding:10px 14px;background:var(--panel);border-radius:8px;font-size:12px;color:var(--muted)" id="pvz-confirm">Выберите точку на карте и нажмите «Продолжить»</div>';

  const deliveryBlock =
    '<div class="finp-wrap">' +
      '<label>Способ доставки *</label>' +
      '<div class="sub-methods" style="margin-top:8px">' +
        '<div class="sub-method' + dmActive('pvz') + '" onclick="setDeliveryMethod(\'pvz\')">' +
          '<div class="sm-icon">📦</div>Пункт выдачи' +
        '</div>' +
        '<div class="sub-method' + dmActive('courier') + '" onclick="setDeliveryMethod(\'courier\')">' +
          '<div class="sm-icon">🚚</div>Курьер' +
        '</div>' +
      '</div>' +
    '</div>' +
    (deliveryMethod === 'pvz'
      ? '<div class="finp-wrap">' +
          '<label>Пункт выдачи (Яндекс Доставка) *</label>' +
          pvzConfirm +
          '<div id="delivery-widget" style="margin-top:10px;border-radius:10px;overflow:hidden;min-height:400px"></div>' +
        '</div>'
      : '<div class="finp-wrap"><label>Адрес доставки курьером *</label><input class="finp" id="co-addr" placeholder="Город, улица, дом, квартира"/></div>'
    );

  document.getElementById('coinner').innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">' +
      '<h2 style="font-family:var(--fh);font-size:17px;font-weight:700">Оформление заказа</h2>' +
      '<button onclick="closeCheckout()" style="background:none;border:none;font-size:22px;color:var(--muted)">✕</button>' +
    '</div>' +
    '<div class="coform">' +
      '<div class="frow2">' +
        '<div class="finp-wrap"><label>Имя *</label><input class="finp" id="co-name" placeholder="Иван Иванов"/></div>' +
        '<div class="finp-wrap"><label>Телефон *</label><input class="finp" id="co-phone" placeholder="+7 (___) ___-__-__"/></div>' +
      '</div>' +
      '<div class="finp-wrap"><label>Email</label><input class="finp" id="co-email" placeholder="email@example.com"/></div>' +
      deliveryBlock +
      lcField +
      '<div class="finp-wrap"><label>Комментарий</label><textarea class="ftarea" id="co-comment" placeholder="Пожелания, удобное время доставки..."></textarea></div>' +
      '<div class="co-items-preview">' + itemsHtml + lcRow +
        '<div class="co-total-line"><span>К оплате</span><span>' + fmt(finalTotal) + ' ₽</span></div>' +
        cbNote +
      '</div>' +
      '<div><div class="vlabel" style="margin-bottom:8px">Дополнительно</div>' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">' +
          '<input type="checkbox" id="co-callback" style="width:16px;height:16px;accent-color:var(--dark);cursor:pointer">' +
          'Перезвоните мне для подтверждения заказа' +
        '</label>' +
      '</div>' +
      '<button class="co-submit" onclick="submitOrder()">Отправить заказ</button>' +
    '</div>';

  // Запускаем виджет если выбран ПВЗ
  if (deliveryMethod === 'pvz') {
    initYaWidget();
  }
}


function initYaWidget() {
  requestAnimationFrame(() => {
    const container = document.getElementById('delivery-widget');
    if (!container) return;

    function startWidget() {
      // Если виджет уже был создан в этом контейнере — не дублируем
      if (container.dataset.yaWidgetInit === '1') return;
      container.dataset.yaWidgetInit = '1';

      window.YaDelivery.createWidget({
        containerId: 'delivery-widget',
        params: {
          city: 'Москва',
          size: { height: '420px', width: '100%' },
          // source_platform_station: 'ВАШ_GUID_СТАНЦИИ', // раскомментировать после регистрации в ЛК Яндекс Доставки
          // physical_dims_weight_gross: 15000,            // вес отправления в граммах — раскомментировать
          delivery_price: 'от 200',
          delivery_term: 'от 2 дней',
          show_select_button: true,
          filter: {
            type: ['pickup_point', 'terminal'],
            payment_methods: ['already_paid', 'card_on_receipt'],
            payment_methods_filter: 'or'
          }
        }
      });
    }

    window.YaDelivery ? startWidget()
      : document.addEventListener('YaNddWidgetLoad', startWidget, { once: true });

    // Обработка выбора точки
    document.addEventListener('YaNddWidgetPointSelected', function onPVZSelect(e) {
      // Отписываемся если виджет уже не в DOM (перерисовка чекаута)
      if (!document.getElementById('delivery-widget')) {
        document.removeEventListener('YaNddWidgetPointSelected', onPVZSelect);
        return;
      }
      const d = e.detail;
      selectedPVZ = {
        id: d.id,
        address: d.address?.full_address || [d.address?.locality, d.address?.street, d.address?.house].filter(Boolean).join(', ')
      };
      // Обновляем строку подтверждения без полной перерисовки
      const confirm = document.getElementById('pvz-confirm');
      if (confirm) {
        confirm.style.background = 'rgba(74,173,100,.12)';
        confirm.style.border = '1px solid var(--success)';
        confirm.style.color = 'var(--success)';
        confirm.textContent = '✅ ' + selectedPVZ.address;
      }
    });
  });
}

// Сохранённые значения полей чекаута между перерисовками
let checkoutFormState = {};

function saveCheckoutState() {
  ['co-name','co-phone','co-email','co-addr','co-comment'].forEach(id => {
    const el = document.getElementById(id);
    if (el) checkoutFormState[id] = el.value;
  });
}

function restoreCheckoutState() {
  ['co-name','co-phone','co-email','co-addr','co-comment'].forEach(id => {
    const el = document.getElementById(id);
    if (el && checkoutFormState[id] != null) el.value = checkoutFormState[id];
  });
}

function setSubMethod(m) { saveCheckoutState(); subMethod = m; renderCheckout(); restoreCheckoutState(); }
function setDeliveryMethod(m) { saveCheckoutState(); deliveryMethod = m; selectedPVZ = null; renderCheckout(); restoreCheckoutState(); if (deliveryMethod === 'pvz') initYaWidget(); }

async function submitOrder() {
  const name = document.getElementById('co-name')?.value.trim();
  const phone = document.getElementById('co-phone')?.value.trim();
  let valid = true;

  // Валидация имени и телефона
  ['co-name', 'co-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value.trim()) { el.classList.add('error'); valid = false; }
    else el?.classList.remove('error');
  });

  // Валидация доставки
  if (deliveryMethod === 'pvz' && !selectedPVZ) {
    toast('Выберите пункт выдачи на карте', 'error');
    valid = false;
  }
  if (deliveryMethod === 'courier') {
    const addrEl = document.getElementById('co-addr');
    if (!addrEl || !addrEl.value.trim()) {
      addrEl?.classList.add('error');
      valid = false;
    } else addrEl.classList.remove('error');
  }

  if (!valid) { toast('Заполните обязательные поля', 'error'); return; }

  const total = cart.reduce((s, c) => s + (c.price * c.qty), 0);
  const cashback = Math.round(total * CASHBACK_RATE);
  const lcBal = loyaltyCard ? Math.min(loyaltyCard.balance, total) : 0;

  const order = {
    name, phone,
    email: document.getElementById('co-email')?.value.trim() || '',
    delivery_method: deliveryMethod,
    address: deliveryMethod === 'pvz'
      ? selectedPVZ.address
      : (document.getElementById('co-addr')?.value.trim() || ''),
    pvz_id: selectedPVZ?.id || null,
    comment: document.getElementById('co-comment')?.value.trim() || '',
    callback_requested: document.getElementById('co-callback')?.checked || false,
    loyalty_card: loyaltyCard?.number || null,
    items: cart, total, cashback,
    loyalty_deducted: lcBal,
    final_total: Math.max(0, total - lcBal),
    notify: ['email', 'telegram'], // всегда шлём на оба канала
    created_at: new Date().toISOString()
  };

  // ── Отправка в Telegram ──────────────────────────────────────────────
  const TG_TOKEN  = '7867250243:AAEP5Rk5vwjIDh846Iaq4JKO8IzY5B1a4y4';
  const TG_CHAT   = '1383747941';

  const itemsList = order.items.map(i =>
    `  • ${i.title} × ${i.qty} — ${i.price > 0 ? fmt(i.price * i.qty) + ' ₽' : 'по запросу'}`
  ).join('\n');

  const tgText = [
    '🛒 *Новый заказ PLATFORMA*',
    '',
    `👤 *Имя:* ${order.name}`,
    `📞 *Телефон:* ${order.phone}`,
    order.email ? `📧 *Email:* ${order.email}` : null,
    '',
    `🚚 *Доставка:* ${order.delivery_method === 'pvz' ? 'Пункт выдачи' : 'Курьер'}`,
    `📍 *Адрес:* ${order.address || '—'}`,
    order.pvz_id ? `🔖 *ID ПВЗ:* ${order.pvz_id}` : null,
    '',
    '*Состав заказа:*',
    itemsList,
    '',
    `💰 *Итого:* ${fmt(order.final_total)} ₽`,
    order.loyalty_deducted > 0 ? `💳 *Списано с карты:* ${fmt(order.loyalty_deducted)} ₽` : null,
    order.comment ? `💬 *Комментарий:* ${order.comment}` : null,
    order.callback_requested ? '📲 *Просит перезвонить*' : null,
    '',
    `🕐 ${new Date().toLocaleString('ru-RU')}`,
  ].filter(Boolean).join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text: tgText,
        parse_mode: 'Markdown'
      })
    });
  } catch (e) {
    console.error('Telegram send error:', e);
  }

  if (loyaltyCard) {
    loyaltyCard.balance = Math.max(0, loyaltyCard.balance - lcBal) + cashback;
    loyaltyCard.transactions.unshift({
      type: 'purchase',
      title: 'Заказ от ' + new Date().toLocaleDateString('ru'),
      date: new Date().toLocaleDateString('ru'),
      amount: cashback,
      minus: lcBal
    });
    loyaltyCard.totalSpent = (loyaltyCard.totalSpent || 0) + total;
    localStorage.setItem('platforma_loyalty', JSON.stringify(loyaltyCard));
  }

  const cbMsg = loyaltyCard
    ? '<br><br><strong style="color:var(--success)">+' + fmt(cashback) + ' ₽ кэшбэк зачислен на карту PLATFORMA</strong>'
    : '';

  const deliveryInfo = deliveryMethod === 'pvz'
    ? '<br>Доставка в ПВЗ: ' + selectedPVZ.address
    : '';

  const callbackNote = order.callback_requested
    ? '<br>Мы перезвоним вам для подтверждения.'
    : '<br>Мы свяжемся с вами в ближайшее время.';

  document.getElementById('coinner').innerHTML =
    '<div class="co-success">' +
      '<div class="tick">✅</div>' +
      '<h3>Заказ принят!</h3>' +
      '<p>Спасибо, <strong>' + name + '</strong>!' + callbackNote + deliveryInfo + cbMsg + '</p>' +
      '<button class="co-submit" style="margin-top:22px" onclick="closeCheckout()">Закрыть</button>' +
    '</div>';

  // Сброс состояния доставки
  selectedPVZ = null;
  deliveryMethod = 'pvz';
  cart = []; saveCart(); updateBadge();
}

// ══ SEARCH ══════════════════════════════════════════════════════════════════
let srchTimer;
document.getElementById('srch').addEventListener('input', e => {
  clearTimeout(srchTimer);
  const q = e.target.value.trim();
  srchQ = q;
  if (!q) {
    document.getElementById('srch-dropdown').style.display = 'none';
    if (activeCat) renderProducts();
    return;
  }
  srchTimer = setTimeout(() => {
    const lq = q.toLowerCase();
    const allProds = catalog?.categories.flatMap(c => c.products) || [];
    const found = allProds.filter(p =>
      p.title.toLowerCase().includes(lq) || (p.description || '').toLowerCase().includes(lq)
    ).slice(0, 6);

    const dd = document.getElementById('srch-dropdown');
    if (!found.length) { dd.style.display = 'none'; return; }

    dd.innerHTML = found.map(p => {
      const v = p.variants[0];
      const fp = Math.round(v.price * DISCOUNT_RATE);
      const imgEl = (v.images && v.images[0])
        ? '<img src="' + v.images[0] + '" alt="" onerror="this.parentElement.innerHTML=\'<div class=srch-item-ph>📦</div>\'">'
        : '<div class="srch-item-ph">📦</div>';
      return (
        '<div class="srch-item" onclick="openProdFromSearch(\'' + p.id + '\')">' +
          imgEl +
          '<div>' +
            '<div class="srch-item-title">' + p.title + '</div>' +
            '<div class="srch-item-price">' + (v.price > 0 ? fmt(fp) + ' ₽' : 'По запросу') + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('') + (found.length === 6 ? '<div class="srch-more" onclick="runFullSearch(\'' + q + '\')">Показать все результаты →</div>' : '');
    dd.style.display = 'block';
  }, 280);
});

document.getElementById('srch').addEventListener('keydown', e => {
  if (e.key === 'Escape') { document.getElementById('srch-dropdown').style.display = 'none'; e.target.blur(); }
  if (e.key === 'Enter') { runFullSearch(e.target.value.trim()); }
});

document.addEventListener('click', e => {
  if (!document.getElementById('srchwrap').contains(e.target))
    document.getElementById('srch-dropdown').style.display = 'none';
});

function openProdFromSearch(id) {
  document.getElementById('srch-dropdown').style.display = 'none';
  document.getElementById('srch').value = '';
  srchQ = '';
  openProd(id);
}

function runFullSearch(q) {
  document.getElementById('srch-dropdown').style.display = 'none';
  srchQ = q;
  const lq = q.toLowerCase();
  const allProds = catalog?.categories.flatMap(c => c.products) || [];
  const found = allProds.filter(p => p.title.toLowerCase().includes(lq) || (p.description || '').toLowerCase().includes(lq));
  const content = document.getElementById('content');
  if (!found.length) { content.innerHTML = '<div class="loading">Ничего не найдено по «' + q + '»</div>'; return; }
  const cards = found.map(p => {
    const v = p.variants[0];
    const fp = Math.round(v.price * DISCOUNT_RATE);
    const img = (v.images && v.images[0])
      ? '<img src="' + v.images[0] + '" alt="' + p.title + '" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=ph>📦</div>\'">'
      : '<div class="ph">📦</div>';
    const pr = v.price > 0
      ? '<span class="pp">' + fmt(fp) + ' ₽</span><span class="pop">' + fmt(v.price) + ' ₽</span>'
      : '<span class="pp" style="font-size:12px;color:var(--muted)">По запросу</span>';
    return (
      '<div class="pcard" onclick="openProd(\'' + p.id + '\')">' +
        '<div class="pthumb">' + img + '</div>' +
        '<div class="pinfo"><div class="ptitle">' + p.title + '</div><div class="pprow">' + pr + '</div></div>' +
        '<button class="addbtn" onclick="event.stopPropagation();quickAdd(\'' + p.id + '\')">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>В корзину' +
        '</button>' +
      '</div>'
    );
  }).join('');
  content.innerHTML = '<div class="fbar"><span class="rcnt">По запросу «' + q + '»: ' + found.length + ' товаров</span></div><div class="pgrid">' + cards + '</div>';
}

// ══ LOYALTY ══════════════════════════════════════════════════════════════════
function openLoyaltyModal() {
  renderLoyaltyModal();
  document.getElementById('loyalty-ovl').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLoyaltyModal() {
  document.getElementById('loyalty-ovl').style.display = 'none';
  document.body.style.overflow = '';
}

function handleLoyaltyOvl(e) { if (e.target === document.getElementById('loyalty-ovl')) closeLoyaltyModal(); }

function generateCardNumber() {
  return 'PLTF ' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 9000 + 1000)).join(' ');
}

function renderLoyaltyModal() {
  const inner = document.getElementById('loyalty-inner');
  if (loyaltyCard) renderLoyaltyDashboard(inner);
  else renderLoyaltyReg(inner);
}

function renderLoyaltyDashboard(inner) {
  const lc = loyaltyCard;
  const spent = lc.totalSpent || 0;
  const histHtml = (lc.transactions || []).slice(0, 5).map(t =>
    '<div class="lc-hist-item">' +
      '<div class="lc-hist-icon">' + (t.type === 'purchase' ? '🛍️' : '🎁') + '</div>' +
      '<div class="lc-hist-info">' +
        '<div class="lc-hist-title">' + t.title + '</div>' +
        '<div class="lc-hist-date">' + t.date + '</div>' +
      '</div>' +
      '<div class="lc-hist-amount plus">+' + fmt(t.amount) + ' ₽</div>' +
    '</div>'
  ).join('') || '<div style="color:var(--muted);font-size:12px;padding:10px 0">История пуста — совершите первую покупку</div>';

  inner.innerHTML =
    '<div class="lc-hdr">' +
      '<button class="lc-hdr-close" onclick="closeLoyaltyModal()">✕</button>' +
      '<div class="lc-hdr-title">Карта PLATFORMA</div>' +
      '<div class="lc-hdr-sub">Персональный счёт лояльности</div>' +
    '</div>' +
    '<div style="padding:24px 28px 0">' +
      '<div class="lc-card">' +
        '<div class="lc-top">' +
          '<div><div class="lc-logo">PLAT<em>FORMA</em></div><div class="lc-type">Карта лояльности</div></div>' +
          '<div class="lc-chip">💳</div>' +
        '</div>' +
        '<div class="lc-number">' + lc.number + '</div>' +
        '<div class="lc-bottom">' +
          '<div>' +
            '<div class="lc-balance-lbl">Баланс</div>' +
            '<div class="lc-balance">' + fmt(lc.balance) + ' ₽</div>' +
            '<div class="lc-balance-sub">Доступно к списанию</div>' +
          '</div>' +
          '<div class="lc-stats">' +
            '<div class="lc-stat-item"><div class="lc-stat-val">' + fmt(spent) + ' ₽</div><div class="lc-stat-lbl">Потрачено</div></div>' +
            '<div class="lc-stat-item"><div class="lc-stat-val">0.5%</div><div class="lc-stat-lbl">Кэшбэк</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="lc-holder">' + lc.name + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="lc-body">' +
      '<div class="lc-section">' +
        '<div class="lc-section-title">Привилегии карты</div>' +
        '<div class="lc-perks">' +
          '<div class="lc-perk"><div class="lc-perk-icon">💰</div><div class="lc-perk-title">Кэшбэк 0.5%</div><div class="lc-perk-sub">С каждой покупки деньги возвращаются автоматически</div></div>' +
          '<div class="lc-perk"><div class="lc-perk-icon">🛒</div><div class="lc-perk-title">Живой баланс</div><div class="lc-perk-sub">Используйте накопленное как скидку при заказе</div></div>' +
          '<div class="lc-perk"><div class="lc-perk-icon">♾️</div><div class="lc-perk-title">Не сгорает</div><div class="lc-perk-sub">Баланс хранится бессрочно</div></div>' +
          '<div class="lc-perk"><div class="lc-perk-icon">🎯</div><div class="lc-perk-title">Персональные</div><div class="lc-perk-sub">Индивидуальные предложения для держателей</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="lc-section">' +
        '<div class="lc-section-title">История операций</div>' +
        '<div class="lc-history">' + histHtml + '</div>' +
      '</div>' +
      '<button class="lc-submit" onclick="closeLoyaltyModal();openCart()">Использовать баланс при покупке</button>' +
    '</div>';
}

function renderLoyaltyReg(inner) {
  inner.innerHTML =
    '<div class="lc-hdr">' +
      '<button class="lc-hdr-close" onclick="closeLoyaltyModal()">✕</button>' +
      '<div class="lc-hdr-title">Карта PLATFORMA</div>' +
      '<div class="lc-hdr-sub">Оформите за 30 секунд — бесплатно</div>' +
    '</div>' +
    '<div style="padding:24px 28px 0">' +
      '<div class="lc-card" style="opacity:.75">' +
        '<div class="lc-top">' +
          '<div><div class="lc-logo">PLAT<em>FORMA</em></div><div class="lc-type">Карта лояльности</div></div>' +
          '<div class="lc-chip">💳</div>' +
        '</div>' +
        '<div class="lc-number">PLTF ···· ···· ···· ····</div>' +
        '<div class="lc-bottom">' +
          '<div><div class="lc-balance-lbl">Бонус при открытии</div><div class="lc-balance">5 000 ₽</div></div>' +
          '<div class="lc-stats"><div class="lc-stat-item"><div class="lc-stat-val">0.5%</div><div class="lc-stat-lbl">Кэшбэк</div></div></div>' +
        '</div>' +
        '<div class="lc-holder">ВАШЕ ИМЯ</div>' +
      '</div>' +
    '</div>' +
    '<div class="lc-body">' +
      '<div class="lc-perks" style="margin-bottom:20px">' +
        '<div class="lc-perk"><div class="lc-perk-icon">🎁</div><div class="lc-perk-title">5 000 ₽ в подарок</div><div class="lc-perk-sub">Зачисляются сразу после регистрации</div></div>' +
        '<div class="lc-perk"><div class="lc-perk-icon">💰</div><div class="lc-perk-title">Кэшбэк 0.5%</div><div class="lc-perk-sub">Деньги на счёт с каждой покупки</div></div>' +
        '<div class="lc-perk"><div class="lc-perk-icon">♾️</div><div class="lc-perk-title">Бессрочно</div><div class="lc-perk-sub">Баланс не сгорает никогда</div></div>' +
        '<div class="lc-perk"><div class="lc-perk-icon">🆓</div><div class="lc-perk-title">Бесплатно</div><div class="lc-perk-sub">Никаких взносов и условий</div></div>' +
      '</div>' +
      '<div class="lc-reg-form">' +
        '<div class="lc-reg-title">Оформить карту</div>' +
        '<div class="lc-reg-sub">Введите данные и получите <strong>5 000 ₽</strong> на баланс сразу после регистрации. Карта создаётся мгновенно.</div>' +
        '<div class="finp-wrap"><label>Ваше имя *</label><input class="finp" id="lc-name" placeholder="Иван Иванов"/></div>' +
        '<div class="finp-wrap"><label>Телефон *</label><input class="finp" id="lc-phone" placeholder="+7 (___) ___-__-__"/></div>' +
        '<button class="lc-submit" onclick="registerLoyalty()">Создать карту и получить 5 000 ₽ →</button>' +
        '<div class="lc-terms">Нажимая кнопку, вы соглашаетесь с условиями программы лояльности PLATFORMA. Данные хранятся локально на вашем устройстве.</div>' +
      '</div>' +
    '</div>';
}

function registerLoyalty() {
  const name = document.getElementById('lc-name')?.value.trim();
  const phone = document.getElementById('lc-phone')?.value.trim();
  if (!name || !phone) {
    ['lc-name', 'lc-phone'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.value.trim()) el.classList.add('error');
    });
    toast('Заполните имя и телефон', 'error');
    return;
  }

  const WELCOME_BONUS = 5000;

  loyaltyCard = {
    number: generateCardNumber(),
    name: name.toUpperCase(),
    phone,
    balance: WELCOME_BONUS,
    totalSpent: 0,
    transactions: [{
      type: 'gift',
      title: 'Приветственный бонус PLATFORMA',
      date: new Date().toLocaleDateString('ru'),
      amount: WELCOME_BONUS,
      minus: 0
    }],
    created: new Date().toLocaleDateString('ru')
  };

  localStorage.setItem('platforma_loyalty', JSON.stringify(loyaltyCard));
  toast('🎉 Карта оформлена! На счёт зачислено 5 000 ₽', 'success', 4000);
  renderLoyaltyModal();
}

// ══ MOBILE ════════════════════════════════════════════════════════════════
function mobNav(tab) {
  document.querySelectorAll('.mnbtn').forEach(b => b.classList.remove('active'));
  document.getElementById('mn-' + tab)?.classList.add('active');
  if (tab === 'catalog') openMobDrawer();
  if (tab === 'search') { document.getElementById('srch')?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

function openMobDrawer() {
  document.getElementById('mob-drawer-ovl').style.display = '';
  document.getElementById('mob-drawer').style.display = 'flex';
}

function closeMobDrawer() {
  document.getElementById('mob-drawer-ovl').style.display = 'none';
  document.getElementById('mob-drawer').style.display = 'none';
}

// ══ KEYBOARD ════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (document.getElementById('movl').style.display !== 'none') closeMod();
  else if (document.getElementById('covl2').style.display !== 'none') closeCheckout();
  else if (document.getElementById('loyalty-ovl').style.display !== 'none') closeLoyaltyModal();
  else if (document.getElementById('cpanel').style.display !== 'none') closeCart();
  else closeMobDrawer();
});

// ══ UTILS ════════════════════════════════════════════════════════════════════
function fmt(n) { return Number(n).toLocaleString('ru-RU'); }

// ══ DEMO CATALOG ═════════════════════════════════════════════════════════════
function getDemoCatalog() {
  const colors = ['Зелёный', 'Коричневый', 'Серый', 'Красный', 'Синий'];
  function cvars(base, price) {
    return colors.map((c, i) => ({
      sku: base + (i + 1), sku_name: c, color: c,
      price: price + (i % 2 ? 50 : -50),
      price_pack: price, old_price: '', pack_quantity: 1, images: []
    }));
  }
  const mk = (id, title, price, oldP, desc, feat, variants) => ({
    id, sku_base: id, title, description: desc, url: '#', features: feat,
    variants: variants || [{ sku: id + '01', sku_name: '', color: '', price, price_pack: price, old_price: oldP, pack_quantity: 1, images: [] }]
  });
  return {
    meta: { generated_at: new Date().toISOString(), total_categories: 3, total_products: 12 },
    groups: {},
    categories: [
      {
        slug: 'metallocherepitsa', name: 'Металлочерепица', url: '#', parent: null,
        products: [
          mk('mt01', 'Металлочерепица Монтеррей 0.5мм', 2450, '2800', 'Классический профиль Монтеррей. Покрытие Quarzit.', { 'Толщина': '0.5 мм', 'Ширина': '1180 мм', 'Покрытие': 'Quarzit', 'Длина': 'до 6 м' }, cvars('mt01', 2450)),
          mk('mt02', 'Металлочерепица Супермонтеррей 0.5мм', 2650, '', 'Усиленный профиль для высоких снеговых нагрузок.', { 'Толщина': '0.5 мм', 'Ширина': '1190 мм', 'Покрытие': 'PE Matt' }, cvars('mt02', 2650)),
          mk('mt03', 'Металлочерепица Макси 0.45мм', 2150, '2400', 'Экономичный вариант. Профиль Макси.', { 'Толщина': '0.45 мм', 'Ширина': '1180 мм', 'Покрытие': 'PE' }, cvars('mt03', 2150)),
          mk('mt04', 'Металлочерепица Рекорд 0.5мм', 2800, '', 'Имитация натуральной черепицы. Покрытие Purex.', { 'Толщина': '0.5 мм', 'Ширина': '1200 мм', 'Покрытие': 'Purex' }, cvars('mt04', 2800)),
        ]
      },
      {
        slug: 'vodostoki', name: 'Водостоки', url: '#', parent: null,
        products: [
          mk('vs01', 'Водосток Docke Premium 120/85', 3200, '3800', 'ПВХ система Docke Premium.', { 'Диаметр желоба': '120 мм', 'Диаметр трубы': '85 мм', 'Материал': 'ПВХ' }),
          mk('vs02', 'Желоб металлический Ranilla 120мм', 1850, '', 'Оцинкованный желоб 2м.', { 'Длина': '2000 мм', 'Диаметр': '120 мм', 'Покрытие': 'Полимер' }, cvars('vs02', 1850)),
          mk('vs03', 'Воронка водосборная 100мм', 560, '', 'Для желоба 100мм.', { 'Диаметр': '100 мм', 'Материал': 'Сталь' }),
          mk('vs04', 'Труба водосточная 76мм (3м)', 1150, '1300', 'Круглая труба 3м.', { 'Длина': '3000 мм', 'Диаметр': '76 мм' }, cvars('vs04', 1150)),
        ]
      },
      {
        slug: 'izolyatsiya', name: 'Изоляция', url: '#', parent: null,
        products: [
          mk('iz01', 'Пароизоляция Изоспан В 70м²', 2800, '3200', 'Плёнка пароизоляционная рулон 70м².', { 'Площадь': '70 м²', 'Ширина': '1600 мм', 'Вес': '35 г/м²' }),
          mk('iz02', 'Гидроизоляция Технониколь 75м²', 3400, '', 'Диффузная мембрана.', { 'Площадь': '75 м²', 'Ширина': '1500 мм', 'Вес': '110 г/м²' }),
          mk('iz03', 'Лента уплотнительная 3м', 320, '', 'Бутилкаучуковая лента.', { 'Длина': '3 м', 'Ширина': '100 мм', 'Толщина': '3 мм' }),
          mk('iz04', 'Утеплитель ISOVER 100мм 12м²', 2600, '2900', 'Минераловата для кровли.', { 'Толщина': '100 мм', 'Площадь': '12 м²', 'Теплопроводность': '0.036' }),
        ]
      }
    ]
  };
}

// ══ INIT ═══════════════════════════════════════════════════════════════════
updateBadge();
loadCatalog();
/**
 * Генерирует JSON-LD разметку Product для конкретного товара.
 * Вызывать при открытии карточки товара или при SSR рендеринге.
 *
 * @param {Object} product  — объект товара из catalog.json
 * @param {Object} category — объект категории (для breadcrumbs)
 * @returns {string} — готовый JSON-LD блок
 */
function generateProductSchema(product, category) {
  const baseUrl = 'https://platforma-pro.vercel.app';

  // Собираем все варианты как отдельные Offer
  const offers = product.variants
    .filter(v => v.price > 0)
    .map(v => {
      const discountedPrice = Math.round(v.price * 0.93);
      return {
        "@type": "Offer",
        "@id": `${baseUrl}${product.url}#offer-${v.sku}`,
        "sku": v.sku,
        "name": v.sku_name || v.color || product.title,
        "price": discountedPrice,
        "priceCurrency": "RUB",
        "priceValidUntil": getPriceValidUntil(),
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition",
        "seller": {
          "@type": "Organization",
          "name": "МК4С",
          "url": baseUrl
        },
        "shippingDetails": {
          "@type": "OfferShippingDetails",
          "shippingRate": {
            "@type": "MonetaryAmount",
            "value": 0,
            "currency": "RUB"
          },
          "shippingDestination": {
            "@type": "DefinedRegion",
            "addressCountry": "RU"
          },
          "deliveryTime": {
            "@type": "ShippingDeliveryTime",
            "handlingTime": {
              "@type": "QuantitativeValue",
              "minValue": 1,
              "maxValue": 3,
              "unitCode": "DAY"
            },
            "transitTime": {
              "@type": "QuantitativeValue",
              "minValue": 1,
              "maxValue": 14,
              "unitCode": "DAY"
            }
          }
        },
        "hasMerchantReturnPolicy": {
          "@type": "MerchantReturnPolicy",
          "applicableCountry": "RU",
          "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
          "merchantReturnDays": 14,
          "returnMethod": "https://schema.org/ReturnByMail"
        }
      };
    });

  // Картинки для Schema — массив URL
  const images = product.variants
    .flatMap(v => v.images || [])
    .filter((url, idx, arr) => arr.indexOf(url) === idx)
    .slice(0, 10);

  // Характеристики как additionalProperty
  const additionalProperties = Object.entries(product.features || {}).map(([name, value]) => ({
    "@type": "PropertyValue",
    "name": name,
    "value": value
  }));

  // Название бренда из features
  const brand = product.features?.['Производитель'] || null;

  // Нахождение минимальной цены
  const prices = product.variants.filter(v => v.price > 0).map(v => Math.round(v.price * 0.93));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${baseUrl}${product.url}`,
    "name": product.title,
    "description": product.description ||
      `${product.title} — купить в интернет-магазине МК4С. Высококачественные кровельные материалы с доставкой по России.`,
    "sku": product.sku_base,
    "mpn": product.sku_base,
    "url": `${baseUrl}${product.url}`,
    "image": images.length ? images : undefined,
    "additionalProperty": additionalProperties.length ? additionalProperties : undefined,
    "isRelatedTo": {
      "@type": "Product",
      "name": category?.name || "Кровельные материалы"
    }
  };

  // Бренд
  if (brand) {
    schema.brand = {
      "@type": "Brand",
      "name": brand
    };
    schema.manufacturer = {
      "@type": "Organization",
      "name": brand
    };
  }

  // Оферы
  if (offers.length === 1) {
    schema.offers = offers[0];
  } else if (offers.length > 1) {
    schema.offers = {
      "@type": "AggregateOffer",
      "lowPrice": minPrice,
      "highPrice": maxPrice,
      "priceCurrency": "RUB",
      "offerCount": offers.length,
      "offers": offers
    };
  }

  return JSON.stringify(schema, null, 2);
}

/**
 * Возвращает дату истечения цены (через 30 дней)
 */
function getPriceValidUntil() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

/**
 * Внедряет JSON-LD в <head> страницы.
 * Вызывается при открытии карточки или SSR-рендеринге.
 */
function injectProductSchema(product, category) {
  // Удаляем предыдущую схему товара
  const old = document.getElementById('schema-product');
  if (old) old.remove();

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'schema-product';
  script.textContent = generateProductSchema(product, category);
  document.head.appendChild(script);
}

/**
 * Генерирует BreadcrumbList для страницы товара
 */
function generateBreadcrumbSchema(category, product) {
  const base = 'https://platforma-pro.vercel.app';
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Главная",
        "item": `${base}/`
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": category.name,
        "item": `${base}${category.url}`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": product.title,
        "item": `${base}${product.url}`
      }
    ]
  };
}

// ══ ПРИМЕР РЕАЛЬНЫХ СХЕМ ══════════════════════════════════════════════════
// Ниже — примеры для реальных товаров из catalog.json

const exampleProductSchema_Ranilla = {
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://platforma-pro.vercel.app/vodostoki/metallicheskie/ranilla/zhelob-vodostoka-ranilla-125/",
  "name": "Желоб водосточный 3м Ranilla 125 мм",
  "description": "Металлический желоб водосточной системы Ranilla 125 мм в полиэстеровом покрытии. Длина 3 м. Доступен в 5 цветах: вишнёвый RAL 3005, коричневый RAL 8017, серый RAL 7024, оцинкованный, белый RAL 9003.",
  "sku": "CAF5003F8B",
  "brand": {
    "@type": "Brand",
    "name": "Ranilla"
  },
  "manufacturer": {
    "@type": "Organization",
    "name": "Ranilla"
  },
  "image": [
    "https://platforma-pro.vercel.app/wa-data/public/shop/products/11/71/7111/images/24157/zhelob-vodostochnyy-3m-ranilla-125-mm-krasnyy.970.jpg",
    "https://platforma-pro.vercel.app/wa-data/public/shop/products/11/71/7111/images/24155/zhelob-vodostochnyy-3m-ranilla-125-mm-korichnevyy.970.jpg"
  ],
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Производитель",  "value": "Ranilla"      },
    { "@type": "PropertyValue", "name": "Материал",       "value": "металлический" },
    { "@type": "PropertyValue", "name": "Диаметр",        "value": "125 мм"        },
    { "@type": "PropertyValue", "name": "Покрытие",       "value": "Полиэстер"     },
    { "@type": "PropertyValue", "name": "Длина",          "value": "3 м"           }
  ],
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": 888,
    "highPrice": 1167,
    "priceCurrency": "RUB",
    "offerCount": 5,
    "offers": [
      {
        "@type": "Offer",
        "name": "Коричневый RAL 8017",
        "sku": "CAF5003F8B28894",
        "price": 1167,
        "priceCurrency": "RUB",
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition",
        "priceValidUntil": "2026-06-13",
        "seller": { "@type": "Organization", "name": "МК4С" }
      },
      {
        "@type": "Offer",
        "name": "Оцинкованный",
        "sku": "CAF5003F8B28897",
        "price": 887,
        "priceCurrency": "RUB",
        "availability": "https://schema.org/InStock",
        "itemCondition": "https://schema.org/NewCondition",
        "priceValidUntil": "2026-06-13",
        "seller": { "@type": "Organization", "name": "МК4С" }
      }
    ]
  }
};

// Пример для утеплителя Rockwool
const exampleProductSchema_Rockwool = {
  "@context": "https://schema.org",
  "@type": "Product",
  "@id": "https://platforma-pro.vercel.app/izolyatsiya/uteplitel/rockwool/layt-batts-skandik-50-600-800-mm/",
  "name": "Утеплитель Роквул Лайт Баттс Скандик 50х600х800 мм",
  "description": "Базальтовый утеплитель Rockwool Лайт Баттс Скандик 50×600×800 мм. Упаковка 12 плит (0.288 м³). Применение: кровля, стены, пол, мансарда, перекрытия. Производство: Россия.",
  "sku": "731B7E92CB",
  "brand": {
    "@type": "Brand",
    "name": "Rockwool"
  },
  "image": [
    "https://platforma-pro.vercel.app/wa-data/public/shop/products/28/30/3028/images/6228/Sc502.970.png"
  ],
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Тип",         "value": "Базальтовый утеплитель" },
    { "@type": "PropertyValue", "name": "Толщина",     "value": "50 мм"                  },
    { "@type": "PropertyValue", "name": "Ширина",      "value": "600 мм"                 },
    { "@type": "PropertyValue", "name": "Длина",       "value": "800 мм"                 },
    { "@type": "PropertyValue", "name": "В упаковке",  "value": "0.288 м³ (12 шт.)"     },
    { "@type": "PropertyValue", "name": "Производство","value": "Россия"                 }
  ],
  "offers": {
    "@type": "Offer",
    "price": 1127,
    "priceCurrency": "RUB",
    "priceValidUntil": "2026-06-13",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": { "@type": "Organization", "name": "МК4С" }
  }
};
// --- SEO DYNAMIC PRODUCT SCHEMA ---
function injectProductSchema(product) {
  if (!product) return;
  const old = document.getElementById('schema-product');
  if (old) old.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'schema-product';
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": product.title,
    "description": product.description || (product.title + " — купить в PLATFORMA (Раменское)"),
    "brand": { "@type": "Brand", "name": "PLATFORMA" },
    "offers": {
      "@type": "Offer",
      "price": Math.round((product.variants?.[0]?.price || 0) * 0.93),
      "priceCurrency": "RUB",
      "availability": "https://schema.org/InStock",
      "url": "https://platforma-pro.vercel.app/"
    }
  };
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}