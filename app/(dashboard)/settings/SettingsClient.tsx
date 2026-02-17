'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Database, Download, CheckCircle, XCircle, Shield, Users, ChevronDown } from 'lucide-react'
import { useUserRole, type UserRole } from '@/components/providers/UserRoleProvider'

const EXPORT_TABLES = [
  { key: 'trials', label: 'Trials' },
  { key: 'treatments', label: 'Treatments' },
  { key: 'soil_health_samples', label: 'Soil Health Samples' },
  { key: 'soil_chemistry', label: 'Soil Chemistry' },
  { key: 'plot_data', label: 'Plot Data' },
  { key: 'tissue_chemistry', label: 'Tissue Chemistry' },
  { key: 'clients', label: 'Clients' },
  { key: 'management_log', label: 'Management Log' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  upload: 'Upload',
  readonly: 'Read Only',
}

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access — can upload, modify, delete trials, and manage users',
  upload: 'Can upload new trials and data, view everything',
  readonly: 'View-only access to all data',
}

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
}

export default function SettingsClient({ user }: { user: any }) {
  const supabase = createClient()
  const [exporting, setExporting] = useState<string | null>(null)
  const { role, canManageUsers } = useUserRole()

  // Admin user management state
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [updatingUser, setUpdatingUser] = useState<string | null>(null)

  useEffect(() => {
    if (canManageUsers) {
      loadUsers()
    }
  }, [canManageUsers])

  async function loadUsers() {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error('Failed to load users:', err)
    }
    setLoadingUsers(false)
  }

  async function handleRoleChange(userId: string, newRole: UserRole) {
    setUpdatingUser(userId)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })

      if (res.ok) {
        setUsers(prev =>
          prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
        )
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update role')
      }
    } catch (err) {
      console.error('Failed to update user role:', err)
    }
    setUpdatingUser(null)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleExport(table: string) {
    setExporting(table)
    try {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error

      const csv = convertToCSV(data || [])
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${table}_export.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
    setExporting(null)
  }

  function convertToCSV(data: Record<string, any>[]): string {
    if (data.length === 0) return ''
    const headers = Object.keys(data[0])
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h]
        if (val === null || val === undefined) return ''
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str
      }).join(',')
    )
    return [headers.join(','), ...rows].join('\n')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile */}
      <div className="card">
        <p className="signpost-label mb-3">PROFILE</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-brand-grey-1">Email</span>
            <span className="font-medium">{user?.email || 'Not signed in'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-grey-1">User ID</span>
            <span className="font-mono text-xs">{user?.id || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-brand-grey-1">Role</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-grey-3">
              <Shield size={12} />
              {ROLE_LABELS[role]}
            </span>
          </div>
          <p className="text-xs text-brand-grey-1 pt-1">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <div className="mt-4 pt-4 border-t border-brand-grey-2">
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            <LogOut size={14} />
            Sign Out
          </Button>
        </div>
      </div>

      {/* User Management (Admin only) */}
      {canManageUsers && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} />
            <p className="signpost-label">USER MANAGEMENT</p>
          </div>

          {loadingUsers ? (
            <p className="text-sm text-brand-grey-1">Loading users...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-brand-grey-1">No users found.</p>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-brand-grey-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{u.email}</p>
                    {u.full_name && (
                      <p className="text-xs text-brand-grey-1 truncate">{u.full_name}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      disabled={updatingUser === u.id || u.id === user?.id}
                      className="px-2 py-1 rounded-md border border-brand-grey-2 bg-white text-xs font-medium focus:outline-none focus:border-brand-black/30 disabled:opacity-50"
                    >
                      <option value="admin">Admin</option>
                      <option value="upload">Upload</option>
                      <option value="readonly">Read Only</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-brand-grey-1 mt-3">
            Change user roles to control access. Admins can delete/modify trials and manage users. Upload users can add new data. Read Only users can only view.
          </p>
        </div>
      )}

      {/* Supabase connection */}
      <div className="card">
        <p className="signpost-label mb-3">SUPABASE CONNECTION</p>
        <div className="flex items-center gap-2 text-sm">
          {supabaseUrl ? (
            <>
              <CheckCircle size={14} className="text-green-lush" />
              <span>Connected to {supabaseUrl}</span>
            </>
          ) : (
            <>
              <XCircle size={14} className="text-red-500" />
              <span>Not configured</span>
            </>
          )}
        </div>
      </div>

      {/* Data Export */}
      <div className="card">
        <p className="signpost-label mb-3">DATA EXPORT</p>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_TABLES.map((t) => (
            <Button
              key={t.key}
              variant="secondary"
              size="sm"
              onClick={() => handleExport(t.key)}
              disabled={exporting === t.key}
              className="justify-start"
            >
              <Download size={12} />
              {exporting === t.key ? 'Exporting...' : t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
