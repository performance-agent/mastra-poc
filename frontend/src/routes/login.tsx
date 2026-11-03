import { Sparkles, Layers3, ScanText, ArrowUpRight } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Chrome, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import isotipo from "@/assets/brand/isotipo.svg";
import logotipo from "@/assets/brand/logotipo.svg";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Login - Performance Agent" },
      { name: "description", content: "Sign in to Performance Agent." },
    ],
  }),
  component: LoginPage,
});

function authErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Something went wrong.";
  if (error.message.includes("auth/invalid-credential")) return "Invalid email or password.";
  if (error.message.includes("auth/email-already-in-use"))
    return "That email is already registered.";
  if (error.message.includes("auth/weak-password"))
    return "Password should be at least 6 characters.";
  if (error.message.includes("auth/popup-closed-by-user")) return "Google sign-in was closed.";
  return error.message;
}

function LoginPage() {
  const { redirect } = Route.useSearch();
  const isInviteRedirect = Boolean(redirect?.startsWith("/invite/"));
  const { firebaseUser, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">(isInviteRedirect ? "sign-up" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthClient, setOauthClient] = useState<{
    clientName: string;
    redirectHost: string;
    loopbackRedirect: boolean;
    scopes: string[];
  } | null>(null);
  const oauthRequest = new URLSearchParams(window.location.search).get("oauth_request");

  const isSignUp = mode === "sign-up";

  useEffect(() => {
    if (!firebaseUser || !oauthRequest) return;
    void api
      .getMcpAuthorization(oauthRequest)
      .then(setOauthClient)
      .catch((cause) => setError(authErrorMessage(cause)));
  }, [firebaseUser, oauthRequest]);

  async function approveOAuth() {
    if (!oauthRequest) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const { redirectUrl } = await api.approveMcpAuthorization(oauthRequest);
      window.location.replace(redirectUrl);
    } catch (cause) {
      setIsSubmitting(false);
      setError(authErrorMessage(cause));
    }
  }

  if (firebaseUser && oauthRequest) {
    return (
      <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <section className="hidden lg:block">
          <p className="experience-eyebrow">Evidence meets perspective</p>
          <h1 className="mt-5 max-w-lg text-5xl font-semibold leading-[1.1] tracking-tight">
            Understand the work.
            <br />
            <span className="text-[var(--brand-ink)]">Help your team grow.</span>
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
            Bring your team's activity together and turn it into thoughtful, actionable evaluations.
          </p>
          <div className="mt-9 space-y-4">
            {[
              {
                icon: Layers3,
                title: "Connect your evidence",
                description: "Keep GitHub and Jira work in one shared context.",
              },
              {
                icon: Sparkles,
                title: "Choose your perspective",
                description: "Configure evaluators around the questions that matter.",
              },
              {
                icon: ScanText,
                title: "See the bigger picture",
                description: "Explore reports with evidence and clear limitations.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex items-center gap-4 rounded-2xl border bg-card/70 p-4"
              >
                <div className="rounded-xl bg-[var(--brand-soft)] p-3 text-[var(--brand-ink)]">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
                <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            ))}
          </div>
        </section>
        <Card className="w-full max-w-md rounded-lg shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Connect {oauthClient?.clientName ?? "MCP client"}</CardTitle>
            </div>
            <CardDescription>
              This client can read your permitted projects and create reports only where you are an
              owner or admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Access remains limited by your current organization, workspace, and project
                memberships. Callback: {oauthClient?.redirectHost ?? "loading..."}. Requested
                scopes: {oauthClient?.scopes.join(", ") ?? "loading..."}
              </p>
            )}
            {oauthClient?.loopbackRedirect ? (
              <p className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                This client uses a local callback. Continue only if you started the connection from
                an application running on this device.
              </p>
            ) : null}
            <Button className="mt-4 w-full" onClick={approveOAuth} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Connect MCP client
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(name, email, password);
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
      <section className="hidden lg:block">
        <p className="experience-eyebrow">Evidence meets perspective</p>
        <h1 className="mt-5 max-w-lg text-5xl font-semibold leading-[1.1] tracking-tight">
          Understand the work.
          <br />
          <span className="text-[var(--brand-ink)]">Help your team grow.</span>
        </h1>
        <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
          Bring your team's activity together and turn it into thoughtful, actionable evaluations.
        </p>
        <div className="mt-9 space-y-4">
          {[
            {
              icon: Layers3,
              title: "Connect your evidence",
              description: "Keep GitHub and Jira work in one shared context.",
            },
            {
              icon: Sparkles,
              title: "Choose your perspective",
              description: "Configure evaluators around the questions that matter.",
            },
            {
              icon: ScanText,
              title: "See the bigger picture",
              description: "Explore reports with evidence and clear limitations.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-center gap-4 rounded-2xl border bg-card/70 p-4">
              <div className="rounded-xl bg-[var(--brand-soft)] p-3 text-[var(--brand-ink)]">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </div>
      </section>
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-3xl bg-[var(--brand-soft)] p-5 sm:p-8">
        <div className="text-center m-0">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
            <img src={isotipo} alt="" className="h-16 w-16 shrink-0" />
            <img src={logotipo} alt="Platformance" className="h-auto w-48 max-w-full" />
          </div>
        </div>

        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle>{isSignUp ? "Create account" : "Sign in"}</CardTitle>
            </div>
            <CardDescription>
              {isInviteRedirect
                ? "Create an account or sign in to accept your invitation."
                : isSignUp
                  ? "Create your account to continue."
                  : "Use your account to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={onSubmit}>
              {isSignUp ? (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {error ? (
                <p className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button className="w-full" variant="outline" onClick={onGoogle} disabled={isSubmitting}>
              <Chrome className="h-4 w-4" />
              Continue with Google
            </Button>

            <button
              type="button"
              className="w-full text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setMode(isSignUp ? "sign-in" : "sign-up");
                setError(null);
              }}
            >
              {isSignUp ? "Already have an account? Sign in" : "Need an account? Create one"}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
