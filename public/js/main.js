import { bootstrapApp } from './app-controller.js';

bootstrapApp().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Init failed:', e);
  alert(`初始化失败: ${e.message}`);
});
