# John Deere Integration Scoping - SoilTrack Trials

**Date:** 2026-02-16
**Status:** Research / Scoping
**Author:** Claude (AI-assisted research)

---

## 1. Executive Summary

This document scopes the feasibility and recommended approach for integrating John Deere Operations Center data (yield, applications, seeding, etc.) into SoilTrack's trial management system. Three integration paths are evaluated: direct John Deere API, a middleware/unified API (Leaf Agriculture), and manual file import. The recommended approach is a **phased strategy** starting with structured file import (quick win), then direct John Deere API integration for automated data flow.

---

## 2. Current SoilTrack Architecture (Relevant to Integration)

### Tech Stack
- **Frontend/Backend:** Next.js 14 (App Router, TypeScript)
- **Database:** Supabase (PostgreSQL) with Row Level Security
- **Maps:** Leaflet / react-leaflet (point-based, Australia-centric)
- **Data parsing:** PapaParse (CSV), xlsx (Excel)

### Trial Data Model
Trials are identified by human-readable IDs (e.g. `"25#07"`). Each trial has:
- **`trials`** table: metadata (location, GPS as text, crop, trial_type, dates, status)
- **`treatments`** table: treatment definitions (product, rate, timing, fertiliser)
- **`plot_data`** table: per-plot measurements (yield_t_ha, plant_count, vigour, disease_score) + `raw_data JSONB`
- **`management_log`** table: free-text activity entries per trial

### Current Data Ingestion
All data enters via **file upload** (Excel/CSV). The pipeline:
1. File classification by filename pattern
2. Column mapping via predefined maps
3. Staging in `raw_uploads` (pending/mapped)
4. Atomic upsert via `load_and_track` PostgreSQL RPC
5. Natural-key deduplication (re-upload is idempotent)

### Key Gaps for JD Integration
- **No OAuth/third-party auth** flows exist (only Supabase auth)
- **No outbound HTTP calls** to external APIs anywhere
- **No GeoJSON/shapefile/polygon** handling (point-only spatial)
- **No background job queue** or scheduled processing
- **No webhook receivers**
- **Yield is stored as a single `yield_t_ha` decimal** per plot — no spatial yield map data model

---

## 3. John Deere API Ecosystem

### 3.1 Available APIs (via developer.deere.com)

| API | Description | Relevance to Trials |
|-----|-------------|---------------------|
| **Field Operations** | Harvest, planting, application, tillage records with measurements | **HIGH** — yield data, application records |
| **Map Layers** | Spatial operation data (yield maps, application maps) | **HIGH** — georeferenced yield data |
| **Organizations** | User org structure, partnerships | **MEDIUM** — needed for auth/consent |
| **Equipment** | Machine/implement data, telematics | **LOW** — not core to trial data |
| **Work Plans** | Send prescriptions to displays | **LOW** — future potential for trial plans |
| **Prescriptions** | Upload VRA maps | **LOW** — future potential |
| **Files** | Raw data file management | **MEDIUM** — alternative to structured API |
| **Field Sync** | Match fields between systems | **MEDIUM** — link JD fields to trials |

### 3.2 Field Operations API — Key Data Points

The Field Operations API returns operation records for:

- **Harvest:** yield measurements (per-point georeferenced), total yield, area, moisture, speed
- **Application:** products applied, rates, total material, area covered, tank mix details
- **Seeding/Planting:** seed variety, population, depth, area
- **Tillage:** implement type, depth, area

Measurements include per-point data with GeoJSON geometry (`GeometryCollection` of `Point` coordinates), and summary-level aggregates (`area`, `averageSpeed`, `totalMaterial`, `averageMaterial`, `productTotals`).

### 3.3 Authentication & Access

- **OAuth 2.0** with PKCE flow
- Developer must register at [developer.deere.com](https://developer.deere.com)
- Grower must **consent** to share data with your app via Operations Center "Connections"
- Scopes control which APIs are accessible

### 3.4 Approval Process & Timeline

| Phase | Duration | Details |
|-------|----------|---------|
| Sandbox development | Up to 6 months | Free testing with sandbox URLs, max 5 orgs, 150K calls/month |
| Testing & review | Varies | JD team reviews API call logs and data usage |
| Production agreement | Varies | DocuSign agreement, production URL access |
| Ongoing | Indefinite | Must comply with data usage terms |

**Contact:** JohnDeereIntegrations@JohnDeere.com

### 3.5 Australia Availability

Operations Center is available in Australia ([deere.com.au/operations-center](https://www.deere.com.au/en/technology-products/precision-ag-technology/data-management/operations-center/)). The developer API program appears globally managed — no Australia-specific restrictions found.

---

## 4. Integration Approaches (Evaluated)

### Option A: Direct John Deere API Integration

**How it works:** SoilTrack registers as a John Deere developer application, implements OAuth 2.0, and calls the Field Operations API directly.

**Pros:**
- Full control over data flow and mapping
- No middleware costs
- Direct relationship with JD developer program
- Access to all API capabilities

**Cons:**
- Significant upfront development (OAuth flow, API client, data mapping, error handling)
- 6-month sandbox period before production
- JD approval process and production agreement required
- Must handle JD API versioning/deprecation (e.g., Equipment API migration in 2025)
- Only covers John Deere equipment (not CNH, AGCO, etc.)

**Effort estimate — new infrastructure needed:**
- OAuth 2.0 flow (consent, token exchange, refresh) — new to SoilTrack
- Background job queue for polling/syncing operations data
- JD API client service with retry/rate-limit handling
- Data mapping layer (JD field operations → SoilTrack plot_data/treatments)
- Field matching UI (link JD fields/operations to SoilTrack trials)
- Token/connection storage (new DB table for JD credentials per user/org)

### Option B: Leaf Agriculture Unified API (Middleware)

**How it works:** Use [Leaf's API](https://withleaf.io/) as a middleware layer. Leaf handles OAuth, data normalization, and multi-provider support.

**Pros:**
- Standardized GeoJSON output across all equipment brands (JD, CNH, AgLeader, Trimble, Climate FieldView)
- Handles OAuth complexity and token management
- Pre-cleaned, standardized data
- Faster time to integration
- Multi-brand support from day one

**Cons:**
- Per-acre pricing (contact Leaf for quotes — not publicly listed)
- Dependency on third-party middleware
- Less control over data refresh timing
- May not expose all JD-specific data fields
- Additional vendor relationship to manage

**Effort estimate:**
- Leaf API client + auth (simpler than direct JD)
- Data mapping layer (Leaf normalized data → SoilTrack)
- Still need field matching UI
- Still need background sync mechanism

### Option C: Enhanced File Import (Quick Win)

**How it works:** Leverage the fact that growers can already **export data from Operations Center** as files (CSV, shapefiles). Build parsers for JD export formats so users can upload them through the existing SoilTrack upload pipeline.

**Pros:**
- Minimal new infrastructure (extends existing upload pipeline)
- No API registration, OAuth, or approval process
- No ongoing API costs
- Works today with existing SoilTrack architecture
- Growers already familiar with exporting from Operations Center

**Cons:**
- Manual process (user must export from JD, then upload to SoilTrack)
- No real-time or automated sync
- May miss some data granularity available via API
- User friction for repeated imports

**Effort estimate:**
- New file classifier patterns for JD export formats
- Column map definitions for JD yield/application CSVs
- Possibly a shapefile/GeoJSON parser for spatial yield data
- Documentation for users on how to export from Operations Center

---

## 5. Recommended Approach: Phased Strategy

### Phase 1: JD File Import Support (Low effort, immediate value)

Extend the existing upload pipeline to recognize and parse John Deere Operations Center export files:

1. **Yield data CSV/Excel exports** — map JD columns (crop, yield, moisture, area, field, date) to `plot_data` table
2. **Application data exports** — map to `treatments` or a new `applications` table
3. **Add documentation/guidance** in the UI on how to export from Operations Center

This requires:
- New entries in `lib/parsers/classify.ts` for JD file patterns
- New column maps in `lib/parsers/column-maps.ts`
- Minimal schema changes (possibly none if JD data maps cleanly to existing tables)

### Phase 2: Direct John Deere API Integration (Medium effort, high value)

Build a proper API integration for automated data sync:

1. **Register as JD developer** at developer.deere.com
2. **Implement OAuth 2.0** consent flow (new `/api/auth/deere/` routes)
3. **Build Field Operations API client** (harvest yield, applications, seeding)
4. **Add background sync** mechanism (could be Supabase Edge Functions or a cron-based approach)
5. **Field matching UI** — let users link JD Operations Center fields to SoilTrack trials
6. **Data mapping service** — transform JD operation measurements to SoilTrack plot_data format

New database tables needed:
```sql
-- Store JD OAuth tokens per user/organization
deere_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  organization_id TEXT,  -- JD org ID
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Map JD fields to SoilTrack trials
deere_field_mappings (
  id UUID PRIMARY KEY,
  deere_connection_id UUID REFERENCES deere_connections,
  deere_field_id TEXT,
  deere_field_name TEXT,
  trial_id TEXT REFERENCES trials,
  last_synced_at TIMESTAMPTZ
)

-- Track synced operations to avoid re-processing
deere_synced_operations (
  id UUID PRIMARY KEY,
  deere_field_mapping_id UUID REFERENCES deere_field_mappings,
  deere_operation_id TEXT UNIQUE,
  operation_type TEXT,  -- 'harvest', 'application', 'seeding', 'tillage'
  synced_at TIMESTAMPTZ,
  raw_data JSONB
)
```

### Phase 3 (Future): Spatial Yield Maps & Prescriptions

- Upgrade from point-based GPS to **polygon/GeoJSON field boundaries**
- Render **spatial yield maps** (heatmaps) on Leaflet
- Send **prescriptions/work plans** back to JD for variable-rate trial applications
- Consider multi-provider support via Leaf API if demand exists for CNH/AGCO/Trimble

---

## 6. Data Mapping: JD Operations → SoilTrack

### Yield Data (Harvest Operations)

| JD Field Operations API | SoilTrack Target | Notes |
|------------------------|------------------|-------|
| Operation → measurements → yield | `plot_data.yield_t_ha` | May need unit conversion |
| Operation → measurements → moisture | `plot_data.raw_data` (JSONB) | Not in current schema as column |
| Operation → measurements → area | `plot_data.raw_data` (JSONB) | |
| Operation → field reference | Trial matching via `deere_field_mappings` | |
| Operation → timestamp | `plot_data.raw_data` or new column | |
| Operation → geometry (GeoJSON points) | Not currently stored | Phase 3 spatial |

### Application Data

| JD Field Operations API | SoilTrack Target | Notes |
|------------------------|------------------|-------|
| Operation → product name | `treatments.product` or `treatments.application` | |
| Operation → rate (totalMaterial/area) | `treatments.rate` | |
| Operation → timestamp | `management_log.activity` | |
| Operation → productTotals | `treatments.fertiliser` or new field | |

### Key Challenge: Trial ↔ Field Matching

SoilTrack trials are **plot-based experiments** within a field, while JD Operations Center records are **whole-field operations**. The mapping challenge:

- A JD "field" may contain multiple SoilTrack trial plots
- JD yield data is georeferenced points across the entire field — need to **spatially filter** to trial plot boundaries
- For strip trials / paddock trials, JD data may map more directly
- For RCBD trials with small plots, JD combine yield data resolution may not align with plot boundaries

**This is the most significant technical challenge** and needs careful design per trial type.

---

## 7. Key Risks & Considerations

| Risk | Severity | Mitigation |
|------|----------|------------|
| JD approval takes too long | Medium | Start Phase 1 (file import) immediately; begin JD registration in parallel |
| Yield data resolution doesn't match trial plots | High | Design spatial filtering; may only work for strip/paddock trials initially |
| API rate limits (150K/month sandbox) | Low | Batch requests, cache aggressively, use webhooks where available |
| JD API deprecation/versioning | Medium | Monitor developer.deere.com/whats-new; build abstraction layer |
| Only covers John Deere equipment | Medium | Many AU growers use JD; consider Leaf API in Phase 3 for multi-brand |
| Grower consent management | Low | Standard OAuth consent flow; clear UX for connecting/disconnecting |
| Token refresh/expiry handling | Low | Standard OAuth refresh token pattern; monitor for failures |

---

## 8. Immediate Next Steps

1. **Gather sample JD export files** — Get example yield CSV and application data exports from Operations Center to understand exact column formats
2. **Register JD developer account** — Create account at developer.deere.com to access full API documentation (much is gated behind login)
3. **Define trial types for JD integration** — Which trial types (strip, paddock, RCBD) benefit most from JD data import?
4. **Prototype file parser** — Build a JD yield data column map for the existing upload pipeline
5. **Design field↔trial matching UX** — Wireframe how users will link JD operations to specific trials

---

## 9. Sources

- [John Deere Developer Portal](https://developer.deere.com/)
- [Field Operations API](https://developer.deere.com/dev-docs/field-operations)
- [JD API What's New](https://developer.deere.com/whats-new)
- [JD Operations Center AU](https://www.deere.com.au/en/technology-products/precision-ag-technology/data-management/operations-center/)
- [JD Getting Started Guide](https://developer.deere.com/precision/get-started)
- [JD OAuth2 C# Example (GitHub)](https://github.com/JohnDeere/OperationsCenterAPI-OAuth2-CSharp-Example)
- [Leaf Agriculture - Unified Farm Data API](https://withleaf.io/)
- [Leaf - John Deere Provider](https://withleaf.io/providers/johndeere)
- [Leaf - Field Operations Product](https://withleaf.io/products/field-operations/)
- [GeoPard Agriculture - JD Integration](https://geopard.tech/johndeere/)
- [JD Yield Documentation](https://www.deere.com/en/technology-products/precision-ag-technology/data-management/yield-documentation/)
- [AgriCapture JD Integration Case Study](https://agricapture.com/john-deere-integration-powers-agricaptures-growth-through-automation/)
