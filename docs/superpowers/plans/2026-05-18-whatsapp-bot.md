# WhatsApp Bot — Tirar Dúvidas sobre a Empresa

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um template de bot WhatsApp que responde dúvidas sobre a empresa, usando Evolution API + OpenAI GPT, com histórico por usuário no Redis, deployado via Docker Compose.

**Architecture:** A Evolution API gerencia a sessão WhatsApp e despacha mensagens via webhook HTTP para o serviço bot em Node.js/Express. O bot busca o histórico do Redis, monta o prompt com o `company.json`, chama a OpenAI e envia a resposta de volta via REST da Evolution API.

**Tech Stack:** Node.js 20, Express, OpenAI SDK v4, redis v4, axios, Jest, Supertest, Docker Compose, Evolution API v2, PostgreSQL 15, Redis 7.

---

## Estrutura de Arquivos

```
whatsapp-bot/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── company.json                  # conteúdo da empresa (editável sem tocar no código)
└── bot/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.js              # servidor Express + registro do webhook na startup
        ├── webhook.js            # valida token, filtra mensagens, orquestra fluxo
        ├── openai.js             # monta system prompt com company.json, chama OpenAI
        ├── redis.js              # get/set histórico por número com TTL de 24h
        └── evolutionApi.js       # cliente REST da Evolution API
    └── tests/
        ├── redis.test.js
        ├── openai.test.js
        ├── evolutionApi.test.js
        └── webhook.test.js
```

---

## Task 1: Scaffold do projeto (arquivos de configuração)

**Files:**
- Create: `whatsapp-bot/docker-compose.yml`
- Create: `whatsapp-bot/.env.example`
- Create: `whatsapp-bot/.gitignore`
- Create: `whatsapp-bot/company.json`

- [ ] **Step 1: Criar o `docker-compose.yml`**

```yaml
# whatsapp-bot/docker-compose.yml
version: '3.9'

services:
  evolution-api:
    image: atendai/evolution-api:v2.2.3
    restart: always
    ports:
      - "8080:8080"
    environment:
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://redis:6379
      - CACHE_REDIS_PREFIX_KEY=evolution
      - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
      - WEBHOOK_GLOBAL_ENABLED=false
      - DEL_INSTANCE=false
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - bot-net

  postgres:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - bot-net

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data
    networks:
      - bot-net

  bot:
    build: ./bot
    restart: always
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - EVOLUTION_API_URL=http://evolution-api:8080
      - REDIS_URL=redis://redis:6379
      - BOT_WEBHOOK_URL=http://bot:3000
    volumes:
      - ./company.json:/app/company.json:ro
    depends_on:
      - evolution-api
      - redis
    networks:
      - bot-net

networks:
  bot-net:

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 2: Criar o `.env.example`**

```bash
# whatsapp-bot/.env.example

# Evolution API
EVOLUTION_API_KEY=change-me-strong-random-key
EVOLUTION_INSTANCE=minha-instancia

# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini

# Webhook (segredo compartilhado entre Evolution API e bot)
WEBHOOK_TOKEN=change-me-webhook-secret

# PostgreSQL (usado internamente pela Evolution API)
POSTGRES_USER=evolution
POSTGRES_PASSWORD=evolution_pass
POSTGRES_DB=evolution

# Bot
MAX_HISTORY=10
PORT=3000
```

- [ ] **Step 3: Criar o `.gitignore`**

```gitignore
# whatsapp-bot/.gitignore
.env
node_modules/
```

- [ ] **Step 4: Criar o `company.json` com dados de exemplo**

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
  ]
}
```

- [ ] **Step 5: Criar `.env` a partir do exemplo e preencher os valores reais**

```bash
cp .env.example .env
# Editar .env com os valores reais antes de subir os containers
```

- [ ] **Step 6: Commit**

```bash
git init
git add docker-compose.yml .env.example .gitignore company.json
git commit -m "chore: scaffold project with docker-compose and config files"
```

---

## Task 2: Scaffold do serviço bot

**Files:**
- Create: `whatsapp-bot/bot/package.json`
- Create: `whatsapp-bot/bot/Dockerfile`

- [ ] **Step 1: Criar `bot/package.json`**

```json
{
  "name": "whatsapp-bot",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest --runInBand --forceExit"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "openai": "^4.52.0",
    "redis": "^4.7.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  }
}
```

- [ ] **Step 2: Criar `bot/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/index.js"]
```

- [ ] **Step 3: Instalar dependências localmente (para rodar testes)**

```bash
cd bot
npm install
```

Saída esperada: `added N packages` sem erros.

- [ ] **Step 4: Criar estrutura de diretórios**

```bash
mkdir -p src tests
```

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/package.json bot/package-lock.json bot/Dockerfile
git commit -m "chore: add bot service Dockerfile and package.json"
```

---

## Task 3: Módulo Redis (TDD)

**Files:**
- Create: `whatsapp-bot/bot/src/redis.js`
- Create: `whatsapp-bot/bot/tests/redis.test.js`

- [ ] **Step 1: Escrever o teste com falha**

```javascript
// bot/tests/redis.test.js
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: mockConnect,
    get: mockGet,
    set: mockSet,
  })),
}));

process.env.REDIS_URL = 'redis://localhost:6379';

const { getHistory, appendHistory } = require('../src/redis');

beforeEach(() => jest.clearAllMocks());

test('getHistory retorna array vazio quando não há histórico', async () => {
  mockGet.mockResolvedValue(null);
  const result = await getHistory('5511999999999');
  expect(result).toEqual([]);
  expect(mockGet).toHaveBeenCalledWith('history:5511999999999');
});

test('getHistory retorna histórico parseado do Redis', async () => {
  const history = [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }];
  mockGet.mockResolvedValue(JSON.stringify(history));
  const result = await getHistory('5511999999999');
  expect(result).toEqual(history);
});

test('appendHistory adiciona mensagens e salva com TTL de 24h', async () => {
  mockGet.mockResolvedValue(null);
  mockSet.mockResolvedValue('OK');
  await appendHistory('5511999999999', 'oi', 'olá');
  expect(mockSet).toHaveBeenCalledWith(
    'history:5511999999999',
    JSON.stringify([
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'olá' },
    ]),
    { EX: 86400 }
  );
});

test('appendHistory trunca ao limite de MAX_HISTORY pares', async () => {
  process.env.MAX_HISTORY = '2';
  const existing = [
    { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' },
  ];
  mockGet.mockResolvedValue(JSON.stringify(existing));
  mockSet.mockResolvedValue('OK');
  await appendHistory('5511999999999', 'e', 'f');
  const saved = JSON.parse(mockSet.mock.calls[0][1]);
  // 3 pares → trunca para 2 pares (4 mensagens), mantém as mais recentes
  expect(saved).toHaveLength(4);
  expect(saved[0]).toEqual({ role: 'user', content: 'c' });
  expect(saved[3]).toEqual({ role: 'assistant', content: 'f' });
  delete process.env.MAX_HISTORY;
});
```

- [ ] **Step 2: Rodar o teste para confirmar falha**

```bash
cd bot
npx jest tests/redis.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/redis'`

- [ ] **Step 3: Implementar `bot/src/redis.js`**

```javascript
// bot/src/redis.js
const { createClient } = require('redis');

let _client;

async function getClient() {
  if (!_client) {
    _client = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
    await _client.connect();
  }
  return _client;
}

async function getHistory(phone) {
  const client = await getClient();
  const data = await client.get(`history:${phone}`);
  return data ? JSON.parse(data) : [];
}

async function appendHistory(phone, userMessage, assistantMessage) {
  const client = await getClient();
  const maxHistory = parseInt(process.env.MAX_HISTORY || '10');
  const history = await getHistory(phone);
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: assistantMessage });
  const trimmed = history.slice(-maxHistory * 2);
  await client.set(`history:${phone}`, JSON.stringify(trimmed), { EX: 86400 });
}

module.exports = { getHistory, appendHistory };
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

```bash
npx jest tests/redis.test.js --no-coverage
```

Saída esperada: `PASS tests/redis.test.js` — 4 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/redis.js bot/tests/redis.test.js
git commit -m "feat: add redis history module with TTL and max history trimming"
```

---

## Task 4: Módulo OpenAI (TDD)

**Files:**
- Create: `whatsapp-bot/bot/src/openai.js`
- Create: `whatsapp-bot/bot/tests/openai.test.js`

- [ ] **Step 1: Escrever o teste com falha**

```javascript
// bot/tests/openai.test.js
const mockCreate = jest.fn();

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }))
);

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      nome: 'Empresa Teste',
      descricao: 'Empresa de tecnologia.',
      horario: '9h às 18h',
      contato: 'teste@teste.com',
      faq: [{ pergunta: 'Qual o prazo?', resposta: '5 dias úteis.' }],
    })
  ),
}));

process.env.OPENAI_API_KEY = 'test-key';

const { chat, buildSystemPrompt } = require('../src/openai');

beforeEach(() => jest.clearAllMocks());

test('buildSystemPrompt inclui nome e FAQ da empresa', () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('Empresa Teste');
  expect(prompt).toContain('Qual o prazo?');
  expect(prompt).toContain('5 dias úteis.');
});

test('buildSystemPrompt instrui o bot a responder só sobre a empresa', () => {
  const prompt = buildSystemPrompt();
  expect(prompt.toLowerCase()).toMatch(/responda apenas|somente/);
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
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot
npx jest tests/openai.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/openai'`

- [ ] **Step 3: Implementar `bot/src/openai.js`**

```javascript
// bot/src/openai.js
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildSystemPrompt() {
  const company = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../company.json'), 'utf8')
  );
  const faqText = company.faq
    .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
    .join('\n\n');
  return `Você é um assistente virtual da ${company.nome}.
${company.descricao}
Horário de atendimento: ${company.horario}
Contato: ${company.contato}

Perguntas frequentes:
${faqText}

Responda apenas dúvidas relacionadas à ${company.nome}. Se a pergunta não for sobre a empresa, informe educadamente que somente pode ajudar com dúvidas sobre a ${company.nome}.`;
}

async function chat(history, userMessage) {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user', content: userMessage },
  ];
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
  });
  return response.choices[0].message.content;
}

module.exports = { chat, buildSystemPrompt };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/openai.test.js --no-coverage
```

Saída esperada: `PASS tests/openai.test.js` — 4 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/openai.js bot/tests/openai.test.js
git commit -m "feat: add openai module with company system prompt"
```

---

## Task 5: Cliente Evolution API (TDD)

**Files:**
- Create: `whatsapp-bot/bot/src/evolutionApi.js`
- Create: `whatsapp-bot/bot/tests/evolutionApi.test.js`

- [ ] **Step 1: Escrever o teste com falha**

```javascript
// bot/tests/evolutionApi.test.js
const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('axios', () => ({ post: mockPost, put: mockPut }));

process.env.EVOLUTION_API_URL = 'http://evolution:8080';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'test-instance';
process.env.WEBHOOK_TOKEN = 'test-webhook-token';

const { sendText, registerWebhook } = require('../src/evolutionApi');

beforeEach(() => jest.clearAllMocks());

test('sendText envia POST para o endpoint correto com número e texto', async () => {
  mockPost.mockResolvedValue({ data: {} });
  await sendText('5511999999999', 'Olá! Como posso ajudar?');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendText/test-instance',
    { number: '5511999999999', text: 'Olá! Como posso ajudar?' },
    { headers: { apikey: 'test-api-key' } }
  );
});

test('registerWebhook envia PUT com URL e token corretos', async () => {
  mockPut.mockResolvedValue({ data: {} });
  await registerWebhook('http://bot:3000');
  expect(mockPut).toHaveBeenCalledWith(
    'http://evolution:8080/webhook/set/test-instance',
    {
      enabled: true,
      url: 'http://bot:3000/webhook',
      headers: { 'x-api-key': 'test-webhook-token' },
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
    },
    { headers: { apikey: 'test-api-key' } }
  );
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot
npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/evolutionApi'`

- [ ] **Step 3: Implementar `bot/src/evolutionApi.js`**

```javascript
// bot/src/evolutionApi.js
const axios = require('axios');

const BASE_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE;

async function sendText(to, text) {
  await axios.post(
    `${BASE_URL}/message/sendText/${INSTANCE}`,
    { number: to, text },
    { headers: { apikey: API_KEY } }
  );
}

async function registerWebhook(botPublicUrl) {
  await axios.put(
    `${BASE_URL}/webhook/set/${INSTANCE}`,
    {
      enabled: true,
      url: `${botPublicUrl}/webhook`,
      headers: { 'x-api-key': process.env.WEBHOOK_TOKEN },
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
    },
    { headers: { apikey: API_KEY } }
  );
}

module.exports = { sendText, registerWebhook };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: `PASS tests/evolutionApi.test.js` — 2 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/evolutionApi.js bot/tests/evolutionApi.test.js
git commit -m "feat: add evolution api client for send and webhook registration"
```

---

## Task 6: Webhook handler (TDD)

**Files:**
- Create: `whatsapp-bot/bot/src/webhook.js`
- Create: `whatsapp-bot/bot/tests/webhook.test.js`

- [ ] **Step 1: Escrever o teste com falha**

```javascript
// bot/tests/webhook.test.js
jest.mock('../src/redis', () => ({
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
}));
jest.mock('../src/openai', () => ({ chat: jest.fn() }));
jest.mock('../src/evolutionApi', () => ({ sendText: jest.fn() }));

const request = require('supertest');
const express = require('express');
const { handleWebhook, isPrivateChat, extractMessage } = require('../src/webhook');
const { getHistory, appendHistory } = require('../src/redis');
const { chat } = require('../src/openai');
const { sendText } = require('../src/evolutionApi');

process.env.WEBHOOK_TOKEN = 'test-token';

const app = express();
app.use(express.json());
app.post('/webhook', handleWebhook);

const validPayload = {
  event: 'messages.upsert',
  data: {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: false,
      id: 'msg-123',
    },
    message: { conversation: 'Qual o horário de atendimento?' },
  },
};

beforeEach(() => jest.clearAllMocks());

test('retorna 401 sem token válido', async () => {
  await request(app).post('/webhook').send(validPayload).expect(401);
});

test('retorna 401 com token errado', async () => {
  await request(app)
    .post('/webhook')
    .set('x-api-key', 'token-errado')
    .send(validPayload)
    .expect(401);
});

test('ignora mensagem enviada pelo próprio número (fromMe)', async () => {
  const payload = {
    ...validPayload,
    data: { ...validPayload.data, key: { ...validPayload.data.key, fromMe: true } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('ignora mensagens de grupos', async () => {
  const payload = {
    ...validPayload,
    data: { ...validPayload.data, key: { ...validPayload.data.key, remoteJid: '123456@g.us' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('ignora eventos que não são messages.upsert', async () => {
  const payload = { ...validPayload, event: 'connection.update' };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('processa mensagem válida e envia resposta', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Atendemos das 9h às 18h.');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app)
    .post('/webhook')
    .set('x-api-key', 'test-token')
    .send(validPayload)
    .expect(200);

  // aguarda o processamento assíncrono (fire-and-forget)
  await new Promise((r) => setTimeout(r, 100));

  expect(getHistory).toHaveBeenCalledWith('5511999999999');
  expect(chat).toHaveBeenCalledWith([], 'Qual o horário de atendimento?');
  expect(appendHistory).toHaveBeenCalledWith(
    '5511999999999',
    'Qual o horário de atendimento?',
    'Atendemos das 9h às 18h.'
  );
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Atendemos das 9h às 18h.');
});

test('isPrivateChat identifica chat privado', () => {
  expect(isPrivateChat('5511999999999@s.whatsapp.net')).toBe(true);
  expect(isPrivateChat('123456@g.us')).toBe(false);
});

test('extractMessage lê de conversation', () => {
  expect(extractMessage({ message: { conversation: 'oi' } })).toBe('oi');
});

test('extractMessage lê de extendedTextMessage', () => {
  expect(
    extractMessage({ message: { extendedTextMessage: { text: 'oi extended' } } })
  ).toBe('oi extended');
});

test('extractMessage retorna null para tipos não suportados', () => {
  expect(extractMessage({ message: { imageMessage: {} } })).toBeNull();
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot
npx jest tests/webhook.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/webhook'`

- [ ] **Step 3: Implementar `bot/src/webhook.js`**

```javascript
// bot/src/webhook.js
const { getHistory, appendHistory } = require('./redis');
const { chat } = require('./openai');
const { sendText } = require('./evolutionApi');

function isPrivateChat(remoteJid) {
  return remoteJid.endsWith('@s.whatsapp.net');
}

function extractMessage(data) {
  const msg = data.message;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    null
  );
}

async function handleWebhook(req, res) {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, data } = req.body;

  if (event !== 'messages.upsert') return res.sendStatus(200);
  if (!data?.key) return res.sendStatus(200);
  if (data.key.fromMe) return res.sendStatus(200);
  if (!isPrivateChat(data.key.remoteJid)) return res.sendStatus(200);

  const text = extractMessage(data);
  if (!text) return res.sendStatus(200);

  const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');

  // responde à Evolution API imediatamente para evitar timeout
  res.sendStatus(200);

  // processa de forma assíncrona
  (async () => {
    try {
      const history = await getHistory(phone);
      const reply = await chat(history, text);
      await appendHistory(phone, text, reply);
      await sendText(phone, reply);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
}

module.exports = { handleWebhook, isPrivateChat, extractMessage };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/webhook.test.js --no-coverage
```

Saída esperada: `PASS tests/webhook.test.js` — 10 testes passando.

- [ ] **Step 5: Rodar todos os testes para garantir que nada quebrou**

```bash
npx jest --no-coverage
```

Saída esperada: `Test Suites: 4 passed, 4 total` — todos os testes passando.

- [ ] **Step 6: Commit**

```bash
cd ..
git add bot/src/webhook.js bot/tests/webhook.test.js
git commit -m "feat: add webhook handler with auth, group filter and async processing"
```

---

## Task 7: Servidor principal

**Files:**
- Create: `whatsapp-bot/bot/src/index.js`

- [ ] **Step 1: Criar `bot/src/index.js`**

```javascript
// bot/src/index.js
require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');
const { registerWebhook } = require('./evolutionApi');

const app = express();
app.use(express.json());

app.post('/webhook', handleWebhook);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Bot rodando na porta ${PORT}`);
  const botUrl = process.env.BOT_WEBHOOK_URL || `http://bot:${PORT}`;
  try {
    await registerWebhook(botUrl);
    console.log(`Webhook registrado em ${botUrl}/webhook`);
  } catch (err) {
    // Evolution API pode não estar pronta ainda; não é fatal
    console.warn('Aviso: não foi possível registrar webhook automaticamente.', err.message);
    console.warn(`Registre manualmente: PUT ${process.env.EVOLUTION_API_URL}/webhook/set/${process.env.EVOLUTION_INSTANCE}`);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add bot/src/index.js
git commit -m "feat: add express server with health check and auto webhook registration"
```

---

## Task 8: Deploy e validação

- [ ] **Step 1: Copiar `.env.example` e preencher os valores reais**

```bash
cp .env.example .env
```

Valores obrigatórios a preencher em `.env`:
- `EVOLUTION_API_KEY` — qualquer string longa e aleatória (ex: `openssl rand -hex 32`)
- `EVOLUTION_INSTANCE` — nome da instância (ex: `empresa-xyz`)
- `OPENAI_API_KEY` — chave da OpenAI
- `WEBHOOK_TOKEN` — qualquer string longa e aleatória
- `POSTGRES_PASSWORD` — senha segura para o banco

- [ ] **Step 2: Subir os containers**

```bash
docker compose up -d
```

Aguardar cerca de 30 segundos para todos os serviços iniciarem.

- [ ] **Step 3: Verificar se todos os containers estão rodando**

```bash
docker compose ps
```

Saída esperada: todos os containers com status `Up`.

- [ ] **Step 4: Criar a instância WhatsApp na Evolution API**

```bash
# Substituir os valores pelas variáveis do seu .env
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: SEU_EVOLUTION_API_KEY" \
  -d '{"instanceName": "SEU_EVOLUTION_INSTANCE", "qrcode": true, "integration": "WHATSAPP-BAILEYS"}'
```

- [ ] **Step 5: Obter o QR code para escanear**

```bash
curl http://localhost:8080/instance/connect/SEU_EVOLUTION_INSTANCE \
  -H "apikey: SEU_EVOLUTION_API_KEY"
```

A resposta contém `base64` (imagem do QR code) ou `code` (string para escanear). Abra o WhatsApp no celular → Dispositivos vinculados → Vincular um dispositivo → escaneie o QR.

- [ ] **Step 6: Verificar conexão da instância**

```bash
curl http://localhost:8080/instance/connectionState/SEU_EVOLUTION_INSTANCE \
  -H "apikey: SEU_EVOLUTION_API_KEY"
```

Saída esperada: `{"instance": {"state": "open"}}`

- [ ] **Step 7: Verificar health do bot**

```bash
curl http://localhost:3000/health
```

Saída esperada: `{"status":"ok"}`

- [ ] **Step 8: Verificar logs do bot para confirmar registro do webhook**

```bash
docker compose logs bot
```

Saída esperada: `Webhook registrado em http://bot:3000/webhook`

- [ ] **Step 9: Enviar uma mensagem de teste pelo WhatsApp**

Envie uma mensagem para o número vinculado. Exemplos:
- "Qual o horário de atendimento?"
- "Aceitam cartão de crédito?"
- "Como faço um pedido?"

O bot deve responder com base no `company.json`.

- [ ] **Step 10: Verificar logs em tempo real**

```bash
docker compose logs -f bot
```

Deve exibir o fluxo de processamento para cada mensagem recebida.

- [ ] **Step 11: Commit final**

```bash
git add .
git commit -m "docs: add deployment validation steps"
```

---

## Personalização

Para adaptar o bot à empresa real, edite apenas o `company.json` na raiz do projeto e reinicie o bot:

```bash
docker compose restart bot
```

Não é necessário reconstruir a imagem.
