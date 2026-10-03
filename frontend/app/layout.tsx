import './globals.css'
import './metrics.css'
import './redesign.css'
import './page-fixes.css'
import './presentation.css'
import AppShell from '../components/AppShell'
export const metadata = { title: 'RouteFlow AI | Logistics Operations', description: 'Autonomous logistics operations agent' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><AppShell>{children}</AppShell></body></html> }
