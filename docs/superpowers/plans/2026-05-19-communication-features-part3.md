# Communication Features — Parte 3: Áudio + Imagem + Broadcast

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar transcrição de áudio via Whisper, descrição de imagens via GPT-4o Vision e broadcast para lista de contatos ao bot existente.

**Architecture:** `audio.js` obtém base64 do áudio via Evolution API e transcreve com Whisper, retornando texto que segue o pipeline normal. `image.js` obtém base64 da imagem e responde diretamente com GPT-4o Vision no contexto da empresa. `broadcast.js` lê `contacts.json` e envia mensagens sequencialmente com delay configurável. `webhook.js` detecta os novos tipos de mensagem e roteia adequadamente.

**Tech Stack:** Node.js 20, openai SDK (já instalado — Whisper + GPT-4o Vision), Jest.

---

## Mapa de arquivos

**Criar:**
- `contacts.json` — lista de contatos para broadcast
- `bot/src/audio.js` — transcrição de áudio via Whisper
- `bot/src/image.js` — descrição de imagens via GPT-4o Vision
- `bot/src/broadcast.js` — envio em massa para contatos
- `bot/tests/audio.test.js`
- `bot/tests/image.test.js`
- `bot/tests/broadcast.test.js`

**Modificar:**
- `.env.example` — `WHISPER_LANGUAGE`, `BROADCAST_DELAY_MS`
- `docker-compose.yml` — montar `contacts.json`
- `bot/src/evolutionApi.js` — adicionar `getMediaBase64`
- `bot/src/openai.js` — adicionar `chatWithImage`
- `bot/src/webhook.js` — detectar áudio/imagem, comando `/broadcast`
- `bot/src/index.js` — rota `POST /broadcast`
- `bot/tests/evolutionApi.test.js` — teste de `getMediaBase64`
- `bot/tests/openai.test.js` — teste de `chatWithImage`
- `bot/tests/webhook.test.js` — testes de áudio, imagem e broadcast

---

## Task 1: Scaffold — arquivos de configuração

**Files:**
- Create: `contacts.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Criar `contacts.json` na raiz do projeto**

```json
{
  "contacts": [
    { "phone": "5511999999999", "name": "João" },
    { "phone": "5511888888888", "name": "Maria" }
  ]
}
```

- [ ] **Step 2: Adicionar ao final de `.env.example`**

```bash
# Transcrição de áudio (Whisper)
WHISPER_LANGUAGE=pt

# Broadcast
BROADCAST_DELAY_MS=1000
```

- [ ] **Step 3: Adicionar volume `contacts.json` ao serviço `bot` em `docker-compose.yml`**

No array `volumes` do serviço `bot`, adicionar após a linha do `catalog.json`:

```yaml
      - ./contacts.json:/app/contacts.json:ro
```

- [ ] **Step 4: Commit**

```bash
git add contacts.json .env.example docker-compose.yml
git commit -m "chore: scaffold part3 config files"
```

---

## Task 2: `getMediaBase64` na `evolutionApi` (TDD)

**Files:**
- Modify: `bot/src/evolutionApi.js`
- Modify: `bot/tests/evolutionApi.test.js`

- [ ] **Step 1: Adicionar teste de `getMediaBase64` em `bot/tests/evolutionApi.test.js`**

Atualizar o `require` no topo:

```javascript
const { sendText, registerWebhook, sendList, sendImageBase64, getMediaBase64 } = require('../src/evolutionApi');
```

Adicionar ao final do arquivo:

```javascript
test('getMediaBase64 envia POST e retorna base64', async () => {
  mockPost.mockResolvedValue({ data: { base64: 'abc123base64' } });
  const messageData = { key: { id: 'msg-1' }, message: { audioMessage: {} } };
  const result = await getMediaBase64(messageData);
  expect(result).toBe('abc123base64');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/chat/getBase64FromMediaMessage/test-instance',
    { message: messageData },
    { headers: { apikey: 'test-api-key' } }
  );
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: `getMediaBase64 is not a function`

- [ ] **Step 3: Adicionar `getMediaBase64` a `bot/src/evolutionApi.js`**

Adicionar após `sendImageBase64`:

```javascript
async function getMediaBase64(messageData) {
  const response = await axios.post(
    `${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`,
    { message: messageData },
    { headers: { apikey: API_KEY } }
  );
  return response.data.base64;
}
```

Atualizar `module.exports`:

```javascript
module.exports = { sendText, registerWebhook, sendList, sendImageBase64, getMediaBase64 };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/evolutionApi.test.js --no-coverage
```

Saída esperada: `PASS tests/evolutionApi.test.js` — 5 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/evolutionApi.js bot/tests/evolutionApi.test.js
git commit -m "feat: add getMediaBase64 to evolutionApi"
```

---

## Task 3: `audio.js` — transcrição de áudio (TDD)

**Files:**
- Create: `bot/src/audio.js`
- Create: `bot/tests/audio.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/audio.test.js`:

```javascript
const mockGetMediaBase64 = jest.fn();
const mockTranscriptionsCreate = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: jest.fn(),
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: mockGetMediaBase64,
}));

jest.mock('openai', () =>
  jest.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockTranscriptionsCreate } },
  }))
);

process.env.OPENAI_API_KEY = 'test-key';
process.env.WHISPER_LANGUAGE = 'pt';

const { transcribeAudio } = require('../src/audio');

beforeEach(() => jest.clearAllMocks());

test('transcribeAudio retorna texto transcrito', async () => {
  mockGetMediaBase64.mockResolvedValue('base64audiodata');
  mockTranscriptionsCreate.mockResolvedValue({ text: 'quero agendar um horário' });
  const messageData = { key: { id: 'msg-1' }, message: { audioMessage: {} } };
  const result = await transcribeAudio(messageData);
  expect(result).toBe('quero agendar um horário');
  expect(mockGetMediaBase64).toHaveBeenCalledWith(messageData);
  expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
    expect.objectContaining({ model: 'whisper-1', language: 'pt' })
  );
});

test('transcribeAudio retorna null quando getMediaBase64 falha', async () => {
  mockGetMediaBase64.mockRejectedValue(new Error('network error'));
  const result = await transcribeAudio({ message: { audioMessage: {} } });
  expect(result).toBeNull();
});

test('transcribeAudio retorna null quando Whisper falha', async () => {
  mockGetMediaBase64.mockResolvedValue('base64audiodata');
  mockTranscriptionsCreate.mockRejectedValue(new Error('whisper error'));
  const result = await transcribeAudio({ message: { audioMessage: {} } });
  expect(result).toBeNull();
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/audio.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/audio'`

- [ ] **Step 3: Implementar `bot/src/audio.js`**

```javascript
const OpenAI = require('openai');
const { getMediaBase64 } = require('./evolutionApi');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(messageData) {
  try {
    const base64 = await getMediaBase64(messageData);
    const buffer = Buffer.from(base64, 'base64');
    const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg; codecs=opus' });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: process.env.WHISPER_LANGUAGE || 'pt',
    });
    return transcription.text;
  } catch (err) {
    console.error('Erro ao transcrever áudio:', err.message);
    return null;
  }
}

module.exports = { transcribeAudio };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/audio.test.js --no-coverage
```

Saída esperada: `PASS tests/audio.test.js` — 3 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/audio.js bot/tests/audio.test.js
git commit -m "feat: add audio transcription module via Whisper"
```

---

## Task 4: `chatWithImage` em `openai.js` + `image.js` (TDD)

**Files:**
- Modify: `bot/src/openai.js`
- Modify: `bot/tests/openai.test.js`
- Create: `bot/src/image.js`
- Create: `bot/tests/image.test.js`

- [ ] **Step 1: Adicionar teste de `chatWithImage` em `bot/tests/openai.test.js`**

Atualizar o `require` no topo:

```javascript
const { chat, buildSystemPrompt, chatWithImage } = require('../src/openai');
```

Adicionar ao final do arquivo:

```javascript
test('chatWithImage envia imagem base64 para GPT-4o e retorna resposta', async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { content: 'Vejo uma imagem de produto de beleza.' } }],
  });
  const result = await chatWithImage('base64data', 'O que é isso?');
  expect(result).toBe('Vejo uma imagem de produto de beleza.');
  const call = mockCreate.mock.calls[0][0];
  expect(call.model).toBe('gpt-4o');
  expect(call.messages[0].role).toBe('system');
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

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/openai.test.js --no-coverage
```

Saída esperada: `chatWithImage is not a function`

- [ ] **Step 3: Adicionar `chatWithImage` a `bot/src/openai.js`**

Adicionar após a função `chat`:

```javascript
async function chatWithImage(base64, caption) {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: caption || 'O que você vê nesta imagem? Responda no contexto da empresa.' },
      ],
    },
  ];
  const response = await openai.chat.completions.create({ model: 'gpt-4o', messages });
  if (!response.choices?.length) return 'Não consegui analisar a imagem.';
  return response.choices[0].message.content;
}
```

Atualizar `module.exports`:

```javascript
module.exports = { chat, buildSystemPrompt, chatWithImage };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/openai.test.js --no-coverage
```

Saída esperada: `PASS tests/openai.test.js` — 6 testes passando.

- [ ] **Step 5: Escrever o teste de `image.js` com falha**

Criar `bot/tests/image.test.js`:

```javascript
const mockGetMediaBase64 = jest.fn();
const mockSendText = jest.fn();
const mockChatWithImage = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  getMediaBase64: mockGetMediaBase64,
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
}));

jest.mock('../src/openai', () => ({
  chat: jest.fn(),
  buildSystemPrompt: jest.fn(),
  chatWithImage: mockChatWithImage,
}));

const { handleImageMessage } = require('../src/image');

beforeEach(() => jest.clearAllMocks());

test('handleImageMessage obtém base64, descreve imagem e envia resposta', async () => {
  mockGetMediaBase64.mockResolvedValue('base64imagedata');
  mockChatWithImage.mockResolvedValue('Vejo uma imagem de produto.');
  mockSendText.mockResolvedValue(undefined);
  const messageData = { message: { imageMessage: { caption: 'O que é isso?' } } };
  await handleImageMessage('5511999999999', messageData);
  expect(mockGetMediaBase64).toHaveBeenCalledWith(messageData);
  expect(mockChatWithImage).toHaveBeenCalledWith('base64imagedata', 'O que é isso?');
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Vejo uma imagem de produto.');
});

test('handleImageMessage usa caption vazia quando imageMessage não tem legenda', async () => {
  mockGetMediaBase64.mockResolvedValue('base64imagedata');
  mockChatWithImage.mockResolvedValue('Resposta');
  mockSendText.mockResolvedValue(undefined);
  const messageData = { message: { imageMessage: {} } };
  await handleImageMessage('5511999999999', messageData);
  expect(mockChatWithImage).toHaveBeenCalledWith('base64imagedata', '');
});

test('handleImageMessage não lança erro quando getMediaBase64 falha', async () => {
  mockGetMediaBase64.mockRejectedValue(new Error('network error'));
  await expect(handleImageMessage('5511999999999', { message: { imageMessage: {} } })).resolves.not.toThrow();
  expect(mockSendText).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Rodar para confirmar falha**

```bash
npx jest tests/image.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/image'`

- [ ] **Step 7: Implementar `bot/src/image.js`**

```javascript
const { getMediaBase64, sendText } = require('./evolutionApi');
const { chatWithImage } = require('./openai');

async function handleImageMessage(phone, messageData) {
  try {
    const base64 = await getMediaBase64(messageData);
    const caption = messageData.message?.imageMessage?.caption || '';
    const reply = await chatWithImage(base64, caption);
    await sendText(phone, reply);
  } catch (err) {
    console.error('Erro ao processar imagem:', err.message);
  }
}

module.exports = { handleImageMessage };
```

- [ ] **Step 8: Rodar para confirmar que passa**

```bash
npx jest tests/image.test.js --no-coverage
```

Saída esperada: `PASS tests/image.test.js` — 3 testes passando.

- [ ] **Step 9: Commit**

```bash
cd ..
git add bot/src/openai.js bot/tests/openai.test.js bot/src/image.js bot/tests/image.test.js
git commit -m "feat: add image description module via GPT-4o Vision"
```

---

## Task 5: `broadcast.js` — envio em massa (TDD)

**Files:**
- Create: `bot/src/broadcast.js`
- Create: `bot/tests/broadcast.test.js`

- [ ] **Step 1: Escrever o teste com falha**

Criar `bot/tests/broadcast.test.js`:

```javascript
const mockSendText = jest.fn();

jest.mock('../src/evolutionApi', () => ({
  sendText: mockSendText,
  sendList: jest.fn(),
  sendImageBase64: jest.fn(),
  registerWebhook: jest.fn(),
  getMediaBase64: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      contacts: [
        { phone: '5511999999999', name: 'João' },
        { phone: '5511888888888', name: 'Maria' },
      ],
    })
  ),
}));

process.env.BROADCAST_DELAY_MS = '0';

const { loadContacts, sendBroadcast } = require('../src/broadcast');

beforeEach(() => jest.clearAllMocks());

test('loadContacts retorna lista de contatos do contacts.json', () => {
  const contacts = loadContacts();
  expect(contacts).toHaveLength(2);
  expect(contacts[0]).toEqual({ phone: '5511999999999', name: 'João' });
  expect(contacts[1]).toEqual({ phone: '5511888888888', name: 'Maria' });
});

test('sendBroadcast envia mensagem para todos os contatos e retorna contadores', async () => {
  mockSendText.mockResolvedValue(undefined);
  const result = await sendBroadcast('Promoção especial!');
  expect(mockSendText).toHaveBeenCalledTimes(2);
  expect(mockSendText).toHaveBeenCalledWith('5511999999999', 'Promoção especial!');
  expect(mockSendText).toHaveBeenCalledWith('5511888888888', 'Promoção especial!');
  expect(result).toEqual({ sent: 2, failed: 0 });
});

test('sendBroadcast conta falhas sem interromper envio para os demais', async () => {
  mockSendText
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('timeout'));
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 1, failed: 1 });
});

test('sendBroadcast retorna { sent: 0, failed: 0 } para lista vazia', async () => {
  const fs = require('fs');
  fs.readFileSync.mockReturnValueOnce(JSON.stringify({ contacts: [] }));
  const result = await sendBroadcast('Mensagem');
  expect(result).toEqual({ sent: 0, failed: 0 });
  expect(mockSendText).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
cd bot && npx jest tests/broadcast.test.js --no-coverage
```

Saída esperada: `Cannot find module '../src/broadcast'`

- [ ] **Step 3: Implementar `bot/src/broadcast.js`**

```javascript
const fs = require('fs');
const path = require('path');
const { sendText } = require('./evolutionApi');

function loadContacts() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../contacts.json'), 'utf8')
  );
  return data.contacts || [];
}

async function sendBroadcast(message) {
  const contacts = loadContacts();
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

module.exports = { loadContacts, sendBroadcast };
```

- [ ] **Step 4: Rodar para confirmar que passa**

```bash
npx jest tests/broadcast.test.js --no-coverage
```

Saída esperada: `PASS tests/broadcast.test.js` — 4 testes passando.

- [ ] **Step 5: Commit**

```bash
cd ..
git add bot/src/broadcast.js bot/tests/broadcast.test.js
git commit -m "feat: add broadcast module for bulk messaging"
```

---

## Task 6: Atualizar `webhook.js` — áudio, imagem e `/broadcast`

**Files:**
- Modify: `bot/src/webhook.js`
- Modify: `bot/tests/webhook.test.js`

- [ ] **Step 1: Atualizar imports em `bot/src/webhook.js`**

Adicionar ao bloco de requires no topo (após as imports existentes):

```javascript
const { transcribeAudio } = require('./audio');
const { handleImageMessage } = require('./image');
const { sendBroadcast, loadContacts } = require('./broadcast');
```

- [ ] **Step 2: Adicionar `/broadcast` a `handleCommand` em `bot/src/webhook.js`**

Dentro de `handleCommand`, adicionar antes do `return res.sendStatus(200)` final:

```javascript
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

- [ ] **Step 3: Atualizar `handleWebhook` para detectar áudio e imagem**

Substituir o bloco existente (de `const text = extractMessage(data)` até o `res.sendStatus(200)` que precede o IIFE final) pelo seguinte:

```javascript
  const text = extractMessage(data);
  const hasAudio = !text && !!data.message?.audioMessage;
  const hasImage = !text && !!data.message?.imageMessage;

  if (!text && !hasAudio && !hasImage) return res.sendStatus(200);

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
      if (hasImage) {
        await handleImageMessage(phone, data);
        return;
      }

      let messageText = text;
      if (hasAudio) {
        messageText = await transcribeAudio(data);
        if (!messageText) return;
      }

      const reply = await processMessage(phone, messageText);
      if (reply) await sendText(phone, reply);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
```

- [ ] **Step 4: Adicionar mocks e requires ao `bot/tests/webhook.test.js`**

Adicionar ao bloco de mocks no topo:

```javascript
jest.mock('../src/audio', () => ({ transcribeAudio: jest.fn() }));
jest.mock('../src/image', () => ({ handleImageMessage: jest.fn() }));
jest.mock('../src/broadcast', () => ({
  sendBroadcast: jest.fn(),
  loadContacts: jest.fn(),
}));
```

Adicionar ao bloco de requires:

```javascript
const { transcribeAudio } = require('../src/audio');
const { handleImageMessage } = require('../src/image');
const { sendBroadcast, loadContacts } = require('../src/broadcast');
```

Adicionar no `beforeEach`:

```javascript
  transcribeAudio.mockResolvedValue(null);
  handleImageMessage.mockResolvedValue(undefined);
  sendBroadcast.mockResolvedValue({ sent: 2, failed: 0 });
  loadContacts.mockReturnValue([{ phone: '5511111111111' }, { phone: '5511222222222' }]);
```

- [ ] **Step 5: Adicionar novos testes ao final de `bot/tests/webhook.test.js`**

```javascript
test('transcreve áudio e processa como texto normal', async () => {
  const audioPayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-audio' },
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } },
    },
  };
  transcribeAudio.mockResolvedValue('quero agendar um horário');
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Claro! Vamos agendar.');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(audioPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(transcribeAudio).toHaveBeenCalledWith(audioPayload.data);
  expect(chat).toHaveBeenCalledWith([], 'quero agendar um horário');
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Claro! Vamos agendar.');
});

test('ignora mensagem de áudio quando transcrição retorna null', async () => {
  const audioPayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-audio' },
      message: { audioMessage: {} },
    },
  };
  transcribeAudio.mockResolvedValue(null);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(audioPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(chat).not.toHaveBeenCalled();
});

test('roteia imagem para handleImageMessage sem chamar OpenAI', async () => {
  const imagePayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-img' },
      message: { imageMessage: { caption: 'O que é isso?' } },
    },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(imagePayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleImageMessage).toHaveBeenCalledWith('5511999999999', imagePayload.data);
  expect(chat).not.toHaveBeenCalled();
});

test('processa comando /broadcast de mensagem fromMe', async () => {
  const payload = {
    ...validPayload,
    data: {
      key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' },
      message: { conversation: '/broadcast Promoção especial!' },
    },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(sendBroadcast).toHaveBeenCalledWith('Promoção especial!');
});
```

- [ ] **Step 6: Rodar todos os testes**

```bash
cd bot && npx jest --no-coverage
```

Saída esperada: `Test Suites: 13 passed, 13 total`

- [ ] **Step 7: Commit**

```bash
cd ..
git add bot/src/webhook.js bot/tests/webhook.test.js
git commit -m "feat: add audio, image and broadcast routing to webhook"
```

---

## Task 7: Atualizar `index.js` — rota `POST /broadcast`

**Files:**
- Modify: `bot/src/index.js`

- [ ] **Step 1: Atualizar `bot/src/index.js`**

Adicionar ao bloco de requires no topo:

```javascript
const { sendBroadcast, loadContacts } = require('./broadcast');
```

Adicionar a rota após a rota `/notify`:

```javascript
app.post('/broadcast', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  const contacts = loadContacts();
  res.json({ queued: contacts.length });
  (async () => {
    try {
      await sendBroadcast(message);
    } catch (err) {
      console.error('Erro no broadcast via HTTP:', err.message);
    }
  })();
});
```

- [ ] **Step 2: Rodar todos os testes**

```bash
cd bot && npx jest --no-coverage
```

Saída esperada: `Test Suites: 13 passed, 13 total`

- [ ] **Step 3: Commit**

```bash
cd ..
git add bot/src/index.js
git commit -m "feat: add POST /broadcast route to index"
```
