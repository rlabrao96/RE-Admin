import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refresh session
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // Redirect unauthenticated users away from protected routes
    if (!user) {
        if (pathname.startsWith("/admin") || pathname.startsWith("/portal")) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = "/auth/login";
            redirectUrl.searchParams.set("redirect", pathname);
            return NextResponse.redirect(redirectUrl);
        }
        return supabaseResponse;
    }

    // Determine role from JWT metadata (fast, no DB query) with DB fallback
    const metaRole = user.user_metadata?.role as string | undefined;
    let role = metaRole;

    if (!role) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
        role = profile?.role;
    }

    // Redirect authenticated users away from login → correct portal
    if (pathname === "/auth/login") {
        const redirectPath = role === "admin" ? "/admin" : "/portal";
        return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // Prevent residents from accessing /admin
    if (pathname.startsWith("/admin") && role !== "admin") {
        return NextResponse.redirect(new URL("/portal", request.url));
    }

    // Prevent admins from accidentally landing on /portal
    if (pathname === "/portal" && role === "admin") {
        return NextResponse.redirect(new URL("/admin", request.url));
    }

    return supabaseResponse;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
