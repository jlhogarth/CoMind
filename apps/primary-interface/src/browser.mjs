import { mountCockpit } from './cockpit.mjs';
// No fixture, credentials, network request or local decision state in this entry point.
mountCockpit(document.querySelector('main'), {
  status: 'unavailable', records: [], sourceRef: 'PI-001 source adapter not connected',
  reason: 'A reviewed trusted-server projection and operator identity are required. Resolver: PI-001 integration owner with the Foundry and Durable RunBook owners.',
  observedAt: null,
});
