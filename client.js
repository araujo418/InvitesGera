// ══════════════════════════════════════════
//  SUPABASE
// ══════════════════════════════════════════
const SUPABASE_URL = 'https://rnvunprjvppbjavkaoek.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJudnVucHJqdnBwYmphdmthb2VrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NjYzOTksImV4cCI6MjA2NzI0MjM5OX0.5E37Qm-KMmyGtGKbOINbDqMQlZlfgcQx91RQ01qslT8';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let currentToken = null;
let clientData = null;
let dupCheckTimer = null;

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Auto-fill token from URL
  const t = new URLSearchParams(location.search).get('token');
  if (t) document.getElementById('tokenInput').value = t.toUpperCase();

  document.getElementById('tokenInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') validateToken();
  });

  document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target.id === 'confirmModal') closeModal();
  });
});

// ══════════════════════════════════════════
//  TOKEN VALIDATION
// ══════════════════════════════════════════
async function validateToken() {
  const raw = document.getElementById('tokenInput').value.trim().toUpperCase();
  const errEl = document.getElementById('tokenError');
  const btn = document.getElementById('accessBtn');
  errEl.style.display = 'none';

  if (raw.length !== 8) { showTokenError('Token deve ter 8 caracteres.'); return; }

  btn.disabled = true;
  btn.textContent = '⏳ Verificando...';

  try {
    const { data, error } = await sb
      .from('clientes')
      .select('*')
      .eq('token', raw)
      .single();

    if (error || !data) { showTokenError('Token inválido. Verifique o código.'); return; }

    // Check expiry (validade is unix timestamp)
    if (data.validade && data.validade < Math.floor(Date.now() / 1000)) {
      showTokenError('Token expirado. Fale com o organizador.'); return;
    }

    if (!data.pdf_path) {
      showTokenError('Convite ainda não configurado. Fale com o organizador.'); return;
    }

    currentToken = raw;
    clientData = data;

    document.getElementById('tokenSection').style.display = 'none';
    document.getElementById('mainSection').style.display = 'block';
    document.getElementById('eventNameBanner').textContent = '🎊 ' + data.nome;

    await updateQuota();
    await renderHistory();

  } catch (e) {
    showTokenError('Erro de ligação. Tente novamente.');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Acessar →';
  }
}

function showTokenError(msg) {
  const el = document.getElementById('tokenError');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('accessBtn').disabled = false;
  document.getElementById('accessBtn').textContent = 'Acessar →';
}

// ══════════════════════════════════════════
//  QUOTA
// ══════════════════════════════════════════
async function updateQuota() {
  try {
    const { count } = await sb
      .from('convidados')
      .select('*', { count: 'exact', head: true })
      .eq('token_cliente', currentToken)
      .eq('convite_gerado', true);

    const used = count || 0;
    const limit = clientData.limite_scans || 0;
    const remaining = limit - used;
    const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;

    document.getElementById('quotaText').textContent = remaining + ' restantes';
    document.getElementById('quotaFill').style.width = pct + '%';
    document.getElementById('quotaFill').style.background =
      pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--brand)';

    if (used >= limit && limit > 0) {
      const btn = document.getElementById('generateBtn');
      btn.disabled = true;
      btn.textContent = '🚫 Limite atingido';
    }
  } catch (e) {
    console.error('Quota error:', e);
  }
}

// ══════════════════════════════════════════
//  NAME INPUT
// ══════════════════════════════════════════
function onNameInput() {
  const input = document.getElementById('guestNameInput');
  const hint = document.getElementById('nameHint');
  const dupWarn = document.getElementById('dupWarn');
  const btn = document.getElementById('generateBtn');
  const counter = document.getElementById('charCounter');
  const name = input.value;

  counter.textContent = name.length + ' / 80';
  counter.className = 'char-counter' + (name.length > 70 ? ' warn' : '');

  input.classList.remove('err', 'ok');
  hint.className = 'hint'; hint.textContent = '';
  dupWarn.style.display = 'none';
  btn.disabled = true;

  if (!name.trim()) return;

  const { ok, msg } = validateName(name);
  if (!ok) {
    input.classList.add('err');
    hint.textContent = msg;
    hint.className = 'hint show err';
    return;
  }

  input.classList.add('ok');
  hint.textContent = '✓ Nome válido';
  hint.className = 'hint show ok';
  btn.disabled = false;

  // Debounce duplicate check
  clearTimeout(dupCheckTimer);
  dupCheckTimer = setTimeout(async () => {
    try {
      const { data } = await sb
        .from('convidados')
        .select('id')
        .eq('token_cliente', currentToken)
        .eq('convite_gerado', true)
        .ilike('nome', name.trim())
        .limit(1);
      if (data && data.length > 0) {
        dupWarn.style.display = 'block';
      }
    } catch (e) { console.warn(e); }
  }, 500);
}

function validateName(name) {
  const t = (name || '').trim();
  if (!t) return { ok: false, msg: null };
  if (!/^[a-zA-ZÀ-ÿ\u00C0-\u024F\s\-']+$/.test(t)) return { ok: false, msg: 'Use apenas letras e espaços.' };
  if (t.replace(/[\s\-']/g, '').length < 3) return { ok: false, msg: 'Mínimo de 3 letras.' };
  return { ok: true, msg: null };
}

// ══════════════════════════════════════════
//  CONFIRM MODAL
// ══════════════════════════════════════════
function requestConfirm() {
  const name = document.getElementById('guestNameInput').value.trim();
  const { ok } = validateName(name);
  if (!ok) { showToast('Verifique o nome.', true); return; }
  document.getElementById('modalGuestName').textContent = name;
  document.getElementById('confirmModal').classList.add('show');
}

function closeModal() {
  document.getElementById('confirmModal').classList.remove('show');
}

async function confirmAndGenerate() {
  closeModal();
  await generateInvite();
}

// ══════════════════════════════════════════
//  GENERATE INVITE
// ══════════════════════════════════════════
async function generateInvite() {
  const name = document.getElementById('guestNameInput').value.trim();
  const { ok, msg } = validateName(name);
  if (!ok) { showToast(msg || 'Nome inválido.', true); return; }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;

  try {
    setProgress(true, 'Gerando código único...', 15);
    const code = await generateUniqueCode();

    setProgress(true, 'Gerando QR Code...', 35);
    const qrDataUrl = await generateQRDataURL(code + ' ' + name);

    setProgress(true, 'Carregando PDF...', 55);
    const pdfBytes = await buildPDF(name, code, qrDataUrl, clientData);

    setProgress(true, 'Guardando...', 80);
    const { error } = await sb.from('convidados').insert([{
      codigo: code,
      nome: name,
      token_cliente: currentToken,
      status: 'ativo',
      convite_gerado: true,
      convite_gerado_at: new Date().toISOString()
    }]);
    if (error) throw error;

    setProgress(true, 'Concluído!', 100);
    triggerDownload(pdfBytes, 'Convite_' + name.replace(/\s+/g, '_') + '.pdf');

    setProgress(false);
    showToast('Convite gerado para ' + name + '! 🎉');

    // Reset form
    document.getElementById('guestNameInput').value = '';
    document.getElementById('guestNameInput').classList.remove('ok', 'err');
    document.getElementById('nameHint').className = 'hint';
    document.getElementById('charCounter').textContent = '0 / 80';
    document.getElementById('dupWarn').style.display = 'none';
    btn.disabled = true;

    await updateQuota();
    await renderHistory();

  } catch (e) {
    setProgress(false);
    console.error(e);
    showToast('Erro: ' + e.message, true);
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════
//  UNIQUE CODE
// ══════════════════════════════════════════
async function generateUniqueCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code, exists;
  let attempts = 0;
  do {
    code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const { data } = await sb.from('convidados').select('codigo').eq('codigo', code).maybeSingle();
    exists = !!data;
    attempts++;
    if (attempts > 20) break;
  } while (exists);
  return code;
}

// ══════════════════════════════════════════
//  QR CODE GENERATION
// ══════════════════════════════════════════
async function generateQRDataURL(text) {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:300px;height:300px;';
    document.body.appendChild(container);

    try {
      const qr = new QRCode(container, {
        text: text,
        width: 300,
        height: 300,
        correctLevel: QRCode.CorrectLevel.H
      });

      setTimeout(() => {
        try {
          const canvas = container.querySelector('canvas');
          if (canvas) {
            resolve(canvas.toDataURL('image/png'));
          } else {
            const img = container.querySelector('img');
            if (img && img.src) resolve(img.src);
            else reject(new Error('QR canvas não encontrado'));
          }
        } catch (e) {
          reject(e);
        } finally {
          document.body.removeChild(container);
        }
      }, 300);
    } catch (e) {
      document.body.removeChild(container);
      reject(e);
    }
  });
}

// ══════════════════════════════════════════
//  BUILD PDF
// ══════════════════════════════════════════
async function buildPDF(guestName, guestCode, qrDataUrl, client) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  // Fetch PDF from Supabase Storage
  const pdfUrl = SUPABASE_URL + '/storage/v1/object/public/convites-pdf/' + client.pdf_path;
  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error('Erro ao carregar PDF base (' + pdfRes.status + ')');
  const pdfBuffer = await pdfRes.arrayBuffer();

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const page = pdfDoc.getPage(0);
  const { width: pW, height: pH } = page.getSize();

  const config = client.convite_config;
  if (!config || !config.elements) throw new Error('Configuração do convite não encontrada.');

  const canvasW = config.canvasW || 794;
  const canvasH = config.canvasH || Math.round(canvasW * pH / pW);
  const scaleX = pW / canvasW;
  const scaleY = pH / canvasH;
  const vOffset = config.vOffset || 0;

  for (const el of config.elements) {
    if (el.type === 'text') {
      // Choose font
      let font;
      const fw = el.fontWeight || 'normal';
      const fi = el.fontStyle || 'normal';
      if (fw === 'bold' && fi === 'italic') font = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);
      else if (fw === 'bold') font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      else if (fi === 'italic') font = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      else font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      const fontSize = parseFloat(el.fontSize || '24') * scaleX;
      const color = hexToRgb(el.color || '#000000');
      const text = guestName;
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const topPx = parseFloat(el.top) || 0;

      let x;
      if ((el.transform || '').includes('translateX(-50%)')) {
        x = pW / 2 - textWidth / 2;
      } else {
        x = parseFloat(el.left) * scaleX;
      }
      const y = pH - (topPx + vOffset) * scaleY - fontSize * 0.85;

      if (y > 0 && y < pH) {
        page.drawText(text, { x, y, size: fontSize, font, color: rgb(color.r, color.g, color.b) });
      }
    }

    if (el.type === 'qr' && client.qr_enabled) {
      try {
        const qrImg = await pdfDoc.embedPng(qrDataUrl);
        const qrW = parseFloat(el.width || '100') * scaleX;
        const qrH = parseFloat(el.height || '100') * scaleY;
        const topPx = parseFloat(el.top) || 0;

        let x;
        if ((el.transform || '').includes('translateX(-50%)')) {
          x = pW / 2 - qrW / 2;
        } else {
          x = parseFloat(el.left) * scaleX;
        }
        const y = pH - topPx * scaleY - qrH;

        page.drawImage(qrImg, { x, y, width: qrW, height: qrH });
      } catch (e) {
        console.warn('Erro ao embed QR:', e);
      }
    }
  }

  return await pdfDoc.save();
}

// ══════════════════════════════════════════
//  RE-DOWNLOAD FROM HISTORY
// ══════════════════════════════════════════
async function reDownload(recordId) {
  showToast('A preparar download...');
  try {
    const { data: rec, error } = await sb
      .from('convidados')
      .select('*')
      .eq('id', recordId)
      .single();
    if (error || !rec) throw new Error('Registo não encontrado.');

    const qrDataUrl = await generateQRDataURL(rec.codigo + ' ' + rec.nome);
    const pdfBytes = await buildPDF(rec.nome, rec.codigo, qrDataUrl, clientData);
    triggerDownload(pdfBytes, 'Convite_' + rec.nome.replace(/\s+/g, '_') + '.pdf');
    showToast('Download iniciado! ⬇️');
  } catch (e) {
    console.error(e);
    showToast('Erro: ' + e.message, true);
  }
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
async function renderHistory() {
  const cont = document.getElementById('historyList');
  cont.innerHTML = '<div class="loading-hist">A carregar...</div>';

  try {
    const { data, error } = await sb
      .from('convidados')
      .select('*')
      .eq('token_cliente', currentToken)
      .eq('convite_gerado', true)
      .order('convite_gerado_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      cont.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>Nenhum convite gerado ainda.</p>
        </div>`;
      return;
    }

    cont.innerHTML = '';
    data.forEach(rec => {
      const date = rec.convite_gerado_at
        ? new Date(rec.convite_gerado_at).toLocaleString('pt-BR')
        : '–';
      const div = document.createElement('div');
      div.className = 'invite-item';
      div.innerHTML = `
        <div style="flex:1;min-width:0">
          <div class="invite-name">${esc(rec.nome)}</div>
          <div class="invite-meta">🔑 ${esc(rec.codigo)} &nbsp;·&nbsp; 📅 ${date}</div>
        </div>
        <button class="dl-btn" onclick="reDownload('${rec.id}')">⬇️</button>`;
      cont.appendChild(div);
    });
  } catch (e) {
    cont.innerHTML = '<p style="color:#ef4444;font-size:13px;text-align:center">Erro ao carregar histórico.</p>';
    console.error(e);
  }
}

// ══════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════
function switchTab(tab) {
  document.getElementById('tabGen').classList.toggle('active', tab === 'generate');
  document.getElementById('tabHist').classList.toggle('active', tab === 'history');
  document.getElementById('generateTab').style.display = tab === 'generate' ? 'block' : 'none';
  document.getElementById('historyTab').style.display = tab === 'history' ? 'block' : 'none';
  if (tab === 'history') renderHistory();
}

// ══════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════
function hexToRgb(hex) {
  hex = (hex || '#000000').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16) || 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function setProgress(show, msg, pct) {
  const box = document.getElementById('progressBox');
  box.style.display = show ? 'block' : 'none';
  if (msg) document.getElementById('progressMsg').textContent = msg;
  if (pct !== undefined) document.getElementById('progFill').style.width = pct + '%';
  const btn = document.getElementById('generateBtn');
  if (show) btn.disabled = true;
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
