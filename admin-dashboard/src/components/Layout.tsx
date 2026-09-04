import React from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/clerk-react'

const navigation = [
  { name: 'Tenants', href: '/tenants' },
  { name: 'Analytics', href: '/analytics' },
  { name: 'Settings', href: '/settings' },
]

export function Layout() {
  const location = useLocation()

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header-left">
          <Link to="/tenants" className="admin-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="logo-icon">
              <rect x={2} y={3} width={20} height={14} rx={2} ry={2} />
              <path d="M8 21h8M12 17v4" />
            </svg>
            <span>Chatbot Admin</span>
          </Link>
          <nav className="admin-nav">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`admin-nav-link ${location.pathname.startsWith(item.href) ? 'active' : ''}`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
        <div className="admin-header-right">
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}