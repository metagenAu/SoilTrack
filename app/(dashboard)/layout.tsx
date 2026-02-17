import AppShell from '@/components/layout/AppShell'
import { getUserRole } from '@/lib/auth'
import { UserRoleProvider } from '@/components/providers/UserRoleProvider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { role } = await getUserRole()

  return (
    <UserRoleProvider role={role}>
      <AppShell>{children}</AppShell>
    </UserRoleProvider>
  )
}
