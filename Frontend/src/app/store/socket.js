import { io } from 'socket.io-client';

// Singleton socket instance — created once, reused everywhere
// Call initSocket(token) once after login to connect
// Call getSocket() anywhere to access the connected instance

let socket = null;

export function initSocket(token) {
  if (socket && socket.connected) return socket;

  socket = io('http://localhost:3000', {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
