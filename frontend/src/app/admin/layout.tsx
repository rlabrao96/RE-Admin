import { Sidebar } from "@/components/admin/Sidebar";
import "@/app/globals.css";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="admin-layout">
            <Sidebar />
            <main className="admin-content">{children}</main>
        </div>
    );
}
