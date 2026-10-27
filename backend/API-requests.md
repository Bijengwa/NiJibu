# Request flow API (customer app + NiJibu Worker)

All routes need `Authorization: Bearer <token>`. Errors look like `{ error, code }`.
Sockets: connect with `io(URL, { auth: { token } })`.

## Statuses
`searching` → `accepted` → `on_the_way` → `arrived` → `in_progress` → `completed`
Other endings: `cancelled`, `no_provider`.

## Customer
| Call | Notes |
|---|---|
| `GET /api/services` | the fixed list of jobs |
| `GET /api/services/:id/availability?lat&lng` | `{ providers_nearby, nearest_km }`; also saved for the admin gap report |
| `POST /api/requests` `{ service_id, lat, lng, address?, note? }` | 201 `{ request }`. 409 `ALREADY_OPEN` if one is open |
| `GET /api/requests/open` | open request or `null` (restore screen on app start) |
| `GET /api/requests/:id` | full view; `provider.lat/lng/eta_min` only while `accepted` / `on_the_way` |
| `GET /api/requests` | history (Activity tab) |
| `POST /api/requests/:id/cancel` `{ reason? }` | before work starts |

## Provider (verified only, except apply and me)
| Call | Notes |
|---|---|
| `POST /api/provider/apply` `{ service_ids: [1..5] }` | creates/updates profile, status `pending` |
| `GET /api/provider/me` | status, online flag, services, `active_request_id` |
| `POST /api/provider/online` `{ lat, lng }` / `POST /api/provider/offline` | go live / off |
| `POST /api/provider/location` `{ lat, lng }` | heartbeat every ~30 s while online (2 min of silence = offline) |
| `GET /api/provider/offers` | offers waiting now (use after reconnect) |
| `POST /api/offers/:id/accept` | 409 `ALREADY_TAKEN`, 410 `OFFER_EXPIRED`, 409 `PROVIDER_BUSY` |
| `POST /api/offers/:id/decline` | |
| `POST /api/requests/:id/on-the-way` · `arrived` · `start` · `complete` | 409 `BAD_STATE` if out of order; `arrived` 400 `TOO_FAR` if more than `ARRIVE_MAX_KM` away |
| `POST /api/requests/:id/cancel` | provider may cancel before work starts |

## Admin (role `admin`)
`GET /api/admin/providers?status=pending` · `POST /api/admin/providers/:id/verify|reject` · `GET /api/admin/search-gaps?days=7`

## Socket events
Server → app: `offer:new` (provider) · `offer:closed` `{offer_id, request_id, reason: expired|taken|cancelled}` · `request:status` `{request_id, status}` (refetch the request) · `provider:location` `{request_id, lat, lng, at}` (customer).
App → server: `request:join` (requestId, ack) · `request:leave` · `provider:location` `{ request_id, lat, lng }` every ~5 s while `on_the_way`.

## Matching rules
Nearest verified, online, free providers for the service. 3 offers at a time, 45 s each. Radius 3 → 5 → 10 km. Gives up after 5 min or no one left (`no_provider`).
