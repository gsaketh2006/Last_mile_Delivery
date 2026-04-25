import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const STATUS_COLOR = {
  idle:      '#6366f1',
  busy:      '#06b6d4',
};

const makeDriverIcon = (driver) => {
  const color = STATUS_COLOR[driver.status] || '#6366f1';
  const glow  = driver.status === 'busy' ? `0 0 12px ${color}99` : 'none';
  return L.divIcon({
    className: '',
    html: `<div style="
      background: ${color};
      width: 26px; height: 26px;
      border-radius: 50%;
      border: 2.5px solid rgba(255,255,255,0.9);
      box-shadow: ${glow};
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 11px; font-weight: 800;
      transition: all 0.3s;
    ">🚗</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

const makeOrderIcon = (status) => {
  const map = {
    pending:    { bg: '#f59e0b', emoji: '📍' },
    assigned:   { bg: '#6366f1', emoji: '⟳'  },
    picked_up:  { bg: '#10b981', emoji: '📦' },
    cancelled:  { bg: '#ef4444', emoji: '✕'  },
    delivered:  { bg: '#64748b', emoji: '✓'  },
  };
  const cfg = map[status] || map.pending;
  return L.divIcon({
    className: '',
    html: `<div style="
      background: ${cfg.bg};
      width: 20px; height: 20px;
      border-radius: 5px;
      border: 2px solid rgba(255,255,255,0.8);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    ">${cfg.emoji}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const MapComponent = ({ drivers = [], orders = [], trafficJams = [], weatherZones = [], weather = 'Clear' }) => {
  const routeColor = weather === 'Stormy' ? '#ef4444' : weather === 'Rain' ? '#3b82f6' : '#6366f1';

  return (
    <MapContainer
      center={[17.3850, 78.4867]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      id="main-map"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      {/* Weather Zones */}
      {weatherZones && weatherZones.map(zone => {
         const color = zone.type === 2 ? '#64748b' : '#3b82f6';
         const title = zone.type === 2 ? '⛈️ Storm' : '🌧️ Rain';
         return (
            <Circle
              key={zone.id}
              center={[zone.lat, zone.lon]}
              pathOptions={{ color: color, fillColor: color, fillOpacity: 0.15, weight: 0 }}
              radius={zone.radius * 111000}
            >
              <Popup><strong>{title}</strong></Popup>
            </Circle>
         );
      })}

      {/* Traffic Jams */}
      {trafficJams && trafficJams.map(jam => (
        <Circle
          key={jam.id}
          center={[jam.lat, jam.lon]}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 1.5 }}
          radius={jam.radius * 111000}
        >
          <Popup>
            <strong>🚦 Traffic Jam</strong><br />
            Slowdown: {Math.round((1 - jam.penalty) * 100)}%
          </Popup>
        </Circle>
      ))}

      {/* Drivers */}
      {drivers.map(driver => (
        <Marker
          key={driver.id}
          position={[driver.lat, driver.lon]}
          icon={makeDriverIcon(driver)}
        >
          <Popup>
            <strong>{driver.name}</strong><br />
            Status: <b>{driver.status}</b><br />
            Deliveries: {driver.deliveries_done || 0}<br />
            {driver.eta > 0 && `ETA: ~${Math.round(driver.eta / 60)} min`}
          </Popup>
          {driver.route && driver.route.length > 0 && (
            <Polyline
              positions={driver.route.map(pt => [pt[1], pt[0]])}
              color={routeColor}
              weight={3}
              opacity={0.7}
              dashArray="8, 8"
            />
          )}
        </Marker>
      ))}

      {/* Orders (non-delivered) */}
      {orders.filter(o => o.status !== 'delivered').map(order => (
        <React.Fragment key={order.id}>
          <Marker
            position={[order.pickup.lat, order.pickup.lon]}
            icon={makeOrderIcon(order.status)}
          >
            <Popup>
              <strong>Order {order.id}</strong><br />
              Type: {order.order_type || 'parcel'}<br />
              Priority: {order.priority || 'normal'}<br />
              Status: {order.status}
            </Popup>
          </Marker>
          {order.status !== 'cancelled' && (
            <Marker
              position={[order.dropoff.lat, order.dropoff.lon]}
              icon={makeOrderIcon('delivered')}
              opacity={0.5}
            >
              <Popup>Dropoff — {order.id}</Popup>
            </Marker>
          )}
        </React.Fragment>
      ))}
    </MapContainer>
  );
};

export default MapComponent;
