// Caixa de feedback (seção 10 da especificação), porte do prototipo/app.js.
// Envia para api/feedback (caminho relativo, atrás da mesma senha do BI). O botão só aparece se
// GET api/feedback/saude responder; no BI local (run.sh) essa rota não existe e o botão fica escondido.
const $ = id => document.getElementById(id);
const MAX_IMG = 5 * 1024 * 1024, MAX_AUD = 10 * 1024 * 1024; // mesmos limites do receptor

const b64 = blob => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',', 2)[1] || ''); r.onerror = () => erro(r.error); r.readAsDataURL(blob) });
const toBlob = (cv, tipo, q) => new Promise(ok => cv.toBlob(ok, tipo, q));

export async function initFeedback(visao) {
  try {
    const r = await fetch('api/feedback/saude', { cache: 'no-store' });
    if (!r.ok || !(await r.json()).ok) return;
  } catch { return }
  const ov = $('fb-ov'), cv = $('fb-cv'), cx = cv.getContext('2d');
  let img = null, marks = [], drag = null, audio = null, rec = null, chunks = [], timer = null, enviando = false;
  const valid = () => { $('fb-send').disabled = enviando || !($('fb-nome').value.trim() && ($('fb-txt').value.trim() || audio)) };
  const open = () => { ov.hidden = false; $('fb-msg').textContent = ''; $('fb-nome').focus(); valid() };
  const close = () => { ov.hidden = true; if (rec && rec.state === 'recording') rec.stop() };
  $('fb-open').hidden = false;
  $('fb-open').onclick = open; $('fb-x').onclick = close; ov.addEventListener('click', e => { if (e.target === ov) close() });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) close() });
  ['fb-nome', 'fb-txt'].forEach(i => $(i).addEventListener('input', valid));
  // imagem + anotação (retângulos vermelhos desenhados no próprio canvas)
  const draw = () => { if (!img) return; cx.drawImage(img, 0, 0, cv.width, cv.height); cx.lineWidth = Math.max(3, cv.width / 300); cx.strokeStyle = '#e0301e'; for (const m of marks.concat(drag ? [drag] : [])) cx.strokeRect(m.x, m.y, m.w, m.h) };
  const setImg = src => { const im = new Image(); im.onload = () => { img = im; const s = Math.min(1, 1600 / im.width); cv.width = im.width * s; cv.height = im.height * s; marks = []; cv.hidden = false; $('fb-undo').hidden = false; $('fb-rmimg').hidden = false; draw() }; im.src = src };
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height } };
  cv.addEventListener('pointerdown', e => { const p = pt(e); drag = { x: p.x, y: p.y, w: 0, h: 0, x0: p.x, y0: p.y }; cv.setPointerCapture(e.pointerId) });
  cv.addEventListener('pointermove', e => { if (!drag) return; const p = pt(e); drag.x = Math.min(p.x, drag.x0); drag.y = Math.min(p.y, drag.y0); drag.w = Math.abs(p.x - drag.x0); drag.h = Math.abs(p.y - drag.y0); draw() });
  cv.addEventListener('pointerup', () => { if (drag && drag.w > 4 && drag.h > 4) marks.push(drag); drag = null; draw() });
  $('fb-undo').onclick = () => { marks.pop(); draw() };
  $('fb-rmimg').onclick = () => { img = null; marks = []; cv.hidden = true; $('fb-undo').hidden = true; $('fb-rmimg').hidden = true };
  $('fb-img').onclick = () => $('fb-imgf').click();
  $('fb-imgf').onchange = e => { const f = e.target.files[0]; if (f) setImg(URL.createObjectURL(f)); e.target.value = '' };
  document.addEventListener('paste', e => { if (ov.hidden) return; const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if (it) setImg(URL.createObjectURL(it.getAsFile())) });
  $('fb-cap').onclick = async () => {
    try {
      ov.hidden = true; const st = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true, audio: false });
      const v = document.createElement('video'); v.srcObject = st; await v.play(); await new Promise(r => setTimeout(r, 300));
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); st.getTracks().forEach(t => t.stop()); ov.hidden = false; setImg(c.toDataURL('image/png'))
    } catch { ov.hidden = false; $('fb-caph').textContent = 'Este navegador ou visualizador não deixou capturar a tela. Use "Abrir imagem" ou cole um print (Ctrl+V).' }
  };
  // áudio (até 2 min)
  const setAudio = (blob, label) => { audio = blob; $('fb-play').src = URL.createObjectURL(blob); $('fb-play').hidden = false; $('fb-audh').textContent = label; valid() };
  $('fb-aud').onclick = () => $('fb-audf').click();
  $('fb-audf').onchange = e => { const f = e.target.files[0]; if (f) setAudio(f, 'Arquivo: ' + f.name); e.target.value = '' };
  $('fb-rec').onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return }
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true }); chunks = []; rec = new MediaRecorder(st);
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => { st.getTracks().forEach(t => t.stop()); clearInterval(timer); $('fb-rec').textContent = 'Gravar de novo'; setAudio(new Blob(chunks, { type: rec.mimeType }), 'Áudio gravado.') };
      rec.start(); let s = 0; $('fb-rec').textContent = 'Parar'; timer = setInterval(() => { s++; $('fb-audh').innerHTML = `<span class="rec">● gravando</span> ${s}s de 120s`; if (s >= 120) rec.stop() }, 1000)
    } catch { $('fb-audh').textContent = 'Este navegador ou visualizador não deixou usar o microfone. Use "Enviar arquivo".' }
  };
  // envio: JSON da seção 10.2, com contexto automático (aba, UF, visão)
  $('fb-send').onclick = async () => {
    enviando = true; valid(); $('fb-msg').textContent = 'Enviando…';
    try {
      const aba = document.querySelector('[role=tab][aria-selected=true]')?.textContent || '';
      let v = null; try { v = visao() } catch { }
      const p = {
        categoria: $('fb-cat').value, nome: $('fb-nome').value.trim(), texto: $('fb-txt').value.trim(),
        contexto: { aba, uf: $('uf').value || null, visao: v, quando: new Date().toISOString(), navegador: navigator.userAgent, tela: `${innerWidth}x${innerHeight}` }
      };
      if (img) {
        let bl = await toBlob(cv, 'image/png');
        if (bl.size > MAX_IMG) bl = await toBlob(cv, 'image/jpeg', 0.85); // print grande: JPEG
        if (bl.size > MAX_IMG) throw new Error('a imagem passa de 5 MB; recorte ou reduza');
        p.imagem_b64 = await b64(bl); p.imagem_tipo = bl.type;
      }
      if (audio) {
        if (audio.size > MAX_AUD) throw new Error('o áudio passa de 10 MB');
        p.audio_b64 = await b64(audio); p.audio_tipo = (audio.type || 'audio/webm').split(';')[0];
      }
      const r = await fetch('api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || `o servidor respondeu ${r.status}`);
      $('fb-msg').innerHTML = '<b>Recebido, obrigado!</b> A equipe do projeto vai ler o seu relato.';
      $('fb-txt').value = ''; $('fb-rmimg').click(); audio = null; $('fb-play').hidden = true; $('fb-audh').textContent = 'Nenhum áudio anexado.'; $('fb-rec').textContent = 'Gravar áudio';
    } catch (e) {
      $('fb-msg').textContent = 'Não foi possível enviar: ' + e.message + '. Tente de novo em instantes.';
    } finally { enviando = false; valid() }
  };
}
