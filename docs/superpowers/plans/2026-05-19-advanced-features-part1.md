# Advanced Features — Parte 1: Core + Catálogo + Notificações

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar estado de conversa, horário de atendimento, transferência para humano, catálogo interativo e notificações proativas ao bot existente — sem dependências externas novas.

**Architecture:** Estado por telefone no Redis (`state:{phone}`) com `{mode, flow, step, data}`. O `webhook.js` verifica estado antes de processar, roteando para flow handlers quando ativo. OpenAI retorna tokens especiais (`__TRANSFER__`, `__CATALOG__`) para acionar transições de estado.

**Tech Stack:** Node.js 20, Express, redis v4, axios, Jest — sem novas dependências npm.

---

## Mapa de arquivos

**Criar:**
- `catalog.json` — catálogo de produtos/serviços (raiz)
- `bot/src/state.js` — estado de conversa por telefone
- `bot/src/businessHours.js` — verificação de horário de atendimento
- `bot/src/notify.js` — notificações proativas
- `bot/src/catalog.js` — catálogo interativo com list messages
- `bot/tests/state.test.js`
- `bot/tests/businessHours.test.js`
- `bot/tests/notify.test.js`
- `bot/tests/catalog.test.js`

**Modificar:**
- `company.json` — adicionar campo `businessHours`
- `bot/src/redis.js` — exportar `getClient`
- `bot/src/evolutionApi.js` — adicionar `sendList`
- `bot/src/webhook.js` — refatorar com roteamento de estado
- `bot/src/openai.js` — adicionar tokens de intenção ao system prompt
- `bot/src/index.js` — adicionar rota `POST /notify`
- `bot/tests/webhook.test.js` — atualizar com novos casos
- `bot/tests/evolutionApi.test.js` — adicionar teste de `sendList`
- `.env.example` — nova variável
- `.gitignore` — ignorar `google-credentials.json` (usado na Parte 2)
- `docker-compose.yml` — montar `catalog.json`

---

## Task 1: Scaffold — arquivos de configuração

**Files:**
- Modify: `company.json`
- Create: `catalog.json`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Adicionar `businessHours` ao `company.json`**

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

- [ ] **Step 3: Adicionar ao final de `.env.example`**

```bash
# Transferência para humano
HUMAN_TAKEOVER_TIMEOUT_MINUTES=30
```

- [ ] **Step 4: Adicionar ao final de `.gitignore`**

```
google-credentials.json
```

- [ ] **Step 5: Adicionar volume `catalog.json` ao serviço `bot` em `docker-compose.yml`**

No array `volumes` do serviço `bot`, adicionar:

```yaml
      - ./catalog.json:/app/catalog.json:ro
```

- [ ] **Step 6: Commit**

```bash
git add company.json catalog.json .env.example .gitignore docker-compose.yml
git commit -m "chore: scaffold part1 config files"
```

---

## Task 2: Expor `getClient` + adicionar `sendList` à `evolutionApi`

**Files:**
- Modify: `bot/src/redis.js`
- Modify: `bot/src/evolutionApi.js`
- Modify: `bot/tests/evolutionApi.test.js`

- [ ] **Step 1: Exportar `getClient` de `bot/src/redis.js`**

Alterar a última linha:

```javascript
module.exports = { getHistory, appendHistory, getClient };
```

- [ ] **Step 2: Adicionar `sendList` ao `bot/src/evolutionApi.js`**

Adicionar após `registerWebhook`:

```javascript
async function sendList(to, listMessage) {
  await axios.post(
    `${BASE_URL}/message/sendList/${INSTANCE}`,
    { number: to, ...listMessage },
    { headers: { apikey: API_KEY } }
  );
}
```

Atualizar `module.exports`:

```javascript
module.exports = { sendText, registerWebhook, sendList };
```

- [ ] **Step 3: Adicionar teste de `sendList` em `bot/tests/evolutionApi.test.js`**

Atualizar o `require` no topo:

```javascript
const { sendText, registerWebhook, sendList } = require('../src/evolutionApi');
```

Adicionar ao final do arquivo:

```javascript
test('sendList envia POST para o endpoint correto', async () => {
  mockPost.mockResolvedValue({ data: {} });
  const listMessage = { title: 'Categorias', buttonText: 'Ver', sections: [] };
  await sendList('5511999999999', listMessage);
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendList/test-instance',
    { number: '5511999999999', ...listMessage },
    { headers: { apikey: 'test-api-key' } }
  );
});
```

- [ ] **Step 4: Rodar testes**

```bash
cd bot && npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: `PASS tests/evolutionApi.test.js` — 3 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/redis.js bot/src/evolutionApi.js bot/tests/evolutionApi.test.js
git commit -m "feat: export getClient and add sendList to evolutionApi"
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

test('setState faz merge do estado parcial com estado existente', async () => {
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
  expect(mockSet.mock.calls[0][2]).toEqual({ EX: 1800 });
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
  const saved = JSON.parse(mockSet.mock.calls[0][1]);
  expect(saved.mode).toBe('human');
  expect(saved.flow).toBeNull();
  expect(mockSet.mock.calls[0][2]).toEqual({ EX: 1800 });
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

test('isOpen retorna boolean', () => {
  expect(typeof isOpen()).toBe('boolean');
});

test('getClosedMessage é uma string não vazia', () => {
  const msg = getClosedMessage();
  expect(typeof msg).toBe('string');
  expect(msg.length).toBeGreaterThan(0);
});
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

Saída esperada: `PASS tests/businessHours.test.js` — 3 testes passando.

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
const mockSetState = jest.fn();
const mockClearState = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: mockSendList,
  registerWebhook: jest.fn(),
}));

jest.mock('../src/state', () => ({
  getState: jest.fn(),
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
  expect(getCategories()).toHaveLength(1);
  expect(getCategories()[0].id).toBe('services');
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

Saída esperada: `PASS tests/catalog.test.js` — 10 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/catalog.js bot/tests/catalog.test.js
git commit -m "feat: add catalog module with interactive list messages"
```

---

## Task 7: Refatorar `webhook.js` (TDD)

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

  // flows de scheduling e payment serão adicionados na Parte 2
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

  await appendHistory(phone, text, reply);
  return reply;
}

async function handleWebhook(req, res) {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, data } = req.body;

  if (data?.key?.fromMe) {
    const text = extractMessage(data);
    const command = parseCommand(text);
    if (command) return handleCommand(command, res);
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

test('retorna 401 sem token válido', async () => {
  await request(app).post('/webhook').send(validPayload).expect(401);
});

test('retorna 401 com token errado', async () => {
  await request(app).post('/webhook').set('x-api-key', 'errado').send(validPayload).expect(401);
});

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

test('ignora mensagem quando bot está em modo humano', async () => {
  isHumanMode.mockResolvedValue(true);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(chat).not.toHaveBeenCalled();
});

test('responde com closedMessage quando fora do horário', async () => {
  isOpen.mockReturnValue(false);
  getClosedMessage.mockReturnValue('Estamos fechados!');
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Estamos fechados!');
  expect(chat).not.toHaveBeenCalled();
});

test('roteia para handleCatalogFlow quando flow=catalog', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'catalog', step: 1, data: {} });
  handleCatalogFlow.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleCatalogFlow).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'catalog' }), 'Qual o horário de atendimento?');
});

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

test('isPrivateChat identifica chat privado', () => {
  expect(isPrivateChat('5511999999999@s.whatsapp.net')).toBe(true);
  expect(isPrivateChat('123456@g.us')).toBe(false);
});

test('parseCommand retorna null para texto sem /', () => {
  expect(parseCommand('oi')).toBeNull();
  expect(parseCommand(null)).toBeNull();
});

test('parseCommand retorna cmd e args para comando válido', () => {
  expect(parseCommand('/bot on 5511999999999')).toEqual({ cmd: '/bot', args: ['on', '5511999999999'] });
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

Saída esperada: `PASS tests/webhook.test.js` — 18 testes passando.

- [ ] **Step 4: Rodar todos os testes**

```bash
npx jest --no-coverage
```

Saída esperada: `Test Suites: 7 passed, 7 total`

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/webhook.js bot/tests/webhook.test.js
git commit -m "feat: refactor webhook with state routing, commands and business hours"
```

---

## Task 8: Atualizar `index.js` — rota `/notify`

**Files:**
- Modify: `bot/src/index.js`

- [ ] **Step 1: Substituir `bot/src/index.js`**

```javascript
require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');
const { registerWebhook } = require('./evolutionApi');
const { sendNotification } = require('./notify');

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Bot rodando na porta ${PORT}`);
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

- [ ] **Step 2: Rodar todos os testes**

```bash
cd bot && npx jest --no-coverage
```

Saída esperada: `Test Suites: 7 passed, 7 total`

- [ ] **Step 3: Commit**

```bash
cd ..
git add bot/src/index.js
git commit -m "feat: add POST /notify route for proactive notifications"
```

---

## Task 9: Atualizar system prompt do OpenAI

**Files:**
- Modify: `bot/src/openai.js`

- [ ] **Step 1: Atualizar `buildSystemPrompt` em `bot/src/openai.js`**

Substituir o `return` da função `buildSystemPrompt`:

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
- Cliente quer ver produtos, serviços, cardápio ou catálogo → responda exatamente: __CATALOG__`;
}
```

- [ ] **Step 2: Rodar testes do openai**

```bash
cd bot && npx jest tests/openai.test.js --no-coverage
```

Saída esperada: `PASS tests/openai.test.js` — 4 testes passando.

- [ ] **Step 3: Rodar todos os testes**

```bash
npx jest --no-coverage
```

Saída esperada: `Test Suites: 7 passed, 7 total`

- [ ] **Step 4: Commit**

```bash
cd ..
git add bot/src/openai.js
git commit -m "feat: add TRANSFER and CATALOG intent tokens to system prompt"
```
