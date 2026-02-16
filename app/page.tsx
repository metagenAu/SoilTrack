import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import Image from 'next/image'
import AnimatedCounter from '@/components/landing/AnimatedCounter'

export const dynamic = 'force-dynamic'

async function getLandingStats() {
  const supabase = createAdminSupabaseClient()

  if (!supabase) {
    return { activeTrials: 0, totalSamples: 0, crops: 0, regions: 0, products: 0 }
  }

  const [trialsRes, samplesRes, treatmentsRes, clientsRes] = await Promise.all([
    supabase.from('trials').select('status, crop'),
    supabase.from('soil_health_samples').select('id'),
    supabase.from('treatments').select('product'),
    supabase.from('clients').select('region'),
  ])

  const trials = trialsRes.data || []
  const samples = samplesRes.data || []
  const treatments = treatmentsRes.data || []
  const clients = clientsRes.data || []

  const activeTrials = trials.filter((t) => t.status === 'active').length
  const totalSamples = samples.length
  const crops = new Set(trials.map((t) => t.crop).filter(Boolean)).size
  const regions = new Set(clients.map((c) => c.region).filter(Boolean)).size
  const products = new Set(
    treatments.map((t) => t.product).filter((p) => p && p !== 'Control')
  ).size

  return { activeTrials, totalSamples, crops, regions, products }
}

export default async function LandingPage() {
  const stats = await getLandingStats()

  return (
    <>
      <style>{`
        .landing-page {
          position: relative;
          width: 100%;
          height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: var(--font-sans), system-ui, sans-serif;
          background: #0088CC;
          color: #fff;
          overflow: hidden;
        }

        /* ═══ BACKGROUND IMAGE ═══ */
        .landing-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .landing-bg img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        /* ═══ TOP BAR ═══ */
        .landing-topbar {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 20;
          padding: 36px 6vw;
          display: flex;
          justify-content: space-between;
          align-items: center;
          opacity: 0;
          animation: landing-fadeDown 0.6s ease forwards 0.1s;
        }

        .landing-logo {
          display: flex;
          align-items: center;
        }
        .landing-logo img {
          height: 40px;
          width: auto;
        }

        .landing-topbar a {
          color: rgba(255,255,255,0.7);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: all 0.25s;
          padding: 10px 24px;
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 50px;
        }
        .landing-topbar a:hover {
          color: #fff;
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.4);
        }

        /* ═══ MAIN ═══ */
        .landing-main {
          flex: 1;
          display: flex;
          align-items: flex-end;
          position: relative;
          z-index: 10;
          padding: 0 6vw;
          padding-bottom: clamp(60px, 8vh, 100px);
        }

        .landing-hero {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          max-width: 620px;
        }

        /* ═══ SIGNPOST ═══ */
        .landing-signpost {
          margin-bottom: 28px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.2s;
        }
        .landing-sp-bold {
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 700;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.95);
        }
        .landing-sp-reg {
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 400;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
        }

        /* ═══ HEADLINE ═══ */
        .landing-h1 {
          font-size: clamp(36px, 5vw, 72px);
          font-weight: 700;
          line-height: 1.08;
          letter-spacing: -2px;
          color: #fff;
          margin-bottom: 28px;
          opacity: 0;
          animation: landing-fadeUp 1s ease forwards 0.35s;
        }
        .landing-h1 .l { display: block; }
        .landing-h1 .accent {
          color: rgba(255,255,255,0.5);
          font-weight: 400;
        }
        .landing-h1 .dot {
          color: #7DF9C1;
          font-weight: 700;
        }

        /* ═══ LEAD ═══ */
        .landing-lead {
          font-size: clamp(15px, 1.5vw, 19px);
          font-weight: 400;
          color: rgba(255,255,255,0.65);
          line-height: 1.7;
          letter-spacing: -0.01em;
          margin-bottom: 36px;
          max-width: 480px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.55s;
        }
        /* ═══ CTA ═══ */
        .landing-cta {
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.8s;
        }
        .landing-btn {
          position: relative;
          padding: 16px 44px;
          background: #fff;
          border: none;
          border-radius: 50px;
          color: #0077B6;
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.25s;
          text-decoration: none;
          display: inline-block;
        }
        .landing-btn:hover {
          background: rgba(255,255,255,0.9);
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(0,0,0,0.15);
        }

        /* ═══ STATS BAR ═══ */
        .landing-stats {
          position: relative;
          z-index: 20;
          padding: 24px 6vw;
          display: flex;
          justify-content: center;
          gap: min(48px, 5vw);
          border-top: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,100,180,0.3);
          backdrop-filter: blur(12px);
          opacity: 0;
          animation: landing-fadeUp 0.6s ease forwards 0.95s;
        }

        .landing-st {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .landing-st-v {
          font-family: var(--font-mono), monospace;
          font-size: 22px;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          letter-spacing: -0.5px;
        }
        .landing-st-l {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-top: 4px;
        }

        /* ═══ KEYFRAMES ═══ */
        @keyframes landing-fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-fadeDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 600px) {
          .landing-stats { gap: 20px; flex-wrap: wrap; padding: 16px 20px; }
          .landing-hero { padding: 0 8px; }
          .landing-topbar { padding: 24px 24px; }
        }
      `}</style>

      <div className="landing-page">
        <div className="landing-bg">
          <Image
            src="/landing-bg.png"
            alt=""
            fill
            priority
            style={{ objectFit: 'cover', objectPosition: 'center' }}
          />
        </div>

        <div className="landing-topbar">
          <div className="landing-logo">
            <Image
              src="/metagen-logo-electric.png"
              alt="Metagen Australia"
              width={200}
              height={40}
              priority
              style={{ height: '40px', width: 'auto' }}
            />
          </div>
          <Link href="/login">Sign In</Link>
        </div>

        <div className="landing-main">
          <div className="landing-hero">

            <div className="landing-signpost">
              <span className="landing-sp-bold">SoilTrack </span>
              <span className="landing-sp-reg">Trial Management</span>
            </div>

            <h1 className="landing-h1">
              <span className="l"><span className="accent">Generating</span></span>
              <span className="l">soil health</span>
              <span className="l">insights at</span>
              <span className="l">scale<span className="dot">.</span></span>
            </h1>

            <p className="landing-lead">
              Powering deeper understanding across agricultural trials,
              from plot to portfolio.
            </p>

            <div className="landing-cta">
              <Link href="/login" className="landing-btn">Sign In</Link>
            </div>

          </div>
        </div>

        <div className="landing-stats">
          <div className="landing-st">
            <div className="landing-st-v">
              <AnimatedCounter value={stats.activeTrials} duration={1800} />
            </div>
            <div className="landing-st-l">Active Trials</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">
              <AnimatedCounter value={stats.totalSamples} duration={2200} />
            </div>
            <div className="landing-st-l">Soil Samples</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">
              <AnimatedCounter value={stats.crops} duration={1500} />
            </div>
            <div className="landing-st-l">Crops</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">
              <AnimatedCounter value={stats.regions} duration={1500} />
            </div>
            <div className="landing-st-l">Regions</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">
              <AnimatedCounter value={stats.products} duration={1500} />
            </div>
            <div className="landing-st-l">Products</div>
          </div>
        </div>
      </div>
    </>
  )
}
