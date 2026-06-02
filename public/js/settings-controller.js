export function createSettingsController({ els, aiService, state }) {
  function refreshProviderUI() {
    const p = els.providerInput.value;
    if (p === 'gemini') {
      els.baseUrlInput.disabled = true;
      els.baseUrlInput.placeholder = 'Gemini 无需填写';
      if (!els.modelInput.value) els.modelInput.value = 'gemini-2.0-flash';
    } else {
      els.baseUrlInput.disabled = false;
      if (!els.baseUrlInput.value) els.baseUrlInput.value = 'https://integrate.api.nvidia.com/v1';
      if (!els.modelInput.value || els.modelInput.value.startsWith('gemini')) {
        els.modelInput.value = 'meta/llama-3.1-8b-instruct';
      }
    }
  }

  function fillForm(settings) {
    const s = settings || {};
    els.llmEnabledInput.checked = !!s.llmEnabled;
    els.providerInput.value = s.provider || 'openai_compatible';
    els.baseUrlInput.value = s.baseUrl || 'https://integrate.api.nvidia.com/v1';
    els.apiKeyInput.value = s.apiKey || '';
    els.modelInput.value = s.model || (els.providerInput.value === 'gemini' ? 'gemini-2.0-flash' : 'meta/llama-3.1-8b-instruct');
    els.temperatureInput.value = Number(s.temperature ?? 0.2);
    els.llmTimeoutSecInput.value = Number(s.llmTimeoutSec ?? 0);
    refreshProviderUI();
  }

  function readForm() {
    return {
      llmEnabled: !!els.llmEnabledInput.checked,
      provider: els.providerInput.value || 'openai_compatible',
      baseUrl: els.baseUrlInput.value.trim(),
      apiKey: els.apiKeyInput.value.trim(),
      model: els.modelInput.value.trim() || (els.providerInput.value === 'gemini' ? 'gemini-2.0-flash' : 'meta/llama-3.1-8b-instruct'),
      temperature: Number(els.temperatureInput.value || 0.2),
      llmTimeoutSec: Math.max(0, Number(els.llmTimeoutSecInput.value || 0))
    };
  }

  async function load() {
    state.settings = await aiService.load();
    fillForm(state.settings);
  }

  function open() {
    fillForm(state.settings);
    els.settingsHint.textContent = '';
    els.settingsModal.classList.remove('hidden');
  }

  function close() {
    els.settingsModal.classList.add('hidden');
  }

  async function save() {
    try {
      const settings = readForm();
      const result = await aiService.save(settings);
      if (!result.ok) {
        els.settingsHint.textContent = result.message || '保存失败';
        return;
      }
      state.settings = result.settings;
      els.settingsHint.textContent = result.message || '保存成功';
    } catch (e) {
      els.settingsHint.textContent = `保存异常: ${e.message}`;
    }
  }

  async function test() {
    try {
      const settings = readForm();
      els.settingsHint.textContent = '正在测试连接...';
      const result = await aiService.test(settings);
      els.settingsHint.textContent = result.message || (result.ok ? '连接成功' : '连接失败');
    } catch (e) {
      els.settingsHint.textContent = `测试异常: ${e.message}`;
    }
  }

  function bindEvents() {
    els.settingsBtn.addEventListener('click', open);
    els.closeSettingsBtn.addEventListener('click', close);
    els.saveSettingsBtn.addEventListener('click', save);
    els.testSettingsBtn.addEventListener('click', test);
    els.providerInput.addEventListener('change', refreshProviderUI);
  }

  return { load, open, close, save, test, bindEvents, fillForm, readForm };
}
