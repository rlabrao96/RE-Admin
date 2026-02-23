"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
    {
        section: "Principal",
        links: [
            { href: "/admin", label: "Dashboard", icon: "⊞" },
            { href: "/admin/buildings", label: "Edificios", icon: "🏢" },
            { href: "/admin/residents", label: "Residentes", icon: "👤" },
        ],
    },
    {
        section: "Finanzas",
        links: [
            { href: "/admin/charges", label: "Gastos Comunes", icon: "📋" },
            { href: "/admin/payments", label: "Pagos", icon: "💳" },
            { href: "/admin/reconciliation", label: "Conciliación", icon: "🔍" },
            { href: "/admin/expenses", label: "Gastos", icon: "📊" },
            { href: "/admin/reports", label: "Reportes", icon: "📈" },
        ],
    },
    {
        section: "Comunicación",
        links: [
            { href: "/admin/notifications", label: "Notificaciones", icon: "🔔" },
            { href: "/admin/documents", label: "Documentos", icon: "📁" },
        ],
    },
    {
        section: "Servicios",
        links: [
            { href: "/admin/spaces", label: "Espacios Comunes", icon: "🏊" },
            { href: "/admin/maintenance", label: "Mantención", icon: "🔧" },
        ],
    },
];

export function Sidebar() {
    const pathname = usePathname();

    function isActive(href: string) {
        if (href === "/admin") return pathname === "/admin";
        return pathname.startsWith(href);
    }

    return (
        <aside className="admin-sidebar">
            {/* Logo */}
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">E</div>
                <span className="sidebar-logo-text">EdificioApp</span>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {navItems.map((section) => (
                    <div key={section.section}>
                        <div className="sidebar-section-label">{section.section}</div>
                        {section.links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`sidebar-link ${isActive(link.href) ? "active" : ""}`}
                            >
                                <span style={{ fontSize: "1rem" }}>{link.icon}</span>
                                {link.label}
                            </Link>
                        ))}
                    </div>
                ))}
            </nav>

            {/* Bottom */}
            <div className="sidebar-bottom">
                <form action="/auth/signout" method="post">
                    <button
                        type="submit"
                        className="btn btn-ghost"
                        style={{ width: "100%", justifyContent: "flex-start" }}
                    >
                        <span>🚪</span> Cerrar sesión
                    </button>
                </form>
            </div>
        </aside>
    );
}
