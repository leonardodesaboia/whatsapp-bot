const { google } = require('googleapis');
const { sendText } = require('./evolutionApi');
const { sendNotification } = require('./notify');
const { setState, clearState } = require('./state');
const { getClient } = require('./redis');
const { getCompanySettings } = require('./config');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_MEETING_SERVICE = 'Reunião';
const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_LOOKAHEAD_DAYS = 14;
const GENERIC_MEETING_INTENT = /\b(agendar|agenda|marcar|reuni[aã]o|call|conversa|hor[aá]rio|reserva)\b/i;
let googleCredentialsStatusLogged = false;

function normalizePersonName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function getAppointmentTitle(service, contactName) {
  const value = String(service || '').trim();
  const person = normalizePersonName(contactName);
  if (!value || GENERIC_MEETING_INTENT.test(value)) {
    return person ? `${DEFAULT_MEETING_SERVICE} - ${person}` : DEFAULT_MEETING_SERVICE;
  }
  return value;
}

function getAppointmentDescription(phone, service, contactName) {
  const requested = String(service || '').trim();
  const lines = [`WhatsApp: ${phone}`];
  const person = normalizePersonName(contactName);
  if (person) lines.push(`Nome: ${person}`);
  if (requested && requested !== getAppointmentTitle(requested, contactName)) {
    lines.push(`Solicitação original: ${requested}`);
  }
  return lines.join('\n');
}

function loadGoogleCredentials() {
  const raw = process.env.GOOGLE_CREDENTIALS_BASE64
    ? Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf8')
    : process.env.GOOGLE_CREDENTIALS_JSON;
  if (!raw) return null;

  const credentials = JSON.parse(raw);
  return credentials.client_email && credentials.private_key ? credentials : null;
}

async function getAuth() {
  const authConfig = { scopes: ['https://www.googleapis.com/auth/calendar'] };
  const credentials = loadGoogleCredentials();
  if (!googleCredentialsStatusLogged) {
    const source = process.env.GOOGLE_CREDENTIALS_BASE64
      ? 'GOOGLE_CREDENTIALS_BASE64'
      : process.env.GOOGLE_CREDENTIALS_JSON
        ? 'GOOGLE_CREDENTIALS_JSON'
        : process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? 'GOOGLE_APPLICATION_CREDENTIALS'
          : 'none';
    console.log('[Google Calendar] credentials status:', {
      source,
      loadedFromEnv: Boolean(credentials),
      hasClientEmail: Boolean(credentials?.client_email),
      hasPrivateKey: Boolean(credentials?.private_key),
      keyFileConfigured: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    });
    googleCredentialsStatusLogged = true;
  }
  if (credentials) {
    authConfig.credentials = credentials;
  }
  if (!authConfig.credentials) {
    authConfig.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const auth = new google.auth.GoogleAuth(authConfig);
  return auth.getClient();
}

function formatSlot(date) {
  return new Date(date).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DEFAULT_DAY_SCHEDULE = { open: '08:00', close: '18:00' };

async function getAvailableSlots(date, durationMinutes) {
  const company = await getCompanySettings();
  const timezone = company?.timezone || 'America/Sao_Paulo';
  const businessHours = company?.business_hours; // null = 24h

  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAY_MAP[localDate.getDay()];
  // null = 24h mode -> use default hours; structured = use configured hours (null day = closed)
  const daySchedule = businessHours == null ? DEFAULT_DAY_SCHEDULE : (businessHours?.[dayKey] ?? null);
  if (!daySchedule) return [];

  const auth = await getAuth();
  const cal = google.calendar('v3');
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const response = await cal.events.list({
    auth,
    calendarId: CALENDAR_ID,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const busyTimes = (response.data.items || []).map((e) => ({
    start: new Date(e.start.dateTime),
    end: new Date(e.end.dateTime),
  }));

  const slots = [];
  const [openH, openM] = daySchedule.open.split(':').map(Number);
  const [closeH, closeM] = daySchedule.close.split(':').map(Number);

  const slotStart = new Date(date);
  slotStart.setHours(openH, openM, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(closeH, closeM, 0, 0);

  while (slotStart < dayEnd && slots.length < 5) {
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
    if (slotEnd > dayEnd) break;
    const conflict = busyTimes.some((b) => slotStart < b.end && slotEnd > b.start);
    if (!conflict && slotStart > new Date()) slots.push(new Date(slotStart));
    slotStart.setMinutes(slotStart.getMinutes() + durationMinutes);
  }

  return slots;
}

async function createAppointment(phone, service, datetime, durationMinutes, contactName) {
  const auth = await getAuth();
  const cal = google.calendar('v3');
  const end = new Date(new Date(datetime).getTime() + durationMinutes * 60000);
  const title = getAppointmentTitle(service, contactName);
  const response = await cal.events.insert({
    auth,
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: title,
      description: getAppointmentDescription(phone, service, contactName),
      start: { dateTime: new Date(datetime).toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });
  return response.data.id;
}

async function cancelAppointment(eventId) {
  const auth = await getAuth();
  const cal = google.calendar('v3');
  await cal.events.delete({ auth, calendarId: CALENDAR_ID, eventId });
}

async function scheduleReminders(phone, appointmentDate, eventId) {
  const client = await getClient();
  const dt = new Date(appointmentDate);

  const d1 = new Date(dt);
  d1.setDate(d1.getDate() - 1);
  d1.setHours(9, 0, 0, 0);

  const h2 = new Date(dt.getTime() - 2 * 60 * 60 * 1000);

  const reminders = [
    { key: `reminder:${phone}:${eventId}:d1`, fireAt: d1, message: `Lembrete: seu agendamento é amanhã às ${formatTime(dt)}.` },
    { key: `reminder:${phone}:${eventId}:h2`, fireAt: h2, message: `Lembrete: seu agendamento é em 2 horas, às ${formatTime(dt)}.` },
  ];

  for (const { key, fireAt, message } of reminders) {
    if (fireAt > new Date()) {
      const ttl = Math.ceil((fireAt - Date.now()) / 1000) + 3600;
      await client.set(key, JSON.stringify({ phone, message, fireAt: fireAt.toISOString() }), { EX: ttl });
      const delay = Math.max(0, fireAt - Date.now());
      setTimeout(async () => {
        try {
          await sendNotification(phone, message);
          await client.del(key);
        } catch (err) {
          console.error('Erro ao enviar lembrete:', err.message);
        }
      }, delay);
    }
  }
}

async function rescheduleAllReminders() {
  const client = await getClient();
  const keys = await client.keys('reminder:*');
  for (const key of keys) {
    const raw = await client.get(key);
    if (!raw) continue;
    const { phone, message, fireAt } = JSON.parse(raw);
    const delay = Math.max(0, new Date(fireAt) - Date.now());
    setTimeout(async () => {
      try {
        await sendNotification(phone, message);
        await client.del(key);
      } catch (err) {
        console.error('Erro ao enviar lembrete reagendado:', err.message);
      }
    }, delay);
  }
}

async function showAvailableSlots(phone, state, durationMinutes) {
  const slots = [];
  const today = new Date();
  const lookaheadDays = parseInt(process.env.SCHEDULING_LOOKAHEAD_DAYS || String(DEFAULT_LOOKAHEAD_DAYS), 10);
  const daysToSearch = Number.isFinite(lookaheadDays) && lookaheadDays > 0 ? lookaheadDays : DEFAULT_LOOKAHEAD_DAYS;
  for (let day = 0; day < daysToSearch && slots.length < 5; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);
    const daySlots = await getAvailableSlots(date, durationMinutes || 60);
    slots.push(...daySlots);
  }
  const available = slots.slice(0, 5);
  if (available.length === 0) {
    await clearState(phone);
    await sendText(phone, `Não há horários disponíveis nos próximos ${daysToSearch} dias. Entre em contato diretamente.`);
    return;
  }
  await setState(phone, { ...state, step: 2, data: { ...state.data, slots: available } });
  const list = available.map((s, i) => `${i + 1}. ${formatSlot(s)}`).join('\n');
  await sendText(phone, `Horários disponíveis:\n\n${list}\n\nDigite o número do horário desejado ou "cancelar".`);
}

async function handleSchedulingFlow(phone, state, text) {
  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Agendamento cancelado. Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    const newState = state.data.service
      ? state
      : {
          flow: 'scheduling',
          step: 0,
          data: {
            ...state.data,
            service: DEFAULT_MEETING_SERVICE,
            duration: DEFAULT_DURATION_MINUTES,
          },
        };
    await showAvailableSlots(phone, newState, newState.data.duration);
    return;
  }

  if (state.step === 1) {
    const newState = {
      flow: 'scheduling',
      step: 2,
      data: { ...state.data, service: getAppointmentTitle(text) },
    };
    await setState(phone, newState);
    await showAvailableSlots(phone, newState, DEFAULT_DURATION_MINUTES);
    return;
  }

  if (state.step === 2) {
    const idx = parseInt(text, 10) - 1;
    const slot = state.data.slots?.[idx];
    if (!slot) {
      await sendText(phone, 'Opção inválida. Digite o número do horário ou "cancelar".');
      return;
    }
    await setState(phone, { flow: 'scheduling', step: 3, data: { ...state.data, slot } });
    await sendText(phone, `Confirmar agendamento?\n*${state.data.service}*\n📅 ${formatSlot(slot)}\n\nDigite "sim" para confirmar ou "cancelar".`);
    return;
  }

  if (state.step === 3) {
    if (text?.toLowerCase() !== 'sim') {
      await clearState(phone);
      await sendText(phone, 'Agendamento cancelado. Como posso ajudar?');
      return;
    }
    const { service, slot, duration, contactName } = state.data;
    const eventId = await createAppointment(phone, service, slot, duration || 60, contactName);
    await scheduleReminders(phone, slot, eventId);
    await clearState(phone);
    await sendText(phone, `✅ Agendamento confirmado!\n*${service}*\n📅 ${formatSlot(slot)}\n\nAté lá! Você receberá lembretes.`);
  }
}

module.exports = {
  getAvailableSlots,
  createAppointment,
  cancelAppointment,
  scheduleReminders,
  rescheduleAllReminders,
  handleSchedulingFlow,
  getAppointmentTitle,
  normalizePersonName,
  loadGoogleCredentials,
};
