(() => {
  'use strict';
  const element = id => document.getElementById(id);
  const fields = [
    ['Question', 'question'], ['Why it matters', 'why'],
    ['Current understanding', 'known'], ['Uncertainty to investigate', 'unknown'],
  ];
  const values = (prefix = '') => Object.fromEntries(fields.map(([, id]) => [id, element(prefix + id).value.trim()]));
  const draftForm = element('question-form');
  let draft = null;

  function download(value, name, type) {
    const url = URL.createObjectURL(new Blob([value], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  draftForm.addEventListener('submit', event => {
    event.preventDefault();
    draft = values();
    if (!draft.question) return;
    const brief = element('brief');
    brief.replaceChildren();
    for (const [title, id] of fields) {
      if (!draft[id]) continue;
      const heading = document.createElement('h3');
      const text = document.createElement('p');
      heading.textContent = title;
      text.textContent = draft[id];
      brief.append(heading, text);
    }
    element('brief-section').hidden = false;
    element('brief-heading').focus();
  });
  draftForm.addEventListener('reset', () => {
    draft = null;
    element('brief-section').hidden = true;
    element('brief').replaceChildren();
  });
  element('export').addEventListener('click', () => {
    if (!draft) return;
    const lines = fields.filter(([, id]) => draft[id]).map(([title, id]) => title + ':\n' + draft[id]);
    download('CoMind Research Question Draft\nLocal only. Not submitted.\n\n' + lines.join('\n\n'),
      'comind-research-question.txt', 'text/plain;charset=utf-8');
  });

  // The public static build has no Test configuration and never loads the challenge.
  const config = document.querySelector('meta[name="web001-test-contributions"]');
  if (!config) return;
  const endpoint = new URL(config.content);
  if (endpoint.protocol !== 'https:' || !config.dataset.sitekey) return;

  const reviewForm = element('contribution-form');
  const status = element('share-status');
  const submit = element('share-submit');
  const recovery = element('save-pending-receipt');
  let pending = null;
  let receipt = null;
  let widget = null;

  function randomToken() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function turnstile() {
    if (window.turnstile) return window.turnstile;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error('Challenge could not load'));
      };
      document.head.append(script);
    });
    if (!window.turnstile) throw new Error('Challenge unavailable');
    return window.turnstile;
  }

  async function request(path, method, token, access, body) {
    return fetch(new URL(path, endpoint), {
      method,
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        'X-Withdrawal-Token': token,
        'X-Web001-Test-Access': access,
      },
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(15_000),
      body: body && JSON.stringify(body),
    });
  }

  function closeReview() {
    reviewForm.reset();
    element('contribution-section').hidden = true;
    status.textContent = '';
    pending = null;
    recovery.hidden = true;
  }

  element('review-contribution').hidden = false;
  element('receipt-section').hidden = false;
  element('collection-status').textContent = 'Synthetic submissions are available to authorized CoMind testers.';
  element('review-contribution').addEventListener('click', () => {
    if (!draft) return;
    for (const [, id] of fields) element('share-' + id).value = draft[id];
    element('share-consent').checked = false;
    pending = null;
    recovery.hidden = true;
    element('contribution-section').hidden = false;
    element('contribution-heading').focus();
  });
  element('share-cancel').addEventListener('click', () => {
    closeReview();
    element('review-contribution').focus();
  });

  reviewForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !element('share-consent').checked) return;
    const contribution = values('share-');
    if (Array.from(contribution.question).length < 10) {
      status.textContent = 'Enter a question with at least 10 characters.';
      element('share-question').focus();
      return;
    }
    const signature = JSON.stringify(contribution);
    if (pending?.signature !== signature) {
      pending = { id: crypto.randomUUID(), token: randomToken(), signature };
      recovery.hidden = true;
    }
    const attempt = pending;
    const access = element('test-access').value;
    const controls = [...reviewForm.elements];
    controls.forEach(control => { control.disabled = true; });
    element('review-contribution').disabled = true;
    status.textContent = 'Loading the verification challenge.';
    try {
      const challenge = await turnstile();
      status.textContent = 'Complete the verification challenge to send the reviewed contribution.';
      const challengeToken = await new Promise((resolve, reject) => {
        const failure = () => reject(new Error('Challenge failed'));
        widget = challenge.render('#share-challenge', {
          sitekey: config.dataset.sitekey, action: 'web_curiosity', callback: resolve,
          'error-callback': failure, 'expired-callback': failure, 'timeout-callback': failure,
        });
      });
      status.textContent = 'Submitting your reviewed contribution.';
      recovery.hidden = false;
      const response = await request('/contributions', 'POST', attempt.token, access, {
        ...contribution, contribution_id: attempt.id, consent: true,
        consent_version: 'web-curiosity-v1', turnstile_token: challengeToken,
      });
      if (!response.ok) {
        status.textContent = response.status === 429
          ? 'Too many attempts. Wait before trying again.'
          : 'Submission could not be confirmed. You can retry the same contribution.';
        return;
      }
      const data = await response.json();
      if (data.contribution_id !== attempt.id || !Number.isFinite(Date.parse(data.expires_at))) {
        throw new Error('Invalid receipt');
      }
      receipt = { ...data, withdrawal_token: attempt.token };
      closeReview();
      element('save-receipt').hidden = false;
      element('withdraw-receipt').value = '';
      element('withdraw-status').textContent = 'Contribution received. Download the withdrawal receipt.';
      element('receipt-heading').focus();
    } catch {
      status.textContent = 'Submission could not be confirmed. You can retry the same contribution.';
    } finally {
      if (widget !== null) window.turnstile.remove(widget);
      widget = null;
      controls.forEach(control => { control.disabled = false; });
      element('review-contribution').disabled = false;
    }
  });

  recovery.addEventListener('click', () => {
    if (pending) download(JSON.stringify({ contribution_id: pending.id, withdrawal_token: pending.token }),
      'comind-withdrawal-receipt.json', 'application/json');
  });
  element('save-receipt').addEventListener('click', () => {
    if (receipt) download(JSON.stringify(receipt, null, 2), 'comind-withdrawal-receipt.json', 'application/json');
  });
  element('withdraw-form').addEventListener('submit', async event => {
    event.preventDefault();
    const message = element('withdraw-status');
    const button = event.submitter;
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const file = element('withdraw-receipt').files[0];
      const selected = file && file.size <= 4096 ? JSON.parse(await file.text()) : file ? null : receipt;
      if (typeof selected?.contribution_id !== 'string' ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(selected.contribution_id) ||
          !/^[a-f0-9]{64}$/.test(selected.withdrawal_token)) {
        message.textContent = 'Choose a valid withdrawal receipt.';
        return;
      }
      const response = await request('/contributions/' + selected.contribution_id, 'DELETE',
        selected.withdrawal_token, element('withdraw-access').value);
      if (!response.ok || (await response.json()).withdrawn !== true) {
        message.textContent = 'Withdrawal could not be confirmed. Check your receipt and Test access, then retry.';
        return;
      }
      if (receipt?.contribution_id === selected.contribution_id) {
        receipt = null;
        element('save-receipt').hidden = true;
      }
      element('withdraw-form').reset();
      message.textContent = 'Contribution withdrawn. Its content and related research candidates were removed.';
    } catch {
      message.textContent = 'Withdrawal could not be confirmed. Check your receipt and try again.';
    } finally {
      button.disabled = false;
    }
  });
})();
