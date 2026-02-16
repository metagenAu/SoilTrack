import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import ParticleNetwork from '@/components/landing/ParticleNetwork'
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
          font-family: 'Inter', system-ui, sans-serif;
          background: #161F28;
          color: #fff;
          overflow: hidden;
        }

        /* ═══ BACKGROUND ═══ */
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

        /* ═══ FLOATING ORBS ═══ */
        .landing-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          z-index: 1;
        }
        .landing-orb-1 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(0,139,206,0.15) 0%, transparent 70%);
          top: 10%;
          left: 15%;
          animation: landing-orbFloat1 12s ease-in-out infinite;
        }
        .landing-orb-2 {
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(0,187,126,0.1) 0%, transparent 70%);
          bottom: 20%;
          right: 10%;
          animation: landing-orbFloat2 15s ease-in-out infinite;
        }
        .landing-orb-3 {
          width: 250px; height: 250px;
          background: radial-gradient(circle, rgba(153,240,250,0.06) 0%, transparent 70%);
          top: 50%;
          right: 30%;
          animation: landing-orbFloat3 18s ease-in-out infinite;
        }
        .landing-orb-4 {
          width: 350px; height: 350px;
          background: radial-gradient(circle, rgba(0,76,151,0.12) 0%, transparent 70%);
          bottom: 30%;
          left: 5%;
          animation: landing-orbFloat2 20s ease-in-out infinite reverse;
        }

        @keyframes landing-orbFloat1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
          33% { transform: translate(60px, -40px) scale(1.1); opacity: 1; }
          66% { transform: translate(-30px, 30px) scale(0.9); opacity: 0.7; }
        }
        @keyframes landing-orbFloat2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.5; }
          50% { transform: translate(-50px, -60px) scale(1.15); opacity: 0.9; }
        }
        @keyframes landing-orbFloat3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
          25% { transform: translate(40px, 20px) scale(1.05); opacity: 0.8; }
          50% { transform: translate(-20px, -50px) scale(0.95); opacity: 0.5; }
          75% { transform: translate(30px, -30px) scale(1.1); opacity: 0.7; }
        }

        /* ═══ TOP BAR ═══ */
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
          font-weight: 700;
          font-size: 15px;
          color: #fff;
          box-shadow: 0 0 20px rgba(0,139,206,0.3);
        }
        .landing-wm { font-size: 16px; font-weight: 600; letter-spacing: -0.3px; line-height: 1.1; }
        .landing-wm span { font-weight: 300; }
        .landing-wm sup { font-size: 7px; letter-spacing: 1px; vertical-align: super; opacity: 0.35; margin-left: 1px; }

        .landing-topbar a {
          color: rgba(255,255,255,0.4);
          text-decoration: none;
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 0.01em;
          transition: color 0.25s;
        }
        .landing-topbar a:hover { color: rgba(255,255,255,0.8); }

        /* ═══ MAIN ═══ */
        .landing-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 10;
          padding-bottom: 30px;
        }

        .landing-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        /* ═══ SIGNPOST ═══ */
        .landing-signpost {
          margin-bottom: 32px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.2s;
        }
        .landing-sp-bold {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #99F0FA;
          opacity: 0.5;
        }
        .landing-sp-reg {
          font-size: 11px;
          font-weight: 300;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.18);
        }

        /* ═══ HEADLINE ═══ */
        .landing-h1 {
          font-size: clamp(34px, 5vw, 66px);
          font-weight: 300;
          line-height: 1.15;
          letter-spacing: -1.5px;
          color: rgba(255,255,255,0.6);
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
          font-weight: 700;
          color: #fff;
        }
        .landing-h1 .dot {
          color: #00BB7E;
          font-weight: 700;
        }

        /* ═══ LEAD ═══ */
        .landing-lead {
          font-size: clamp(13px, 1.3vw, 16px);
          font-weight: 400;
          color: rgba(255,255,255,0.25);
          line-height: 1.7;
          letter-spacing: -0.01em;
          margin-bottom: 40px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.55s;
        }

        /* ═══ CTA ═══ */
        .landing-cta {
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.7s;
        }
        .landing-btn {
          position: relative;
          padding: 14px 40px;
          background: #008BCE;
          border: none;
          border-radius: 50px;
          color: #fff;
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 20px rgba(0,139,206,0.25), 0 0 40px rgba(0,139,206,0.1);
          text-decoration: none;
          display: inline-block;
          overflow: hidden;
        }
        .landing-btn::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 52px;
          background: linear-gradient(135deg, rgba(153,240,250,0.3), rgba(0,139,206,0.1), rgba(0,187,126,0.3));
          z-index: -1;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .landing-btn:hover {
          background: #006AC6;
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,139,206,0.35), 0 0 60px rgba(0,139,206,0.15);
        }
        .landing-btn:hover::before {
          opacity: 1;
        }

        /* ═══ STATS BAR ═══ */
        .landing-stats {
          position: relative;
          z-index: 20;
          padding: 24px 6vw;
          display: flex;
          justify-content: center;
          gap: min(48px, 5vw);
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(22,31,40,0.5);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          opacity: 0;
          animation: landing-fadeUp 0.6s ease forwards 0.95s;
        }

        .landing-st {
          display: flex;
          flex-direction: column;
          align-items: center;
          transition: transform 0.25s;
        }
        .landing-st:hover {
          transform: translateY(-2px);
        }
        .landing-st-v {
          font-family: 'JetBrains Mono', monospace;
          font-size: 20px;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
          letter-spacing: -0.5px;
          background: linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(153,240,250,0.5) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .landing-st-l {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.15);
          margin-top: 3px;
        }

        /* ═══ GHOST DATA ═══ */
        .landing-gh {
          position: absolute;
          font-family: 'JetBrains Mono', monospace;
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

        /* ═══ KEYFRAMES ═══ */
        @keyframes landing-ghP {
          0%, 100% { opacity: 0.015; }
          50% { opacity: 0.06; }
        }
        @keyframes landing-fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-fadeDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 600px) {
          .landing-stats { gap: 20px; flex-wrap: wrap; padding: 16px 20px; }
          .landing-gh { display: none; }
          .landing-hero { padding: 0 20px; }
          .landing-topbar { padding: 24px 24px; }
          .landing-orb { display: none; }
        }
      `}</style>

      <div className="landing-page">
        <div className="landing-bg" />
        <div className="landing-grain" />

        {/* Floating orbs */}
        <div className="landing-orb landing-orb-1" />
        <div className="landing-orb landing-orb-2" />
        <div className="landing-orb landing-orb-3" />
        <div className="landing-orb landing-orb-4" />

        {/* Particle network canvas */}
        <ParticleNetwork />

        {/* Ghost data */}
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
