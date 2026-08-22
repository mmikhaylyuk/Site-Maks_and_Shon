// Netlify Function: send-to-telegram
//
// Приймає POST-запит з даними форми бронювання і пересилає їх
// у вигляді повідомлення в Telegram через Bot API.
//
// Токен бота і chat_id НІКОЛИ не зберігаються в цьому файлі —
// вони підтягуються з Environment Variables Netlify під час виконання:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID
//
// Це стандартний Netlify Function (CommonJS, формат v1) — працює
// "з коробки" без додаткових залежностей чи збірки.

function escapeHtml(value) {
  return String(value || '')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return escapeHtml(iso);
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function buildMessage(data) {
  const name = escapeHtml(data.name);
  const contact = escapeHtml(data.contact);
  const size = escapeHtml(data.size);
  const dog = escapeHtml(data.dog);
  const comment = escapeHtml(data.comment);
  const checkin = formatDate(data.checkin);
  const checkout = formatDate(data.checkout);

  let dates = '';
  if (checkin && checkout) dates = `${checkin}–${checkout}`;
  else if (checkin) dates = `з ${checkin}`;
  else if (checkout) dates = `до ${checkout}`;

  const lines = ['🔔 <b>Нова заявка з сайту Maks_and_Shon</b>', ''];

  if (name) lines.push(`👤 Ім'я: ${name}`);
  if (contact) lines.push(`📞 Контакт: ${contact}`);
  if (dates) lines.push(`📅 Дати: ${dates}`);
  if (dog) lines.push(`🐶 Кличка / порода: ${dog}`);
  if (size) lines.push(`📏 Розмір: ${size}`);

  if (comment) {
    lines.push('');
    lines.push('💬 Коментар:');
    lines.push(comment);
  }

  const sentAt = new Date().toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  lines.push('');
  lines.push(`🕒 Відправлено: ${sentAt}`);
  lines.push('🌐 Джерело: сайт Maks_and_Shon');

  return lines.join('\n');
}

exports.handler = async function (event) {
  const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

  // Діагностичний режим: відкрийте цю адресу функції в браузері (GET-запит),
  // щоб миттєво перевірити, чи Netlify взагалі передає змінні середовища
  // в функцію — без потреби лізти в логи чи відправляти форму.
  // Значення секретів тут НІКОЛИ не показуються, тільки true/false.
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        ok: true,
        diagnostic: true,
        TELEGRAM_BOT_TOKEN_present: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim()),
        TELEGRAM_CHAT_ID_present: Boolean(process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_CHAT_ID.trim()),
        note: 'Якщо будь-яке з полів вище false — змінна не долетіла до функції. Перевірте Scopes (має бути увімкнено Functions) і зробіть Trigger deploy → Clear cache and deploy site після збереження змінних.',
      }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'method_not_allowed' }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'invalid_json' }),
    };
  }

  // Базова серверна валідація — хоча б імʼя або контакт мають бути заповнені
  if (!data.name && !data.contact) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'missing_required_fields' }),
    };
  }

  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();

  if (!token || !chatId) {
    // Секрети не налаштовані в Netlify — не показуємо це користувачу дослівно,
    // просто логуємо на сервері для діагностики й повертаємо загальну помилку.
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'server_not_configured' }),
    };
  }

  const text = buildMessage(data);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('Telegram API error:', result);
      return {
        statusCode: 502,
        headers: jsonHeaders,
        body: JSON.stringify({ success: false, error: 'telegram_send_failed' }),
      };
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Unexpected error sending Telegram message:', err);
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ success: false, error: 'internal_error' }),
    };
  }
};
