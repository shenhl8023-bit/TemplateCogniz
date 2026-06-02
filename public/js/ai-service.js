import { apiGetSettings, apiSaveSettings, apiTestSettings } from './services.js';

export class AIService {
  constructor() {
    this.settings = {
      llmEnabled: false,
      provider: 'openai_compatible',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      apiKey: '',
      model: 'meta/llama-3.1-8b-instruct',
      temperature: 0.2,
      llmTimeoutSec: 0
    };
  }

  async load() {
    try {
      const data = await apiGetSettings();
      this.settings = { ...this.settings, ...(data.settings || {}) };
    } catch (_) {
      // keep defaults
    }
    return this.settings;
  }

  getSettings() {
    return { ...this.settings };
  }

  async save(next) {
    const { ok, data } = await apiSaveSettings(next);
    if (ok) {
      this.settings = { ...this.settings, ...(data.settings || {}) };
      return { ok: true, message: '保存成功', settings: this.getSettings() };
    }
    return { ok: false, message: data.message || '保存失败', settings: this.getSettings() };
  }

  async test(next) {
    const { data } = await apiTestSettings(next);
    return { ok: !!data.ok, message: data.message || (data.ok ? '连接成功' : '连接失败') };
  }
}
