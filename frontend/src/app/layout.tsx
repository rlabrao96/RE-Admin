import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "EdificioApp — Administración de Edificios",
    description: "Plataforma de administración de edificios y condominios para Chile",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </head>
            <body>{children}</body>
        </html>
    );
}
