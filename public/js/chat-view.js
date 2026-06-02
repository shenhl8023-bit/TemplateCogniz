export function createChatView({ chatLogEl, chatInputEl, sendBtnEl }) {
  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    chatLogEl.appendChild(div);
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
  }

  function addPendingMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg system pending';
    div.textContent = text;
    chatLogEl.appendChild(div);
    chatLogEl.scrollTop = chatLogEl.scrollHeight;
    return {
      update(next) {
        div.textContent = next;
        chatLogEl.scrollTop = chatLogEl.scrollHeight;
      },
      remove() {
        if (div.parentNode) div.parentNode.removeChild(div);
      }
    };
  }

  function clearMessages() {
    chatLogEl.innerHTML = '';
  }

  function setInputEnabled(enabled, placeholder) {
    chatInputEl.disabled = !enabled;
    sendBtnEl.disabled = !enabled;
    if (placeholder !== undefined) chatInputEl.placeholder = placeholder;
  }

  function getInputText() {
    return chatInputEl.value.trim();
  }

  function clearInput() {
    chatInputEl.value = '';
  }

  function focusInput() {
    chatInputEl.focus();
  }

  function bindSend(handler) {
    sendBtnEl.addEventListener('click', handler);
  }

  return {
    addMessage,
    addPendingMessage,
    clearMessages,
    setInputEnabled,
    getInputText,
    clearInput,
    focusInput,
    bindSend
  };
}
