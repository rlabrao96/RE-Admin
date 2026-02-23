"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError("Email o contraseña incorrectos");
                return;
            }

            // Get profile to determine redirect
            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .single();

            if (profile?.role === "admin") {
                router.push("/admin");
            } else {
                router.push("/portal");
            }
            router.refresh();
        } catch {
            setError("Ocurrió un error. Por favor intente de nuevo.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-page">
            <div className="login-card animate-fade-in">
                {/* Logo */}
                <div className="login-logo">
                    <div className="login-logo-icon">E</div>
                    <span className="login-logo-text">EdificioApp</span>
                </div>

                <h1 className="login-title">Bienvenido</h1>
                <p className="login-subtitle">Ingresa a tu portal de administración</p>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="email" className="form-label">
                            Correo electrónico
                        </label>
                        <input
                            id="email"
                            type="email"
                            className="form-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="correo@ejemplo.cl"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password" className="form-label">
                            Contraseña
                        </label>
                        <input
                            id="password"
                            type="password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="login-error" role="alert">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary login-btn"
                        disabled={loading}
                    >
                        {loading ? "Ingresando..." : "Ingresar"}
                    </button>
                </form>

                <p className="login-footer">
                    ¿Tienes problemas para ingresar? Contacta a tu administrador.
                </p>
            </div>

            <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 1rem;
        }
        .login-card {
          background: white;
          border-radius: 1.25rem;
          padding: 2.5rem;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .login-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 2rem;
          justify-content: center;
        }
        .login-logo-icon {
          width: 44px;
          height: 44px;
          background: var(--color-primary);
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 1.25rem;
        }
        .login-logo-text {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--color-gray-900);
        }
        .login-title {
          font-size: 1.5rem;
          font-weight: 700;
          text-align: center;
          margin-bottom: 0.375rem;
        }
        .login-subtitle {
          color: var(--color-gray-500);
          text-align: center;
          font-size: 0.875rem;
          margin-bottom: 2rem;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .login-error {
          background: var(--color-danger-light);
          color: var(--color-danger);
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          text-align: center;
        }
        .login-btn {
          width: 100%;
          justify-content: center;
          padding: 0.75rem;
          font-size: 1rem;
          margin-top: 0.5rem;
        }
        .login-footer {
          text-align: center;
          font-size: 0.8125rem;
          color: var(--color-gray-500);
          margin-top: 1.5rem;
        }
      `}</style>
        </div>
    );
}
