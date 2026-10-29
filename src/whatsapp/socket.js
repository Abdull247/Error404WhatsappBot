let currentSock = null;

export function setCurrentSocket(sock) {
  currentSock = sock || null;
}

export function getCurrentSocket() {
  return currentSock;
}
