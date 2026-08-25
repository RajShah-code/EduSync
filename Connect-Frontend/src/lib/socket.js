import { SOCKET_URL, CONNECT_TOKEN_KEY } from "@/config/api";
import { io } from "socket.io-client";

let socket = null;

/**
 * Initializes or returns the existing singleton Socket.IO connection for Connect.
 * Uses the isolated `connect_edusync_token`.
 */
export function initConnectSocket(customToken) {
  const token = customToken || localStorage.getItem(CONNECT_TOKEN_KEY);
  if (!token) return null;

  if (socket && socket.connected) {
    return socket;
  }

  // Close any stale socket before creating a new one
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    transports: ["websocket", "polling"],
  });

  socket.on("connect", () => {
    console.log("[Connect Socket] Connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.warn("[Connect Socket] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Connect Socket] Disconnected:", reason);
  });

  return socket;
}

export function getConnectSocket() {
  if (!socket || !socket.connected) {
    return initConnectSocket();
  }
  return socket;
}

export function disconnectConnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
