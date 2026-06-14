let toastTimer    = null;
let _pendingConfirm = null; // Tracks unresolved confirmAction promise

export function showToast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

export function openModal(templateId, populate = null) {
  const tmpl = document.getElementById(templateId);
  const content = document.getElementById('modal-content');
  content.replaceChildren(tmpl.content.cloneNode(true));
  document.getElementById('modal-backdrop').classList.remove('hidden');
  populate?.();
}

export function closeModal() {
  // Resolve any pending confirmAction with false when modal is closed externally
  if (_pendingConfirm) { _pendingConfirm(false); _pendingConfirm = null; }
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-content').replaceChildren();
}

export function confirmAction(msg) {
  return new Promise(resolve => {
    _pendingConfirm = resolve;
    openModal('tmpl-modal-confirm', () => {
      document.getElementById('confirm-msg').textContent = msg;
      document.getElementById('confirm-ok').onclick = () => {
        _pendingConfirm = null;
        closeModal();
        resolve(true);
      };
      document.getElementById('confirm-cancel').onclick = () => {
        _pendingConfirm = null;
        closeModal();
        resolve(false);
      };
    });
  });
}
