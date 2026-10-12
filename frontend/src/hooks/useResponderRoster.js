import { useEffect, useState } from 'react';
import api from '../services/api';
import { useSocket } from '../context/SocketContext';
export default function useResponderRoster(enabled) {
  const { socket } = useSocket();
  const [responders, setResponders] = useState([]), [rosterError, setRosterError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, sequence = 0, debounce;
    const load = async () => {
      const request = ++sequence;
      try { const { data } = await api.get('/auth/responders'); if (!cancelled && request === sequence) { setResponders(data.responders); setRosterError(''); } }
      catch { if (!cancelled && request === sequence) setRosterError('Could not load approved volunteers. Refresh to retry.'); }
    };
    const refresh = () => { clearTimeout(debounce); debounce = setTimeout(load, 200); };
    const changed = ({ topic } = {}) => { if (topic === 'sos') refresh(); };
    load(); socket?.on('connect', refresh); socket?.on('responders:changed', refresh); socket?.on('operations:changed', changed);
    const poll = setInterval(load, 60000);
    return () => { cancelled = true; clearTimeout(debounce); clearInterval(poll); socket?.off('connect', refresh); socket?.off('responders:changed', refresh); socket?.off('operations:changed', changed); };
  }, [enabled, socket]);
  return { responders, rosterError };
}
