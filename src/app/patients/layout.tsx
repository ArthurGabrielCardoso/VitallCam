export default function PatientsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-pattern">
      {children}
    </div>
  )
}