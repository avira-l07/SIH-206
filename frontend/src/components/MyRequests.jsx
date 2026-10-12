import { useState } from 'react';
import api from '../services/api';
import { STATUS_LABELS } from '../services/sosWorkflow';
import RequestTimeline from './RequestTimeline';
import RescueProgress from './RescueProgress';
export default function MyRequests({ requests, onUpdated, onViewLocation }) {
  const [withdrawId, setWithdrawId] = useState(null), [reason, setReason] = useState('');
  const withdraw = async ticket => {
    setBusy(ticket.id); setError('');
    try { const { data } = await api.patch(`/sos/${ticket.id}/withdraw`, { reason }); onUpdated(data.sos); setWithdrawId(null); setReason(''); }
    catch (err) { setError(err.response?.data?.error || 'Could not withdraw this request.'); }
    finally { setBusy(null); }
  };
  const [filter, setFilter] = useState('ALL'), [expanded, setExpanded] = useState(null), [busy, setBusy] = useState(null), [error, setError] = useState('');
  const confirm = async (ticket, confirmed) => {
    setBusy(ticket.id); setError('');
    try { const { data } = await api.patch(`/sos/${ticket.id}/citizen-verify`, { confirmed }); onUpdated(data.sos); }
    catch (err) { setError(err.response?.data?.error || 'Could not update the request. Please retry.'); }
    finally { setBusy(null); }
  };
  const visible = requests.filter(s => filter === 'ALL' || (filter === 'ACTIVE' ? !['RESOLVED','CANCELLED'].includes(s.status) : ['RESOLVED','CANCELLED'].includes(s.status)));
  return <section className="space-y-4" aria-label="My help requests"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">My requests</h2><p className="text-sm opacity-60">Track each request and confirm when help arrives.</p></div><select aria-label="Request history filter" value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border p-2 text-sm"><option value="ALL">All requests ({requests.length})</option><option value="ACTIVE">Active requests</option><option value="CLOSED">Completed & cancelled</option></select></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800 text-sm">{error}</p>}
    {visible.length === 0 && <p className="rounded-xl border border-dashed p-6 text-sm">No requests in this section.</p>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">{visible.map(ticket => <article key={ticket.id} className="rounded-xl border border-[#D8D3C7] bg-white p-4 space-y-3 min-w-0"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Request #{ticket.id}</h3><span className="text-xs opacity-60">{new Date(ticket.createdAt).toLocaleString()}</span></div><p className="text-sm break-words">{ticket.message}</p><p className="text-sm font-semibold">{ticket.citizenConfirmedResolved === true && ticket.status === 'RESOLVED' ? 'You confirmed that you are safe' : STATUS_LABELS[ticket.status]}</p>
      {ticket.status === 'RESOLVED' && ticket.citizenConfirmedResolved !== true && <div className="rounded-lg bg-amber-50 p-3 space-y-2"><p className="text-sm">Did help arrive?</p><div className="flex flex-wrap gap-2"><button disabled={busy === ticket.id} onClick={() => confirm(ticket, true)} className="rounded-lg bg-[#2E6E4E] text-white px-3 py-2 text-sm">Yes, I am safe</button><button disabled={busy === ticket.id} onClick={() => confirm(ticket, false)} className="rounded-lg bg-[#B23A2E] text-white px-3 py-2 text-sm">I still need help</button></div></div>}
      <RescueProgress ticket={ticket}/>
      {ticket.assignedResponder?.name && <p className="text-sm">Assigned responder: {ticket.assignedResponder.name}</p>}{ticket.handoffRequestedAt && <p className="text-sm text-amber-800">The response team is reviewing a replacement request.</p>}
      {ticket.cancelReason && <p className="text-sm">Cancelled: {ticket.cancelReason}</p>}
      <div className="flex flex-wrap gap-3"><button aria-expanded={expanded === ticket.id} onClick={() => setExpanded(expanded === ticket.id ? null : ticket.id)} className="text-sm underline">{expanded === ticket.id ? 'Hide timeline' : 'View timeline'}</button><button onClick={() => onViewLocation([ticket.lat, ticket.lng])} className="text-sm underline">View location</button></div>{['PENDING','VERIFIED'].includes(ticket.status) && !ticket.assignedVolunteerId && <button className="text-sm text-red-700 underline" onClick={() => {setWithdrawId(ticket.id);setReason('');}}>Withdraw request</button>}{withdrawId === ticket.id && ['PENDING','VERIFIED'].includes(ticket.status) && !ticket.assignedVolunteerId && <form className="space-y-2" onSubmit={e => {e.preventDefault();withdraw(ticket);}}><label className="block text-sm">Why are you withdrawing this request?<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded border p-2" /></label><button disabled={busy === ticket.id || !reason.trim()} className="rounded-lg bg-red-700 px-3 py-2 text-white text-sm disabled:opacity-40">Confirm withdrawal</button><button type="button" onClick={() => setWithdrawId(null)} className="ml-3 text-sm underline">Keep request</button></form>}{expanded === ticket.id && <RequestTimeline ticket={ticket} />}
    </article>)}</div>
  </section>;
}
