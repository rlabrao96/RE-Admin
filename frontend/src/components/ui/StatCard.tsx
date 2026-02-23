interface StatCardProps {
    label: string;
    value: string;
    trend?: string;
    trendPositive?: boolean;
    icon?: React.ReactNode;
}

export function StatCard({ label, value, trend, trendPositive = true, icon }: StatCardProps) {
    return (
        <div className="stat-card">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <span className="stat-label">{label}</span>
                {icon && (
                    <div style={{
                        width: 36, height: 36,
                        background: "var(--color-primary-light)",
                        borderRadius: "var(--radius-md)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--color-primary)", flexShrink: 0,
                    }}>
                        {icon}
                    </div>
                )}
            </div>
            <span className="stat-value">{value}</span>
            {trend && (
                <span className={`stat-trend ${trendPositive ? "" : "negative"}`}>
                    {trendPositive ? "↑" : "↓"} {trend}
                </span>
            )}
        </div>
    );
}
