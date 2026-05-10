import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Chrome, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/login")({
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
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "sign-up";

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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            PA
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Performance Agent</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Access your organizations, workspaces, groups, and resources.
          </p>
        </div>

        <Card className="rounded-lg shadow-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle>{isSignUp ? "Create account" : "Sign in"}</CardTitle>
            </div>
            <CardDescription>
              {isSignUp ? "Create your account to continue." : "Use your account to continue."}
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
