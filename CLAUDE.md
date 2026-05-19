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

CRM / dashboard (rodar da raiz do projeto ou em `crm/`):

```bash
cd crm
npm install
npm run build

# ou via Docker
docker compose up -d crm
docker compose logs -f crm
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
7. Detecta tipo de mídia: texto, áudio (`audioMessage`) ou imagem (`imageMessage`)
8. Imagens são roteadas para `handleImageMessage`; áudio é transcrito via Whisper antes de seguir o pipeline normal
9. Em `processMessage`: roteia para o flow handler ativo (catalog/scheduling/payment) ou chama OpenAI
10. OpenAI pode retornar tokens especiais que ativam flows: `__TRANSFER__`, `__CATALOG__`, `__SCHEDULE__`, `__PAYMENT__:{valor}:{descricao}`

Observações importantes do runtime atual:
- O bot aceita tanto `POST /webhook` quanto `POST /webhook/:event` porque a Evolution API atual entrega em `/webhook/messages-upsert`
- Mensagens fora do horário também geram `upsertLead` e `addInteraction` no CRM antes da resposta automática
- Grupos (`@g.us`) continuam sendo ignorados intencionalmente

**`src/state.js`** gerencia estado de conversa por telefone no Redis (`state:{phone}`). Estrutura: `{ mode, flow, step, data }`. TTL padrão 24h. `setHumanMode` usa TTL de `HUMAN_TAKEOVER_TIMEOUT_MINUTES` minutos.

**`src/businessHours.js`** lê `businessHours` do `company.json`. Usa timezone configurável para verificar se está dentro do horário de atendimento.

**`src/catalog.js`** lê `catalog.json` e implementa o flow de catálogo interativo com list messages da Evolution API. Steps: 0 (mostrar categorias) → 1 (mostrar itens) → 2 (mostrar detalhes) → 3 (agendar ou pagar).

**`src/scheduling.js`** integra com Google Calendar via Service Account. Busca slots livres nos próximos 3 dias (máx. 5), cria eventos e agenda lembretes no Redis com `setTimeout`. `rescheduleAllReminders()` é chamado no startup para restaurar lembretes após restart.

**`src/payment.js`** integra com Mercado Pago SDK para gerar cobranças Pix. Envia QR code como imagem base64 e código copia-e-cola. `handlePaymentWebhook` processa notificações de pagamento aprovado.
Detalhes atuais:
- o webhook do Mercado Pago valida assinatura via `x-signature` + `x-request-id`
- o processamento busca o pagamento real na API antes de confirmar
- o pagamento aprovado só é aceito se bater com o `paymentId` pendente salvo no estado do usuário

**`src/notify.js`** wrapper simples sobre `sendText` com validação de parâmetros. Usado por flows e comandos internos.

**`src/openai.js`** carrega `company.json` uma única vez no momento do `require()`. O system prompt inclui FAQ e instruções para retornar tokens de intenção. O modelo padrão é `gpt-4o-mini`, configurável via `OPENAI_MODEL`.

**`src/redis.js`** usa conexão singleton. Histórico em `history:{phone}` (TTL 24h, máx `MAX_HISTORY` pares). Estado em `state:{phone}`. Lembretes em `reminder:{phone}:{eventId}:{tipo}`. Exporta `getClient` para acesso direto.

**`src/evolutionApi.js`** lê variáveis de ambiente no momento do `require()`. Funções: `sendText`, `sendList` (list messages interativas), `sendImageBase64` (QR code Pix), `registerWebhook`, `getMediaBase64` (obtém base64 de mídia via Evolution API).
Observações importantes da versão atual da Evolution API:
- o projeto foi ajustado para `evoapicloud/evolution-api:latest` (runtime validado em `v2.3.7`)
- `registerWebhook()` usa `POST /webhook/set/{instance}` com payload em `webhook`
- o webhook salvo precisa incluir `headers: { "x-api-key": WEBHOOK_TOKEN }`
- a URL interna correta entre containers é `http://bot:3000/webhook`

**`src/audio.js`** transcreve mensagens de áudio via OpenAI Whisper. `transcribeAudio(messageData)` obtém o base64 do áudio via `getMediaBase64`, cria um `File` e chama `openai.audio.transcriptions.create`. Retorna o texto transcrito ou `null` em caso de erro. O idioma é configurável via `WHISPER_LANGUAGE`.

**`src/image.js`** descreve imagens via GPT-4o Vision. `handleImageMessage(phone, messageData)` obtém o base64 da imagem via `getMediaBase64`, chama `chatWithImage` do `openai.js` e envia a resposta com `sendText`. Erros são tratados silenciosamente.

**`src/broadcast.js`** envia mensagens em massa para a lista de contatos em `contacts.json`. `loadContacts()` lê o arquivo sincronamente. `sendBroadcast(message)` itera os contatos com delay configurável (`BROADCAST_DELAY_MS`), contabiliza envios bem-sucedidos e falhas, e retorna `{ sent, failed }`.

## CRM / Dashboard

O CRM é um serviço Next.js separado em `crm/`, usando o mesmo PostgreSQL do stack em um banco `crm`.

Fluxo atual:

```
WhatsApp → Evolution API → bot/src/webhook.js → bot/src/crm.js → PostgreSQL (crm)
                                                         ↓
                                                  Next.js dashboard
```

Arquivos centrais:
- `bot/src/crm.js` — write-only do bot para leads/interactions
- `crm/db/migrate.js` — cria `stages`, `leads`, `interactions`, `users`
- `crm/db/seed.js` — cria etapas padrão e usuário admin
- `crm/src/lib/auth.ts` — NextAuth Credentials
- `crm/src/app/page.tsx` — funil principal
- `crm/src/app/leads/[id]/page.tsx` — detalhe do lead
- `crm/src/app/settings/page.tsx` — gestão de etapas

Pontos importantes do estado atual:
- o `crm` builda e sobe em Docker
- a proteção real de auth está nas páginas/rotas com `getServerSession`
- `crm/src/middleware.ts` ficou como checagem leve de cookie, não como proteção principal
- o dashboard já foi validado com leads reais vindos do bot
- o funil principal faz polling client-side só do kanban, não `router.refresh()` da página inteira
- intervalo atual do polling: `15s`
- o kanban também atualiza ao voltar o foco/visibilidade da aba
- o polling pausa durante drag and drop

Detalhe do lead:
- histórico de interações fica em área scrollável
- conversas antigas são carregadas automaticamente ao chegar no topo
- a API `GET /api/leads/[id]` suporta `page` e `limit` para paginação do histórico
- `Próximo contato` é um lembrete operacional manual, não dispara ação automática
- o campo usa `DD/MM/AAAA` e hora em 24h (`HH:MM`, exemplo `19:30`)

Tags:
- são normalizadas por regex em UI e API
- minúsculas, sem acento, espaços viram `-`
- só ficam letras, números e hífen

Settings:
- o seletor de cor das etapas foi estilizado para parecer um círculo preenchido completo

Validação já feita:
- login do CRM
- redirecionamento para `/login`
- kanban com leads reais
- drag and drop entre etapas
- detalhe do lead
- gravação real de leads/interações vindas do WhatsApp

## Personalização da empresa

Editar `company.json` na raiz. Campos: `nome`, `descricao`, `horario`, `contato`, `faq[]`, `businessHours` (timezone + schedule por dia + closedMessage). Após editar: `docker compose restart bot`.

Editar `catalog.json` na raiz para produtos/serviços. Estrutura: `{ categories: [{ id, title, items: [{ id, title, description, price, duration }] }] }`.

Editar `contacts.json` na raiz para a lista de broadcast. Estrutura: `{ contacts: [{ phone, name }] }`.

## Variáveis de ambiente obrigatórias

Ver `.env.example`. As críticas:
- `EVOLUTION_API_KEY` — chave de acesso à Evolution API
- `EVOLUTION_INSTANCE` — nome da instância WhatsApp criada na Evolution API
- `OPENAI_API_KEY` — chave da OpenAI
- `WEBHOOK_TOKEN` — segredo compartilhado entre Evolution API e bot (header `x-api-key`)
- `DATABASE_URL` — conexão PostgreSQL usada pelo bot e pelo CRM
- `NEXTAUTH_SECRET` — segredo do NextAuth para o dashboard
- `ADMIN_EMAIL` — email do admin inicial do CRM
- `ADMIN_PASSWORD` — senha do admin inicial do CRM
- `GOOGLE_CALENDAR_ID` — ID do Google Calendar para agendamentos
- `GOOGLE_APPLICATION_CREDENTIALS` — caminho para o JSON da Service Account Google
- `MERCADOPAGO_ACCESS_TOKEN` — token de acesso do Mercado Pago
- `MERCADOPAGO_WEBHOOK_SECRET` — segredo para validar o webhook do Mercado Pago
- `HUMAN_TAKEOVER_TIMEOUT_MINUTES` — minutos até o bot retomar após transferência (padrão: 30)
- `WHISPER_LANGUAGE` — idioma para transcrição de áudio (padrão: `pt`)
- `BROADCAST_DELAY_MS` — delay em ms entre envios no broadcast (padrão: `1000`)

## Comandos internos (mensagens fromMe)

Enviados pelo próprio número do bot no WhatsApp:

- `/bot on {phone}` — reativa o bot para um número em modo humano
- `/notify {phone} {mensagem}` — envia notificação proativa para um número
- `/broadcast {mensagem}` — envia mensagem em massa para todos os contatos de `contacts.json`

As rotas HTTP `POST /notify` e `POST /broadcast` (ambas com header `x-api-key`) também disparam esses envios via HTTP.

## Testes

14 arquivos de teste em `bot/tests/`, um por módulo. Todos os módulos externos são mockados via `jest.mock()`. O webhook usa `supertest` para testar o Express end-to-end.

Padrão importante: variáveis de ambiente nos testes devem ser configuradas **antes** do `require()` do módulo, pois vários módulos leem `process.env` no momento do require.

O aviso "Jest did not exit gracefully" no suite de scheduling é esperado — causado pelos `setTimeout` dos lembretes e não indica falha.

Observações de ambiente / operação:
- alguns testes com `supertest` podem falhar no sandbox por `listen EPERM`; nesse caso, rodar com permissão mais alta resolve
- no container do bot, arquivos locais devem ser referenciados com `../company.json`, `../catalog.json`, `../contacts.json` a partir de `src/`
- existe um `google-credentials.json` placeholder na raiz apenas para permitir boot do container; isso não valida Google Calendar real por si só
