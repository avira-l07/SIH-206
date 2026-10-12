import { useState, lazy, Suspense } from 'react';
import api from '../services/api';
import useResponderRoster from '../hooks/useResponderRoster';
import { canAdvanceSOS, NEXT_STATUS, STATUS_LABELS } from '../services/sosWorkflow';
import { responseTabs, responsesForView } from '../services/responseViews';
import AssignmentControls from './AssignmentControls';
import useNow from '../hooks/useNow';
import RequestTimeline from './RequestTimeline';
import RescueProgress from './RescueProgress';
import useConsoleSection from '../hooks/useConsoleSection';
import { openFieldTool } from '../services/consoleNavigation';
const TriageKanban = lazy(() => import('./TriageKanban'));
const actions = { EN_ROUTE: 'Arrived on scene', ON_SCENE: 'Confirm evacuation', EVACUATED: 'Confirm medical handover', HANDED_OVER_TO_MEDICAL: 'Complete rescue' };

export default function ResponseWorkspace({ sosList, currentUser, userCoords, onSOSUpdated, onSelectCoords, assetSuggestions = {} }) {
  const now = useNow();
  const admin = currentUser?.role === 'ADMIN';
  const { responders, rosterError } = useResponderRoster(admin);
  const [query, setQuery] = useState('');
  const [view, setView] = useConsoleSection(responseTabs(currentUser).map(tab=>tab.id), admin ? 'WAITING' : 'MINE', 'queue');
  const [board, setBoard] = useState(false);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [reason, setReason] = useState('');
  const [timeline, setTimeline] = useState(null);
  const update = async (ticket, action, body = {}) => {
    setBusy(ticket.id); setError('');
    try {
      const paths = { verify: `/sos/${ticket.id}/verify`, assign: `/sos/${ticket.id}/assign`, status: `/sos/${ticket.id}/status`, 'triage-tag': `/sos/${ticket.id}/triage-tag`, cancel: `/sos/${ticket.id}/cancel` };
      const { data } = await api.patch(paths[action], body); onSOSUpdated(data.sos); setCancelId(null); setReason(''); }
    catch (err) { setError(err.response?.data?.error || 'Could not update this request. Please retry.'); }
    finally { setBusy(null); }
  };
  const tickets = responsesForView(sosList, view, currentUser, now).filter(t => !query.trim() || [t.id, t.userName, t.message].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="space-y-4" aria-label="Rescue requests">
    <div className="flex flex-wrap gap-3 justify-between items-center"><div><h2 className="text-lg font-bold">{admin ? 'Rescue requests' : 'Your rescue work'}</h2><p className="text-sm text-[#14231F]/60">{admin ? 'Review new reports and send an approved volunteer.' : 'Open an assignment and record the next step.'}</p></div><button type="button" onClick={() => setBoard(v => !v)} className="text-sm underline underline-offset-4">{board ? 'Show simple list' : 'Show triage board'}</button></div>
    {(error || rosterError) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error || rosterError}</p>}
    {board ? <Suspense fallback={<p>Loading board…</p>}><TriageKanban sosList={sosList} currentUser={currentUser} userCoords={userCoords} onSOSUpdated={onSOSUpdated} onSelectCoords={onSelectCoords} /></Suspense> : <>
      <div className="flex flex-wrap gap-2">{responseTabs(currentUser).map(tab => <button type="button" key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)} className={`rounded-full border px-3 py-2 text-sm ${view === tab.id ? 'border-[#14231F] bg-[#14231F] text-white' : 'border-[#D8D3C7] bg-white'}`}>{tab.label} <span className="ml-1 opacity-70">{responsesForView(sosList, tab.id, currentUser, now).length}</span></button>)}</div>
      <label className="block text-sm">Search requests<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, request number or message" className="block w-full rounded-lg border border-[#D8D3C7] p-2 mt-1" /></label>
      {tickets.length === 0 && <div className="rounded-xl border border-dashed border-[#D8D3C7] bg-white p-8 text-center"><p className="font-semibold">{query.trim() ? 'No matching requests' : view === 'MINE' ? 'No active assignments' : view === 'AVAILABLE' ? 'No verified calls available' : 'No requests in this section'}</p><p className="text-sm opacity-60 mt-1">{query.trim() ? 'Try a different name, request number or message.' : view === 'MINE' ? 'Assigned calls appear here. You can also accept a verified call.' : 'This list updates automatically as requests change.'}</p></div>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">{tickets.map(ticket => <article key={ticket.id} className="rounded-xl border border-[#D8D3C7] bg-white p-5 space-y-3">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{ticket.userName || ticket.user?.name || 'Citizen request'}</h3><p className="text-xs text-[#14231F]/60 mt-1">#{ticket.id} · {ticket.hazardType.toLowerCase()} · {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>{ticket.priority === 'URGENT' && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Urgent</span>}</div>
        <p className="text-sm">{ticket.message}</p><p className="text-sm font-medium text-[#2E6E4E]">{ticket.status === 'RESOLVED' && ticket.citizenConfirmedResolved ? 'Citizen confirmed safe' : STATUS_LABELS[ticket.status]}</p>
        <RescueProgress ticket={ticket}/>
        <div className="flex flex-wrap items-center gap-2">
          {admin && ticket.status === 'PENDING' && <button disabled={busy === ticket.id} onClick={() => update(ticket, 'verify')} className="rounded-lg bg-[#14231F] text-white px-4 py-2 text-sm font-semibold">Verify request</button>}
          {ticket.status === 'VERIFIED' && <>{admin && <select aria-label={`Volunteer for request ${ticket.id}`} value={selected[ticket.id] || ''} onChange={e => setSelected(prev => ({ ...prev, [ticket.id]: e.target.value }))} className="rounded-lg border border-[#D8D3C7] p-2 text-sm max-w-full"><option value="">Choose volunteer</option>{responders.map(user => <option key={user.id} value={user.id} disabled={user.onDuty === false}>{user.name} · {user.onDuty === true ? 'on duty' : user.onDuty === false ? 'off duty' : 'availability not set'} · {user.activeAssignments} active · {user.locationFresh ? 'recent location' : 'location not current'}</option>)}</select>}<button disabled={busy === ticket.id || (!admin && currentUser?.onDuty === false) || (admin && (!selected[ticket.id] || !responders.some(r => r.id === Number(selected[ticket.id]) && r.onDuty !== false)))} onClick={() => update(ticket, 'assign', admin ? { volunteerId: Number(selected[ticket.id]) } : {})} className="rounded-lg bg-[#14231F] text-white px-4 py-2 text-sm font-semibold disabled:opacity-40">{admin ? 'Assign volunteer' : currentUser?.onDuty === false ? 'Start your shift to accept' : 'Accept call'}</button></>}
          {canAdvanceSOS(ticket, currentUser) && (admin || ticket.assignmentAcknowledgedAt) && <button disabled={busy === ticket.id} onClick={() => update(ticket, 'status', { status: NEXT_STATUS[ticket.status] })} className="rounded-lg bg-[#2E6E4E] text-white px-4 py-2 text-sm font-semibold">{actions[ticket.status]}</button>}
          <button onClick={() => onSelectCoords([ticket.lat, ticket.lng])} className="px-2 py-2 text-sm underline underline-offset-4">View location</button>
          <button aria-expanded={timeline === ticket.id} onClick={() => setTimeline(timeline === ticket.id ? null : ticket.id)} className="px-2 py-2 text-sm underline underline-offset-4">{timeline === ticket.id ? 'Hide timeline' : 'View timeline'}</button>
          {busy === ticket.id && <span role="status" className="text-sm">Saving…</span>}
        </div>
        <AssignmentControls ticket={ticket} currentUser={currentUser} responders={responders} onUpdated={onSOSUpdated} />
        {canAdvanceSOS(ticket,currentUser) && <div className="flex flex-wrap gap-3"><button className="text-sm underline" onClick={()=>openFieldTool('bookings',{sosId:ticket.id,assetId:assetSuggestions[ticket.id]?.id})}>Book equipment for this rescue</button><button className="text-sm underline" onClick={()=>openFieldTool('routes',{destination:{lat:ticket.lat,lng:ticket.lng,name:`Request #${ticket.id}`}})}>Plan route to incident</button></div>}
        {timeline === ticket.id && <RequestTimeline ticket={ticket} />}
        <details className="border-t border-[#D8D3C7] pt-3"><summary className="cursor-pointer text-sm text-[#14231F]/65">Contact and request details</summary><div className="space-y-3 mt-3 text-sm">
          {(ticket.userPhone || ticket.user?.phone) && <a className="underline" href={`tel:${ticket.userPhone || ticket.user.phone}`}>Call citizen: {ticket.userPhone || ticket.user.phone}</a>}
          <p>Location: {ticket.lat.toFixed(4)}, {ticket.lng.toFixed(4)}</p>{ticket.vulnerabilityTags?.length > 0 && <p>Additional needs: {ticket.vulnerabilityTags.join(', ')}</p>}
          {ticket.assignedVolunteerId && <p>Assigned responder: {ticket.assignedResponder?.name || responders.find(v => v.id === ticket.assignedVolunteerId)?.name || `#${ticket.assignedVolunteerId}`}</p>}
          {ticket.cancelReason && <p>Cancellation reason: {ticket.cancelReason}</p>}
          {assetSuggestions[ticket.id] && <p>Nearby resource: {assetSuggestions[ticket.id].title} · {assetSuggestions[ticket.id].distanceKm} km away{assetSuggestions[ticket.id].contact && <a className="underline ml-2" href={`tel:${assetSuggestions[ticket.id].contact}`}>Contact owner</a>}</p>}
          {canAdvanceSOS(ticket, currentUser) && <label className="block">Triage priority <select aria-label={`Triage priority for request ${ticket.id}`} value={ticket.triageTag || ''} disabled={busy === ticket.id} onChange={e => update(ticket, 'triage-tag', { triageTag: e.target.value })} className="border rounded p-2 ml-2"><option value="" disabled>Choose priority</option><option value="IMMEDIATE">Immediate</option><option value="DELAYED">Delayed</option><option value="MINOR">Minor</option><option value="DECEASED">Deceased</option></select></label>}
          {canAdvanceSOS(ticket, currentUser) && ['ON_SCENE', 'EVACUATED'].includes(ticket.status) && <button className="underline" disabled={busy === ticket.id} onClick={() => update(ticket, 'status', { status: 'RESOLVED' })}>Complete rescue without medical handover</button>}
          {((admin && ['PENDING', 'VERIFIED', 'EN_ROUTE', 'ON_SCENE'].includes(ticket.status)) || (ticket.assignedVolunteerId === currentUser?.id && ['EN_ROUTE', 'ON_SCENE'].includes(ticket.status))) && <button className="text-red-700 underline" onClick={() => { setCancelId(ticket.id); setReason(''); }}>Cancel request</button>}
          {cancelId === ticket.id && <form onSubmit={e => { e.preventDefault(); update(ticket, 'cancel', { cancelReason: reason }); }} className="space-y-2"><label className="block">Reason for cancellation<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="block w-full border rounded p-2" /></label><button disabled={busy === ticket.id || !reason.trim()} className="rounded bg-red-700 text-white px-3 py-2">Confirm cancellation</button><button type="button" onClick={() => setCancelId(null)} className="ml-3 underline">Keep request</button></form>}
        </div></details>
      </article>)}</div>
    </>}
  </section>;
}
