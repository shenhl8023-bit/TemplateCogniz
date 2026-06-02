export function createModeController({
  els,
  state,
  chatEngine,
  renderAll,
  refreshXmlOnly,
  addMsg,
  clearMessages,
  setInputEnabled
}) {
  function enterWorkMode() {
    state.modeActive = chatEngine.activateMode();
    state.partFieldsConfirmed = false;
    if (els.entryCard) els.entryCard.classList.add('hidden');
    if (els.manualPanel) els.manualPanel.classList.remove('hidden');
    if (els.emptyPreview) els.emptyPreview.classList.add('hidden');
    if (els.previewContent) els.previewContent.classList.remove('hidden');
    setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
    if (els.xmlCard) els.xmlCard.classList.add('hidden');
    if (els.previewTemplateBtn) els.previewTemplateBtn.textContent = '📄 预览模板';
  }

  function showDescribeSamplePanel() {
    if (els.describeSamplePanel) els.describeSamplePanel.classList.remove('hidden');
    if (els.manualSelectPanel) els.manualSelectPanel.classList.add('hidden');
  }

  function showManualSelectPanel() {
    if (els.describeSamplePanel) els.describeSamplePanel.classList.add('hidden');
    if (els.manualSelectPanel) els.manualSelectPanel.classList.remove('hidden');
  }

  function enterManualMode() {
    enterWorkMode();
    state.modeType = 'manual';
    showManualSelectPanel();
    setInputEnabled(true, '描述分组结构，如“在A侧添加外圆和端面，B侧也一样”');
    addMsg('bot', '进入自定义模板模式：请先勾选零件级参数，然后描述分组结构。');
  }

  function resetToInitialState() {
    if (!window.confirm('确定重置当前草稿吗？此操作会清空当前分组结构。')) return;
    state.modeActive = chatEngine.resetMode();
    state.modeType = null;
    state.partFieldsConfirmed = false;
    state.selectedNodeId = null;
    state.draggingNodeId = null;
    state.draft.groups = [];
    if (els.manualPanel) els.manualPanel.classList.add('hidden');
    if (els.entryCard) els.entryCard.classList.remove('hidden');
    if (els.emptyPreview) els.emptyPreview.classList.remove('hidden');
    if (els.previewContent) els.previewContent.classList.add('hidden');
    if (els.chatInput) els.chatInput.value = '';
    if (els.describeSamplePanel) els.describeSamplePanel.classList.add('hidden');
    if (els.manualSelectPanel) els.manualSelectPanel.classList.add('hidden');
    setInputEnabled(true, '可直接输入分组描述，如“创建A侧和B侧分组”');
    clearMessages();
    renderAll();
    refreshXmlOnly();
  }

  function bindEvents() {
    els.resetBtn.addEventListener('click', resetToInitialState);

    els.modeManualBtn.addEventListener('click', enterManualMode);
    els.modeDescribeBtn.addEventListener('click', () => {
      enterWorkMode();
      state.modeType = 'describe';
      showDescribeSamplePanel();
      setInputEnabled(true, '例如：这是一个轴类零件，有A侧和B侧，需要按端面和外圆分组');
      addMsg('bot', '请先用一句话描述零件类型和加工侧信息，或直接点击下方场景卡片自动套用参数。');
    });
  }

  return {
    enterWorkMode,
    enterManualMode,
    resetToInitialState,
    bindEvents
  };
}
