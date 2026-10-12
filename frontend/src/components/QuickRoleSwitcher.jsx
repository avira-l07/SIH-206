import React from 'react';
import { useAuth } from '../context/AuthContext';
import { User, ShieldAlert, LifeBuoy } from 'lucide-react';

export default function QuickRoleSwitcher() {
  const { role, quickSwitchRole } = useAuth();

  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  if (!(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true')) return null;
  const switchRole = async (id) => {
    setBusy(true); setError('');
    try { await quickSwitchRole(id); }
    catch (err) { setError(err.response?.data?.error || 'Demo account unavailable'); }
    finally { setBusy(false); }
  };
  const roles = [
    { id: 'CITIZEN', label: 'Citizen', icon: User },
    { id: 'VOLUNTEER', label: 'Volunteer', icon: LifeBuoy },
    { id: 'ADMIN', label: 'NDMA Admin', icon: ShieldAlert },
  ];

  return (
    <div className="flex items-center gap-1 bg-[#EFECE4] p-0.5 border border-[#D8D3C7] rounded">
      <span className="text-[10px] font-mono uppercase text-[#14231F]/60 px-2 py-0.5 select-none hidden sm:inline">
        DEMO VIEW:
      </span>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      {roles.map(({ id, label, icon: Icon }) => {
        const isActive = role === id;
        return (
          <button
            key={id}
            id={`role-switch-${id.toLowerCase()}`}
            disabled={busy}
            onClick={() => switchRole(id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors rounded ${
              isActive
                ? 'bg-[#14231F] text-[#F6F4EF] shadow-none'
                : 'text-[#14231F]/70 hover:text-[#14231F] hover:bg-[#D8D3C7]/40'
            }`}
            title={`Switch to ${label} role for demo`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
