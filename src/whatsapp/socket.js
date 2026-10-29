let currentSock = null;
let connectionStatus = 'starting';

export function setCurrentSocket(sock) {
  currentSock = sock || null;
}

export function getCurrentSocket() {
  return currentSock;
}

export function setConnectionStatus(status) {
  connectionStatus = status || 'unknown';
}

export function getConnectionStatus() {
  return connectionStatus;
}
