/**
 * sitemap-generator.js
 * Запуск: node sitemap-generator.js
 *
 * Генерирует sitemap.xml на основе catalog.json
 * Для Vercel: добавьте как build script в package.json
 *   "build": "node sitemap-generator.js && next build"
 */

const fs   = require('fs');
const path = require('path');

const BASE_URL = 'https://platforma-pro.vercel.app';
const catalog  = JSON.parse(fs.readFileSync('./catalog.json', 'utf8'));
const today    = new Date().toISOString().split('T')[0];

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function generateSitemapXML(urls) {
  const items = urls.map(u => {
    const imgBlocks = (u.images || []).map(img =>
      `    <image:image>
      <image:loc>${esc(img.loc)}</image:loc>
      <image:title>${esc(img.title)}</image:title>
    </image:image>`
    ).join('\n');

    return `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq || 'weekly'}</changefreq>
    <priority>${u.priority || '0.7'}</priority>
${imgBlocks}  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${items}
</urlset>`;
}

// ── 1. Статические URL ──────────────────────────────────────────────────
const staticURLs = [
  { loc: BASE_URL + '/',           changefreq: 'daily',   priority: '1.0' },
  { loc: BASE_URL + '/izolyatsiya/',changefreq: 'weekly',  priority: '0.9' },
  { loc: BASE_URL + '/fasadnye-materialy/', changefreq: 'weekly', priority: '0.9' },
];

// ── 2. URL категорий ─────────────────────────────────────────────────────
const categoryURLs = catalog.categories.map(cat => ({
  loc: BASE_URL + cat.url,
  changefreq: 'weekly',
  priority: cat.products.length > 20 ? '0.85' : '0.8',
}));

// ── 3. URL товаров с изображениями ───────────────────────────────────────
const productURLs = [];

for (const cat of catalog.categories) {
  for (const prod of cat.products) {
    // Собираем уникальные изображения
    const uniqueImgs = [];
    const seen = new Set();
    for (const variant of prod.variants) {
      for (const imgUrl of (variant.images || [])) {
        if (!seen.has(imgUrl)) {
          seen.add(imgUrl);
          uniqueImgs.push({
            loc: imgUrl,
            title: prod.title + (variant.color ? ' ' + variant.color : '')
          });
        }
        if (uniqueImgs.length >= 5) break; // Яндекс рекомендует не более 5 на URL
      }
      if (uniqueImgs.length >= 5) break;
    }

    productURLs.push({
      loc: prod.url.startsWith('http') ? prod.url : BASE_URL + prod.url,
      changefreq: 'weekly',
      priority: '0.7',
      images: uniqueImgs.slice(0, 5),
    });
  }
}

// ── 4. Генерация файлов ─────────────────────────────────────────────────
const outDir = './public'; // или './' для Vercel
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// sitemap-static.xml
fs.writeFileSync(
  path.join(outDir, 'sitemap-static.xml'),
  generateSitemapXML([...staticURLs, ...categoryURLs])
);

// Разбиваем товары на чанки по 500 URL (лимит Яндекса на файл)
const CHUNK_SIZE = 500;
const chunks = [];
for (let i = 0; i < productURLs.length; i += CHUNK_SIZE) {
  chunks.push(productURLs.slice(i, i + CHUNK_SIZE));
}

const sitemapFiles = ['sitemap-static.xml'];
chunks.forEach((chunk, i) => {
  const filename = `sitemap-products-${i + 1}.xml`;
  fs.writeFileSync(path.join(outDir, filename), generateSitemapXML(chunk));
  sitemapFiles.push(filename);
});

// sitemap index
const indexXML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapFiles.map(f =>
  `  <sitemap>
    <loc>${BASE_URL}/${f}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`
).join('\n')}
</sitemapindex>`;

fs.writeFileSync(path.join(outDir, 'sitemap.xml'), indexXML);

console.log(`✅ Sitemap сгенерирован:`);
console.log(`   - sitemap.xml (index)`);
sitemapFiles.forEach(f => console.log(`   - ${f}`));
console.log(`   Всего товаров: ${productURLs.length}`);
console.log(`   Файлов: ${sitemapFiles.length}`);