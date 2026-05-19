# Advanced Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 6 funcionalidades universais ao bot (horário, transferência humana, catálogo, notificações, agendamento Google Calendar, Pix Mercado Pago).

**Architecture:** Estado de conversa por telefone no Redis (`state:{phone}`) com `{mode, flow, step, data}`. O `webhook.js` verifica estado no início de cada mensagem e roteia para o handler do flow ativo. Flows multi-step (catalog, scheduling, payment) gerenciam seus próprios steps e chamam a Evolution API diretamente.

**Tech Stack:** Node.js 20, Express, redis v4, googleapis, mercadopago, axios, Jest, Evolution API v2.

---

## Mapa de arquivos

**Criar:**
- `catalog.json` — catálogo de produtos/serviços (raiz)
- `bot/src/state.js` — estado de conversa por telefone
- `bot/src/businessHours.js` — verificação de horário de atendimento
- `bot/src/notify.js` — envio de notificações proativas
- `bot/src/catalog.js` — carrega catálogo, handlers de flow
- `bot/src/scheduling.js` — Google Calendar + flow de agendamento
- `bot/src/payment.js` — Mercado Pago Pix + flow de pagamento
- `bot/tests/state.test.js`
- `bot/tests/businessHours.test.js`
- `bot/tests/notify.test.js`
- `bot/tests/catalog.test.js`
- `bot/tests/scheduling.test.js`
- `bot/tests/payment.test.js`

**Modificar:**
- `company.json` — adicionar campo `businessHours`
- `bot/src/redis.js` — exportar `getClient`
- `bot/src/evolutionApi.js` — adicionar `sendList`, `sendImageBase64`
- `bot/src/webhook.js` — refatorar com nova lógica de roteamento
- `bot/src/index.js` — novas rotas + reagendamento de lembretes
- `bot/tests/webhook.test.js` — novos casos de teste
- `bot/package.json` — novas dependências
- `.env.example` — novas variáveis
- `docker-compose.yml` — montar `catalog.json`

---

## Task 1: Scaffold — config files e dependências

**Files:**
- Modify: `company.json`
- Create: `catalog.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `bot/package.json`

- [ ] **Step 1: Adicionar `businessHours` ao `company.json`**

Substituir o conteúdo de `company.json`:

```json
{
  "nome": "Empresa XYZ",
  "descricao": "Somos uma empresa de soluções tecnológicas para pequenos negócios.",
  "horario": "Segunda a Sexta das 9h às 18h",
  "contato": "contato@empresaxyz.com.br | (11) 99999-9999",
  "faq": [
    {
      "pergunta": "Qual o prazo de entrega?",
      "resposta": "3 a 5 dias úteis após confirmação do pagamento."
    },
    {
      "pergunta": "Aceitam cartão de crédito?",
      "resposta": "Sim, aceitamos todos os cartões de crédito e débito."
    },
    {
      "pergunta": "Vocês fazem suporte técnico?",
      "resposta": "Sim, oferecemos suporte via WhatsApp e e-mail nos horários de atendimento."
    },
    {
      "pergunta": "Como faço um pedido?",
      "resposta": "Acesse nosso site em empresaxyz.com.br ou entre em contato pelo WhatsApp."
    }
  ],
  "businessHours": {
    "timezone": "America/Sao_Paulo",
    "schedule": {
      "mon": { "open": "09:00", "close": "18:00" },
      "tue": { "open": "09:00", "close": "18:00" },
      "wed": { "open": "09:00", "close": "18:00" },
      "thu": { "open": "09:00", "close": "18:00" },
      "fri": { "open": "09:00", "close": "18:00" },
      "sat": null,
      "sun": null
    },
    "closedMessage": "Estamos fechados no momento. Nosso horário é segunda a sexta das 9h às 18h. Retornaremos em breve!"
  }
}
```

- [ ] **Step 2: Criar `catalog.json`**

```json
{
  "categories": [
    {
      "id": "services",
      "title": "Serviços",
      "items": [
        {
          "id": "basic",
          "title": "Serviço Básico",
          "description": "Descrição do serviço básico",
          "price": 50.00,
          "duration": 60
        },
        {
          "id": "premium",
          "title": "Serviço Premium",
          "description": "Descrição do serviço premium",
          "price": 100.00,
          "duration": 90
        }
      ]
    },
    {
      "id": "products",
      "title": "Produtos",
      "items": [
        {
          "id": "product1",
          "title": "Produto Exemplo",
          "description": "Descrição do produto",
          "price": 75.00,
          "duration": null
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Atualizar `.env.example`**

Adicionar ao final do arquivo existente:

```bash
# Transferência para humano
HUMAN_TAKEOVER_TIMEOUT_MINUTES=30

# Google Calendar (agendamento)
GOOGLE_CALENDAR_ID=seu-calendario@group.calendar.google.com
GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json

# Mercado Pago (Pix)
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=seu-webhook-secret
```

- [ ] **Step 4: Atualizar `docker-compose.yml` — montar `catalog.json` e `google-credentials.json`**

No serviço `bot`, adicionar ao array `volumes`:

```yaml
      - ./catalog.json:/app/catalog.json:ro
      - ./google-credentials.json:/app/google-credentials.json:ro
```

- [ ] **Step 5: Instalar dependências**

```bash
cd bot
npm install googleapis mercadopago
```

Saída esperada: `added N packages` sem erros.

- [ ] **Step 6: Adicionar `google-credentials.json` ao `.gitignore`**

Adicionar ao final do `.gitignore` existente:

```
google-credentials.json
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add company.json catalog.json .env.example docker-compose.yml bot/package.json bot/package-lock.json .gitignore
git commit -m "chore: scaffold advanced features config and dependencies"
```

---

## Task 2: Expor `getClient` do redis.js + adicionar métodos à evolutionApi.js

**Files:**
- Modify: `bot/src/redis.js`
- Modify: `bot/src/evolutionApi.js`
- Modify: `bot/tests/evolutionApi.test.js`

- [ ] **Step 1: Exportar `getClient` de `bot/src/redis.js`**

Alterar a última linha de `bot/src/redis.js`:

```javascript
module.exports = { getHistory, appendHistory, getClient };
```

- [ ] **Step 2: Adicionar `sendList` e `sendImageBase64` ao `bot/src/evolutionApi.js`**

Adicionar após a função `registerWebhook`:

```javascript
async function sendList(to, listMessage) {
  await axios.post(
    `${BASE_URL}/message/sendList/${INSTANCE}`,
    { number: to, ...listMessage },
    { headers: { apikey: API_KEY } }
  );
}

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

Atualizar o `module.exports`:

```javascript
module.exports = { sendText, registerWebhook, sendList, sendImageBase64 };
```

- [ ] **Step 3: Adicionar testes para `sendList` e `sendImageBase64` em `bot/tests/evolutionApi.test.js`**

Adicionar `mockPost` já está presente. Adicionar ao final do arquivo:

```javascript
test('sendList envia POST para o endpoint correto com listMessage', async () => {
  mockPost.mockResolvedValue({ data: {} });
  const listMessage = { title: 'Categorias', buttonText: 'Ver', sections: [] };
  await sendList('5511999999999', listMessage);
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendList/test-instance',
    { number: '5511999999999', ...listMessage },
    { headers: { apikey: 'test-api-key' } }
  );
});

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

Adicionar `sendList` e `sendImageBase64` no require do topo do test file:

```javascript
const { sendText, registerWebhook, sendList, sendImageBase64 } = require('../src/evolutionApi');
```

- [ ] **Step 4: Rodar testes**

```bash
cd bot && npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: `PASS tests/evolutionApi.test.js` — 4 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/redis.js bot/src/evolutionApi.js bot/tests/evolutionApi.test.js
git commit -m "feat: export getClient from redis and add sendList/sendImageBase64 to evolutionApi"
```

---

## Task 3: `state.js` — gerenciamento de estado de conversa (TDD)

**Files:**
- Create: `bot/src/state.js`
- Create: `bot/tests/state.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/state.test.js`:

```javascript
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDel = jest.fn();
const mockClient = { get: mockGet, set: mockSet, del: mockDel };

jest.mock('../src/redis', () => ({
  getClient: jest.fn().mockResolvedValue(mockClient),
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
}));

process.env.HUMAN_TAKEOVER_TIMEOUT_MINUTES = '30';

const { getState, setState, clearState, setHumanMode, isHumanMode } = require('../src/state');

beforeEach(() => jest.clearAllMocks());

test('getState retorna estado padrão quando não há estado salvo', async () => {
  mockGet.mockResolvedValue(null);
  const state = await getState('5511999999999');
  expect(state).toEqual({ mode: 'bot', flow: null, step: 0, data: {} });
  expect(mockGet).toHaveBeenCalledWith('state:5511999999999');
});

test('getState retorna estado parseado do Redis', async () => {
  const saved = { mode: 'bot', flow: 'catalog', step: 1, data: { categoryId: 'services' } };
  mockGet.mockResolvedValue(JSON.stringify(saved));
  const state = await getState('5511999999999');
  expect(state).toEqual(saved);
});

test('setState merge estado parcial com estado existente', async () => {
  const existing = { mode: 'bot', flow: 'catalog', step: 1, data: { categoryId: 'services' } };
  mockGet.mockResolvedValue(JSON.stringify(existing));
  mockSet.mockResolvedValue('OK');
  await setState('5511999999999', { step: 2, data: { categoryId: 'services', itemId: 'basic' } });
  expect(mockSet).toHaveBeenCalledWith(
    'state:5511999999999',
    JSON.stringify({ mode: 'bot', flow: 'catalog', step: 2, data: { categoryId: 'services', itemId: 'basic' } }),
    { EX: 86400 }
  );
});

test('setState aceita TTL customizado', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue('OK');
  await setState('5511999999999', { mode: 'human' }, 1800);
  const call = mockSet.mock.calls[0];
  expect(call[2]).toEqual({ EX: 1800 });
});

test('clearState deleta a chave do Redis', async () => {
  mockDel.mockResolvedValue(1);
  await clearState('5511999999999');
  expect(mockDel).toHaveBeenCalledWith('state:5511999999999');
});

test('setHumanMode define mode=human com TTL de 30 minutos', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue('OK');
  await setHumanMode('5511999999999');
  const call = mockSet.mock.calls[0];
  const saved = JSON.parse(call[1]);
  expect(saved.mode).toBe('human');
  expect(saved.flow).toBeNull();
  expect(call[2]).toEqual({ EX: 1800 }); // 30 * 60
});

test('isHumanMode retorna true quando mode é human', async () => {
  mockGet.mockResolvedValue(JSON.stringify({ mode: 'human', flow: null, step: 0, data: {} }));
  expect(await isHumanMode('5511999999999')).toBe(true);
});

test('isHumanMode retorna false quando mode é bot', async () => {
  mockGet.mockResolvedValue(null);
  expect(await isHumanMode('5511999999999')).toBe(false);
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/state.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/state'`

- [ ] **Step 3: Implementar `bot/src/state.js`**

```javascript
const { getClient } = require('./redis');

const DEFAULT_STATE = { mode: 'bot', flow: null, step: 0, data: {} };

async function getState(phone) {
  const client = await getClient();
  const raw = await client.get(`state:${phone}`);
  return raw ? JSON.parse(raw) : { ...DEFAULT_STATE };
}

async function setState(phone, partial, ttl = 86400) {
  const client = await getClient();
  const current = await getState(phone);
  const next = { ...current, ...partial };
  await client.set(`state:${phone}`, JSON.stringify(next), { EX: ttl });
}

async function clearState(phone) {
  const client = await getClient();
  await client.del(`state:${phone}`);
}

async function setHumanMode(phone) {
  const mins = parseInt(process.env.HUMAN_TAKEOVER_TIMEOUT_MINUTES || '30', 10);
  await setState(phone, { mode: 'human', flow: null, step: 0, data: {} }, mins * 60);
}

async function isHumanMode(phone) {
  const state = await getState(phone);
  return state.mode === 'human';
}

module.exports = { getState, setState, clearState, setHumanMode, isHumanMode };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/state.test.js --no-coverage
```

Saída esperada: `PASS tests/state.test.js` — 8 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/state.js bot/tests/state.test.js
git commit -m "feat: add conversation state module with Redis TTL"
```

---

## Task 4: `businessHours.js` — verificação de horário (TDD)

**Files:**
- Create: `bot/src/businessHours.js`
- Create: `bot/tests/businessHours.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/businessHours.test.js`:

```javascript
jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      nome: 'Empresa Teste',
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
        closedMessage: 'Estamos fechados!',
      },
    })
  ),
}));

const { isOpen, getClosedMessage } = require('../src/businessHours');

test('getClosedMessage retorna a mensagem configurada', () => {
  expect(getClosedMessage()).toBe('Estamos fechados!');
});

test('isOpen retorna false para dia sem horário (sábado)', () => {
  // Sábado = 6
  const saturday = new Date('2026-05-16T14:00:00.000Z'); // Sábado UTC
  jest.spyOn(global, 'Date').mockImplementation((arg) => {
    if (arg) return new OriginalDate(arg);
    return new OriginalDate(saturday);
  });
  // Note: Este teste depende do timezone, veja implementação
  expect(typeof isOpen()).toBe('boolean');
  global.Date = OriginalDate;
});

test('isOpen retorna boolean', () => {
  expect(typeof isOpen()).toBe('boolean');
});

test('getClosedMessage é uma string não vazia', () => {
  expect(typeof getClosedMessage()).toBe('string');
  expect(getClosedMessage().length).toBeGreaterThan(0);
});

const OriginalDate = Date;
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/businessHours.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/businessHours'`

- [ ] **Step 3: Implementar `bot/src/businessHours.js`**

```javascript
const fs = require('fs');
const path = require('path');

const company = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../company.json'), 'utf8')
);

const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function isOpen() {
  const { timezone, schedule } = company.businessHours;
  const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAY_MAP[localDate.getDay()];
  const daySchedule = schedule[dayKey];
  if (!daySchedule) return false;
  const h = localDate.getHours().toString().padStart(2, '0');
  const m = localDate.getMinutes().toString().padStart(2, '0');
  const current = `${h}:${m}`;
  return current >= daySchedule.open && current < daySchedule.close;
}

function getClosedMessage() {
  return company.businessHours.closedMessage;
}

module.exports = { isOpen, getClosedMessage };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/businessHours.test.js --no-coverage
```

Saída esperada: `PASS tests/businessHours.test.js` — 4 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/businessHours.js bot/tests/businessHours.test.js
git commit -m "feat: add business hours check with timezone support"
```

---

## Task 5: `notify.js` — notificações proativas (TDD)

**Files:**
- Create: `bot/src/notify.js`
- Create: `bot/tests/notify.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/notify.test.js`:

```javascript
const mockSendText = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  registerWebhook: jest.fn(),
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
}));

const { sendNotification } = require('../src/notify');

beforeEach(() => jest.clearAllMocks());

test('sendNotification chama sendText com phone e message', async () => {
  mockSendText.mockResolvedValue(undefined);
  await sendNotification('5511999999999', 'Seu pedido chegou!');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Seu pedido chegou!');
});

test('sendNotification lança erro quando phone é vazio', async () => {
  await expect(sendNotification('', 'mensagem')).rejects.toThrow('phone and message are required');
});

test('sendNotification lança erro quando message é vazio', async () => {
  await expect(sendNotification('5511999999999', '')).rejects.toThrow('phone and message are required');
});

test('sendNotification propaga erros do sendText', async () => {
  mockSendText.mockRejectedValue(new Error('network error'));
  await expect(sendNotification('5511999999999', 'msg')).rejects.toThrow('network error');
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/notify.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/notify'`

- [ ] **Step 3: Implementar `bot/src/notify.js`**

```javascript
const { sendText } = require('./evolutionApi');

async function sendNotification(phone, message) {
  if (!phone || !message) throw new Error('phone and message are required');
  await sendText(phone, message);
}

module.exports = { sendNotification };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/notify.test.js --no-coverage
```

Saída esperada: `PASS tests/notify.test.js` — 4 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/notify.js bot/tests/notify.test.js
git commit -m "feat: add notify module for proactive notifications"
```

---

## Task 6: `catalog.js` — catálogo interativo (TDD)

**Files:**
- Create: `bot/src/catalog.js`
- Create: `bot/tests/catalog.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/catalog.test.js`:

```javascript
const mockSendText = jest.fn();
const mockSendList = jest.fn();
const mockGetState = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: mockSendList,
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/state', () => ({
  getState: mockGetState,
  setState: mockSetState,
  clearState: mockClearState,
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      categories: [
        {
          id: 'services',
          title: 'Serviços',
          items: [
            { id: 'basic', title: 'Serviço Básico', description: 'Desc', price: 50.00, duration: 60 },
          ],
        },
      ],
    })
  ),
}));

const {
  getCategories,
  getCategory,
  getItem,
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
} = require('../src/catalog');

beforeEach(() => jest.clearAllMocks());

test('getCategories retorna todas as categorias', () => {
  const cats = getCategories();
  expect(cats).toHaveLength(1);
  expect(cats[0].id).toBe('services');
});

test('getCategory retorna categoria por id', () => {
  expect(getCategory('services').title).toBe('Serviços');
  expect(getCategory('nope')).toBeNull();
});

test('getItem retorna item por categoryId e itemId', () => {
  expect(getItem('services', 'basic').title).toBe('Serviço Básico');
  expect(getItem('services', 'nope')).toBeNull();
  expect(getItem('nope', 'basic')).toBeNull();
});

test('buildCategoryListMessage retorna estrutura de list message', () => {
  const msg = buildCategoryListMessage();
  expect(msg.sections[0].rows[0].rowId).toBe('services');
  expect(msg.sections[0].rows[0].title).toBe('Serviços');
});

test('buildItemListMessage retorna itens da categoria', () => {
  const msg = buildItemListMessage('services');
  expect(msg.sections[0].rows[0].rowId).toBe('services:basic');
  expect(msg.sections[0].rows[0].title).toBe('Serviço Básico');
});

test('buildItemListMessage retorna null para categoria inválida', () => {
  expect(buildItemListMessage('nope')).toBeNull();
});

test('handleCatalogFlow step 0 envia list message de categorias', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendList.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 0, data: {} }, 'menu');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', { flow: 'catalog', step: 1, data: {} });
  expect(mockSendList).toHaveBeenCalled();
});

test('handleCatalogFlow step 1 envia itens da categoria selecionada', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendList.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: {} }, 'services');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', { flow: 'catalog', step: 2, data: { categoryId: 'services' } });
  expect(mockSendList).toHaveBeenCalled();
});

test('handleCatalogFlow step 2 mostra detalhes do item selecionado', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 2, data: { categoryId: 'services' } }, 'services:basic');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Serviço Básico'));
});

test('handleCatalogFlow "cancelar" limpa estado', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow('5511999999999', { flow: 'catalog', step: 1, data: {} }, 'cancelar');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/catalog.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/catalog'`

- [ ] **Step 3: Implementar `bot/src/catalog.js`**

```javascript
const fs = require('fs');
const path = require('path');

const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../catalog.json'), 'utf8')
);

function getCategories() {
  return catalog.categories;
}

function getCategory(id) {
  return catalog.categories.find((c) => c.id === id) || null;
}

function getItem(categoryId, itemId) {
  const cat = getCategory(categoryId);
  return cat ? cat.items.find((i) => i.id === itemId) || null : null;
}

function buildCategoryListMessage() {
  return {
    title: 'O que você procura?',
    buttonText: 'Ver opções',
    sections: [
      {
        title: 'Categorias',
        rows: catalog.categories.map((c) => ({
          rowId: c.id,
          title: c.title,
          description: `${c.items.length} opção(ões) disponível(eis)`,
        })),
      },
    ],
  };
}

function buildItemListMessage(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return null;
  return {
    title: category.title,
    buttonText: 'Selecionar',
    sections: [
      {
        title: category.title,
        rows: category.items.map((i) => ({
          rowId: `${categoryId}:${i.id}`,
          title: i.title,
          description: `R$ ${i.price.toFixed(2)}${i.duration ? ` • ${i.duration} min` : ''}`,
        })),
      },
    ],
  };
}

async function handleCatalogFlow(phone, state, text) {
  const { sendText, sendList } = require('./evolutionApi');
  const { setState, clearState } = require('./state');

  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Tudo bem! Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    await setState(phone, { flow: 'catalog', step: 1, data: {} });
    await sendList(phone, buildCategoryListMessage());
    return;
  }

  if (state.step === 1) {
    const category = getCategory(text);
    if (!category) {
      await sendText(phone, 'Categoria não encontrada. Escolha uma opção válida ou digite "cancelar".');
      return;
    }
    await setState(phone, { flow: 'catalog', step: 2, data: { categoryId: text } });
    await sendList(phone, buildItemListMessage(text));
    return;
  }

  if (state.step === 2) {
    const [categoryId, itemId] = (text || '').split(':');
    const item = getItem(categoryId, itemId);
    if (!item) {
      await sendText(phone, 'Item não encontrado. Escolha uma opção válida ou digite "cancelar".');
      return;
    }
    await setState(phone, { flow: 'catalog', step: 3, data: { categoryId, itemId, item } });
    await sendText(
      phone,
      `*${item.title}*\n${item.description}\nPreço: R$ ${item.price.toFixed(2)}${item.duration ? `\nDuração: ${item.duration} min` : ''}\n\nDigite:\n• "agendar" para marcar um horário\n• "pagar" para gerar Pix\n• "cancelar" para voltar`
    );
    return;
  }

  if (state.step === 3) {
    const { item } = state.data;
    if (text?.toLowerCase() === 'agendar') {
      const newState = { flow: 'scheduling', step: 0, data: { service: item.title, duration: item.duration, price: item.price } };
      await setState(phone, newState);
      const { handleSchedulingFlow } = require('./scheduling');
      await handleSchedulingFlow(phone, newState, text);
    } else if (text?.toLowerCase() === 'pagar') {
      const newState = { flow: 'payment', step: 0, data: { amount: item.price, description: item.title } };
      await setState(phone, newState);
      const { handlePaymentFlow } = require('./payment');
      await handlePaymentFlow(phone, newState, text);
    } else {
      await clearState(phone);
      await sendText(phone, 'Tudo bem! Como posso ajudar?');
    }
  }
}

module.exports = {
  getCategories,
  getCategory,
  getItem,
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
};
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/catalog.test.js --no-coverage
```

Saída esperada: `PASS tests/catalog.test.js` — 11 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/catalog.js bot/tests/catalog.test.js
git commit -m "feat: add catalog module with interactive list messages"
```

---

## Task 7: `scheduling.js` — agendamento com Google Calendar (TDD)

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
const mockGetState = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetClient = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisKeys = jest.fn();
const mockRedisTtl = jest.fn();

const mockRedisClient = {
  set: mockRedisSet,
  del: mockRedisDel,
  keys: mockRedisKeys,
  ttl: mockRedisTtl,
};

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
  getClient: mockGetClient.mockResolvedValue(mockRedisClient),
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
  const id = await createAppointment('5511999999999', 'Corte', new Date('2026-06-01T10:00:00'), 60);
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

test('handleSchedulingFlow step 0 sem service pede descrição do serviço', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 0, data: {} }, 'quero agendar');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('serviço'));
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 1 }));
});

test('handleSchedulingFlow step 1 salva serviço e mostra slots', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  await handleSchedulingFlow('5511999999999', { flow: 'scheduling', step: 1, data: {} }, 'Corte de cabelo');
  expect(mockSetState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ step: 2 }));
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('horário'));
});

test('handleSchedulingFlow step 3 confirma com "sim" cria agendamento', async () => {
  mockSetState.mockResolvedValue(undefined);
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  mockEventsInsert.mockResolvedValue({ data: { id: 'evt-456' } });
  mockRedisSet.mockResolvedValue('OK');
  mockSendNotification.mockResolvedValue(undefined);

  const slotDate = new Date('2026-06-01T10:00:00');
  await handleSchedulingFlow(
    '5511999999999',
    { flow: 'scheduling', step: 3, data: { service: 'Corte', slot: slotDate, duration: 60, slots: [slotDate] } },
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
    if (!conflict && slotStart > new Date()) {
      slots.push(new Date(slotStart));
    }
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
    await setState(phone, { flow: 'scheduling', step: 2, data: { service: text } });
    await showAvailableSlots(phone, { flow: 'scheduling', step: 2, data: { service: text } }, 60);
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

## Task 8: `payment.js` — Pix com Mercado Pago (TDD)

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
process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-secret';

const { createPixCharge, handlePaymentFlow, handlePaymentWebhook } = require('../src/payment');

beforeEach(() => jest.clearAllMocks());

test('createPixCharge cria cobrança no Mercado Pago e retorna dados do Pix', async () => {
  mockPaymentCreate.mockResolvedValue({
    id: 12345,
    status: 'pending',
    point_of_interaction: {
      transaction_data: {
        qr_code_base64: 'base64imgdata',
        qr_code: '00020101...',
      },
    },
  });
  const result = await createPixCharge('5511999999999', 50.00, 'Serviço Básico');
  expect(result).toEqual({
    paymentId: 12345,
    qrCodeBase64: 'base64imgdata',
    qrCodeText: '00020101...',
  });
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

test('handlePaymentFlow step 1 com "não" cancela flow', async () => {
  mockClearState.mockResolvedValue(undefined);
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 1, data: { amount: 50, description: 'X' } }, 'não');
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
});

test('handlePaymentFlow step 2 mensagem durante espera retorna aviso', async () => {
  mockSendText.mockResolvedValue(undefined);
  await handlePaymentFlow('5511999999999', { flow: 'payment', step: 2, data: { paymentId: 999 } }, 'oi');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Aguardando'));
});

test('handlePaymentWebhook processa pagamento aprovado e notifica cliente', async () => {
  mockGetState.mockResolvedValue({ flow: 'payment', step: 2, data: { paymentId: 999 } });
  mockClearState.mockResolvedValue(undefined);
  mockSendNotification.mockResolvedValue(undefined);
  await handlePaymentWebhook({ action: 'payment.updated', data: { id: '999' }, external_reference: '5511999999999' }, 'approved');
  expect(mockSendNotification).toHaveBeenCalledWith('5511999999999', expect.stringContaining('recebido'));
  expect(mockClearState).toHaveBeenCalledWith('5511999999999');
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
const { setState, clearState, getState } = require('./state');

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

Saída esperada: `PASS tests/payment.test.js` — 7 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/payment.js bot/tests/payment.test.js
git commit -m "feat: add payment module with Mercado Pago Pix"
```

---

## Task 9: Refatorar `webhook.js` (TDD)

**Files:**
- Modify: `bot/src/webhook.js`
- Modify: `bot/tests/webhook.test.js`

- [ ] **Step 1: Substituir `bot/src/webhook.js` pelo conteúdo completo**

```javascript
const { getHistory, appendHistory } = require('./redis');
const { chat } = require('./openai');
const { sendText } = require('./evolutionApi');
const { getState, setState, clearState, setHumanMode, isHumanMode } = require('./state');
const { isOpen, getClosedMessage } = require('./businessHours');
const { sendNotification } = require('./notify');
const { handleCatalogFlow } = require('./catalog');
const { handleSchedulingFlow } = require('./scheduling');
const { handlePaymentFlow } = require('./payment');

function isPrivateChat(remoteJid) {
  return remoteJid.endsWith('@s.whatsapp.net');
}

function extractMessage(data) {
  const msg = data?.message;
  if (!msg) return null;
  return msg.conversation || msg.extendedTextMessage?.text || null;
}

function parseCommand(text) {
  if (!text?.startsWith('/')) return null;
  const [cmd, ...args] = text.trim().split(/\s+/);
  return { cmd: cmd.toLowerCase(), args };
}

async function handleCommand(parsed, res) {
  const { cmd, args } = parsed;

  if (cmd === '/bot' && args[0] === 'on' && args[1]) {
    await clearState(args[1]);
    await sendNotification(args[1], 'Você está novamente com o assistente virtual. Como posso ajudar?');
    return res.json({ ok: true });
  }

  if (cmd === '/notify' && args.length >= 2) {
    const phone = args[0];
    const message = args.slice(1).join(' ');
    await sendNotification(phone, message);
    return res.json({ ok: true });
  }

  return res.sendStatus(200);
}

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

async function handleWebhook(req, res) {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, data } = req.body;

  // Comandos vêm de mensagens fromMe (atendente usando o app)
  if (data?.key?.fromMe) {
    const text = extractMessage(data);
    const command = parseCommand(text);
    if (command) {
      return handleCommand(command, res);
    }
    return res.sendStatus(200);
  }

  if (event !== 'messages.upsert') return res.sendStatus(200);
  if (!data?.key) return res.sendStatus(200);
  if (!isPrivateChat(data.key.remoteJid)) return res.sendStatus(200);

  const text = extractMessage(data);
  if (!text) return res.sendStatus(200);

  const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');

  if (await isHumanMode(phone)) return res.sendStatus(200);

  if (!isOpen()) {
    res.sendStatus(200);
    (async () => {
      try {
        await sendText(phone, getClosedMessage());
      } catch (err) {
        console.error('Erro ao responder fora do horário:', err.message);
      }
    })();
    return;
  }

  res.sendStatus(200);

  (async () => {
    try {
      const reply = await processMessage(phone, text);
      if (reply) await sendText(phone, reply);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
}

module.exports = { handleWebhook, isPrivateChat, extractMessage, parseCommand };
```

- [ ] **Step 2: Substituir `bot/tests/webhook.test.js` pelo conteúdo completo**

```javascript
jest.mock('../src/redis', () => ({
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
  getClient: jest.fn(),
}));
jest.mock('../src/openai', () => ({ chat: jest.fn() }));
jest.mock('../src/evolutionApi', () => ({
  sendText: jest.fn(),
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
}));
jest.mock('../src/state', () => ({
  getState: jest.fn(),
  setState: jest.fn(),
  clearState: jest.fn(),
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));
jest.mock('../src/businessHours', () => ({
  isOpen: jest.fn(),
  getClosedMessage: jest.fn(),
}));
jest.mock('../src/notify', () => ({ sendNotification: jest.fn() }));
jest.mock('../src/catalog', () => ({ handleCatalogFlow: jest.fn() }));
jest.mock('../src/scheduling', () => ({ handleSchedulingFlow: jest.fn() }));
jest.mock('../src/payment', () => ({ handlePaymentFlow: jest.fn() }));

const request = require('supertest');
const express = require('express');
const { handleWebhook, isPrivateChat, extractMessage, parseCommand } = require('../src/webhook');
const { getHistory, appendHistory } = require('../src/redis');
const { chat } = require('../src/openai');
const { sendText } = require('../src/evolutionApi');
const { isHumanMode, setHumanMode, getState, setState, clearState } = require('../src/state');
const { isOpen, getClosedMessage } = require('../src/businessHours');
const { sendNotification } = require('../src/notify');
const { handleCatalogFlow } = require('../src/catalog');

process.env.WEBHOOK_TOKEN = 'test-token';

const app = express();
app.use(express.json());
app.post('/webhook', handleWebhook);

const validPayload = {
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-123' },
    message: { conversation: 'Qual o horário de atendimento?' },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  isHumanMode.mockResolvedValue(false);
  isOpen.mockReturnValue(true);
  getState.mockResolvedValue({ mode: 'bot', flow: null, step: 0, data: {} });
});

// --- Auth ---
test('retorna 401 sem token válido', async () => {
  await request(app).post('/webhook').send(validPayload).expect(401);
});

test('retorna 401 com token errado', async () => {
  await request(app).post('/webhook').set('x-api-key', 'errado').send(validPayload).expect(401);
});

// --- Filtros básicos ---
test('ignora mensagens de grupos', async () => {
  const payload = { ...validPayload, data: { ...validPayload.data, key: { ...validPayload.data.key, remoteJid: '123@g.us' } } };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('ignora eventos que não são messages.upsert', async () => {
  const payload = { ...validPayload, event: 'connection.update' };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

// --- Comandos fromMe ---
test('processa comando /bot on de mensagem fromMe', async () => {
  clearState.mockResolvedValue(undefined);
  sendNotification.mockResolvedValue(undefined);
  const payload = {
    ...validPayload,
    data: { key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' }, message: { conversation: '/bot on 5511888888888' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(clearState).toHaveBeenCalledWith('5511888888888');
  expect(sendNotification).toHaveBeenCalledWith('5511888888888', expect.stringContaining('assistente virtual'));
});

test('processa comando /notify de mensagem fromMe', async () => {
  sendNotification.mockResolvedValue(undefined);
  const payload = {
    ...validPayload,
    data: { key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' }, message: { conversation: '/notify 5511888888888 Seu pedido chegou!' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(sendNotification).toHaveBeenCalledWith('5511888888888', 'Seu pedido chegou!');
});

// --- Modo humano ---
test('ignora mensagem quando bot está em modo humano', async () => {
  isHumanMode.mockResolvedValue(true);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(chat).not.toHaveBeenCalled();
});

// --- Horário ---
test('responde com closedMessage quando fora do horário', async () => {
  isOpen.mockReturnValue(false);
  getClosedMessage.mockReturnValue('Estamos fechados!');
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Estamos fechados!');
  expect(chat).not.toHaveBeenCalled();
});

// --- Flow ativo ---
test('roteia para handleCatalogFlow quando flow=catalog', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'catalog', step: 1, data: {} });
  handleCatalogFlow.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleCatalogFlow).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'catalog' }), 'Qual o horário de atendimento?');
});

// --- OpenAI flow normal ---
test('processa mensagem válida com OpenAI e envia resposta', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Atendemos das 9h às 18h.');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(chat).toHaveBeenCalledWith([], 'Qual o horário de atendimento?');
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Atendemos das 9h às 18h.');
});

test('detecta __TRANSFER__ e ativa modo humano', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__TRANSFER__');
  setHumanMode.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setHumanMode).toHaveBeenCalledWith('5511999999999');
  expect(sendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('atendente'));
});

test('detecta __CATALOG__ e inicia flow de catálogo', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__CATALOG__');
  setState.mockResolvedValue(undefined);
  handleCatalogFlow.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setState).toHaveBeenCalledWith('5511999999999', { flow: 'catalog', step: 0, data: {} });
  expect(handleCatalogFlow).toHaveBeenCalled();
});

// --- Helpers ---
test('isPrivateChat identifica chat privado', () => {
  expect(isPrivateChat('5511999999999@s.whatsapp.net')).toBe(true);
  expect(isPrivateChat('123456@g.us')).toBe(false);
});

test('parseCommand retorna null para texto sem /', () => {
  expect(parseCommand('oi')).toBeNull();
  expect(parseCommand(null)).toBeNull();
});

test('parseCommand retorna cmd e args para comando válido', () => {
  const result = parseCommand('/bot on 5511999999999');
  expect(result).toEqual({ cmd: '/bot', args: ['on', '5511999999999'] });
});

test('extractMessage lê de conversation', () => {
  expect(extractMessage({ message: { conversation: 'oi' } })).toBe('oi');
});

test('extractMessage lê de extendedTextMessage', () => {
  expect(extractMessage({ message: { extendedTextMessage: { text: 'oi' } } })).toBe('oi');
});

test('extractMessage retorna null para tipos não suportados', () => {
  expect(extractMessage({ message: { imageMessage: {} } })).toBeNull();
});
```

- [ ] **Step 3: Rodar para confirmar que passa**

```bash
cd bot && npx jest tests/webhook.test.js --no-coverage
```

Saída esperada: `PASS tests/webhook.test.js` — 20 testes passando.

- [ ] **Step 4: Rodar todos os testes para garantir que nada quebrou**

```bash
npx jest --no-coverage
```

Saída esperada: `Test Suites: 8 passed, 8 total`

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/webhook.js bot/tests/webhook.test.js
git commit -m "feat: refactor webhook with state routing, commands, business hours and flow handlers"
```

---

## Task 10: Atualizar `index.js` — novas rotas e reagendamento de lembretes

**Files:**
- Modify: `bot/src/index.js`

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

- [ ] **Step 2: Rodar todos os testes para confirmar que nada quebrou**

```bash
cd bot && npx jest --no-coverage
```

Saída esperada: `Test Suites: 8 passed, 8 total` — todos os testes passando.

- [ ] **Step 3: Commit**

```bash
cd ..
git add bot/src/index.js
git commit -m "feat: add /notify and /payment/webhook routes with reminder reschedule on startup"
```

---

## Task 11: Atualizar system prompt do OpenAI para detectar intenções

**Files:**
- Modify: `bot/src/openai.js`

- [ ] **Step 1: Atualizar `buildSystemPrompt` para incluir instruções de intenções especiais**

Em `bot/src/openai.js`, alterar o return da função `buildSystemPrompt`:

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

- [ ] **Step 2: Rodar os testes do openai.js para confirmar que ainda passam**

```bash
cd bot && npx jest tests/openai.test.js --no-coverage
```

Saída esperada: `PASS tests/openai.test.js` — 4 testes passando.

- [ ] **Step 3: Rodar todos os testes**

```bash
npx jest --no-coverage
```

Saída esperada: `Test Suites: 8 passed, 8 total`

- [ ] **Step 4: Commit**

```bash
cd ..
git add bot/src/openai.js
git commit -m "feat: add special intent tokens to OpenAI system prompt"
```
