'use client'

import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-grey-3">
      <Sidebar />
      <main className="ml-[210px] p-6 transition-all duration-200">
        {children}
      </main>
    </div>
  )
}
