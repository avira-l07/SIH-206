// Cleanup only listeners owned by this consumer.
export function subscribeSocketEvents(socket, handlers) {
  if (!socket) return () => {};
  Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
  return () => Object.entries(handlers).forEach(([event, handler]) => socket.off(event, handler));
}
