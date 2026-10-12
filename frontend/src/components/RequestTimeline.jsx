import { useEffect, useState } from 'react';
import api from '../services/api';
import { STATUS_LABELS } from '../services/sosWorkflow';
const labels = { CREATED: 'Help requested', VERIFIED: 'Request verified', ASSIGNED: 'Responder assigned', STATUS: 'Progress updated', CANCELLED: 'Request cancelled', TRIAGE: 'Triage updated', CONFIRMED: 'Citizen confirmed safe', REOPENED: 'Help still needed — reopened', ACKNOWLEDGED: 'Assignment acknowledged', HANDOFF_REQUESTED: 'Replacement requested', REASSIGNED: 'Responder reassigned' };
export default function RequestTimeline({ ticket }) {
  const [events, setEvents] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [earlier, setEarlier] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.get(`/sos/${ticket.id}/timeline`).then(({ data }) => { if (!cancelled) { setEvents(data.events); setEarlier(data.hasEarlierHistory); } }).catch(() => { if (!cancelled) setError('Could not load the timeline.'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticket.id, ticket.updatedAt, retry]);
  return <section aria-label={`Timeline for request ${ticket.id}`} className="space-y-3 text-sm">
    {loading && <p role="status">Loading timeline…</p>}
    {error && <p role="alert">{error} <button className="underline" onClick={() => setRetry(v => v + 1)}>Retry</button></p>}
    {!loading && !error && <>{earlier && <p className="text-xs text-amber-800">This request predates timeline recording. Earlier steps are unavailable.</p>}<ol className="space-y-3 border-l border-[#D8D3C7] pl-4">{events.map(event => <li key={event.id}><p className="font-semibold">{labels[event.kind] || 'Request updated'}</p><p>{event.kind === 'CONFIRMED' ? 'Safe — citizen confirmed' : STATUS_LABELS[event.toStatus] || event.toStatus}</p>{event.detail && <p className="break-words">{event.detail}</p>}<p className="text-xs opacity-60">{event.actorName} · {new Date(event.createdAt).toLocaleString()}</p></li>)}</ol></>}
  </section>;
}
