(() => {
  const STORAGE_KEY = 'iw.cb.checked.v1';
  const RESULT_KEY = 'iw.cb.result.v1';
  const EVENT_NAME = 'iw-cashback-update';

  if (typeof window === 'undefined') return;
  if (localStorage.getItem(STORAGE_KEY)) return;

  const fmtBRL = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const LOGO_SRC = '/assets/img/apple-logo.jpg';

  const overlay = document.createElement('div');
  overlay.className = 'iw-modal-overlay';
  overlay.innerHTML = `
    <div class="iw-modal" role="dialog" aria-modal="true" aria-labelledby="iw-modal-title">
      <header>
        <h3 id="iw-modal-title"><img class="modal-logo" src="${LOGO_SRC}" alt="" aria-hidden="true"/>Confirme seu n&uacute;mero</h3>
        <button class="close" type="button" aria-label="Fechar">Fechar</button>
      </header>
      <div class="body">
        <p class="hint">Confirme seu n&uacute;mero para verificar o tamanho da sua vantagem.</p>
        <div class="row">
          <label for="iw-phone">Telefone (apenas n&uacute;meros)</label>
          <input id="iw-phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="DDD + n&uacute;mero" maxlength="16" />
        </div>
        <div class="error" id="iw-error" hidden></div>
        <div class="actions">
          <button class="btn btn-ghost" type="button" id="iw-cancel">Agora n&atilde;o</button>
          <button class="btn btn-primary" type="button" id="iw-submit">Ver meu cashback</button>
        </div>
      </div>
    </div>`;

  const show = () => {
    overlay.classList.add('is-open');
    document.body.classList.add('iw-modal-open');
  };

  const hide = () => {
    overlay.classList.remove('is-open');
    document.body.classList.remove('iw-modal-open');
  };

  const close = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    hide();
    setTimeout(() => overlay.remove(), 150);
  };

  const toast = document.createElement('div');
  toast.className = 'iw-toast';
  const showToast = (html) => {
    toast.innerHTML = html;
    toast.classList.add('is-show');
    setTimeout(() => toast.classList.remove('is-show'), 8000);
  };

  const broadcast = (payload) => {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: payload }));
    } catch (err) {
      console.warn('[cashback] não foi possível emitir evento', err);
    }
  };

  const SUPABASE_URL = 'https://ozulqzzgmglucoaqhlen.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dWxxenpnbWdsdWNvYXFobGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjk3OTksImV4cCI6MjA3NTcwNTc5OX0.CM3s9KZ7ixCbLoVEIqoKd4A1u-kqPl3OwZ1lMxYW-RM';

  const storePhoneOnSupabase = async (digits) => {
    if (!digits) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/contador?on_conflict=numero`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([{ numero: digits }])
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[cashback] falha ao gravar telefone no Supabase', res.status, text);
      }
    } catch (err) {
      console.warn('[cashback] erro ao gravar telefone no Supabase', err?.message || err);
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(overlay);
    document.body.appendChild(toast);
    show();

    const btnClose = overlay.querySelector('.close');
    const btnCancel = overlay.querySelector('#iw-cancel');
    const btnSubmit = overlay.querySelector('#iw-submit');
    const input = overlay.querySelector('#iw-phone');
    const errEl = overlay.querySelector('#iw-error');

    const setLoading = (state) => {
      btnSubmit.disabled = state;
      btnCancel.disabled = state;
      input.disabled = state;
      btnSubmit.textContent = state ? 'Verificando...' : 'Ver meu cashback';
    };

    const clean = (value) => String(value || '').replace(/\D/g, '');

    const onSubmit = async () => {
      errEl.hidden = true;
      errEl.textContent = '';
      const digits = clean(input.value);
      if (digits.length < 10) {
        errEl.textContent = 'Digite um n\u00famero v\u00e1lido (com DDD).';
        errEl.hidden = false;
        return;
      }

      try {
        setLoading(true);

        storePhoneOnSupabase(digits);
        fetch('/api/visitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: digits })
        }).catch((err) => console.warn('[cashback] falha ao registrar visitante', err));

        const res = await fetch(`/api/cashback?phone=${encodeURIComponent(digits)}`);
        const data = await res.json().catch(() => ({}));
        localStorage.setItem(RESULT_KEY, JSON.stringify({ phone: digits, data }));
        broadcast({ phone: digits, data });
        close();
        if (data && data.found && data.name) {
          const valor = Number(data.cashback || 0);
          const nome = String(data.name).split(' ')[0];
          showToast(`<strong>${nome},</strong> voc&ecirc; tem <strong>${fmtBRL(valor)}</strong> de cashback para gastar em nosso site! <div class="muted">Aproveite nas pr&oacute;ximas compras.</div>`);
        } else {
          showToast(`<strong>N&atilde;o encontramos sua vantagem.</strong><div class="muted">Se acha que &eacute; um engano, fale com a gente no WhatsApp.</div>`);
        }
      } catch (err) {
        errEl.textContent = 'N\u00e3o foi poss\u00edvel verificar agora. Tente novamente mais tarde.';
        errEl.hidden = false;
      } finally {
        setLoading(false);
      }
    };

    btnClose.addEventListener('click', close);
    btnCancel.addEventListener('click', close);
    btnSubmit.addEventListener('click', onSubmit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onSubmit();
      }
    });
    input.focus();
  });
})();
