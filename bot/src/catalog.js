const { getCatalogCategories } = require('./config');
const { sendText } = require('./evolutionApi');
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

async function handleCatalogFlow(phone, state, text) {
  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Tudo bem! Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    const categories = await getCatalogCategories();
    if (categories.length === 0) {
      await clearState(phone);
      await sendText(phone, 'Nosso catálogo está sendo atualizado. Tente novamente em breve.');
      return;
    }
    const lines = categories.map((c, i) => `${i + 1}. ${c.title}`).join('\n');
    await setState(phone, { flow: 'catalog', step: 1, data: { options: categories.map((c) => c.slug) } });
    await sendText(phone, `O que você procura?\n\n${lines}\n\nDigite o número ou "cancelar".`);
    return;
  }

  if (state.step === 1) {
    const options = state.data.options || [];
    const idx = parseInt(text, 10) - 1;
    const categorySlug = options[idx];
    const category = categorySlug ? await getCategory(categorySlug) : null;
    if (!category) {
      await sendText(phone, `Opção inválida. Digite um número de 1 a ${options.length} ou "cancelar".`);
      return;
    }
    if (category.items.length === 0) {
      await sendText(phone, `${category.title} não possui itens no momento. Digite outro número ou "cancelar".`);
      return;
    }
    const lines = category.items.map((item, i) => {
      const price = `R$ ${parseFloat(item.price).toFixed(2)}`;
      const dur = item.duration ? ` • ${item.duration} min` : '';
      return `${i + 1}. ${item.title} — ${price}${dur}`;
    }).join('\n');
    await setState(phone, { flow: 'catalog', step: 2, data: { categoryId: categorySlug, options: category.items.map((i) => i.slug) } });
    await sendText(phone, `*${category.title}*\n\n${lines}\n\nDigite o número ou "cancelar".`);
    return;
  }

  if (state.step === 2) {
    const { categoryId, options } = state.data;
    const idx = parseInt(text, 10) - 1;
    const itemSlug = options?.[idx];
    const item = itemSlug ? await getItem(categoryId, itemSlug) : null;
    if (!item) {
      await sendText(phone, `Opção inválida. Digite um número de 1 a ${options?.length || 0} ou "cancelar".`);
      return;
    }
    const price = parseFloat(item.price);
    await setState(phone, { flow: 'catalog', step: 3, data: { categoryId, itemId: itemSlug, item: { ...item, price } } });
    const actions = item.duration
      ? '"agendar" para marcar um horário\n• "pagar" para gerar Pix'
      : '"pagar" para gerar Pix';
    await sendText(
      phone,
      `*${item.title}*\n${item.description}\nPreço: R$ ${price.toFixed(2)}${item.duration ? `\nDuração: ${item.duration} min` : ''}\n\nDigite:\n• ${actions}\n• "cancelar" para voltar`
    );
    return;
  }

  if (state.step === 3) {
    const { item } = state.data;
    if (text?.toLowerCase() === 'agendar' && item.duration) {
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
      const hint = item.duration ? '"agendar", "pagar"' : '"pagar"';
      await sendText(phone, `Resposta inválida. Digite ${hint} ou "cancelar".`);
    }
  }
}

module.exports = {
  getCategories,
  getCategory,
  getItem,
  handleCatalogFlow,
};
