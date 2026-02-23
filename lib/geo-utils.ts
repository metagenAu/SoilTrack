/**
 * Geometry utilities for spatial analysis of application zones.
 *
 * Provides convex hull computation, point-in-polygon testing, and helpers
 * to extract coordinates from GeoJSON features.
 */

import type { FeatureCollection, Geometry, Position } from 'geojson'

// ---------- Convex Hull (Andrew's monotone chain) ----------

/**
 * Compute the convex hull of a set of [lng, lat] coordinate pairs.
 * Returns a closed ring in [lng, lat] order (GeoJSON convention).
 */
export function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return [...points]

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])

  function cross(O: [number, number], A: [number, number], B: [number, number]) {
    return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])
  }

  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }

  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }

  lower.pop()
  upper.pop()
  const hull = [...lower, ...upper]
  // Close the ring
  if (hull.length > 0) hull.push(hull[0])
  return hull
}

// ---------- Point-in-Polygon (ray casting) ----------

/**
 * Test whether point [lng, lat] is inside a polygon ring (array of [lng, lat]).
 * Uses the ray-casting algorithm.
 */
export function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Test whether a point is inside any of multiple polygon rings (union test).
 */
export function pointInAnyPolygon(point: [number, number], rings: [number, number][][]): boolean {
  return rings.some(ring => pointInPolygon(point, ring))
}

// ---------- GeoJSON coordinate extraction ----------

/**
 * Extract all coordinate pairs from a GeoJSON geometry as [lng, lat].
 */
function extractCoordsFromGeometry(geometry: Geometry): [number, number][] {
  const coords: [number, number][] = []

  switch (geometry.type) {
    case 'Point':
      coords.push([geometry.coordinates[0], geometry.coordinates[1]])
      break
    case 'MultiPoint':
    case 'LineString':
      for (const c of geometry.coordinates) {
        coords.push([c[0], c[1]])
      }
      break
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geometry.coordinates) {
        for (const c of ring) {
          coords.push([c[0], c[1]])
        }
      }
      break
    case 'MultiPolygon':
      for (const poly of geometry.coordinates) {
        for (const ring of poly) {
          for (const c of ring) {
            coords.push([c[0], c[1]])
          }
        }
      }
      break
    case 'GeometryCollection':
      for (const g of geometry.geometries) {
        coords.push(...extractCoordsFromGeometry(g))
      }
      break
  }

  return coords
}

/**
 * Extract all coordinates from a FeatureCollection as [lng, lat] pairs.
 */
export function extractAllCoords(fc: FeatureCollection): [number, number][] {
  const coords: [number, number][] = []
  for (const feature of fc.features) {
    if (feature.geometry) {
      coords.push(...extractCoordsFromGeometry(feature.geometry))
    }
  }
  return coords
}

/**
 * Extract polygon rings (exterior only) from a FeatureCollection.
 * Returns arrays of [lng, lat] coordinate rings.
 */
export function extractPolygonRings(fc: FeatureCollection): [number, number][][] {
  const rings: [number, number][][] = []
  for (const f of fc.features) {
    const geom = f.geometry
    if (!geom) continue
    if (geom.type === 'Polygon') {
      rings.push(geom.coordinates[0] as [number, number][])
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        rings.push(poly[0] as [number, number][])
      }
    }
  }
  return rings
}

/**
 * Compute the convex hull of all coordinates in a FeatureCollection.
 * Returns a closed [lng, lat] ring suitable for point-in-polygon testing.
 */
export function convexHullFromFC(fc: FeatureCollection): [number, number][] {
  const coords = extractAllCoords(fc)
  if (coords.length < 3) return coords
  return convexHull(coords)
}

// ---------- Statistics ----------

export interface ZoneStats {
  n: number
  mean: number
  stdDev: number
  stdError: number
  min: number
  q1: number
  median: number
  q3: number
  max: number
  values: number[]
}

/**
 * Compute summary statistics for a set of numeric values.
 */
export function computeStats(values: number[]): ZoneStats {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  if (n === 0) {
    return { n: 0, mean: 0, stdDev: 0, stdError: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0, values: [] }
  }

  const mean = sorted.reduce((s, v) => s + v, 0) / n
  const variance = n > 1 ? sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0
  const stdDev = Math.sqrt(variance)
  const stdError = n > 0 ? stdDev / Math.sqrt(n) : 0

  const q = (p: number) => {
    const pos = (n - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    const frac = pos - lo
    return sorted[lo] * (1 - frac) + sorted[hi] * frac
  }

  return {
    n,
    mean,
    stdDev,
    stdError,
    min: sorted[0],
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: sorted[n - 1],
    values: sorted,
  }
}

// ---------- Linear regression ----------

export interface RegressionResult {
  slope: number
  intercept: number
  rSquared: number
  n: number
  pValue: number | null
}

/**
 * Simple ordinary least-squares linear regression.
 * Returns slope, intercept, R-squared, and p-value for slope != 0.
 */
export function linearRegression(xs: number[], ys: number[]): RegressionResult {
  const n = xs.length
  if (n < 2) {
    return { slope: 0, intercept: ys[0] ?? 0, rSquared: 0, n, pValue: null }
  }

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
  for (let i = 0; i < n; i++) {
    sumX += xs[i]
    sumY += ys[i]
    sumXY += xs[i] * ys[i]
    sumX2 += xs[i] * xs[i]
    sumY2 += ys[i] * ys[i]
  }

  const meanX = sumX / n
  const meanY = sumY / n
  const ssXX = sumX2 - n * meanX * meanX
  const ssYY = sumY2 - n * meanY * meanY
  const ssXY = sumXY - n * meanX * meanY

  if (ssXX === 0) {
    return { slope: 0, intercept: meanY, rSquared: 0, n, pValue: null }
  }

  const slope = ssXY / ssXX
  const intercept = meanY - slope * meanX
  const rSquared = ssYY !== 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0

  // t-test for slope significance
  let pValue: number | null = null
  if (n > 2) {
    const ssRes = ssYY - slope * ssXY
    const mse = ssRes / (n - 2)
    const seBeta = Math.sqrt(Math.max(0, mse / ssXX))
    if (seBeta > 0) {
      const tStat = slope / seBeta
      // Approximate two-tailed p-value using t-distribution with n-2 df
      pValue = tDistPValue(Math.abs(tStat), n - 2)
    }
  }

  return { slope, intercept, rSquared, n, pValue }
}

/**
 * Approximate two-tailed p-value for t-distribution.
 * Uses the regularized incomplete beta function approximation.
 */
function tDistPValue(t: number, df: number): number {
  // Use the relationship between t-distribution CDF and incomplete beta function
  const x = df / (df + t * t)
  const p = 0.5 * incompleteBeta(x, df / 2, 0.5)
  return Math.min(1, 2 * p) // two-tailed
}

/**
 * Regularized incomplete beta function I_x(a, b) via continued fraction (Lentz).
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  // Use the log-beta for the prefactor
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b)
  const prefactor = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta)

  // Lentz's continued fraction
  const maxIter = 200
  const eps = 1e-14
  let f = 1, c = 1, d = 0

  for (let m = 0; m <= maxIter; m++) {
    let numerator: number
    if (m === 0) {
      numerator = 1
    } else {
      const k = m
      const isEven = k % 2 === 0
      const m2 = Math.floor(k / 2)
      if (isEven) {
        numerator = (m2 * (b - m2) * x) / ((a + k - 1) * (a + k))
      } else {
        numerator = -((a + m2) * (a + b + m2) * x) / ((a + k) * (a + k + 1))
      }
    }

    d = 1 + numerator * d
    if (Math.abs(d) < eps) d = eps
    d = 1 / d

    c = 1 + numerator / c
    if (Math.abs(c) < eps) c = eps

    f *= c * d
    if (Math.abs(c * d - 1) < eps && m > 0) break
  }

  return (prefactor / a) * f
}

/** Stirling's approximation for ln(Gamma(x)) */
function lnGamma(x: number): number {
  if (x <= 0) return 0
  // Lanczos approximation
  const g = 7
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  }
  x -= 1
  let a = coef[0]
  for (let i = 1; i < g + 2; i++) {
    a += coef[i] / (x + i)
  }
  const t = x + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}
