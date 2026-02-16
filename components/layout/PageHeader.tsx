interface PageHeaderProps {
  label: string
  title: string
  action?: React.ReactNode
}

export default function PageHeader({ label, title, action }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <p className="signpost-label mb-1">{label}</p>
        <h1 className="page-title">{title}</h1>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
