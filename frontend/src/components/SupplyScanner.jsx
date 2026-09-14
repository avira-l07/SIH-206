import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, CheckCircle2, AlertTriangle, Package, Loader2, ArrowRight, Keyboard, Clock, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { enqueueAction } from '../services/offlineQueue';

export default function SupplyScanner({ isOpen, onClose, user, onSuccess }) {
  const [scannedResult, setScannedResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const html5QrCodeRef = useRef(null);
  const isProcessingRef = useRef(false);

  // Initialize and clean up camera scanner
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setScannedResult(null);
      setErrorMsg(null);
      setManualCode('');
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      // Small timeout to allow DOM container to render
      setTimeout(async () => {
        const readerElement = document.getElementById('qr-reader-container');
        if (!readerElement) return;

        try {
          const qrCodeScanner = new Html5Qrcode('qr-reader-container');
          html5QrCodeRef.current = qrCodeScanner;

          const config = {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0,
          };

          await qrCodeScanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
              if (!isProcessingRef.current) {
                handleCodeScanned(decodedText);
              }
            },
            () => {
              // frame scanned without QR code - normal
            }
          );
          setCameraActive(true);
        } catch (err) {
          console.warn('Camera start warning (using manual fallback):', err);
          setCameraError(err.message || 'Camera access unavailable. Use manual code entry below.');
          setCameraActive(false);
        }
      }, 250);
    } catch (err) {
      setCameraError('Could not initialize camera scanner.');
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
  };

  const handleCodeScanned = async (codeString) => {
    if (!codeString || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setLoading(true);
    setErrorMsg(null);
    setScannedResult(null);

    const trimmed = codeString.trim();

    try {
      // Check if browser is offline
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (isOffline) {
        // Enqueue to IndexedDB offline queue with idempotency protection (Decision 0.5)
        const idempotencyKey = `offline_dist_${user?.id || 'citizen'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await enqueueAction({
          type: 'SUPPLY_DISTRIBUTION',
          endpoint: '/supplies/distributions',
          payload: {
            scannedCode: trimmed,
            quantity: 1,
            citizenId: user?.id,
            idempotencyKey,
          },
        });

        setScannedResult({
          offlineQueued: true,
          itemName: trimmed.split(':')[3]?.replace(/-/g, ' ') || 'Relief Item',
          message: 'Offline pickup logged in local secure storage. Will sync to shelter records when connection is restored.',
        });
        if (onSuccess) onSuccess();
      } else {
        const idempotencyKey = `scan_${user?.id || 'citizen'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const res = await api.post('/supplies/distributions', {
          scannedCode: trimmed,
          quantity: 1,
          idempotencyKey,
        });

        setScannedResult(res.data);
        if (onSuccess) onSuccess(res.data.distribution);
      }
    } catch (err) {
      console.error('Scan submission error:', err);
      const serverErr = err.response?.data?.error || err.message || 'Failed to verify QR code';
      setErrorMsg(serverErr);
    } finally {
      setLoading(false);
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1500);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleCodeScanned(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded max-w-md w-full p-5 shadow-2xl text-[#14231F] font-mono">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#D8D3C7]">
          <div className="flex items-center gap-2 text-[#14231F]">
            <div className="w-7 h-7 rounded bg-[#14231F] text-white flex items-center justify-center">
              <Camera className="w-4 h-4 text-[#4ADE80]" />
            </div>
            <div>
              <h2 className="font-display font-bold text-sm uppercase tracking-tight">
                Scan Supply Pickup
              </h2>
              <p className="text-[10px] text-[#14231F]/60">Relief batch QR code authentication</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[#EFECE4] rounded text-[#14231F]/60 hover:text-[#14231F] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="mt-4 space-y-3">
          <div className="relative bg-[#14231F] rounded overflow-hidden min-h-[240px] flex flex-col items-center justify-center text-white">
            <div id="qr-reader-container" className="w-full h-full" />

            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-[#14231F]/90">
                <Camera className="w-8 h-8 text-white/40 mb-2" />
                <p className="text-xs text-white/80 font-bold">Camera Scan Ready</p>
                <p className="text-[10px] text-white/60 max-w-xs mt-1">
                  {cameraError || 'Align the QR code printed on the relief crate or sign within the viewfinder.'}
                </p>
                {cameraError && (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-3 px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-[10px] flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Camera</span>
                  </button>
                )}
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-[#14231F]/80 flex flex-col items-center justify-center text-white gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#4ADE80]" />
                <span className="text-xs font-bold">Verifying Batch & Quota...</span>
              </div>
            )}
          </div>

          {/* Success Card */}
          {scannedResult && (
            <div className="p-3 bg-[#EBF7EE] border border-[#A3D9B1] rounded text-xs text-[#1E6B37] space-y-1.5 animate-fade-in">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-[#1E6B37]" />
                <span>Pickup Successfully Registered!</span>
              </div>
              <p className="text-[11px] text-[#1E6B37]/90">
                {scannedResult.message || `You collected 1 unit of ${scannedResult.distribution?.itemName || 'supplies'} from ${scannedResult.distribution?.shelter?.name || 'the shelter'}.`}
              </p>
              <div className="text-[10px] text-[#1E6B37]/70 pt-1 border-t border-[#A3D9B1]/50 flex justify-between">
                <span>Personal Log Updated</span>
                <span>Anti-Hoarding Cooldown Active (12h)</span>
              </div>
            </div>
          )}

          {/* Error / Anti-Hoarding Warning Card */}
          {errorMsg && (
            <div className="p-3 bg-[#FDF2F0] border border-[#F0A8A0] rounded text-xs text-[#B23A2E] space-y-1 animate-fade-in">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 text-[#B23A2E]" />
                <span>Scan Disallowed</span>
              </div>
              <p className="text-[11px] text-[#B23A2E]/90">{errorMsg}</p>
            </div>
          )}

          {/* Manual Code Input Fallback (Always Visible - Decision 0.4) */}
          <div className="pt-3 border-t border-[#D8D3C7]">
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#14231F]/80 mb-1.5">
              <Keyboard className="w-3.5 h-3.5 text-[#14231F]/60" />
              <span>Can't scan? Type code printed on batch:</span>
            </div>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. SUPPLY:203:34:insulin-glucose"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 p-2 bg-[#FAF8F5] border border-[#D8D3C7] rounded text-xs font-mono focus:outline-none focus:border-[#14231F]"
              />
              <button
                type="submit"
                disabled={loading || !manualCode.trim()}
                className="px-3 py-2 bg-[#14231F] hover:bg-black text-white text-xs font-bold rounded flex items-center gap-1 disabled:opacity-50 transition-colors shrink-0"
              >
                <span>Claim</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </form>
            <p className="text-[10px] text-[#14231F]/50 mt-1">
              Format: SUPPLY:&lt;shelterId&gt;:&lt;supplyRequestId&gt;:&lt;item&gt;
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-[#D8D3C7] flex items-center justify-between text-[10px] text-[#14231F]/60">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> 1 claim per item / 12h cooldown
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#EFECE4] hover:bg-[#D8D3C7] text-[#14231F] rounded font-bold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
