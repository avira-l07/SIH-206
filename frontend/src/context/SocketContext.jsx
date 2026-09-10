import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../services/api';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const currentToken = token || localStorage.getItem('sih_auth_token') || localStorage.getItem('token');
    const socketInstance = io(API_BASE_URL, {
      auth: { token: currentToken },
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

      if (user?.role) {
        socketInstance.emit('join:role', user.role);
      } else {
        try {
          const storedUser = localStorage.getItem('sih_user') || localStorage.getItem('user');
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            if (parsed && parsed.role) {
              socketInstance.emit('join:role', parsed.role);
            }
          }
        } catch (err) {
          console.error('Error joining socket role room:', err);
        }
      }
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
  }, [token]);

  // Sync role room whenever user or role changes
  useEffect(() => {
    if (socket && isConnected && user?.role) {
      socket.emit('join:role', user.role);
    }
  }, [socket, isConnected, user?.role]);

  const setSocketRole = (role) => {
    if (socket && role) {
      socket.emit('join:role', role);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        isReconnecting,
        setSocketRole,
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
