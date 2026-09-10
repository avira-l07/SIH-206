import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Check, ShieldCheck, Phone, MapPin, Sliders, AlertTriangle } from 'lucide-react';

// Fix for default Leaflet icon paths in bundlers
delete L.Icon.Default.prototype._getIconUrl;

// Custom SVG Icons matching Field-Ops Design System
const createCustomIcon = (bgColor, textColor, symbol, isPulsing = false) => {
  const pulseClass = isPulsing ? 'animate-emergency' : '';
  const html = `
    <div class="${pulseClass}" style="
      background-color: ${bgColor};
      color: ${textColor};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 13px;
    ">
      ${symbol}
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

const sosPendingIcon = createCustomIcon('#B23A2E', '#FFFFFF', '!', true);
const sosProgressIcon = createCustomIcon('#C97A2B', '#FFFFFF', '⏱');
const sosResolvedIcon = createCustomIcon('#2E6E4E', '#FFFFFF', '✓');
const userLocationIcon = createCustomIcon('#2E6E4E', '#FFFFFF', '●');

// Hazard Report Tier Icons (Decision 0.2)
const hazardGreyIcon = createCustomIcon('#9A968C', '#FFFFFF', '?');
const hazardAmberIcon = createCustomIcon('#C97A2B', '#FFFFFF', '⚠');
const hazardRedIcon = createCustomIcon('#B23A2E', '#FFFFFF', '⚡', true);

// Disputed: hatched/striped pattern over grey dot (Decision 0.2)
const createHatchedDisputeIcon = () => {
  const html = `
    <div style="
      background: repeating-linear-gradient(45deg, #9A968C, #9A968C 4px, #4A4843 4px, #4A4843 8px);
      color: #FFFFFF;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px dashed #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 800;
      font-size: 13px;
    ">
      ✕
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

// Resolved: muted/faded pin with checkmark, kept visible (Decision 0.2)
const createResolvedHazardIcon = () => {
  const html = `
    <div style="
      background-color: #6B7F76;
      color: #FFFFFF;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid #D8D3C7;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      opacity: 0.85;
      font-family: 'Space Grotesk', sans-serif;
      font-weight: 700;
      font-size: 12px;
    ">
      ✓
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-leaflet-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
};

const hazardDisputedIcon = createHatchedDisputeIcon();
const hazardResolvedIcon = createResolvedHazardIcon();

// Shelter Status Icons
const shelterGreenIcon = createCustomIcon('#2E6E4E', '#F6F4EF', '⌂');
const shelterYellowIcon = createCustomIcon('#C97A2B', '#F6F4EF', '⌂');
const shelterRedIcon = createCustomIcon('#B23A2E', '#F6F4EF', '⌂');

// Helper to center/fly map when focus changes
function MapFocusController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom || 13, { duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

export default function MapView({
  alerts = [],
  sosRequests = [],
  shelters = [],
  hazardReports = [],
  userCoords,
  focusCoords,
  onAssignSOS,
  onResolveSOS,
  onConfirmHazard,
  onViewSupplies,
  userRole,
}) {
  const defaultCenter = [userCoords?.lat || 19.0760, userCoords?.lng || 72.8777];

  return (
    <div className="w-full h-full min-h-[420px] rounded border border-[#D8D3C7] overflow-hidden relative shadow-xs">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapFocusController center={focusCoords} />

        {/* User Location Marker */}
        {userCoords && (
          <Marker position={[userCoords.lat, userCoords.lng]} icon={userLocationIcon}>
            <Popup>
              <div className="text-xs font-mono p-1">
                <strong>YOUR CURRENT LOCATION</strong>
                <div>{userCoords.lat.toFixed(4)}° N, {userCoords.lng.toFixed(4)}° E</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Active Hazard Radii & Circles */}
        {alerts.map((alert) => {
          const isCritical = alert.severity === 'CRITICAL';
          const color = isCritical ? '#B23A2E' : '#C97A2B';
          return (
            <React.Fragment key={`alert-${alert.id}`}>
              <Circle
                center={[alert.lat, alert.lng]}
                radius={isCritical ? 3500 : 2000}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.18,
                  weight: 2,
                  dashArray: isCritical ? '6, 6' : undefined,
                }}
              />
              <Marker
                position={[alert.lat, alert.lng]}
                icon={createCustomIcon(color, '#FFFFFF', isCritical ? '⚠' : 'ℹ')}
              >
                <Popup>
                  <div className="text-xs p-1 max-w-xs">
                    <div className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded text-white inline-block mb-1" style={{ backgroundColor: color }}>
                      {alert.severity} // {alert.hazardType}
                    </div>
                    <div className="font-bold text-sm text-[#14231F]">{alert.region}</div>
                    <div className="text-[#14231F]/80 my-1">{alert.message}</div>
                    <div className="text-[10px] font-mono text-[#14231F]/60">
                      Coordinates: {alert.lat.toFixed(4)}, {alert.lng.toFixed(4)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Crowdsourced Hazard Reports with Confidence Tiers (Decision 0.2 & Item 2.5) */}
        {hazardReports.map((report) => {
          let icon = hazardGreyIcon;
          let tierColor = '#9A968C';
          if (report.confidenceTier === 'AMBER') {
            icon = hazardAmberIcon;
            tierColor = '#C97A2B';
          } else if (report.confidenceTier === 'RED') {
            icon = hazardRedIcon;
            tierColor = '#B23A2E';
          } else if (report.confidenceTier === 'DISPUTED') {
            icon = hazardDisputedIcon;
            tierColor = '#66635C';
          } else if (report.confidenceTier === 'RESOLVED') {
            icon = hazardResolvedIcon;
            tierColor = '#6B7F76';
          }

          // Route Obstruction Rendering (Item 2.5) for WAIST or SUBMERGED reports
          const isObstruction =
            (report.severityBenchmark === 'WAIST' || report.severityBenchmark === 'SUBMERGED') &&
            report.confidenceTier !== 'RESOLVED' &&
            report.confidenceTier !== 'DISPUTED';

          const obstructionRadius = report.severityBenchmark === 'SUBMERGED' ? 250 : 150;
          const obstructionColor = report.severityBenchmark === 'SUBMERGED' ? '#B23A2E' : '#C97A2B';

          return (
            <React.Fragment key={`hazard-report-${report.id}`}>
              {/* Route Obstruction Perimeter Ring */}
              {isObstruction && (
                <Circle
                  center={[report.lat, report.lng]}
                  radius={obstructionRadius}
                  pathOptions={{
                    color: obstructionColor,
                    fillColor: obstructionColor,
                    fillOpacity: 0.2,
                    weight: 2.5,
                    dashArray: '6, 6',
                  }}
                />
              )}

              <Marker position={[report.lat, report.lng]} icon={icon}>
                <Popup>
                  <div className="text-xs p-1 max-w-xs space-y-2">
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span
                        className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded text-white"
                        style={{ backgroundColor: tierColor }}
                      >
                        TIER: {report.confidenceTier} ({report.confirmationsCount} Confirms)
                      </span>
                      <span className="text-[10px] font-mono text-[#14231F]/60">
                        {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Depth Benchmark & Route Blockage Notice */}
                    {report.severityBenchmark && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
                          DEPTH: {report.severityBenchmark}
                        </span>
                        {isObstruction && (
                          <span className="font-mono font-bold text-[10px] uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                            ROAD IMPASSABLE
                          </span>
                        )}
                      </div>
                    )}

                    {isObstruction && (
                      <div className="p-1.5 bg-red-50 border border-red-300 rounded text-[10px] font-mono text-red-900">
                        <strong>⚠️ ROUTE OBSTRUCTION:</strong> Depth ({report.severityBenchmark}) blocks standard vehicle transit. Responders auto-diverted.
                      </div>
                    )}

                    {report.confidenceTier === 'DISPUTED' && (
                      <div className="p-1.5 bg-gray-100 border border-gray-400 rounded text-[10px] font-mono text-gray-800">
                        <strong>⊘ DISPUTED / QUARANTINED:</strong> Ground consensus marked this report false. Excluded from active emergency dispatch.
                      </div>
                    )}

                    {report.confidenceTier === 'RESOLVED' && (
                      <div className="p-1.5 bg-emerald-50 border border-emerald-300 rounded text-[10px] font-mono text-emerald-900">
                        <strong>✓ HAZARD RESOLVED:</strong> Water has receded and route verified clear.
                      </div>
                    )}

                    {report.photoUrl && (
                      <div className="rounded border border-[#D8D3C7] overflow-hidden max-h-36">
                        <img src={report.photoUrl} alt="Hazard photo" className="w-full h-28 object-cover" />
                      </div>
                    )}

                    <div className="text-sm font-display font-semibold text-[#14231F]">
                      &ldquo;{report.hazardNote}&rdquo;
                    </div>

                    <div className="text-[11px] font-mono text-[#14231F]/70">
                      Reported by: <strong>{report.userName}</strong>
                    </div>

                    {report.confidenceTier !== 'RED' && report.confidenceTier !== 'RESOLVED' && onConfirmHazard && (
                      <div className="pt-2 border-t border-[#D8D3C7]">
                        <button
                          type="button"
                          onClick={() => onConfirmHazard(report.id)}
                          className="w-full py-1 bg-[#2E6E4E] hover:bg-[#23583e] text-white font-display font-bold text-xs rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>CONFIRM REPORT ACCURACY</span>
                        </button>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* SOS Distress Calls */}
        {sosRequests.map((sos) => {
          let icon = sosPendingIcon;
          if (sos.status === 'IN_PROGRESS') icon = sosProgressIcon;
          if (sos.status === 'RESOLVED') icon = sosResolvedIcon;

          const isUrgent = sos.priority === 'URGENT' || (sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0);

          return (
            <Marker key={`sos-${sos.id}`} position={[sos.lat, sos.lng]} icon={icon}>
              <Popup>
                <div className="text-xs p-1 max-w-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#B23A2E] text-white">
                      SOS // {sos.hazardType}
                    </span>
                    {isUrgent && (
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-[#B23A2E]/15 text-[#B23A2E]">
                        URGENT
                      </span>
                    )}
                  </div>

                  <div className="font-bold text-sm text-[#14231F]">{sos.userName}</div>
                  {sos.userPhone && (
                    <div className="text-[11px] font-mono text-[#14231F]/80">
                      Phone: <a href={`tel:${sos.userPhone}`} className="underline font-bold">{sos.userPhone}</a>
                    </div>
                  )}
                  <p className="text-[#14231F] italic bg-[#F6F4EF] p-1.5 rounded border border-[#D8D3C7]">
                    &ldquo;{sos.message}&rdquo;
                  </p>

                  {/* Vulnerability tags */}
                  {sos.vulnerabilityTags && sos.vulnerabilityTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sos.vulnerabilityTags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.2 rounded border border-[#14231F] text-[10px] font-mono uppercase bg-[#EFECE4]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Responders Action Controls */}
                  {(userRole === 'VOLUNTEER' || userRole === 'ADMIN') && (
                    <div className="pt-2 border-t border-[#D8D3C7] flex gap-2">
                      {(sos.status === 'PENDING' || sos.status === 'VERIFIED') && onAssignSOS && (
                        <button
                          onClick={() => onAssignSOS(sos.id)}
                          className="w-full py-1 bg-[#14231F] text-[#F6F4EF] font-display font-semibold text-xs rounded hover:bg-black"
                        >
                          ACCEPT DISPATCH
                        </button>
                      )}
                      {sos.status === 'IN_PROGRESS' && onResolveSOS && (
                        <button
                          onClick={() => onResolveSOS(sos.id)}
                          className="w-full py-1 bg-[#2E6E4E] text-white font-display font-semibold text-xs rounded hover:bg-[#24583e]"
                        >
                          MARK RESOLVED
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Emergency Shelters */}
        {shelters.map((shelter) => {
          let sIcon = shelterGreenIcon;
          if (shelter.status === 'YELLOW') sIcon = shelterYellowIcon;
          if (shelter.status === 'RED') sIcon = shelterRedIcon;

          return (
            <Marker
              key={`shelter-${shelter.id}`}
              position={[shelter.lat, shelter.lng]}
              icon={sIcon}
            >
              <Popup>
                <div className="text-xs p-1 max-w-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#2E6E4E] font-bold uppercase">
                      EMERGENCY SHELTER
                    </span>
                    <span className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold uppercase ${
                      shelter.status === 'RED' ? 'bg-[#B23A2E] text-white' : shelter.status === 'YELLOW' ? 'bg-[#C97A2B] text-white' : 'bg-[#2E6E4E] text-white'
                    }`}>
                      {shelter.status}
                    </span>
                  </div>

                  <div className="font-bold text-sm text-[#14231F]">{shelter.name}</div>
                  <div className="text-[#14231F]/70 text-[11px]">{shelter.address}</div>
                  <div className="font-mono text-xs pt-1">
                    Capacity: <strong>{shelter.currentOccupancy} / {shelter.capacity}</strong>
                    {shelter.currentOccupancy >= shelter.capacity ? (
                      <span className="text-[#B23A2E] font-bold ml-1">(FULL)</span>
                    ) : (
                      <span className="text-[#2E6E4E] font-bold ml-1">
                        ({shelter.capacity - shelter.currentOccupancy} free)
                      </span>
                    )}
                  </div>
                  {shelter.contact && (
                    <div className="text-[11px] font-mono text-[#14231F]/80">
                      Contact: <a href={`tel:${shelter.contact}`} className="underline">{shelter.contact}</a>
                    </div>
                  )}
                  {onViewSupplies && (
                    <button
                      type="button"
                      onClick={() => onViewSupplies(shelter)}
                      className="w-full mt-2 py-1 bg-[#14231F] hover:bg-black text-white text-[10px] font-mono font-bold rounded"
                    >
                      📦 VIEW SUPPLIES & SHIPMENTS
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
