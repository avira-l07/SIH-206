import { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
export default function VolunteerAvailability() {
  const { user, refreshUser } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = async () => {
    setBusy(true); setError('');
    try { await api.patch('/auth/availability', { onDuty: user.onDuty !== true }); await refreshUser(); }
    catch (err) { setError(err.response?.data?.error || 'Could not update availability.'); }
    finally { setBusy(false); }
  };
  return <div id="volunteer-availability" className="flex flex-wrap items-center gap-3 text-sm"><span className={user?.onDuty ? 'text-[#2E6E4E]' : 'opacity-60'}>{user?.onDuty === true ? 'On duty · ready for assignments' : user?.onDuty === false ? 'Off duty' : 'Availability not set'}</span><button disabled={busy} onClick={change} className="rounded-lg border px-3 py-2">{busy ? 'Updating…' : user?.onDuty ? 'Finish my shift' : 'Start my shift'}</button>{error && <p role="alert" className="text-red-700">{error}</p>}</div>;
}
