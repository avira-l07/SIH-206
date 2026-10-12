import { useEffect } from 'react';
export default function useDashboardRefresh(socket, refresh, invalidate) {
  useEffect(() => {
    let debounce;
    const schedule = () => { invalidate(); clearTimeout(debounce); debounce = setTimeout(refresh, 200); };
    const visible = () => { if (document.visibilityState === 'visible') schedule(); };
    refresh(); socket?.on('connect', schedule); socket?.on('operations:changed', schedule);
    window.addEventListener('online', schedule); window.addEventListener('sih:queue-synced', schedule); document.addEventListener('visibilitychange', visible);
    const poll = setInterval(schedule, 60000);
    return () => { invalidate(); clearTimeout(debounce); clearInterval(poll); socket?.off('connect', schedule); socket?.off('operations:changed', schedule); window.removeEventListener('online', schedule); window.removeEventListener('sih:queue-synced', schedule); document.removeEventListener('visibilitychange', visible); };
  }, [socket, refresh, invalidate]);
}
