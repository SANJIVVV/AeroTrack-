# AeroTrack Pro — Complete REST API Documentation

All API endpoints reside under the `/api` route prefix.

---

## 1. Global Request & Response Specifications

### Headers
- **`Content-Type: application/json`**: Required for all requests with a body.
- **`X-Requested-With: aerotrack`**: Required for all state-changing requests (`POST`, `PATCH`, `DELETE`) to prevent Cross-Site Request Forgery (CSRF).
- **`If-Match: <version>`**: Optional for status changes; enforces optimistic concurrency control.

### Error Response Format
All errors return a standard JSON structure:
```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable explanation of what went wrong.",
    "details": null
  }
}
```

---

## 2. Master Endpoint Registry

| HTTP Method | Endpoint | Module | Auth & Role | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | System | Public | Database readiness and service diagnostics |
| `GET` | `/api/health/live` | System | Public | Process liveness probe |
| `POST` | `/api/auth/register` | Auth | Public | Register new passenger account |
| `POST` | `/api/auth/verify-otp` | Auth | Public | Verify email address with 6-digit OTP |
| `POST` | `/api/auth/resend-otp` | Auth | Public | Request a fresh verification or reset OTP |
| `POST` | `/api/auth/login` | Auth | Public | Authenticate user and initiate session |
| `POST` | `/api/auth/forgot-password` | Auth | Public | Initiate password reset challenge |
| `POST` | `/api/auth/reset-password` | Auth | Public | Reset password using 6-digit OTP |
| `POST` | `/api/auth/logout` | Auth | Authenticated | Terminate session and clear session cookie |
| `GET` | `/api/users/me` | Users | Authenticated | Retrieve profile of authenticated user |
| `PATCH` | `/api/users/me/preferences` | Users | Authenticated | Update user notification preferences |
| `POST` | `/api/users/me/tutorial` | Users | Authenticated | Mark onboarding tutorial completed |
| `GET` | `/api/baggage` | Baggage | Authenticated | List user bags (passengers) or search all (staff) |
| `POST` | `/api/baggage` | Baggage | Verified Passenger | Register new luggage for a scheduled flight |
| `GET` | `/api/baggage/board` | Baggage | Staff / Admin | Active baggage list for Operations Board |
| `GET` | `/api/baggage/:ref` | Baggage | Owner / Staff | Retrieve luggage details and allowed transitions |
| `GET` | `/api/baggage/:ref/events` | Baggage | Owner / Staff | Retrieve chronological checkpoint scan log |
| `GET` | `/api/baggage/:ref/qr` | Baggage | Owner / Staff | Retrieve QR payload string and rendered SVG |
| `GET` | `/api/baggage/:ref/prediction` | Baggage | Owner / Staff | Get real-time explainable delay-risk assessment |
| `PATCH` | `/api/baggage/:ref/status` | Baggage | Staff / Admin | Advance baggage to next journey or exception stage |
| `POST` | `/api/baggage/:ref/override` | Baggage | Admin Only | Force administrative status override with reason |
| `DELETE` | `/api/baggage/:ref` | Baggage | Owner / Admin | Cancel registration before initial check-in scan |
| `POST` | `/api/scans` | Scans | Staff / Admin | Process optical barcode scan at a checkpoint |
| `GET` | `/api/scans/recent` | Scans | Staff / Admin | Stream of recent airport-wide scan events |
| `GET` | `/api/checkpoints` | Checkpoints | Authenticated | List all physical airport checkpoint stations |
| `POST` | `/api/checkpoints` | Checkpoints | Admin Only | Create a new physical scanning checkpoint |
| `PATCH` | `/api/checkpoints/:id` | Checkpoints | Admin Only | Activate or deactivate a checkpoint station |
| `GET` | `/api/flights` | Flights | Authenticated | Search active flight rosters |
| `POST` | `/api/flights` | Flights | Staff / Admin | Manually enter an ad-hoc flight schedule |
| `GET` | `/api/airlines` | Airlines | Authenticated | List recognized airline directory |
| `GET` | `/api/incidents` | Incidents | Authenticated | List incidents filed by user or all (staff) |
| `POST` | `/api/incidents` | Incidents | Authenticated | File an incident for missing or damaged baggage |
| `PATCH` | `/api/incidents/:id` | Incidents | Staff / Admin | Update incident status or resolution note |
| `GET` | `/api/alerts` | Alerts | Staff / Admin | Query open and historical anomaly alerts |
| `PATCH` | `/api/alerts/:id` | Alerts | Staff / Admin | Acknowledge, investigate, or resolve an alert |
| `GET` | `/api/notifications` | Notifications | Authenticated | Get current user's notification inbox |
| `PATCH` | `/api/notifications/:id/read` | Notifications | Authenticated | Mark a notification message as read |
| `GET` | `/api/admin/analytics` | Admin | Staff / Admin | Operational KPIs, status counts, processing times |
| `GET` | `/api/admin/stats` | Admin | Admin Only | Headline summary metrics directly from MongoDB |
| `GET` | `/api/admin/users` | Admin | Admin Only | Paginated user directory with role filters |
| `PATCH` | `/api/admin/users/:id` | Admin | Admin Only | Change user role or disable/enable account |
| `GET` | `/api/admin/audit` | Admin | Admin Only | Comprehensive security audit log trail |

---

## 3. Detailed Endpoint Specifications

### 3.1. Authentication Module (`/api/auth`)

#### `POST /api/auth/register`
- **Purpose**: Creates an unverified passenger account and issues a 6-digit OTP.
- **Request Body**:
  ```json
  {
    "name": "Dheena Dhayal",
    "email": "dheena@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response (202 Accepted)**:
  ```json
  {
    "message": "If this email can be registered, a 6-digit code has been sent to it. Enter it to activate your account.",
    "emailMode": "dev",
    "devOtp": "491823",
    "devNotice": "DEVELOPMENT MODE: no email was sent. This code is shown only because SMTP is not configured."
  }
  ```

#### `POST /api/auth/verify-otp`
- **Purpose**: Confirms the 6-digit OTP code, marks email verified, and starts a session.
- **Request Body**:
  ```json
  {
    "email": "dheena@example.com",
    "code": "491823"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "message": "Email verified. Welcome aboard.",
    "user": {
      "id": "673dd38a1b94c03b82142e91",
      "name": "Dheena Dhayal",
      "email": "dheena@example.com",
      "role": "passenger",
      "emailVerified": true
    }
  }
  ```

---

### 3.2. Baggage Management Module (`/api/baggage`)

#### `POST /api/baggage`
- **Purpose**: Allocates a unique CSPRNG reference and registers baggage for a scheduled flight.
- **Request Body**:
  ```json
  {
    "flightId": "673dd38a1b94c03b82142e88",
    "description": "Hard-shell Navy Samsonite Suitcase",
    "color": "Navy Blue",
    "weightKg": 21.5
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "baggage": {
      "reference": "AT-2026-783921",
      "description": "Hard-shell Navy Samsonite Suitcase",
      "color": "Navy Blue",
      "weightKg": 21.5,
      "status": "REGISTERED",
      "lastMainStatus": "REGISTERED",
      "flight": {
        "flightNumber": "AI101",
        "origin": "MAA",
        "destination": "DEL"
      },
      "createdAt": "2026-11-22T09:30:00.000Z"
    }
  }
  ```

#### `GET /api/baggage/:ref/qr`
- **Purpose**: Returns the standardized QR payload string and clean inline SVG markup.
- **Response (200 OK)**:
  ```json
  {
    "reference": "AT-2026-783921",
    "payload": "AEROTRACK:BAG:AT-2026-783921",
    "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 33 33\">...</svg>"
  }
  ```

#### `GET /api/baggage/:ref/prediction`
- **Purpose**: Calculates real-time delay-risk probability and surfaces explainable factors.
- **Response (200 OK)**:
  ```json
  {
    "prediction": {
      "method": "rules-baseline",
      "risk": 0.45,
      "level": "medium",
      "interval": [0.30, 0.60],
      "factors": [
        { "feature": "dwellRatio", "label": "Time at current checkpoint vs expected", "contribution": 0.25 },
        { "feature": "skippedCheckpoints", "label": "Missing checkpoint scans", "contribution": 0.12 }
      ],
      "disclaimer": "Rules-based baseline with hand-set weights. It is not trained on airport data and is not calibrated.",
      "computedAt": "2026-11-22T09:35:00.000Z",
      "features": {
        "stageIndex": 2,
        "minutesSinceLastScan": 75,
        "dwellRatio": 1.5,
        "skippedCheckpoints": 1,
        "openAnomalies": 1,
        "flightDelayed": 0,
        "flightCancelled": 0,
        "minutesToDeparture": 55,
        "notLoadedNearDeparture": 0
      }
    }
  }
  ```

---

### 3.3. Checkpoint Scanning Module (`/api/scans`)

#### `POST /api/scans`
- **Purpose**: Processes a physical scan of a baggage tag QR code at an airport station.
- **Request Body**:
  ```json
  {
    "qrPayload": "AEROTRACK:BAG:AT-2026-783921",
    "checkpointCode": "MAA-SEC-01",
    "idempotencyKey": "a9d3c52e-6f81-4b72-9b24-11c5e93df120"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "outcome": "recorded",
    "baggage": {
      "reference": "AT-2026-783921",
      "status": "SECURITY_SCREENING",
      "lastCheckpoint": {
        "code": "MAA-SEC-01",
        "name": "MAA Hold baggage screening",
        "type": "SECURITY"
      }
    },
    "findings": []
  }
  ```

---

### 3.4. Administrative Governance (`/api/admin`)

#### `GET /api/admin/analytics`
- **Purpose**: Supplies airport management with operational KPIs, dwell bottlenecks, and trends.
- **Response (200 OK)**:
  ```json
  {
    "scope": "all",
    "generatedAt": "2026-11-22T09:40:00.000Z",
    "kpis": {
      "totalBaggage": 142,
      "inProgress": 88,
      "inTransit": 45,
      "collected": 54,
      "delayed": 3,
      "missing": 1,
      "openIncidents": 2,
      "scanFailures": 0,
      "activeAlerts": 4
    },
    "byStatus": {
      "REGISTERED": 12,
      "CHECKED_IN": 18,
      "SECURITY_SCREENING": 15,
      "LOADED": 20,
      "IN_TRANSIT": 45,
      "ARRIVED": 10,
      "ON_BELT": 18,
      "COLLECTED": 54,
      "DELAYED": 3,
      "MISSING": 1,
      "INCIDENT_REPORTED": 2
    }
  }
  ```
