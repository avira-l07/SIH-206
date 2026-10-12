import { useState, useEffect, lazy, Suspense } from 'react';
const FieldTools=lazy(()=>import('./FieldTools'));
const SecurityDialog=lazy(()=>import('./SecurityDialog'));
const ConsoleHelp=lazy(()=>import('./ConsoleHelp'));
import { useAuth } from '../context/AuthContext';
import ConnectionBadge from './ConnectionBadge';
import QuickRoleSwitcher from './QuickRoleSwitcher';
import CivilianAssetsDrawer from './CivilianAssetsDrawer';
import MissingPersonsModal from './MissingPersonsModal';
import { Shield, CircleHelp } from 'lucide-react';
import ProfileDialog from './ProfileDialog';
import NotificationInbox from './NotificationInbox';

export default function Navbar({ onNavigateToLanding, onLogout }) {
  const { user, logout } = useAuth();
  const [fieldOpen,setFieldOpen]=useState(false),[securityOpen,setSecurityOpen]=useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fieldTarget,setFieldTarget]=useState(null),[helpOpen,setHelpOpen]=useState(false),[comfortable,setComfortable]=useState(false);
  useEffect(() => {
    try {setComfortable(localStorage.getItem(`sih-comfort:${user.id}`)==='true');} catch {setComfortable(false);}
  }, [user.id]);
  useEffect(() => {
    document.documentElement.dataset.comfort = String(comfortable);
    return () => {delete document.documentElement.dataset.comfort;};
  }, [comfortable]);
  const changeComfort = value => {setComfortable(value);try {localStorage.setItem(`sih-comfort:${user.id}`,String(value));} catch { /* Preference remains available for this visit. */ }};
  useEffect(() => {
    const open = event => {
      if (!['preparedness','evacuation','bookings','intakes','family','recovery','routes','delivery'].includes(event.detail?.tool)) return;
      setMenuOpen(false); setFieldTarget(event.detail); setFieldOpen(true);
    };
    window.addEventListener('sih:open-field-tool',open);
    return () => window.removeEventListener('sih:open-field-tool',open);
  }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const openTool = setter => { setMenuOpen(false); setter(true); };
  return <>
    <header className="sticky top-0 z-30 w-full border-b border-[#D8D3C7] bg-[#F6F4EF]/95 backdrop-blur px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <button type="button" onClick={onNavigateToLanding} className="flex items-center gap-2 text-base font-bold" aria-label="DisasterShield home"><Shield className="w-5 h-5 text-[#2E6E4E]" /><span className="hidden sm:block">DisasterShield</span></button>
        <div className="flex flex-wrap justify-end items-center gap-2 sm:gap-3 min-w-0"><span className="hidden md:block text-sm text-[#14231F]/60">{user?.role === 'ADMIN' ? 'Operator' : user?.role === 'VOLUNTEER' ? 'Volunteer' : 'Citizen'}</span><ConnectionBadge /><NotificationInbox key={`${user.id}:${user.role}:${user.trusted}`} /><button type="button" aria-label="Help and reading options" data-dialog-return-focus onClick={()=>setHelpOpen(true)} className="flex items-center gap-2 rounded-lg border border-[#D8D3C7] px-3 py-2 text-sm"><CircleHelp size={18}/><span className="hidden sm:inline">Help</span></button><div className="relative">
          <button type="button" data-dialog-return-focus aria-expanded={menuOpen} aria-controls="dashboard-more-menu" onClick={() => setMenuOpen(v => !v)} className="rounded-lg border border-[#D8D3C7] px-3 py-2 text-sm" onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}>More</button>
          {menuOpen && <div id="dashboard-more-menu" className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[#D8D3C7] bg-white p-2 shadow-xl" onKeyDown={e => { if (e.key === 'Escape') setMenuOpen(false); }}>
            <p className="px-3 py-2 text-xs opacity-60">{user?.name}</p><button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[#F6F4EF]" onClick={() => openTool(setProfileOpen)}>My account</button><button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[#F6F4EF]" onClick={() => { setMenuOpen(false); onNavigateToLanding(); }}>Public home</button><button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[#F6F4EF]" onClick={() => openTool(setAssetsOpen)}>Community resources</button><button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[#F6F4EF]" onClick={() => openTool(setMissingOpen)}>Missing persons</button>
            <button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[#F6F4EF]" onClick={()=>{setFieldTarget(null);openTool(setFieldOpen);}}>All planning and field tools</button><button className="block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[#F6F4EF]" onClick={()=>openTool(setSecurityOpen)}>Account security</button>
            {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true') && <details className="px-3 py-2 text-sm"><summary className="cursor-pointer">Demo accounts</summary><div className="mt-2"><QuickRoleSwitcher /></div></details>}
            <button id="logout-btn" className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50" onClick={onLogout || logout}>Log out</button>
          </div>}
        </div></div>
      </div>
    </header>
    <Suspense fallback={<p role="status" className="p-3">Loading tools…</p>}>{fieldOpen&&<FieldTools key={`${user.id}:${fieldTarget?.tool||'default'}`} initialTab={fieldTarget?.tool} context={fieldTarget?.context} onClose={()=>setFieldOpen(false)}/>} {securityOpen&&<SecurityDialog key={user.id} onClose={()=>setSecurityOpen(false)}/>} {helpOpen&&<ConsoleHelp user={user} comfortable={comfortable} onComfortChange={changeComfort} onClose={()=>setHelpOpen(false)}/>}</Suspense>
    {profileOpen && <ProfileDialog key={user.id} onClose={() => setProfileOpen(false)} />}<CivilianAssetsDrawer isOpen={assetsOpen} onClose={() => setAssetsOpen(false)} /><MissingPersonsModal isOpen={missingOpen} onClose={() => setMissingOpen(false)} />
  </>;
}
