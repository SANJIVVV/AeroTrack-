# AeroTrack Pro — Comprehensive Project Architecture

This document details the architectural design, system components, communication patterns, security mechanisms, and deployment strategies of **AeroTrack Pro: Smart Airport Baggage Tracking and Monitoring System**.

---

## 1. System Overview & Design Philosophy

AeroTrack Pro is architected as an **auditable, event-driven, full-stack web application** designed specifically for airport luggage tracking.

### Core Architectural Principles:
1. **Explainability Over Black-Box Automation:**  
   Every state transition, anomaly alert, and delay prediction provides explicit evidence, reasons, and factor breakdowns. The system never asserts claims it cannot verify.
2. **Discrete Physical Verification:**  
   Baggage location is determined strictly by verified checkpoint barcode scans. The system never claims continuous GPS tracking between physical scanning stations.
3. **Decoupled Domain Logic:**  
   Core business rules—state machines, anomaly rules, reference generation, and prediction algorithms—are isolated in `@aerotrack/shared` and reused seamlessly by both frontend and backend.
4. **Zero-Build Native Frontend:**  
   The client leverages native ES Modules and modern web standards. This eliminates build tool fragility, speeds up local development, and allows faculty to inspect client code in the browser DevTools directly.
5. **Defense-in-Depth Security:**  
   Security is enforced at multiple layers: Helmet security headers, Content Security Policy (CSP), custom anti-CSRF headers, bcrypt password hashing, and strict Zod schema validation on all inputs.

---

## 2. Multi-Tier Architecture

```mermaid
flowchart TD
    subgraph PresentationTier["Presentation Tier (Browser Client)"]
        SPA["Single Page App (HTML5 / Modern CSS / Vanilla JS)"]
        Router["Client-side Router (History API)"]
        UIComp["Components: Camera Scanner, Drag-and-Drop Board, Forms"]
        Store["Auth Store & Theme Manager"]
    end

    subgraph GatewayTier["Gateway & Middleware Tier"]
        Helmet["Helmet (CSP, Frameguard, NoSniff)"]
        RateLimit["Express Rate Limiters (Auth, Scans, API)"]
        Cors["CORS Handler (Strict Origin Validation)"]
        Csrf["Anti-CSRF Verification (X-Requested-With)"]
        SessionAuth["Session Loader & RBAC Access Control"]
    end

    subgraph ApplicationTier["Application Service Tier (Express 5)"]
        AuthSvc["Auth & OTP Service"]
        TrackingSvc["Baggage & Scan Tracking Engine"]
        AnomalySvc["Anomaly Detection & Sweep Worker"]
        PredictSvc["Delay Risk Prediction Engine"]
        AuditSvc["Audit Logging Service"]
        NotifSvc["In-App Notification Dispatcher"]
    end

    subgraph SharedLogicTier["Domain Logic Tier (@aerotrack/shared)"]
        CSPRNG["CSPRNG QR Tag Engine (Rejection Sampling)"]
        StateEngine["8-Stage Journey State Machine"]
        AnomalyRules["Operational Anomaly Rulebook"]
        PredictModel["Delay-Risk Heuristic & Logistic Model"]
    end

    subgraph DataTier["Data Persistence Tier (MongoDB Atlas)"]
        UsersCol[("users & sessions")]
        BaggageCol[("baggages & baggageevents")]
        CheckpointsCol[("checkpoints & flights")]
        AlertsCol[("anomalyalerts & auditrecords")]
    end

    SPA --> Router
    Router --> UIComp
    UIComp --> Store
    Store -- "HTTP JSON / Cookies" --> Helmet
    Helmet --> RateLimit --> Cors --> Csrf --> SessionAuth
    
    SessionAuth --> AuthSvc
    SessionAuth --> TrackingSvc
    SessionAuth --> AnomalySvc
    SessionAuth --> PredictSvc
    SessionAuth --> AuditSvc
    SessionAuth --> NotifSvc

    TrackingSvc <--> SharedLogicTier
    AnomalySvc <--> SharedLogicTier
    PredictSvc <--> SharedLogicTier

    AuthSvc <--> UsersCol
    TrackingSvc <--> BaggageCol
    TrackingSvc <--> CheckpointsCol
    AnomalySvc <--> AlertsCol
    AuditSvc <--> AlertsCol
```

---

## 3. End-to-End Request-Response Flow

Every client request follows an explicit lifecycle that ensures validation, authorization, and error containment before touching the database:

```
[User Action in Browser UI]
            │
            ▼
[DOM Event Listener (Submit/Click/Scan)]
            │
            ▼
[Frontend API Helper (`frontend/js/lib/api.js`)]
  - Attaches `X-Requested-With: aerotrack`
  - Sets `credentials: 'include'`
            │
            ▼
[Express 5 Server (`backend/src/app.js`)]
            │
            ├──> [Helmet CSP & Security Headers]
            ├──> [CORS Validation (`corsOrigins`)]
            ├──> [Rate Limiter (`createLimiters`)]
            ├──> [CSRF Validation (`requireCsrfHeader`)]
            └──> [Session Loader (`loadSession`)]
                        │
                        ▼
            [Role-Based Guard (`requireRole('staff', 'admin')`)]
                        │
                        ▼
            [Zod Schema Validator (`parse(schema, req.body)`)]
                        │
                        ▼
            [Route Controller & Service Layer (`services/tracking.js`)]
                        │
                        ├──> [Evaluate Transition / Anomaly Rules]
                        ├──> [MongoDB Atlas Operation via Mongoose]
                        ├──> [Create BaggageEvent & Audit Log]
                        └──> [Evaluate Delay Risk Snapshot]
                        │
                        ▼
            [DTO Serializer (`toBaggageDTO`)]
                        │
                        ▼
            [HTTP 200/201 JSON Response to Browser]
                        │
                        ▼
            [Frontend DOM Update & Toast Notification]
```

---

## 4. Key Sequence Diagrams

### 4.1. Baggage Registration & QR Allocation

```mermaid
sequenceDiagram
    autonumber
    actor Passenger
    participant UI as Frontend (passenger.js)
    participant API as Backend (routes/baggage.js)
    participant QR as Shared (@aerotrack/shared/qr.js)
    participant DB as MongoDB Atlas

    Passenger->>UI: Fills Registration Form (Flight, Color, Weight)
    UI->>API: POST /api/baggage (with X-Requested-With)
    API->>API: Verify User & Max 10 Bags Limit
    loop Unbiased Rejection Sampling
        API->>QR: generateReference(randomBytes, year)
        QR->>QR: secureRandomInt(0, 999999) via CSPRNG
        QR-->>API: AT-2026-XXXXXX
    end
    API->>DB: Baggage.create({ reference, owner, flight, status: 'REGISTERED' })
    API->>DB: BaggageEvent.create({ status: 'REGISTERED', actor: req.user._id })
    API->>DB: AuditEvent.create({ action: 'baggage.registered' })
    API-->>UI: 201 Created { baggage: DTO }
    UI->>API: GET /api/baggage/:ref/qr
    API-->>UI: 200 OK { svg: "<svg>...</svg>", payload: "AEROTRACK:BAG:..." }
    UI-->>Passenger: Displays Interactive Tag with Download/Print
```

### 4.2. Checkpoint Scanning & Anomaly Interception

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Ground Staff
    participant Cam as HTML5 Camera / UI
    participant API as Backend (routes/scans.js)
    participant Domain as Shared Logic (anomaly.js / status.js)
    participant DB as MongoDB Atlas

    Staff->>Cam: Points camera at luggage QR tag
    Cam->>API: POST /api/scans { qrPayload, checkpointCode, idempotencyKey }
    API->>DB: Baggage.findOne({ reference })
    API->>DB: Checkpoint.findOne({ code: checkpointCode })
    API->>Domain: evaluateScan({ bag, checkpoint, flight, recentEvents, now })
    alt Duplicate Scan within 120s
        Domain-->>API: action: 'duplicate', findings: [DUPLICATE_SCAN]
        API-->>Cam: 200 OK { outcome: 'duplicate', findings }
    else Invalid Backward Sequence
        Domain-->>API: action: 'reject', findings: [INVALID_SEQUENCE]
        API-->>Cam: 200 OK { outcome: 'rejected', findings }
    else Valid Move with Skipped Checkpoints
        Domain-->>API: action: 'record', findings: [MISSING_CHECKPOINT]
        API->>DB: Baggage.findOneAndUpdate (with optimistic lock)
        API->>DB: BaggageEvent.create(scan details)
        API->>DB: AnomalyAlert.create(skipped checkpoint findings)
        API-->>Cam: 201 Created { outcome: 'recorded', findings }
    end
```

---

## 5. Deployment Architecture Analysis: Vercel vs Render

### Architectural Comparison Matrix

| Evaluation Criterion | Render Web Service (Current / Native) | Vercel Serverless Function |
|---|---|---|
| **Architecture Type** | Long-running Node.js Container Process | Ephemeral On-Demand Serverless Lambdas |
| **Frontend Delivery** | Served directly by Express (`express.static`) | Global Edge Content Delivery Network (CDN) |
| **Background Sweeps** | Supported natively via `setInterval` sweeper | **Unsupported natively**; requires external cron trigger |
| **Database Connections** | Persistent Mongoose connection pool | Reconnects on cold starts; pool exhaustion risk |
| **In-Memory Outbox (Dev)** | Persists in memory across requests | Reset on every lambda cold start |
| **Rate Limiter Storage** | In-memory token buckets work across sessions | Not shared across concurrent lambda instances |
| **WebSocket / Push** | Supported for future real-time feeds | Requires third-party service (e.g. Pusher) |
| **Cold Start Latency** | None (always running) | 500ms – 2500ms on initial spin-up |

### Recommended Deployment Strategy

1. **All-in-One Dedicated Hosting (Render / Railway / VPS):**  
   Best for preserving 100% of the project's native features including background anomaly sweeps, in-memory OTP diagnostics, and steady Mongoose connection pools.
2. **Decoupled Edge + API (Vercel Frontend + Render API):**  
   Deploy `frontend/` to Vercel for ultra-fast CDN delivery worldwide, and deploy `backend/` to Render. Configure `window.AEROTRACK_API_BASE` in `frontend/js/config.js` to point to the Render API URL.
3. **All-in-One Vercel:**  
   Supported via the included `vercel.json` and `api/index.js` adapter. Note that background sweeper intervals do not run continuously on serverless and must be triggered on demand.
