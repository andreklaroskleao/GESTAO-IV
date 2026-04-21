const STORAGE_KEY = 'gestao-theme';

let mediaQuery = null;
let mediaHandlerBound = false;

export function initTheme() {
  applyStoredTheme();
  bindSystemThemeWatcher();
}

export function getPreferredTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'system';
}

export function setTheme(theme) {
  const normalizedTheme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
  localStorage.setItem(STORAGE_KEY, normalizedTheme);
  applyStoredTheme();
}

function resolveTheme() {
  const preferred = getPreferredTheme();

  if (preferred === 'dark') {
    return 'dark';
  }

  if (preferred === 'light') {
    return 'light';
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyStoredTheme() {
  const resolvedTheme = resolveTheme();
  const preferredTheme = getPreferredTheme();

  document.body.classList.remove('theme-dark', 'theme-light');
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-theme-preference', preferredTheme);

  if (resolvedTheme === 'dark') {
    document.body.classList.add('theme-dark');
  } else {
    document.body.classList.add('theme-light');
  }

  updateMetaThemeColor(resolvedTheme);
}

function updateMetaThemeColor(resolvedTheme) {
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (!metaThemeColor) return;

  metaThemeColor.setAttribute(
    'content',
    resolvedTheme === 'dark' ? '#0b1220' : '#f4f7fb'
  );
}

function bindSystemThemeWatcher() {
  if (mediaHandlerBound) return;

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleChange = () => {
    if (getPreferredTheme() === 'system') {
      applyStoredTheme();
    }
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleChange);
  } else if (typeof mediaQuery.addListener === 'function') {
    mediaQuery.addListener(handleChange);
  }

  mediaHandlerBound = true;
}