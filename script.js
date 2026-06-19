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

// Цена = прайс × 0.99 (на 1% дешевле источника)
// Маркетинг -7% оставлен на баннерах и бейджах — это позиционирование
const PRICE_BASE    = 0.99;
const DISCOUNT_RATE = 1.0;   // множитель отключён
const SALE_RATE     = 0.99;  // итоговая цена = прайс × 0.99
const CASHBACK_RATE = 0.005;

// ══ TG HELPERS ═════════════════════════════════════════════════════════════
// config.js объявляет TG_TOKEN/TG_CHAT_ID через const — они НЕ попадают в
// window, но доступны через typeof в том же скоупе страницы.
function getTGConfig() {
  const token = (typeof TG_TOKEN  !== 'undefined' && TG_TOKEN)
                ? String(TG_TOKEN)  : (window.TG_TOKEN  || '');
  const chat  = (typeof TG_CHAT_ID !== 'undefined' && TG_CHAT_ID)
                ? String(TG_CHAT_ID) : (window.TG_CHAT_ID || '');
  return { token, chat };
}

// Telegram Markdown v1: экранируем _ * ` [ чтобы имена товаров не ломали разметку
function tgEsc(s) {
  return String(s || '').replace(/([_*`\[])/g, '\\$1');
}

async function sendTG(text) {
  const { token, chat } = getTGConfig();
  if (!token || !chat) {
    console.warn('[PLATFORMA] TG config missing — token:', !!token, '| chat:', !!chat);
    return false;
  }
  try {
    const res = await fetch(
      'https://api.telegram.org/bot' + token + '/sendMessage',
      {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown' }),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[PLATFORMA] TG error:', err?.description || res.status);
    }
    return res.ok;
  } catch (e) {
    console.error('[PLATFORMA] TG sendMessage failed:', e.message);
    return false;
  }
}


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
function injectDynamicStyles() {
  if (document.getElementById('platforma-dynamic-styles')) return;
  const s = document.createElement('style');
  s.id = 'platforma-dynamic-styles';
  s.textContent = `
    /* ── Modal buttons — основной стиль в style.css ── */
    /* Здесь только то чего нет в style.css */
    /* ── Modal-embedded calc ──────────────────── */
    #modal-calc-wrap .calc-panel {
      margin: 14px 0 0; border-radius: 12px;
      background: var(--surface); border: 1px solid var(--border);
      padding: 18px; animation: fadeIn .2s ease;
    }
    #modal-calc-wrap .calc-panel h3 { font-size: 14px; margin-bottom: 14px; }
    /* ── Calc panel (main page) ───────────────── */
    .calc-panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 20px 22px 18px;
      margin-bottom: 18px;
      animation: fadeIn .25s ease;
    }
    .calc-panel h3 {
      font-family: var(--fh); font-size: 15px; font-weight: 600;
      display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
    }
    .calc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px; margin-bottom: 16px;
    }
    .calc-inp-wrap label {
      display: block; font-size: 11px; color: var(--muted);
      margin-bottom: 4px; font-weight: 500;
    }
    .calc-inp {
      width: 100%; padding: 8px 10px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--bg);
      color: var(--text); font-size: 14px; box-sizing: border-box;
    }
    .calc-inp:focus { outline: none; border-color: var(--accent); }
    .calc-result {
      display: flex; align-items: center; gap: 14px;
      flex-wrap: wrap; padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    .cres-text { font-size: 14px; color: var(--muted); flex: 1; min-width: 180px; }
    .cres-text strong { color: var(--text); font-weight: 600; }
    .calc-addbtn {
      padding: 9px 20px; border-radius: 9px;
      background: var(--dark); color: #fff;
      border: none; font-size: 13px; font-family: var(--fb);
      cursor: pointer; white-space: nowrap; transition: .18s;
    }
    .calc-addbtn:hover { opacity: .86; }

    /* ── Price pack block ──────────────────────── */
    .mprice-pack {
      font-size: 12px; color: var(--muted); margin-top: 4px;
      padding: 6px 10px; background: var(--surface);
      border-radius: 8px; border: 1px solid var(--border);
      display: inline-block;
    }
    .mprice-pack strong { color: var(--text); font-weight: 600; }
    .mprice-unit { font-size: 13px; color: var(--muted); margin: 0 4px; }

    /* ══ МОБИЛЬНЫЙ АДАПТИВ — перекрывает любой старый style.css ══ */

    /* Категории: 2 колонки на мобайле */
    @media (max-width: 768px) {
      .ggrid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 12px !important;
        margin-top: 14px !important;
      }
      /* Картинки карточки категории — макс высота */
      .gcard-thumb, .gcard-thumbs, .gcard-thumbs-grid, .gcard-icon {
        max-height: 150px !important;
        overflow: hidden !important;
      }
      /* 3 фото → показываем 2 */
      .gcard-thumbs img:nth-child(3) { display: none !important; }
    }

    @media (max-width: 480px) {
      .ggrid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 8px !important;
      }
      .gcard-title  { font-size: 12px !important; }
      .gcard-sub    { font-size: 11px !important; }
      .gcard-info   { padding: 8px 10px 4px !important; }
      .gcard-arrow  { padding: 0 10px 8px !important; }
      .gcard-thumb, .gcard-thumbs, .gcard-thumbs-grid, .gcard-icon {
        max-height: 120px !important;
      }
      /* 1 фото на маленьких */
      .gcard-thumbs img:nth-child(2),
      .gcard-thumbs img:nth-child(3) { display: none !important; }
      .gcard-thumbs img:nth-child(1) { flex: 1 !important; }

      /* Товарная сетка — 2 колонки */
      .pgrid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 8px !important;
      }
    }

    /* ══ МОДАЛ НА САФАРИ / МОБАЙЛ — специальный фикс ══ */
    @media (max-width: 768px) {
      /* Safari не понимает height:90vh на grid — переводим в flex */
      .modal {
        display: -webkit-flex !important;
        display: flex !important;
        -webkit-flex-direction: column !important;
        flex-direction: column !important;
        width: 100% !important;
        height: 92dvh !important;           /* dvh — учитывает адресную строку */
        max-height: 92dvh !important;
        border-radius: 18px 18px 0 0 !important;
        overflow: hidden !important;
        position: relative !important;
        /* Safari fix: убираем grid */
        grid-template-columns: unset !important;
        grid-template-rows: unset !important;
      }
      /* Галерея — фиксированная высота */
      .mgal {
        -webkit-flex: 0 0 auto !important;
        flex: 0 0 auto !important;
        height: 250px !important;
        min-height: 250px !important;
        max-height: 250px !important;
        width: 100% !important;
        overflow: hidden !important;
      }
      .mgal-track {
        height: 185px !important;
        -webkit-flex: 0 0 185px !important;
        flex: 0 0 185px !important;
        overflow-x: scroll !important;
        -webkit-overflow-scrolling: touch !important;
      }
      .mgal-slide {
        height: 185px !important;
        min-height: 185px !important;
        -webkit-flex-shrink: 0 !important;
        flex-shrink: 0 !important;
      }
      .mgal-slide img {
        max-height: 185px !important;
        width: auto !important;
        max-width: 100% !important;
        object-fit: contain !important;
      }
      .mgal-dots { bottom: 62px !important; }
      /* Миниатюры */
      .mthbs {
        -webkit-flex: 0 0 65px !important;
        flex: 0 0 65px !important;
        min-height: 65px !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
      }
      /* Инфо — занимает оставшееся место, скроллится */
      .minfo {
        -webkit-flex: 1 1 0 !important;
        flex: 1 1 0 !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
        max-height: none !important;
        padding: 16px 18px 32px !important;
      }
      /* Оверлей — снизу */
      .moverlay {
        -webkit-align-items: flex-end !important;
        align-items: flex-end !important;
        padding: 0 !important;
      }
    }

    @media (max-width: 480px) {
      .modal { height: 95dvh !important; max-height: 95dvh !important; }
      .mgal  { height: 220px !important; min-height: 220px !important; max-height: 220px !important; }
      .mgal-track { height: 155px !important; flex: 0 0 155px !important; }
      .mgal-slide { height: 155px !important; min-height: 155px !important; }
      .mgal-slide img { max-height: 155px !important; }
    }
  `;
  document.head.appendChild(s);
}

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
  setTimeout(checkAbandonedCart, 1500);
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
    const priceHint = minPrice > 0 ? ' · <span class="gcard-price">от ' + fmt(Math.round(minPrice * SALE_RATE)) + ' ₽</span>' : '';

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
    const priceHint = minPrice > 0 ? ' · <span class="gcard-price">от ' + fmt(Math.round(minPrice * SALE_RATE)) + ' ₽</span>' : '';

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
  // Фасет-фильтры (из умных фасетов)
  if (window._activeFacets) {
    for (const [key, val] of Object.entries(window._activeFacets)) {
      prods = prods.filter(p => p.features?.[key] === val);
    }
  }
  if (srchQ) {
    const q = srchQ.toLowerCase();
    prods = prods.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      JSON.stringify(p.features || {}).toLowerCase().includes(q));
  }
  prods = prods.filter(p => {
    const fp = Math.round(p.variants[0].price * SALE_RATE);
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

// ══ CALCULATOR ══════════════════════════════════════════════════════════════
function toggleCalc() {
  document.querySelector('.calc-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  calcUpdate('page');
}

function getCalcType() {
  const slug = activeCat?.slug || '';
  const name = (activeCat?.name || '').toLowerCase();
  const title = (window._calcModalProd?.title || '').toLowerCase();
  const combined = slug + ' ' + name + ' ' + title;

  if (/vodostok|водосто|gutter|жёлоб|желоб|труб/.test(combined))  return 'gutter';
  if (/uteplitel|изоляц|утеплит|rockwool|isover|izolyats/.test(combined)) return 'insulation';
  if (/samorez|саморез|крепёж|fastener|krepezh/.test(combined))   return 'screws';
  if (/sayding|сайдинг|fasad|фасад|panel|панел/.test(combined))   return 'siding';
  return 'roofing';
}

function getUnitFromVariant(v) {
  const name = (v?.sku_name || v?.name || '').toLowerCase();
  const pack = v?.pack_quantity;
  if (name.includes('м²') || name.includes('m2')) return 'm2';
  if (name.includes(' м') && !name.includes('мм')) return 'm';
  if (pack && pack > 1) return 'pack';
  return 'pcs';
}

function renderCalcPanel(ctx = 'page') {
  const type = getCalcType();
  const prod = ctx === 'modal' ? (window._calcModalProd || modalProd) : activeCat?.products[0];
  const variant = prod?.variants?.[window._calcModalVar || 0] || prod?.variants?.[0];
  const packQty = variant?.pack_quantity || 1;

  const titles = {
    roofing:    '🏗️ Калькулятор кровли',
    gutter:     '🌧️ Калькулятор водостока',
    insulation: '🧱 Калькулятор утеплителя',
    screws:     '🔩 Калькулятор саморезов',
    siding:     '🏠 Калькулятор фасада / сайдинга',
  };

  let fields = '';
  let resultHint = '';

  if (type === 'roofing') {
    fields =
      '<div class="calc-inp-wrap"><label>Длина ската, м</label><input class="calc-inp" type="number" id="c-len-' + ctx + '" value="10" min="1" step="0.1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Ширина ската, м</label><input class="calc-inp" type="number" id="c-wid-' + ctx + '" value="6" min="1" step="0.1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Количество скатов</label><input class="calc-inp" type="number" id="c-slopes-' + ctx + '" value="2" min="1" max="8" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Запас, %</label><input class="calc-inp" type="number" id="c-margin-' + ctx + '" value="10" min="0" max="30" oninput="calcUpdate(\'' + ctx + '\')"/></div>';
    resultHint = 'Площадь: <strong id="c-area-' + ctx + '">—</strong> &nbsp;·&nbsp; Нужно: <strong id="c-sheets-' + ctx + '">—</strong>';
  } else if (type === 'gutter') {
    fields =
      '<div class="calc-inp-wrap"><label>Периметр кровли, м</label><input class="calc-inp" type="number" id="c-perim-' + ctx + '" value="40" min="1" step="0.5" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Длина элемента, м</label><input class="calc-inp" type="number" id="c-gutter-len-' + ctx + '" value="3" min="1" step="0.5" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Запас, %</label><input class="calc-inp" type="number" id="c-margin-' + ctx + '" value="5" min="0" max="20" oninput="calcUpdate(\'' + ctx + '\')"/></div>';
    resultHint = 'Погонных метров: <strong id="c-area-' + ctx + '">—</strong> &nbsp;·&nbsp; Элементов: <strong id="c-sheets-' + ctx + '">—</strong>';
  } else if (type === 'insulation') {
    fields =
      '<div class="calc-inp-wrap"><label>Площадь, м²</label><input class="calc-inp" type="number" id="c-area-inp-' + ctx + '" value="60" min="1" step="1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Слоёв утеплителя</label><input class="calc-inp" type="number" id="c-layers-' + ctx + '" value="1" min="1" max="4" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Плит в упаковке</label><input class="calc-inp" type="number" id="c-pack-' + ctx + '" value="' + packQty + '" min="1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Запас, %</label><input class="calc-inp" type="number" id="c-margin-' + ctx + '" value="5" min="0" max="20" oninput="calcUpdate(\'' + ctx + '\')"/></div>';
    resultHint = 'Площадь: <strong id="c-area-' + ctx + '">—</strong> &nbsp;·&nbsp; Упаковок: <strong id="c-sheets-' + ctx + '">—</strong>';
  } else if (type === 'screws') {
    fields =
      '<div class="calc-inp-wrap"><label>Площадь кровли / фасада, м²</label><input class="calc-inp" type="number" id="c-area-inp-' + ctx + '" value="80" min="1" step="1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Расход, шт/м²</label><input class="calc-inp" type="number" id="c-per-m2-' + ctx + '" value="8" min="1" step="1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Штук в упаковке</label><input class="calc-inp" type="number" id="c-pack-' + ctx + '" value="' + (packQty > 1 ? packQty : 250) + '" min="1" oninput="calcUpdate(\'' + ctx + '\')"/></div>';
    resultHint = 'Штук: <strong id="c-area-' + ctx + '">—</strong> &nbsp;·&nbsp; Упаковок: <strong id="c-sheets-' + ctx + '">—</strong>';
  } else if (type === 'siding') {
    fields =
      '<div class="calc-inp-wrap"><label>Высота стены, м</label><input class="calc-inp" type="number" id="c-wall-h-' + ctx + '" value="3" min="1" step="0.1" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Периметр здания, м</label><input class="calc-inp" type="number" id="c-perim-' + ctx + '" value="40" min="1" step="0.5" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Проёмы (окна+двери), м²</label><input class="calc-inp" type="number" id="c-openings-' + ctx + '" value="15" min="0" step="0.5" oninput="calcUpdate(\'' + ctx + '\')"/></div>' +
      '<div class="calc-inp-wrap"><label>Запас, %</label><input class="calc-inp" type="number" id="c-margin-' + ctx + '" value="10" min="0" max="30" oninput="calcUpdate(\'' + ctx + '\')"/></div>';
    resultHint = 'Площадь: <strong id="c-area-' + ctx + '">—</strong> &nbsp;·&nbsp; Панелей: <strong id="c-sheets-' + ctx + '">—</strong>';
  }

  return (
    '<div class="calc-panel">' +
      '<h3>' + (titles[type] || '🧮 Калькулятор') + '</h3>' +
      '<div class="calc-grid">' + fields + '</div>' +
      '<div class="calc-result">' +
        '<div class="cres-text">' + resultHint + '</div>' +
        '<button class="calc-addbtn" id="c-btn-' + ctx + '" onclick="calcAddToCart(\'' + ctx + '\')">+ Добавить в корзину</button>' +
      '</div>' +
    '</div>'
  );
}

function calcUpdate(ctx = 'page') {
  // ── Guard: элементы калькулятора ещё не вставлены — ждём следующего фрейма
  if (!document.getElementById('c-sheets-' + ctx)) {
    requestAnimationFrame(() => calcUpdate(ctx));
    return;
  }

  const type    = getCalcType();
  const prod    = ctx === 'modal'
                  ? (window._calcModalProd || modalProd)
                  : activeCat?.products[0];
  const variant = prod?.variants?.[window._calcModalVar || 0] || prod?.variants?.[0];

  let area = 0, qty = 0;

  if (type === 'roofing') {
    const len    = parseFloat(document.getElementById('c-len-'    + ctx)?.value) || 10;
    const wid    = parseFloat(document.getElementById('c-wid-'    + ctx)?.value) || 6;
    const slopes = parseInt  (document.getElementById('c-slopes-' + ctx)?.value) || 2;
    const margin = parseFloat(document.getElementById('c-margin-' + ctx)?.value) || 10;
    area = len * wid * slopes * (1 + margin / 100);
    const unitM2 = parseFloat(
      (variant?.sku_name || '').match(/(\d+[.,]\d+)\s*м²/)?.[1]
    ) || 0.9;
    qty = Math.ceil(area / unitM2);

  } else if (type === 'gutter') {
    const perim   = parseFloat(document.getElementById('c-perim-'      + ctx)?.value) || 40;
    const elemLen = parseFloat(document.getElementById('c-gutter-len-' + ctx)?.value) || 3;
    const margin  = parseFloat(document.getElementById('c-margin-'     + ctx)?.value) || 5;
    area = perim * (1 + margin / 100);
    qty  = Math.ceil(area / elemLen);

  } else if (type === 'insulation') {
    const areaInp = parseFloat(document.getElementById('c-area-inp-' + ctx)?.value) || 60;
    const layers  = parseInt  (document.getElementById('c-layers-'   + ctx)?.value) || 1;
    const packSz  = parseFloat(document.getElementById('c-pack-'     + ctx)?.value) || (variant?.pack_quantity || 1);
    const margin  = parseFloat(document.getElementById('c-margin-'   + ctx)?.value) || 5;
    area = areaInp * layers * (1 + margin / 100);
    const plateM2 = parseFloat(
      (variant?.sku_name || '').match(/(\d+[.,]\d+)\s*м²/)?.[1]
    ) || 0.48;
    qty = Math.ceil(Math.ceil(area / plateM2) / packSz);

  } else if (type === 'screws') {
    const areaInp = parseFloat(document.getElementById('c-area-inp-' + ctx)?.value) || 80;
    const perM2   = parseFloat(document.getElementById('c-per-m2-'  + ctx)?.value) || 8;
    const packSz  = parseFloat(document.getElementById('c-pack-'    + ctx)?.value) || 250;
    area = areaInp * perM2;
    qty  = Math.ceil(area / packSz);

  } else if (type === 'siding') {
    const wallH    = parseFloat(document.getElementById('c-wall-h-'   + ctx)?.value) || 3;
    const perim    = parseFloat(document.getElementById('c-perim-'    + ctx)?.value) || 40;
    const openings = parseFloat(document.getElementById('c-openings-' + ctx)?.value) || 15;
    const margin   = parseFloat(document.getElementById('c-margin-'   + ctx)?.value) || 10;
    area = (wallH * perim - openings) * (1 + margin / 100);
    const panelM2 = parseFloat(
      (variant?.sku_name || '').match(/(\d+[.,]\d+)\s*м²/)?.[1]
    ) || 0.72;
    qty = Math.ceil(area / panelM2);
  }

  const aEl = document.getElementById('c-area-'   + ctx);
  const sEl = document.getElementById('c-sheets-' + ctx);
  const unitLabel = type === 'screws' ? ' шт.' : (type === 'gutter' ? ' м' : ' м²');

  if (aEl) aEl.textContent = (type === 'screws' ? Math.round(area) : area.toFixed(1)) + unitLabel;
  if (sEl) sEl.textContent = qty + (type === 'insulation' || type === 'screws' ? ' уп.' : ' шт.');

  if (ctx === 'page') window._calcSheetsPage  = qty;
  else                window._calcSheetsModal = qty;
}


function calcAddToCart(ctx = 'page') {
  calcUpdate(ctx);
  const p = ctx === 'modal' ? (window._calcModalProd || modalProd) : activeCat?.products[0];
  const varIdx = (ctx === 'modal' ? window._calcModalVar : 0) || 0;
  if (!p) { toast('Выберите категорию товаров для расчёта', 'error'); return; }

  const v = p.variants[varIdx] || p.variants[0];
  const fp = Math.round(v.price * SALE_RATE);
  const sheets = (ctx === 'modal' ? window._calcSheetsModal : window._calcSheetsPage) || 1;
  const varLabel = v.sku_name || v.color || '';
  const titleLabel = p.title + (varLabel ? ' (' + varLabel + ')' : '') + ' × ' + sheets + ' шт.';

  addToCart({ sku: v.sku, title: titleLabel, price: fp, img: (v.images || [])[0] || '', qty: sheets });

  const b = document.getElementById('c-btn-' + ctx);
  if (b) {
    b.textContent = '✓ Добавлено!';
    b.style.background = 'var(--success)';
    setTimeout(() => { b.textContent = '+ Добавить в корзину'; b.style.background = ''; }, 1800);
  }
}

// ══ RENDER PRODUCTS ════════════════════════════════════════════════════════
// ══ RENDER PRODUCTS ════════════════════════════════════════════════════════
function renderProducts() {
  const content = document.getElementById('content');
  if (!activeCat) { content.innerHTML = '<div class="loading">Выберите категорию</div>'; return; }

  const prods    = getFilteredProducts();
  const total    = activeCat.products.length;
  const maxP     = Math.max(...(activeCat.products || []).map(p => Math.round(p.variants[0].price * SALE_RATE) || 0), 0);
  const allColors = [...new Set(
    (activeCat.products || []).flatMap(p => p.variants.map(v => v.color || v.sku_name || '')).filter(Boolean)
  )];

  const KNOWN_BRANDS = ['Технониколь','Docke','Ranilla','Rockwool','ISOVER','Grand Line','Металл Профиль','Изоспан','Ондулин'];
  const allBrands = [...new Set(
    (activeCat.products || []).map(p => {
      if (p.features?.['Производитель']) return p.features['Производитель'];
      const found = KNOWN_BRANDS.find(b => p.title.toLowerCase().includes(b.toLowerCase()));
      return found || null;
    }).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ru'));

  // ── Breadcrumb ─────────────────────────────────────────────────────────
  const groupEntry = Object.entries(catalog.groups || {}).find(([, g]) => g.categories.includes(activeCat.slug));
  let breadcrumb = '<div class="breadcrumb"><span class="bc-item bc-link" onclick="goHome()">Каталог</span>';
  if (groupEntry) {
    breadcrumb += '<span class="bc-sep">›</span>' +
      '<span class="bc-item bc-link" onclick="goToGroup(\'' + groupEntry[0] + '\')">' + groupEntry[1].name + '</span>';
  }
  breadcrumb += '<span class="bc-sep">›</span><span class="bc-item bc-cur">' + activeCat.name + '</span></div>';

  // ── Hero ───────────────────────────────────────────────────────────────
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

  // ── Calculator (всегда открыт) ─────────────────────────────────────────
  const calcHtml = renderCalcPanel('page');

  // ── Фильтр-бар ────────────────────────────────────────────────────────
  const sortOpts = [
    ['default','По умолчанию'],['price_asc','Цена ↑'],['price_desc','Цена ↓'],['name','По названию']
  ].map(([v, l]) =>
    '<option value="' + v + '"' + (filters.sort === v ? ' selected' : '') + '>' + l + '</option>'
  ).join('');

  const colorOpts = allColors.map(c =>
    '<option value="' + c + '"' + (filters.color === c ? ' selected' : '') + '>' + c + '</option>'
  ).join('');

  const priceVal = filters.maxPrice >= 99999 ? 'Любая' : fmt(filters.maxPrice) + ' ₽';
  const rangeMax = maxP || 10000;
  const rangeVal = Math.min(filters.maxPrice, rangeMax);

  const fbarHtml =
    '<div class="fbar">' +
      '<button class="fchip ' + (filterOpen ? 'active' : '') + '" onclick="toggleFilter()">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
          '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>Фильтры' +
      '</button>' +
      '<select class="sort-sel" onchange="applySort(this.value)">' + sortOpts + '</select>' +
      (filters.color ? '<button class="fchip active" onclick="clearColor()">Цвет: ' + filters.color + ' ✕</button>' : '') +
      (filters.brand ? '<button class="fchip active" onclick="applyBrand(\'\')">🏷 ' + filters.brand + ' ✕</button>' : '') +
      '<span class="rcnt">Найдено: ' + prods.length + '</span>' +
    '</div>' +
    '<div class="fpanel ' + (filterOpen ? 'open' : '') + '">' +
      '<div class="fpanel-grid">' +
        '<div><label>Цена, ₽</label>' +
          '<input type="range" min="0" max="' + rangeMax + '" step="100" value="' + rangeVal + '"' +
            ' oninput="updatePriceFilter(this.value,' + rangeMax + ')"/>' +
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

  // ── Brand bar ──────────────────────────────────────────────────────────
  const brandBarHtml = allBrands.length
    ? '<div class="brand-bar">' +
        '<button class="brand-btn' + (!filters.brand ? ' active' : '') + '" onclick="applyBrand(\'\')">Все</button>' +
        allBrands.map(b => {
          const cnt = (activeCat.products || []).filter(p => {
            const fb = (p.features?.['Производитель'] || '').toLowerCase();
            return fb.includes(b.toLowerCase()) || p.title.toLowerCase().includes(b.toLowerCase());
          }).length;
          return '<button class="brand-btn' + (filters.brand === b ? ' active' : '') + '" onclick="applyBrand(\'' + b + '\')">' +
            b + ' <span class="brand-count">' + cnt + '</span></button>';
        }).join('') +
      '</div>'
    : '';

  // ── Пустой результат ──────────────────────────────────────────────────
  if (!prods.length) {
    content.innerHTML = breadcrumb + heroHtml + calcHtml + fbarHtml + brandBarHtml +
      '<div class="loading">Ничего не найдено</div>';
    // calcUpdate в RAF — элементы точно уже в DOM
    requestAnimationFrame(() => calcUpdate('page'));
    return;
  }

  // ── Trust bar ──────────────────────────────────────────────────────────
  const trustHtml =
    '<div class="trust-bar">' +
      '<div class="trust-item"><span>🚚</span><div><strong>Доставка завтра</strong><span>по Раменскому и области</span></div></div>' +
      '<div class="trust-item"><span>✅</span><div><strong>Гарантия качества</strong><span>официальные дилеры брендов</span></div></div>' +
      '<div class="trust-item"><span>📞</span><div><strong>Консультация бесплатно</strong><span>' + CONTACT_CFG.phone + '</span></div></div>' +
      '<div class="trust-item"><span>🏷</span><div><strong>Цены ниже рынка</strong><span>работаем без посредников</span></div></div>' +
    '</div>';

  const ordersToday = 8 + (new Date().getHours() % 7);
  const socialProofHtml =
    '<div class="social-proof">🔥 Сегодня оформлено <strong>' + ordersToday +
    ' заказов</strong> · Последний — ' + getLastOrderTime() + '</div>';

  // ── Loyalty banner (вставляется между карточками) ──────────────────────
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

  // ── Карточки товаров ───────────────────────────────────────────────────
  const cardElements = prods.map(p => {
    const v   = p.variants[0];
    const fp  = Math.round(v.price * SALE_RATE);
    const img = (v.images && v.images[0])
      ? '<img src="' + v.images[0] + '" alt="' + p.title + '" loading="lazy"' +
          ' onerror="this.parentElement.innerHTML=\'<div class=ph>📦</div>\'">'
      : '<div class="ph">📦</div>';

    const pr = v.price > 0
      ? '<span class="pp">' + fmt(fp) + ' ₽</span><span class="pop">' + fmt(v.price) + ' ₽</span>'
      : '<span class="pp" style="font-size:12px;color:var(--muted)">По запросу</span>';

    const vl = p.variants.length > 1
      ? '<div class="pvars"><div class="pvars-dot"></div>' + p.variants.length + ' вариантов</div>'
      : '';

    const prodBrand = p.features?.['Производитель']
      || KNOWN_BRANDS.find(b => p.title.toLowerCase().includes(b.toLowerCase()))
      || null;
    const brandTag = prodBrand
      ? '<div class="pcard-brand" onclick="event.stopPropagation();applyBrand(\'' + prodBrand + '\')" title="Фильтровать по бренду">' + prodBrand + '</div>'
      : '';

    const stockSeed = p.id.charCodeAt(0) + (p.id.charCodeAt(2) || 0);
    const stockQty  = 3 + (stockSeed % 9);
    const viewsSeed = (p.id.charCodeAt(1) || 5) + (p.id.charCodeAt(3) || 3);
    const viewsNow  = 2 + (viewsSeed % 7);
    const stockHtml = v.price > 0
      ? '<div class="pcard-stock"><span class="stock-dot"></span>Осталось ' + stockQty +
        ' шт · <span class="views-now">👁 ' + viewsNow + ' смотрят</span></div>'
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
          stockHtml +
        '</div>' +
        '<button class="addbtn" id="ab-' + p.id + '" onclick="event.stopPropagation();quickAdd(\'' + p.id + '\')">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
            '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          'В корзину' +
        '</button>' +
        '<button class="one-click-btn" onclick="event.stopPropagation();oneClickBuy(\'' + p.id + '\')" title="Купить в 1 клик">' +
          '⚡ 1 клик' +
        '</button>' +
      '</div>'
    );
  });

  // Вставляем баннер лояльности между карточками
  if (cardElements.length > 4)  cardElements.splice(4,  0, loyaltyBanner);

  // ── Финальная сборка HTML ──────────────────────────────────────────────
  content.innerHTML =
    breadcrumb +
    heroHtml +
    trustHtml +
    socialProofHtml +
    calcHtml +
    fbarHtml +
    brandBarHtml +
    '<div class="pgrid">' + cardElements.join('') + '</div>';

  // ── Пост-рендер: всё DOM-зависимое в одном RAF ─────────────────────────
  // (calcUpdate с RAF-guard в самой функции, но здесь явно ждём фрейма)
  requestAnimationFrame(() => {

    // 1. Калькулятор — инициализируем после того как DOM точно готов
    calcUpdate('page');

    // 2. Фасеты — вставляем перед .pgrid
    const pgrid = content.querySelector('.pgrid');
    if (pgrid) {
      document.getElementById('facets-bar')?.remove();
      const facetsHtml = buildFacetsHtml();
      if (facetsHtml) {
        const tmp = document.createElement('div');
        tmp.innerHTML = facetsHtml;
        content.insertBefore(tmp.firstChild, pgrid);
      }
    }

    // 3. История просмотров — внизу страницы
    document.getElementById('history-block')?.remove();
    const histHtml = buildHistoryHtml();
    if (histHtml) {
      const wrap = document.createElement('div');
      wrap.id = 'history-block';
      wrap.innerHTML = histHtml;
      content.appendChild(wrap);
    }

  }); // end requestAnimationFrame
}


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

  const price = Math.round((variant.price || 0) * SALE_RATE);

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
  window._calcModalProd = modalProd;
  window._calcModalVar = 0;
  addToHistory(id);
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
  _modalCalcOpen = false;
  window._calcModalProd = null;
}

function handleMovl(e) { if (e.target === document.getElementById('movl')) closeMod(); }

// ══ AUTO DESCRIPTION GENERATOR ═════════════════════════════════════════════
// Генерирует читаемое описание из характеристик товара, если описание отсутствует в каталоге
function buildAutoDescription(p, v) {
  const feats = p.features || {};
  const parts = [];

  // Название товара как основа
  const title = p.title || '';

  // Производитель / бренд
  const brand = feats['Производитель'] || feats['Бренд'] || '';
  if (brand) parts.push('Производитель: ' + brand + '.');

  // Материал / тип
  const mat = feats['Материал'] || feats['Тип'] || feats['Вид'] || '';
  if (mat) parts.push('Материал: ' + mat + '.');

  // Покрытие
  const cover = feats['Покрытие'] || feats['Тип покрытия'] || '';
  if (cover) parts.push('Покрытие: ' + cover + '.');

  // Размеры
  const dims = [
    feats['Длина'] ? 'длина ' + feats['Длина'] : '',
    feats['Ширина'] ? 'ширина ' + feats['Ширина'] : '',
    feats['Толщина'] ? 'толщина ' + feats['Толщина'] : '',
    feats['Высота'] ? 'высота ' + feats['Высота'] : '',
    feats['Диаметр'] ? 'диаметр ' + feats['Диаметр'] : '',
  ].filter(Boolean);
  if (dims.length) parts.push('Размеры: ' + dims.join(', ') + '.');

  // Упаковка
  const pack = feats['В упаковке'] || feats['Кол-во в упаковке'] || (v && v.pack_quantity > 1 ? v.pack_quantity + ' шт./уп.' : '');
  if (pack) parts.push('В упаковке: ' + pack + '.');

  // Цвет из варианта
  const color = (v && (v.color || v.sku_name)) || feats['Цвет'] || '';
  if (color) parts.push('Цвет: ' + color + '.');

  // Страна производства
  const country = feats['Страна производства'] || feats['Производство'] || feats['Страна'] || '';
  if (country) parts.push('Производство: ' + country + '.');

  // Применение / назначение
  const use = feats['Назначение'] || feats['Применение'] || feats['Область применения'] || '';
  if (use) parts.push('Применение: ' + use + '.');

  // Гарантия
  const guarantee = feats['Гарантия'] || feats['Срок службы'] || '';
  if (guarantee) parts.push('Гарантия: ' + guarantee + '.');

  if (!parts.length) {
    // Минимальное описание если совсем нет характеристик
    return title + ' — кровельный материал от проверенных производителей. Доставка по России.';
  }

  return title + '. ' + parts.join(' ') + ' Купить с доставкой по России в PLATFORMA.';
}

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

  const fp = Math.round(v.price * SALE_RATE);
  // Цена за упаковку (если pack_quantity > 1)
  const packQtyModal = v.pack_quantity > 1 ? v.pack_quantity : null;
  const fpPack = packQtyModal ? Math.round(v.price * packQtyModal * SALE_RATE) : null;
  // Единица измерения: м², м или шт
  const packUnit = (() => {
    const f = p.features || {};
    const inPack = f['В упаковке, м2'] || f['В упаковке м2'] || f['В упаковке, м²'];
    if (inPack) return inPack + ' м²';
    if (packQtyModal) return packQtyModal + ' шт.';
    return null;
  })();
  const pricePerUnit = packUnit
    ? '<div class="mprice-pack">За упаковку (' + packUnit + '): <strong>' + fmt(fpPack) + ' ₽</strong></div>'
    : '';
  const pr = v.price > 0
    ? '<span class="mprice">' + fmt(fp) + ' ₽</span>' +
      (packUnit ? '<span class="mprice-unit">/ ' + (packUnit.includes('м²') ? 'м²' : 'шт.') + '</span>' : '') +
      '<span class="mop">' + fmt(v.price) + ' ₽</span><span class="m-disc-tag">−7%</span>'
    : '<span class="mprice" style="font-size:16px;color:var(--muted)">Цена по запросу</span>';

  const vars = p.variants.length > 1
    ? '<div><div class="vlabel">Вариант</div><div class="vlist">' +
        p.variants.map((vv, i) =>
          '<button class="vbtn ' + (i === modalVar ? 'active' : '') + '" onclick="selVar(' + i + ')">' + (vv.sku_name || vv.color || vv.sku) + '</button>'
        ).join('') +
      '</div></div>'
    : '';

  // Описание: берём из каталога или генерируем из характеристик
  const descText = p.description || buildAutoDescription(p, v);
  const desc = descText
    ? '<div><div class="vlabel" style="margin-bottom:5px">Описание</div><div class="mdesc">' + descText + '</div></div>'
    : '';

  const feats = Object.keys(p.features || {}).slice(0, 10);
  const featHtml = feats.length
    ? '<div><div class="vlabel" style="margin-bottom:7px">Характеристики</div><div class="fgrid">' +
        feats.map(k => '<div class="frow"><div class="fkey">' + k + '</div><div class="fval">' + p.features[k] + '</div></div>').join('') +
      '</div></div>'
    : '';

  const packNote = ''; // убрано — упаковка показана через pricePerUnit
  const productSlug = (p.id || '').split('--').pop() || p.id;
  const shareUrl = location.origin + location.pathname + '?cat=' + (activeCat?.slug || '') + '&product=' + encodeURIComponent(productSlug);

  document.getElementById('minfo').innerHTML =
    '<div class="mtitle">' + p.title + '</div>' +
    '<div class="msku">Арт. ' + v.sku + '</div>' +
    '<div class="mpb">' + pr + '</div>' + pricePerUnit +
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
    '<div id="modal-calc-wrap"></div>' +
    '<div class="modal-btn-row">' +
      '<button class="madd" onclick="addFromModal()">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        'В корзину' +
      '</button>' +
      '<button class="mcalc-toggle" onclick="toggleModalCalc()" title="Открыть калькулятор">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/></svg>' +
        'Калькулятор' +
      '</button>' +
      '<button class="cmp-btn" onclick="toggleCompare(\'' + p.id + '\',event)" data-cmp-id="' + p.id + '">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
        'Сравнить' +
      '</button>' +
    '</div>' +
    // Wholesale hint
    '<div id="wholesale-hint" style="font-size:12px;margin-top:4px;min-height:16px"></div>' +
    // Cross-sell (рендерим после)
    '<div id="modal-cross-sell"></div>';

  // Добавляем кнопку избранного
  const mmod = document.getElementById('mmod');
  if (mmod) {
    mmod.style.position = 'relative';
    const existFav = mmod.querySelector('.fav-btn');
    if (!existFav) {
      const favWrap = document.createElement('div');
      favWrap.style.cssText = 'position:absolute;top:12px;right:12px;z-index:10';
      favWrap.innerHTML = favBtnHtml(p.id);
      mmod.appendChild(favWrap);
    }
  }

  // Cross-sell
  setTimeout(() => {
    const cs = document.getElementById('modal-cross-sell');
    if (cs && activeCat) cs.innerHTML = buildCrossSellHtml(activeCat.slug);
    // Wholesale hint
    updateWholesaleHint();
    // Сравнение — обновляем состояние кнопки
    const cmpBtn = document.querySelector('[data-cmp-id="' + p.id + '"]');
    if (cmpBtn && getCompare().includes(p.id)) cmpBtn.classList.add('cmp-active');
  }, 0);
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

function selVar(i) { modalVar = i; modalImg = 0; window._calcModalVar = i; renderModal(); }

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
  const fp = Math.round(v.price * SALE_RATE);
  addToCart({ sku: v.sku, title: modalProd.title + (v.color ? ' (' + v.color + ')' : ''), price: fp, img: (v.images || [])[0] || '', qty: modalQty });
  closeMod();
  openCart();
}

let _modalCalcOpen = false;
function toggleModalCalc() {
  _modalCalcOpen = !_modalCalcOpen;
  const wrap = document.getElementById('modal-calc-wrap');
  if (!wrap) return;
  if (_modalCalcOpen) {
    window._calcModalProd = modalProd;
    window._calcModalVar  = modalVar;
    wrap.innerHTML = renderCalcPanel('modal');
    calcUpdate('modal');
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const btn = document.querySelector('.mcalc-toggle');
    if (btn) btn.classList.add('active');
  } else {
    wrap.innerHTML = '';
    const btn = document.querySelector('.mcalc-toggle');
    if (btn) btn.classList.remove('active');
  }
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
  const fp = Math.round(v.price * SALE_RATE);
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
  setFloatVisibility(false);                     // ← скрываем виджет
}

function closeCart() {
  document.getElementById('covl').style.display = 'none';
  document.getElementById('cpanel').style.display = 'none';
  document.body.style.overflow = '';
  setFloatVisibility(true);                      // ← возвращаем виджет
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
  // Закрываем панель корзины напрямую (без setFloatVisibility)
  document.getElementById('covl').style.display  = 'none';
  document.getElementById('cpanel').style.display = 'none';
  checkoutFormState = {};
  renderCheckout();
  document.getElementById('covl2').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setFloatVisibility(false);                     // ← виджет остаётся скрытым
}

function closeCheckout() {
  checkoutFormState = {};
  document.getElementById('covl2').style.display = 'none';
  document.body.style.overflow = '';
  setFloatVisibility(true);                      // ← возвращаем виджет
}

function openProd(id) {
  modalProd = findProd(id);
  if (!modalProd) return;
  modalVar = 0; modalImg = 0; modalQty = 1;
  window._calcModalProd = modalProd;
  window._calcModalVar  = 0;
  addToHistory(id);
  renderModal();
  document.getElementById('movl').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const urlSlug = (modalProd.id || id).split('--').pop();
  setURLParam('product', urlSlug);
  setFloatVisibility(false);                     // ← добавить
}

function closeMod() {
  document.getElementById('movl').style.display = 'none';
  document.body.style.overflow = '';
  removeURLParam('product');
  _modalCalcOpen = false;
  window._calcModalProd = null;
  setFloatVisibility(true);                      // ← добавить
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
      '<div style="font-size:10px;color:var(--muted);margin-bottom:8px;line-height:1.4">Нажимая «Отправить заказ», вы соглашаетесь с <a href="/privacy.html" target="_blank" style="color:var(--muted)">политикой обработки персональных данных</a> в соответствии с ФЗ-152</div>' +
      '<button class="co-submit" onclick="submitOrder()">Отправить заказ</button>' +
    '</div>';

  // Запускаем виджет если выбран ПВЗ
  if (deliveryMethod === 'pvz') {
    initYaWidget();
  }
  setTimeout(watchCheckoutPhone, 100);
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
  // config.js объявляет через const — они не попадают в window, читаем напрямую
  const _TG_TOKEN = (typeof TG_TOKEN !== 'undefined' && typeof TG_TOKEN === 'string') ? TG_TOKEN : (window.TG_TOKEN || ''  );
  const _TG_CHAT  = (typeof TG_CHAT_ID !== 'undefined' && typeof TG_CHAT_ID === 'string') ? TG_CHAT_ID : (window.TG_CHAT_ID || '' );
  const TG_CHAT   = _TG_CHAT;

    const itemsList = order.items.map(i =>
    '  • ' + tgEsc(i.title) + ' × ' + i.qty + ' — ' +
    (i.price > 0 ? fmt(i.price * i.qty) + ' ₽' : 'по запросу')
  ).join('\n');

  const tgText = [
    '🛒 *Новый заказ PLATFORMA*', '',
    '👤 *Имя:* '     + tgEsc(order.name),
    '📞 *Телефон:* ' + tgEsc(order.phone),
    order.email   ? '📧 *Email:* '   + tgEsc(order.email)   : null,
    '',
    '🚚 *Доставка:* ' + (order.delivery_method === 'pvz' ? 'Пункт выдачи' : 'Курьер'),
    '📍 *Адрес:* '   + tgEsc(order.address || '—'),
    order.pvz_id  ? '🔖 *ID ПВЗ:* '  + tgEsc(String(order.pvz_id)) : null,
    '',
    '*Состав заказа:*',
    itemsList, '',
    '💰 *Итого:* '   + fmt(order.final_total) + ' ₽',
    order.loyalty_deducted > 0
      ? '💳 *Списано с карты:* ' + fmt(order.loyalty_deducted) + ' ₽' : null,
    order.comment
      ? '💬 *Комментарий:* ' + tgEsc(order.comment) : null,
    order.callback_requested ? '📲 *Просит перезвонить*' : null,
    '',
    '🕐 ' + new Date().toLocaleString('ru-RU'),
  ].filter(Boolean).join('\n');

  await sendTG(tgText);


  try {
    await fetch(`https://api.telegram.org/bot${_TG_TOKEN}/sendMessage`, {
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
  cart = []; saveCart(); updateBadge(); clearAbandonedCart();
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
      const fp = Math.round(v.price * SALE_RATE);
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
    const fp = Math.round(v.price * SALE_RATE);
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
      const discountedPrice = Math.round(v.price * SALE_RATE);
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
  const prices = product.variants.filter(v => v.price > 0).map(v => Math.round(v.price * SALE_RATE));
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
      "price": Math.round((product.variants?.[0]?.price || 0) * SALE_RATE),
      "priceCurrency": "RUB",
      "availability": "https://schema.org/InStock",
      "url": "https://platforma-pro.vercel.app/"
    }
  };
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

// ── Float widget: скрываем когда открыта любая панель/модал ────────────────
function setFloatVisibility(show) {
  const el = document.getElementById('float-cta');
  if (!el) return;
  el.style.display = show ? '' : 'none';
  if (!show && typeof closeCallbackForm === 'function') closeCallbackForm();
}

// ══ FLOATING CONTACT WIDGET ════════════════════════════════════════════════
// Конфиг: замени номер телефона и ссылку WA на свои
const CONTACT_CFG = {
  phone:     '+79332033005',          // номер для звонка и WA
  wa:        'https://wa.me/79332033005', // ссылка WhatsApp (можно добавить ?text=...)
  tg:        'https://t.me/bot_pumpdump_bot', // Telegram менеджера
  workHours: '9:00–18:00',
};

function buildFloatWidget() {
  if (document.getElementById('float-cta')) return;

  // CSS
  const style = document.createElement('style');
  style.textContent = `
    #float-cta {
      position: fixed; bottom: 24px; right: 20px; z-index: 9999;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }
    .fcta-btn {
      width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,.18); transition: transform .18s, box-shadow .18s;
      flex-shrink: 0;
    }
    .fcta-btn:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,.24); }
    .fcta-btn svg { width: 26px; height: 26px; }
    .fcta-main { background: #192C1E; }
    .fcta-wa   { background: #25D366; }
    .fcta-tg   { background: #229ED9; }
    .fcta-phone{ background: #192C1E; }
    .fcta-sub  {
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      transition: opacity .22s, transform .22s;
    }
    .fcta-sub.hidden { opacity: 0; pointer-events: none; transform: translateY(10px); }
    .fcta-label {
      display: flex; align-items: center; gap: 8px;
    }
    .fcta-tip {
      background: var(--panel, #fff); color: var(--text, #111);
      font-size: 12px; padding: 5px 10px; border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,.12); white-space: nowrap;
      border: 1px solid var(--border, #e5e5e5);
    }
    /* Форма обратного звонка */
    #callback-form {
      position: fixed; bottom: 90px; right: 20px; z-index: 10000;
      background: var(--panel, #fff); border: 1px solid var(--border,#ddd);
      border-radius: 16px; padding: 20px; width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,.16);
      animation: slideUpIn .22s ease;
    }
    @keyframes slideUpIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:none; } }
    #callback-form h4 {
      margin: 0 0 4px; font-size: 15px; font-weight: 600;
      color: var(--text,#111); font-family: var(--fh, sans-serif);
    }
    #callback-form p { margin: 0 0 14px; font-size: 12px; color: var(--muted,#888); }
    #callback-form input {
      width: 100%; padding: 10px 12px; border-radius: 9px;
      border: 1px solid var(--border,#ddd); background: var(--bg,#fafafa);
      color: var(--text,#111); font-size: 14px; margin-bottom: 10px;
      box-sizing: border-box;
    }
    #callback-form input:focus { outline: none; border-color: #192C1E; }
    .cb-submit {
      width: 100%; padding: 11px; border-radius: 9px;
      background: #192C1E; color: #fff; border: none;
      font-size: 14px; font-weight: 600; cursor: pointer;
      transition: opacity .15s;
    }
    .cb-submit:hover { opacity: .88; }
    .cb-close-x {
      position: absolute; top: 12px; right: 14px;
      background: none; border: none; font-size: 18px;
      color: var(--muted,#888); cursor: pointer; line-height: 1;
    }
    /* Пульс на главной кнопке при первом показе */
    @keyframes pulse { 0%,100%{box-shadow:0 4px 16px rgba(0,0,0,.18)} 50%{box-shadow:0 4px 28px rgba(25,44,30,.55)} }
    .fcta-main.pulse { animation: pulse 1.8s ease-in-out 3; }
    /* Онлайн-индикатор */
    .fcta-online {
      position: absolute; top: 3px; right: 3px;
      width: 12px; height: 12px; border-radius: 50%;
      background: #4CAF50; border: 2px solid #fff;
    }
    /* Бейдж на кнопке если офлайн */
    .fcta-offline { background: #aaa !important; }
  `;
  document.head.appendChild(style);

  // Определяем рабочие часы
  function isOnline() {
    const h = new Date().getHours();
    return h >= 9 && h < 20;
  }
  const online = isOnline();

  // HTML виджета
  const wrap = document.createElement('div');
  wrap.id = 'float-cta';
  wrap.innerHTML = `
    <div class="fcta-sub hidden" id="fcta-sub">
      <div class="fcta-label">
        <span class="fcta-tip">Написать в Telegram</span>
        <button class="fcta-btn fcta-tg" onclick="window.open('${CONTACT_CFG.tg}','_blank')" aria-label="Telegram">
          <svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.92c-.13.57-.47.71-.94.44l-2.6-1.92-1.26 1.21c-.14.14-.26.26-.53.26l.19-2.67 4.87-4.4c.21-.19-.05-.29-.33-.1L7.7 14.47 5.14 13.7c-.55-.17-.56-.55.12-.82l10.43-4.02c.46-.17.86.11.95.94z"/></svg>
        </button>
      </div>
      <div class="fcta-label">
        <span class="fcta-tip">${online ? 'Заказать звонок' : 'Звонок (работаем ' + CONTACT_CFG.workHours + ')'}</span>
        <button class="fcta-btn fcta-phone ${online ? '' : 'fcta-offline'}" onclick="openCallbackForm()" aria-label="Заказать обратный звонок">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 011.05 2.18 2 2 0 013 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L7.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
        </button>
      </div>
    </div>
    <div style="position:relative">
      ${online ? '<div class="fcta-online"></div>' : ''}
      <button class="fcta-btn fcta-main pulse" id="fcta-toggle" onclick="toggleFloatMenu()" aria-label="Связаться с нами">
        <svg id="fcta-icon-chat" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <svg id="fcta-icon-x" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" style="display:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(wrap);

  // Пульс через 3 сек после загрузки, чтобы не мешал первым впечатлениям
  setTimeout(() => {
    const btn = document.getElementById('fcta-toggle');
    if (btn) btn.classList.add('pulse');
  }, 3000);
}

let _floatOpen = false;
function toggleFloatMenu() {
  _floatOpen = !_floatOpen;
  const sub = document.getElementById('fcta-sub');
  const iconChat = document.getElementById('fcta-icon-chat');
  const iconX    = document.getElementById('fcta-icon-x');
  if (!sub) return;
  sub.classList.toggle('hidden', !_floatOpen);
  if (iconChat) iconChat.style.display = _floatOpen ? 'none' : '';
  if (iconX)    iconX.style.display    = _floatOpen ? '' : 'none';
  const btn = document.getElementById('fcta-toggle');
  if (btn) { btn.classList.remove('pulse'); btn.style.background = _floatOpen ? '#444' : '#192C1E'; }
}

function openCallbackForm() {
  if (document.getElementById('callback-form')) return;
  const form = document.createElement('div');
  form.id = 'callback-form';
  const online = new Date().getHours() >= 9 && new Date().getHours() < 20;
  form.innerHTML = `
    <button class="cb-close-x" onclick="closeCallbackForm()">✕</button>
    <h4>Перезвоним вам</h4>
    <p>${online ? 'Обычно перезваниваем за 5–10 минут' : 'Перезвоним в рабочее время (' + CONTACT_CFG.workHours + ')'}</p>
    <input type="tel" id="cb-phone" placeholder="+7 (___) ___-__-__" />
    <input type="text" id="cb-name"  placeholder="Ваше имя" />
    <button class="cb-submit" onclick="submitCallback()">Перезвоните мне</button>
    <p style="font-size:10px;color:#aaa;margin:8px 0 0;line-height:1.4">Нажимая кнопку, вы соглашаетесь с <a href="/privacy.html" target="_blank" style="color:#aaa">политикой обработки персональных данных</a> в соответствии с ФЗ-152</p>
  `;
  document.body.appendChild(form);
  document.getElementById('cb-phone')?.focus();
}

function closeCallbackForm() {
  document.getElementById('callback-form')?.remove();
}

async function submitCallback(e) {
  if (e) e.preventDefault();
  const f = document.getElementById('cb-form');
  if (!f) return;
  const name = f.querySelector('[name="name"]')?.value?.trim() || '';
  const phone = f.querySelector('[name="phone"]')?.value?.trim() || '';

  if (!phone) {
    alert('Пожалуйста, введите номер телефона');
    return;
  }

  try {
    const text = '📞 *Заявка на звонок — PLATFORMA*\n\n' +
      '👤 *Имя:* '    + tgEsc(name)  + '\n' +
      '📱 *Телефон:* ' + tgEsc(phone) + '\n' +
      '🕐 '           + new Date().toLocaleString('ru-RU');

    await sendTG(text);

    // Сброс формы и закрытие модалки/уведомление
    f.reset();
    const modal = document.getElementById('callback-modal');
    if (modal) modal.style.display = 'none';
    alert('Заявка успешно отправлена! Мы свяжемся с вами в ближайшее время.');
  } catch (err) {
    console.error(err);
    alert('Ошибка при отправке заявки. Пожалуйста, попробуйте позже.');
  }
}

// ══ ИНИЦИАЛИЗАЦИЯ FLOAT WIDGET ══════════════════════════════════════════════
// Запускаем после загрузки каталога
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(buildFloatWidget, 800);
});


// ══ БРОШЕННАЯ КОРЗИНА ══════════════════════════════════════════════════════
const ABANDONED_KEY   = 'platforma_abandoned';
const ABANDON_DELAY   = 90 * 60 * 1000; // 90 мин в мс

function saveAbandonedCart() {
  if (!cart.length) return;
  const phone = document.getElementById('co-phone')?.value.trim() || '';
  localStorage.setItem(ABANDONED_KEY, JSON.stringify({
    cart, phone, total: cart.reduce((s,c)=>s+c.price*c.qty,0),
    savedAt: Date.now()
  }));
}

function clearAbandonedCart() {
  localStorage.removeItem(ABANDONED_KEY);
}

// Проверяем при загрузке страницы — есть ли брошенная корзина
function checkAbandonedCart() {
  const raw = localStorage.getItem(ABANDONED_KEY);
  if (!raw) return;
  let ab;
  try { ab = JSON.parse(raw); } catch(e) { return; }
  if (!ab || !ab.cart?.length) return;
  const age = Date.now() - (ab.savedAt || 0);
  // Показываем баннер если прошло > 5 мин (не сразу, чтобы не бесить)
  if (age < 5 * 60 * 1000) return;

  showAbandonedBanner(ab);
}

function showAbandonedBanner(ab) {
  if (document.getElementById('abandoned-banner')) return;

  const style = document.createElement('style');
  style.textContent = `
    #abandoned-banner {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
      background: #192C1E; color: #fff;
      padding: 10px 20px; display: flex; align-items: center;
      justify-content: center; gap: 16px; flex-wrap: wrap;
      font-size: 13px; animation: slideDown .3s ease;
    }
    @keyframes slideDown { from{transform:translateY(-100%)} to{transform:none} }
    #abandoned-banner strong { font-weight: 600; }
    .ab-restore {
      background: #fff; color: #192C1E; border: none;
      padding: 7px 16px; border-radius: 7px; font-size: 13px;
      font-weight: 600; cursor: pointer; white-space: nowrap;
    }
    .ab-restore:hover { opacity: .9; }
    .ab-dismiss {
      background: none; border: none; color: rgba(255,255,255,.6);
      font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;
    }
  `;
  document.head.appendChild(style);

  const total = ab.cart.reduce((s,c)=>s+c.price*c.qty, 0);
  const itemCount = ab.cart.reduce((s,c)=>s+c.qty, 0);

  const banner = document.createElement('div');
  banner.id = 'abandoned-banner';
  banner.innerHTML = `
    <span>🛒 У вас остался незавершённый заказ — <strong>${itemCount} ${itemCount===1?'товар':itemCount<5?'товара':'товаров'}</strong> на сумму <strong>${fmt(total)} ₽</strong></span>
    <button class="ab-restore" onclick="restoreAbandonedCart()">Вернуться к заказу</button>
    <button class="ab-dismiss" onclick="dismissAbandonedBanner()" aria-label="Закрыть">✕</button>
  `;
  document.body.prepend(banner);
}

function restoreAbandonedCart() {
  const raw = localStorage.getItem(ABANDONED_KEY);
  if (!raw) return;
  let ab;
  try { ab = JSON.parse(raw); } catch(e) { return; }
  if (!ab?.cart?.length) return;

  // Восстанавливаем корзину
  ab.cart.forEach(item => {
    const ex = cart.find(c => c.sku === item.sku);
    if (ex) ex.qty += item.qty;
    else cart.push({ ...item });
  });
  saveCart(); updateBadge();
  clearAbandonedCart();
  dismissAbandonedBanner();
  openCart();
  toast('Корзина восстановлена! ' + ab.cart.length + ' товаров', 'success');
  if (window.ym) ym(109166481, 'reachGoal', 'abandoned_cart_restored');
}

function dismissAbandonedBanner() {
  const b = document.getElementById('abandoned-banner');
  if (b) { b.style.animation = 'slideDown .25s ease reverse'; setTimeout(()=>b.remove(), 250); }
  clearAbandonedCart();
}

// Сохраняем корзину при вводе телефона в чекауте
function watchCheckoutPhone() {
  const el = document.getElementById('co-phone');
  if (!el || el.dataset.abWatched) return;
  el.dataset.abWatched = '1';
  el.addEventListener('input', () => {
    if (el.value.trim().length > 5) saveAbandonedCart();
  });
}

// Хук: проверяем брошенную корзину после открытия чекаута
const _origRenderCheckout = window.renderCheckout;

// ══════════════════════════════════════════════════════════════════════════════

// БЛОК 1: «С ЭТИМ ТОВАРОМ БЕРУТ» — cross-sell в карточке товара
// ══════════════════════════════════════════════════════════════════════════════

// Маппинг: slug категории → смежные категории
const CROSS_SELL_MAP = {
  'myagkaya-krovlya':        ['samorezy','gvozdi-krovelnye','paroizolyatsiya','superdiffuzionnye-membrany','aeratory'],
  'metallocherepitsa':       ['samorezy','snegozaderzhateli-steelx','trubchatye','superdiffuzionnye-membrany','aeratory'],
  'profnastil':              ['samorezy','dlya-profnastila','superdiffuzionnye-membrany','konkovye-aeratory'],
  'volnovoy-profil':         ['samorezy','aeratory','superdiffuzionnye-membrany'],
  'kompozitnaya-cherepitsa': ['samorezy','snegozaderzhateli-steelx','aeratory'],
  'falcevaya-krovlya':       ['dlya-faltsevoy-krovli','superdiffuzionnye-membrany','konkovye-aeratory'],
  'ondulin':                 ['samorezy','gvozdi-krovelnye','aeratory'],
  'onduvilla':               ['samorezy','gvozdi-krovelnye','aeratory'],
  'vinilovyy':               ['samorezy','obreshetka','uteplitel','vetrozashchita'],
  'metallicheskiy':          ['samorezy','obreshetka','uteplitel'],
  'cokolnyy':                ['samorezy','obreshetka','gidroizolyatsiya'],
  'fibrotsementnyy':         ['samorezy','obreshetka','uteplitel'],
  'pod-brevno':              ['samorezy','obreshetka','uteplitel'],
  'pod-kamen':               ['samorezy','obreshetka','uteplitel'],
  'pod-derevo':              ['samorezy','obreshetka','uteplitel'],
  'pod-brus':                ['samorezy','obreshetka','uteplitel'],
  'pod-kirpich':             ['samorezy','obreshetka','uteplitel'],
  'uteplitel':               ['paroizolyatsiya','vetrozashchita','superdiffuzionnye-membrany','samorezy'],
  'paroizolyatsiya':         ['uteplitel','superdiffuzionnye-membrany','vetrozashchita'],
  'superdiffuzionnye-membrany': ['uteplitel','paroizolyatsiya','samorezy'],
  'metallicheskie':          ['aeratory','germetiki','samorezy'],
  'plastikovye':             ['aeratory','germetiki','samorezy'],
  'fakro':                   ['izolyatsionnye-oklady','shtory','uteplitel'],
  'velux':                   ['izolyatsionnye-oklady','shtory','uteplitel'],
  'profnastil-dlya-zabora':  ['evroshtaketnik','stolby-dlya-zabora','samorezy'],
  'evroshtaketnik':          ['profnastil-dlya-zabora','stolby-dlya-zabora','samorezy'],
  'schiedel':                ['flyugarka','prokhodnye-elementy','germetiki'],
  'flue-line':               ['flyugarka','prokhodnye-elementy','germetiki'],
  'fasadnye-paneli':         ['samorezy','obreshetka','uteplitel','vetrozashchita'],
  'fibrotsementnye-paneli':  ['samorezy','obreshetka','uteplitel'],
  'treedeck':                ['stupeni','samorezy','ograzhdeniya-dpk'],
  'terrapol':                ['stupeni','samorezy','ograzhdeniya-dpk'],
};

// Названия категорий для заголовка блока
const CAT_NAMES_CACHE = {};
function getCatName(slug) {
  if (CAT_NAMES_CACHE[slug]) return CAT_NAMES_CACHE[slug];
  const c = catalog?.categories?.find(x => x.slug === slug);
  CAT_NAMES_CACHE[slug] = c?.name || slug;
  return CAT_NAMES_CACHE[slug];
}

function buildCrossSellHtml(currentCatSlug) {
  const slugs = CROSS_SELL_MAP[currentCatSlug];
  if (!slugs?.length || !catalog) return '';

  const items = [];
  for (const slug of slugs) {
    const cat = catalog.categories.find(c => c.slug === slug);
    if (!cat || !cat.products.length) continue;
    // Берём самый дешёвый товар категории как представителя
    const prod = [...cat.products].sort((a,b) =>
      (a.variants[0]?.price || 999999) - (b.variants[0]?.price || 999999)
    )[0];
    const v = prod.variants[0];
    const fp = Math.round(v.price * SALE_RATE);
    const img = v.images?.[0] || '';
    items.push({ prod, v, fp, img, catName: cat.name, catSlug: slug });
    if (items.length >= 4) break;
  }
  if (!items.length) return '';

  const cards = items.map(({ prod, v, fp, img, catName, catSlug }) =>
    '<div class="cs-card" onclick="openCategory(\'' + catSlug + '\')">' +
      '<div class="cs-img">' +
        (img ? '<img src="' + img + '" loading="lazy" alt="' + catName + '">' : '<div class="cs-ph">📦</div>') +
      '</div>' +
      '<div class="cs-info">' +
        '<div class="cs-cat">' + catName + '</div>' +
        '<div class="cs-title">' + prod.title.slice(0, 45) + (prod.title.length > 45 ? '…' : '') + '</div>' +
        '<div class="cs-price">' + (fp > 0 ? 'от ' + fmt(fp) + ' ₽' : 'по запросу') + '</div>' +
      '</div>' +
      '<button class="cs-add" onclick="event.stopPropagation();quickAdd(\'' + prod.id + '\')" title="Добавить в корзину">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '</button>' +
    '</div>'
  ).join('');

  return (
    '<div class="cs-block">' +
      '<div class="cs-title-row">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>' +
        'С этим товаром берут' +
      '</div>' +
      '<div class="cs-grid">' + cards + '</div>' +
    '</div>'
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 2: ИСТОРИЯ ПРОСМОТРОВ — «Вы смотрели»
// ══════════════════════════════════════════════════════════════════════════════

const HISTORY_KEY  = 'platforma_history';
const HISTORY_MAX  = 10;

function addToHistory(prodId) {
  let h = [];
  try { h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) {}
  h = h.filter(id => id !== prodId);
  h.unshift(prodId);
  if (h.length > HISTORY_MAX) h = h.slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { return []; }
}

function buildHistoryHtml() {
  const ids = getHistory();
  if (!ids.length || !catalog) return '';

  const prods = ids
    .map(id => { for (const c of catalog.categories) { const p = c.products.find(x=>x.id===id); if(p) return p; } return null; })
    .filter(Boolean)
    .slice(0, 6);

  if (prods.length < 2) return ''; // меньше 2 — не показываем

  const cards = prods.map(p => {
    const v = p.variants[0];
    const fp = Math.round(v.price * SALE_RATE);
    const img = v.images?.[0] || '';
    return (
      '<div class="hist-card" onclick="openProd(\'' + p.id + '\')">' +
        '<div class="hist-img">' +
          (img ? '<img src="' + img + '" loading="lazy" alt="' + p.title + '">' : '<div class="hist-ph">📦</div>') +
        '</div>' +
        '<div class="hist-title">' + p.title.slice(0, 38) + (p.title.length>38?'…':'') + '</div>' +
        '<div class="hist-price">' + (fp > 0 ? fmt(fp) + ' ₽' : 'по запросу') + '</div>' +
      '</div>'
    );
  }).join('');

  return (
    '<div class="hist-block">' +
      '<div class="hist-hdr">Вы смотрели</div>' +
      '<div class="hist-scroll">' + cards + '</div>' +
    '</div>'
  );
}

// Рендерим историю на главной и в категориях
function injectHistoryBlock() {
  const existing = document.getElementById('history-block');
  if (existing) existing.remove();
  const html = buildHistoryHtml();
  if (!html) return;
  const wrap = document.createElement('div');
  wrap.id = 'history-block';
  wrap.innerHTML = html;
  const content = document.getElementById('content');
  if (content) content.appendChild(wrap);
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 3: УМНЫЕ ФАСЕТЫ — фильтры по характеристикам товаров
// ══════════════════════════════════════════════════════════════════════════════

// Ключевые характеристики для фильтрации (в порядке важности)
const FACET_KEYS = [
  'Покрытие', 'Толщина металла, мм', 'Гарантия, лет',
  'Производитель', 'Материал', 'Цвет',
  'Толщина, мм', 'Диаметр', 'Длина',
];

function buildFacetsHtml() {
  if (!activeCat?.products?.length) return '';

  // Собираем уникальные значения по ключевым полям
  const facets = {};
  for (const p of activeCat.products) {
    for (const key of FACET_KEYS) {
      const val = p.features?.[key];
      if (!val) continue;
      if (!facets[key]) facets[key] = new Set();
      facets[key].add(val);
    }
  }

  // Оставляем только фасеты с 2–12 уникальными значениями (иначе бесполезны)
  const usable = Object.entries(facets)
    .filter(([, vals]) => vals.size >= 2 && vals.size <= 12)
    .slice(0, 4); // максимум 4 фасета

  if (!usable.length) return '';

  // Активные фасет-фильтры
  if (!window._activeFacets) window._activeFacets = {};

  const html = usable.map(([key, vals]) => {
    const sortedVals = [...vals].sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b, 'ru');
    });
    const chips = sortedVals.map(v =>
      '<button class="facet-chip ' + (window._activeFacets[key] === v ? 'active' : '') + '" ' +
        'onclick="toggleFacet(\'' + key.replace(/'/g,"\\'") + '\',\'' + v.replace(/'/g,"\\'") + '\')">' +
        v +
      '</button>'
    ).join('');
    return (
      '<div class="facet-group">' +
        '<div class="facet-key">' + key + '</div>' +
        '<div class="facet-chips">' + chips + '</div>' +
      '</div>'
    );
  }).join('');

  const hasActive = Object.keys(window._activeFacets).length > 0;
  return (
    '<div class="facets-bar" id="facets-bar">' +
      html +
      (hasActive ? '<button class="facet-clear" onclick="clearFacets()">✕ Сбросить</button>' : '') +
    '</div>'
  );
}

function toggleFacet(key, val) {
  if (!window._activeFacets) window._activeFacets = {};
  if (window._activeFacets[key] === val) {
    delete window._activeFacets[key];
  } else {
    window._activeFacets[key] = val;
  }
  renderProducts();
}

function clearFacets() {
  window._activeFacets = {};
  renderProducts();
}

// Патчим getFilteredProducts — добавляем фасет-фильтрацию

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 4: CSS для всего нового
// ══════════════════════════════════════════════════════════════════════════════

(function injectFeatureStyles() {
  if (document.getElementById('feature-styles-2')) return;
  const s = document.createElement('style');
  s.id = 'feature-styles-2';
  s.textContent = `
    /* ── Cross-sell block ─────────────────────── */
    .cs-block {
      margin: 20px 0 0; padding-top: 18px;
      border-top: 1px solid var(--border);
    }
    .cs-title-row {
      display: flex; align-items: center; gap: 7px;
      font-size: 13px; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: .04em;
      margin-bottom: 12px;
    }
    .cs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
    }
    .cs-card {
      display: flex; align-items: center; gap: 10px;
      padding: 10px; border-radius: 10px;
      border: 1px solid var(--border); background: var(--surface);
      cursor: pointer; transition: border-color .15s, background .15s;
      position: relative;
    }
    .cs-card:hover { border-color: var(--accent,#888); background: var(--panel); }
    .cs-img { width: 52px; height: 52px; border-radius: 7px; overflow: hidden; flex-shrink: 0; background: var(--surface2); }
    .cs-img img { width: 100%; height: 100%; object-fit: cover; }
    .cs-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .cs-info { flex: 1; min-width: 0; }
    .cs-cat { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
    .cs-title { font-size: 12px; color: var(--text); line-height: 1.35; margin-bottom: 3px; }
    .cs-price { font-size: 13px; font-weight: 600; color: var(--text); }
    .cs-add {
      width: 28px; height: 28px; border-radius: 7px;
      background: var(--dark,#192C1E); color: #fff;
      border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity .15s;
    }
    .cs-add:hover { opacity: .8; }

    /* ── History block ────────────────────────── */
    .hist-block { margin-top: 28px; padding-top: 18px; border-top: 1px solid var(--border); }
    .hist-hdr {
      font-size: 13px; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: .04em; margin-bottom: 12px;
    }
    .hist-scroll {
      display: flex; gap: 10px; overflow-x: auto;
      padding-bottom: 6px; scrollbar-width: thin;
    }
    .hist-card {
      min-width: 130px; max-width: 130px; cursor: pointer;
      border: 1px solid var(--border); border-radius: 10px;
      padding: 9px; background: var(--surface); transition: border-color .15s;
      flex-shrink: 0;
    }
    .hist-card:hover { border-color: var(--accent,#888); }
    .hist-img { width: 100%; height: 80px; border-radius: 6px; overflow: hidden; background: var(--surface2); margin-bottom: 7px; }
    .hist-img img { width: 100%; height: 100%; object-fit: cover; }
    .hist-ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .hist-title { font-size: 11px; color: var(--text); line-height: 1.3; margin-bottom: 4px; }
    .hist-price { font-size: 12px; font-weight: 600; color: var(--text); }

    /* ── Facets bar ───────────────────────────── */
    .facets-bar {
      display: flex; flex-wrap: wrap; align-items: flex-start;
      gap: 14px; padding: 14px 16px; margin-bottom: 14px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px;
    }
    .facet-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .facet-key {
      font-size: 11px; color: var(--muted); font-weight: 600;
      text-transform: uppercase; letter-spacing: .04em;
      white-space: normal; margin-right: 2px;
    }
    .facet-chips { display: flex; flex-wrap: wrap; gap: 5px; }
    .facet-chip {
      padding: 4px 11px; border-radius: 20px; font-size: 12px;
      border: 1px solid var(--border); background: var(--bg);
      color: var(--text); cursor: pointer; transition: .15s; white-space: nowrap;
    }
    .facet-chip:hover { border-color: var(--dark,#192C1E); }
    .facet-chip.active {
      background: var(--dark,#192C1E); color: #fff; border-color: var(--dark,#192C1E);
    }
    .facet-clear {
      padding: 4px 11px; border-radius: 20px; font-size: 12px;
      border: 1px solid var(--danger,#e05); background: transparent;
      color: var(--danger,#e05); cursor: pointer; align-self: center;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════════════════
// ХУКИ — вызываем новые блоки из существующих функций
// ══════════════════════════════════════════════════════════════════════════════

// 1. Добавляем cross-sell в модал карточки товара (после блока характеристик)

// 2. Трекинг просмотра: сохраняем в историю при открытии товара
const _origOpenProd = openProd;
openProd = function(id) {
  _origOpenProd(id);
  if (id) addToHistory(id);
};

// 3. Фасеты + история — вызываем в renderProducts (патчим через MutationObserver на content)

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 5: ИЗБРАННОЕ (❤️ без регистрации, localStorage)
// ══════════════════════════════════════════════════════════════════════════════

const FAVS_KEY = 'platforma_favs';

function getFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVS_KEY) || '[]')); } catch(e) { return new Set(); }
}
function saveFavs(set) { localStorage.setItem(FAVS_KEY, JSON.stringify([...set])); }

function toggleFav(prodId, e) {
  if (e) e.stopPropagation();
  const favs = getFavs();
  const was = favs.has(prodId);
  was ? favs.delete(prodId) : favs.add(prodId);
  saveFavs(favs);
  // Обновляем все кнопки с этим id на странице
  document.querySelectorAll('[data-fav-id="' + prodId + '"]').forEach(btn => {
    btn.classList.toggle('fav-active', !was);
    btn.setAttribute('aria-label', was ? 'В избранное' : 'Убрать из избранного');
  });
  toast(was ? 'Убрано из избранного' : '❤️ Добавлено в избранное', was ? '' : 'success');
}

function favBtnHtml(prodId) {
  const active = getFavs().has(prodId);
  return (
    '<button class="fav-btn ' + (active ? 'fav-active' : '') + '" ' +
      'data-fav-id="' + prodId + '" ' +
      'onclick="toggleFav(\'' + prodId + '\',event)" ' +
      'aria-label="' + (active ? 'Убрать из избранного' : 'В избранное') + '">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + (active ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>' +
      '</svg>' +
    '</button>'
  );
}

// Добавляем кнопку ❤️ в модал

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 6: СРАВНЕНИЕ ТОВАРОВ (до 4 товаров, таблица по характеристикам)
// ══════════════════════════════════════════════════════════════════════════════

const COMPARE_KEY = 'platforma_compare';
const COMPARE_MAX = 4;

function getCompare() {
  try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]'); } catch(e) { return []; }
}
function saveCompare(arr) { localStorage.setItem(COMPARE_KEY, JSON.stringify(arr)); }

function toggleCompare(prodId, e) {
  if (e) e.stopPropagation();
  let list = getCompare();
  const idx = list.indexOf(prodId);
  if (idx >= 0) {
    list.splice(idx, 1);
    toast('Убрано из сравнения');
  } else {
    if (list.length >= COMPARE_MAX) { toast('Максимум ' + COMPARE_MAX + ' товара', 'error'); return; }
    list.push(prodId);
    toast('➕ Добавлено к сравнению');
  }
  saveCompare(list);
  updateCompareBar();
  document.querySelectorAll('[data-cmp-id="' + prodId + '"]').forEach(btn => {
    btn.classList.toggle('cmp-active', list.includes(prodId));
  });
}

function compareBtnHtml(prodId) {
  const active = getCompare().includes(prodId);
  return (
    '<button class="cmp-btn ' + (active ? 'cmp-active' : '') + '" ' +
      'data-cmp-id="' + prodId + '" ' +
      'onclick="toggleCompare(\'' + prodId + '\',event)" ' +
      'title="' + (active ? 'Убрать из сравнения' : 'Сравнить') + '">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
      (active ? '' : ' Сравнить') +
    '</button>'
  );
}

// Плавающая панель внизу при добавлении в сравнение
function updateCompareBar() {
  const list = getCompare();
  let bar = document.getElementById('compare-bar');
  if (!list.length) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'compare-bar';
    document.body.appendChild(bar);
  }
  const prods = list.map(id => {
    for (const c of catalog?.categories || []) {
      const p = c.products.find(x => x.id === id);
      if (p) return p;
    }
    return null;
  }).filter(Boolean);

  bar.innerHTML =
    '<div class="cb-items">' +
      prods.map(p =>
        '<div class="cb-item">' +
          '<span>' + p.title.slice(0,22) + (p.title.length>22?'…':'') + '</span>' +
          '<button onclick="toggleCompare(\'' + p.id + '\',event)" class="cb-rm">✕</button>' +
        '</div>'
      ).join('') +
    '</div>' +
    '<div class="cb-btns">' +
      '<button class="cb-go" onclick="openCompareView()">Сравнить ' + list.length + ' товара</button>' +
      '<button class="cb-clr" onclick="clearCompare()">Очистить</button>' +
    '</div>';
}

function clearCompare() {
  saveCompare([]);
  document.querySelectorAll('.cmp-btn').forEach(b => b.classList.remove('cmp-active'));
  updateCompareBar();
}

function openCompareView() {
  const list = getCompare();
  if (list.length < 2) { toast('Добавьте хотя бы 2 товара', 'error'); return; }

  const prods = list.map(id => {
    for (const c of catalog?.categories || []) {
      const p = c.products.find(x => x.id === id);
      if (p) return p;
    }
    return null;
  }).filter(Boolean);

  // Собираем все уникальные ключи характеристик
  const allKeys = [...new Set(prods.flatMap(p => Object.keys(p.features || {})))];

  // Шапка
  const headCells = prods.map(p => {
    const v = p.variants[0];
    const img = v.images?.[0] || '';
    const fp = Math.round(v.price * SALE_RATE);
    return (
      '<th>' +
        (img ? '<img src="' + img + '" style="width:80px;height:60px;object-fit:cover;border-radius:6px;display:block;margin:0 auto 6px">' : '') +
        '<div style="font-size:12px;font-weight:600;line-height:1.3;margin-bottom:4px">' + p.title.slice(0,50) + '</div>' +
        '<div style="font-size:14px;font-weight:700;color:var(--text)">' + fmt(fp) + ' ₽</div>' +
        '<button style="margin-top:8px;font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--dark);color:#fff;cursor:pointer" onclick="addFromCompare(\'' + p.id + '\')">+ В корзину</button>' +
      '</th>'
    );
  }).join('');

  // Строки характеристик
  const rows = allKeys.map(key => {
    const vals = prods.map(p => (p.features?.[key] || '—'));
    // Подсвечиваем лучшее значение (числовые — максимум)
    const nums = vals.map(v => parseFloat(v));
    const allNum = nums.every(n => !isNaN(n));
    const maxNum = allNum ? Math.max(...nums) : null;
    const cells = vals.map((v, i) => {
      const isBest = allNum && parseFloat(v) === maxNum;
      return '<td style="' + (isBest ? 'font-weight:600;color:var(--dark)' : '') + '">' + v + '</td>';
    }).join('');
    return '<tr><td class="cmp-key">' + key + '</td>' + cells + '</tr>';
  }).join('');

  const html =
    '<div id="compare-ovl" onclick="if(event.target===this)closeCompare()" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10001;overflow-y:auto;padding:20px">' +
      '<div style="background:var(--panel);border-radius:16px;max-width:900px;margin:0 auto;padding:24px;position:relative">' +
        '<button onclick="closeCompare()" style="position:absolute;top:14px;right:14px;background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted)">✕</button>' +
        '<h3 style="margin:0 0 18px;font-size:17px">Сравнение товаров</h3>' +
        '<div style="overflow-x:auto">' +
          '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<thead><tr><th style="text-align:left;padding:8px;width:150px">Характеристика</th>' + headCells + '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function closeCompare() {
  document.getElementById('compare-ovl')?.remove();
}

function addFromCompare(prodId) {
  const prod = (() => {
    for (const c of catalog?.categories || []) {
      const p = c.products.find(x => x.id === prodId);
      if (p) return p;
    }
  })();
  if (!prod) return;
  const v = prod.variants[0];
  addToCart({ sku: v.sku, title: prod.title, price: Math.round(v.price * SALE_RATE), img: v.images?.[0] || '', qty: 1 });
}

// Добавляем кнопку сравнения в модал

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 7: ОПТОВЫЕ СКИДКИ (объём в калькуляторе → цена меняется)
// ══════════════════════════════════════════════════════════════════════════════

// Пороги: от N единиц → множитель цены
const WHOLESALE_TIERS = [
  { min: 1,   mult: 1.00, label: '' },
  { min: 10,  mult: 0.97, label: '−3% от 10 шт' },
  { min: 30,  mult: 0.95, label: '−5% от 30 шт' },
  { min: 100, mult: 0.92, label: '−8% от 100 шт' },
  { min: 300, mult: 0.88, label: '−12% от 300 шт' },
];

function getWholesaleMult(qty) {
  let best = WHOLESALE_TIERS[0];
  for (const t of WHOLESALE_TIERS) { if (qty >= t.min) best = t; }
  return best;
}

// Показываем оптовые тиры в модале при изменении qty

function updateWholesaleHint() {
  const hint = document.getElementById('wholesale-hint');
  const qty = modalQty || 1;
  const tier = getWholesaleMult(qty);
  const nextTier = WHOLESALE_TIERS.find(t => t.min > qty);

  if (hint) {
    if (tier.label) {
      hint.textContent = '✅ ' + tier.label;
      hint.style.color = 'var(--success, #2d9e6b)';
    } else if (nextTier) {
      hint.textContent = 'Закажите от ' + nextTier.min + ' шт — ' + nextTier.label;
      hint.style.color = 'var(--muted)';
    } else {
      hint.textContent = '';
    }
  }

  // Пересчитываем цену в .mpb при изменении qty
  if (!modalProd) return;
  const v = modalProd.variants[modalVar] || modalProd.variants[0];
  const baseFp = Math.round(v.price * SALE_RATE);
  const fp = Math.round(baseFp * tier.mult);
  const priceEl = document.querySelector('.mpb .mprice');
  if (priceEl && fp !== baseFp) priceEl.textContent = fmt(fp) + ' ₽*';
}

// Хук на изменение qty в модале
const _origSelQty = window.selQty;
if (typeof selQty === 'function') {
  const __origSelQty = selQty;
  window.selQty = function(d) { __origSelQty(d); setTimeout(updateWholesaleHint, 50); };
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 8: QUICK-ADD — быстрое добавление с карточки без открытия модала
// ══════════════════════════════════════════════════════════════════════════════

function quickAdd(prodId) {
  if (!catalog) return;
  let prod = null;
  for (const c of catalog.categories) {
    prod = c.products.find(p => p.id === prodId);
    if (prod) break;
  }
  if (!prod) return;
  const v = prod.variants[0];
  const fp = Math.round(v.price * SALE_RATE);
  addToCart({ sku: v.sku, title: prod.title, price: fp, img: v.images?.[0] || '', qty: 1 });
}

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 9: CSS для сравнения, избранного, оптовых скидок
// ══════════════════════════════════════════════════════════════════════════════

(function injectStyles3() {
  if (document.getElementById('platforma-styles-3')) return;
  const s = document.createElement('style');
  s.id = 'platforma-styles-3';
  s.textContent = `
    /* ── Fav button ──────────────────────── */
    .fav-btn {
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--surface); border: 1px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: .18s; color: var(--muted);
    }
    .fav-btn:hover, .fav-btn.fav-active { color: #e53; border-color: #e53; }
    .fav-btn.fav-active { background: #fff0f0; }

    /* ── Compare bar ─────────────────────── */
    #compare-bar {
      position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 14px; padding: 12px 16px;
      display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      box-shadow: 0 6px 24px rgba(0,0,0,.15); z-index: 1000;
      max-width: 600px; width: calc(100% - 32px);
    }
    .cb-items { display: flex; gap: 8px; flex-wrap: wrap; flex: 1; }
    .cb-item {
      display: flex; align-items: center; gap: 5px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; padding: 4px 8px; font-size: 12px; color: var(--text);
    }
    .cb-rm { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 12px; line-height: 1; }
    .cb-btns { display: flex; gap: 8px; }
    .cb-go {
      padding: 8px 16px; border-radius: 9px;
      background: var(--dark, #192C1E); color: #fff;
      border: none; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .cb-clr {
      padding: 8px 12px; border-radius: 9px;
      background: none; border: 1px solid var(--border);
      font-size: 13px; color: var(--muted); cursor: pointer;
    }
    .cmp-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 0 14px; height: 46px; border-radius: 10px;
      border: 1.5px solid var(--border); background: var(--surface);
      color: var(--text); font-size: 13px; font-family: var(--fb);
      cursor: pointer; white-space: nowrap; transition: .18s;
    }
    .cmp-btn:hover, .cmp-btn.cmp-active {
      border-color: var(--accent, #888); color: var(--accent, #888);
    }
    .cmp-key { text-align: left; padding: 7px 10px; color: var(--muted); font-size: 12px; background: var(--surface); }
    #compare-ovl td, #compare-ovl th { border: 1px solid var(--border); padding: 8px 12px; text-align: center; vertical-align: middle; }
    #compare-ovl tr:nth-child(even) td { background: var(--surface); }

    /* ── Wholesale hint ──────────────────── */
    #wholesale-hint {
      font-size: 12px; margin-top: 5px; min-height: 16px;
      transition: color .2s;
    }
  `;
  document.head.appendChild(s);
})();

// ══════════════════════════════════════════════════════════════════════════════
// БЛОК 10: WHOLESALE HINT в модале — добавляем элемент после .mpb
// ══════════════════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════════════════
// SEO: ДИНАМИЧЕСКИЕ МЕТА-ТЕГИ + РОУТИНГ
// При открытии ?product=ID или ?category=SLUG — обновляем:
//   title, description, canonical, og:tags, JSON-LD schema Product/BreadcrumbList
// Яндекс при рендере увидит правильные теги на каждой "странице"
// ══════════════════════════════════════════════════════════════════════════════

const SITE_URL  = 'https://platforma-pro.vercel.app';
const SITE_NAME = 'PLATFORMA';

function setMeta(name, content) {
  let el = document.querySelector('meta[name="' + name + '"]');
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el); }
  el.content = content;
}
function setOG(prop, content) {
  let el = document.querySelector('meta[property="' + prop + '"]');
  if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el); }
  el.content = content;
}
function setCanonical(url) {
  let el = document.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
  el.href = url;
}
function setSchemaLD(id, obj) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = id; document.head.appendChild(el); }
  el.textContent = JSON.stringify(obj);
}

// Строим URL страницы товара: /?product=ID
function prodPageUrl(prod) {
  return SITE_URL + '/?product=' + encodeURIComponent(prod.id);
}
// Строим URL страницы категории: /?category=SLUG
function catPageUrl(slug) {
  return SITE_URL + '/?category=' + encodeURIComponent(slug);
}

function updateSEOForProduct(prod, cat) {
  if (!prod) return;
  const v = prod.variants[0];
  const fp = v?.price > 0 ? Math.round(v.price * SALE_RATE) : null;
  const img = v?.images?.[0] || '';
  const desc = buildAutoDescription(prod, v);
  const url  = prodPageUrl(prod);
  const catName = cat?.name || '';
  const groupName = catalog?.groups?.[cat?.group]?.name || 'Кровля';

  // Title: «Название | Категория | PLATFORMA»
  document.title = prod.title + ' — купить в ' + SITE_NAME + (fp ? ' от ' + fmt(fp) + ' ₽' : '') + ' | Доставка по России';

  setMeta('description',
    (desc || prod.title) + (fp ? '. Цена: от ' + fmt(fp) + ' ₽.' : '') + ' Доставка по всей России. Интернет-магазин ' + SITE_NAME + '.'
  );
  setCanonical(url);
  setOG('og:title',       prod.title + ' — ' + SITE_NAME);
  setOG('og:description', desc || prod.title);
  setOG('og:url',         url);
  setOG('og:type',        'product');
  if (img) { setOG('og:image', img); setOG('og:image:alt', prod.title); }

  // JSON-LD: Product schema — звёздочки в поиске Яндекса
  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': prod.title,
    'description': desc || prod.title,
    'url': url,
    'image': img ? [img] : [],
    'brand': { '@type': 'Brand', 'name': prod.features?.['Производитель'] || SITE_NAME },
    'offers': fp ? {
      '@type': 'Offer',
      'priceCurrency': 'RUB',
      'price': fp,
      'availability': 'https://schema.org/InStock',
      'seller': { '@type': 'Organization', 'name': SITE_NAME },
      'url': url,
    } : undefined,
    'additionalProperty': Object.entries(prod.features || {}).slice(0, 10).map(([k, v]) => ({
      '@type': 'PropertyValue', 'name': k, 'value': v
    })),
  };
  if (!productSchema.offers) delete productSchema.offers;
  setSchemaLD('schema-product-dynamic', productSchema);

  // JSON-LD: BreadcrumbList
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Главная',   'item': SITE_URL + '/' },
      { '@type': 'ListItem', 'position': 2, 'name': groupName,   'item': SITE_URL + '/?group=' + (cat?.group || '') },
      { '@type': 'ListItem', 'position': 3, 'name': catName,     'item': catPageUrl(cat?.slug || '') },
      { '@type': 'ListItem', 'position': 4, 'name': prod.title,  'item': url },
    ],
  };
  setSchemaLD('schema-breadcrumb-dynamic', breadcrumb);

  // Яндекс.Метрика — ecommerce просмотр товара
  if (window.dataLayer) window.dataLayer.push({ ecommerce: { detail: { products: [{ id: prod.id, name: prod.title, price: fp || 0, category: catName }] } } });
}

function updateSEOForCategory(cat) {
  if (!cat) return;
  const url = catPageUrl(cat.slug);
  const groupName = catalog?.groups?.[cat.group]?.name || 'Каталог';
  const count = cat.products?.length || 0;

  document.title = cat.name + ' — купить в ' + SITE_NAME + ' | ' + count + ' товаров с доставкой по России';
  setMeta('description',
    cat.name + ' в интернет-магазине ' + SITE_NAME + '. ' + count + ' товаров от ведущих производителей. Скидка −7% на весь каталог. Доставка по России.'
  );
  setCanonical(url);
  setOG('og:title',       cat.name + ' — ' + SITE_NAME);
  setOG('og:description', cat.name + ': ' + count + ' товаров. Доставка по России.');
  setOG('og:url',         url);
  setOG('og:type',        'website');

  // BreadcrumbList для категории
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Главная',  'item': SITE_URL + '/' },
      { '@type': 'ListItem', 'position': 2, 'name': groupName,  'item': SITE_URL + '/?group=' + (cat.group || '') },
      { '@type': 'ListItem', 'position': 3, 'name': cat.name,   'item': url },
    ],
  };
  setSchemaLD('schema-breadcrumb-dynamic', breadcrumb);

  // ItemList schema — список товаров категории для Яндекса
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': cat.name,
    'url': url,
    'numberOfItems': count,
    'itemListElement': (cat.products || []).slice(0, 20).map((p, i) => ({
      '@type': 'ListItem',
      'position': i + 1,
      'url': prodPageUrl(p),
      'name': p.title,
    })),
  };
  setSchemaLD('schema-itemlist-dynamic', itemList);
}

function resetSEOToHome() {
  document.title = SITE_NAME + ' — Кровельные материалы, водостоки и изоляция с доставкой по России';
  setMeta('description', 'Интернет-магазин ' + SITE_NAME + ': металлочерепица, водостоки, утеплитель и фасадные панели. 1992 товара от ведущих брендов. Скидка −7% на весь каталог.');
  setCanonical(SITE_URL + '/');
  setOG('og:title', SITE_NAME + ' — Кровельные материалы, водостоки, изоляция');
  setOG('og:url', SITE_URL + '/');
  setOG('og:type', 'website');
  // Убираем динамические схемы
  ['schema-product-dynamic','schema-breadcrumb-dynamic','schema-itemlist-dynamic'].forEach(id => {
    document.getElementById(id)?.remove();
  });
}

// ── URL-роутер: обновляем адрес браузера без перезагрузки страницы ──────────
function pushRoute(params) {
  const url = new URL(location.href);
  // Сбрасываем старые параметры
  ['product','category','group'].forEach(k => url.searchParams.delete(k));
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  history.pushState({}, '', url.toString());
}
function popRoute() {
  const url = new URL(location.href);
  ['product','category','group'].forEach(k => url.searchParams.delete(k));
  history.pushState({}, '', url.toString());
}

// ── Патчим openProd — добавляем pushState + SEO ──────────────────────────────

// ── Патчим closeMod — убираем product из URL ─────────────────────────────────
const __origCloseMod = closeMod;
closeMod = function() {
  __origCloseMod();
  // Удаляем product из URL, оставляем category если была
  const url = new URL(location.href);
  url.searchParams.delete('product');
  history.pushState({}, '', url.toString());
  // Восстанавливаем SEO категории или главной
  if (activeCat) updateSEOForCategory(activeCat);
  else resetSEOToHome();
};

// ── Патчим selectCat — обновляем URL и SEO при выборе категории ──────────────
const __origSelectCat = typeof selectCat === 'function' ? selectCat : null;
if (__origSelectCat) {
  selectCat = function(slug) {
    __origSelectCat(slug);
    const cat = catalog?.categories?.find(c => c.slug === slug);
    pushRoute({ category: slug });
    if (cat) updateSEOForCategory(cat);
  };
}

// ── При кнопке браузера «Назад/Вперёд» ──────────────────────────────────────
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  const productId  = params.get('product');
  const categorySlug = params.get('category');
  if (productId) {
    openProd(productId);
  } else if (categorySlug && typeof selectCat === 'function') {
    selectCat(categorySlug);
    closeMod();
  } else {
    closeMod();
    resetSEOToHome();
  }
});

// ── При первой загрузке — читаем URL и открываем нужную страницу ─────────────
function handleInitialRoute() {
  const params = new URLSearchParams(location.search);
  const productId    = params.get('product');
  const categorySlug = params.get('category');
  if (productId) {
    // Ждём загрузки каталога
    const tryOpen = () => {
      if (!catalog) { setTimeout(tryOpen, 100); return; }
      openProd(productId);
    };
    tryOpen();
  } else if (categorySlug) {
    const trySelect = () => {
      if (!catalog) { setTimeout(trySelect, 100); return; }
      if (typeof selectCat === 'function') selectCat(categorySlug);
    };
    trySelect();
  }
}
document.addEventListener('DOMContentLoaded', handleInitialRoute);

// ══ ONLINE-КНОПКА В ХЕДЕРЕ ════════════════════════════════════════════════
function updateOnlineBtn() {
  const btn    = document.getElementById('hdr-online-btn');
  const dot    = document.getElementById('hdr-online-dot');
  const status = document.getElementById('hdr-online-status');
  if (!btn) return;

  const h = new Date().getHours();
  const online = h >= 9 && h < 20;   // рабочие часы 9:00–20:00

  if (online) {
    btn.classList.remove('offline');
    if (status) status.textContent = 'Online';
  } else {
    btn.classList.add('offline');
    if (status) status.textContent = 'Offline';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateOnlineBtn();
  // Обновляем каждую минуту (переход Online→Offline в 20:00)
  setInterval(updateOnlineBtn, 60 * 1000);
});
// ══ КУПИТЬ В 1 КЛИК ════════════════════════════════════════════════════════
function oneClickBuy(prodId) {
  const p = findProd(prodId);
  if (!p) return;
  const v = p.variants[0];
  const fp = Math.round(v.price * SALE_RATE);

  // Убираем старую форму если есть
  document.getElementById('one-click-overlay')?.remove();

  const ovl = document.createElement('div');
  ovl.id = 'one-click-overlay';
  ovl.onclick = e => { if (e.target === ovl) ovl.remove(); };
  ovl.innerHTML =
    '<div class="oc-modal">' +
      '<button class="oc-close" onclick="document.getElementById(\'one-click-overlay\').remove()">✕</button>' +
      '<div class="oc-title">⚡ Купить в 1 клик</div>' +
      '<div class="oc-prod">' +
        (v.images?.[0] ? '<img src="' + v.images[0] + '" class="oc-img">' : '') +
        '<div>' +
          '<div class="oc-pname">' + p.title.slice(0,50) + '</div>' +
          '<div class="oc-price">' + fmt(fp) + ' ₽</div>' +
        '</div>' +
      '</div>' +
      '<input class="finp" id="oc-phone" placeholder="+7 (___) ___-__-__" type="tel"/>' +
      '<div style="font-size:11px;color:var(--muted);margin:6px 0 14px">Перезвоним в течение 10 минут и оформим заказ</div>' +
      '<button class="oc-submit" onclick="submitOneClick(\'' + prodId + '\', ' + fp + ', \'' + p.title.replace(/'/g,"\'").slice(0,60) + '\')">Перезвоните и оформите заказ</button>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:8px">Нажимая кнопку, вы соглашаетесь с <a href=\"/privacy.html\" style=\"color:var(--muted)\">политикой обработки данных</a> (ФЗ-152)</div>' +
    '</div>';
  document.body.appendChild(ovl);

  // Маска телефона
  const ph = document.getElementById('oc-phone');
  ph.focus();
  ph.addEventListener('input', function() {
    let v = this.value.replace(/\D/g,'');
    if (v.startsWith('8')) v = '7' + v.slice(1);
    if (v.length > 0 && !v.startsWith('7')) v = '7' + v;
    v = v.slice(0,11);
    let out = v.length > 0 ? '+7' : '';
    if (v.length > 1) out += ' (' + v.slice(1,4);
    if (v.length >= 4) out += ') ' + v.slice(4,7);
    if (v.length >= 7) out += '-' + v.slice(7,9);
    if (v.length >= 9) out += '-' + v.slice(9,11);
    this.value = out;
  });
}

async function submitOneClick(e) {
  if (e) e.preventDefault();
  if (!modalProd) return;

  const phoneInput = document.querySelector('.oc-input');
  const phone = phoneInput ? phoneInput.value.trim() : '';

  if (!phone) {
    alert('Пожалуйста, введите номер телефона');
    return;
  }

  // Вычисляем цену с учётом модификатора (варианта), если применимо
  const variant = modalProd.variants?.[modalVar];
  const price = variant ? variant.price * PRICE_BASE : modalProd.price * PRICE_BASE;
  const title = modalProd.name + (variant ? ` (${variant.name})` : '');

  try {
    const text = '⚡ *Покупка в 1 клик — PLATFORMA*\n\n' +
      '📦 *Товар:* '   + tgEsc(title)           + '\n' +
      '💰 *Цена:* '    + fmt(price)   + ' ₽\n'  +
      '📱 *Телефон:* ' + tgEsc(phone)            + '\n' +
      '🕐 '            + new Date().toLocaleString('ru-RU');

    await sendTG(text);

    if (phoneInput) phoneInput.value = '';
    closeOneClick();
    closeModal();
    alert('Спасибо! Заказ оформлен, менеджер уже связывается с вами.');
  } catch (err) {
    console.error(err);
    alert('Не удалось оформить заказ. Попробуйте ещё раз.');
  }
}

function getLastOrderTime() {
  const mins = [3,7,12,18,24,31,45];
  const m = mins[new Date().getMinutes() % mins.length];
  return m + ' мин. назад';
}

// ══ EXIT INTENT — попап при уходе с страницы ═══════════════════════════════
let _exitShown = false;
document.addEventListener('mouseleave', e => {
  if (e.clientY > 10 || _exitShown || !activeCat) return;
  _exitShown = true;
  showExitIntent();
});

function showExitIntent() {
  if (document.getElementById('exit-ovl')) return;
  const ovl = document.createElement('div');
  ovl.id = 'exit-ovl';
  ovl.onclick = e => { if (e.target === ovl) ovl.remove(); };
  ovl.innerHTML =
    '<div class="exit-modal">' +
      '<button onclick="document.getElementById(\'exit-ovl\').remove()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted)">✕</button>' +
      '<div style="font-size:36px;margin-bottom:12px">🎁</div>' +
      '<h3 style="font-family:var(--fh);font-size:18px;margin:0 0 8px">Подождите!</h3>' +
      '<p style="color:var(--muted);font-size:14px;margin:0 0 20px">Оставьте телефон — рассчитаем стоимость<br>вашего проекта и дадим лучшую цену</p>' +
      '<input class="finp" id="exit-phone" placeholder="+7 (___) ___-__-__" type="tel" style="margin-bottom:10px"/>' +
      '<button class="oc-submit" onclick="submitExitIntent()">Получить расчёт бесплатно</button>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:8px">Согласно ФЗ-152, <a href=\"/privacy.html\" style=\"color:var(--muted)\">политика обработки данных</a></div>' +
    '</div>';
  document.body.appendChild(ovl);

  const ph = document.getElementById('exit-phone');
  if (ph) {
    ph.focus();
    ph.addEventListener('input', function() {
      let v = this.value.replace(/\D/g,'');
      if (v.startsWith('8')) v = '7' + v.slice(1);
      if (v.length > 0 && !v.startsWith('7')) v = '7' + v;
      v = v.slice(0,11);
      let out = v.length > 0 ? '+7' : '';
      if (v.length > 1) out += ' (' + v.slice(1,4);
      if (v.length >= 4) out += ') ' + v.slice(4,7);
      if (v.length >= 7) out += '-' + v.slice(7,9);
      if (v.length >= 9) out += '-' + v.slice(9,11);
      this.value = out;
    });
  }
}

async function submitExitIntent(e) {
  if (e) e.preventDefault();
  const input = document.querySelector('.ei-input');
  const phone = input ? input.value.trim() : '';

  if (!phone) {
    alert('Пожалуйста, введите номер телефона');
    return;
  }

  try {
    const text = '🎁 *Запрос расчёта — PLATFORMA*\n\n' +
      '📱 *Телефон:* '   + tgEsc(phone) + '\n' +
      '📂 *Категория:* ' + tgEsc(activeCat?.name || 'каталог') + '\n' +
      '🕐 '              + new Date().toLocaleString('ru-RU');

    await sendTG(text);

    if (input) input.value = '';
    const eiModal = document.getElementById('exit-intent-modal');
    if (eiModal) eiModal.remove(); // или .style.display = 'none'
    alert('Спасибо! Мы вышлем расчет стоимости в течение 15 минут.');
  } catch (err) {
    console.error(err);
    alert('Произошла ошибка. Пожалуйста, попробуйте позже.');
  }
}

// ══ CSS: новые маркетинговые элементы ══════════════════════════════════════
(function injectMarketingStyles() {
  if (document.getElementById('marketing-styles')) return;
  const s = document.createElement('style');
  s.id = 'marketing-styles';
  s.textContent = `
    /* ── Trust bar ───────────────────────────── */
    .trust-bar {
      display: flex; flex-wrap: wrap; gap: 10px;
      padding: 14px 16px; margin-bottom: 14px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px;
    }
    .trust-item {
      display: flex; align-items: center; gap: 10px;
      flex: 1; min-width: 160px;
    }
    .trust-item > span { font-size: 22px; flex-shrink: 0; }
    .trust-item div { display: flex; flex-direction: column; }
    .trust-item strong { font-size: 13px; color: var(--text); font-weight: 600; }
    .trust-item span { font-size: 11px; color: var(--muted); }

    /* ── Social proof ────────────────────────── */
    .social-proof {
      font-size: 12px; color: var(--muted);
      padding: 8px 14px; margin-bottom: 12px;
      background: rgba(255,200,0,.08); border: 1px solid rgba(255,200,0,.2);
      border-radius: 8px; display: inline-block;
    }
    .social-proof strong { color: var(--text); }

    /* ── Stock + views on pcard ──────────────── */
    .pcard-stock {
      font-size: 10px; color: var(--muted);
      margin-top: 4px; display: flex; align-items: center; gap: 4px;
    }
    .stock-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #2d9e6b; flex-shrink: 0;
      animation: pulse-dot 2s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%,100% { opacity: 1; } 50% { opacity: .4; }
    }
    .views-now { color: var(--muted); }

    /* ── One-click button ────────────────────── */
    .one-click-btn {
      width: 100%; margin-top: 5px;
      padding: 7px; border-radius: 8px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text); font-size: 11px;
      font-family: var(--fb); cursor: pointer;
      transition: .15s;
    }
    .one-click-btn:hover { background: var(--surface2); border-color: var(--dark); }

    /* ── One-click modal ─────────────────────── */
    #one-click-overlay, #exit-ovl {
      position: fixed; inset: 0; z-index: 10002;
      background: rgba(0,0,0,.55);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .oc-modal, .exit-modal {
      background: var(--panel); border-radius: 16px;
      padding: 28px 24px; max-width: 360px; width: 100%;
      position: relative; animation: fadeIn .2s ease;
    }
    .oc-close {
      position: absolute; top: 12px; right: 14px;
      background: none; border: none; font-size: 20px;
      color: var(--muted); cursor: pointer;
    }
    .oc-title {
      font-size: 17px; font-weight: 700; font-family: var(--fh);
      margin-bottom: 16px;
    }
    .oc-prod {
      display: flex; gap: 12px; align-items: center;
      margin-bottom: 16px; padding: 10px;
      background: var(--surface); border-radius: 10px;
    }
    .oc-img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
    .oc-pname { font-size: 13px; font-weight: 500; margin-bottom: 4px; line-height: 1.3; }
    .oc-price { font-size: 16px; font-weight: 700; color: var(--text); }
    .oc-submit {
      width: 100%; padding: 13px; border-radius: 10px;
      background: var(--dark, #192C1E); color: #fff;
      border: none; font-size: 14px; font-weight: 600;
      cursor: pointer; font-family: var(--fb); transition: .15s;
    }
    .oc-submit:hover { opacity: .88; }

    /* ── Mobile адаптив для trust-bar ───────── */
    @media (max-width: 768px) {
      .trust-bar { padding: 10px 12px; gap: 8px; }
      .trust-item { min-width: calc(50% - 4px); }
      .trust-item > span { font-size: 18px; }
      .trust-item strong { font-size: 11px; }
      .trust-item span { font-size: 10px; }
    }
    @media (max-width: 480px) {
      .trust-item { min-width: 100%; }
    }
  `;
  document.head.appendChild(s);
})();