import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import Image from 'next/image'
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
          font-family: var(--font-sans), system-ui, sans-serif;
          background: #0088CC;
          color: #fff;
          overflow: hidden;
        }

        /* ═══ BACKGROUND ═══ */
        .landing-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 30% 50%, rgba(0,160,240,0.25) 0%, transparent 60%),
            radial-gradient(ellipse 50% 70% at 80% 60%, rgba(0,50,100,0.3) 0%, transparent 60%),
            linear-gradient(160deg, #009ADE 0%, #0088CC 35%, #0077B6 65%, #006AA7 100%);
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
          color: rgba(255,255,255,0.6);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: color 0.25s;
          padding: 10px 24px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 50px;
        }
        .landing-topbar a:hover {
          color: #fff;
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.35);
        }

        /* ═══ MAIN ═══ */
        .landing-main {
          flex: 1;
          display: flex;
          align-items: center;
          position: relative;
          z-index: 10;
          padding: 0 6vw;
        }

        .landing-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          gap: 60px;
        }

        .landing-hero {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          flex: 1;
          max-width: 660px;
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
          font-weight: 300;
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
          color: rgba(255,255,255,0.6);
          line-height: 1.7;
          letter-spacing: -0.01em;
          margin-bottom: 16px;
          max-width: 520px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.55s;
        }
        .landing-coming-soon {
          font-size: clamp(11px, 1vw, 13px);
          font-weight: 600;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
          margin-bottom: 40px;
          opacity: 0;
          animation: landing-fadeUp 0.8s ease forwards 0.65s;
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

        /* ═══ RIGHT VISUAL ═══ */
        .landing-visual {
          flex-shrink: 0;
          width: clamp(320px, 35vw, 520px);
          height: clamp(320px, 35vw, 520px);
          position: relative;
          opacity: 0;
          animation: landing-fadeUp 1.2s ease forwards 0.4s;
        }

        .landing-circle {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(circle at 40% 35%, rgba(0,180,255,0.3) 0%, transparent 50%),
            radial-gradient(circle at 65% 70%, rgba(0,60,120,0.4) 0%, transparent 45%),
            radial-gradient(circle at 50% 50%, rgba(0,40,80,0.6) 0%, rgba(0,30,70,0.95) 70%);
          box-shadow:
            inset 0 0 60px rgba(0,0,0,0.3),
            0 0 80px rgba(0,100,180,0.2),
            0 0 0 1px rgba(255,255,255,0.06);
          overflow: hidden;
        }

        .landing-circle-ring {
          position: absolute;
          inset: -2px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.08);
        }

        .landing-circle-ring-2 {
          position: absolute;
          inset: 15%;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.04);
        }

        .landing-circle-ring-3 {
          position: absolute;
          inset: 35%;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.03);
        }

        /* Microbe-like dots inside the circle */
        .landing-microbe {
          position: absolute;
          border-radius: 50%;
          animation: landing-float 6s ease-in-out infinite;
        }
        .landing-m1 {
          width: 6px; height: 6px;
          background: rgba(100,200,255,0.5);
          top: 28%; left: 35%;
          animation-delay: 0s;
        }
        .landing-m2 {
          width: 10px; height: 10px;
          background: rgba(120,220,180,0.35);
          top: 45%; left: 55%;
          animation-delay: 1s;
        }
        .landing-m3 {
          width: 4px; height: 4px;
          background: rgba(180,220,255,0.6);
          top: 62%; left: 38%;
          animation-delay: 2s;
        }
        .landing-m4 {
          width: 8px; height: 8px;
          background: rgba(80,180,220,0.3);
          top: 35%; left: 65%;
          animation-delay: 3s;
        }
        .landing-m5 {
          width: 5px; height: 5px;
          background: rgba(100,240,200,0.4);
          top: 55%; left: 28%;
          animation-delay: 4s;
        }
        .landing-m6 {
          width: 12px; height: 12px;
          background: rgba(60,160,220,0.2);
          top: 70%; left: 60%;
          animation-delay: 2.5s;
          filter: blur(1px);
        }
        .landing-m7 {
          width: 3px; height: 3px;
          background: rgba(200,240,255,0.7);
          top: 25%; left: 50%;
          animation-delay: 5s;
        }
        .landing-m8 {
          width: 7px; height: 7px;
          background: rgba(80,200,180,0.25);
          top: 48%; left: 42%;
          animation-delay: 1.5s;
          filter: blur(0.5px);
        }

        /* Data labels on the circle */
        .landing-data-label {
          position: absolute;
          font-family: var(--font-mono), monospace;
          font-size: 9px;
          letter-spacing: 1px;
          color: rgba(160,220,255,0.4);
          white-space: nowrap;
        }
        .landing-dl-1 { top: 18%; left: 10%; transform: rotate(-5deg); }
        .landing-dl-2 { bottom: 22%; right: 8%; transform: rotate(3deg); }
        .landing-dl-3 { top: 50%; right: -5%; transform: rotate(90deg); transform-origin: right center; }

        /* ═══ STATS BAR ═══ */
        .landing-stats {
          position: relative;
          z-index: 20;
          padding: 24px 6vw;
          display: flex;
          justify-content: center;
          gap: min(48px, 5vw);
          border-top: 1px solid rgba(255,255,255,0.12);
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
          color: rgba(255,255,255,0.85);
          letter-spacing: -0.5px;
        }
        .landing-st-l {
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
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
        @keyframes landing-float {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(3px, -4px); }
          50% { transform: translate(-2px, 3px); }
          75% { transform: translate(4px, 2px); }
        }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 900px) {
          .landing-content { flex-direction: column; gap: 40px; }
          .landing-hero { align-items: center; text-align: center; max-width: 100%; }
          .landing-lead { max-width: 100%; }
          .landing-visual { width: clamp(220px, 50vw, 320px); height: clamp(220px, 50vw, 320px); }
        }
        @media (max-width: 600px) {
          .landing-stats { gap: 20px; flex-wrap: wrap; padding: 16px 20px; }
          .landing-hero { padding: 0 8px; }
          .landing-topbar { padding: 24px 24px; }
          .landing-visual { width: 240px; height: 240px; }
        }
      `}</style>

      <div className="landing-page">
        <div className="landing-bg" />

        {/* Particle network canvas */}
        <ParticleNetwork />

        <div className="landing-topbar">
          <div className="landing-logo">
            <Image
              src="/metagen-logo-white.svg"
              alt="Metagen Australia"
              width={180}
              height={40}
              priority
            />
          </div>
          <Link href="/login">Sign In</Link>
        </div>

        <div className="landing-main">
          <div className="landing-content">
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
                Powering deeper understanding across agricultural trials
                — from plot to portfolio.
              </p>

              <p className="landing-coming-soon">More coming soon</p>

              <div className="landing-cta">
                <Link href="/login" className="landing-btn">Sign In</Link>
              </div>

            </div>

            {/* Circular scientific visualization */}
            <div className="landing-visual">
              <div className="landing-circle">
                <div className="landing-circle-ring" />
                <div className="landing-circle-ring-2" />
                <div className="landing-circle-ring-3" />
                <div className="landing-microbe landing-m1" />
                <div className="landing-microbe landing-m2" />
                <div className="landing-microbe landing-m3" />
                <div className="landing-microbe landing-m4" />
                <div className="landing-microbe landing-m5" />
                <div className="landing-microbe landing-m6" />
                <div className="landing-microbe landing-m7" />
                <div className="landing-microbe landing-m8" />
                <div className="landing-data-label landing-dl-1">OTU 847 · pH 6.8</div>
                <div className="landing-data-label landing-dl-2">Shannon 4.12</div>
              </div>
              <div className="landing-data-label landing-dl-3">DNA 1.2M reads</div>
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
