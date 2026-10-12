import { useState } from 'react';
import api from '../services/api';
import useNow from '../hooks/useNow';
import { DISPATCHED_STATUSES } from '../services/sosWorkflow';
export default function AssignmentControls({ ticket, currentUser, responders, onUpdated }) {
  const now = useNow();
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [target, setTarget] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const admin = currentUser?.role === 'ADMIN', mine = ticket.assignedVolunteerId === currentUser?.id;
  if (!DISPATCHED_STATUSES.includes(ticket.status)) return null;
  const overdue = !ticket.assignmentAcknowledgedAt && ticket.acknowledgmentDueAt && Date.parse(ticket.acknowledgmentDueAt) <= now;
  const act = async (action, body = {}) => {
    setBusy(true); setError('');
    try { const endpoint = '/sos/' + ticket.id + '/' + action; const { data } = await api.patch(endpoint, body); onUpdated(data.sos); setOpen(false); setReason(''); setTarget(''); }
    catch (err) { setError(err.response?.data?.error || 'Could not update this assignment.'); }
    finally { setBusy(false); }
  };
  return <section onClick={e => e.stopPropagation()} aria-label={'Assignment for request ' + ticket.id} className="space-y-2 rounded-lg bg-[#F6F4EF] p-3 text-sm">
    <p>{ticket.assignedResponder?.name ? 'Assigned to ' + ticket.assignedResponder.name : 'Responder #' + ticket.assignedVolunteerId}</p>
    {ticket.assignmentAcknowledgedAt ? <p className="text-xs text-[#2E6E4E]">Assignment acknowledged</p> : <p className={overdue ? 'text-amber-800 font-semibold' : 'text-xs opacity-70'}>{overdue ? 'Acknowledgment overdue — operator attention needed' : ticket.acknowledgmentDueAt ? 'Awaiting acknowledgment by ' + new Date(ticket.acknowledgmentDueAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Acknowledgment not yet recorded'}</p>}
    {ticket.handoffRequestedAt && <p className="text-amber-800 break-words">Replacement requested: {ticket.handoffReason}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-3">{mine && !ticket.assignmentAcknowledgedAt && <button disabled={busy} className="rounded-lg bg-[#14231F] px-3 py-2 text-white" onClick={() => act('acknowledge')}>Acknowledge assignment</button>}{(admin || (mine && !ticket.handoffRequestedAt)) && <button disabled={busy} aria-expanded={open} onClick={() => setOpen(v => !v)} className="underline">{admin ? 'Reassign responder' : 'I need a replacement'}</button>}</div>
    {open && <form className="space-y-2" onSubmit={e => {e.preventDefault(); act(admin ? 'reassign' : 'handoff', admin ? {volunteerId:Number(target),expectedVolunteerId:ticket.assignedVolunteerId,reason} : {reason});}}>
      {admin && <label className="block">Replacement volunteer<select aria-label={'Replacement volunteer for request ' + ticket.id} required value={target} onChange={e => setTarget(e.target.value)} className="block w-full min-w-0 rounded border p-2"><option value="">Choose a different volunteer</option>{responders.filter(r => r.id !== ticket.assignedVolunteerId).map(r => <option key={r.id} value={r.id} disabled={r.onDuty === false}>{r.name} · {r.onDuty === true ? 'on duty' : r.onDuty === false ? 'off duty' : 'availability not set'} · {r.activeAssignments} active</option>)}</select></label>}
      <label className="block">Reason<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded border p-2" /></label>
      {!admin && <p className="text-xs opacity-70">The operator will review this. You remain assigned until a replacement is selected.</p>}
      <button disabled={busy || !reason.trim() || (admin && !responders.some(r => r.id === Number(target) && r.onDuty !== false && r.id !== ticket.assignedVolunteerId))} className="rounded-lg bg-[#14231F] px-3 py-2 text-white disabled:opacity-40">{busy ? 'Saving…' : admin ? 'Confirm reassignment' : 'Request replacement'}</button><button type="button" disabled={busy} onClick={() => setOpen(false)} className="ml-3 underline">Cancel</button>
    </form>}
  </section>;
}
