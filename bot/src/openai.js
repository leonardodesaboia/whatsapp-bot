const OpenAI = require('openai');
const { getCompanySettings } = require('./config');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DAY_LABELS = { mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function formatBusinessHours(businessHours) {
  if (!businessHours) return '24 horas';
  const active = DAYS.filter((d) => businessHours[d]);
  if (active.length === 0) return 'Fechado';

  const groups = [];
  let group = [active[0]];
  for (let i = 1; i < active.length; i++) {
    const prev = active[i - 1];
    const curr = active[i];
    const consecutive = DAYS.indexOf(curr) === DAYS.indexOf(prev) + 1;
    const sameTime = businessHours[prev].open === businessHours[curr].open &&
                     businessHours[prev].close === businessHours[curr].close;
    if (consecutive && sameTime) {
      group.push(curr);
    } else {
      groups.push(group);
      group = [curr];
    }
  }
  groups.push(group);

  return groups.map((g) => {
    const { open, close } = businessHours[g[0]];
    const label = g.length === 1
      ? DAY_LABELS[g[0]]
      : `${DAY_LABELS[g[0]]}–${DAY_LABELS[g[g.length - 1]]}`;
    return `${label} ${open}–${close}`;
  }).join(', ');
}

async function buildSystemPrompt() {
  const company = await getCompanySettings();
  if (!company) return 'Você é um assistente virtual. Responda apenas dúvidas relacionadas à empresa.';

  const faqText = (company.faq || [])
    .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
    .join('\n\n');

  const horario = formatBusinessHours(company.business_hours);

  return `Você é um assistente virtual da ${company.nome}.
${company.descricao}
Horário de atendimento: ${horario}
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
  const userText = caption
    ? caption
    : 'O cliente enviou uma imagem. Responda de forma natural e amigável, como um atendente humano faria — sem descrever a imagem formalmente. Se for relevante para a empresa, comente de forma breve e direcione o cliente; se não for, responda com simpatia e pergunte como pode ajudar.';

  const messages = [
    { role: 'system', content: await buildSystemPrompt() },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: userText },
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

module.exports = { chat, buildSystemPrompt, chatWithImage, formatBusinessHours };
