# WhatsApp Bot — Funcionalidades Avançadas Universais

**Branch:** `advanced`
**Data:** 2026-05-19

---

## Visão geral

Adiciona 6 funcionalidades universais ao bot existente, implementadas em ordem de dependência:

1. Respostas fora do horário
2. Transferência para humano
3. Catálogo interativo
4. Notificações proativas
5. Agendamento com Google Calendar
6. Pix automático com Mercado Pago

---

## Mudança arquitetural central: estado de conversa

### Problema

O bot atual é stateless além do histórico de mensagens. As novas funcionalidades exigem:
- Saber se o bot está pausado para atendente humano
- Rastrear em qual etapa de um fluxo multi-step o cliente está
- Persistir dados coletados durante um fluxo (ex: serviço escolhido antes de confirmar agendamento)

### Solução: `bot/src/state.js`

Estado por telefone no Redis, chave `state:{phone}`, estrutura:

```json
{
  "mode": "bot",
  "flow": null,
  "step": 0,
  "data": {}
}
```

- **`mode`**: `"bot"` (padrão) | `"human"` (pausado para atendente)
- **`flow`**: `null` | `"catalog"` | `"scheduling"` | `"payment"`
- **`step`**: etapa atual dentro do flow (inteiro, começa em 0)
- **`data`**: payload acumulado durante o flow (ex: `{ serviceId, slotDatetime }`)

TTL padrão: 24h. Estado `"human"` usa TTL próprio configurável via `HUMAN_TAKEOVER_TIMEOUT_MINUTES` (padrão: 30).

**Exports:** `getState(phone)`, `setState(phone, partialState, ttl?)`, `clearState(phone)`, `setHumanMode(phone)`, `isHumanMode(phone)`

### Mudanças no `webhook.js`

Ordem de verificações no início de `handleWebhook`, antes de qualquer processamento:

1. Valida `x-api-key` (existente)
2. Filtra evento/fromMe/grupos (existente)
3. Detecta **comandos** (`/bot on`, `/notify`) — processa e retorna
4. Checa `isHumanMode(phone)` — se true, retorna 200 silencioso
5. Checa `isOpen()` — se fora do horário, responde com `closedMessage` e retorna
6. Se `state.flow !== null` — roteia para handler do flow (`handleCatalogFlow`, `handleSchedulingFlow`, `handlePaymentFlow`)
7. Caso contrário — fluxo normal com OpenAI (detecta intenções especiais na resposta)

### Intenções especiais retornadas pelo OpenAI

O system prompt instrui o modelo a retornar tokens especiais quando detectar intenções:

| Token | Intenção |
|---|---|
| `__TRANSFER__` | Cliente quer falar com humano |
| `__CATALOG__` | Cliente quer ver produtos/serviços |
| `__SCHEDULE__` | Cliente quer agendar |
| `__PAYMENT__:{amount}:{description}` | Cliente quer pagar (OpenAI extrai valor e descrição da mensagem; se vier do catálogo, o handler de catalog transita diretamente sem passar pelo OpenAI) |

O webhook intercepta esses tokens antes de enviar a resposta ao cliente.

---

## Feature 1: Respostas fora do horário

### Configuração em `company.json`

```json
{
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

`null` em um dia = fechado. `closedMessage` editável pelo dono do negócio.

### `bot/src/businessHours.js`

- Carrega `businessHours` do `company.json` (cacheado no `require()`)
- `isOpen()` — verifica se o momento atual (no timezone configurado) está dentro do horário usando `Intl.DateTimeFormat` nativo do Node.js. Sem dependências externas.
- Exports: `isOpen()`

### Comportamento

Quando `isOpen()` retorna `false`:
- Responde ao cliente com `closedMessage`
- Não chama OpenAI
- Salva a mensagem no histórico (para contexto quando reabrir)
- Retorna 200

---

## Feature 2: Transferência para humano

### Ativação pelo cliente

O system prompt instrui o OpenAI a retornar `__TRANSFER__` quando detectar intenção de falar com humano ("quero um atendente", "falar com pessoa", etc.).

Ao detectar `__TRANSFER__`:
1. `setState(phone, { mode: 'human' }, HUMAN_TAKEOVER_TIMEOUT_MINUTES * 60)`
2. Envia ao cliente: "Conectando você a um atendente. Aguarde um momento."

### Modo humano ativo

Enquanto `isHumanMode(phone)` retorna `true`, todas as mensagens do cliente são ignoradas (200 silencioso). O atendente responde diretamente pelo WhatsApp.

### Reativação pelo atendente

Comando: `/bot on 5511999999999`

Processado no webhook antes de qualquer outra lógica:
1. `clearState(phone)`
2. Envia ao cliente: "Você está novamente com o assistente virtual. Como posso ajudar?"

### Timeout automático

O TTL do Redis expira o estado `human` automaticamente. O bot retoma no próximo `handleWebhook` sem mensagem proativa ao cliente.

### Variáveis de ambiente

```
HUMAN_TAKEOVER_TIMEOUT_MINUTES=30
```

---

## Feature 3: Catálogo interativo

### `catalog.json` (raiz do projeto)

```json
{
  "categories": [
    {
      "id": "services",
      "title": "Serviços",
      "items": [
        {
          "id": "haircut",
          "title": "Corte de Cabelo",
          "description": "Corte masculino com acabamento",
          "price": 45.00,
          "duration": 30
        }
      ]
    }
  ]
}
```

Montado como volume Docker read-only: `./catalog.json:/app/catalog.json:ro`.

### `bot/src/catalog.js`

- Carrega `catalog.json` uma vez no `require()`
- `getCategories()` — retorna lista de categorias
- `getCategory(id)` — retorna categoria por id
- `getItem(categoryId, itemId)` — retorna item
- `buildCategoryListMessage()` — formata list message da Evolution API com categorias
- `buildItemListMessage(categoryId)` — formata list message com itens da categoria

### Fluxo (state.flow = "catalog")

```
step 0 → Envia list message com categorias
step 1 → Cliente seleciona categoria → envia list message com itens
step 2 → Cliente seleciona item → mostra detalhes + botões "Agendar" / "Pagar" / "Voltar"
step 3 → Transita para flow de scheduling ou payment conforme seleção, ou volta ao step 0
```

"cancelar" em qualquer step aborta o flow (`flow = null`).

### Interação via Evolution API

Usa `sendList` (list messages) e `sendButtons` (button messages) da Evolution API v2 — interação nativa do WhatsApp sem o cliente precisar digitar.

---

## Feature 4: Notificações proativas

### `bot/src/notify.js`

- `sendNotification(phone, message)` — valida número, chama `sendText()`, loga envio
- Usado por: rota HTTP, handler de comando, lembretes de agendamento, confirmação de pagamento
- Enviado independente do estado da conversa (modo humano, fora do horário)

### Via HTTP — `POST /notify`

```
Headers: x-api-key: {WEBHOOK_TOKEN}
Body: { "phone": "5511999999999", "message": "Seu pedido saiu!" }
Response: 200 { "sent": true } | 400 | 401
```

### Via comando WhatsApp — `/notify`

```
/notify 5511999999999 Seu pedido chegou!
```

Parseado no webhook: extrai número (primeiro token após `/notify`) e mensagem (resto do texto).

---

## Feature 5: Agendamento com Google Calendar

### Configuração

- `google-credentials.json` na raiz (gitignored), montado como volume Docker
- `GOOGLE_CALENDAR_ID` no `.env`
- Dependência: `googleapis`

### `bot/src/scheduling.js`

- `getAvailableSlots(date, durationMinutes)` — busca eventos existentes na agenda, retorna horários livres dentro do `businessHours` (máx 5 slots por chamada, próximos 3 dias)
- `createAppointment(phone, service, datetime, durationMinutes)` — cria evento no Google Calendar com número de WhatsApp na descrição
- `cancelAppointment(eventId)` — remove evento
- `scheduleReminders(phone, datetime, eventId)` — agenda lembretes via `notify.js`
- `handleSchedulingFlow(phone, state, message)` — orquestra steps, retorna `{ reply, nextState }`

### Fluxo (state.flow = "scheduling")

```
step 0 → Pergunta qual serviço (list message do catálogo ou lista de duração)
step 1 → Mostra slots disponíveis (botões com até 5 opções dos próximos 3 dias)
step 2 → Confirma: "Confirmar [Serviço] em [Data] às [Hora]? (Sim/Não)"
step 3 → Cria evento no Google Calendar
       → Envia confirmação com código do agendamento
       → Agenda lembretes (D-1 e H-2) via notify.js
       → flow = null
```

### Lembretes

Ao criar agendamento, persiste no Redis:
- `reminder:{phone}:{eventId}:d1` com TTL até D-1 às 09:00
- `reminder:{phone}:{eventId}:h2` com TTL até H-2

Na startup do servidor (`index.js`), varre chaves `reminder:*` e reagenda os `setTimeout` pendentes para o tempo restante (calculado via TTL da chave Redis). Ao disparar, chama `sendNotification()` e remove a chave. O TTL da chave Redis é igual ao tempo até o disparo, garantindo limpeza automática mesmo se o servidor não reiniciar antes do lembrete.

### Variáveis de ambiente

```
GOOGLE_CALENDAR_ID=seu-calendario@group.calendar.google.com
GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json
```

---

## Feature 6: Pix automático com Mercado Pago

### Configuração

- `MERCADOPAGO_ACCESS_TOKEN` no `.env`
- Dependência: `mercadopago`

### `bot/src/payment.js`

- `createPixCharge(phone, amount, description)` — cria cobrança Pix com `external_reference = phone`, retorna `{ qrCode, qrCodeText, paymentId, expiresAt }`
- `handlePaymentWebhook(body, signature)` — valida assinatura `x-signature` do Mercado Pago, identifica `phone` pelo `external_reference`, chama `sendNotification()`
- `handlePaymentFlow(phone, state, message)` — orquestra steps, retorna `{ reply, nextState }`

### Fluxo (state.flow = "payment")

```
step 0 → Confirma valor: "Gerar Pix de R$ {value} para {description}? (Sim/Não)"
step 1 → Gera cobrança no Mercado Pago
       → Envia copia-e-cola Pix (texto)
       → Envia QR code como imagem (sendImage da Evolution API)
       → Envia "Pix válido por 30 minutos."
       → state.data = { paymentId, expiresAt }
step 2 → Aguarda webhook do Mercado Pago
       → Mensagens do cliente durante espera: "Aguardando confirmação do Pix. Digite 'cancelar' para desistir."
       → Confirmação recebida: "✅ Pagamento recebido! Obrigado. Em breve entraremos em contato para confirmar os próximos passos."
       → Expirado (detectado no próximo handleWebhook via expiresAt): "⏰ Pix expirado. Digite 'pagar' para gerar um novo."
```

### Nova rota

```
POST /payment/webhook  →  handlePaymentWebhook
```

Sem autenticação por token — valida assinatura `x-signature` do Mercado Pago no handler.

### Variáveis de ambiente

```
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
```

---

## Novos arquivos

```
whatsapp-bot/
├── catalog.json                          # catálogo de produtos/serviços
├── google-credentials.json               # gitignored, service account Google
└── bot/
    └── src/
        ├── state.js                      # estado de conversa por telefone
        ├── businessHours.js              # verificação de horário de atendimento
        ├── catalog.js                    # carrega catálogo, formata list messages
        ├── scheduling.js                 # Google Calendar + flow de agendamento
        ├── payment.js                    # Mercado Pago Pix + flow de pagamento
        └── notify.js                     # envio de notificações proativas
    └── tests/
        ├── state.test.js
        ├── businessHours.test.js
        ├── catalog.test.js
        ├── scheduling.test.js
        ├── payment.test.js
        ├── notify.test.js
        └── webhook.test.js               # atualizado com novos casos
```

## Variáveis de ambiente adicionadas ao `.env`

```
HUMAN_TAKEOVER_TIMEOUT_MINUTES=30
GOOGLE_CALENDAR_ID=seu-calendario@group.calendar.google.com
GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
```

## Dependências adicionadas ao `bot/package.json`

```
googleapis
mercadopago
```
