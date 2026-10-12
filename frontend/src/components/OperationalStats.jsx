import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function OperationalStats() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false, revision = 0, debounce;
    setSummary(null);
    const load = async () => {
      const current = ++revision;
      try {
        const res = await api.get('/operations/summary');
        if (!cancelled && current === revision) { setSummary(res.data.summary); setError(false); }
      } catch { if (!cancelled && current === revision) setError(true); }
    };
    const refresh = () => { clearTimeout(debounce); debounce = setTimeout(load, 150); };
    load();
    socket?.on('operations:changed', refresh);
    socket?.on('connect', refresh);
    window.addEventListener('online', refresh);
    const timer = setInterval(load, 30000);
    return () => { cancelled = true; clearTimeout(debounce); clearInterval(timer); socket?.off('operations:changed', refresh); socket?.off('connect', refresh); window.removeEventListener('online', refresh); };
  }, [socket, user?.id, user?.trusted]);
  const primary = summary ? user?.role === 'VOLUNTEER' ? [['Assigned to me', summary.sos.myAssigned], ['Ready for dispatch', summary.sos.verified], ['Free shelter beds', summary.shelters.freeBeds]] : user?.role === 'ADMIN' ? [['Awaiting dispatch', summary.sos.awaitingDispatch], ['Active rescues', summary.sos.dispatched], ['Free shelter beds', summary.shelters.freeBeds]] : [['My waiting requests', summary.sos.awaitingDispatch], ['My active rescues', summary.sos.dispatched], ['Free shelter beds', summary.shelters.freeBeds]] : [];
  const extra = summary ? [...(user?.role === 'ADMIN' ? [['Replacements requested', summary.sos.replacementRequested], ['Acknowledgments overdue', summary.sos.acknowledgmentOverdue]] : []), ['Active alerts', summary.alerts.active], ['Rescues completed / confirmed safe', String(summary.sos.resolvedAwaitingConfirmation + summary.sos.resolvedConfirmed) + ' / ' + summary.sos.resolvedConfirmed], ['Supply items needing restock', summary.resources.deficitItems]] : [];
  return <details aria-label="Live operational statistics" className="rounded-lg border border-[#D8D3C7] bg-white px-3 text-sm">
    <summary className="cursor-pointer flex flex-wrap items-center gap-x-4 gap-y-1 py-2"><span className="font-semibold">{error?summary?'Last loaded overview':'Overview unavailable':'Live overview'}</span>{primary.map(([label,value])=><span key={label} className="text-sm text-[#14231F]/70">{value} {label.toLowerCase()}</span>)}</summary>
    {error && <p role="status" className="text-xs text-amber-800">Counts may be out of date. Reconnecting…</p>}
    {!summary && <p className="text-sm opacity-60">Loading latest counts…</p>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3">{extra.map(([label,value])=><div key={label}><p className="text-xs opacity-60">{label}</p><strong>{value}</strong></div>)}</div>{summary&&<p className="text-xs opacity-60 pb-3">Updated {new Date(summary.asOf).toLocaleTimeString()}. {summary.shelters.unauditedResourceFields > 0 ? String(summary.shelters.unauditedResourceFields) + ' shelter measurements are still unaudited.' : ''}</p>}
  </details>;
}
