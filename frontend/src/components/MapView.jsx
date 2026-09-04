import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

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
      font-size: 14px;
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
const shelterIcon = createCustomIcon('#14231F', '#F6F4EF', '⌂');
const userLocationIcon = createCustomIcon('#2E6E4E', '#FFFFFF', '●');

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
  userCoords,
  focusCoords,
  onAssignSOS,
  onResolveSOS,
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

        {/* SOS Distress Calls */}
        {sosRequests.map((sos) => {
          let icon = sosPendingIcon;
          if (sos.status === 'IN_PROGRESS') icon = sosProgressIcon;
          if (sos.status === 'RESOLVED') icon = sosResolvedIcon;

          return (
            <Marker key={`sos-${sos.id}`} position={[sos.lat, sos.lng]} icon={icon}>
              <Popup>
                <div className="text-xs p-1 max-w-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-[#B23A2E] text-white">
                      SOS // {sos.hazardType}
                    </span>
                    <span className="font-mono font-semibold text-[10px] text-[#14231F]/70">
                      STATUS: {sos.status}
                    </span>
                  </div>

                  <div className="font-bold text-sm text-[#14231F]">{sos.userName}</div>
                  {sos.userPhone && (
                    <div className="text-[11px] font-mono text-[#14231F]/80">
                      Phone: <a href={`tel:${sos.userPhone}`} className="underline font-bold">{sos.userPhone}</a>
                    </div>
                  )}
                  <p className="text-[#14231F] italic bg-[#F6F4EF] p-1.5 rounded border border-[#D8D3C7]">
                    "{sos.message}"
                  </p>

                  {/* Responders Action Controls */}
                  {(userRole === 'VOLUNTEER' || userRole === 'ADMIN') && (
                    <div className="pt-2 border-t border-[#D8D3C7] flex gap-2">
                      {sos.status === 'PENDING' && onAssignSOS && (
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
        {shelters.map((shelter) => (
          <Marker
            key={`shelter-${shelter.id}`}
            position={[shelter.lat, shelter.lng]}
            icon={shelterIcon}
          >
            <Popup>
              <div className="text-xs p-1 max-w-xs space-y-1">
                <div className="font-mono text-[10px] text-[#2E6E4E] font-bold uppercase">
                  EMERGENCY SHELTER
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
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
