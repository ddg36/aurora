export function crearAutosave({
  delay = 1500,
  clearMessageDelay = 1200,
  save,
  canSave = () => true,
  onDirty,
  onSaved,
  onMessage,
  onError,
} = {}) {
  let saveTimer = null;
  let messageTimer = null;

  function clearSaveTimer() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  function clearMessageTimer() {
    if (messageTimer) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
  }

  function flashMessage(message) {
    onMessage?.(message);
    clearMessageTimer();
    messageTimer = setTimeout(() => {
      messageTimer = null;
      onMessage?.('');
    }, clearMessageDelay);
  }

  function schedule(value, context = {}) {
    onDirty?.(true);
    clearSaveTimer();

    saveTimer = setTimeout(async () => {
      saveTimer = null;

      if (!canSave(context)) return;

      try {
        await save?.(value, context);
        onDirty?.(false);
        onSaved?.(value, context);
        flashMessage('guardado');
      } catch (err) {
        onError?.(err, value, context);
        flashMessage('error guardando');
      }
    }, delay);
  }

  function cancel() {
    clearSaveTimer();
    clearMessageTimer();
  }

  return { schedule, cancel };
}
