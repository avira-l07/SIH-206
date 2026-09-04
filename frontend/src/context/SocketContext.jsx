import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../services/api';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const socketInstance = io(API_BASE_URL, {
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      console.log('⚡ Connected to disaster real-time network');
      setIsConnected(true);
      setIsReconnecting(false);
    });

    socketInstance.on('disconnect', (reason) => {
      console.warn('⚠️ Disconnected from real-time network:', reason);
      setIsConnected(false);
    });

    socketInstance.on('reconnect_attempt', () => {
      setIsReconnecting(true);
    });

    socketInstance.on('reconnect', () => {
      console.log('✅ Reconnected to real-time network');
      setIsConnected(true);
      setIsReconnecting(false);
    });

    socketInstance.on('reconnect_error', () => {
      setIsReconnecting(true);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isReconnecting,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
