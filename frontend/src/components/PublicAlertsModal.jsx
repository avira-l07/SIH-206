import React from 'react';
import PublicAlertRegistry from '../pages/PublicAlertRegistry';
import { X } from 'lucide-react';

export default function PublicAlertsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative max-w-4xl w-full bg-[#F6F4EF] border border-[#D8D3C7] rounded-lg shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        <div className="absolute top-3 right-3 z-10">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded-full transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <PublicAlertRegistry onBackToLogin={onClose} />
        </div>
      </div>
    </div>
  );
}
