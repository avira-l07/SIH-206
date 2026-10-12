import { useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, HeartHandshake, Route, Home } from 'lucide-react';
import useNow from '../hooks/useNow';
import { recommendedAction } from '../services/nextAction';
import { navigateSections, openFieldTool } from '../services/consoleNavigation';

export default function QuickActions({ user, tickets, loading, stale, guidance, location }) {
  const now = useNow();
  const [loadedOnce, setLoadedOnce] = useState(!loading);
  if (!loading && !loadedOnce) setLoadedOnce(true);
  const initialLoading = loading && !loadedOnce;
  const suggested = useMemo(() => recommendedAction(user, tickets, now, guidance), [user, tickets, now, guidance]);
  const action = stale && tickets.length===0 ? {title:'Some dashboard information is unavailable',detail:'Open your request list or retry the dashboard refresh to check the latest information.',label:'Open requests',section:user.role==='CITIZEN'?'REQUESTS':'KANBAN',queue:user.role==='ADMIN'?'WAITING':user.role==='VOLUNTEER'?'MINE':null} : suggested;
  const shortcuts = user.role === 'CITIZEN'
    ? [['preparedness', 'Prepare my household', ClipboardList], ['recovery', 'Request recovery help', HeartHandshake], ['evacuation', 'Shelter evacuation plan', Route]]
    : user.role === 'VOLUNTEER'
      ? [['intakes', 'Record a shelter arrival', Home], ['bookings', 'Book rescue equipment', ClipboardList], ['evacuation', 'My route help points', Route]]
      : [['intakes', 'Shelter arrivals', Home], ['bookings', 'Resource bookings', ClipboardList], ['evacuation', 'Evacuation guidance', Route]];
  const go = () => {
    if (action.tool) openFieldTool(action.tool,{...action.context,start:location});
    else if (action.focus) { const target = document.getElementById(action.focus); target?.scrollIntoView({ block: 'center', behavior: 'auto' }); target?.querySelector('button')?.focus(); }
    else {
      navigateSections({ section: action.section, queue: action.queue || null });
      requestAnimationFrame(()=>{const target=document.querySelector('nav[aria-label="Dashboard sections"]')?.nextElementSibling;if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'auto'});}});
    }
  };
  return <section aria-label="Your next step" className="space-y-3">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#D8D3C7] bg-white p-4">
      <div className="min-w-0"><p className="text-xs font-semibold text-[#2E6E4E] uppercase tracking-wide">Your next step</p><h2 className="mt-1 text-lg font-semibold">{initialLoading ? 'Checking your latest work…' : action.title}</h2><p className="mt-1 text-sm text-[#14231F]/70">{initialLoading ? 'Requests and assignments will appear here.' : action.detail}</p>{stale && <p className="mt-1 text-sm text-amber-800">Based on the last loaded requests. Refresh to check for changes.</p>}</div>
      <button type="button" disabled={initialLoading} onClick={go} className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#14231F] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{action.label}<ArrowRight size={16}/></button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Useful tools">{shortcuts.map(([tool, label, Icon]) => <button key={tool} type="button" onClick={() => openFieldTool(tool)} className="flex items-center gap-2 rounded-lg border border-[#D8D3C7] bg-white px-3 py-2 text-sm"><Icon size={16} aria-hidden="true"/>{label}</button>)}</div>
  </section>;
}
