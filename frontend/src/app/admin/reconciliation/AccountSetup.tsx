"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
    useSaveBankConfig,
    useBankConfig,
    useLinkAccounts,
    type BankAccountConfig,
    type FintocAccount,
} from "@/hooks/api/useFintoc";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WEBHOOK_BASE_URL = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || API_URL;

interface Props {
    buildingId: string;
    existing?: BankAccountConfig | null;
}

export default function AccountSetup({ buildingId, existing }: Props) {
    const [widgetStatus, setWidgetStatus] = useState<"idle" | "loading" | "open" | "success" | "error">("idle");
    const [widgetError, setWidgetError] = useState("");
    const [showAccountPicker, setShowAccountPicker] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isLinked = !!existing?.fintoc_link_token;
    const hasAccount = !!existing?.fintoc_account_id;

    const saveMutation = useSaveBankConfig(buildingId);
    const { refetch: refetchConfig } = useBankConfig(buildingId);

    // Fetch accounts when link exists but no account selected, or picker is open
    const shouldFetchAccounts = isLinked && (!hasAccount || showAccountPicker);
    const { data: accounts, isLoading: accountsLoading } = useLinkAccounts(
        buildingId,
        shouldFetchAccounts,
    );

    // Auto-select if only one account
    useEffect(() => {
        if (accounts && accounts.length === 1 && !hasAccount) {
            handleSelectAccount(accounts[0]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accounts, hasAccount]);

    // Show picker if multiple accounts and no selection yet
    useEffect(() => {
        if (accounts && accounts.length > 1 && !hasAccount) {
            setShowAccountPicker(true);
        }
    }, [accounts, hasAccount]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    async function handleSelectAccount(account: FintocAccount) {
        await saveMutation.mutateAsync({
            fintoc_account_id: account.id,
            bank_name: account.name || account.official_name || undefined,
            account_number: account.number || undefined,
            account_owner_name: account.holder_name || undefined,
            account_owner_rut: account.holder_id || undefined,
        });
        setShowAccountPicker(false);
    }

    async function handleDisconnect() {
        await saveMutation.mutateAsync({
            fintoc_link_token: "",
            fintoc_account_id: "",
            bank_name: "",
            account_number: "",
            account_owner_name: "",
            account_owner_rut: "",
        });
        setWidgetStatus("idle");
    }

    // Poll for link_token after widget success (webhook delivers it async)
    function startPollingForLinkToken() {
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max

        pollRef.current = setInterval(async () => {
            attempts++;
            const result = await refetchConfig();
            const config = result.data;

            if (config?.fintoc_link_token && config.fintoc_link_token.includes("_token_")) {
                // Webhook delivered the full link_token
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = null;
                setWidgetStatus("success");
            } else if (attempts >= maxAttempts) {
                if (pollRef.current) clearInterval(pollRef.current);
                pollRef.current = null;
                setWidgetStatus("error");
                setWidgetError("No se recibió el link_token de Fintoc. Asegúrate de tener ngrok configurado.");
            }
        }, 1000);
    }

    const handleConnectFintoc = useCallback(async () => {
        setWidgetStatus("loading");
        setWidgetError("");

        try {
            const { getFintoc } = await import("@fintoc/fintoc-js");
            const Fintoc = await getFintoc();

            if (!Fintoc) {
                setWidgetStatus("error");
                setWidgetError("No se pudo cargar el SDK de Fintoc");
                return;
            }

            const publicKey = process.env.NEXT_PUBLIC_FINTOC_PUBLIC_KEY;
            if (!publicKey) {
                setWidgetStatus("error");
                setWidgetError("NEXT_PUBLIC_FINTOC_PUBLIC_KEY no configurada");
                return;
            }

            // Fintoc will POST the link_token to this URL after widget completion
            const webhookUrl = `${WEBHOOK_BASE_URL}/api/fintoc/webhook/link-token/${buildingId}`;

            setWidgetStatus("open");
            const widget = Fintoc.create({
                publicKey,
                holderType: "business",
                product: "movements",
                country: "cl",
                webhookUrl,
                onSuccess: () => {
                    // link_token arrives via webhook — poll until it's saved
                    setWidgetStatus("loading");
                    startPollingForLinkToken();
                },
                onExit: () => {
                    setWidgetStatus((prev) => prev === "open" ? "idle" : prev);
                },
            });

            widget.open();
        } catch {
            setWidgetStatus("error");
            setWidgetError("Error al iniciar la conexión con Fintoc.");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildingId]);

    const formatCLP = (n: number) => `$${n.toLocaleString("es-CL")}`;

    return (
        <div className="card" style={{ padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Conexión Cuenta Bancaria
            </h2>
            <p style={{ color: "var(--color-gray-500)", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>
                Conecta la cuenta bancaria del edificio vía Fintoc para sincronizar movimientos automáticamente.
            </p>

            {/* State: Fully connected (link + account selected) */}
            {isLinked && hasAccount && !showAccountPicker ? (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem 1rem", background: "#ecfdf5", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "1.25rem", color: "var(--color-success)" }}>&#x2713;</span>
                    <div style={{ flex: 1 }}>
                        <span style={{ color: "var(--color-success)", fontWeight: 600 }}>Cuenta conectada</span>
                        <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)", marginTop: "0.125rem" }}>
                            {existing?.bank_name && <span>{existing.bank_name}</span>}
                            {existing?.account_number && <span> · Cuenta {existing.account_number}</span>}
                            {existing?.account_owner_name && <span> · {existing.account_owner_name}</span>}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--color-gray-400)", marginTop: "0.125rem" }}>
                            Última sync: {existing?.last_sync_at ? new Date(existing.last_sync_at).toLocaleString("es-CL") : "Nunca"}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                            className="btn btn-ghost"
                            style={{ fontSize: "0.8125rem" }}
                            onClick={() => setShowAccountPicker(true)}
                        >
                            Cambiar cuenta
                        </button>
                        <button
                            className="btn btn-ghost"
                            style={{ fontSize: "0.8125rem", color: "var(--color-error)" }}
                            onClick={handleDisconnect}
                            disabled={saveMutation.isPending}
                        >
                            Desvincular
                        </button>
                    </div>
                </div>
            ) : widgetStatus === "success" ? (
                <div style={{ padding: "0.75rem 1rem", background: "#ecfdf5", borderRadius: "var(--radius-md)", textAlign: "center" }}>
                    <span style={{ color: "var(--color-success)", fontWeight: 600 }}>
                        Banco vinculado exitosamente
                    </span>
                </div>
            ) : widgetStatus === "loading" && pollRef.current ? (
                <div style={{ padding: "1rem", textAlign: "center" }}>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)" }}>
                        Esperando confirmación de Fintoc...
                    </p>
                </div>
            ) : showAccountPicker || (isLinked && !hasAccount) ? (
                <div>
                    <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                        Selecciona la cuenta para conciliación:
                    </p>
                    {accountsLoading ? (
                        <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", textAlign: "center", padding: "1rem" }}>
                            Cargando cuentas...
                        </p>
                    ) : accounts && accounts.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                            {accounts.map((acc) => (
                                <button
                                    key={acc.id}
                                    onClick={() => handleSelectAccount(acc)}
                                    disabled={saveMutation.isPending}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "0.875rem 1rem",
                                        border: `2px solid ${existing?.fintoc_account_id === acc.id ? "var(--color-primary)" : "var(--color-gray-200)"}`,
                                        borderRadius: "var(--radius-md)",
                                        background: existing?.fintoc_account_id === acc.id ? "var(--color-primary-light)" : "white",
                                        cursor: "pointer",
                                        textAlign: "left",
                                        width: "100%",
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                                            {acc.official_name || acc.name || "Cuenta"}
                                        </div>
                                        <div style={{ fontSize: "0.8125rem", color: "var(--color-gray-500)" }}>
                                            {acc.number && `Nº ${acc.number}`}
                                            {acc.holder_name && ` · ${acc.holder_name}`}
                                            {acc.type && ` · ${acc.type}`}
                                        </div>
                                    </div>
                                    {acc.balance && (
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontWeight: 600 }}>{formatCLP(acc.balance.available)}</div>
                                            <div style={{ fontSize: "0.75rem", color: "var(--color-gray-400)" }}>Disponible</div>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", textAlign: "center" }}>
                            No se encontraron cuentas en este enlace.
                        </p>
                    )}
                    <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                        {hasAccount && (
                            <button
                                className="btn btn-ghost"
                                style={{ fontSize: "0.8125rem" }}
                                onClick={() => setShowAccountPicker(false)}
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            className="btn btn-ghost"
                            style={{ fontSize: "0.8125rem", color: "var(--color-error)" }}
                            onClick={handleDisconnect}
                            disabled={saveMutation.isPending}
                        >
                            Desvincular cuenta
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: "center", padding: "1.5rem" }}>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-gray-500)", marginBottom: "1rem" }}>
                        Conecta la cuenta del edificio a través de Fintoc para sincronizar movimientos automáticamente.
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={handleConnectFintoc}
                        disabled={widgetStatus === "loading" || widgetStatus === "open"}
                    >
                        {widgetStatus === "loading" ? "Conectando..." : widgetStatus === "open" ? "Widget abierto..." : "Conectar con Fintoc"}
                    </button>
                    {widgetError && (
                        <p style={{ fontSize: "0.75rem", color: "var(--color-error)", marginTop: "0.5rem" }}>{widgetError}</p>
                    )}
                </div>
            )}
        </div>
    );
}
