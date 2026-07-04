import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { resolveHomePath } from "../lib/navigation";

type AuthMode = "login" | "signup";

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [loginForm, setLoginForm] = useState({
    usernameOrEmail: "",
    password: "",
  });

  const [signupForm, setSignupForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(loginForm.usernameOrEmail, loginForm.password);
      navigate(await resolveHomePath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (signupForm.password !== signupForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      await signup(signupForm.username, signupForm.email, signupForm.password);
      navigate("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">C</div>
          <h1>Commhub</h1>
          <p>Your place to talk, hang out, and connect.</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            Log In
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Username or Email
              <input
                type="text"
                autoComplete="username"
                value={loginForm.usernameOrEmail}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    usernameOrEmail: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Logging in..." : "Log In"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleSignup}>
            <label>
              Username
              <input
                type="text"
                autoComplete="username"
                value={signupForm.username}
                onChange={(event) =>
                  setSignupForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                value={signupForm.email}
                onChange={(event) =>
                  setSignupForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="new-password"
                value={signupForm.password}
                onChange={(event) =>
                  setSignupForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                autoComplete="new-password"
                value={signupForm.confirmPassword}
                onChange={(event) =>
                  setSignupForm((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                required
                minLength={8}
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating account..." : "Create Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
