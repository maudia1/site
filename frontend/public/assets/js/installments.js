(function(global){
  const rules = [
    { minTotal: 400, count: 5 },
    { minTotal: 300, count: 4 },
    { minTotal: 200, count: 3 }
  ];

  function toNumber(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function pickRule(amount){
    const price = toNumber(amount);
    if(!Number.isFinite(price)) return null;
    return rules.find(rule => price >= rule.minTotal) || null;
  }

  function compute(amount){
    const rule = pickRule(amount);
    if(!rule) return null;
    const price = toNumber(amount);
    const value = price / rule.count;
    return {
      count: rule.count,
      value,
      minTotal: rule.minTotal
    };
  }

  function list(amount){
    const price = toNumber(amount);
    if(!Number.isFinite(price)) return [];
    return rules
      .filter(rule => price >= rule.minTotal)
      .map(rule => ({
        count: rule.count,
        value: price / rule.count,
        minTotal: rule.minTotal
      }));
  }

  function formatCurrency(value){
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function describe(option, formatter){
    if(!option) return '';
    const format = typeof formatter === 'function' ? formatter : formatCurrency;
    return `em até ${option.count}x de ${format(option.value)} sem juros`;
  }

  global.iwInstallments = {
    compute,
    list,
    describe,
    rules: rules.slice(),
    formatCurrency
  };
})(typeof window !== 'undefined' ? window : globalThis);
