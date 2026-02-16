'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Database,
  FlaskConical,
  Users,
  FileText,
  BarChart3,
  PieChart,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Data Hub', href: '/data-hub', icon: Database },
  { label: 'Trials', href: '/trials', icon: FlaskConical },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Analytics', href: '/analytics', icon: PieChart },
  { label: 'Analysis', href: '/analysis', icon: BarChart3 },
  { label: 'Reports', href: '/reports', icon: FileText },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-white border-r border-brand-grey-2 flex flex-col z-40 transition-all duration-200',
        collapsed ? 'w-[54px]' : 'w-[210px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-[56px] border-b border-brand-grey-2">
        <div className="w-[30px] h-[30px] rounded-full bg-meta-blue flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">M</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-brand-black">
              <span className="font-bold">meta</span>
              <span className="font-normal">gen</span>
              <sup className="text-[9px] ml-0.5">AUS</sup>
            </span>
            <span className="text-[10px] text-brand-grey-1 uppercase tracking-wider">
              SoilTrack
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-meta-blue/10 text-meta-blue font-medium'
                  : 'text-brand-black/70 hover:bg-brand-grey-3 hover:text-brand-black'
              )}
            >
              <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-brand-grey-2 text-brand-grey-1 hover:text-brand-black transition-colors"
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  )
}
