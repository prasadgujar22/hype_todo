// Account access is intentionally self-contained: the page only needs #auth-root
// and a single call to initAuth() before starting the dashboard.
const AUTH_MARKUP = `
  <div class="ha-overlay" data-ha-overlay>
    <div class="ha-layout">
      <section class="ha-story" aria-label="About HYPE">
        <div class="ha-story-top">
          <div class="ha-brand" aria-label="HYPE">
            <span class="ha-brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path fill="currentColor" d="M3 3h8.5v8.5h9V3H29v26h-8.5v-9h-9v9H3V3Z"/></svg></span>
            <span class="ha-brand-name" aria-hidden="true">HYPE<span>.</span></span>
          </div>
          <span class="ha-story-topline" aria-hidden="true">A LITTLE BETTER, EVERY DAY <span>↗</span></span>
        </div>

        <div class="ha-story-content">
          <p class="ha-story-eyebrow"><span aria-hidden="true">✳</span> A LITTLE SPACE FOR BIG THINGS</p>
          <p class="ha-statement">Less noise.<br>More <span>momentum.</span></p>
          <p class="ha-story-copy">Get it out of your head and into motion. One small step at a time.</p>

          <div class="ha-scene" aria-hidden="true">
            <div class="ha-orbit ha-orbit-one"></div><div class="ha-orbit ha-orbit-two"></div>
            <div class="ha-preview">
              <div class="ha-preview-header"><div><span class="ha-preview-kicker">A LITTLE PROGRESS</span><strong>What matters today<span>.</span></strong></div><span class="ha-preview-spark">✳</span></div>
              <div class="ha-preview-row"><span class="ha-preview-check"></span><span>Take the next small step</span><span class="ha-preview-tag">PERSONAL</span></div>
              <div class="ha-preview-row"><span class="ha-preview-check"></span><span>Make time for what matters</span><span class="ha-preview-tag ha-preview-tag-purple">WORK</span></div>
              <div class="ha-preview-row ha-preview-row-done"><span class="ha-preview-check ha-preview-check-done"><svg viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6"/></svg></span><span>Show up for yourself</span><span class="ha-preview-tag">DONE</span></div>
              <div class="ha-preview-footer"><span>EXAMPLE TASKS</span><span>YOUR SPACE, YOUR PACE ↗</span></div>
            </div>
            <div class="ha-sticker"><span class="ha-sticker-star">✳</span><span><strong>Little things<br>add up.</strong><small>KEEP GOING ↗</small></span></div>
          </div>
        </div>
        <div class="ha-story-footer" aria-hidden="true"><span>MADE FOR MOMENTUM</span><span>YOUR SPACE. YOUR PACE. <b>↗</b></span></div>
      </section>

      <main class="ha-entry" aria-label="HYPE account access">
        <div class="ha-panel">
          <div class="ha-panel-top" aria-hidden="true"><span>YOUR SPACE AWAITS</span><span>HYPE / 01</span></div>

          <div class="ha-view ha-loading" data-ha-screen="loading" role="status" aria-live="polite">
            <span class="ha-spinner ha-spinner-large" aria-hidden="true"></span>
            <p class="ha-overline">JUST A MOMENT</p>
            <h1 class="ha-title">Getting your space ready<span class="ha-period">.</span></h1>
            <p class="ha-intro">Checking your account.</p>
          </div>

          <div class="ha-view" data-ha-screen="connection" hidden>
            <p class="ha-overline"><span aria-hidden="true">✳</span> CONNECTION CHECK</p>
            <h1 class="ha-title" data-ha-connection-title tabindex="-1">Let’s try that again<span class="ha-period">.</span></h1>
            <p class="ha-intro" data-ha-connection-message>We couldn’t check your account. Please try again.</p>
            <button class="ha-primary ha-retry" type="button" data-ha-retry>
              <span>Try again</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>
            </button>
          </div>

          <div class="ha-view" data-ha-screen="auth" hidden>
            <p class="ha-overline"><span aria-hidden="true">✳</span> <span data-ha-form-kicker>START HERE</span></p>
            <h1 class="ha-title" data-ha-form-heading tabindex="-1"><span data-ha-form-title>Make space for more</span><span class="ha-period">.</span></h1>
            <p class="ha-intro" data-ha-form-intro>Create your account and put your plans in motion.</p>

            <div class="ha-tabs" role="group" aria-label="Account options">
              <button type="button" data-ha-mode="signup" aria-pressed="true">Create account</button>
              <button type="button" data-ha-mode="login" aria-pressed="false">Sign in</button>
            </div>

            <form class="ha-form" data-ha-form="signup" novalidate>
              <div class="ha-field">
                <label for="ha-signup-name">Name</label>
                <input id="ha-signup-name" name="name" type="text" autocomplete="name" maxlength="80" placeholder="What should we call you?" aria-describedby="ha-signup-name-error" required>
                <p class="ha-field-error" id="ha-signup-name-error" hidden></p>
              </div>
              <div class="ha-field">
                <label for="ha-signup-email">Email address</label>
                <input id="ha-signup-email" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="you@example.com" aria-describedby="ha-signup-email-error" required>
                <p class="ha-field-error" id="ha-signup-email-error" hidden></p>
              </div>
              <div class="ha-field">
                <label for="ha-signup-password">Password</label>
                <div class="ha-password-wrap">
                  <input id="ha-signup-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="256" placeholder="Create a password" aria-describedby="ha-signup-password-hint ha-signup-password-error" required>
                  <button class="ha-password-toggle" type="button" data-ha-password="ha-signup-password" aria-controls="ha-signup-password" aria-label="Show password">Show</button>
                </div>
                <p class="ha-field-hint" id="ha-signup-password-hint">At least 12 characters, up to 256.</p>
                <p class="ha-field-error" id="ha-signup-password-error" hidden></p>
              </div>
              <p class="ha-form-error" data-ha-form-error role="alert" aria-live="assertive" hidden></p>
              <button class="ha-primary" type="submit">
                <span class="ha-spinner" data-ha-submit-spinner aria-hidden="true" hidden></span>
                <span data-ha-submit-label>Create account</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>
              </button>
            </form>

            <form class="ha-form" data-ha-form="login" novalidate hidden>
              <div class="ha-field">
                <label for="ha-login-email">Email address</label>
                <input id="ha-login-email" name="email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="you@example.com" aria-describedby="ha-login-email-error" required>
                <p class="ha-field-error" id="ha-login-email-error" hidden></p>
              </div>
              <div class="ha-field">
                <label for="ha-login-password">Password</label>
                <div class="ha-password-wrap">
                  <input id="ha-login-password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="256" placeholder="Enter your password" aria-describedby="ha-login-password-error" required>
                  <button class="ha-password-toggle" type="button" data-ha-password="ha-login-password" aria-controls="ha-login-password" aria-label="Show password">Show</button>
                </div>
                <p class="ha-field-error" id="ha-login-password-error" hidden></p>
              </div>
              <p class="ha-form-error" data-ha-form-error role="alert" aria-live="assertive" hidden></p>
              <button class="ha-primary" type="submit">
                <span class="ha-spinner" data-ha-submit-spinner aria-hidden="true" hidden></span>
                <span data-ha-submit-label>Sign in</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>
              </button>
            </form>
            <p class="ha-form-foot"><span aria-hidden="true">✳</span> A little more room for what matters.</p>
          </div>

          <div class="ha-view" data-ha-screen="onboarding" hidden>
            <p class="ha-overline"><span aria-hidden="true">✳</span> A QUICK WELCOME</p>
            <h1 class="ha-title ha-welcome-title" data-ha-welcome-heading tabindex="-1">Welcome in,<br><span data-user-name></span><span class="ha-period">.</span></h1>
            <p class="ha-intro">Glad you’re here. A few little things to help you find your rhythm.</p>
            <div class="ha-guide">
              <div class="ha-guide-item">
                <span class="ha-guide-icon ha-guide-project" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="7" rx="1.5"/><rect x="3.5" y="14" width="7" height="7" rx="1.5"/><rect x="13.5" y="14" width="7" height="7" rx="1.5"/></svg></span>
                <div><h2>Give it a project</h2><p>Keep related tasks together in Personal, Work, or Ideas. Choose whichever fits.</p></div>
              </div>
              <div class="ha-guide-item">
                <span class="ha-guide-icon ha-guide-date" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3v4m9-4v4m-13 2.5h17m-12 4h.01m4 0h.01m4 0h.01"/></svg></span>
                <div><h2>Make dates work for you</h2><p>Add an optional due date. Open tasks due today or later show up in Today or Upcoming.</p></div>
              </div>
            </div>
            <form data-ha-onboarding-form novalidate>
              <p class="ha-form-error" data-ha-onboarding-error role="alert" aria-live="assertive" hidden></p>
              <button class="ha-primary" type="submit">
                <span class="ha-spinner" data-ha-submit-spinner aria-hidden="true" hidden></span>
                <span data-ha-submit-label>Continue to your space</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>
              </button>
            </form>
            <p class="ha-welcome-foot">One thing at a time. You’ve got this. <span aria-hidden="true">✳</span></p>
            <button class="ha-signout-link" type="button" data-sign-out>Not your account? Sign out</button>
          </div>

          <div class="ha-panel-bottom" aria-hidden="true"><span>A CLEARER WAY TO GET THERE</span><span>✳</span></div>
        </div>
      </main>
    </div>
  </div>
  <div class="ha-visually-hidden" data-ha-action-status role="status" aria-live="polite" aria-atomic="true"></div>
  <div class="ha-visually-hidden" data-ha-logout-status role="status" aria-live="polite" aria-atomic="true"></div>
  <div class="ha-toast" data-ha-toast role="alert" aria-live="assertive" hidden>
    <span class="ha-toast-icon" aria-hidden="true">!</span>
    <span data-ha-toast-message></span>
    <button type="button" data-ha-dismiss-toast aria-label="Dismiss notification">×</button>
  </div>
`;

const AUTH_CHANGE_KEY = 'hype:auth-change';
let authSignalSequence = 0;

// Only a fresh, non-secret marker is shared. Never put account or task data in storage.
function notifyOtherTabs() {
  try {
    const nonce = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    window.localStorage.setItem(AUTH_CHANGE_KEY, `${nonce}-${++authSignalSequence}`);
  } catch {
    // Storage may be blocked; focus/visibility session checks still provide a fallback.
  }
}

class AuthRequestError extends Error {
  constructor(kind, status = 0, detail = '') {
    super(detail || kind);
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, { method = 'GET', body, expectedUserId } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const options = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  };
  if (expectedUserId !== undefined) options.headers['X-Hype-User'] = expectedUserId;
  if (method === 'POST') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body ?? {});
  }

  try {
    const response = await fetch(path, options);
    // The cookie has changed once a successful response arrives, even if its body
    // later fails to parse. Notify before reading the body, and only for auth changes.
    if (response.ok && method === 'POST' && ['/api/auth/signup', '/api/auth/login', '/api/auth/logout'].includes(path)) {
      notifyOtherTabs();
    }
    // The status alone is authoritative, even if its optional body is absent.
    // Cancel the unneeded stream so a stalled body cannot hold the UI or socket open.
    if (response.status === 401) {
      if (response.body) void response.body.cancel().catch(() => {});
      throw new AuthRequestError('http', 401);
    }
    let payload = null;
    if (response.status !== 204) {
      try {
        payload = await response.json();
      } catch (error) {
        // Error responses do not need a JSON body. A successful response does.
        if (error.name === 'AbortError') throw error;
        if (response.ok) throw new AuthRequestError('invalid', response.status);
      }
    }
    if (!response.ok) {
      if (expectedUserId !== undefined && response.status === 409 && payload?.code === 'ACCOUNT_CHANGED') {
        reloadForAccountChange();
        throw new AuthRequestError('account-changed', 409);
      }
      const detail = typeof payload?.error === 'string' ? payload.error : '';
      throw new AuthRequestError('http', response.status, detail);
    }
    return payload;
  } catch (error) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError('network');
  } finally {
    clearTimeout(timeout);
  }
}

function hasUserId(user) {
  return user !== null && typeof user === 'object' && !Array.isArray(user)
    && typeof user.id === 'string' && user.id.trim().length > 0;
}

function readUser(payload) {
  const user = payload?.user;
  if (!hasUserId(user) || typeof user.name !== 'string' || !user.name.trim() || typeof user.onboarded !== 'boolean') {
    throw new AuthRequestError('invalid');
  }
  return user;
}

function errorMessage(error, action) {
  if (action === 'logout') return error.kind === 'network'
    ? 'Couldn’t sign you out. Check your connection and try again.'
    : 'Couldn’t sign you out. Please try again.';
  if (error.kind === 'network') return 'Couldn’t reach HYPE. Check your connection and try again.';
  if (error.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (error.status === 401 && action === 'login') return 'That email and password don’t match. Please try again.';
  if (error.status === 409 && action === 'signup') return 'Couldn’t create this account. If you already have one, try signing in.';
  if ((error.status === 400 || error.status === 422) && error.detail) return error.detail.slice(0, 250);
  if (error.status >= 500) return 'HYPE is having trouble right now. Please try again in a moment.';
  if (action === 'onboarding') return 'We couldn’t finish setting up your space. Please try again.';
  return action === 'signup' ? 'We couldn’t create your account. Please try again.' : 'We couldn’t sign you in. Please try again.';
}

let authPromise = null;
let signOutHandlerInstalled = false;
let sessionObserversInstalled = false;
let signingOut = false;
let signedInUser = null;
let userNameObserver = null;
let authReloadPending = false;
let authSignalVersion = 0;
let sessionCheckInFlight = false;
let sessionCheckTimer = null;
let sessionActivityVersion = 0;
let sessionCheckVersion = 0;
let sessionCheckAgain = false;
const sessionInvalidationCallbacks = new Set();

export function isAuthReloadPending() {
  return authReloadPending;
}

// The dashboard uses this to discard task state and cancel requests before reload.
export function onSessionInvalidated(callback) {
  if (authReloadPending) callback();
  else sessionInvalidationCallbacks.add(callback);
}

export function reloadForAccountChange() {
  if (authReloadPending) return;
  authReloadPending = true;
  if (sessionCheckTimer !== null) {
    clearTimeout(sessionCheckTimer);
    sessionCheckTimer = null;
  }
  signedInUser = null;

  // Gate the whole workspace, including native dialogs, before doing any async work.
  document.body.classList.add('auth-pending');
  const shell = document.querySelector('.app-shell');
  if (shell) shell.hidden = true;
  const root = document.getElementById('auth-root');
  if (root) {
    root.querySelectorAll('[data-ha-screen]').forEach((screen) => {
      screen.hidden = screen.dataset.haScreen !== 'loading';
    });
    const overlay = root.querySelector('[data-ha-overlay]');
    if (overlay) overlay.hidden = false;
    const loadingMessage = root.querySelector('[data-ha-screen="loading"] .ha-intro');
    if (loadingMessage) loadingMessage.textContent = 'Refreshing your account.';
    const toast = root.querySelector('[data-ha-toast]');
    if (toast) toast.hidden = true;
    root.querySelectorAll('input[name="password"]').forEach((input) => { input.value = ''; });
  }
  document.querySelectorAll('[data-user-name]').forEach((element) => { element.textContent = ''; });
  document.querySelectorAll('dialog[open]').forEach((dialog) => {
    dialog.hidden = true;
    try { dialog.close(); } catch { dialog.removeAttribute('open'); }
  });
  for (const callback of sessionInvalidationCallbacks) {
    try { callback(); } catch { /* The workspace is already hidden; still reload. */ }
  }
  window.location.reload();
}

async function recheckSession() {
  if (authReloadPending || signingOut || !signedInUser || sessionCheckInFlight) return;
  sessionCheckInFlight = true;
  sessionCheckVersion = sessionActivityVersion;
  const expectedUserId = signedInUser.id;
  try {
    const payload = await request('/api/auth/me');
    if (authReloadPending || signingOut || sessionCheckAgain || signedInUser?.id !== expectedUserId) return;
    if (!hasUserId(payload?.user) || payload.user.id !== expectedUserId) reloadForAccountChange();
  } catch (error) {
    // Only an authoritative missing session causes a reload. Network/server errors
    // leave the existing workspace alone, with no misleading alert.
    if (!authReloadPending && !signingOut && !sessionCheckAgain && signedInUser?.id === expectedUserId && error.status === 401) {
      reloadForAccountChange();
    }
  } finally {
    sessionCheckInFlight = false;
    if (sessionCheckAgain) {
      sessionCheckAgain = false;
      scheduleSessionRecheck();
    }
  }
}

function scheduleSessionRecheck() {
  if (authReloadPending || signingOut || !signedInUser) return;
  if (sessionCheckInFlight) {
    // A genuinely new return while a check is in flight needs one more check;
    // the focus/visibility pair for the same return does not.
    if (sessionActivityVersion !== sessionCheckVersion) sessionCheckAgain = true;
    return;
  }
  if (sessionCheckTimer !== null) return;
  // A focus and a visibility event often arrive together. Coalesce them and keep
  // only one /me request in flight.
  sessionCheckTimer = setTimeout(() => {
    sessionCheckTimer = null;
    void recheckSession();
  }, 0);
}

function installSessionObservers() {
  if (sessionObserversInstalled) return;
  sessionObserversInstalled = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH_CHANGE_KEY || typeof event.newValue !== 'string' || !event.newValue) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    authSignalVersion += 1;
    if (signedInUser) reloadForAccountChange();
  });
  window.addEventListener('blur', () => { sessionActivityVersion += 1; });
  window.addEventListener('focus', scheduleSessionRecheck);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sessionActivityVersion += 1;
    else scheduleSessionRecheck();
  });
}

function setUserNames(user) {
  signedInUser = user;
  document.querySelectorAll('[data-user-name]').forEach((element) => {
    if (element.textContent !== user.name) element.textContent = user.name;
  });

  // The dashboard may render parts of its UI after initAuth resolves.
  if (!userNameObserver && typeof MutationObserver !== 'undefined') {
    userNameObserver = new MutationObserver((records) => {
      if (!signedInUser) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches('[data-user-name]') && node.textContent !== signedInUser.name) node.textContent = signedInUser.name;
          node.querySelectorAll('[data-user-name]').forEach((element) => {
            if (element.textContent !== signedInUser.name) element.textContent = signedInUser.name;
          });
        }
      }
    });
    userNameObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function showToast(root, message) {
  const toast = root.querySelector('[data-ha-toast]');
  root.querySelector('[data-ha-toast-message]').textContent = message;
  toast.hidden = false;
}

function installSignOutHandler(root) {
  if (signOutHandlerInstalled) return;
  signOutHandlerInstalled = true;
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const trigger = target?.closest('[data-sign-out]');
    if (!trigger) return;
    event.preventDefault();
    if (signingOut || authReloadPending || !signedInUser || trigger.getAttribute('aria-disabled') === 'true' || trigger.disabled) return;
    const expectedUserId = signedInUser.id;

    signingOut = true;
    root.querySelector('[data-ha-toast]').hidden = true;
    root.querySelector('[data-ha-logout-status]').textContent = 'Signing out…';
    const controls = Array.from(document.querySelectorAll('[data-sign-out]'), (element) => ({
      element,
      disabled: 'disabled' in element ? element.disabled : undefined,
      ariaDisabled: element.getAttribute('aria-disabled'),
      ariaBusy: element.getAttribute('aria-busy'),
    }));
    controls.forEach(({ element }) => {
      if ('disabled' in element) element.disabled = true;
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('aria-busy', 'true');
    });

    try {
      await request('/api/auth/logout', { method: 'POST', body: {}, expectedUserId });
      if (!authReloadPending) reloadForAccountChange();
    } catch (error) {
      if (!authReloadPending && error.status === 401) reloadForAccountChange();
      else if (!authReloadPending) showToast(root, errorMessage(error, 'logout'));
    } finally {
      if (!authReloadPending) {
        controls.forEach(({ element, disabled, ariaDisabled, ariaBusy }) => {
          if (disabled !== undefined) element.disabled = disabled;
          if (ariaDisabled === null) element.removeAttribute('aria-disabled');
          else element.setAttribute('aria-disabled', ariaDisabled);
          if (ariaBusy === null) element.removeAttribute('aria-busy');
          else element.setAttribute('aria-busy', ariaBusy);
        });
        root.querySelector('[data-ha-logout-status]').textContent = '';
        signingOut = false;
      }
    }
  });
}

/**
 * Gate dashboard startup on an authenticated, onboarded session.
 * Resolves with the server's user object only after the gate is complete.
 */
export async function initAuth() {
  if (authPromise) return authPromise;
  const root = document.getElementById('auth-root');
  if (!root) throw new Error('HYPE authentication requires an #auth-root element.');

  document.body.classList.add('auth-pending');
  // This is static, trusted markup only. User/server text is always set with textContent.
  root.innerHTML = AUTH_MARKUP;
  installSignOutHandler(root);
  installSessionObservers();

  authPromise = new Promise((resolve) => {
    const overlay = root.querySelector('[data-ha-overlay]');
    const screens = root.querySelectorAll('[data-ha-screen]');
    const signupForm = root.querySelector('[data-ha-form="signup"]');
    const loginForm = root.querySelector('[data-ha-form="login"]');
    const onboardingForm = root.querySelector('[data-ha-onboarding-form]');
    let formBusy = false;
    let checkingSession = false;
    let checkSessionAgain = false;

    function focus(element, preventScroll = false) {
      if (element) element.focus({ preventScroll });
    }

    function showScreen(name) {
      screens.forEach((screen) => { screen.hidden = screen.dataset.haScreen !== name; });
    }

    function clearPasswords() {
      root.querySelectorAll('input[name="password"]').forEach((input) => {
        input.value = '';
        input.type = 'password';
      });
      root.querySelectorAll('[data-ha-password]').forEach((button) => {
        button.textContent = 'Show';
        button.setAttribute('aria-label', 'Show password');
      });
    }

    function finish(user) {
      if (authReloadPending) return;
      clearPasswords();
      setUserNames(user);
      overlay.hidden = true;
      document.body.classList.remove('auth-pending');
      resolve(user);
    }

    function acceptUser(user) {
      if (authReloadPending) return;
      clearPasswords();
      setUserNames(user);
      if (user.onboarded === false) {
        showScreen('onboarding');
        focus(root.querySelector('[data-ha-welcome-heading]'));
      } else {
        finish(user);
      }
    }

    function setMode(mode, shouldFocus = true) {
      const signup = mode === 'signup';
      signupForm.hidden = !signup;
      loginForm.hidden = signup;
      root.querySelectorAll('[data-ha-mode]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.haMode === mode));
      });
      root.querySelector('[data-ha-form-kicker]').textContent = signup ? 'START HERE' : 'WELCOME BACK';
      root.querySelector('[data-ha-form-title]').textContent = signup ? 'Make space for more' : 'Good to see you again';
      root.querySelector('[data-ha-form-intro]').textContent = signup
        ? 'Create your account and put your plans in motion.'
        : 'Sign in to pick up right where you left off.';
      if (shouldFocus) focus(root.querySelector('[data-ha-form-heading]'));
    }

    function setFormError(form, message = '') {
      const element = form.querySelector('[data-ha-form-error]');
      element.textContent = message;
      element.hidden = !message;
    }

    function setFieldError(input, message = '') {
      const element = root.querySelector(`#${input.id}-error`);
      element.textContent = message;
      element.hidden = !message;
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    function validate(form, mode) {
      setFormError(form);
      const fields = Array.from(form.querySelectorAll('input'));
      fields.forEach((input) => setFieldError(input));
      const email = form.elements.email;
      const password = form.elements.password;
      const name = mode === 'signup' ? form.elements.name : null;
      let firstInvalid = null;
      const flag = (field, message) => {
        setFieldError(field, message);
        if (!firstInvalid) firstInvalid = field;
      };

      if (name) {
        const value = name.value.trim();
        if (!value) flag(name, 'Please enter your name.');
        else if (Array.from(value).length > 80 || /[\u0000-\u001f\u007f]/.test(value)) flag(name, 'Please use a name of up to 80 characters.');
      }
      const address = email.value.trim();
      if (!address) flag(email, 'Please enter your email address.');
      else if (address.length > 254 || email.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) flag(email, 'Please enter a valid email address.');
      const passwordLength = Array.from(password.value).length;
      if (!password.value) flag(password, 'Please enter your password.');
      else if (passwordLength < 12 || passwordLength > 256 || password.value.includes('\u0000')) flag(password, 'Use a password between 12 and 256 characters.');

      if (firstInvalid) {
        setFormError(form, 'Please check the highlighted fields.');
        focus(firstInvalid);
        return null;
      }
      const data = { email: address, password: password.value };
      if (name) data.name = name.value.trim();
      return data;
    }

    function setBusy(form, busy, idleLabel, busyLabel) {
      form.setAttribute('aria-busy', String(busy));
      form.querySelectorAll('input, button').forEach((control) => { control.disabled = busy; });
      form.querySelector('[data-ha-submit-label]').textContent = busy ? busyLabel : idleLabel;
      form.querySelector('[data-ha-submit-spinner]').hidden = !busy;
      root.querySelector('[data-ha-action-status]').textContent = busy ? busyLabel : '';
    }

    async function submitCredentials(form, mode) {
      if (formBusy || authReloadPending) return;
      const data = validate(form, mode);
      if (!data) return;
      formBusy = true;
      const signup = mode === 'signup';
      setBusy(form, true, signup ? 'Create account' : 'Sign in', signup ? 'Creating your account…' : 'Signing you in…');
      root.querySelectorAll('[data-ha-mode]').forEach((button) => { button.disabled = true; });
      let failed = false;
      const signalVersion = authSignalVersion;
      try {
        const payload = await request(`/api/auth/${mode}`, { method: 'POST', body: data });
        if (authReloadPending) return;
        if (signalVersion !== authSignalVersion) {
          reloadForAccountChange();
          return;
        }
        acceptUser(readUser(payload));
      } catch (error) {
        if (authReloadPending) return;
        if (signalVersion !== authSignalVersion) {
          reloadForAccountChange();
          return;
        }
        failed = true;
        setFormError(form, errorMessage(error, mode));
      } finally {
        if (!authReloadPending) {
          setBusy(form, false, signup ? 'Create account' : 'Sign in', signup ? 'Creating your account…' : 'Signing you in…');
          root.querySelectorAll('[data-ha-mode]').forEach((button) => { button.disabled = false; });
          formBusy = false;
          if (failed) focus(form.querySelector('button[type="submit"]'));
        }
      }
    }

    async function checkSession() {
      if (checkingSession || authReloadPending) return;
      checkingSession = true;
      const signalVersion = authSignalVersion;
      showScreen('loading');
      try {
        const payload = await request('/api/auth/me');
        if (authReloadPending) return;
        if (signalVersion !== authSignalVersion) {
          checkSessionAgain = true;
          return;
        }
        acceptUser(readUser(payload));
      } catch (error) {
        if (authReloadPending) return;
        if (signalVersion !== authSignalVersion) {
          checkSessionAgain = true;
          return;
        }
        if (error.status === 401) {
          setMode('signup', false);
          showScreen('auth');
          focus(root.querySelector('[data-ha-form-heading]'), true);
        } else {
          root.querySelector('[data-ha-connection-message]').textContent = error.kind === 'network'
            ? 'We couldn’t reach HYPE. Check your connection, then try again.'
            : 'We couldn’t check your account right now. Please try again in a moment.';
          showScreen('connection');
          focus(root.querySelector('[data-ha-connection-title]'), true);
        }
      } finally {
        checkingSession = false;
        if (checkSessionAgain && !authReloadPending) {
          checkSessionAgain = false;
          void checkSession();
        }
      }
    }

    signupForm.addEventListener('submit', (event) => { event.preventDefault(); void submitCredentials(signupForm, 'signup'); });
    loginForm.addEventListener('submit', (event) => { event.preventDefault(); void submitCredentials(loginForm, 'login'); });
    [signupForm, loginForm].forEach((form) => {
      form.addEventListener('input', (event) => {
        if (event.target instanceof HTMLInputElement) setFieldError(event.target);
        setFormError(form);
      });
    });

    onboardingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (formBusy || authReloadPending) return;
      const expectedUserId = signedInUser?.id;
      if (!expectedUserId) {
        reloadForAccountChange();
        return;
      }
      formBusy = true;
      const errorElement = root.querySelector('[data-ha-onboarding-error]');
      errorElement.hidden = true;
      errorElement.textContent = '';
      setBusy(onboardingForm, true, 'Continue to your space', 'Getting your space ready…');
      let failed = false;
      try {
        const payload = await request('/api/auth/onboarding', { method: 'POST', body: {}, expectedUserId });
        if (authReloadPending) return;
        const user = readUser(payload);
        if (user.id !== expectedUserId) {
          reloadForAccountChange();
          return;
        }
        if (!user.onboarded) throw new AuthRequestError('invalid');
        finish(user);
      } catch (error) {
        if (authReloadPending) return;
        if (error.status === 401) {
          signedInUser = null;
          document.querySelectorAll('[data-user-name]').forEach((element) => { element.textContent = ''; });
          clearPasswords();
          setMode('login', false);
          showScreen('auth');
          setFormError(loginForm, 'Your session ended. Please sign in again to continue.');
          focus(root.querySelector('[data-ha-form-heading]'));
        } else {
          failed = true;
          errorElement.textContent = errorMessage(error, 'onboarding');
          errorElement.hidden = false;
        }
      } finally {
        if (!authReloadPending) {
          setBusy(onboardingForm, false, 'Continue to your space', 'Getting your space ready…');
          formBusy = false;
          if (failed) focus(onboardingForm.querySelector('button[type="submit"]'));
        }
      }
    });

    root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      const modeButton = target.closest('[data-ha-mode]');
      const passwordButton = target.closest('[data-ha-password]');
      if (modeButton && !formBusy) {
        setFormError(signupForm);
        setFormError(loginForm);
        setMode(modeButton.dataset.haMode);
      } else if (passwordButton) {
        const input = root.querySelector(`#${passwordButton.dataset.haPassword}`);
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
        passwordButton.textContent = showing ? 'Hide' : 'Show';
        passwordButton.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
      } else if (target.closest('[data-ha-retry]')) {
        void checkSession();
      } else if (target.closest('[data-ha-dismiss-toast]')) {
        root.querySelector('[data-ha-toast]').hidden = true;
      }
    });

    void checkSession();
  });
  return authPromise;
}
