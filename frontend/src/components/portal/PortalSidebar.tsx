"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
    { href: "/portal", label: "Inicio", icon: "🏠" },
    { href: "/portal/charges", label: "Mis Gastos Comunes", icon: "📋" },
    { href: "/portal/payments", label: "Mis Pagos", icon: "💳" },
    { href: "/portal/notifications", label: "Comunicados", icon: "🔔" },
    { href: "/portal/documents", label: "Documentos", icon: "📁" },
];

export function PortalSidebar() {
    const pathname = usePathname();
    function isActive(href: string) {
        if (href === "/portal") return pathname === "/portal";
        return pathname.startsWith(href);
    }

    return (
        <aside className="admin-sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon" style={{ background: "var(--color-success)" }}>R</div>
                <span className="sidebar-logo-text">Mi Portal</span>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section-label">Residente</div>
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-link ${isActive(item.href) ? "active" : ""}`}
                    >
                        <span style={{ fontSize: "1rem" }}>{item.icon}</span>
                        {item.label}
                    </Link>
                ))}
            </nav>

            <div className="sidebar-bottom">
                <form action="/auth/signout" method="post">
                    <button type="submit" className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start" }}>
                        <span>🚪</span> Cerrar sesión
                    </button>
                </form>
            </div>
        </aside>
    );
}
