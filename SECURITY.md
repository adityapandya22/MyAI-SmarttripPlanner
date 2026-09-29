# Security Policy — MyAI-SmarttripPlanner

## Threat Model

MyTripPlanner is a **local-first, self-hosted** application:

1. **Deployment**: a Node server on the user's machine (or Docker), serving
   a React SPA over `localhost`. It is **not** a public cloud service.
2. **Network surface**: by default only `127.0.0.1:5200` is reachable.
   Docker binds `0.0.0.0` for container networking; a reverse-proxy or
   firewall should be used if exposing to a LAN.
3. **Data at rest**: trip data lives as JSON files in `~/Documents/Ulisse`.
   API keys are stored in `.auth.json` with `chmod 600` permissions.
4. **Authentication**: the admin panel accepts connections without server-side
   auth checks — see "Known Issues" below.
5. **WebSocket**: the `/agent` endpoint currently accepts connections from any
   Origin. Any website open in the user's browser can drive the agent.
6. **External APIs**: Nominatim, Wikipedia, Overpass, OSRM, Open-Meteo are
   queried server-side. No secrets are sent to them. Booking.com and Google
   Maps scraping (headless Chrome) is available but may violate those sites'
   Terms of Service.

## Known Issues (to be fixed in this release)

| ID  | Severity | Issue | Status |
|-----|----------|-------|--------|
| S1  | High     | WebSocket `/agent` accepts any Origin | TODO: PART 2 |
| S2  | Critical | Admin login is client-side only (`admin123`) | TODO: PART 2 |
| S3  | High     | No user accounts or trip isolation | TODO: PART 2 |
| S4  | Medium   | `/debug/tool` not restricted to localhost | TODO: PART 3 |
| S5  | High     | npm audit vulnerabilities (transitive) | **FIXED** (audit fix) |
| S6  | Medium   | No security headers, body limits, rate limiting | TODO: PART 3 |

## Vulnerability Reporting

This is a student project. If you find a security issue, please open a
GitHub issue or contact the maintainer directly.

## Audit Results

After `npm audit fix`:
- **0 vulnerabilities** remaining (9 were fixed).
- All transitive dependencies are at their latest compatible versions.
