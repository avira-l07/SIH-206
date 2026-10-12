import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
export default function ProfileDialog({ onClose }) {
  const { user, refreshUser } = useAuth();
  const dialog = useRef(null);
  const [form, setForm] = useState({name:user.name,phone:user.phone || '',region:user.region || ''}), [busy, setBusy] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState(false);
  useEffect(() => { const modal = dialog.current; const previousFocus = document.activeElement; modal.showModal(); return () => { if (modal.open) modal.close(); if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true}); }; }, []);
  const save = async e => {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false);
    try { await api.patch('/auth/profile', form); await refreshUser(); setSaved(true); }
    catch (err) { setError(err.response?.data?.error || 'Could not save your contact details.'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} aria-labelledby="profile-title" onCancel={onClose} className="m-auto w-[calc(100%_-_2rem)] max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border bg-white p-5 text-[#14231F] backdrop:bg-black/50"><div className="flex items-center justify-between gap-3"><h2 id="profile-title" className="font-bold text-lg">My account</h2><button type="button" onClick={onClose} className="rounded border px-3 py-2">Close</button></div><p className="text-sm break-words mt-2">{user.email}</p><p className="text-xs opacity-60 mt-1">{user.role === 'ADMIN' ? 'Operator' : user.role === 'VOLUNTEER' ? 'Volunteer' : 'Citizen'}</p><form onSubmit={save} className="space-y-3 mt-4">{[['name','Name',100],['phone','Contact phone',25],['region','Region / district',200]].map(([key,label,max]) => <label className="block text-sm" key={key}>{label}<input type={key === 'phone' ? 'tel' : 'text'} required={key === 'name'} maxLength={max} value={form[key]} onChange={e => {setForm(prev => ({...prev,[key]:e.target.value}));setSaved(false);}} className="block w-full rounded border p-2 mt-1" /></label>)}<p className="text-xs opacity-70">Your contact details are used for future help requests. Include the country code in your phone number.</p>{error && <p role="alert" className="text-red-700 text-sm">{error}</p>}{saved && <p role="status" className="text-[#2E6E4E] text-sm">Account details saved.</p>}<button disabled={busy} className="rounded-lg bg-[#14231F] text-white px-4 py-2 disabled:opacity-40">{busy ? 'Saving…' : 'Save account details'}</button></form></dialog>;
}
