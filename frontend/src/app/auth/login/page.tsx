"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const router = useRouter();
    const [isLogin, setIsLogin] = useState(true);
    const [role, setRole] = useState<"resident" | "admin">("resident");
    const [adminKey, setAdminKey] = useState("");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const supabase = createClient();

        try {
            if (isLogin) {
                // LOGIN FLOW
                const { error: authError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (authError) {
                    setError("Email o contraseña incorrectos");
                    setLoading(false);
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

            } else {
                // SIGNUP FLOW
                if (role === 'admin' && adminKey !== '0000') {
                    setError("Clave de administrador incorrecta");
                    setLoading(false);
                    return;
                }

                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            role: role
                        }
                    }
                });

                if (signUpError) {
                    setError(signUpError.message || "Ocurrió un error al crear la cuenta.");
                    setLoading(false);
                    return;
                }

                // If user is created but email confirm is needed, session might be null.
                if (data.session) {
                    if (role === 'admin') {
                        router.push("/admin");
                    } else {
                        router.push("/portal");
                    }
                    router.refresh();
                } else {
                    // Force a sign-in step if session isn't automatically created
                    const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
                        email,
                        password,
                    });
                    if (signInError) {
                        setError("Cuenta creada. Por favor, ingresa con tus credenciales.");
                        setIsLogin(true);
                        setLoading(false);
                        return;
                    }
                    if (role === 'admin') {
                        router.push("/admin");
                    } else {
                        router.push("/portal");
                    }
                    router.refresh();
                }
            }
        } catch {
            setError("Ocurrió un error inesperado. Por favor intente de nuevo.");
            setLoading(false);
        }
    }

    async function handleOAuth(provider: 'google' | 'apple') {
        const supabase = createClient();
        await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`
            }
        });
    }

    return (
        <div className="login-page">
            <div className="login-card animate-fade-in">
                <div className="login-logo">
                    <div className="login-logo-icon">E</div>
                    <h1 className="login-title">EdificioApp</h1>
                </div>

                <h2 className="login-subtitle">{isLogin ? "Bienvenido" : "Crea tu cuenta"}</h2>
                <p className="login-desc">Ingresa a tu portal de administración</p>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group flex-col">
                        <label className="form-label inline-label">Correo electrónico</label>
                        <input
                            type="email"
                            className="form-input inline-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="correo@ejemplo.cl"
                            required
                        />
                    </div>

                    <div className="form-group flex-col">
                        <label className="form-label inline-label">Contraseña</label>
                        <input
                            type="password"
                            className="form-input inline-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {!isLogin && (
                        <>
                            <div className="form-group flex-col">
                                <label className="form-label inline-label">Tipo de cuenta</label>
                                <select
                                    className="form-input inline-input dropdown"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as "resident" | "admin")}
                                >
                                    <option value="resident">Propietario / Arrendatario</option>
                                    <option value="admin">Administrador</option>
                                </select>
                            </div>

                            {role === 'admin' && (
                                <div className="form-group flex-col">
                                    <label className="form-label inline-label">Clave Admin</label>
                                    <input
                                        type="password"
                                        className="form-input inline-input"
                                        value={adminKey}
                                        onChange={(e) => setAdminKey(e.target.value)}
                                        placeholder="Código secreto"
                                        required
                                    />
                                </div>
                            )}
                        </>
                    )}

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
                        {loading ? "Procesando..." : (isLogin ? "Ingresar" : "Crear cuenta")}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError(null);
                        }}
                        className="toggle-btn"
                    >
                        {isLogin ? "¿No tienes cuenta? Regístrate aquí." : "¿Ya tienes cuenta? Ingresa aquí."}
                    </button>
                </form>

                <div className="divider">
                    <span>o ingresar con</span>
                </div>

                <div className="oauth-container">
                    <button type="button" onClick={() => handleOAuth('google')} className="oauth-btn">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> Google
                    </button>
                    <button type="button" onClick={() => handleOAuth('apple')} className="oauth-btn">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20a8 8 0 100-16 8 8 0 000 16z"></path><path d="M12 14a2 2 0 100-4 2 2 0 000 4z"></path><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.22 4.22l1.42 1.42"></path><path d="M18.36 18.36l1.42 1.42"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.22 19.78l1.42-1.42"></path><path d="M18.36 5.64l1.42-1.42"></path></svg> Apple
                    </button>
                </div>

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
          background-image: url('/images/santiago_bg.png');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          padding: 1rem;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        .login-card {
          background: rgba(255, 255, 255, 0.85); /* Semi-transparent */
          backdrop-filter: blur(12px);          /* Glassmorphism effect */
          border-radius: 16px;
          padding: 3rem 3rem;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .login-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 2rem;
          justify-content: center;
        }
        .login-logo-icon {
          width: 38px;
          height: 38px;
          background: #5E64FF; /* Portal Dashboard Purple Accent */
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 1.25rem;
        }
        .login-title {
          font-size: 1.5rem;
          font-weight: 800;
          color: #111;
          margin: 0;
        }
        .login-subtitle {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
          color: #222;
        }
        .login-desc {
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
          color: #555;
        }
        .login-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .flex-col {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: flex-start;
          width: 100%;
        }
        .inline-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #444;
        }
        .inline-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 0.95rem;
          background-color: white;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .inline-input:focus {
          outline: none;
          border-color: #5E64FF;
          box-shadow: 0 0 0 3px rgba(94, 100, 255, 0.15);
        }
        .dropdown {
          background-color: white;
          cursor: pointer;
        }
        .login-error {
          font-size: 0.85rem;
          color: #d32f2f;
          background: #ffebee;
          padding: 0.75rem;
          border-radius: 6px;
          text-align: center;
        }
        .login-btn {
          width: 100%;
          padding: 0.85rem;
          background-color: #5E64FF;
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-weight: 600;
          font-size: 1rem;
          margin-top: 0.5rem;
          transition: background-color 0.2s;
        }
        .login-btn:hover {
          background-color: #4c51e0;
        }
        .login-btn:disabled {
          background-color: #a0a3ff;
          cursor: not-allowed;
        }
        .toggle-btn {
          background: none;
          border: none;
          color: #5E64FF;
          font-size: 0.85rem;
          cursor: pointer;
          text-decoration: none;
          margin-top: 0.5rem;
          font-weight: 500;
        }
        .toggle-btn:hover {
          text-decoration: underline;
        }
        .divider {
          width: 100%;
          text-align: center;
          border-bottom: 1px solid #ddd;
          line-height: 0.1em;
          margin: 30px 0 20px 0;
        }
        .divider span {
          padding: 0 10px;
          font-size: 0.8rem;
          color: #777;
        }
        .oauth-container {
          display: flex;
          gap: 1rem;
          width: 100%;
        }
        .oauth-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          color: #333;
          transition: background-color 0.2s;
        }
        .oauth-btn:hover {
          background-color: #f3f4f6;
        }
        .login-footer {
          margin-top: 2.5rem;
          font-size: 0.8rem;
          color: #666;
        }
      `}</style>
        </div>
    );
}
