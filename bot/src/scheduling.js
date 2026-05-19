const { google } = require('googleapis');
const { sendText } = require('./evolutionApi');
const { sendNotification } = require('./notify');
const { setState, clearState } = require('./state');
const { getClient } = require('./redis');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

async function getAuth() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
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

async function getAvailableSlots(date, durationMinutes) {
  const fs = require('fs');
  const path = require('path');
  const company = JSON.parse(fs.readFileSync(path.join(__dirname, '../../company.json'), 'utf8'));
  const { timezone, schedule } = company.businessHours;

  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAY_MAP[localDate.getDay()];
  const daySchedule = schedule[dayKey];
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

async function createAppointment(phone, service, datetime, durationMinutes) {
  const auth = await getAuth();
  const cal = google.calendar('v3');
  const end = new Date(new Date(datetime).getTime() + durationMinutes * 60000);
  const response = await cal.events.insert({
    auth,
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: service,
      description: `WhatsApp: ${phone}`,
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
  for (let day = 0; day < 3 && slots.length < 5; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + day);
    const daySlots = await getAvailableSlots(date, durationMinutes || 60);
    slots.push(...daySlots);
  }
  const available = slots.slice(0, 5);
  if (available.length === 0) {
    await clearState(phone);
    await sendText(phone, 'Não há horários disponíveis nos próximos 3 dias. Entre em contato diretamente.');
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
    if (state.data.service) {
      await showAvailableSlots(phone, state, state.data.duration);
      return;
    }
    await setState(phone, { flow: 'scheduling', step: 1, data: {} });
    await sendText(phone, 'Qual serviço você deseja agendar?');
    return;
  }

  if (state.step === 1) {
    const newState = { flow: 'scheduling', step: 2, data: { service: text } };
    await setState(phone, newState);
    await showAvailableSlots(phone, newState, 60);
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
    const { service, slot, duration } = state.data;
    const eventId = await createAppointment(phone, service, slot, duration || 60);
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
};
