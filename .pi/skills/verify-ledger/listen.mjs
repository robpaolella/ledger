// Verification-only preload: bind the unmodified production server to loopback
// and let the OS allocate a port atomically (no free-port discovery race).
import { Server } from 'node:net';
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  const callback = args.find((arg) => typeof arg === 'function');
  return listen.call(this, { port: 0, host: '127.0.0.1' }, () => {
    callback?.();
    process.send?.({ port: this.address().port });
  });
};
process.on('disconnect', () => process.exit(1));
