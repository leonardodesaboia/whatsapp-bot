# Advanced Features — Parte 2: Agendamento + Pix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar agendamento com Google Calendar e pagamento Pix via Mercado Pago ao bot — construindo sobre a Parte 1.

**Pré-requisito:** Parte 1 implementada e todos os testes passando.

**Architecture:** `scheduling.js` integra com Google Calendar via Service Account, gera slots disponíveis e agenda lembretes no Redis. `payment.js` integra com Mercado Pago SDK para gerar cobranças Pix. O `webhook.js` recebe dois novos tokens OpenAI (`__SCHEDULE__`, `__PAYMENT__`) e novas rotas são adicionadas ao `index.js`.

**Tech Stack:** Node.js 20, googleapis, mercadopago, redis v4, Jest.

---

## Mapa de arquivos

**Criar:**
- `bot/src/scheduling.js` — Google Calendar + flow de agendamento + lembretes Redis
- `bot/src/payment.js` — Mercado Pago Pix + flow de pagamento
- `bot/tests/scheduling.test.js`
- `bot/tests/payment.test.js`

**Modificar:**
- `bot/src/evolutionApi.js` — adicionar `sendImageBase64`
- `bot/src/webhook.js` — adicionar roteamento de scheduling/payment e tokens __SCHEDULE__/__PAYMENT__
- `bot/src/openai.js` — adicionar tokens __SCHEDULE__ e __PAYMENT__ ao system prompt
- `bot/src/index.js` — adicionar `POST /payment/webhook` e reagendamento de lembretes
- `bot/tests/evolutionApi.test.js` — teste de `sendImageBase64`
- `bot/tests/webhook.test.js` — novos casos de scheduling/payment
- `.env.example` — novas variáveis
- `docker-compose.yml` — montar `google-credentials.json`
- `bot/package.json` — novas dependências

---

## Task 1: Dependências e configuração

**Files:**
- Modify: `bot/package.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Instalar dependências**

```bash
cd bot && npm install googleapis mercadopago
```

Saída esperada: `added N packages` sem erros.

- [ ] **Step 2: Adicionar ao final de `.env.example`**

```bash
# Google Calendar (agendamento)
GOOGLE_CALENDAR_ID=seu-calendario@group.calendar.google.com
GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json

# Mercado Pago (Pix)
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=seu-webhook-secret
```

- [ ] **Step 3: Adicionar volume `google-credentials.json` ao serviço `bot` em `docker-compose.yml`**

No array `volumes` do serviço `bot`, adicionar:

```yaml
      - ./google-credentials.json:/app/google-credentials.json:ro
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add bot/package.json bot/package-lock.json .env.example docker-compose.yml
git commit -m "chore: add googleapis and mercadopago dependencies"
```

---

## Task 2: Adicionar `sendImageBase64` à `evolutionApi`

**Files:**
- Modify: `bot/src/evolutionApi.js`
- Modify: `bot/tests/evolutionApi.test.js`

- [ ] **Step 1: Adicionar `sendImageBase64` a `bot/src/evolutionApi.js`**

Adicionar após `sendList`:

```javascript
async function sendImageBase64(to, base64, caption) {
  await axios.post(
    `${BASE_URL}/message/sendMedia/${INSTANCE}`,
    {
      number: to,
      mediatype: 'image',
      mimetype: 'image/png',
      media: base64,
      caption: caption || '',
    },
    { headers: { apikey: API_KEY } }
  );
}
```

Atualizar `module.exports`:

```javascript
module.exports = { sendText, registerWebhook, sendList, sendImageBase64 };
```

- [ ] **Step 2: Adicionar teste em `bot/tests/evolutionApi.test.js`**

Atualizar o `require` no topo:

```javascript
const { sendText, registerWebhook, sendList, sendImageBase64 } = require('../src/evolutionApi');
```

Adicionar ao final do arquivo:

```javascript
test('sendImageBase64 envia POST com base64 e caption', async () => {
  mockPost.mockResolvedValue({ data: {} });
  await sendImageBase64('5511999999999', 'abc123', 'QR Code');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendMedia/test-instance',
    {
      number: '5511999999999',
      mediatype: 'image',
      mimetype: 'image/png',
      media: 'abc123',
      caption: 'QR Code',
    },
    { headers: { apikey: 'test-api-key' } }
  );
});
```

- [ ] **Step 3: Rodar testes**

```bash
cd bot && npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: todos passando (incluindo os da Parte 1).

- [ ] **Step 4: Commit**

```bash
cd ..
git add bot/src/evolutionApi.js bot/tests/evolutionApi.test.js
git commit -m "feat: add sendImageBase64 to evolutionApi"
```

---

## Task 3: `scheduling.js` — agendamento com Google Calendar (TDD)

**Files:**
- Create: `bot/src/scheduling.js`
- Create: `bot/tests/scheduling.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/scheduling.test.js`:

```javascript
const mockEventsList = jest.fn();
const mockEventsInsert = jest.fn();
const mockEventsDelete = jest.fn();
const mockSendText = jest.fn();
const mockSendNotification = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetState = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisKeys = jest.fn();
const mockRedisClient = { set: mockRedisSet, del: mockRedisDel, keys: mockRedisKeys, get: jest.fn() };

jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn().mockResolvedValue({}),
      })),
    },
    calendar: jest.fn().mockReturnValue({
      events: {
        list: mockEventsList,
        insert: mockEventsInsert,
        delete: mockEventsDelete,
      },
    }),
  },
}));

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/notify', () => ({ sendNotification: mockSendNotification }));

jest.mock('../src/state', () => ({
  getState: mockGetState,
  setState: mockSetState,
  clearState: mockClearState,
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));

jest.mock('../src/redis', () => ({
  getClient: jest.fn().mockResolvedValue(mockRedisClient),
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      businessHours: {
        timezone: 'America/Sao_Paulo',
        schedule: {
          mon: { open: '09:00', close: '18:00' },
          tue: { open: '09:00', close: '18:00' },
          wed: { open: '09:00', close: '18:00' },
          thu: { open: '09:00', close: '18:00' },
          fri: { open: '09:00', close: '18:00' },
          sat: null,
          sun: null,
        },
      },
    })
  ),
}));

process.env.GOOGLE_CALENDAR_ID = 'test@calendar.google.com';
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/fake/credentials.json';

const { createAppointment, cancelAppointment, handleSchedulingFlow } = require('../src/scheduling');

beforeEach(() => jest.clearAllMocks());

test('createAppointment insere evento no Google Calendar e retorna eventId', async () => {
  mockEventsInsert.mockResolvedValue({ data: { id: 'evt-123' } });
  mockRedisSet.mockResolvedValue('OK');
  const id = await createAppointment('5511999999999', 'Corte', new Date('2026-06-10T10:00:00'), 60);
  expect(mockEventsInsert).toHaveBeenCalled();
  expect(id).toBe('evt-123');
});

test('cancelAppointment deleta evento do Google Calendar', async () => {
  mockEventsDelete.mockResolvedValue({});
  await cancelAppointment('evt-123');
  expect(mockEventsDelete).toHaveBeenCalledWith(
    expect.objectContaining({ calendarId: 'test@calendar.google.com', eventId: 'evt-123' })
  );
});

test('handleSchedulingFlow step 0 sem service pede nome do serviço', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 0, data: {} }, 'quero agendar');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('serviço'));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 1 }));
});

test('handleSchedulingFlow step 0 com service pula para mostrar slots', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  await handleSchedulingFlow(
    '5511999999999',
    { flow: 'scheduling', step: 0, data: { service: 'Corte', duration: 60 } },
    'agendar'
  );
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('horário'));
});

test('handleSchedulingFlow step 1 salva serviço e mostra slots', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 1, data: {} }, 'Corte de cabelo');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 2 }));
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('horário'));
});

test('handleSchedulingFlow step 3 com "sim" cria agendamento e limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsInsert.mockResolvedValue({ data: { id: 'evt-456' } });
  mockRedisSet.mockResolvedValue('OK');
  mockSendNotification.mockResolvedValue(undefined);
  const slot = new Date('2026-06-10T10:00:00');
  await handleSchedulingFlow(
    '5511999999999',
    { flow: 'scheduling', step: 3, data: { service: 'Corte', slot, duration: 60, slots: [slot] } },
    'sim'
  );
  expect(mockEventsInsert).toHaveBeenCalled();
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('confirmado'));
});

test('handleSchedulingFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 2, data: {} }, 'cancelar');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/scheduling.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/scheduling'`

- [ ] **Step 3: Implementar `bot/src/scheduling.js`**

```javascript
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
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/scheduling.test.js --no-coverage
```

Saída esperada: `PASS tests/scheduling.test.js` — 6 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/scheduling.js bot/tests/scheduling.test.js
git commit -m "feat: add scheduling module with Google Calendar and reminders"
```

---

## Task 4: `payment.js` — Pix com Mercado Pago (TDD)

**Files:**
- Create: `bot/src/payment.js`
- Create: `bot/tests/payment.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/payment.test.js`:

```javascript
const mockPaymentCreate = jest.fn();
const mockSendText = jest.fn();
const mockSendImageBase64 = jest.fn();
const mockSendNotification = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetState = jest.fn();

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn(),
  Payment: jest.fn().mockImplementation(() => ({
    create: mockPaymentCreate,
  })),
}));

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendImageBase64: mockSendImageBase64,
  sendList: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/notify', () => ({ sendNotification: mockSendNotification }));

jest.mock('../src/state', () => ({
  setState: mockSetState,
  clearState: mockClearState,
  getState: mockGetState,
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));

process.env.MERCADOPAGO_ACCESS_TOKEN = 'test-token';

const { createPixCharge, handlePaymentFlow, handlePaymentWebhook } = require('../src/payment');

beforeEach(() => jest.clearAllMocks());

test('createPixCharge cria cobrança no Mercado Pago e retorna dados do Pix', async () => {
  mockPaymentCreate.mockResolvedValue({
    id: 12345,
    status: 'pending',
    point_of_interaction: {
      transaction_data: { qr_code_base64: 'base64img', qr_code: '00020101...' },
    },
  });
  const result = await createPixCharge('5511999999999', 50.00, 'Serviço Básico');
  expect(result).toEqual({ paymentId: 12345, qrCodeBase64: 'base64img', qrCodeText: '00020101...' });
  expect(mockPaymentCreate).toHaveBeenCalledWith({
    body: expect.objectContaining({
      transaction_amount: 50.00,
      description: 'Serviço Básico',
      payment_method_id: 'pix',
      external_reference: '5511999999999',
    }),
  });
});

test('handlePaymentFlow step 0 envia confirmação de valor', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 0, data: { amount: 50.00, description: 'Serviço Básico' } }, 'pagar');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('R$ 50,00'));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 1 }));
});

test('handlePaymentFlow step 1 com "sim" gera Pix e envia QR code', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockSendImageBase64.mockResolvedValue(undefined);
  mockPaymentCreate.mockResolvedValue({
    id: 999,
    status: 'pending',
    point_of_interaction: {
      transaction_data: { qr_code_base64: 'imgbase64', qr_code: 'pixcode123' },
    },
  });
  await handlePaymentFlow(
    '5511999999999',
    { flow: 'payment', step: 1, data: { amount: 50.00, description: 'Serviço Básico' } },
    'sim'
  );
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('pixcode123'));
  expect(mockSendImageBase64).toHaveBeenCalledWith('5511999999999', 'imgbase64', expect.any(String));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 2 }));
});

test('handlePaymentFlow step 1 com resposta diferente de "sim" cancela', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 1, data: { amount: 50, description: 'X' } }, 'não');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});

test('handlePaymentFlow step 2 retorna aviso de aguardando', async () => {
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 2, data: { paymentId: 999 } }, 'oi');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Aguardando'));
});

test('handlePaymentWebhook notifica cliente e limpa estado quando aprovado', async () => {
  mockGetState.mockResolvedValue({ flow: 'payment', step: 2, data: { paymentId: 999 } });
  mockClearState.mockResolvedValue(undefined);
  mockSendNotification.mockResolvedValue(undefined);
  await handlePaymentWebhook({ external_reference: '5511999999999' }, 'approved');
  expect(mockSendNotification).toHaveBeenCalledWith('5511999999999', expect.stringContaining('recebido'));
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});

test('handlePaymentWebhook ignora pagamentos não aprovados', async () => {
  await handlePaymentWebhook({ external_reference: '5511999999999' }, 'pending');
  expect(mockSendNotification).not.toHaveBeenCalled();
});

test('handlePaymentFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 2, data: {} }, 'cancelar');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/payment.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/payment'`

- [ ] **Step 3: Implementar `bot/src/payment.js`**

```javascript
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { sendText, sendImageBase64 } = require('./evolutionApi');
const { sendNotification } = require('./notify');
const { setState, clearState } = require('./state');

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

async function createPixCharge(phone, amount, description) {
  const payment = new Payment(mpClient);
  const result = await payment.create({
    body: {
      transaction_amount: amount,
      description,
      payment_method_id: 'pix',
      external_reference: phone,
      payer: { email: `${phone}@whatsapp.bot` },
    },
  });
  return {
    paymentId: result.id,
    qrCodeBase64: result.point_of_interaction.transaction_data.qr_code_base64,
    qrCodeText: result.point_of_interaction.transaction_data.qr_code,
  };
}

async function handlePaymentFlow(phone, state, text) {
  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Pagamento cancelado. Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    const { amount, description } = state.data;
    await setState(phone, { ...state, step: 1 });
    await sendText(
      phone,
      `Gerar Pix de *R$ ${amount.toFixed(2).replace('.', ',')}* para *${description}*?\n\nDigite "sim" para confirmar ou "cancelar".`
    );
    return;
  }

  if (state.step === 1) {
    if (text?.toLowerCase() !== 'sim') {
      await clearState(phone);
      await sendText(phone, 'Pagamento cancelado. Como posso ajudar?');
      return;
    }
    const { amount, description } = state.data;
    const { paymentId, qrCodeBase64, qrCodeText } = await createPixCharge(phone, amount, description);
    await setState(phone, { ...state, step: 2, data: { ...state.data, paymentId } });
    await sendText(phone, `📋 *Pix copia e cola:*\n\n${qrCodeText}\n\nPix válido por 30 minutos.`);
    await sendImageBase64(phone, qrCodeBase64, 'QR Code Pix');
    return;
  }

  if (state.step === 2) {
    await sendText(phone, 'Aguardando confirmação do seu Pix. Digite "cancelar" para desistir.');
  }
}

async function handlePaymentWebhook(body, status) {
  if (status !== 'approved') return;
  const phone = body.external_reference;
  if (!phone) return;
  await sendNotification(phone, '✅ Pagamento recebido! Obrigado. Em breve entraremos em contato para confirmar os próximos passos.');
  await clearState(phone);
}

module.exports = { createPixCharge, handlePaymentFlow, handlePaymentWebhook };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/payment.test.js --no-coverage
```

Saída esperada: `PASS tests/payment.test.js` — 8 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/payment.js bot/tests/payment.test.js
git commit -m "feat: add payment module with Mercado Pago Pix"
```

---

## Task 5: Atualizar `webhook.js` — adicionar scheduling e payment

**Files:**
- Modify: `bot/src/webhook.js`
- Modify: `bot/tests/webhook.test.js`

- [ ] **Step 1: Atualizar imports e `processMessage` em `bot/src/webhook.js`**

Adicionar ao bloco de requires no topo:

```javascript
const { handleSchedulingFlow } = require('./scheduling');
const { handlePaymentFlow } = require('./payment');
```

Substituir a função `processMessage` completa:

```javascript
async function processMessage(phone, text) {
  const state = await getState(phone);

  if (state.flow === 'catalog') {
    await handleCatalogFlow(phone, state, text);
    return null;
  }
  if (state.flow === 'scheduling') {
    await handleSchedulingFlow(phone, state, text);
    return null;
  }
  if (state.flow === 'payment') {
    await handlePaymentFlow(phone, state, text);
    return null;
  }

  const history = await getHistory(phone);
  const reply = await chat(history, text);

  if (reply === '__TRANSFER__') {
    await setHumanMode(phone);
    return 'Conectando você a um atendente. Aguarde um momento.';
  }
  if (reply === '__CATALOG__') {
    await setState(phone, { flow: 'catalog', step: 0, data: {} });
    await handleCatalogFlow(phone, { flow: 'catalog', step: 0, data: {} }, text);
    return null;
  }
  if (reply === '__SCHEDULE__') {
    await setState(phone, { flow: 'scheduling', step: 0, data: {} });
    await handleSchedulingFlow(phone, { flow: 'scheduling', step: 0, data: {} }, text);
    return null;
  }
  if (reply?.startsWith('__PAYMENT__:')) {
    const parts = reply.split(':');
    const amount = parseFloat(parts[1]);
    const description = parts.slice(2).join(':');
    const newState = { flow: 'payment', step: 0, data: { amount, description } };
    await setState(phone, newState);
    await handlePaymentFlow(phone, newState, text);
    return null;
  }

  await appendHistory(phone, text, reply);
  return reply;
}
```

- [ ] **Step 2: Adicionar mocks e testes ao `bot/tests/webhook.test.js`**

Adicionar ao bloco de mocks no topo do arquivo:

```javascript
jest.mock('../src/scheduling', () => ({ handleSchedulingFlow: jest.fn() }));
jest.mock('../src/payment', () => ({ handlePaymentFlow: jest.fn() }));
```

Adicionar ao bloco de requires:

```javascript
const { handleSchedulingFlow } = require('../src/scheduling');
const { handlePaymentFlow } = require('../src/payment');
```

Adicionar no `beforeEach`:

```javascript
handleSchedulingFlow.mockResolvedValue(undefined);
handlePaymentFlow.mockResolvedValue(undefined);
```

Adicionar ao final do arquivo:

```javascript
test('roteia para handleSchedulingFlow quando flow=scheduling', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'scheduling', step: 1, data: {} });
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleSchedulingFlow).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'scheduling' }), 'Qual o horário de atendimento?');
});

test('roteia para handlePaymentFlow quando flow=payment', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'payment', step: 1, data: {} });
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handlePaymentFlow).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'payment' }), 'Qual o horário de atendimento?');
});

test('detecta __SCHEDULE__ e inicia flow de agendamento', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__SCHEDULE__');
  setState.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setState).toHaveBeenCalledWith('5511999999999', { flow: 'scheduling', step: 0, data: {} });
  expect(handleSchedulingFlow).toHaveBeenCalled();
});

test('detecta __PAYMENT__ e inicia flow de pagamento', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__PAYMENT__:50.00:Corte de cabelo');
  setState.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'payment', data: { amount: 50, description: 'Corte de cabelo' } }));
  expect(handlePaymentFlow).toHaveBeenCalled();
});
```

- [ ] **Step 3: Rodar todos os testes**

```bash
cd bot && npx jest --no-coverage
```

Saída esperada: `Test Suites: 9 passed, 9 total`

- [ ] **Step 4: Commit**

```bash
cd ..
git add bot/src/webhook.js bot/tests/webhook.test.js
git commit -m "feat: add scheduling and payment routing to webhook"
```

---

## Task 6: Atualizar `index.js` e `openai.js`

**Files:**
- Modify: `bot/src/index.js`
- Modify: `bot/src/openai.js`

- [ ] **Step 1: Substituir `bot/src/index.js` pelo conteúdo completo**

```javascript
require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');
const { registerWebhook } = require('./evolutionApi');
const { handlePaymentWebhook } = require('./payment');
const { sendNotification } = require('./notify');
const { rescheduleAllReminders } = require('./scheduling');

const app = express();
app.use(express.json());

app.post('/webhook', handleWebhook);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/notify', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }
  try {
    await sendNotification(phone, message);
    res.json({ sent: true });
  } catch (err) {
    console.error('Erro ao enviar notificação:', err.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.post('/payment/webhook', async (req, res) => {
  try {
    const status = req.query['data.status'] || req.body?.status;
    await handlePaymentWebhook(req.body, status);
    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao processar webhook de pagamento:', err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Bot rodando na porta ${PORT}`);

  try {
    await rescheduleAllReminders();
    console.log('Lembretes pendentes reagendados.');
  } catch (err) {
    console.warn('Aviso: não foi possível reagendar lembretes.', err.message);
  }

  const botUrl = process.env.BOT_WEBHOOK_URL || `http://bot:${PORT}`;
  try {
    await registerWebhook(botUrl);
    console.log(`Webhook registrado em ${botUrl}/webhook`);
  } catch (err) {
    console.warn('Aviso: não foi possível registrar webhook automaticamente.', err.message);
    console.warn(`Registre manualmente: PUT ${process.env.EVOLUTION_API_URL}/webhook/set/${process.env.EVOLUTION_INSTANCE}`);
  }
});
```

- [ ] **Step 2: Atualizar `buildSystemPrompt` em `bot/src/openai.js`**

Substituir o `return` da função `buildSystemPrompt` pelo conteúdo completo com todos os tokens:

```javascript
function buildSystemPrompt() {
  const faqText = company.faq
    .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
    .join('\n\n');
  return `Você é um assistente virtual da ${company.nome}.
${company.descricao}
Horário de atendimento: ${company.horario}
Contato: ${company.contato}

Perguntas frequentes:
${faqText}

Responda apenas dúvidas relacionadas à ${company.nome}. Se a pergunta não for sobre a empresa, informe educadamente que somente pode ajudar com dúvidas sobre a ${company.nome}.

INSTRUÇÕES ESPECIAIS — responda APENAS com o token abaixo (sem texto adicional) quando detectar estas intenções:
- Cliente quer falar com humano/atendente → responda exatamente: __TRANSFER__
- Cliente quer ver produtos, serviços, cardápio ou catálogo → responda exatamente: __CATALOG__
- Cliente quer agendar, marcar horário ou fazer reserva → responda exatamente: __SCHEDULE__
- Cliente quer pagar, gerar Pix ou fazer pagamento (menciona valor) → responda exatamente: __PAYMENT__:{valor_numerico}:{descricao}
  Exemplo: cliente diz "quero pagar R$ 50 pelo corte" → __PAYMENT__:50.00:Corte de cabelo`;
}
```

- [ ] **Step 3: Rodar todos os testes**

```bash
cd bot && npx jest --no-coverage
```

Saída esperada: `Test Suites: 9 passed, 9 total`

- [ ] **Step 4: Commit**

```bash
cd ..
git add bot/src/index.js bot/src/openai.js
git commit -m "feat: add payment webhook route, reminder reschedule and full intent tokens"
```
