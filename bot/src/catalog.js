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
    const actions = item.duration
      ? '• "agendar" para marcar um horário\n• "pagar" para gerar Pix'
      : '• "pagar" para gerar Pix';
    await sendText(
      phone,
      `*${item.title}*\n${item.description}\nPreço: R$ ${price.toFixed(2)}${item.duration ? `\nDuração: ${item.duration} min` : ''}\n\nDigite:\n${actions}\n• "cancelar" para voltar`
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
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
};
