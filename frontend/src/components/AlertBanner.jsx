import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, X, ChevronRight } from 'lucide-react';

export default function AlertBanner({ alerts = [], onSelectAlert }) {
  const [dismissedIds, setDismissedIds] = useState([]);

  const activeAlerts = alerts.filter(
    (a) => a.active && !dismissedIds.includes(a.id)
  );

  if (activeAlerts.length === 0) {
    return null;
  }

  // Display most critical alert prominently
  const currentAlert = activeAlerts[0];
  const isCritical = currentAlert.severity === 'CRITICAL';

  const bgClasses = isCritical
    ? 'bg-[#B23A2E] text-[#FFFFFF]'
    : 'bg-[#C97A2B] text-[#FFFFFF]';

  return (
    <aside
      aria-label="Disaster Alerts"
      className={`w-full ${bgClasses} px-4 py-2.5 transition-all border-b border-black/10`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {isCritical ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-pulse text-white" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-white" />
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate">
            <span className="font-mono font-bold text-xs uppercase px-1.5 py-0.5 bg-black/20 rounded tracking-wider">
              {currentAlert.severity} // {currentAlert.hazardType}
            </span>
            <span className="font-bold">{currentAlert.region}:</span>
            <span className="opacity-95 truncate">{currentAlert.message}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {activeAlerts.length > 1 && (
            <span className="text-xs font-mono bg-black/20 px-2 py-0.5 rounded">
              +{activeAlerts.length - 1} more
            </span>
          )}

          {onSelectAlert && (
            <button
              onClick={() => onSelectAlert(currentAlert)}
              className="text-xs underline flex items-center gap-0.5 hover:opacity-80"
            >
              Focus Map <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => setDismissedIds((prev) => [...prev, currentAlert.id])}
            className="p-1 hover:bg-black/20 rounded transition-colors"
            title="Acknowledge alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
