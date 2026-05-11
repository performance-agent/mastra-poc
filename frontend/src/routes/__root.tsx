import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/auth";

import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link
            to="/organizations"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to organizations
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/organizations"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Performance Agent" },
      { name: "description", content: "A lightweight workspace browser for Performance Agent." },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <>
      <HeadContent />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
        <Toaster />
      </QueryClientProvider>
      <Scripts />
    </>
  );
}

function AuthGate() {
  const { firebaseUser, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isLogin = location.pathname === "/login";

  useEffect(() => {
    if (isLoading) return;
    if (!firebaseUser && !isLogin) {
      const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      navigate({ to: "/login", search: { redirect }, replace: true } as never);
      return;
    }
    if (firebaseUser && isLogin) {
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      if (redirect?.startsWith("/") && !redirect.startsWith("//")) {
        window.location.replace(redirect);
        return;
      }
      navigate({ to: "/organizations", replace: true });
    }
  }, [firebaseUser, isLoading, isLogin, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
            PA
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Loading session...</p>
        </div>
      </div>
    );
  }

  if ((!firebaseUser && !isLogin) || (firebaseUser && isLogin)) return null;

  return <Outlet />;
}
