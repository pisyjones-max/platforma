/**
 * МК4С — Сервер магазина
 * Запуск: node server.js
 * 
 * Установка зависимостей:
 *   npm install express node-telegram-bot-api nodemailer node-cron
 */

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const cron      = require('node-cron');
const nodemailer= require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const { execFile } = require('child_process');

// ══ КОНФИГ ════════════════════════════════════════════════════════════════════
const CONFIG = {
  PORT: process.env.PORT || 3000,

  // Telegram бот
  TG_TOKEN:     process.env.TG_TOKEN     || 'ВАШ_ТОКЕН_БОТА',   // @BotFather
  TG_CHAT_ID:   process.env.TG_CHAT_ID   || 'ВАШ_CHAT_ID',      // ID чата/канала менеджеров

  // Email (если не нужен — оставьте пустым)
  SMTP_HOST:    process.env.SMTP_HOST    || 'smtp.yandex.ru',
  SMTP_PORT:    process.env.SMTP_PORT    || 465,
  SMTP_USER:    process.env.SMTP_USER    || 'your@yandex.ru',
  SMTP_PASS:    process.env.SMTP_PASS    || 'ВАШ_ПАРОЛЬ',
  EMAIL_TO:     process.env.EMAIL_TO     || 'manager@mk4s.ru',

  // Парсер
  PARSER_SCRIPT: process.env.PARSER_SCRIPT || './parser_with_json.py',
  CATALOG_PATH:  process.env.CATALOG_PATH  || './catalog.json',

  // Расписание парсера (каждую ночь в 03:00)
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || '0 3 * * *',
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ══ TELEGRAM БОТ ══════════════════════════════════════════════════════════════
let bot = null;
let pendingOrders = {}; // orderId -> order (для кнопок принять/отклонить)

if (CONFIG.TG_TOKEN !== 'ВАШ_ТОКЕН_БОТА') {
  try {
    bot = new TelegramBot(CONFIG.TG_TOKEN, { polling: true });
    bot.on('polling_error', err => console.log('[TG] polling error:', err.message));

    // Обработка кнопок inline
    bot.on('callback_query', async (query) => {
      const [action, orderId] = query.data.split(':');
      const order = pendingOrders[orderId];
      if (!order) {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Заказ не найден' });
        return;
      }
      if (action === 'accept') {
        bot.answerCallbackQuery(query.id, { text: '✅ Заказ принят' });
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        });
        bot.sendMessage(CONFIG.TG_CHAT_ID, `✅ Заказ #${orderId} принят менеджером @${query.from.username || query.from.first_name}`);
        saveOrderToFile(orderId, order, 'accepted');
        delete pendingOrders[orderId];
      } else if (action === 'reject') {
        bot.answerCallbackQuery(query.id, { text: '❌ Заказ отклонён' });
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        });
        bot.sendMessage(CONFIG.TG_CHAT_ID, `❌ Заказ #${orderId} отклонён`);
        saveOrderToFile(orderId, order, 'rejected');
        delete pendingOrders[orderId];
      }
    });

    console.log('[TG] Бот запущен ✅');
  } catch (e) {
    console.warn('[TG] Не удалось запустить бота:', e.message);
  }
}

// ══ EMAIL ══════════════════════════════════════════════════════════════════════
let mailer = null;
if (CONFIG.SMTP_USER !== 'your@yandex.ru') {
  mailer = nodemailer.createTransport({
    host: CONFIG.SMTP_HOST,
    port: Number(CONFIG.SMTP_PORT),
    secure: Number(CONFIG.SMTP_PORT) === 465,
    auth: { user: CONFIG.SMTP_USER, pass: CONFIG.SMTP_PASS },
  });
}

// ══ HELPERS ════════════════════════════════════════════════════════════════════
function fmt(n) {
  return Number(n).toLocaleString('ru-RU');
}

function genOrderId() {
  return Date.now().toString(36).toUpperCase();
}

function saveOrderToFile(orderId, order, status = 'new') {
  const dir = './orders';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const file = path.join(dir, `${orderId}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...order, orderId, status, updated_at: new Date().toISOString() }, null, 2));
}

function buildOrderText(orderId, order) {
  const items = (order.items || []).map(i =>
    `  • ${i.title} × ${i.qty} — ${i.price > 0 ? fmt(i.price * i.qty) + ' ₽' : 'по запросу'}`
  ).join('\n');
  const total = (order.items || []).reduce((s, c) => s + (c.price * c.qty), 0);

  return `🛒 *Новый заказ #${orderId}*

👤 *Клиент:* ${order.name}
📞 *Телефон:* ${order.phone}${order.email ? `\n✉️ *Email:* ${order.email}` : ''}
📦 *Адрес:* ${order.address}${order.comment ? `\n💬 *Комментарий:* ${order.comment}` : ''}

📋 *Состав заказа:*
${items}

💰 *Итого: ${fmt(total)} ₽*
🕐 ${new Date(order.created_at || Date.now()).toLocaleString('ru-RU')}`;
}

function buildOrderHtml(orderId, order) {
  const total = (order.items || []).reduce((s, c) => s + (c.price * c.qty), 0);
  const rows = (order.items || []).map(i =>
    `<tr><td>${i.title}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${i.price > 0 ? fmt(i.price * i.qty) + ' ₽' : 'по запросу'}</td></tr>`
  ).join('');
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="background:#192C1E;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;margin:0">
        🛒 Заказ #${orderId} — МК4С
      </h2>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:20px;border-radius:0 0 8px 8px">
        <p><strong>Клиент:</strong> ${order.name}</p>
        <p><strong>Телефон:</strong> ${order.phone}</p>
        ${order.email ? `<p><strong>Email:</strong> ${order.email}</p>` : ''}
        <p><strong>Адрес:</strong> ${order.address}</p>
        ${order.comment ? `<p><strong>Комментарий:</strong> ${order.comment}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead><tr style="background:#f5f5f5">
            <th style="text-align:left;padding:8px">Товар</th>
            <th style="padding:8px">Кол-во</th>
            <th style="text-align:right;padding:8px">Сумма</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="border-top:2px solid #192C1E">
            <td colspan="2" style="padding:8px;font-weight:bold">Итого</td>
            <td style="text-align:right;padding:8px;font-weight:bold">${fmt(total)} ₽</td>
          </tr></tfoot>
        </table>
        <p style="color:#888;font-size:12px;margin-top:20px">
          Дата заказа: ${new Date(order.created_at || Date.now()).toLocaleString('ru-RU')}
        </p>
      </div>
    </div>`;
}

// ══ API: ПРИНЯТЬ ЗАКАЗ ════════════════════════════════════════════════════════
app.post('/api/order', async (req, res) => {
  const order = req.body;
  const orderId = genOrderId();

  // 1. Сохранить в файл
  saveOrderToFile(orderId, order, 'new');
  console.log(`[ORDER] Новый заказ #${orderId} от ${order.name} (${order.phone})`);

  // 2. Telegram
  if (bot) {
    try {
      pendingOrders[orderId] = order;
      const text = buildOrderText(orderId, order);
      await bot.sendMessage(CONFIG.TG_CHAT_ID, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Принять', callback_data: `accept:${orderId}` },
            { text: '❌ Отклонить', callback_data: `reject:${orderId}` },
          ]],
        },
      });
      console.log(`[TG] Заказ #${orderId} отправлен в Telegram`);
    } catch (e) {
      console.warn('[TG] Ошибка отправки:', e.message);
    }
  }

  // 3. Email
  if (mailer) {
    try {
      await mailer.sendMail({
        from: `"МК4С Магазин" <${CONFIG.SMTP_USER}>`,
        to: CONFIG.EMAIL_TO,
        subject: `📦 Новый заказ #${orderId} — ${order.name}`,
        html: buildOrderHtml(orderId, order),
      });
      console.log(`[EMAIL] Заказ #${orderId} отправлен на ${CONFIG.EMAIL_TO}`);
    } catch (e) {
      console.warn('[EMAIL] Ошибка отправки:', e.message);
    }
  }

  res.json({ ok: true, orderId });
});

// ══ API: СПИСОК ЗАКАЗОВ (для простой админки) ══════════════════════════════
app.get('/api/orders', (req, res) => {
  const dir = './orders';
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const orders = files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch { return null; }
  }).filter(Boolean).sort((a, b) => b.created_at?.localeCompare(a.created_at));
  res.json(orders);
});

// ══ API: КАТАЛОГ ══════════════════════════════════════════════════════════════
app.get('/api/catalog', (req, res) => {
  if (fs.existsSync(CONFIG.CATALOG_PATH)) {
    res.sendFile(path.resolve(CONFIG.CATALOG_PATH));
  } else {
    res.status(404).json({ error: 'catalog.json не найден. Запустите парсер.' });
  }
});

// ══ API: ЗАПУСТИТЬ ПАРСЕР ВРУЧНУЮ ══════════════════════════════════════════
app.post('/api/parse', (req, res) => {
  const secret = req.headers['x-secret'];
  if (secret !== process.env.PARSE_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  runParser(msg => console.log('[PARSER]', msg));
  res.json({ ok: true, message: 'Парсер запущен' });
});

// ══ ЗАПУСК ПАРСЕРА ════════════════════════════════════════════════════════════
function runParser(log = console.log) {
  log('🔄 Запуск парсера...');
  const ts = new Date().toISOString();
  execFile('python3', [CONFIG.PARSER_SCRIPT], { timeout: 30 * 60 * 1000 }, (err, stdout, stderr) => {
    if (err) {
      log(`❌ Ошибка парсера: ${err.message}`);
      if (bot) bot.sendMessage(CONFIG.TG_CHAT_ID, `❌ Парсер завершился с ошибкой:\n${err.message}`).catch(()=>{});
    } else {
      log(`✅ Парсер завершён (${new Date().toISOString()})`);
      if (bot) bot.sendMessage(CONFIG.TG_CHAT_ID, `✅ Каталог обновлён — ${new Date().toLocaleString('ru-RU')}`).catch(()=>{});
    }
  });
}

// ══ КРОН ══════════════════════════════════════════════════════════════════════
cron.schedule(CONFIG.CRON_SCHEDULE, () => {
  console.log(`[CRON] Запуск по расписанию: ${CONFIG.CRON_SCHEDULE}`);
  runParser();
}, {
  timezone: 'Europe/Moscow',
});
console.log(`[CRON] Расписание: ${CONFIG.CRON_SCHEDULE} (Europe/Moscow)`);

// ══ СТАРТ ══════════════════════════════════════════════════════════════════════
app.listen(CONFIG.PORT, () => {
  console.log(`\n🚀 МК4С сервер запущен: http://localhost:${CONFIG.PORT}`);
  console.log(`📦 Каталог:    /api/catalog`);
  console.log(`🛒 Заказы:     /api/orders`);
  console.log(`🔄 Парсер:     POST /api/parse  (header: x-secret)`);
  console.log(`\nТelegram бот: ${bot ? '✅ активен' : '⚠️  не настроен'}`);
  console.log(`Email:        ${mailer ? '✅ активен' : '⚠️  не настроен'}`);
  console.log('');
});
