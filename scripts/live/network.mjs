export function lanUrls(interfaces, port) {
  const addresses = Object.entries(interfaces)
    .filter(([name]) => !/^(docker|br-|veth|virbr|podman|cni|flannel|cali|kube|lxc|lxd|incus|bridge)/i.test(name))
    .flatMap(([, addresses]) => addresses ?? [])
    .filter(a => a.family === 'IPv4' && !a.internal);
  return addresses.map(a => `http://${a.address}:${port}`).join(' ')
    || `http://localhost:${port} (no LAN address found)`;
}
