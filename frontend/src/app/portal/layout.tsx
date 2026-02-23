import { PortalSidebar } from "@/components/portal/PortalSidebar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="admin-layout">
            <PortalSidebar />
            <main className="admin-content">{children}</main>
        </div>
    );
}
