import React from 'react';
import { useAuth } from '../context/AuthContext';
import ConnectionBadge from './ConnectionBadge';
import QuickRoleSwitcher from './QuickRoleSwitcher';
import { Shield, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="w-full bg-[#F6F4EF] border-b border-[#D8D3C7] sticky top-0 z-30 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Mission Tag */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#14231F] text-[#F6F4EF] flex items-center justify-center font-mono font-bold text-sm">
            <Shield className="w-4 h-4 text-[#F6F4EF]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm sm:text-base tracking-tight text-[#14231F]">
                DISASTER RESPONSE NETWORK
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EFECE4] border border-[#D8D3C7] text-[#14231F]/80 rounded">
                SIH26206
              </span>
            </div>
            <p className="text-[11px] text-[#14231F]/60 hidden sm:block">
              Integrated Multi-Agency Emergency Dispatch & Alert Platform
            </p>
          </div>
        </div>

        {/* Demo Fast Switcher */}
        <div className="order-last sm:order-none w-full sm:w-auto flex justify-center">
          <QuickRoleSwitcher />
        </div>

        {/* Right Status & User Control */}
        <div className="flex items-center gap-3">
          <ConnectionBadge />

          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-[#D8D3C7]">
              <div className="text-right hidden md:block">
                <div className="text-xs font-semibold text-[#14231F]">{user.name}</div>
                <div className="text-[10px] font-mono uppercase text-[#14231F]/60">{user.role}</div>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-[#14231F]/70 hover:text-[#B23A2E] hover:bg-[#B23A2E]/10 rounded transition-colors"
                title="Log out"
                id="logout-btn"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
