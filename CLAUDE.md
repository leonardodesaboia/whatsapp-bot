# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All bot commands run from the `bot/` directory:

```bash
# Instalar dependências
npm install

# Rodar todos os testes
npm test

# Rodar um único arquivo de teste
npx jest tests/redis.test.js --no-coverage

# Rodar um teste específico pelo nome
npx jest --testNamePattern="getHistory retorna array vazio" --no-coverage

# Iniciar o servidor localmente
npm start
```

Docker (rodar da raiz do projeto):

```bash
docker compose up -d          # subir todos os serviços
docker compose logs -f bot    # acompanhar logs do bot
docker compose restart bot    # reiniciar após mudanças em company.json ou catalog.json
```

## Arquitetura

O bot recebe mensagens via webhook HTTP e responde usando a OpenAI API. Fluxo completo:

```
WhatsApp → Evolution API → POST /webhook → webhook.js → state.js → flow handlers → evolutionApi.js → WhatsApp
```

**`src/webhook.js`** é o orquestrador central. Ao receber uma requisição:
1. Valida o header `x-api-key` contra `WEBHOOK_TOKEN`
2. Mensagens `fromMe` são tratadas como comandos (`/bot on`, `/notify`)
3. Filtra: apenas evento `messages.upsert`, apenas chats privados (`@s.whatsapp.net`)
4. Verifica modo humano (`isHumanMode`) — se ativo, ignora a mensagem
5. Verifica horário de atendimento (`isOpen`) — se fechado, responde com `closedMessage`
6. Responde 200 imediatamente e processa de forma assíncrona
7. Em `processMessage`: roteia para o flow handler ativo (catalog/scheduling/payment) ou chama OpenAI
8. OpenAI pode retornar tokens especiais que ativam flows: `__TRANSFER__`, `__CATALOG__`, `__SCHEDULE__`, `__PAYMENT__:{valor}:{descricao}`

**`src/state.js`** gerencia estado de conversa por telefone no Redis (`state:{phone}`). Estrutura: `{ mode, flow, step, data }`. TTL padrão 24h. `setHumanMode` usa TTL de `HUMAN_TAKEOVER_TIMEOUT_MINUTES` minutos.

**`src/businessHours.js`** lê `businessHours` do `company.json`. Usa timezone configurável para verificar se está dentro do horário de atendimento.

**`src/catalog.js`** lê `catalog.json` e implementa o flow de catálogo interativo com list messages da Evolution API. Steps: 0 (mostrar categorias) → 1 (mostrar itens) → 2 (mostrar detalhes) → 3 (agendar ou pagar).

**`src/scheduling.js`** integra com Google Calendar via Service Account. Busca slots livres nos próximos 3 dias (máx. 5), cria eventos e agenda lembretes no Redis com `setTimeout`. `rescheduleAllReminders()` é chamado no startup para restaurar lembretes após restart.

**`src/payment.js`** integra com Mercado Pago SDK para gerar cobranças Pix. Envia QR code como imagem base64 e código copia-e-cola. `handlePaymentWebhook` processa notificações de pagamento aprovado.

**`src/notify.js`** wrapper simples sobre `sendText` com validação de parâmetros. Usado por flows e comandos internos.

**`src/openai.js`** carrega `company.json` uma única vez no momento do `require()`. O system prompt inclui FAQ e instruções para retornar tokens de intenção. O modelo padrão é `gpt-4o-mini`, configurável via `OPENAI_MODEL`.

**`src/redis.js`** usa conexão singleton. Histórico em `history:{phone}` (TTL 24h, máx `MAX_HISTORY` pares). Estado em `state:{phone}`. Lembretes em `reminder:{phone}:{eventId}:{tipo}`. Exporta `getClient` para acesso direto.

**`src/evolutionApi.js`** lê variáveis de ambiente no momento do `require()`. Funções: `sendText`, `sendList` (list messages interativas), `sendImageBase64` (QR code Pix), `registerWebhook`.

## Personalização da empresa

Editar `company.json` na raiz. Campos: `nome`, `descricao`, `horario`, `contato`, `faq[]`, `businessHours` (timezone + schedule por dia + closedMessage). Após editar: `docker compose restart bot`.

Editar `catalog.json` na raiz para produtos/serviços. Estrutura: `{ categories: [{ id, title, items: [{ id, title, description, price, duration }] }] }`.

## Variáveis de ambiente obrigatórias

Ver `.env.example`. As críticas:
- `EVOLUTION_API_KEY` — chave de acesso à Evolution API
- `EVOLUTION_INSTANCE` — nome da instância WhatsApp criada na Evolution API
- `OPENAI_API_KEY` — chave da OpenAI
- `WEBHOOK_TOKEN` — segredo compartilhado entre Evolution API e bot (header `x-api-key`)
- `GOOGLE_CALENDAR_ID` — ID do Google Calendar para agendamentos
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho para o JSON da Service Account Google
- `MERCADOPAGO_ACCESS_TOKEN` — token de acesso do Mercado Pago
- `HUMAN_TAKEOVER_TIMEOUT_MINUTES` — minutos até o bot retomar após transferência (padrão: 30)

## Comandos internos (mensagens fromMe)

Enviados pelo próprio número do bot no WhatsApp:

- `/bot on {phone}` — reativa o bot para um número em modo humano
- `/notify {phone} {mensagem}` — envia notificação proativa para um número

A rota `POST /notify` (com header `x-api-key`) também dispara notificações via HTTP.

## Testes

10 arquivos de teste em `bot/tests/`, um por módulo. Todos os módulos externos são mockados via `jest.mock()`. O webhook usa `supertest` para testar o Express end-to-end.

Padrão importante: variáveis de ambiente nos testes devem ser configuradas **antes** do `require()` do módulo, pois vários módulos leem `process.env` no momento do require.

O aviso "Jest did not exit gracefully" no suite de scheduling é esperado — causado pelos `setTimeout` dos lembretes e não indica falha.
