# Architecture & System Design — MyAI-SmarttripPlanner

## 1. System Overview

**MyAI-SmarttripPlanner** is a self-hosted, local-first intelligent travel planner engineered with a modern full-stack web architecture. It combines a React single-page application with a high-performance Node.js service, backed by a persistent relational SQLite engine (`node:sqlite`) and verified external geo-data providers.

---

## 2. Target Architecture

```mermaid
graph TB
  subgraph Client ["Client Browser (React 19 + Vite + Zustand + Leaflet)"]
    UI[React Router SPA]
    State[Zustand Stores: auth, trip, ui]
    Map[Leaflet Interactive Map]
  end

  subgraph Gateway ["Transport Layer"]
    HTTPS[HTTP/1.1 REST Endpoints]
    WSS[WebSocket /agent]
    Cookie[HttpOnly SameSite=Lax Session Cookie: 'sid']
  end

  subgraph Server ["Node.js Server Runtime (/server)"]
    Router[HTTP Request Router & Security Middleware]
    AuthMod[Auth & RBAC Policy Engine]
    WSServer[WebSocket Session & Message Bridge]
    TripMgr[Trip Storage & Management]
    PlaceSvc[Places & Geo Resolution Engine]
    BudgetSvc[Pricing & FX Engine]
    RouteSvc[OSRM Routing & Travel Time]
    AgentCore[Free Agent & LLM Orchestrator]
  end

  subgraph Persistence ["Persistence Layer"]
    SQLite[(SQLite Database: ulisse.db)]
    FileStore[Local Document Store & Backups]
  end

  subgraph External ["External Geo & Weather Services"]
    Nominatim[OpenStreetMap / Nominatim]
    Photon[Photon Typeahead API]
    Overpass[Overpass API: POIs & Stays]
    Wiki[Wikipedia & Wikidata API]
    Meteo[Open-Meteo Weather API]
    OSRM[OSRM Route Engine]
    ECB[Frankfurter / ECB FX Rates]
  end

  UI -->|Fetch + Cookie| HTTPS
  UI -->|WS Upgrade + Cookie| WSS
  HTTPS --> Router
  WSS --> WSServer
  Router --> AuthMod
  WSServer --> AuthMod
  Router --> TripMgr
  Router --> PlaceSvc
  Router --> BudgetSvc
  WSServer --> AgentCore

  TripMgr --> SQLite
  AuthMod --> SQLite
  PlaceSvc --> SQLite
  BudgetSvc --> SQLite
  TripMgr --> FileStore

  PlaceSvc --> Photon
  PlaceSvc --> Nominatim
  PlaceSvc --> Overpass
  PlaceSvc --> Wiki
  RouteSvc --> OSRM
  BudgetSvc --> ECB
  AgentCore --> Meteo
```

---

## 3. Entity-Relationship (ER) Schema

The persistence layer uses a normalized SQLite database with foreign key enforcement and indexed lookups.

```mermaid
erDiagram
    USERS ||--o{ SESSIONS : "issues"
    USERS ||--o{ TRIPS : "owns"
    USERS ||--o{ AUDIT_LOG : "records"

    USERS {
        text id PK
        text email UK
        text display_name
        text password_hash
        text role "user | admin"
        text home_currency
        text locale
        integer is_active
        integer must_change_pw
        integer failed_logins
        text locked_until
        text created_at
    }

    SESSIONS {
        text id PK
        text user_id FK
        text token_hash UK
        text created_at
        text expires_at
        text ip
        text user_agent
    }

    TRIPS {
        text id PK
        text user_id FK
        text title
        text data_json
        text created_at
        text updated_at
    }

    AUDIT_LOG {
        text id PK
        text actor_user_id FK
        text action
        text target
        text meta_json
        text ip
        text created_at
    }

    SETTINGS {
        text key PK
        text value_encrypted
        text updated_by
        text updated_at
    }

    PLACES_CACHE {
        text key PK
        text payload_json
        text source
        text fetched_at
        integer ttl_seconds
    }

    FX_RATES {
        text base PK
        text quote PK
        real rate
        text as_of
        text source
    }
```

---

## 4. End-to-End Data Flow: "Place Search to Itinerary"

This sequence illustrates how user input converts into a verified, geographically routed, and budgeted day-by-day plan without fake data.

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Srv as Server Router
    participant Places as Places / Geo Engine
    participant Cache as Places Cache (SQLite)
    participant Upstream as Upstream APIs (OSM/Wiki/Meteo)
    participant Budget as Budget & FX Engine
    participant Agent as Itinerary Planner

    User->>Srv: GET /api/places/suggest?q=Paris
    Srv->>Cache: Check cached suggestion
    alt Cache Miss
        Srv->>Upstream: Photon / Trie typeahead lookup
        Srv->>Cache: Save suggestions (TTL 30d)
    end
    Srv-->>User: Candidate suggestions list

    User->>Srv: POST /api/places/resolve (selected: "Paris, France")
    Srv->>Places: Geocode & Disambiguate with Nominatim
    Places-->>Srv: Coordinates, bbox, country (FR), currency (EUR), driving side
    Srv-->>User: Resolved destination context

    User->>Srv: POST /api/trips/generate (dates, style, pace, travelers)
    Srv->>Places: Fetch verified POIs (Overpass + Wikipedia GeoSearch)
    Srv->>Upstream: Open-Meteo (forecast / climate normals)
    Srv->>Budget: Calculate cost bands (EUR -> Home Currency via FX rates)
    Srv->>Agent: Run clusterPOIs + OSRM routing + opening_hours feasibility
    Agent-->>Srv: Optimized Itinerary + Leg durations + Provenance metadata
    Srv-->>User: Generated Trip with Data Status Badges
```

---

## 5. Security & Authentication Flow

### 5.1 HTTP Session Authentication & Rotation
```mermaid
sequenceDiagram
    autonumber
    actor Client as User / Admin Client
    participant Auth as Auth Handler (/api/auth)
    participant DB as SQLite (users, sessions, audit_log)

    Client->>Auth: POST /api/auth/login { email, password }
    Auth->>DB: Query user by email
    alt User locked out (failed_logins >= 5 and locked_until > now)
        Auth-->>Client: 429 "Too many failed attempts. Account locked."
    else Invalid credentials
        Auth->>DB: Increment failed_logins (set locked_until if >= 5)
        Auth-->>Client: 401 "Invalid email or password" (generic)
    else Valid credentials
        Auth->>Auth: crypto.scrypt verify (constant-time timingSafeEqual)
        Auth->>DB: Reset failed_logins = 0
        Auth->>Auth: Generate 256-bit cryptographically secure token
        Auth->>DB: Store SHA-256(token) with expiry & IP
        Auth->>DB: Insert AUDIT_LOG entry (login)
        Auth-->>Client: 200 OK + Set-Cookie: sid=<token>; HttpOnly; SameSite=Lax
    end
```

### 5.2 WebSocket Upgrade & RBAC Verification
```mermaid
sequenceDiagram
    autonumber
    actor Browser as Browser WebSocket Client
    participant WSS as WebSocket Bridge (/agent)
    participant Auth as Auth & Policy Engine
    participant DB as SQLite DB

    Browser->>WSS: HTTP 101 Upgrade Request (Origin, Cookie: sid)
    WSS->>Auth: Validate Origin against ALLOWED_ORIGINS
    alt Origin not permitted
        Auth-->>Browser: 403 Forbidden (Upgrade rejected)
    end

    WSS->>Auth: Hash token and lookup active session in DB
    alt Invalid or expired session
        Auth-->>Browser: 401 Unauthorized (Upgrade rejected)
    else Valid session
        Auth-->>WSS: Session valid (attach user_id, role)
        WSS-->>Browser: HTTP 101 Switching Protocols
    end

    Browser->>WSS: Send Message { type: "admin_set_config", ... }
    WSS->>Auth: Verify role === 'admin'
    alt Non-admin user
        WSS-->>Browser: { type: "error", code: "FORBIDDEN", error: "Admin role required" }
    else Admin user
        WSS->>DB: Save config (AES-256-GCM encrypted)
        WSS-->>Browser: { type: "admin_config_saved" }
    end
```

---

## 6. Provenance & Honest Data Architecture

Every data point rendered in the UI adheres to the **Provenance Contract**:

```typescript
interface ProvenanceRecord {
  source: 'osm' | 'wikipedia' | 'wikidata' | 'nominatim' | 'photon' | 'osrm' | 'open-meteo' | 'cost-table' | 'user' | 'bundled';
  fetchedAt: string; // ISO 8601 UTC timestamp
  confidence: 'verified' | 'estimate' | 'sample';
  sourceUrl?: string;
}
```

- **Live Data**: Queried from authoritative public APIs, cached in `places_cache` with strictly governed TTLs.
- **Cost Estimates**: Extracted from empirical country/city tables (`data/costTable.json`) with primary destination currency, mapped to user home currency via cached ECB exchange rates.
- **Sample/Demo Mode**: Activated only when explicit demo build or offline flag is configured; prominently tagged with UI indicators.
