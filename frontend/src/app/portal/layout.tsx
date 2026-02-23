import { PortalSidebar } from "@/components/portal/PortalSidebar";
import "@/app/globals.css";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="admin-layout">
            <PortalSidebar />
            <main className="admin-content">{children}</main>
        </div>
    );
}
