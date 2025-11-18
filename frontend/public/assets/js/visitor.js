(() => {
  const RESULT_KEY = 'iw.cb.result.v1';
  const EVENT_NAME = 'iw-cashback-update';

  if (typeof window === 'undefined') return;
  if (localStorage.getItem(RESULT_KEY)) return;

  const overlay = document.createElement('div');
  overlay.className = 'iw-modal-overlay';
  overlay.innerHTML = `
    <div class="iw-modal" role="dialog" aria-modal="true" aria-labelledby="iw-modal-title">
      <header>
        <h3 id="iw-modal-title">iWanted - Acess&oacute;rios Premium &middot; Confirme seu n&uacute;mero</h3>
      </header>
      <div class="body">
        <p class="hint">Confirme seu n&uacute;mero para continuar direto para as ofertas Black Friday.</p>
        <div class="row">
          <label for="iw-phone">Telefone (apenas n&uacute;meros)</label>
          <input id="iw-phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="DDD + n&uacute;mero" maxlength="16" />
        </div>
        <div class="error" id="iw-error" hidden></div>
        <div class="actions">
          <button class="btn btn-primary" type="button" id="iw-submit">Ver ofertas da Black</button>
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
    hide();
    setTimeout(() => overlay.remove(), 150);
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
    show();

    const btnSubmit = overlay.querySelector('#iw-submit');
    const input = overlay.querySelector('#iw-phone');
    const errEl = overlay.querySelector('#iw-error');

    const setLoading = (state) => {
      btnSubmit.disabled = state;
      input.disabled = state;
      btnSubmit.textContent = state ? 'Carregando...' : 'Ver ofertas da Black';
    };

    const clean = (value) => String(value || '').replace(/\D/g, '');

    const onSubmit = async () => {
      errEl.hidden = true;
      errEl.textContent = '';
      const digits = clean(input.value);
      if (digits.length < 10) {
        errEl.textContent = 'Digite um número válido (com DDD).';
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

        localStorage.setItem(RESULT_KEY, JSON.stringify({ phone: digits, data: null }));
        broadcast({ phone: digits, data: null });
        close();
        window.location.href = '/black-friday';
      } catch (err) {
        errEl.textContent = 'Não foi possível verificar agora. Tente novamente mais tarde.';
        errEl.hidden = false;
      } finally {
        setLoading(false);
      }
    };

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
