import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import MapView from '../components/MapView';
import AlertBanner from '../components/AlertBanner';
import { calculateDistanceKm } from '../services/haversine';
import { LifeBuoy, AlertCircle, CheckCircle2, Clock, MapPin, Phone, Shield, ArrowUpRight } from 'lucide-react';

export default function VolunteerDashboard() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [alerts, setAlerts] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [sosList, setSosList] = useState([]);
  const [activeTab, setActiveTab] = useState('PENDING'); // PENDING, IN_PROGRESS, RESOLVED
  const [focusCoords, setFocusCoords] = useState(null);
  const [volunteerCoords, setVolunteerCoords] = useState({ lat: 19.0596, lng: 72.8295 }); // Bandra default
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [alertsRes, sheltersRes, sosRes] = await Promise.all([
          api.get('/alerts'),
          api.get('/shelters'),
          api.get('/sos'),
        ]);
        setAlerts(alertsRes.data.alerts || []);
        setShelters(sheltersRes.data.shelters || []);
        setSosList(sosRes.data.requests || []);
      } catch (err) {
        console.error('Error fetching volunteer console data', err);
      }
    }
    loadData();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setVolunteerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => console.log('Using default volunteer coordinates')
      );
    }
  }, []);

  // Real-time socket listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('sos:created', (newSOS) => {
      setSosList((prev) => [newSOS, ...prev.filter((s) => s.id !== newSOS.id)]);
    });

    socket.on('sos:status_changed', (updatedSOS) => {
      setSosList((prev) =>
        prev.map((s) => (s.id === updatedSOS.id ? updatedSOS : s))
      );
    });

    socket.on('alert:new', (newAlert) => {
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.id !== newAlert.id)]);
    });

    return () => {
      socket.off('sos:created');
      socket.off('sos:status_changed');
      socket.off('alert:new');
    };
  }, [socket]);

  const handleAssignSOS = async (sosId) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/sos/${sosId}/assign`);
      setSosList((prev) =>
        prev.map((s) => (s.id === sosId ? res.data.sos : s))
      );
    } catch (err) {
      console.error('Failed to assign SOS', err);
      alert(err.response?.data?.error || 'Failed to claim SOS assignment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveSOS = async (sosId) => {
    setActionLoading(true);
    try {
      const res = await api.patch(`/sos/${sosId}/resolve`);
      setSosList((prev) =>
        prev.map((s) => (s.id === sosId ? res.data.sos : s))
      );
    } catch (err) {
      console.error('Failed to resolve SOS', err);
      alert(err.response?.data?.error || 'Failed to resolve SOS');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCalls = sosList.filter((s) => s.status === 'PENDING');
  const inProgressCalls = sosList.filter((s) => s.status === 'IN_PROGRESS');
  const resolvedCalls = sosList.filter((s) => s.status === 'RESOLVED');

  const displayedCalls =
    activeTab === 'PENDING'
      ? pendingCalls
      : activeTab === 'IN_PROGRESS'
      ? inProgressCalls
      : resolvedCalls;

  return (
    <div className="flex flex-col min-h-[calc(100vh-61px)]">
      <AlertBanner
        alerts={alerts}
        onSelectAlert={(a) => setFocusCoords([a.lat, a.lng])}
      />

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 flex-1 flex flex-col gap-4">
        {/* Header Stats Strip */}
        <div className="bg-[#FFFFFF] border border-[#D8D3C7] p-4 rounded flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <LifeBuoy className="w-5 h-5 text-[#2E6E4E]" />
              <h1 className="font-display font-bold text-lg sm:text-xl text-[#14231F] tracking-tight">
                FIELD DISPATCH CONSOLE // RESCUE VOLUNTEER
              </h1>
            </div>
            <p className="text-xs text-[#14231F]/70 font-mono mt-0.5">
              Responder ID: {user?.name || 'Field Unit'} • GPS: {volunteerCoords.lat.toFixed(4)}°N, {volunteerCoords.lng.toFixed(4)}°E
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 bg-[#B23A2E]/10 border border-[#B23A2E]/30 rounded text-[#B23A2E] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#B23A2E] animate-ping"></span>
              <span className="font-bold tabular-nums">{pendingCalls.length}</span> PENDING SOS
            </div>
            <div className="px-3 py-1.5 bg-[#C97A2B]/10 border border-[#C97A2B]/30 rounded text-[#C97A2B]">
              <span className="font-bold tabular-nums">{inProgressCalls.length}</span> ACTIVE DISPATCH
            </div>
            <div className="px-3 py-1.5 bg-[#2E6E4E]/10 border border-[#2E6E4E]/30 rounded text-[#2E6E4E]">
              <span className="font-bold tabular-nums">{resolvedCalls.length}</span> RESOLVED
            </div>
          </div>
        </div>

        {/* Map-First Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* Map (65% width) */}
          <div className="lg:col-span-8 flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-1 text-xs font-mono text-[#14231F]/70">
              <span>ACTIVE SITUATIONAL INCIDENT MAP</span>
              <span>CLICK ANY MARKER FOR ONE-TOUCH DISPATCH ACTION</span>
            </div>
            <MapView
              alerts={alerts}
              sosRequests={sosList}
              shelters={shelters}
              userCoords={volunteerCoords}
              focusCoords={focusCoords}
              onAssignSOS={handleAssignSOS}
              onResolveSOS={handleResolveSOS}
              userRole="VOLUNTEER"
            />
          </div>

          {/* Dispatch Side Panel (35% width) */}
          <div className="lg:col-span-4 flex flex-col bg-[#FFFFFF] border border-[#D8D3C7] rounded overflow-hidden h-[600px] lg:h-auto">
            {/* Tabs */}
            <div className="grid grid-cols-3 border-b border-[#D8D3C7] bg-[#EFECE4] text-xs font-mono">
              <button
                id="tab-pending"
                onClick={() => setActiveTab('PENDING')}
                className={`py-2.5 text-center font-bold transition-colors ${
                  activeTab === 'PENDING'
                    ? 'bg-[#FFFFFF] text-[#B23A2E] border-b-2 border-[#B23A2E]'
                    : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                UNASSIGNED ({pendingCalls.length})
              </button>
              <button
                id="tab-in-progress"
                onClick={() => setActiveTab('IN_PROGRESS')}
                className={`py-2.5 text-center font-bold transition-colors ${
                  activeTab === 'IN_PROGRESS'
                    ? 'bg-[#FFFFFF] text-[#C97A2B] border-b-2 border-[#C97A2B]'
                    : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                DISPATCHED ({inProgressCalls.length})
              </button>
              <button
                id="tab-resolved"
                onClick={() => setActiveTab('RESOLVED')}
                className={`py-2.5 text-center font-bold transition-colors ${
                  activeTab === 'RESOLVED'
                    ? 'bg-[#FFFFFF] text-[#2E6E4E] border-b-2 border-[#2E6E4E]'
                    : 'text-[#14231F]/70 hover:text-[#14231F]'
                }`}
              >
                RESOLVED ({resolvedCalls.length})
              </button>
            </div>

            {/* List of Calls */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#D8D3C7]">
              {displayedCalls.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#14231F]/60 font-mono">
                  No {activeTab.toLowerCase()} incidents in current queue.
                </div>
              ) : (
                displayedCalls.map((sos) => {
                  const dist = calculateDistanceKm(
                    volunteerCoords.lat,
                    volunteerCoords.lng,
                    sos.lat,
                    sos.lng
                  );

                  return (
                    <div
                      key={sos.id}
                      className="p-3.5 hover:bg-[#F6F4EF] transition-colors space-y-2 cursor-pointer"
                      onClick={() => setFocusCoords([sos.lat, sos.lng])}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#B23A2E] text-white">
                          {sos.hazardType}
                        </span>
                        <div className="flex items-center gap-1 text-xs font-mono text-[#14231F]/80">
                          <MapPin className="w-3 h-3 text-[#2E6E4E]" />
                          <span className="tabular-nums font-semibold">{dist} km away</span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-display font-bold text-sm text-[#14231F] flex items-center justify-between">
                          <span>{sos.userName}</span>
                          <span className="text-[10px] font-mono font-normal text-[#14231F]/60">
                            {new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </h4>
                        <p className="text-xs text-[#14231F]/85 italic bg-[#EFECE4]/60 p-1.5 rounded border border-[#D8D3C7] mt-1">
                          "{sos.message}"
                        </p>
                      </div>

                      {sos.userPhone && (
                        <div className="text-[11px] font-mono text-[#14231F]/70 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-[#14231F]/50" />
                          <a href={`tel:${sos.userPhone}`} className="hover:underline">
                            {sos.userPhone}
                          </a>
                        </div>
                      )}

                      {/* Dispatch Action Button */}
                      <div className="pt-1 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusCoords([sos.lat, sos.lng]);
                          }}
                          className="text-[11px] font-mono underline text-[#14231F]/70 hover:text-[#14231F] flex items-center gap-0.5"
                        >
                          View on map <ArrowUpRight className="w-3 h-3" />
                        </button>

                        {sos.status === 'PENDING' && (
                          <button
                            type="button"
                            id={`accept-sos-${sos.id}`}
                            disabled={actionLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAssignSOS(sos.id);
                            }}
                            className="px-3 py-1.5 bg-[#14231F] hover:bg-black text-white font-display font-semibold text-xs rounded transition-colors"
                          >
                            ACCEPT DISPATCH
                          </button>
                        )}

                        {sos.status === 'IN_PROGRESS' && (
                          <button
                            type="button"
                            id={`resolve-sos-${sos.id}`}
                            disabled={actionLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolveSOS(sos.id);
                            }}
                            className="px-3 py-1.5 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-semibold text-xs rounded transition-colors"
                          >
                            MARK RESOLVED
                          </button>
                        )}

                        {sos.status === 'RESOLVED' && (
                          <span className="text-[10px] font-mono font-bold text-[#2E6E4E] flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> RESOLVED
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
