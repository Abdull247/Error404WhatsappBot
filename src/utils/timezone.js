const CALLING_CODE_TIMEZONES = [
  ['234', 'Africa/Lagos'],
  ['233', 'Africa/Accra'],
  ['254', 'Africa/Nairobi'],
  ['255', 'Africa/Dar_es_Salaam'],
  ['256', 'Africa/Kampala'],
  ['27', 'Africa/Johannesburg'],
  ['20', 'Africa/Cairo'],
  ['212', 'Africa/Casablanca'],
  ['971', 'Asia/Dubai'],
  ['966', 'Asia/Riyadh'],
  ['974', 'Asia/Qatar'],
  ['92', 'Asia/Karachi'],
  ['91', 'Asia/Kolkata'],
  ['880', 'Asia/Dhaka'],
  ['62', 'Asia/Jakarta'],
  ['66', 'Asia/Bangkok'],
  ['84', 'Asia/Ho_Chi_Minh'],
  ['86', 'Asia/Shanghai'],
  ['81', 'Asia/Tokyo'],
  ['82', 'Asia/Seoul'],
  ['65', 'Asia/Singapore'],
  ['60', 'Asia/Kuala_Lumpur'],
  ['63', 'Asia/Manila'],
  ['61', 'Australia/Sydney'],
  ['64', 'Pacific/Auckland'],
  ['44', 'Europe/London'],
  ['353', 'Europe/Dublin'],
  ['33', 'Europe/Paris'],
  ['49', 'Europe/Berlin'],
  ['39', 'Europe/Rome'],
  ['34', 'Europe/Madrid'],
  ['351', 'Europe/Lisbon'],
  ['31', 'Europe/Amsterdam'],
  ['32', 'Europe/Brussels'],
  ['41', 'Europe/Zurich'],
  ['43', 'Europe/Vienna'],
  ['46', 'Europe/Stockholm'],
  ['47', 'Europe/Oslo'],
  ['45', 'Europe/Copenhagen'],
  ['48', 'Europe/Warsaw'],
  ['90', 'Europe/Istanbul'],
  ['7', 'Europe/Moscow'],
  ['380', 'Europe/Kyiv'],
  ['55', 'America/Sao_Paulo'],
  ['54', 'America/Argentina/Buenos_Aires'],
  ['52', 'America/Mexico_City'],
  ['57', 'America/Bogota'],
  ['51', 'America/Lima'],
  ['56', 'America/Santiago'],
  ['58', 'America/Caracas'],
  ['1', 'America/New_York'],
];

export function phoneFromJid(jid) {
  const local = String(jid || '').split('@')[0] || '';
  return local.replace(/\D/g, '');
}

export function timezoneFromPhone(phone, fallback = 'UTC') {
  const digits = String(phone || '').replace(/\D/g, '');
  for (const [code, zone] of CALLING_CODE_TIMEZONES) {
    if (digits.startsWith(code)) return zone;
  }
  return fallback;
}

export function isValidTimeZone(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
