import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ConnectionBadge from './ConnectionBadge';
import QuickRoleSwitcher from './QuickRoleSwitcher';
import CivilianAssetsDrawer from './CivilianAssetsDrawer';
import MissingPersonsModal from './MissingPersonsModal';
import { Shield, LogOut, Truck, UserCheck } from 'lucide-react';

export default function Navbar({ onNavigateToLanding, onLogout }) {
  const { user, logout } = useAuth();
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);

  return (
    <>
      <header className="w-full bg-[#F6F4EF] border-b border-[#D8D3C7] sticky top-0 z-30 px-3 sm:px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3 flex-nowrap overflow-x-auto">
          {/* Brand & Mission Tag */}
          <div
            onClick={onNavigateToLanding}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
            title="Go to Public Landing Page"
          >
            <div className="w-8 h-8 rounded bg-[#14231F] text-[#F6F4EF] flex items-center justify-center font-mono font-bold text-sm shrink-0">
              <Shield className="w-4 h-4 text-[#F6F4EF]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display font-bold text-sm sm:text-base tracking-tight text-[#14231F] whitespace-nowrap group-hover:text-[#1E5FE0] transition-colors">
                  DISASTER RESPONSE NETWORK
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#EFECE4] border border-[#D8D3C7] text-[#14231F]/80 rounded shrink-0">
                  SIH26206
                </span>
              </div>
              <p className="text-[11px] text-[#14231F]/60 hidden lg:block whitespace-nowrap">
                Integrated Multi-Agency Emergency Dispatch & Alert Platform
              </p>
            </div>
          </div>

          {/* Quick Registry Tools */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-xs font-mono shrink-0">
            {onNavigateToLanding && (
              <button
                type="button"
                id="nav-landing-btn"
                onClick={onNavigateToLanding}
                className="px-2 sm:px-2.5 py-1 bg-[#1E5FE0]/10 hover:bg-[#1E5FE0]/20 text-[#1E5FE0] rounded border border-[#1E5FE0]/30 flex items-center gap-1 text-[11px] font-bold transition-colors whitespace-nowrap"
                title="View Public DisasterShield Landing Page"
              >
                <Shield className="w-3.5 h-3.5 text-[#1E5FE0]" />
                <span className="hidden sm:inline">PUBLIC LANDING</span>
              </button>
            )}
            <button
              onClick={() => setAssetsOpen(true)}
              className="px-2 sm:px-2.5 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded border border-[#D8D3C7] flex items-center gap-1 text-[11px] transition-colors whitespace-nowrap"
              title="Civilian Asset & Skill Mobilization Pool"
            >
              <Truck className="w-3.5 h-3.5 text-[#2E6E4E]" />
              <span className="hidden md:inline">COMMUNITY ASSETS</span>
            </button>
            <button
              onClick={() => setMissingOpen(true)}
              className="px-2 sm:px-2.5 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded border border-[#D8D3C7] flex items-center gap-1 text-[11px] transition-colors whitespace-nowrap"
              title="Missing Persons Registry & Shelter Intake Matching"
            >
              <UserCheck className="w-3.5 h-3.5 text-[#B23A2E]" />
              <span className="hidden md:inline">MISSING PERSONS</span>
            </button>
          </div>

          {/* Right Status & User Control */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Demo Fast Switcher */}
            <QuickRoleSwitcher />

            <ConnectionBadge />

            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-[#D8D3C7]">
                <div className="text-right hidden xl:block">
                  <div className="text-xs font-semibold text-[#14231F] leading-tight">{user.name}</div>
                  <div className="text-[10px] font-mono uppercase text-[#14231F]/60 leading-tight">{user.role}</div>
                </div>
                <button
                  onClick={onLogout || logout}
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

      <CivilianAssetsDrawer isOpen={assetsOpen} onClose={() => setAssetsOpen(false)} />
      <MissingPersonsModal isOpen={missingOpen} onClose={() => setMissingOpen(false)} />
    </>
  );
}

