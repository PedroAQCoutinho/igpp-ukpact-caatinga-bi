// Tema claro/escuro. Sem escolha salva, segue o sistema. A escolha fica só neste navegador.
(() => {
  const K = 'bi-caatinga-tema', root = document.documentElement;
  const ler = () => { try { return localStorage.getItem(K) } catch { return null } };
  const sistema = () => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const marcar = () => {
    const t = root.dataset.theme || sistema();
    document.querySelectorAll('[data-tema]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === t)));
  };
  const salvo = ler(); if (salvo === 'light' || salvo === 'dark') root.dataset.theme = salvo;
  document.addEventListener('DOMContentLoaded', marcar);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcar);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tema]'); if (!b) return;
    root.dataset.theme = b.dataset.tema;
    try { localStorage.setItem(K, b.dataset.tema) } catch {}
    marcar();
  });
})();
