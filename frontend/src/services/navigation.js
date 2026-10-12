export function resolveRoute(pathname, hash = '') {
  if (hash === '#landing') return { view: 'landing' };
  if (hash === '#console') return { view: 'dashboard' };
  const routes = {
    '/': 'landing', '/login': 'login', '/register': 'register', '/alerts': 'public-alerts', '/console': 'dashboard',
    '/citizen': 'dashboard', '/volunteer': 'dashboard', '/operator': 'dashboard',
  };
  const path = pathname.replace(/\/$/, '') || '/';
  return { view: routes[path] || 'not-found', requiredRole: { '/citizen': 'CITIZEN', '/volunteer': 'VOLUNTEER', '/operator': 'ADMIN' }[path] };
}
export const VIEW_PATHS = { landing: '/', login: '/login', register: '/register', 'public-alerts': '/alerts', dashboard: '/console' };
