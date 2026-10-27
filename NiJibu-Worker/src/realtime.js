import { io } from 'socket.io-client';
import { API_URL } from './config';

// One live connection to the server (Socket.IO). It reconnects by itself when the network drops.
// If the server refuses the token, it does not retry (the app logs out through the normal 401 path).
export function connectSocket(token) {
  return io(API_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
