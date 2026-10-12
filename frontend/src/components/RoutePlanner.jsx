import { useRef, useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../context/AuthContext';
import { validMapPoint } from '../services/offlineMap';
import useNow from '../hooks/useNow';
const RoutePreview = lazy(() => import('./RoutePreview'));
const field = 'block w-full rounded-lg border border-[#D8D3C7] bg-white p-2 mt-1';
const initialPoint = point => validMapPoint(point) ? {lat:String(point.lat),lng:String(point.lng)} : {lat:'',lng:''};

export default function RoutePlanner({ resource, context = {} }) {
  const {user} = useAuth(), now = useNow(), gpsRevision = useRef(0);
  useEffect(()=>()=>{gpsRevision.current++;},[]);
  const [start,setStart] = useState(()=>initialPoint(user));
  const [end,setEnd] = useState(()=>initialPoint(context.destination));
  const [destination,setDestination] = useState(String(context.destination?.id || ''));
  const [mode,setMode] = useState('FOOT'),[route,setRoute] = useState(null),[locating,setLocating] = useState(false),[error,setError] = useState('');
  const [locationNote,setLocationNote] = useState(validMapPoint(user) ? 'Saved account location. Use GPS or check the coordinates before travel.' : 'Choose your starting location with GPS or enter it manually.');
  const busy = resource.busy || locating;
  const shelters = resource.data.shelters?.shelters || [];
  const changeStart = (key,value) => {gpsRevision.current++;setLocating(false);setStart(old=>({...old,[key]:value}));setRoute(null);setLocationNote('Manually entered starting location. Check it before travel.');};
  const gps = () => {
    if (!navigator.geolocation) {setError('GPS is unavailable. Enter your starting coordinates manually.');return;}
    const revision = ++gpsRevision.current;setLocating(true);setError('');setRoute(null);
    navigator.geolocation.getCurrentPosition(position=>{
      if (revision!==gpsRevision.current) return;
      setStart({lat:String(position.coords.latitude),lng:String(position.coords.longitude)});
      setLocationNote(`GPS observed ${new Date(position.timestamp).toLocaleTimeString()} · accuracy ±${Math.round(position.coords.accuracy)} m. Check that this is your starting point.`);setLocating(false);
    },()=>{if(revision===gpsRevision.current){setLocating(false);setError('Could not get GPS. Allow location access or enter the coordinates manually.');}}, {enableHighAccuracy:true,timeout:10000,maximumAge:0});
  };
  const selectedName = shelters.find(s=>String(s.id)===destination)?.name || (destination==='' && context.destination?.name && Number(end.lat)===context.destination.lat && Number(end.lng)===context.destination.lng ? context.destination.name : 'Entered destination');
  const coordinates = [start.lat,start.lng,end.lat,end.lng];
  const valid = coordinates.every(value=>value.trim()!=='') && validMapPoint({lat:Number(start.lat),lng:Number(start.lng)}) && validMapPoint({lat:Number(end.lat),lng:Number(end.lng)});
  return <section className="space-y-4" aria-label="Plan a route">
    <p className="text-sm text-[#14231F]/70">Choose where you are starting and where you need to go. The operator must have reviewed a connected corridor before the app can suggest a route.</p>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <form className="space-y-4 rounded-xl border p-4" onSubmit={async event=>{
      event.preventDefault();setRoute(null);setError('');
      const result=await resource.act('post','/field/routes',{start:[Number(start.lat),Number(start.lng)],end:[Number(end.lat),Number(end.lng)],mode},'Route assessment updated');
      if(result)setRoute(result.route);
    }}>
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-2"><h3 className="font-semibold">1. Starting point</h3><button type="button" onClick={gps} className="rounded-lg border px-3 py-2 text-sm">{locating?'Finding your location…':'Use my current GPS location'}</button><p className="text-sm opacity-70">{locationNote}</p>
          <details open={!validMapPoint({lat:Number(start.lat),lng:Number(start.lng)}) || !start.lat || !start.lng} className="text-sm"><summary className="cursor-pointer">Check or enter starting coordinates</summary><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">{[['lat','Start latitude',-90,90],['lng','Start longitude',-180,180]].map(([key,label,min,max])=><label key={key}>{label}<input aria-label={label} type="number" step="any" min={min} max={max} value={start[key]} onChange={event=>changeStart(key,event.target.value)} className={field}/></label>)}</div></details>
        </div>
        <div className="space-y-2 border-t pt-3"><h3 className="font-semibold">2. Destination</h3><label className="block text-sm">Choose a shelter<select aria-label="Shelter destination" value={destination} onChange={event=>{const value=event.target.value;setDestination(value);setRoute(null);const shelter=shelters.find(s=>String(s.id)===value);setEnd(initialPoint(shelter));}} className={field}><option value="">Enter another destination</option>{shelters.map(s=><option key={s.id} value={s.id}>{s.name} · {Math.max(0,s.capacity-s.currentOccupancy)} reported free places</option>)}</select></label>
          {validMapPoint({lat:Number(end.lat),lng:Number(end.lng)})&&end.lat&&end.lng&&<p className="text-sm">Selected: {selectedName}</p>}
          <details open={!destination} className="text-sm"><summary className="cursor-pointer">Check or enter destination coordinates</summary><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">{[['lat','Destination latitude',-90,90],['lng','Destination longitude',-180,180]].map(([key,label,min,max])=><label key={key}>{label}<input aria-label={label} type="number" step="any" min={min} max={max} value={end[key]} onChange={event=>{setDestination('');setRoute(null);setEnd(old=>({...old,[key]:event.target.value}));}} className={field}/></label>)}</div></details>
        </div>
        <label className="block text-sm border-t pt-3">3. How are you travelling?<select aria-label="Travel mode" value={mode} onChange={event=>{setMode(event.target.value);setRoute(null);}} className={field}><option value="FOOT">Walking</option><option value="VEHICLE">By vehicle</option></select></label>
      </fieldset>
      <button type="submit" disabled={busy||!valid} className="rounded-lg bg-[#14231F] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{resource.busy?'Checking corridors…':'Check available routes'}</button>
      {!valid&&<p className="text-sm opacity-70">Enter both locations to check a route.</p>}
    </form>
    {route&&<div role="status" className="rounded-xl border p-4 text-sm space-y-3">{route.available&&route.corridors.every(c=>Date.parse(c.expiresAt)>now)?<>
      <h3 className="font-semibold">Reviewed corridor available</h3><p>{route.distanceMeters} m suggested distance · {route.excludedSegments} obstructed segments excluded</p><p>{route.warning}</p><Suspense fallback={<p>Loading corridor map…</p>}><RoutePreview points={route.points}/></Suspense>
      <details><summary className="cursor-pointer">Review times and coordinate reference</summary>{route.corridors.map(c=><p className="mt-2" key={c.id}>{c.name} · reviewed {new Date(c.reviewedAt).toLocaleString()} · expires {new Date(c.expiresAt).toLocaleString()}</p>)}<ol className="list-decimal pl-5 mt-3">{route.points.map((p,i)=><li key={i}>{p.map(v=>v.toFixed(5)).join(', ')}</li>)}</ol></details>
    </>:<><h3 className="font-semibold">Ask the operator for route guidance</h3><p>{route.available?'The corridor review expired. Check again before travel.':route.reason}</p><p className="opacity-70">You can contact the destination shelter for current access information.</p></>}</div>}
  </section>;
}
