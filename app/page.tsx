import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Link from 'next/link'

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
          font-family: 'DM Sans', system-ui, sans-serif;
          background: #161F28;
          color: #fff;
          overflow: hidden;
        }

        .landing-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 55% 50% at 50% 50%, rgba(0,76,151,0.22) 0%, transparent 65%),
            radial-gradient(ellipse 35% 30% at 35% 45%, rgba(0,139,206,0.08) 0%, transparent 50%),
            radial-gradient(ellipse 30% 30% at 65% 55%, rgba(0,151,117,0.05) 0%, transparent 45%),
            linear-gradient(175deg, #0c1420 0%, #0e1a2a 30%, #002E5D 60%, #0a1520 85%, #161F28 100%);
        }

        .landing-grain {
          position: absolute;
          inset: 0;
          opacity: 0.022;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 180px;
        }

        .landing-topbar {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 20;
          padding: 32px 6vw;
          display: flex;
          justify-content: space-between;
          align-items: center;
          opacity: 0;
          animation: landing-fadeDown 0.6s ease forwards 0.1s;
        }

        .landing-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .landing-logo-icon {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #008BCE;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 15px;
          color: #fff;
        }
        .landing-wm { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; line-height: 1.1; }
        .landing-wm span { font-weight: 400; }
        .landing-wm sup { font-size: 7px; letter-spacing: 1px; vertical-align: super; opacity: 0.35; margin-left: 1px; }

        .landing-topbar a {
          color: rgba(255,255,255,0.4);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: color 0.2s;
        }
        .landing-topbar a:hover { color: rgba(255,255,255,0.8); }

        .landing-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 2;
          padding-bottom: 30px;
        }

        .landing-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .landing-signpost {
          margin-bottom: 32px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.2s;
        }
        .landing-sp-bold {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #99F0FA;
          opacity: 0.5;
        }
        .landing-sp-reg {
          font-size: 11px;
          font-weight: 400;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.18);
        }

        .landing-h1 {
          font-size: clamp(34px, 5vw, 66px);
          font-weight: 500;
          line-height: 1.18;
          letter-spacing: -1px;
          color: rgba(255,255,255,0.7);
          margin-bottom: 28px;
          opacity: 0;
          animation: landing-fadeUp 1s ease forwards 0.35s;
        }
        .landing-h1 .l { display: block; }
        .landing-h1 .indent {
          display: block;
          padding-left: clamp(30px, 4vw, 70px);
        }
        .landing-h1 strong {
          font-weight: 800;
          color: #fff;
        }
        .landing-h1 .dot {
          color: #00BB7E;
          font-weight: 800;
        }

        .landing-lead {
          font-size: clamp(13px, 1.3vw, 16px);
          font-weight: 500;
          color: rgba(255,255,255,0.25);
          line-height: 1.7;
          margin-bottom: 40px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.55s;
        }

        .landing-cta {
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.7s;
        }
        .landing-btn {
          padding: 14px 40px;
          background: #008BCE;
          border: none;
          border-radius: 50px;
          color: #fff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s;
          box-shadow: 0 4px 20px rgba(0,139,206,0.2);
          text-decoration: none;
          display: inline-block;
        }
        .landing-btn:hover {
          background: #006AC6;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(0,139,206,0.3);
        }

        .landing-stats {
          position: relative;
          z-index: 20;
          padding: 20px 6vw;
          display: flex;
          justify-content: center;
          gap: min(48px, 5vw);
          border-top: 1px solid rgba(255,255,255,0.04);
          background: rgba(22,31,40,0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          opacity: 0;
          animation: landing-fadeUp 0.6s ease forwards 0.95s;
        }

        .landing-st { display: flex; flex-direction: column; align-items: center; }
        .landing-st-v {
          font-family: 'DM Mono', monospace;
          font-size: 18px;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          letter-spacing: -0.5px;
        }
        .landing-st-l {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.12);
          margin-top: 2px;
        }

        .landing-gh {
          position: absolute;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: rgba(153,240,250,0.04);
          letter-spacing: 1.5px;
          white-space: nowrap;
          z-index: 1;
          user-select: none;
          pointer-events: none;
          animation: landing-ghP 10s ease-in-out infinite;
        }
        .landing-g1 { top: 16%; left: 8%; transform: rotate(-0.8deg); }
        .landing-g2 { top: 28%; right: 7%; transform: rotate(0.5deg); animation-delay: 3s; }
        .landing-g3 { bottom: 22%; left: 12%; transform: rotate(-0.3deg); animation-delay: 6s; }
        .landing-g4 { bottom: 32%; right: 10%; transform: rotate(0.6deg); animation-delay: 8s; }

        @keyframes landing-ghP {
          0%, 100% { opacity: 0.015; }
          50% { opacity: 0.06; }
        }
        @keyframes landing-fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-fadeDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 600px) {
          .landing-stats { gap: 20px; flex-wrap: wrap; padding: 16px 20px; }
          .landing-gh { display: none; }
          .landing-hero { padding: 0 20px; }
          .landing-topbar { padding: 24px 24px; }
        }
      `}</style>

      <div className="landing-page">
        <div className="landing-bg" />
        <div className="landing-grain" />

        <div className="landing-gh landing-g1">pH 6.8 · EC 1.24 · OC 2.41%</div>
        <div className="landing-gh landing-g2">DNA 1.2M reads · 847 OTUs · Shannon 4.12</div>
        <div className="landing-gh landing-g3">Yield 3.8t/ha · Vigour 8 · Disease 1</div>
        <div className="landing-gh landing-g4">-29.053776, 151.291796 · Trial 24#01</div>

        <div className="landing-topbar">
          <div className="landing-logo">
            <div className="landing-logo-icon">M</div>
            <div>
              <div className="landing-wm">
                <strong>meta</strong><span>gen</span><sup>AUS</sup>
              </div>
            </div>
          </div>
          <Link href="/login">Sign In →</Link>
        </div>

        <div className="landing-main">
          <div className="landing-hero">

            <div className="landing-signpost">
              <span className="landing-sp-bold">SoilTrack </span>
              <span className="landing-sp-reg">Trial Management</span>
            </div>

            <h1 className="landing-h1">
              <span className="l">Novel, scalable</span>
              <span className="l">trial management for</span>
              <span className="indent">
                <strong>soil health innovation<span className="dot">.</span></strong>
              </span>
            </h1>

            <p className="landing-lead">
              An integrated platform to design, track and analyse<br />
              field trials across every crop and region.
            </p>

            <div className="landing-cta">
              <Link href="/login" className="landing-btn">Sign In</Link>
            </div>

          </div>
        </div>

        <div className="landing-stats">
          <div className="landing-st">
            <div className="landing-st-v">{stats.activeTrials.toLocaleString()}</div>
            <div className="landing-st-l">Active Trials</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">{stats.totalSamples.toLocaleString()}</div>
            <div className="landing-st-l">Soil Samples</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">{stats.crops.toLocaleString()}</div>
            <div className="landing-st-l">Crops</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">{stats.regions.toLocaleString()}</div>
            <div className="landing-st-l">Regions</div>
          </div>
          <div className="landing-st">
            <div className="landing-st-v">{stats.products.toLocaleString()}</div>
            <div className="landing-st-l">Products</div>
          </div>
        </div>
      </div>
    </>
  )
}
