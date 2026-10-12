import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { WifiOff, RefreshCw, UploadCloud } from 'lucide-react';
import { subscribeQueue, flushQueue, isManualOffline } from '../services/offlineQueue';

export default function ConnectionBadge() {
  const { isConnected, isReconnecting } = useSocket();
  const [queuedCount, setQueuedCount] = useState(0);
  const [manualOffline, setManualOfflineState] = useState(isManualOffline());
  const [flushing, setFlushing] = useState(false);
  const [feedback,setFeedback] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeQueue((count) => {
      setQueuedCount(count);
      setManualOfflineState(isManualOffline());
    });
    return unsubscribe;
  }, []);

  const handleManualFlush = async () => {
    setFlushing(true);setFeedback('');
    try {
      const result = await flushQueue();
      setFeedback(result.error || result.errors?.join('; ') || result.reason || (result.skipped ? 'Reports remain saved on this device.' : `${result.syncedCount||0} reports synchronized. ${result.failedCount||0} remain saved.`));
    } catch {setFeedback('Could not synchronize. Your reports remain saved; retry when connected.');
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 relative">
      {/* Primary Connectivity Badge */}
      {manualOffline ? (
        <div
          id="connection-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#B23A2E]/40 bg-[#B23A2E]/15 text-[#B23A2E] rounded"
          title="Offline test mode is active. Reports remain on this device until synchronization."
        >
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span className="font-mono tracking-tight font-bold">
            Offline mode {queuedCount > 0 ? `(${queuedCount} QUEUED)` : ''}
          </span>
        </div>
      ) : isReconnecting ? (
        <div
          id="connection-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#C97A2B]/40 bg-[#C97A2B]/10 text-[#C97A2B] rounded"
          title="Reconnecting to local relay hub"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span className="font-mono tracking-tight">Connecting…</span>
        </div>
      ) : isConnected ? (
        <div
          id="connection-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#2E6E4E]/40 bg-[#2E6E4E]/10 text-[#2E6E4E] rounded"
          title="Real-time WebSocket connection active to local network relay"
        >
          <span className="w-2 h-2 rounded-full bg-[#2E6E4E] inline-block animate-pulse"></span>
          <span className="font-mono tracking-tight">Live</span>
        </div>
      ) : (
        <div
          id="connection-status-badge"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#B23A2E]/40 bg-[#B23A2E]/10 text-[#B23A2E] rounded"
          title="Disconnected from local relay network"
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span className="font-mono tracking-tight">
            OFFLINE {queuedCount > 0 ? `(${queuedCount} QUEUED)` : ''}
          </span>
        </div>
      )}

      {/* Actionable Sync Button when items are stored in IndexedDB */}
      {queuedCount > 0 && !manualOffline && (
        <button
          type="button"
          onClick={handleManualFlush}
          disabled={flushing}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono font-bold bg-[#14231F] hover:bg-black text-[#F6F4EF] rounded border border-[#D8D3C7] shadow-xs transition-colors cursor-pointer"
          title="Flush queued offline items to relay hub immediately"
        >
          <UploadCloud className={`w-3 h-3 ${flushing ? 'animate-bounce text-[#C97A2B]' : 'text-[#2E6E4E]'}`} />
          <span>{flushing?'Syncing…':`Sync saved (${queuedCount})`}</span>
        </button>
      )}
      {feedback&&<div role="status" className="absolute top-full right-0 mt-2 z-50 w-64 rounded-lg border bg-white p-3 shadow-lg text-sm">{feedback}<button className="block underline" onClick={()=>setFeedback('')}>Dismiss</button></div>}
    </div>
  );
}
