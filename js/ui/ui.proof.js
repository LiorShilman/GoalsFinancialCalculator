// ui.proof.js
export const UIProof = {
  init() {
    const toggle = document.getElementById('proofToggle');
    const panel = document.getElementById('proofPanel');
    if (!toggle || !panel) return;
    const sync = () => panel.classList.toggle('hidden', !toggle.checked);
    toggle.addEventListener('change', sync);
    sync();
  }
};
