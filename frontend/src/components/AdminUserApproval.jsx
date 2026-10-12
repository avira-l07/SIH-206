import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import useResponderRoster from '../hooks/useResponderRoster';
import { useSocket } from '../context/SocketContext';
export default function AdminUserApproval() {
  const [users, setUsers] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(null), [loading, setLoading] = useState(true), [filter, setFilter] = useState('ALL'), [confirmId, setConfirmId] = useState(null);
  const { responders, rosterError } = useResponderRoster(true), { socket } = useSocket();
  const version = useRef(0);
  const load = useCallback(async () => {
    const current = ++version.current; setLoading(true);
    try { const res = await api.get('/auth/users'); if (current === version.current) {setUsers(res.data.users);setError('');} }
    catch { if (current === version.current) setError('Could not load volunteer accounts.'); }
    finally { if (current === version.current) setLoading(false); }
  }, []);
  useEffect(() => { load(); socket?.on('responders:changed',load); const poll=setInterval(load,60000); return () => { clearInterval(poll); socket?.off('responders:changed',load); }; }, [load,socket]);
  const toggle = async user => {
    setBusy(user.id); setError('');
    try { await api.patch(`/auth/users/${user.id}/trust`, {trusted:!user.trusted});setConfirmId(null);await load(); }
    catch (err) { setError(err.response?.data?.error || 'Could not update approval'); }
    finally { setBusy(null); }
  };
  const visible = users.filter(u=>u.role==='VOLUNTEER' && (filter==='ALL' || (filter==='PENDING' ? !u.trusted : u.trusted)));
  return <section className="bg-white border border-[#D8D3C7] rounded-xl p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Volunteer team</h2><button onClick={load} className="underline text-sm">Refresh team</button></div><p className="text-sm opacity-70">Approve field responders and review their current workload.</p><label className="block text-sm">Team filter<select value={filter} onChange={e=>setFilter(e.target.value)} className="rounded border p-2 ml-2"><option value="ALL">All volunteers</option><option value="PENDING">Awaiting approval</option><option value="APPROVED">Approved</option></select></label>{loading && <p role="status" className="text-sm">Refreshing volunteer team…</p>}{(error || rosterError) && <p role="alert" className="text-red-700 text-sm">{error || rosterError}</p>}{!loading && visible.length===0 && <p className="text-sm opacity-70">No volunteers in this section.</p>}{visible.map(user=>{const roster=responders.find(r=>r.id===user.id);return <div key={user.id} className="border-t pt-3 space-y-2"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold break-words">{user.name}</p><p className="text-xs break-words opacity-70">{user.email} · {user.trusted ? 'Approved' : 'Awaiting approval'}</p>{roster && <p className="text-xs mt-1">{roster.onDuty===true?'On duty':roster.onDuty===false?'Off duty':'Availability not set'} · {roster.activeAssignments} active rescues · {roster.locationFresh?'Recent location':'Location not current'}</p>}</div><button disabled={busy!==null} onClick={()=>user.trusted && roster?.activeAssignments>0 ? setConfirmId(user.id) : toggle(user)} className="rounded-lg bg-[#14231F] text-white text-sm px-3 py-2 disabled:opacity-40">{busy===user.id?'Saving…':user.trusted?'Revoke access':'Approve responder'}</button></div>{confirmId===user.id && roster && <div className="rounded-lg bg-amber-50 p-3 text-sm"><p>This responder has {roster.activeAssignments} active rescues. Revoking access will block their updates. Review these assignments and arrange replacements.</p><button disabled={busy!==null} onClick={()=>toggle(user)} className="underline text-red-700 mt-2">Confirm revoke access</button><button onClick={()=>setConfirmId(null)} className="underline ml-3">Keep access</button></div>}</div>;})}</section>;
}
