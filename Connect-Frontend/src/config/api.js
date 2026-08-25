export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://edusync-mthd.onrender.com';
export const SOCKET_URL = API_BASE_URL;

// Isolated storage keys to prevent clobbering the main EduSync application session
export const CONNECT_TOKEN_KEY = 'connect_edusync_token';
export const CONNECT_USER_KEY = 'connect_edusync_user';
