# JSON → DB Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate company.json, catalog.json, and contacts.json to PostgreSQL and build full CRUD management in the CRM dashboard.

**Architecture:** The bot gains a `config.js` module that queries the DB directly on every request (no cache). The CRM gains API routes and UI components for managing all configuration domains. The existing `pg` connection singleton pattern used in `crm.js` is reused throughout.

**Tech Stack:** Node.js + pg (bot), Next.js 14 + TypeScript + Tailwind + @hello-pangea/dnd (CRM), PostgreSQL

---

## File Map

**Create:**
- `bot/src/config.js` — async DB queries for company, catalog, contacts
- `bot/tests/config.test.js` — unit tests for config.js
- `crm/src/app/api/settings/company/route.ts` — GET + PATCH company settings
- `crm/src/app/api/catalog/categories/route.ts` — GET + POST categories
- `crm/src/app/api/catalog/categories/[id]/route.ts` — PATCH + DELETE category
- `crm/src/app/api/catalog/items/route.ts` — GET + POST items
- `crm/src/app/api/catalog/items/[id]/route.ts` — PATCH + DELETE item
- `crm/src/app/api/contacts/route.ts` — GET + POST contacts
- `crm/src/app/api/contacts/[id]/route.ts` — DELETE contact
- `crm/src/app/api/contacts/import/route.ts` — POST import leads as contacts
- `crm/src/components/CompanySettings.tsx` — empresa + horário de funcionamento + FAQ
- `crm/src/components/CatalogSettings.tsx` — categorias + itens com DnD
- `crm/src/components/ContactsSettings.tsx` — lista de contatos + modal de importação

**Modify:**
- `crm/db/migrate.js` — add 4 new tables
- `bot/src/openai.js` — async buildSystemPrompt, remove fs read
- `bot/src/businessHours.js` — async isOpen/getClosedMessage, remove fs read
- `bot/src/catalog.js` — async handlers, slug-based IDs, remove fs read
- `bot/src/broadcast.js` — async loadContacts, remove fs read
- `bot/src/webhook.js` — await async isOpen, getClosedMessage, loadContacts
- `bot/tests/openai.test.js` — mock config.js instead of fs
- `bot/tests/businessHours.test.js` — mock config.js instead of fs
- `bot/tests/catalog.test.js` — mock config.js instead of fs
- `bot/tests/broadcast.test.js` — mock config.js instead of fs
- `crm/src/app/settings/page.tsx` — add 3 new sections

**Delete:**
- `company.json`
- `catalog.json`
- `contacts.json`

---

## Task 1: DB Schema — Add 4 New Tables

**Files:**
- Modify: `crm/db/migrate.js`

- [ ] **Step 1: Add the 4 new CREATE TABLE statements** inside the existing `pool.query(` block in `crm/db/migrate.js`, after the `users` table:

```js
      CREATE TABLE IF NOT EXISTS company_settings (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL DEFAULT '',
        descricao TEXT DEFAULT '',
        horario VARCHAR(255) DEFAULT '',
        contato VARCHAR(255) DEFAULT '',
        faq JSONB NOT NULL DEFAULT '[]',
        timezone VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
        business_hours JSONB DEFAULT NULL,
        closed_message TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS catalog_categories (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS catalog_items (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES catalog_categories(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        price DECIMAL(10,2) NOT NULL,
        duration INTEGER,
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE(category_id, slug)
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
```

- [ ] **Step 2: Run the migration against the dev database**

```bash
cd /path/to/project
DATABASE_URL=postgresql://user:pass@localhost:5432/crm node crm/db/migrate.js
```

Expected output: `Migration complete.`

- [ ] **Step 3: Verify tables were created**

```bash
psql $DATABASE_URL -c "\dt"
```

Expected: `company_settings`, `catalog_categories`, `catalog_items`, `contacts` appear in the list.

- [ ] **Step 4: Commit**

```bash
git add crm/db/migrate.js
git commit -m "feat(db): add company_settings, catalog, and contacts tables"
```

---

## Task 2: bot/src/config.js — New DB Config Module

**Files:**
- Create: `bot/src/config.js`

- [ ] **Step 1: Write the failing test** in `bot/tests/config.test.js`:

```js
const mockQuery = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({ query: mockQuery })),
}));

process.env.DATABASE_URL = 'postgresql://test';

const { getCompanySettings, getCatalogCategories, getContacts } = require('../src/config');

beforeEach(() => jest.clearAllMocks());

test('getCompanySettings retorna a primeira linha da tabela company_settings', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ id: 1, nome: 'Empresa Teste', faq: [], business_hours: null }],
  });
  const result = await getCompanySettings();
  expect(result.nome).toBe('Empresa Teste');
  expect(mockQuery).toHaveBeenCalledWith(
    'SELECT * FROM company_settings LIMIT 1'
  );
});

test('getCompanySettings retorna null quando tabela está vazia', async () => {
  mockQuery.mockResolvedValue({ rows: [] });
  const result = await getCompanySettings();
  expect(result).toBeNull();
});

test('getCatalogCategories retorna categorias com itens aninhados', async () => {
  mockQuery
    .mockResolvedValueOnce({
      rows: [{ id: 1, slug: 'services', title: 'Serviços', position: 0 }],
    })
    .mockResolvedValueOnce({
      rows: [
        { id: 10, category_id: 1, slug: 'basic', title: 'Básico', description: '', price: '50.00', duration: 60, position: 0 },
      ],
    });
  const result = await getCatalogCategories();
  expect(result).toHaveLength(1);
  expect(result[0].slug).toBe('services');
  expect(result[0].items).toHaveLength(1);
  expect(result[0].items[0].slug).toBe('basic');
});

test('getCatalogCategories retorna array vazio quando não há categorias', async () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  const result = await getCatalogCategories();
  expect(result).toEqual([]);
});

test('getContacts retorna lista de contatos', async () => {
  mockQuery.mockResolvedValue({
    rows: [{ phone: '5511999999999', name: 'João' }],
  });
  const result = await getContacts();
  expect(result).toHaveLength(1);
  expect(result[0].phone).toBe('5511999999999');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd bot
npx jest tests/config.test.js --no-coverage
```

Expected: FAIL — `Cannot find module '../src/config'`

- [ ] **Step 3: Create `bot/src/config.js`**

```js
const { Pool } = require('pg');

let _pool;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

async function getCompanySettings() {
  const { rows } = await getPool().query('SELECT * FROM company_settings LIMIT 1');
  return rows[0] || null;
}

async function getCatalogCategories() {
  const pool = getPool();
  const { rows: categories } = await pool.query(
    'SELECT * FROM catalog_categories ORDER BY position ASC'
  );
  const { rows: items } = await pool.query(
    'SELECT * FROM catalog_items ORDER BY position ASC'
  );
  return categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
}

async function getContacts() {
  const { rows } = await getPool().query(
    'SELECT phone, name FROM contacts ORDER BY name ASC'
  );
  return rows;
}

module.exports = { getCompanySettings, getCatalogCategories, getContacts };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd bot
npx jest tests/config.test.js --no-coverage
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/config.js bot/tests/config.test.js
git commit -m "feat(bot): add config.js module for DB-driven configuration"
```

---

## Task 3: Refactor bot/src/openai.js

**Files:**
- Modify: `bot/src/openai.js`
- Modify: `bot/tests/openai.test.js`

- [ ] **Step 1: Update `bot/tests/openai.test.js`** — replace the `jest.mock('fs', ...)` block with a mock of `./config`, and make the `buildSystemPrompt` test async:

```js
const mockCreate = jest.fn();
const mockGetCompanySettings = jest.fn();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    audio: { transcriptions: { create: jest.fn() } },
  }))
);

jest.mock('../src/config', () => ({
  getCompanySettings: mockGetCompanySettings,
}));

process.env.OPENAI_API_KEY = 'test-key';

const { chat, buildSystemPrompt, chatWithImage } = require('../src/openai');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCompanySettings.mockResolvedValue({
    nome: 'Empresa Teste',
    descricao: 'Empresa de tecnologia.',
    horario: '9h às 18h',
    contato: 'teste@teste.com',
    faq: [{ pergunta: 'Qual o prazo?', resposta: '5 dias úteis.' }],
  });
});

test('buildSystemPrompt inclui nome e FAQ da empresa', async () => {
  const prompt = await buildSystemPrompt();
  expect(prompt).toContain('Empresa Teste');
  expect(prompt).toContain('Qual o prazo?');
  expect(prompt).toContain('5 dias úteis.');
});

test('buildSystemPrompt instrui o bot a responder só sobre a empresa', async () => {
  const prompt = await buildSystemPrompt();
  expect(prompt.toLowerCase()).toMatch(/responda apenas|somente/);
});

test('buildSystemPrompt retorna fallback quando company_settings está vazio', async () => {
  mockGetCompanySettings.mockResolvedValue(null);
  const prompt = await buildSystemPrompt();
  expect(typeof prompt).toBe('string');
  expect(prompt.length).toBeGreaterThan(0);
});

test('chat chama OpenAI com system prompt, histórico e mensagem do usuário', async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'São 5 dias úteis.' } }],
  });
  const history = [
    { role: 'user', content: 'oi' },
    { role: 'assistant', content: 'Olá! Como posso ajudar?' },
  ];
  const result = await chat(history, 'Qual o prazo de entrega?');
  expect(result).toBe('São 5 dias úteis.');
  const call = mockCreate.mock.calls[0][0];
  expect(call.messages[0].role).toBe('system');
  expect(call.messages[1]).toEqual({ role: 'user', content: 'oi' });
  expect(call.messages[call.messages.length - 1]).toEqual({
    role: 'user',
    content: 'Qual o prazo de entrega?',
  });
});

test('chat usa o modelo definido em OPENAI_MODEL', async () => {
  process.env.OPENAI_MODEL = 'gpt-4o';
  mockCreate.mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
  await chat([], 'teste');
  expect(mockCreate.mock.calls[0][0].model).toBe('gpt-4o');
  delete process.env.OPENAI_MODEL;
});

test('chatWithImage envia imagem base64 para GPT-4o e retorna resposta', async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'Vejo uma imagem de produto de beleza.' } }],
  });
  const result = await chatWithImage('base64data', 'O que é isso?');
  expect(result).toBe('Vejo uma imagem de produto de beleza.');
  const call = mockCreate.mock.calls[0][0];
  expect(call.model).toBe('gpt-4o');
  const userContent = call.messages[1].content;
  expect(userContent).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'image_url' }),
      expect.objectContaining({ type: 'text', text: 'O que é isso?' }),
    ])
  );
});

test('chatWithImage retorna fallback quando OpenAI não retorna choices', async () => {
  mockCreate.mockResolvedValue({ choices: [] });
  const result = await chatWithImage('base64data', '');
  expect(result).toBe('Não consegui analisar a imagem.');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot
npx jest tests/openai.test.js --no-coverage
```

Expected: FAIL — `buildSystemPrompt` is not async yet

- [ ] **Step 3: Rewrite `bot/src/openai.js`**

```js
const OpenAI = require('openai');
const { getCompanySettings } = require('./config');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function buildSystemPrompt() {
  const company = await getCompanySettings();
  if (!company) return 'Você é um assistente virtual. Responda apenas dúvidas relacionadas à empresa.';

  const faqText = (company.faq || [])
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

async function chat(history, userMessage) {
  const messages = [
    { role: 'system', content: await buildSystemPrompt() },
    ...history,
    { role: 'user', content: userMessage },
  ];
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
  });
  if (!response.choices?.length) {
    return 'Desculpe, não consegui processar sua mensagem no momento. Tente novamente.';
  }
  return response.choices[0].message.content;
}

async function chatWithImage(base64, caption) {
  const messages = [
    { role: 'system', content: await buildSystemPrompt() },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: caption || 'O que você vê nesta imagem? Responda no contexto da empresa.' },
      ],
    },
  ];
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    messages,
  });
  if (!response.choices?.length) return 'Não consegui analisar a imagem.';
  return response.choices[0].message.content;
}

module.exports = { chat, buildSystemPrompt, chatWithImage };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd bot
npx jest tests/openai.test.js --no-coverage
```

Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/openai.js bot/tests/openai.test.js
git commit -m "refactor(bot): make openai buildSystemPrompt async, read from DB"
```

---

## Task 4: Refactor bot/src/businessHours.js

**Files:**
- Modify: `bot/src/businessHours.js`
- Modify: `bot/tests/businessHours.test.js`

- [ ] **Step 1: Update `bot/tests/businessHours.test.js`**

```js
const mockGetCompanySettings = jest.fn();

jest.mock('../src/config', () => ({
  getCompanySettings: mockGetCompanySettings,
}));

const { isOpen, getClosedMessage } = require('../src/businessHours');

beforeEach(() => jest.clearAllMocks());

test('getClosedMessage retorna a mensagem configurada', async () => {
  mockGetCompanySettings.mockResolvedValue({ closed_message: 'Estamos fechados!' });
  expect(await getClosedMessage()).toBe('Estamos fechados!');
});

test('getClosedMessage retorna fallback quando company_settings está vazio', async () => {
  mockGetCompanySettings.mockResolvedValue(null);
  const msg = await getClosedMessage();
  expect(typeof msg).toBe('string');
  expect(msg.length).toBeGreaterThan(0);
});

test('isOpen retorna true quando business_hours é null (24h)', async () => {
  mockGetCompanySettings.mockResolvedValue({ business_hours: null });
  expect(await isOpen()).toBe(true);
});

test('isOpen retorna true quando company_settings está vazio', async () => {
  mockGetCompanySettings.mockResolvedValue(null);
  expect(await isOpen()).toBe(true);
});

test('isOpen retorna false quando dia não tem horário configurado', async () => {
  mockGetCompanySettings.mockResolvedValue({
    timezone: 'America/Sao_Paulo',
    business_hours: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  });
  expect(await isOpen()).toBe(false);
});

test('isOpen retorna boolean', async () => {
  mockGetCompanySettings.mockResolvedValue({
    timezone: 'America/Sao_Paulo',
    business_hours: {
      mon: { open: '09:00', close: '18:00' },
      tue: { open: '09:00', close: '18:00' },
      wed: { open: '09:00', close: '18:00' },
      thu: { open: '09:00', close: '18:00' },
      fri: { open: '09:00', close: '18:00' },
      sat: null,
      sun: null,
    },
  });
  const result = await isOpen();
  expect(typeof result).toBe('boolean');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot
npx jest tests/businessHours.test.js --no-coverage
```

Expected: FAIL — `isOpen` is not async

- [ ] **Step 3: Rewrite `bot/src/businessHours.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd bot
npx jest tests/businessHours.test.js --no-coverage
```

Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/businessHours.js bot/tests/businessHours.test.js
git commit -m "refactor(bot): make businessHours async, read from DB"
```

---

## Task 5: Refactor bot/src/catalog.js

**Files:**
- Modify: `bot/src/catalog.js`
- Modify: `bot/tests/catalog.test.js`

**Key change:** Categories and items are now identified by `slug` (string), not integer `id`. The `price` field comes from Postgres as a string — use `parseFloat()` when formatting.

- [ ] **Step 1: Update `bot/tests/catalog.test.js`**

```js
const mockSendText = jest.fn();
const mockSendList = jest.fn();
const mockSetState = jest.fn();
const mockClearState = jest.fn();
const mockGetCatalogCategories = jest.fn();

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

jest.mock('../src/config', () => ({
  getCatalogCategories: mockGetCatalogCategories,
}));

const MOCK_CATEGORIES = [
  {
    id: 1,
    slug: 'services',
    title: 'Serviços',
    position: 0,
    items: [
      { id: 10, category_id: 1, slug: 'basic', title: 'Serviço Básico', description: 'Desc', price: '50.00', duration: 60, position: 0 },
    ],
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCatalogCategories.mockResolvedValue(MOCK_CATEGORIES);
});

const {
  getCategories,
  getCategory,
  getItem,
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
} = require('../src/catalog');

test('getCategories retorna todas as categorias', async () => {
  const cats = await getCategories();
  expect(cats).toHaveLength(1);
  expect(cats[0].slug).toBe('services');
});

test('getCategory retorna categoria por slug', async () => {
  expect((await getCategory('services')).title).toBe('Serviços');
  expect(await getCategory('nope')).toBeNull();
});

test('getItem retorna item por categorySlug e itemSlug', async () => {
  expect((await getItem('services', 'basic')).title).toBe('Serviço Básico');
  expect(await getItem('services', 'nope')).toBeNull();
  expect(await getItem('nope', 'basic')).toBeNull();
});

test('buildCategoryListMessage retorna estrutura de list message com slug como rowId', async () => {
  const msg = await buildCategoryListMessage();
  expect(msg.sections[0].rows[0].rowId).toBe('services');
  expect(msg.sections[0].rows[0].title).toBe('Serviços');
});

test('buildItemListMessage retorna itens da categoria com rowId "catSlug:itemSlug"', async () => {
  const msg = await buildItemListMessage('services');
  expect(msg.sections[0].rows[0].rowId).toBe('services:basic');
  expect(msg.sections[0].rows[0].title).toBe('Serviço Básico');
});

test('buildItemListMessage retorna null para categoria inválida', async () => {
  expect(await buildItemListMessage('nope')).toBeNull();
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

test('handleCatalogFlow step 3 mantém fluxo em resposta inválida', async () => {
  mockSendText.mockResolvedValue(undefined);
  await handleCatalogFlow(
    '5511999999999',
    { flow: 'catalog', step: 3, data: { item: { title: 'Serviço Básico', price: '50.00', duration: 60 } } },
    'talvez'
  );
  expect(mockClearState).not.toHaveBeenCalled();
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('Resposta inválida'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot
npx jest tests/catalog.test.js --no-coverage
```

Expected: FAIL — functions are not async

- [ ] **Step 3: Rewrite `bot/src/catalog.js`**

```js
const { getCatalogCategories } = require('./config');
const { sendText, sendList } = require('./evolutionApi');
const { setState, clearState } = require('./state');

async function getCategories() {
  return getCatalogCategories();
}

async function getCategory(slug) {
  const categories = await getCatalogCategories();
  return categories.find((c) => c.slug === slug) || null;
}

async function getItem(categorySlug, itemSlug) {
  const cat = await getCategory(categorySlug);
  return cat ? cat.items.find((i) => i.slug === itemSlug) || null : null;
}

async function buildCategoryListMessage() {
  const categories = await getCatalogCategories();
  return {
    title: 'O que você procura?',
    buttonText: 'Ver opções',
    sections: [
      {
        title: 'Categorias',
        rows: categories.map((c) => ({
          rowId: c.slug,
          title: c.title,
          description: `${c.items.length} opção(ões) disponível(eis)`,
        })),
      },
    ],
  };
}

async function buildItemListMessage(categorySlug) {
  const category = await getCategory(categorySlug);
  if (!category) return null;
  return {
    title: category.title,
    buttonText: 'Selecionar',
    sections: [
      {
        title: category.title,
        rows: category.items.map((i) => ({
          rowId: `${categorySlug}:${i.slug}`,
          title: i.title,
          description: `R$ ${parseFloat(i.price).toFixed(2)}${i.duration ? ` • ${i.duration} min` : ''}`,
        })),
      },
    ],
  };
}

async function handleCatalogFlow(phone, state, text) {
  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Tudo bem! Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    await setState(phone, { flow: 'catalog', step: 1, data: {} });
    await sendList(phone, await buildCategoryListMessage());
    return;
  }

  if (state.step === 1) {
    const category = await getCategory(text);
    if (!category) {
      await sendText(phone, 'Categoria não encontrada. Escolha uma opção válida ou digite "cancelar".');
      return;
    }
    await setState(phone, { flow: 'catalog', step: 2, data: { categoryId: text } });
    await sendList(phone, await buildItemListMessage(text));
    return;
  }

  if (state.step === 2) {
    const [categorySlug, itemSlug] = (text || '').split(':');
    const item = await getItem(categorySlug, itemSlug);
    if (!item) {
      await sendText(phone, 'Item não encontrado. Escolha uma opção válida ou digite "cancelar".');
      return;
    }
    const price = parseFloat(item.price);
    await setState(phone, { flow: 'catalog', step: 3, data: { categoryId: categorySlug, itemId: itemSlug, item: { ...item, price } } });
    await sendText(
      phone,
      `*${item.title}*\n${item.description}\nPreço: R$ ${price.toFixed(2)}${item.duration ? `\nDuração: ${item.duration} min` : ''}\n\nDigite:\n• "agendar" para marcar um horário\n• "pagar" para gerar Pix\n• "cancelar" para voltar`
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
      await sendText(phone, 'Resposta inválida. Digite "agendar", "pagar" ou "cancelar".');
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd bot
npx jest tests/catalog.test.js --no-coverage
```

Expected: PASS — 11 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/catalog.js bot/tests/catalog.test.js
git commit -m "refactor(bot): make catalog async, use slug identifiers from DB"
```

---

## Task 6: Refactor bot/src/broadcast.js

**Files:**
- Modify: `bot/src/broadcast.js`
- Modify: `bot/tests/broadcast.test.js`

- [ ] **Step 1: Update `bot/tests/broadcast.test.js`**

```js
const mockSendText = jest.fn();
const mockGetContacts = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: jest.fn(),
}));

jest.mock('../src/config', () => ({
  getContacts: mockGetContacts,
}));

process.env.BROADCAST_DELAY_MS = '0';

const { sendBroadcast } = require('../src/broadcast');

beforeEach(() => jest.clearAllMocks());

test('sendBroadcast envia mensagem para todos os contatos e retorna contadores', async () => {
  mockGetContacts.mockResolvedValue([
    { phone: '5511999999999', name: 'João' },
    { phone: '5511888888888', name: 'Maria' },
  ]);
  mockSendText.mockResolvedValue(undefined);
  const result = await sendBroadcast('Promoção especial!');
  expect(mockSendText).toHaveBeenCalledTimes(2);
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Promoção especial!');
  expect(mockSendText).toHaveBeenCalledWith('5511888888888', 'Promoção especial!');
  expect(result).toEqual({ sent: 2, failed: 0 });
});

test('sendBroadcast conta falhas sem interromper envio para os demais', async () => {
  mockGetContacts.mockResolvedValue([
    { phone: '5511999999999', name: 'João' },
    { phone: '5511888888888', name: 'Maria' },
  ]);
  mockSendText
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('timeout'));
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 1, failed: 1 });
});

test('sendBroadcast retorna { sent: 0, failed: 0 } para lista vazia', async () => {
  mockGetContacts.mockResolvedValue([]);
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 0, failed: 0 });
  expect(mockSendText).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd bot
npx jest tests/broadcast.test.js --no-coverage
```

Expected: FAIL — `loadContacts` does not exist or is sync

- [ ] **Step 3: Rewrite `bot/src/broadcast.js`**

```js
const { getContacts } = require('./config');
const { sendText } = require('./evolutionApi');

async function sendBroadcast(message) {
  const contacts = await getContacts();
  const delay = parseInt(process.env.BROADCAST_DELAY_MS || '1000', 10);
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (i > 0 && delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const phone = typeof contacts[i] === 'string' ? contacts[i] : contacts[i].phone;
    try {
      await sendText(phone, message);
      sent++;
    } catch (err) {
      console.error(`Erro ao enviar broadcast para ${phone}:`, err.message);
      failed++;
    }
  }

  return { sent, failed };
}

module.exports = { sendBroadcast };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd bot
npx jest tests/broadcast.test.js --no-coverage
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/broadcast.js bot/tests/broadcast.test.js
git commit -m "refactor(bot): make broadcast async, read contacts from DB"
```

---

## Task 7: Update bot/src/webhook.js for Async Calls

**Files:**
- Modify: `bot/src/webhook.js`

- [ ] **Step 1: Remove `loadContacts` import and add `await` to `isOpen`, `getClosedMessage`**

Find the line:
```js
const { sendBroadcast, loadContacts } = require('./broadcast');
```
Replace with:
```js
const { sendBroadcast } = require('./broadcast');
```

- [ ] **Step 2: Update the business hours check** — find:
```js
  if (!isOpen()) {
    res.sendStatus(200);
    (async () => {
      try {
        await upsertLead(phone, pushName, incomingContent, messageType);
        await addInteraction(phone, incomingContent, 'in', messageType);
        await sendText(phone, getClosedMessage());
        await addInteraction(phone, getClosedMessage(), 'out', 'text');
```
Replace with:
```js
  if (!await isOpen()) {
    res.sendStatus(200);
    (async () => {
      try {
        const closedMsg = await getClosedMessage();
        await upsertLead(phone, pushName, incomingContent, messageType);
        await addInteraction(phone, incomingContent, 'in', messageType);
        await sendText(phone, closedMsg);
        await addInteraction(phone, closedMsg, 'out', 'text');
```

- [ ] **Step 3: Update the `/broadcast` command handler** — find:
```js
  if (cmd === '/broadcast' && args.length >= 1) {
    const message = args.join(' ');
    const contacts = loadContacts();
    (async () => {
      try {
        await sendBroadcast(message);
      } catch (err) {
        console.error('Erro no broadcast:', err.message);
      }
    })();
    return res.json({ ok: true, queued: contacts.length });
  }
```
Replace with:
```js
  if (cmd === '/broadcast' && args.length >= 1) {
    const message = args.join(' ');
    (async () => {
      try {
        await sendBroadcast(message);
      } catch (err) {
        console.error('Erro no broadcast:', err.message);
      }
    })();
    return res.json({ ok: true });
  }
```

- [ ] **Step 4: Run the full test suite**

```bash
cd bot
npm test
```

Expected: all tests pass (14 test files). The webhook test uses supertest — if it fails with `EPERM`, run with `sudo` or check port availability.

- [ ] **Step 5: Commit**

```bash
git add bot/src/webhook.js
git commit -m "refactor(bot): await async isOpen/getClosedMessage in webhook"
```

---

## Task 8: Delete JSON Files

**Files:**
- Delete: `company.json`, `catalog.json`, `contacts.json`

- [ ] **Step 1: Delete the files**

```bash
rm company.json catalog.json contacts.json
```

- [ ] **Step 2: Check no remaining references**

```bash
grep -r "company\.json\|catalog\.json\|contacts\.json" bot/src/
```

Expected: no output (no remaining references)

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "chore: remove JSON config files, DB is now the source of truth"
```

---

## Task 9: CRM API — Company Settings Route

**Files:**
- Create: `crm/src/app/api/settings/company/route.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p crm/src/app/api/settings/company
```

- [ ] **Step 2: Create `crm/src/app/api/settings/company/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM company_settings LIMIT 1');
  return NextResponse.json(rows[0] || null);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const allowed = ['nome', 'descricao', 'horario', 'contato', 'faq', 'timezone', 'business_hours', 'closed_message'];
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (key in body) {
      values.push(key === 'faq' || key === 'business_hours' ? JSON.stringify(body[key]) : body[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  const pool = getPool();
  const { rows: existing } = await pool.query('SELECT id FROM company_settings LIMIT 1');

  if (existing.length === 0) {
    const cols = sets.map((s) => s.split(' = ')[0]).join(', ');
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO company_settings (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return NextResponse.json(rows[0]);
  }

  values.push(existing[0].id);
  const { rows } = await pool.query(
    `UPDATE company_settings SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return NextResponse.json(rows[0]);
}
```

- [ ] **Step 3: Test manually**

```bash
# GET (deve retornar null ou o registro existente)
curl -s -H "Cookie: <session>" http://localhost:3000/api/settings/company

# PATCH para criar/atualizar
curl -s -X PATCH http://localhost:3000/api/settings/company \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"nome":"Minha Empresa","faq":[],"business_hours":null}'
```

Expected: JSON com o registro salvo

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/api/settings/company/route.ts
git commit -m "feat(crm): add company settings API route"
```

---

## Task 10: CRM API — Catalog Categories Routes

**Files:**
- Create: `crm/src/app/api/catalog/categories/route.ts`
- Create: `crm/src/app/api/catalog/categories/[id]/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p crm/src/app/api/catalog/categories/\[id\]
```

- [ ] **Step 2: Create `crm/src/app/api/catalog/categories/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows: categories } = await pool.query(
    'SELECT * FROM catalog_categories ORDER BY position ASC'
  );
  const { rows: items } = await pool.query(
    'SELECT * FROM catalog_items ORDER BY position ASC'
  );
  const result = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, slug } = await req.json();
  if (!title || !slug) return NextResponse.json({ error: 'title and slug are required' }, { status: 400 });

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM catalog_categories'
  );
  const { rows } = await pool.query(
    'INSERT INTO catalog_categories (slug, title, position) VALUES ($1, $2, $3) RETURNING *',
    [slug, title, maxRows[0].pos]
  );
  return NextResponse.json({ ...rows[0], items: [] }, { status: 201 });
}
```

- [ ] **Step 3: Create `crm/src/app/api/catalog/categories/[id]/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, slug, position } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { values.push(title); sets.push(`title = $${values.length}`); }
  if (slug !== undefined) { values.push(slug); sets.push(`slug = $${values.length}`); }
  if (position !== undefined) { values.push(position); sets.push(`position = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE catalog_categories SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM catalog_categories WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/api/catalog/
git commit -m "feat(crm): add catalog categories API routes"
```

---

## Task 11: CRM API — Catalog Items Routes

**Files:**
- Create: `crm/src/app/api/catalog/items/route.ts`
- Create: `crm/src/app/api/catalog/items/[id]/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p crm/src/app/api/catalog/items/\[id\]
```

- [ ] **Step 2: Create `crm/src/app/api/catalog/items/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('category_id');

  const pool = getPool();
  const { rows } = categoryId
    ? await pool.query('SELECT * FROM catalog_items WHERE category_id = $1 ORDER BY position ASC', [categoryId])
    : await pool.query('SELECT * FROM catalog_items ORDER BY position ASC');
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category_id, slug, title, description, price, duration } = await req.json();
  if (!category_id || !slug || !title || price === undefined) {
    return NextResponse.json({ error: 'category_id, slug, title, and price are required' }, { status: 400 });
  }

  const pool = getPool();
  const { rows: maxRows } = await pool.query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM catalog_items WHERE category_id = $1',
    [category_id]
  );
  const { rows } = await pool.query(
    `INSERT INTO catalog_items (category_id, slug, title, description, price, duration, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [category_id, slug, title, description || '', price, duration || null, maxRows[0].pos]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 3: Create `crm/src/app/api/catalog/items/[id]/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, slug, description, price, duration, position } = await req.json();
  const pool = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { values.push(title); sets.push(`title = $${values.length}`); }
  if (slug !== undefined) { values.push(slug); sets.push(`slug = $${values.length}`); }
  if (description !== undefined) { values.push(description); sets.push(`description = $${values.length}`); }
  if (price !== undefined) { values.push(price); sets.push(`price = $${values.length}`); }
  if (duration !== undefined) { values.push(duration); sets.push(`duration = $${values.length}`); }
  if (position !== undefined) { values.push(position); sets.push(`position = $${values.length}`); }

  if (sets.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });

  values.push(params.id);
  const { rows } = await pool.query(
    `UPDATE catalog_items SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM catalog_items WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Commit**

```bash
git add crm/src/app/api/catalog/items/
git commit -m "feat(crm): add catalog items API routes"
```

---

## Task 12: CRM API — Contacts Routes

**Files:**
- Create: `crm/src/app/api/contacts/route.ts`
- Create: `crm/src/app/api/contacts/[id]/route.ts`
- Create: `crm/src/app/api/contacts/import/route.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p crm/src/app/api/contacts/\[id\]
mkdir -p crm/src/app/api/contacts/import
```

- [ ] **Step 2: Create `crm/src/app/api/contacts/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { phone, name } = await req.json();
  if (!phone) return NextResponse.json({ error: 'phone is required' }, { status: 400 });

  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO contacts (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING *',
    [phone, name || null]
  );
  return NextResponse.json(rows[0], { status: 201 });
}
```

- [ ] **Step 3: Create `crm/src/app/api/contacts/[id]/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

interface Params { params: { id: string } }

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const pool = getPool();
  await pool.query('DELETE FROM contacts WHERE id = $1', [params.id]);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Create `crm/src/app/api/contacts/import/route.ts`** — imports selected leads into the contacts table:

```ts
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lead_ids } = await req.json();
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return NextResponse.json({ error: 'lead_ids array is required' }, { status: 400 });
  }

  const pool = getPool();
  const placeholders = lead_ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows: leads } = await pool.query(
    `SELECT phone, name FROM leads WHERE id IN (${placeholders})`,
    lead_ids
  );

  let imported = 0;
  for (const lead of leads) {
    await pool.query(
      'INSERT INTO contacts (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name',
      [lead.phone, lead.name]
    );
    imported++;
  }

  return NextResponse.json({ imported });
}
```

- [ ] **Step 5: Commit**

```bash
git add crm/src/app/api/contacts/
git commit -m "feat(crm): add contacts API routes with import from leads"
```

---

## Task 13: CRM UI — CompanySettings Component

This component manages empresa info, horário de funcionamento (with 24h toggle), and FAQ.

**Files:**
- Create: `crm/src/components/CompanySettings.tsx`

- [ ] **Step 1: Create `crm/src/components/CompanySettings.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface FaqItem { pergunta: string; resposta: string; }

interface DaySchedule { open: string; close: string; }

interface BusinessHours {
  [key: string]: DaySchedule | null;
}

interface CompanyData {
  id?: number;
  nome: string;
  descricao: string;
  horario: string;
  contato: string;
  faq: FaqItem[];
  timezone: string;
  business_hours: BusinessHours | null;
  closed_message: string;
}

const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: null,
  sun: null,
};

export default function CompanySettings({ initial }: { initial: CompanyData | null }) {
  const empty: CompanyData = {
    nome: '', descricao: '', horario: '', contato: '',
    faq: [], timezone: 'America/Sao_Paulo',
    business_hours: DEFAULT_HOURS, closed_message: '',
  };
  const [data, setData] = useState<CompanyData>(initial || empty);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const is24h = data.business_hours === null;

  const update = (patch: Partial<CompanyData>) => setData((d) => ({ ...d, ...patch }));

  const addFaq = () => update({ faq: [...data.faq, { pergunta: '', resposta: '' }] });

  const updateFaq = (i: number, field: 'pergunta' | 'resposta', value: string) => {
    const faq = data.faq.map((f, idx) => idx === i ? { ...f, [field]: value } : f);
    update({ faq });
  };

  const removeFaq = (i: number) => update({ faq: data.faq.filter((_, idx) => idx !== i) });

  const toggleDay = (key: string) => {
    const bh = { ...(data.business_hours || DEFAULT_HOURS) };
    bh[key] = bh[key] ? null : { open: '09:00', close: '18:00' };
    update({ business_hours: bh });
  };

  const updateDayHour = (key: string, field: 'open' | 'close', value: string) => {
    const bh = { ...(data.business_hours || DEFAULT_HOURS) };
    bh[key] = { ...(bh[key] as DaySchedule), [field]: value };
    update({ business_hours: bh });
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="space-y-8">
      {/* Empresa */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Empresa</h2>
        <div className="space-y-3">
          <input className={inputClass} placeholder="Nome da empresa" value={data.nome} onChange={(e) => update({ nome: e.target.value })} />
          <textarea className={inputClass} rows={2} placeholder="Descrição" value={data.descricao} onChange={(e) => update({ descricao: e.target.value })} />
          <input className={inputClass} placeholder="Horário de atendimento (texto, ex: Seg-Sex 9h–18h)" value={data.horario} onChange={(e) => update({ horario: e.target.value })} />
          <input className={inputClass} placeholder="Contato (e-mail, telefone)" value={data.contato} onChange={(e) => update({ contato: e.target.value })} />
        </div>
      </section>

      {/* Horário de Funcionamento */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Horário de Funcionamento</h2>
        <label className="mb-4 flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => update({ business_hours: is24h ? DEFAULT_HOURS : null })}
            className={`relative h-6 w-11 rounded-full transition ${is24h ? 'bg-sky-500' : 'bg-slate-200'}`}
          >
            <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${is24h ? 'left-5' : 'left-0.5'}`} />
          </div>
          <span className="text-sm font-medium text-slate-700">Atendimento 24h</span>
        </label>

        {!is24h && (
          <div className="space-y-3">
            <input className={inputClass} placeholder="Fuso horário (ex: America/Sao_Paulo)" value={data.timezone} onChange={(e) => update({ timezone: e.target.value })} />
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => {
                const day = data.business_hours?.[key] as DaySchedule | null;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <label className="flex items-center gap-2 w-28">
                      <input type="checkbox" checked={!!day} onChange={() => toggleDay(key)} className="accent-sky-500" />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                    {day && (
                      <>
                        <input type="time" value={day.open} onChange={(e) => updateDayHour(key, 'open', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                        <span className="text-slate-400 text-sm">às</span>
                        <input type="time" value={day.close} onChange={(e) => updateDayHour(key, 'close', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <textarea className={inputClass} rows={2} placeholder="Mensagem quando fechado" value={data.closed_message} onChange={(e) => update({ closed_message: e.target.value })} />
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">FAQ</h2>
        <div className="space-y-3">
          {data.faq.map((f, i) => (
            <div key={i} className="flex gap-2 items-start rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex-1 space-y-2">
                <input className={inputClass} placeholder="Pergunta" value={f.pergunta} onChange={(e) => updateFaq(i, 'pergunta', e.target.value)} />
                <textarea className={inputClass} rows={2} placeholder="Resposta" value={f.resposta} onChange={(e) => updateFaq(i, 'resposta', e.target.value)} />
              </div>
              <button onClick={() => removeFaq(i)} className="text-sm text-rose-500 hover:text-rose-600 mt-1">Remover</button>
            </div>
          ))}
          <button onClick={addFaq} className="text-sm font-medium text-sky-600 hover:text-sky-700">+ Adicionar pergunta</button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {saved && <span className="text-sm text-emerald-600">Salvo!</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add crm/src/components/CompanySettings.tsx
git commit -m "feat(crm): add CompanySettings UI component"
```

---

## Task 14: CRM UI — CatalogSettings Component

Two-column layout: categories (left, DnD reorder) + items of selected category (right, CRUD + DnD).

**Files:**
- Create: `crm/src/components/CatalogSettings.tsx`

- [ ] **Step 1: Create `crm/src/components/CatalogSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface CatalogItem {
  id: number;
  category_id: number;
  slug: string;
  title: string;
  description: string;
  price: string;
  duration: number | null;
  position: number;
}

interface Category {
  id: number;
  slug: string;
  title: string;
  position: number;
  items: CatalogItem[];
}

function slugify(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function CatalogSettings({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [selectedId, setSelectedId] = useState<number | null>(initialCategories[0]?.id ?? null);
  const [newCatTitle, setNewCatTitle] = useState('');
  const [newItem, setNewItem] = useState({ title: '', description: '', price: '', duration: '' });
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  const selectedCat = categories.find((c) => c.id === selectedId);

  const reorder = <T,>(list: T[], from: number, to: number): T[] => {
    const result = [...list];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  };

  const onDragEndCategories = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = reorder(categories, result.source.index, result.destination.index)
      .map((c, i) => ({ ...c, position: i }));
    setCategories(reordered);
    for (const cat of reordered) {
      await fetch(`/api/catalog/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: cat.position }),
      });
    }
  };

  const onDragEndItems = async (result: DropResult) => {
    if (!result.destination || !selectedCat) return;
    const reordered = reorder(selectedCat.items, result.source.index, result.destination.index)
      .map((item, i) => ({ ...item, position: i }));
    setCategories((cats) => cats.map((c) => c.id === selectedId ? { ...c, items: reordered } : c));
    for (const item of reordered) {
      await fetch(`/api/catalog/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: item.position }),
      });
    }
  };

  const addCategory = async () => {
    if (!newCatTitle.trim()) return;
    const res = await fetch('/api/catalog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newCatTitle.trim(), slug: slugify(newCatTitle.trim()) }),
    });
    const cat = await res.json();
    setCategories((prev) => [...prev, cat]);
    setSelectedId(cat.id);
    setNewCatTitle('');
  };

  const deleteCategory = async (id: number) => {
    if (!window.confirm('Excluir categoria e todos os seus itens?')) return;
    await fetch(`/api/catalog/categories/${id}`, { method: 'DELETE' });
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(categories.find((c) => c.id !== id)?.id ?? null);
  };

  const addItem = async () => {
    if (!selectedCat || !newItem.title.trim() || !newItem.price) return;
    const res = await fetch('/api/catalog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: selectedCat.id,
        slug: slugify(newItem.title.trim()),
        title: newItem.title.trim(),
        description: newItem.description,
        price: parseFloat(newItem.price),
        duration: newItem.duration ? parseInt(newItem.duration) : null,
      }),
    });
    const item = await res.json();
    setCategories((cats) => cats.map((c) => c.id === selectedId ? { ...c, items: [...c.items, item] } : c));
    setNewItem({ title: '', description: '', price: '', duration: '' });
  };

  const saveItem = async () => {
    if (!editingItem) return;
    await fetch(`/api/catalog/items/${editingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editingItem.title,
        slug: slugify(editingItem.title),
        description: editingItem.description,
        price: parseFloat(editingItem.price),
        duration: editingItem.duration,
      }),
    });
    setCategories((cats) => cats.map((c) =>
      c.id === selectedId ? { ...c, items: c.items.map((i) => i.id === editingItem.id ? editingItem : i) } : c
    ));
    setEditingItem(null);
  };

  const deleteItem = async (itemId: number) => {
    await fetch(`/api/catalog/items/${itemId}`, { method: 'DELETE' });
    setCategories((cats) => cats.map((c) =>
      c.id === selectedId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c
    ));
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="flex gap-6" style={{ minHeight: 400 }}>
      {/* Categorias */}
      <div className="w-56 shrink-0">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 uppercase tracking-wide">Categorias</h3>
        <DragDropContext onDragEnd={(r) => void onDragEndCategories(r)}>
          <Droppable droppableId="categories">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                {categories.map((cat, index) => (
                  <Draggable key={cat.id} draggableId={String(cat.id)} index={index}>
                    {(drag) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        {...drag.dragHandleProps}
                        onClick={() => setSelectedId(cat.id)}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm cursor-pointer transition ${selectedId === cat.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        <span className="truncate">{cat.title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); void deleteCategory(cat.id); }}
                          className={`ml-1 text-xs ${selectedId === cat.id ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-rose-500'}`}
                        >×</button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        <div className="mt-3 flex gap-1">
          <input
            className="flex-1 rounded-xl border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500"
            placeholder="Nova categoria"
            value={newCatTitle}
            onChange={(e) => setNewCatTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addCategory(); }}
          />
          <button onClick={() => void addCategory()} className="rounded-xl bg-slate-950 px-2 text-white text-lg">+</button>
        </div>
      </div>

      {/* Itens */}
      <div className="flex-1">
        {selectedCat ? (
          <>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 uppercase tracking-wide">{selectedCat.title}</h3>
            <DragDropContext onDragEnd={(r) => void onDragEndItems(r)}>
              <Droppable droppableId="items">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 mb-4">
                    {selectedCat.items.map((item, index) => (
                      <Draggable key={item.id} draggableId={String(item.id)} index={index}>
                        {(drag) => (
                          <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                          >
                            {editingItem?.id === item.id ? (
                              <div className="space-y-2">
                                <input className={inputClass} value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} placeholder="Título" />
                                <textarea className={inputClass} rows={2} value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} placeholder="Descrição" />
                                <div className="flex gap-2">
                                  <input className={inputClass} type="number" step="0.01" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })} placeholder="Preço (R$)" />
                                  <input className={inputClass} type="number" value={editingItem.duration ?? ''} onChange={(e) => setEditingItem({ ...editingItem, duration: e.target.value ? parseInt(e.target.value) : null })} placeholder="Duração (min)" />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => void saveItem()} className="rounded-xl bg-slate-950 px-3 py-1 text-xs text-white">Salvar</button>
                                  <button onClick={() => setEditingItem(null)} className="rounded-xl border border-slate-300 px-3 py-1 text-xs text-slate-600">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                                  <p className="text-xs text-slate-500">R$ {parseFloat(item.price).toFixed(2)}{item.duration ? ` • ${item.duration} min` : ''}</p>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => setEditingItem(item)} className="text-xs text-sky-600 hover:text-sky-700">Editar</button>
                                  <button onClick={() => void deleteItem(item.id)} className="text-xs text-rose-500 hover:text-rose-600">Remover</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Novo item */}
            <div className="rounded-2xl border border-dashed border-slate-300 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase">Novo item</p>
              <input className={inputClass} placeholder="Título" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
              <textarea className={inputClass} rows={2} placeholder="Descrição" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
              <div className="flex gap-2">
                <input className={inputClass} type="number" step="0.01" placeholder="Preço (R$)" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
                <input className={inputClass} type="number" placeholder="Duração (min)" value={newItem.duration} onChange={(e) => setNewItem({ ...newItem, duration: e.target.value })} />
              </div>
              <button onClick={() => void addItem()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Adicionar item</button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 mt-8 text-center">Selecione ou crie uma categoria</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add crm/src/components/CatalogSettings.tsx
git commit -m "feat(crm): add CatalogSettings UI component with DnD"
```

---

## Task 15: CRM UI — ContactsSettings Component

**Files:**
- Create: `crm/src/components/ContactsSettings.tsx`

- [ ] **Step 1: Create `crm/src/components/ContactsSettings.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface Contact { id: number; phone: string; name: string | null; }
interface Lead { id: number; phone: string; name: string | null; stage_id: number; }
interface Stage { id: number; name: string; }

export default function ContactsSettings({
  initialContacts,
  leads,
  stages,
}: {
  initialContacts: Contact[];
  leads: Lead[];
  stages: Stage[];
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [filterStage, setFilterStage] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const addContact = async () => {
    if (!newPhone.trim()) return;
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: newPhone.trim(), name: newName.trim() || null }),
    });
    const contact = await res.json();
    setContacts((prev) => {
      const existing = prev.findIndex((c) => c.id === contact.id);
      if (existing >= 0) return prev.map((c) => c.id === contact.id ? contact : c);
      return [...prev, contact].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    });
    setNewPhone('');
    setNewName('');
  };

  const removeContact = async (id: number) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const filteredLeads = filterStage
    ? leads.filter((l) => l.stage_id === filterStage)
    : leads;

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_ids: Array.from(selected) }),
    });
    const { imported } = await res.json();
    setImporting(false);
    setShowImport(false);
    setSelected(new Set());

    // refresh contacts list
    const fresh = await fetch('/api/contacts').then((r) => r.json());
    setContacts(fresh);
    alert(`${imported} contato(s) importado(s).`);
  };

  const inputClass = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="space-y-4">
      {/* Adicionar avulso */}
      <div className="flex gap-2">
        <input className={`${inputClass} flex-1`} placeholder="Telefone (ex: 5511999999999)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
        <input className={`${inputClass} flex-1`} placeholder="Nome (opcional)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addContact(); }} />
        <button onClick={() => void addContact()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Adicionar</button>
        <button onClick={() => setShowImport(true)} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Importar do funil</button>
      </div>

      {/* Lista de contatos */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {contacts.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Nenhum contato cadastrado</p>}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
            <span className="text-slate-800">{c.name || <span className="text-slate-400">Sem nome</span>} <span className="text-slate-400 ml-2">{c.phone}</span></span>
            <button onClick={() => void removeContact(c.id)} className="text-rose-500 hover:text-rose-600 text-xs">Remover</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">{contacts.length} contato(s)</p>

      {/* Modal de importação */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Importar do funil</h3>
            <select className={`${inputClass} w-full`} value={filterStage ?? ''} onChange={(e) => setFilterStage(e.target.value ? parseInt(e.target.value) : null)}>
              <option value="">Todas as etapas</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredLeads.map((lead) => (
                <label key={lead.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="accent-sky-500" />
                  <span className="text-sm text-slate-700">{lead.name || 'Sem nome'} <span className="text-slate-400">{lead.phone}</span></span>
                </label>
              ))}
              {filteredLeads.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Nenhum lead nesta etapa</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowImport(false); setSelected(new Set()); }} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => void importSelected()} disabled={selected.size === 0 || importing} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {importing ? 'Importando…' : `Importar ${selected.size > 0 ? `(${selected.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add crm/src/components/ContactsSettings.tsx
git commit -m "feat(crm): add ContactsSettings UI component with import modal"
```

---

## Task 16: Update crm/src/app/settings/page.tsx

**Files:**
- Modify: `crm/src/app/settings/page.tsx`

- [ ] **Step 1: Replace the contents of `crm/src/app/settings/page.tsx`** with the expanded version that includes all new sections:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import StageManager from '@/components/StageManager';
import CompanySettings from '@/components/CompanySettings';
import CatalogSettings from '@/components/CatalogSettings';
import ContactsSettings from '@/components/ContactsSettings';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();

  const [
    { rows: stages },
    { rows: companyRows },
    { rows: categories },
    { rows: items },
    { rows: contacts },
    { rows: leads },
  ] = await Promise.all([
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
    pool.query('SELECT * FROM company_settings LIMIT 1'),
    pool.query('SELECT * FROM catalog_categories ORDER BY position ASC'),
    pool.query('SELECT * FROM catalog_items ORDER BY position ASC'),
    pool.query('SELECT * FROM contacts ORDER BY name ASC'),
    pool.query('SELECT id, phone, name, stage_id FROM leads ORDER BY name ASC'),
  ]);

  const catalogWithItems = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-sky-600 transition hover:text-sky-700">
          ← Voltar ao funil
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Configurações</h1>
      </div>

      <div className="space-y-6">
        {/* Empresa + Horário + FAQ */}
        <CompanySettings initial={companyRows[0] ?? null} />

        {/* Etapas do funil */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Etapas do funil</h2>
          <StageManager initialStages={stages} />
        </section>

        {/* Catálogo */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Catálogo</h2>
          <CatalogSettings initialCategories={catalogWithItems} />
        </section>

        {/* Contatos broadcast */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Contatos (Broadcast)</h2>
          <ContactsSettings initialContacts={contacts} leads={leads} stages={stages} />
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build the CRM to verify no TypeScript errors**

```bash
cd crm
npm run build
```

Expected: Build completes with no errors. If TypeScript errors appear, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add crm/src/app/settings/page.tsx
git commit -m "feat(crm): expand settings page with company, catalog, and contacts sections"
```

---

## Task 17: End-to-End Verification

- [ ] **Step 1: Run full bot test suite**

```bash
cd bot
npm test
```

Expected: all 14 test files pass

- [ ] **Step 2: Start Docker stack and verify bot starts cleanly**

```bash
docker compose up -d
docker compose logs -f bot
```

Expected: bot starts without errors about missing JSON files

- [ ] **Step 3: Verify CRM settings page loads**

Open `http://localhost:3000/settings` in a browser after logging in.
Expected: all 4 sections visible (Empresa, Etapas, Catálogo, Contatos)

- [ ] **Step 4: Create company settings via CRM**

Fill in the Empresa form and click "Salvar". Verify the bot's responses now use the DB data (send a message to the WhatsApp bot and check it replies with the correct company name).

- [ ] **Step 5: Add a catalog category and item, then trigger catalog flow**

In CRM: add category "Serviços" + item "Básico R$50". In WhatsApp: trigger catalog flow. Verify the item appears.

- [ ] **Step 6: Add a contact and send broadcast**

In CRM: add a contact phone. Send `/broadcast Teste` from the bot number. Verify the contact receives the message.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete JSON-to-DB migration with full CRM management"
```
