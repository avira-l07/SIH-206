export function readSection(search, allowed, fallback, parameter = 'section') {
  const value = new URLSearchParams(search).get(parameter);
  return allowed.includes(value) ? value : fallback;
}

export function sectionURL(href, updates) {
  const url = new URL(href);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return url.pathname + url.search + url.hash;
}

export function navigateSections(updates) {
  const target = sectionURL(window.location.href, updates);
  if (target !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function openFieldTool(tool, context = {}) {
  window.dispatchEvent(new CustomEvent('sih:open-field-tool', { detail: { tool, context } }));
}
