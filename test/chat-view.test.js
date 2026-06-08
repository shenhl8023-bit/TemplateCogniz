const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

function loadChatViewModule() {
  const source = fs.readFileSync(path.join(rootDir, 'public', 'js', 'chat-view.js'), 'utf8');
  const runnableSource = source.replace('export function createChatView', 'function createChatView');
  const module = { exports: {} };

  new Function('module', `${runnableSource}\nmodule.exports = { createChatView };`)(module);
  return module.exports;
}

function createElementStub() {
  const listeners = new Map();

  return {
    disabled: false,
    value: '',
    placeholder: '',
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    dispatch(type, init = {}) {
      const event = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...init
      };

      for (const handler of listeners.get(type) || []) {
        handler(event);
      }

      return event;
    }
  };
}

function createView() {
  const { createChatView } = loadChatViewModule();
  const chatLogEl = createElementStub();
  const chatInputEl = createElementStub();
  const sendBtnEl = createElementStub();

  return {
    chatInputEl,
    sendBtnEl,
    view: createChatView({ chatLogEl, chatInputEl, sendBtnEl })
  };
}

test('chat input sends on Enter while Shift+Enter remains available for new lines', () => {
  const { chatInputEl, view } = createView();
  let sendCount = 0;
  view.bindSend(() => {
    sendCount += 1;
  });

  const enterEvent = chatInputEl.dispatch('keydown', { key: 'Enter' });
  assert.equal(sendCount, 1);
  assert.equal(enterEvent.defaultPrevented, true);

  const shiftEnterEvent = chatInputEl.dispatch('keydown', { key: 'Enter', shiftKey: true });
  assert.equal(sendCount, 1);
  assert.equal(shiftEnterEvent.defaultPrevented, false);
});

test('disabled chat input does not send on Enter', () => {
  const { chatInputEl, view } = createView();
  let sendCount = 0;
  view.bindSend(() => {
    sendCount += 1;
  });

  chatInputEl.disabled = true;
  const event = chatInputEl.dispatch('keydown', { key: 'Enter' });

  assert.equal(sendCount, 0);
  assert.equal(event.defaultPrevented, false);
});
