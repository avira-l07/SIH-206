import { useState } from 'react';
import useNow from '../hooks/useNow';

const resources = [
  ['Water', 'waterLitersRemaining', 'waterThreshold', 200, 'L'],
  ['Food', 'rationsUnitsRemaining', 'rationsThreshold', 50, 'units'],
  ['Medical kits', 'medicalKitsRemaining', 'medicalThreshold', 10, 'kits'],
  ['Blankets', 'blanketsRemaining', 'blanketsThreshold', 30, 'pieces'],
];

export default function AdminShelterRollup({ shelters = [], onViewSupplies, onSelectShelterCoords }) {
  const now = useNow();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const visible = shelters.filter(s => (s.name + ' ' + s.address).toLowerCase().includes(search.toLowerCase()) && (filter === 'ALL' || s.status === filter));
  const capacity = shelters.reduce((sum, s) => sum + s.capacity, 0);
  const occupied = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);
  return <section className="rounded-xl border border-[#D8D3C7] bg-white p-4 space-y-4">
    <div><h2 className="text-lg font-bold">Shelters</h2><p className="text-sm opacity-60">Check available beds and request or record supplies.</p></div>
    <div className="flex flex-wrap gap-2"><input aria-label="Search shelters" placeholder="Search by name or area" value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border border-[#D8D3C7] p-2 text-sm min-w-0 flex-1" /><select aria-label="Shelter status filter" value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-[#D8D3C7] p-2 text-sm max-w-full"><option value="ALL">All shelters ({shelters.length})</option><option value="RED">Critical shortage</option><option value="YELLOW">Needs attention</option><option value="GREEN">Within reported limits</option></select></div>
    <details className="text-sm"><summary className="cursor-pointer opacity-60">Shelter totals</summary><p className="mt-2">{occupied} of {capacity} beds occupied · {Math.max(0, capacity - occupied)} free · {shelters.filter(s => s.status === 'RED').length} shelters with critical shortages. Unaudited quantities remain unknown.</p></details>
    {visible.length === 0 && <p className="text-sm p-4 text-center opacity-60">No shelters match these filters.</p>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{visible.map(s => {
      const free = Math.max(0, s.capacity - s.currentOccupancy);
      const shortages = resources.filter(([, field, threshold, fallback]) => s[field] != null && s[field] < (s[threshold] ?? fallback));
      const unknown = resources.filter(([, field]) => s[field] == null);
      const stale = !s.lastAuditedAt || now - new Date(s.lastAuditedAt).getTime() > 6 * 60 * 60 * 1000;
      return <article key={s.id} className="rounded-xl border border-[#D8D3C7] p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold break-words">{s.name}</h3><p className="text-sm opacity-60 break-words">{s.address}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${s.status === 'RED' ? 'bg-red-50 text-red-700' : s.status === 'YELLOW' ? 'bg-amber-50 text-amber-800' : 'bg-[#F6F4EF]'}`}>{s.status === 'RED' ? 'Critical shortage' : s.status === 'YELLOW' ? 'Needs attention' : 'Within reported limits'}</span></div>
        <p className="text-sm"><strong className="text-xl">{free}</strong> free beds <span className="opacity-60">· {s.currentOccupancy} of {s.capacity} occupied</span></p>
        {shortages.length > 0 && <p className="text-sm text-red-700">Low stock: {shortages.map(([label]) => label).join(', ')}</p>}
        {unknown.length > 0 && <p className="text-xs text-amber-800">Still needs an audit: {unknown.map(([label]) => label).join(', ')}</p>}
        <div className="flex flex-wrap gap-3">{onViewSupplies && <button onClick={() => onViewSupplies(s)} className="rounded-lg bg-[#14231F] text-white px-3 py-2 text-sm font-semibold">Manage supplies</button>}{onSelectShelterCoords && <button onClick={() => onSelectShelterCoords([s.lat, s.lng])} className="text-sm underline underline-offset-4">View on map</button>}</div>
        <details className="border-t border-[#D8D3C7] pt-2 text-sm"><summary className="cursor-pointer opacity-60">Stock and audit details</summary><dl className="grid grid-cols-2 gap-2 mt-3">{resources.map(([label, field, threshold, fallback, unit]) => <div key={field}><dt className="text-xs opacity-60">{label}</dt><dd>{s[field] == null ? 'Not audited' : String(s[field]) + ' ' + unit}<span className="block text-xs opacity-60">Minimum {s[threshold] ?? fallback} {unit}</span></dd></div>)}</dl><p className={`text-xs mt-3 ${stale ? 'text-amber-800' : 'opacity-60'}`}>{s.lastAuditedAt ? 'Last audit: ' + new Date(s.lastAuditedAt).toLocaleString() : 'No stock audit recorded'}{stale && s.lastAuditedAt ? ' · Please refresh the audit.' : ''}</p></details>
      </article>;
    })}</div>
  </section>;
}
