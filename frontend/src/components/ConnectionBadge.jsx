import React from 'react';
import { useSocket } from '../context/SocketContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionBadge() {
  const { isConnected, isReconnecting } = useSocket();

  if (isReconnecting) {
    return (
      <div
        id="connection-status-badge"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#C97A2B]/40 bg-[#C97A2B]/10 text-[#C97A2B] rounded"
        title="Reconnecting to real-time gateway"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span className="font-mono tracking-tight">RECONNECTING...</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div
        id="connection-status-badge"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#2E6E4E]/40 bg-[#2E6E4E]/10 text-[#2E6E4E] rounded"
        title="Real-time WebSocket connection active"
      >
        <span className="w-2 h-2 rounded-full bg-[#2E6E4E] inline-block"></span>
        <span className="font-mono tracking-tight">LIVE SYNC</span>
      </div>
    );
  }

  return (
    <div
      id="connection-status-badge"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-[#B23A2E]/40 bg-[#B23A2E]/10 text-[#B23A2E] rounded"
      title="Disconnected from server"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span className="font-mono tracking-tight">OFFLINE</span>
    </div>
  );
}
