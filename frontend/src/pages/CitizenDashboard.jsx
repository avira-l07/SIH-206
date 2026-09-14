import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import SOSButton from '../components/SOSButton';
import ShelterList from '../components/ShelterList';
import HazardReportModal from '../components/HazardReportModal';
import HazardConfirmationPrompt from '../components/HazardConfirmationPrompt';
import SafetyStatusWidget from '../components/SafetyStatusWidget';
import OfflineSimulationDrawer from '../components/OfflineSimulationDrawer';
import SupplyScanner from '../components/SupplyScanner';
import { AlertTriangle, CheckCircle, Clock, ShieldCheck, Camera, Radio, AlertOctagon, HelpCircle, Package, QrCode } from 'lucide-react';

export default function CitizenDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [hazardReports, setHazardReports] = useState([]);
  const [mySOSList, setMySOSList] = useState([]);
  const [focusCoords, setFocusCoords] = useState(null);
  const liveGpsAcquired = React.useRef(false);
  const [userCoords, setUserCoords] = useState(
    typeof user?.lat === 'number' && typeof user?.lng === 'number'
      ? { lat: user.lat, lng: user.lng }
      : { lat: 20.5937, lng: 78.9629 }
  );
  const [hazardModalOpen, setHazardModalOpen] = useState(false);
  const [supplyScannerOpen, setSupplyScannerOpen] = useState(false);
  const [myPickups, setMyPickups] = useState([]);
  const [loadingPickups, setLoadingPickups] = useState(false);

  // Synchronize with authenticated user's saved GPS ONLY if live GPS hasn't been acquired yet
  useEffect(() => {
    if (!liveGpsAcquired.current && typeof user?.lat === 'number' && typeof user?.lng === 'number') {
      setUserCoords({ lat: user.lat, lng: user.lng });
    }
  }, [user]);

  const fetchMyPickups = async () => {
    try {
      setLoadingPickups(true);
      const res = await api.get('/supplies/distributions/mine');
      setMyPickups(res.data.distributions || []);
    } catch (err) {
      console.warn('Could not load citizen pickups:', err.message);
    } finally {
      setLoadingPickups(false);
    }
  };

  // Fetch initial data
  const fetchData = async () => {
    try {
      const [alertsRes, sheltersRes, sosRes, hazardsRes] = await Promise.all([
        api.get('/alerts'),
        api.get('/shelters'),
        api.get('/sos/my').catch(() => ({ data: { requests: [] } })),
        api.get('/hazards').catch(() => ({ data: { reports: [] } })),
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setShelters(sheltersRes.data.shelters || []);
      setMySOSList(sosRes.data.requests || []);
      setHazardReports(hazardsRes.data.reports || []);
      fetchMyPickups();
    } catch (err) {
      console.error('Error loading citizen dashboard data', err);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-detect browser GPS on mount and prioritize over stored DB coords
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          liveGpsAcquired.current = true;
          setUserCoords(coords);
          // Persist coordinates silently so citizen receives radius alerts
          api.patch('/auth/location', coords).catch(() => {});
        },
        (err) => console.log('Browser geolocation notice:', err.message),
        { timeout: 8000, enableHighAccuracy: true }
      );
    }
  }, []);

  // Socket.io live listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });

    socket.on('alert:deactivated', (deactivated) => {
      setAlerts((prev) => prev.filter((a) => a.id !== deactivated.id));
    });

    socket.on('sos:status_changed', (updatedSOS) => {
      setMySOSList((prev) =>
        prev.map((s) => (s.id === updatedSOS.id ? updatedSOS : s))
      );
    });

    socket.on('shelter:occupancy_changed', (updatedShelter) => {
      setShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
      );
    });

    socket.on('shelter:audit_updated', (updatedShelter) => {
      setShelters((prev) =>
        prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
      );
    });

    socket.on('hazard:new', (newReport) => {
      setHazardReports((prev) => [newReport, ...prev.filter((r) => r.id !== newReport.id)]);
    });

    socket.on('hazard:confirmed', (updatedReport) => {
      setHazardReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    socket.on('hazard:tier_changed', (updatedReport) => {
      setHazardReports((prev) =>
        prev.map((r) => (r.id === updatedReport.id ? updatedReport : r))
      );
    });

    socket.on('supply:distributed', (data) => {
      if (data?.distribution && data.distribution.citizenId === user?.id) {
        setMyPickups((prev) => [data.distribution, ...prev.filter((p) => p.id !== data.distribution.id)]);
      }
    });

    return () => {
      socket.off('alert:new');
      socket.off('alert:deactivated');
      socket.off('sos:status_changed');
      socket.off('shelter:occupancy_changed');
      socket.off('shelter:audit_updated');
      socket.off('hazard:new');
      socket.off('hazard:confirmed');
      socket.off('hazard:tier_changed');
      socket.off('supply:distributed');
    };
  }, [socket]);

  const handleSOSCreated = (newSOS) => {
    setMySOSList((prev) => [newSOS, ...prev]);
    setFocusCoords([newSOS.lat, newSOS.lng]);
  };

  const handleHazardReportCreated = (newReport) => {
    setHazardReports((prev) => [newReport, ...prev]);
    setFocusCoords([newReport.lat, newReport.lng]);
  };

  const handleConfirmHazard = async (reportId) => {
    try {
      const res = await api.post(`/hazards/${reportId}/confirm`);
      setHazardReports((prev) =>
        prev.map((r) => (r.id === reportId ? res.data.report : r))
      );
      alert(`Report confirmed! Current confidence tier: ${res.data.report.confidenceTier}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit confirmation');
    }
  };

  const handleShelterUpdated = (updatedShelter) => {
    setShelters((prev) =>
      prev.map((s) => (s.id === updatedShelter.id ? updatedShelter : s))
    );
  };

  const handleCitizenVerify = async (sosId, confirmed) => {
    try {
      const res = await api.patch(`/sos/${sosId}/citizen-verify`, { confirmed });
      setMySOSList((prev) => prev.map((s) => (s.id === sosId ? res.data.sos : s)));
      if (confirmed) {
        alert('Rescue verified and confirmed complete. We are glad you are safe!');
      } else {
        alert('Distress ticket REOPENED with URGENT priority. Responders alerted immediately!');
      }
    } catch (err) {
      console.error('Error verifying rescue closure:', err);
      alert(err.response?.data?.error || 'Failed to verify rescue closure');
    }
  };

  const handleUpdateLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setFocusCoords([coords.lat, coords.lng]);
        try {
          await api.patch('/auth/location', coords);
          alert(`Your GPS location was updated successfully (${coords.lat.toFixed(4)}°N, ${coords.lng.toFixed(4)}°E). Precision alert radius matching is now active!`);
        } catch (err) {
          console.error('Failed to sync location with server:', err);
        }
      },
      (err) => {
        alert('Could not acquire your current location: ' + err.message);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const activeSOS = mySOSList.find((s) => s.status !== 'RESOLVED');
  // Pending citizen rescue closure loop (Item 1.3)
  const pendingVerificationSOS = mySOSList.find(
    (s) => s.status === 'RESOLVED' && s.citizenConfirmedResolved !== true
  );
  // Successfully verified closed
  const verifiedClosedSOS = mySOSList.find(
    (s) => s.status === 'RESOLVED' && s.citizenConfirmedResolved === true
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-61px)]">
      {/* Real-time Alert Banner */}
      <AlertBanner
        alerts={alerts}
        onSelectAlert={(alert) => setFocusCoords([alert.lat, alert.lng])}
      />

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 pb-16 flex-1 flex flex-col gap-4">
        {/* Citizen Emergency Header & SOS Status */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#FFFFFF] border border-[#D8D3C7] p-4 rounded shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2E6E4E]"></span>
              <h1 className="font-display font-bold text-lg sm:text-xl text-[#14231F] tracking-tight">
                CITIZEN RESILIENCE & SOS CONSOLE
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <p className="text-xs sm:text-sm text-[#14231F]/70">
                Welcome {user?.name || 'Citizen'} • GPS: {userCoords ? `${userCoords.lat.toFixed(4)}°N, ${userCoords.lng.toFixed(4)}°E` : 'Auto-detecting...'}
              </p>
              <button
                type="button"
                id="citizen-update-gps-btn"
                onClick={handleUpdateLocation}
                className="px-2 py-0.5 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] text-[10px] font-mono rounded font-semibold transition-colors"
                title="Acquire current browser GPS coordinates and sync with alert radius delivery system"
              >
                📍 Update My GPS
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              id="citizen-supply-scan-btn"
              onClick={() => setSupplyScannerOpen(true)}
              className="flex items-center gap-1.5 px-4 py-3 bg-[#14231F] hover:bg-black text-white font-display font-bold text-xs sm:text-sm rounded transition-colors whitespace-nowrap shrink-0 shadow-xs"
              title="Scan relief item QR code at shelter pickup station"
            >
              <Package className="w-4 h-4 text-[#4ADE80]" />
              <span>SCAN SUPPLY PICKUP</span>
            </button>

            <button
              id="report-hazard-btn"
              onClick={() => setHazardModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-3 bg-[#EFECE4] hover:bg-[#D8D3C7] border border-[#D8D3C7] text-[#14231F] font-display font-bold text-xs sm:text-sm rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Camera className="w-4 h-4 text-[#C97A2B]" />
              <span>REPORT HAZARD</span>
            </button>

            <SOSButton onSOSCreated={handleSOSCreated} defaultCoords={userCoords} />
          </div>
        </div>

        {/* Nearby Peer-Confirmation Prompt (Amber/Grey hazard verification) */}
        <HazardConfirmationPrompt
          reports={hazardReports}
          userCoords={userCoords}
          onConfirmed={(updated) =>
            setHazardReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
          }
        />

        {/* Active Emergency Signal Tracker */}
        {activeSOS && (
            <div
              id="active-sos-tracker"
              className={`p-4 rounded border ${
                activeSOS.status === 'PENDING' || activeSOS.status === 'VERIFIED'
                  ? 'bg-[#B23A2E]/10 border-[#B23A2E] text-[#B23A2E]'
                  : 'bg-[#C97A2B]/10 border-[#C97A2B] text-[#C97A2B]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {activeSOS.status === 'PENDING' || activeSOS.status === 'VERIFIED' ? (
                    <Clock className="w-6 h-6 flex-shrink-0 animate-pulse mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-6 h-6 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-mono text-xs uppercase font-bold tracking-wider">
                      {activeSOS.status === 'PENDING'
                        ? '● SOS BROADCAST ACTIVE — AWAITING VOLUNTEER DISPATCH'
                        : activeSOS.status === 'VERIFIED'
                        ? '● COMMAND VERIFIED — DISPATCH IN PROGRESS'
                        : '✓ VOLUNTEER ASSIGNED & EN ROUTE'}
                    </div>
                    <div className="text-sm font-semibold text-[#14231F] mt-1">
                      &ldquo;{activeSOS.message}&rdquo;
                    </div>
                  <div className="text-xs font-mono text-[#14231F]/70 mt-0.5">
                    Signal Transmitted at {new Date(activeSOS.createdAt).toLocaleTimeString()} • Coordinates: {activeSOS.lat.toFixed(4)}, {activeSOS.lng.toFixed(4)}
                  </div>
                  {activeSOS.vulnerabilityTags && activeSOS.vulnerabilityTags.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {activeSOS.vulnerabilityTags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.2 rounded border border-current font-mono text-[10px] uppercase font-bold bg-white/70">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <span className="font-mono text-xs font-bold px-2 py-1 bg-white/80 border border-current rounded uppercase">
                  STATUS: {activeSOS.status}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Rescue Closure Loop: Action Required by Citizen (Item 1.3) */}
        {pendingVerificationSOS && (
          <div
            id="rescue-verification-card"
            className="p-4 bg-[#C97A2B]/10 border-2 border-[#C97A2B] rounded shadow-md text-xs font-mono space-y-3 animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#C97A2B] font-bold text-sm font-display uppercase tracking-wide">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
                <span>ACTION REQUIRED // RESCUE CLOSURE CONFIRMATION</span>
              </div>
              <span className="px-2 py-0.5 bg-[#C97A2B] text-white rounded text-[10px] font-bold">
                AWAITING CITIZEN CONFIRMATION
              </span>
            </div>

            <div>
              <p className="text-sm font-display font-semibold text-[#14231F]">
                Responders marked your emergency signal &ldquo;{pendingVerificationSOS.message}&rdquo; as RESOLVED.
              </p>
              <p className="text-xs text-[#14231F]/80 mt-0.5">
                Has emergency assistance arrived and is everyone safe? If help has not reached you, you can reopen this ticket immediately with URGENT priority.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                id="verify-rescue-yes-btn"
                onClick={() => handleCitizenVerify(pendingVerificationSOS.id, true)}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-bold text-xs rounded transition-all shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>YES, I AM SAFE // CONFIRM RESCUE COMPLETE</span>
              </button>

              <button
                type="button"
                id="verify-rescue-no-btn"
                onClick={() => handleCitizenVerify(pendingVerificationSOS.id, false)}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#B23A2E] hover:bg-[#9E2E23] text-white font-display font-bold text-xs rounded transition-all shadow-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>NO, STILL TRAPPED // REOPEN WITH URGENT PRIORITY</span>
              </button>
            </div>
          </div>
        )}

        {/* Verified Closed Banner */}
        {!activeSOS && !pendingVerificationSOS && verifiedClosedSOS && (
          <div className="p-3 bg-[#2E6E4E]/10 border border-[#2E6E4E] text-[#2E6E4E] rounded flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              <span>Prior distress signal at {verifiedClosedSOS.lat.toFixed(3)}°N has been verified closed by you. All responder units stood down.</span>
            </div>
          </div>
        )}

        {/* Map-First Split View (65% Map / 35% Panel) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* Map Hero (65% width) */}
          <div className="lg:col-span-8 flex flex-col min-h-[480px]">
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#14231F]/70">
              <span>SITUATION MAP (60% VIEWPORT)</span>
              <span>GREY: UNCONFIRMED • AMBER: CONFIRMED • RED: VERIFIED / SOS</span>
            </div>
            <MapView
              alerts={alerts}
              sosRequests={mySOSList}
              shelters={shelters}
              hazardReports={hazardReports}
              userCoords={userCoords}
              focusCoords={focusCoords}
              onConfirmHazard={handleConfirmHazard}
              userRole="CITIZEN"
            />
          </div>

          {/* Side Dock: Safety Status, Shelter Finder & Protocol */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Mark Myself Safe Broadcast & Relative Safety Lookup */}
            <SafetyStatusWidget />

            {/* My Claimed Relief Supplies Log (Anti-Hoarding Personal Ledger) */}
            <div className="bg-[#FFFFFF] border border-[#D8D3C7] rounded p-3 text-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-[#D8D3C7] pb-2">
                <div className="flex items-center gap-1.5 font-display font-bold uppercase text-[#14231F]">
                  <Package className="w-4 h-4 text-[#2E6E4E]" />
                  <span>My Relief Pickups</span>
                  <span className="px-1.5 py-0.2 bg-[#EFECE4] rounded text-[10px] font-mono">
                    {myPickups.length}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSupplyScannerOpen(true)}
                  className="px-2 py-0.5 bg-[#14231F] hover:bg-black text-white text-[10px] font-mono rounded font-semibold flex items-center gap-1"
                >
                  <QrCode className="w-3 h-3 text-[#4ADE80]" />
                  <span>Scan QR</span>
                </button>
              </div>

              {loadingPickups ? (
                <div className="p-3 text-center text-[11px] font-mono text-[#14231F]/60">
                  Loading personal pickup history...
                </div>
              ) : myPickups.length === 0 ? (
                <div className="p-3 text-center text-[11px] font-mono text-[#14231F]/60 bg-[#F6F4EF] rounded border border-dashed border-[#D8D3C7]">
                  No supplies claimed yet. Scan a batch QR code at any relief shelter station.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {myPickups.map((p) => {
                    const pickupTime = new Date(p.distributedAt).getTime();
                    const now = Date.now();
                    const hoursSince = (now - pickupTime) / (1000 * 60 * 60);
                    const isCooldownActive = hoursSince < 12;
                    const nextEligibleDate = new Date(pickupTime + 12 * 60 * 60 * 1000);
                    const minsRemaining = Math.max(1, Math.round((nextEligibleDate.getTime() - now) / 60000));
                    const remH = Math.floor(minsRemaining / 60);
                    const remM = minsRemaining % 60;
                    const remStr = remH > 0 ? `${remH}h ${remM}m` : `${remM}m`;

                    return (
                      <div
                        key={p.id}
                        className="p-2 bg-[#F6F4EF] border border-[#D8D3C7] rounded text-left space-y-1"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-display font-bold text-xs text-[#14231F]">
                            {p.itemName}
                          </span>
                          <span className="px-1.5 py-0.2 bg-[#2E6E4E]/15 text-[#2E6E4E] border border-[#2E6E4E]/30 rounded text-[9px] font-mono font-bold shrink-0">
                            +{p.quantity} {p.supplyRequest?.unit || 'unit'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-mono text-[#14231F]/70">
                          <span>{p.shelter?.name || 'Relief Camp'}</span>
                          <span>{new Date(p.distributedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className="pt-0.5">
                          {isCooldownActive ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#C97A2B]/10 border border-[#C97A2B]/30 text-[#C97A2B] rounded text-[9px] font-mono">
                              <Clock className="w-2.5 h-2.5" />
                              <span>12h Cooldown (Eligible in {remStr})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#2E6E4E]/10 border border-[#2E6E4E]/30 text-[#2E6E4E] rounded text-[9px] font-mono">
                              <CheckCircle className="w-2.5 h-2.5" />
                              <span>Eligible for next pickup</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex-1">
              <ShelterList
                shelters={shelters}
                userCoords={userCoords}
                onSelectShelter={(shelter) => setFocusCoords([shelter.lat, shelter.lng])}
                onShelterUpdated={handleShelterUpdated}
              />
            </div>

            {/* Quick Emergency Protocol Guidelines */}
            <div className="p-3 bg-[#FFFFFF] border border-[#D8D3C7] rounded text-xs space-y-2">
              <h4 className="font-display font-bold uppercase text-[#14231F] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#C97A2B]" />
                Emergency Safety Rules
              </h4>
              <ul className="list-disc pl-4 space-y-1 text-[#14231F]/80 font-mono text-[11px]">
                <li>Avoid floodwater; 15cm of fast-flowing water can knock you down.</li>
                <li>Stay off powerlines and flooded electrical switchboards.</li>
                <li>Verify ground hazards to help emergency teams route relief.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Hazard Report In-App Camera Modal */}
      <HazardReportModal
        isOpen={hazardModalOpen}
        onClose={() => setHazardModalOpen(false)}
        onReportCreated={handleHazardReportCreated}
        defaultCoords={userCoords}
      />

      {/* Supply Pickup QR Scanner Modal */}
      <SupplyScanner
        isOpen={supplyScannerOpen}
        onClose={() => setSupplyScannerOpen(false)}
        user={user}
        onSuccess={() => {
          fetchMyPickups();
          fetchData();
        }}
      />

      {/* Simulated Offline Relay & SMS Gateway Drawer */}
      <OfflineSimulationDrawer onDataChanged={fetchData} />
    </div>
  );
}
