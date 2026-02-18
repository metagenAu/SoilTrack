'use client'

import { createContext, useContext, useMemo } from 'react'

export type UserRole = 'admin' | 'upload' | 'readonly'

interface UserRoleContextValue {
  role: UserRole
  canUpload: boolean
  canModify: boolean
  canManageUsers: boolean
}

const UserRoleContext = createContext<UserRoleContextValue>({
  role: 'readonly',
  canUpload: false,
  canModify: false,
  canManageUsers: false,
})

export function UserRoleProvider({
  role,
  children,
}: {
  role: UserRole
  children: React.ReactNode
}) {
  const value = useMemo<UserRoleContextValue>(() => ({
    role,
    canUpload: role === 'admin' || role === 'upload',
    canModify: role === 'admin',
    canManageUsers: role === 'admin',
  }), [role])

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  )
}

export function useUserRole() {
  return useContext(UserRoleContext)
}
