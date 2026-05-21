const { getCompanySettings } = require('./config');

const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

async function isOpen() {
  const settings = await getCompanySettings();
  if (!settings || !settings.business_hours) return true;

  const { timezone, business_hours } = settings;
  const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAY_MAP[localDate.getDay()];
  const daySchedule = business_hours[dayKey];
  if (!daySchedule) return false;

  const h = localDate.getHours().toString().padStart(2, '0');
  const m = localDate.getMinutes().toString().padStart(2, '0');
  const current = `${h}:${m}`;
  return current >= daySchedule.open && current < daySchedule.close;
}

async function getClosedMessage() {
  const settings = await getCompanySettings();
  return settings?.closed_message || 'Estamos fechados no momento. Retornaremos em breve!';
}

module.exports = { isOpen, getClosedMessage };
