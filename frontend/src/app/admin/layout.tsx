import { Sidebar } from "@/components/admin/Sidebar";
import QueryProvider from "@/providers/QueryProvider";
import "@/app/globals.css";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <QueryProvider>
            <div className="admin-layout">
                <Sidebar />
                <main className="admin-content">{children}</main>
            </div>
        </QueryProvider>
    );
}
