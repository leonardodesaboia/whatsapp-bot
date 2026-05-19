# Communication Features — Design Spec

**Date:** 2026-05-19
**Scope:** Parte 3 do template base de WhatsApp bot — funcionalidades de comunicação: transcrição de áudio, descrição de imagens e broadcast de mensagens.

**Pré-requisito:** Partes 1 e 2 implementadas (state machine, catalog, scheduling, payment).

---

## Objetivo

Ampliar os canais de entrada e saída do bot:
- **Entrada:** aceitar áudio (transcrição) e imagens (visão) além de texto
- **Saída:** envio em massa para lista de contatos (broadcast)

---

## Arquitetura Geral

```
Entrada de mídia:
  audioMessage → audio.js → Whisper API → texto → pipeline normal
  imageMessage → image.js → GPT-4o Vision → resposta direta ao cliente

Saída em massa:
  POST /broadcast | /broadcast cmd → broadcast.js → sendText × N contatos
```

Todos os módulos seguem o padrão já estabelecido: arquivo único por responsabilidade, TDD com mocks, sem dependências externas novas além das já instaladas (OpenAI SDK já presente).

---

## Módulo 1: Transcrição de Áudio (`src/audio.js`)

### Fluxo

1. `webhook.js` chama `extractMessage(data)` — retorna `null` para `audioMessage`
2. `handleWebhook` detecta `data.message?.audioMessage` e chama `transcribeAudio(data)`
3. `transcribeAudio` chama `getMediaBase64(data)` na `evolutionApi.js` para obter o base64 do arquivo
4. Converte base64 para `Buffer` e envia para OpenAI Whisper (`whisper-1`)
5. Retorna string com o texto transcrito
6. `handleWebhook` usa o texto como se fosse mensagem digitada — segue para `processMessage` normalmente

### Interface

```javascript
// src/audio.js
async function transcribeAudio(messageData) // → string
module.exports = { transcribeAudio };
```

### Dependências novas

- `evolutionApi.js`: adicionar `getMediaBase64(messageData)` — `POST /chat/getBase64FromMediaMessage/{instance}` com body `{ message: messageData }`
- OpenAI SDK: `openai.audio.transcriptions.create` (já disponível via pacote `openai` instalado)

### Configuração

```bash
# .env.example
WHISPER_LANGUAGE=pt   # opcional, padrão pt
```

### Comportamento de erro

Se a transcrição falhar (áudio corrompido, timeout), loga o erro e retorna `null` — webhook ignora a mensagem silenciosamente.

### Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `bot/src/audio.js` |
| Criar | `bot/tests/audio.test.js` |
| Modificar | `bot/src/evolutionApi.js` — adicionar `getMediaBase64` |
| Modificar | `bot/src/webhook.js` — detectar audioMessage |
| Modificar | `bot/tests/evolutionApi.test.js` — teste de `getMediaBase64` |
| Modificar | `bot/tests/webhook.test.js` — testes de áudio |
| Modificar | `.env.example` — `WHISPER_LANGUAGE` |

---

## Módulo 2: Descrição de Imagens (`src/image.js`)

### Fluxo

1. `handleWebhook` detecta `data.message?.imageMessage` (após checar áudio)
2. Chama `handleImageMessage(phone, messageData)`
3. `handleImageMessage` obtém base64 via `getMediaBase64`
4. Extrai a legenda da imagem (`imageMessage.caption`) se existir
5. Chama `chatWithImage(base64, caption)` em `openai.js` — usa `gpt-4o` com conteúdo multimodal e o system prompt da empresa
6. Envia a resposta diretamente ao cliente via `sendText`
7. Não registra no histórico de conversa, não passa por flows

### Interface

```javascript
// src/image.js
async function handleImageMessage(phone, messageData) // → void
module.exports = { handleImageMessage };

// src/openai.js (adição)
async function chatWithImage(base64, caption) // → string
```

### Decisão de design

Imagens não viram "texto do usuário" — o GPT-4o responde diretamente com contexto da empresa. Isso evita poluir o histórico de conversa com descrições de imagem e mantém o flow ativo inalterado.

### Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `bot/src/image.js` |
| Criar | `bot/tests/image.test.js` |
| Modificar | `bot/src/openai.js` — adicionar `chatWithImage` |
| Modificar | `bot/src/webhook.js` — detectar imageMessage |
| Modificar | `bot/tests/webhook.test.js` — testes de imagem |

---

## Módulo 3: Broadcast (`src/broadcast.js`)

### `contacts.json` (raiz do projeto)

```json
{
  "contacts": [
    { "phone": "5511999999999", "name": "João" },
    { "phone": "5511888888888", "name": "Maria" }
  ]
}
```

### Interface

```javascript
// src/broadcast.js
function loadContacts()                  // → array de { phone, name }
async function sendBroadcast(message)    // → { sent: N, failed: N }
module.exports = { loadContacts, sendBroadcast };
```

### Fluxo de envio

`sendBroadcast` itera os contatos sequencialmente com delay de `BROADCAST_DELAY_MS` (padrão 1000ms) entre cada `sendText` para não throttlar o Evolution API. Erros individuais são capturados e contados em `failed` sem interromper o envio para os demais.

Retorna `{ sent, failed }` ao final.

### Disparo via HTTP

```
POST /broadcast
Header: x-api-key: {WEBHOOK_TOKEN}
Body: { "message": "Promoção especial hoje!" }
```

Responde imediatamente `{ queued: N }` e envia em background (mesmo padrão fire-and-forget do webhook).

### Disparo via comando fromMe

```
/broadcast Promoção especial hoje!
```

Parsed em `handleCommand` no `webhook.js`. Responde `{ ok: true }` e envia em background.

### Configuração

```bash
# .env.example
BROADCAST_DELAY_MS=1000
```

### Arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `bot/src/broadcast.js` |
| Criar | `contacts.json` |
| Criar | `bot/tests/broadcast.test.js` |
| Modificar | `bot/src/index.js` — rota `POST /broadcast` |
| Modificar | `bot/src/webhook.js` — comando `/broadcast` em `handleCommand` |
| Modificar | `bot/tests/webhook.test.js` — teste do comando `/broadcast` |
| Modificar | `docker-compose.yml` — montar `contacts.json` |
| Modificar | `.env.example` — `BROADCAST_DELAY_MS` |

---

## Mapa completo de arquivos

**Criar:**
- `bot/src/audio.js`
- `bot/src/image.js`
- `bot/src/broadcast.js`
- `contacts.json`
- `bot/tests/audio.test.js`
- `bot/tests/image.test.js`
- `bot/tests/broadcast.test.js`

**Modificar:**
- `bot/src/evolutionApi.js` — `getMediaBase64`, atualizar exports
- `bot/src/openai.js` — `chatWithImage`, atualizar exports
- `bot/src/webhook.js` — detectar áudio e imagem, comando `/broadcast`
- `bot/src/index.js` — rota `POST /broadcast`
- `bot/tests/evolutionApi.test.js` — teste de `getMediaBase64`
- `bot/tests/webhook.test.js` — testes de áudio, imagem e broadcast
- `.env.example` — `WHISPER_LANGUAGE`, `BROADCAST_DELAY_MS`
- `docker-compose.yml` — montar `contacts.json`

---

## Testes

Cada módulo novo tem seu arquivo de teste com mocks completos:
- `audio.test.js` — mock de `evolutionApi.getMediaBase64` e OpenAI Whisper
- `image.test.js` — mock de `evolutionApi.getMediaBase64` e `openai.chatWithImage`
- `broadcast.test.js` — mock de `fs.readFileSync` (contacts.json) e `evolutionApi.sendText`

Suites existentes de `webhook` e `evolutionApi` recebem casos adicionais.

Meta: **13 suites, ~100 testes** ao final da Parte 3.
