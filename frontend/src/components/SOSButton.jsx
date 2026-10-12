import { useEffect, useRef, useState } from 'react';
import { AlertOctagon, Loader2, MapPin, CheckCircle2, WifiOff } from 'lucide-react';
import api from '../services/api';
import { enqueueAction, isManualOffline } from '../services/offlineQueue';
import { emergencySMS, smsURI, validEmergencyCoords } from '../services/emergency';
import ModalDialog from './ModalDialog';
import { navigateSections } from '../services/consoleNavigation';

const NEEDS = [['dialysis', 'Dialysis patient'], ['elderly', 'Bedridden / elderly'], ['infant', 'Infant / toddler'], ['pregnant', 'Pregnant']];
const inputClass = 'w-full rounded border border-[#D8D3C7] bg-white p-2 text-sm';

export default function SOSButton({ onSOSCreated, defaultCoords }) {
  const [open, setOpen] = useState(false), [submitting, setSubmitting] = useState(false);
  const [coords, setCoords] = useState(defaultCoords || { lat: '', lng: '' });
  const [location, setLocation] = useState({ source: 'saved', capturedAt: null, accuracy: null });
  const [confirmed, setConfirmed] = useState(false), [locating, setLocating] = useState(false);
  const [hazardType, setHazardType] = useState('FLOOD'), [message, setMessage] = useState('');
  const [tags, setTags] = useState([]), [proxy, setProxy] = useState(false), [subject, setSubject] = useState('');
  const [error, setError] = useState(''), [receipt, setReceipt] = useState(null), [copied, setCopied] = useState(false);
  const inFlight = useRef(false), request = useRef(null), gpsVersion = useRef(0);
  const battery = useRef(null);
  useEffect(() => () => { gpsVersion.current++; }, []);
  useEffect(() => {
    if (!open && validEmergencyCoords(defaultCoords)) { setCoords(defaultCoords); setLocation({ source: 'saved', capturedAt: null, accuracy: null }); }
  }, [defaultCoords, open]);
  const close = event => {
    if (inFlight.current) { event?.preventDefault?.(); return; }
    gpsVersion.current++; setOpen(false); setLocating(false);
  };
  const acquireLocation = () => {
    if (!navigator.geolocation) { setError('GPS is unavailable. Enter and verify the incident coordinates.'); return; }
    const version = ++gpsVersion.current; setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      if (version !== gpsVersion.current) return;
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      setLocation({ source: 'GPS', capturedAt: new Date(position.timestamp).toISOString(), accuracy: Math.round(position.coords.accuracy) });
      setConfirmed(false); setLocating(false);
    }, () => {
      if (version !== gpsVersion.current) return;
      setLocating(false); setError('GPS could not be obtained. Your saved/manual location has not been replaced; verify it before sending.');
    }, { timeout: 10000, enableHighAccuracy: true, maximumAge: 0 });
  };
  const openForm = () => {
    setOpen(true); setReceipt(null); setError(''); setConfirmed(false); setCopied(false); request.current = null;
    if (navigator.getBattery) navigator.getBattery().then(value => { battery.current = Math.round(value.level * 100); }).catch(() => {});
  };
  const editCoordinate = (key, value) => {
    gpsVersion.current++; setLocating(false); setCoords(old => ({ ...old, [key]: value }));
    setLocation({ source: 'manual', capturedAt: null, accuracy: null }); setConfirmed(false);
  };
  const submit = async event => {
    event.preventDefault(); if (inFlight.current) return;
    if (!validEmergencyCoords(coords) || !confirmed) { setError('Verify the incident location before sending.'); return; }
    if (proxy && !subject.trim()) { setError('Describe who needs help.'); return; }
    const details = { lat: Number(coords.lat), lng: Number(coords.lng), hazardType, message: message.trim(),
      vulnerabilityTags: tags.join(','), reportedByProxy: proxy, subjectDescription: proxy ? subject.trim() : null,
      capturedAt: location.capturedAt, coordsAccuracy: location.accuracy, batteryLevel: battery.current };
    const signature = JSON.stringify(details);
    if (!request.current || request.current.signature !== signature) request.current = { signature, payload: { ...details, idempotencyKey: 'sos_' + crypto.randomUUID() } };
    const payload = request.current.payload;
    inFlight.current = true; setSubmitting(true); setError('');
    const save = async uncertain => {
      const record = await enqueueAction({ type: 'SOS', endpoint: '/sos', payload, idempotencyKey: payload.idempotencyKey });
      setReceipt({ queued: true, uncertain, key: record.idempotencyKey, sms: emergencySMS(payload) });
    };
    try {
      if (isManualOffline() || !navigator.onLine) await save(false);
      else {
        const response = await api.post('/sos', payload);
        setReceipt({ queued: false, id: response.data.sos.id, replayed: response.data.replayed });
        onSOSCreated?.(response.data.sos);
      }
    } catch (failure) {
      if (failure.response) setError(failure.response.data?.error || 'Request rejected; review the details and retry.');
      else { try { await save(true); } catch (storageError) { setError('No server receipt and the device could not save your request. ' + storageError.message + ' Use a phone call or SMS.'); } }
    } finally { inFlight.current = false; setSubmitting(false); }
  };
  const copySMS = async () => {
    try { await navigator.clipboard.writeText(receipt.sms); setCopied(true); } catch { setError('Copy is unavailable; select the message below and copy it manually.'); }
  };
  return <>
    <button id="main-sos-button" onClick={openForm} aria-label="Request emergency help" className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 bg-[#B23A2E] hover:bg-[#9E2E23] text-white font-bold rounded border-2 border-[#B23A2E] focus:ring-4 focus:ring-red-200"><AlertOctagon aria-hidden="true"/><span>Request emergency help</span></button>
    {open && <ModalDialog label="Request emergency help" onClose={close}><section className="bg-white p-5 text-[#14231F] space-y-4">
      <header className="flex items-center justify-between gap-3"><h2 className="font-bold text-lg">Request emergency help</h2><button type="button" disabled={submitting} onClick={close} className="rounded border px-3 py-2">Close</button></header>
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {receipt ? <div className="space-y-4" role="status">
        {receipt.queued ? <WifiOff className="text-amber-700"/> : <CheckCircle2 className="text-green-700"/>}
        <h3 className="font-bold">{receipt.queued ? 'Saved on this device — awaiting server confirmation' : `Request #${receipt.id} received`}</h3>
        <p className="text-sm">{receipt.queued ? (receipt.uncertain ? 'The connection failed before a receipt arrived. Sync uses the same receipt key so an already received request is not created again.' : 'Responders have not received a server-confirmed request. Keep this browser’s data; it can synchronize when connected and signed in to this account.') : 'The response team can review it. This receipt does not mean a responder has been dispatched. Follow progress in My requests.'}</p>
        {receipt.queued && <><p className="break-all text-xs">Device receipt: {receipt.key}</p><div className="rounded border p-3 space-y-3"><h4 className="font-semibold">SMS fallback</h4><p className="text-sm">Requires cellular SMS coverage and an operator gateway number. Opening Messages does not send anything. SMS and internet reports may need operator duplicate review.</p><p className="select-all break-words rounded bg-stone-100 p-2 text-sm">{receipt.sms}</p><div className="flex flex-wrap gap-3"><button type="button" onClick={copySMS} className="rounded border p-2">{copied ? 'Copied' : 'Copy SMS'}</button><a className="rounded border p-2" href={smsURI(receipt.sms, import.meta.env.VITE_SMS_GATEWAY_NUMBER, /iPad|iPhone|iPod/.test(navigator.userAgent))}>Open Messages</a></div>{!import.meta.env.VITE_SMS_GATEWAY_NUMBER && <p className="text-xs">Gateway not configured; enter the number supplied by your local operator.</p>}</div></>}
        <button type="button" onClick={() => { close(); setMessage(''); setTags([]); setProxy(false); setSubject(''); if(!receipt.queued)navigateSections({section:'REQUESTS'}); }} className="rounded bg-[#14231F] px-4 py-2 text-white">{receipt.queued?'Keep report saved':'Track this request'}</button>
      </div> : <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={submitting} className="space-y-4">
          <label className="block text-sm">Emergency type<select aria-label="Emergency type" value={hazardType} onChange={e => setHazardType(e.target.value)} className={inputClass}>{['FLOOD','LANDSLIDE','FIRE','EARTHQUAKE','ADVISORY'].map(value => <option key={value} value={value}>{value === 'ADVISORY' ? 'Other / advisory' : value}</option>)}</select></label>
          <div className="rounded border p-3 space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Incident location</span><button type="button" onClick={acquireLocation} disabled={locating} className="underline text-sm flex gap-1 items-center"><MapPin size={14}/>{locating ? 'Finding GPS…' : 'Use GPS'}</button></div>
            <div className="grid grid-cols-2 gap-2"><label className="text-sm">Latitude<input aria-label="SOS latitude" required type="number" min="-90" max="90" step="any" value={coords.lat} onChange={e => editCoordinate('lat', e.target.value)} className={inputClass}/></label><label className="text-sm">Longitude<input aria-label="SOS longitude" required type="number" min="-180" max="180" step="any" value={coords.lng} onChange={e => editCoordinate('lng', e.target.value)} className={inputClass}/></label></div>
            <p className="text-xs">{location.source === 'GPS' ? `GPS observed ${new Date(location.capturedAt).toLocaleString()}, ±${location.accuracy} m. Confirm this is where help is needed.` : `${location.source === 'manual' ? 'Manual coordinates' : 'Saved coordinates'} — no fresh GPS observation.`}</p>
            {location.accuracy > 100 && <p className="text-xs text-amber-800">GPS uncertainty exceeds 100 m. Describe a landmark below.</p>}
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1"/>I verified that these coordinates identify the incident location.</label>
          </div>
          <label className="block text-sm">What help do you need?<textarea aria-label="What help do you need?" required maxLength={2000} rows={3} value={message} onChange={e => setMessage(e.target.value)} placeholder="People needing help, nearby landmark and immediate danger" className={inputClass}/></label>
          <details><summary className="cursor-pointer text-sm font-semibold">Additional needs / reporting for someone else</summary><div className="grid grid-cols-2 gap-2 mt-2">{NEEDS.map(([id,label]) => <button id={`tag-${id}`} key={id} type="button" aria-pressed={tags.includes(id)} onClick={() => setTags(old => old.includes(id) ? old.filter(tag => tag !== id) : [...old,id])} className={`rounded border p-2 text-sm ${tags.includes(id) ? 'bg-[#14231F] text-white' : ''}`}>{label}</button>)}</div><label className="flex items-center gap-2 my-3 text-sm"><input type="checkbox" checked={proxy} onChange={e => setProxy(e.target.checked)}/>Reporting for someone else</label>{proxy && <label className="block text-sm">Who needs help?<textarea aria-label="Who needs help?" required maxLength={500} value={subject} onChange={e => setSubject(e.target.value)} className={inputClass}/></label>}</details>
        </fieldset>
        <button id="confirm-sos-dispatch-btn" type="submit" disabled={submitting || locating || !confirmed} className="w-full rounded bg-[#B23A2E] p-3 text-white font-semibold disabled:opacity-50 flex justify-center gap-2">{submitting && <Loader2 className="animate-spin" size={18}/>} {submitting ? 'Sending…' : isManualOffline() || !navigator.onLine ? 'Save help request for sync' : 'Send help request'}</button>
      </form>}
      <p className="text-sm border-t pt-3">For immediate assistance in India: <a href="tel:112" className="font-bold underline">Call 112</a>. Calls also require a working phone network.</p>
    </section></ModalDialog>}
  </>;
}
