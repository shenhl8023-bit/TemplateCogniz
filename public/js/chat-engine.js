import { apiChat } from './services.js';

export class ChatEngine {
  constructor() {
    this.modeActive = false;
  }

  activateMode() {
    this.modeActive = true;
    return this.modeActive;
  }

  resetMode() {
    this.modeActive = false;
    return this.modeActive;
  }

  async processUserInput(draft, text) {
    if (!text || !text.trim()) {
      return { ok: false, message: '请输入内容' };
    }
    try {
      const data = await apiChat(draft, text.trim());
      return {
        ok: true,
        draft: data.draft,
        xml: data.xml,
        reply: data.reply || '已处理',
        llmUsed: !!data.llmUsed,
        llmUnderstanding: data.llmUnderstanding || '',
        structureSummary: data.structureSummary || ''
      };
    } catch (e) {
      return { ok: false, message: `请求失败: ${e.message}` };
    }
  }

  async refreshXml(draft) {
    try {
      const data = await apiChat(draft, '');
      return { ok: true, draft: data.draft, xml: data.xml };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
}
