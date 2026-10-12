import { useState } from 'react';
import api from '../services/api';

export default function CreateShelter({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', region:'', address: '', contact: '', lat: '', lng: '', capacity: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const { data } = await api.post('/shelters', { ...form, lat: Number(form.lat), lng: Number(form.lng), capacity: Number(form.capacity) });
      onCreated(data.shelter); setOpen(false); setForm({ name: '', region:'', address: '', contact: '', lat: '', lng: '', capacity: '' });
    } catch (err) { setError(err.response?.data?.error || 'Unable to register shelter'); }
    finally { setBusy(false); }
  };
  return <section className="mx-4 mb-3"><button type="button" className="border rounded px-3 py-2 font-bold text-sm" onClick={() => setOpen(v => !v)}>{open ? 'Close shelter registration' : 'Register shelter'}</button>{open && <form onSubmit={submit} className="mt-2 border rounded p-3 bg-white grid grid-cols-2 md:grid-cols-3 gap-2">
    {Object.keys(form).map(key => <label key={key} className="text-xs capitalize">Shelter {key}<input aria-label={`Shelter ${key}`} required={key !== 'contact'} value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} type={['lat', 'lng', 'capacity'].includes(key) ? 'number' : 'text'} step={key === 'capacity' ? '1' : 'any'} min={key === 'capacity' ? 1 : key === 'lat' ? -90 : key === 'lng' ? -180 : undefined} max={key === 'capacity' ? 100000 : key === 'lat' ? 90 : key === 'lng' ? 180 : undefined} maxLength={key === 'name' ? 150 : 250} className="block w-full border rounded p-2" /></label>)}
    <p className="col-span-full text-xs">Resource quantities remain unaudited until a field responder records them.</p>{error && <p role="alert" className="col-span-full text-red-700">{error}</p>}<button disabled={busy} className="rounded p-2 bg-[#14231F] text-white">{busy ? 'Saving…' : 'Save shelter'}</button>
  </form>}</section>;
}
