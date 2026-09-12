import React, { useState, useEffect } from 'react';
import {
  Radio,
  Wifi,
  WifiOff,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Terminal,
  X,
  Database,
  UploadCloud,
} from 'lucide-react';
import api from '../services/api';
import {
  enqueueAction,
  getQueuedActions,
  flushQueue,
  isManualOffline,
  setManualOffline,
  subscribeQueue,
} from '../services/offlineQueue';

export default function OfflineSimulationDrawer({ onDataChanged }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(isManualOffline());
  const [queuedItems, setQueuedItems] = useState([]);
  const [smsInput, setSmsInput] = useState('SHTR 104 F0 W1 B15');
  const [ingesting, setIngesting] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lastResult, setLastResult] = useState(null);

  const refreshQueue = async () => {
    const items = await getQueuedActions();
    setQueuedItems(items);
    setIsOffline(isManualOffline());
  };

  const loadLogs = async () => {
    try {
      const res = await api.get('/offline/logs');
      setLogs(res.data.logs || []);
    } catch (err) {
      console.warn('Failed to load offline logs from backend', err.message);
    }
  };

  // Sync with IndexedDB offline queue on mount and drawer open
  useEffect(() => {
    refreshQueue();
    const unsubscribe = subscribeQueue(() => {
      refreshQueue();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
      refreshQueue();
    }
  }, [isOpen]);

  const handleToggleOutage = async () => {
    const nextState = !isOffline;
    setIsOffline(nextState);
    setManualOffline(nextState);

    // If restoring connectivity, trigger batch flush
    if (!nextState) {
      setFlushing(true);
      try {
        await flushQueue();
        await refreshQueue();
        await loadLogs();
        if (onDataChanged) onDataChanged();
      } catch (err) {
        console.error('Failed to sync offline queue on reconnect', err);
      } finally {
        setFlushing(false);
      }
    }
  };

  const handleManualFlush = async () => {
    setFlushing(true);
    try {
      await flushQueue();
      await refreshQueue();
      await loadLogs();
      if (onDataChanged) onDataChanged();
    } finally {
      setFlushing(false);
    }
  };

  const handleSendSMS = async (e) => {
    e?.preventDefault();
    if (!smsInput.trim()) return;

    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      // Queue locally into persistent IndexedDB during outage
      try {
        await enqueueAction({
          type: 'SMS',
          endpoint: '/offline/sms-ingest',
          payload: smsInput.trim(),
        });
        await refreshQueue();
        setLastResult({
          status: 'QUEUED_OFFLINE',
          message: 'Network outage active: SMS telemetry packet saved in IndexedDB storage',
        });
      } catch (err) {
        setLastResult({
          status: 'ERROR',
          message: 'Failed to write to local storage: ' + err.message,
        });
      }
      return;
    }

    setIngesting(true);
    setLastResult(null);
    try {
      const res = await api.post('/offline/sms-ingest', { payload: smsInput.trim() });
      setLastResult({ status: 'SUCCESS', message: res.data.message, applied: res.data.result });
      await loadLogs();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      setLastResult({
        status: 'ERROR',
        message: err.response?.data?.error || 'Failed to process SMS payload',
      });
    } finally {
      setIngesting(false);
    }
  };

  return (
    <>
      {/* Persistent floating trigger button */}
      <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2">
        {isOffline && (
          <div className="px-2.5 py-1 bg-[#B23A2E] text-white text-xs font-mono font-bold rounded flex items-center gap-1.5 shadow-md animate-pulse">
            <WifiOff className="w-3.5 h-3.5" />
            <span>STAGE OUTAGE ACTIVE ({queuedItems.length} QUEUED)</span>
          </div>
        )}

        <button
          id="open-offline-sim-drawer-btn"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#14231F] hover:bg-black text-[#F6F4EF] font-mono text-xs rounded border border-[#D8D3C7] shadow-md transition-colors"
          title="Open Offline Mesh & SMS Gateway Simulator"
        >
          <Terminal className="w-3.5 h-3.5 text-[#2E6E4E]" />
          <span>OFFLINE & RELAY TOOLS {queuedItems.length > 0 ? `(${queuedItems.length})` : ''}</span>
        </button>
      </div>

      {/* Slide-over Drawer / Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded-t sm:rounded max-w-xl w-full p-5 shadow-2xl text-[#14231F] space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#D8D3C7]">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#14231F]" />
                <div>
                  <h3 className="font-display font-bold text-sm uppercase">
                    Local Hub Relay & Offline PWA Tools
                  </h3>
                  <p className="text-[10px] font-mono text-[#14231F]/60">
                    Zero-internet resilience: Service Worker cache + IndexedDB persistent queue
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 bg-[#EFECE4] rounded text-xs hover:bg-[#D8D3C7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Feature 1: Outage Simulator Toggle */}
            <div className="p-3 bg-[#F6F4EF] border border-[#D8D3C7] rounded space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isOffline ? (
                    <WifiOff className="w-4 h-4 text-[#B23A2E]" />
                  ) : (
                    <Wifi className="w-4 h-4 text-[#2E6E4E]" />
                  )}
                  <span className="font-mono text-xs font-bold uppercase text-[#14231F]">
                    Stage Outage Override: {isOffline ? 'OFFLINE (FORCED)' : 'ONLINE (NORMAL)'}
                  </span>
                </div>

                <button
                  type="button"
                  id="toggle-outage-btn"
                  onClick={handleToggleOutage}
                  className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                    isOffline
                      ? 'bg-[#2E6E4E] text-white hover:bg-[#23583e]'
                      : 'bg-[#B23A2E] text-white hover:bg-[#992c21]'
                  }`}
                >
                  {isOffline ? 'RESTORE CONNECTIVITY' : 'TRIGGER OUTAGE SIMULATION'}
                </button>
              </div>

              <p className="text-[11px] font-mono text-[#14231F]/70">
                {isOffline
                  ? `Device is locked offline. ${queuedItems.length} actions held in local IndexedDB storage. Click restore to flush.`
                  : 'Live network link active. Transactions broadcast immediately via WebSocket and local relay hub.'}
              </p>
            </div>

            {/* Feature 2: Local IndexedDB Pending Queue Inspection */}
            {queuedItems.length > 0 && (
              <div className="p-3 bg-[#C97A2B]/10 border border-[#C97A2B]/40 rounded space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#C97A2B]">
                    <Database className="w-3.5 h-3.5" />
                    <span>LOCAL INDEXEDDB PERSISTED QUEUE ({queuedItems.length})</span>
                  </div>
                  {!isOffline && (
                    <button
                      type="button"
                      onClick={handleManualFlush}
                      disabled={flushing}
                      className="px-2.5 py-1 bg-[#14231F] hover:bg-black text-white text-[10px] font-mono font-bold rounded flex items-center gap-1"
                    >
                      <UploadCloud className="w-3 h-3" />
                      <span>{flushing ? 'SYNCING...' : 'FLUSH BATCH NOW'}</span>
                    </button>
                  )}
                </div>

                <div className="max-h-24 overflow-y-auto divide-y divide-[#D8D3C7] text-[10px] font-mono">
                  {queuedItems.map((item) => (
                    <div key={item.id || item.idempotencyKey} className="py-1 flex items-center justify-between">
                      <span className="font-bold text-[#14231F]">
                        [{item.type}] {item.idempotencyKey?.substring(0, 16)}...
                      </span>
                      <span className="text-[#14231F]/60">
                        {new Date(item.queuedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feature 3: SMS Telemetry Gateway Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold uppercase text-[#14231F] flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-[#C97A2B]" />
                  Simulated 2G SMS / Ham Radio Telemetry Box
                </label>
                <span className="text-[10px] font-mono text-[#14231F]/60">SYNTAX PARSER</span>
              </div>

              {/* Sample syntax quick-fill chips */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSmsInput('SHTR 104 F0 W1 B15')}
                  className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded text-[10px] font-mono"
                >
                  Quick: SHTR 104 (B15 Free)
                </button>
                <button
                  type="button"
                  onClick={() => setSmsInput('SHTR 101 F95 W0 B2')}
                  className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded text-[10px] font-mono"
                >
                  Quick: SHTR 101 (F95% Depleted)
                </button>
                <button
                  type="button"
                  onClick={() => setSmsInput('SOS 19.0726 72.8845 FLOOD dialysis Patient trapped')}
                  className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] rounded text-[10px] font-mono"
                >
                  Quick: SOS (Dialysis Beacon)
                </button>
              </div>

              {/* SMS Input form */}
              <form onSubmit={handleSendSMS} className="flex gap-2">
                <input
                  type="text"
                  required
                  value={smsInput}
                  onChange={(e) => setSmsInput(e.target.value)}
                  placeholder="e.g. SHTR 104 F0 W1 B15"
                  className="flex-1 p-2 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-xs font-mono focus:outline-none focus:border-[#14231F]"
                />
                <button
                  type="submit"
                  id="submit-sms-packet-btn"
                  disabled={ingesting}
                  className="px-3.5 py-2 bg-[#14231F] hover:bg-black text-white font-mono text-xs font-bold rounded flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  <span>INGEST</span>
                </button>
              </form>

              {/* Execution Feedback */}
              {lastResult && (
                <div
                  className={`p-2.5 rounded border text-xs font-mono flex items-start gap-2 ${
                    lastResult.status === 'SUCCESS'
                      ? 'bg-[#2E6E4E]/10 border-[#2E6E4E] text-[#2E6E4E]'
                      : lastResult.status === 'QUEUED_OFFLINE'
                      ? 'bg-[#C97A2B]/10 border-[#C97A2B] text-[#C97A2B]'
                      : 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  }`}
                >
                  {lastResult.status === 'SUCCESS' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-1">
                    <div className="font-bold uppercase text-[10px]">{lastResult.status}</div>
                    <div>{lastResult.message}</div>
                    {lastResult.status === 'QUEUED_OFFLINE' && (
                      <div className="pt-1.5">
                        <button
                          type="button"
                          onClick={handleToggleOutage}
                          className="px-3 py-1.5 bg-[#2E6E4E] hover:bg-[#23583e] text-white rounded text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>⚡ Restore Connectivity & Sync to Server Now</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>


            {/* Offline Ingestion Audit Logs */}
            <div className="space-y-1.5 pt-2 border-t border-[#D8D3C7]">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#14231F]">SYNCHRONIZED AUDIT TRAIL</span>
                <button
                  type="button"
                  onClick={loadLogs}
                  className="text-[10px] underline flex items-center gap-0.5 text-[#14231F]/70 hover:text-[#14231F]"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh Logs
                </button>
              </div>

              <div className="max-h-28 overflow-y-auto divide-y divide-[#D8D3C7] border border-[#D8D3C7] rounded bg-[#F6F4EF] text-[11px] font-mono">
                {logs.length === 0 ? (
                  <div className="p-3 text-center text-[#14231F]/50">No sync logs recorded yet</div>
                ) : (
                  logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="p-2 space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] text-[#14231F]/60">
                        <span className="font-bold text-[#14231F]">{log.sourceNode}</span>
                        <span>{new Date(log.receivedAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="font-semibold text-[#14231F] truncate">{log.rawPayload}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
