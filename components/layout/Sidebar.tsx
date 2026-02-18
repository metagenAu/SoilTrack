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
  Maximize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUserRole } from '@/components/providers/UserRoleProvider'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, requiresUpload: false },
  { label: 'Data Hub', href: '/data-hub', icon: Database, requiresUpload: true },
  { label: 'Trials', href: '/trials', icon: FlaskConical, requiresUpload: false },
  { label: 'Clients', href: '/clients', icon: Users, requiresUpload: false },
  { label: 'Fields', href: '/fields', icon: Maximize2, requiresUpload: false },
  { label: 'Analytics', href: '/analytics', icon: PieChart, requiresUpload: false },
  { label: 'Analysis', href: '/analysis', icon: BarChart3, requiresUpload: false },
  { label: 'Reports', href: '/reports', icon: FileText, requiresUpload: false },
  { label: 'Settings', href: '/settings', icon: Settings, requiresUpload: false },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { canUpload } = useUserRole()

  const visibleItems = navItems.filter(item => !item.requiresUpload || canUpload)

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-white border-r border-brand-grey-2 flex flex-col z-40 transition-all duration-200',
        collapsed ? 'w-[54px]' : 'w-[210px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-3 h-[56px] border-b border-brand-grey-2">
        <div className="w-[30px] h-[30px] rounded-lg bg-brand-black flex items-center justify-center flex-shrink-0">
          <span className="text-white font-semibold text-sm">M</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm text-brand-black">
              <span className="font-semibold">meta</span>
              <span className="font-light">gen</span>
              <sup className="text-[9px] ml-0.5 text-brand-grey-1">AUS</sup>
            </span>
            <span className="text-[10px] text-brand-grey-1 uppercase tracking-wider">
              SoilTrack
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-brand-grey-3 text-brand-black font-medium'
                  : 'text-brand-black/50 hover:bg-brand-grey-3 hover:text-brand-black'
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
