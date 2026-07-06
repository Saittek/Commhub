import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { resolveHomePath } from "../lib/navigation";
import { forgotPassword, getOAuthStatus, resetPassword, verifyEmail } from "../lib/api";
import { EyeIcon, EyeOffIcon } from "../components/UiIcons";

type AuthMode = "login" | "signup" | "forgot" | "reset";

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const [forgotEmail, setForgotEmail] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [githubOAuthEnabled, setGithubOAuthEnabled] = useState(false);
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false);

  useEffect(() => {
    void getOAuthStatus()
      .then((status) => {
        setGithubOAuthEnabled(status.github);
        setGoogleOAuthEnabled(status.google);
      })
      .catch(() => {
        setGithubOAuthEnabled(false);
        setGoogleOAuthEnabled(false);
      });
  }, []);

  useEffect(() => {
    const resetToken = searchParams.get("reset");
    const verifyToken = searchParams.get("verify");

    if (resetToken) {
      setMode("reset");
      return;
    }

    if (verifyToken) {
      setSubmitting(true);
      setError(null);
      void verifyEmail(verifyToken)
        .then(() => {
          setMessage("Email verified. You can log in now.");
          setMode("login");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Verification failed.");
        })
        .finally(() => setSubmitting(false));
    }
  }, [searchParams]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(loginForm.usernameOrEmail, loginForm.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      return;
    } finally {
      setSubmitting(false);
    }

    try {
      navigate(await resolveHomePath());
    } catch {
      navigate("/onboarding");
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

  async function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);

    try {
      const response = await forgotPassword(forgotEmail);
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (resetPasswordValue !== resetConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const token = searchParams.get("reset") ?? "";
    setSubmitting(true);

    try {
      await resetPassword(token, resetPasswordValue);
      setMessage("Password reset. You can log in now.");
      setMode("login");
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
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
        {message && <div className="settings-success">{message}</div>}

        {mode === "forgot" ? (
          <form className="auth-form" onSubmit={handleForgot}>
            <p className="settings-muted">Enter your account email and we will send a reset link.</p>
            <label>
              Email
              <input
                type="email"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setMode("login")}>
              Back to login
            </button>
          </form>
        ) : mode === "reset" ? (
          <form className="auth-form" onSubmit={handleReset}>
            <label>
              New password
              <input
                type="password"
                value={resetPasswordValue}
                onChange={(event) => setResetPasswordValue(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={resetConfirmPassword}
                onChange={(event) => setResetConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Set New Password"}
            </button>
          </form>
        ) : mode === "login" ? (
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
              <span className="auth-password-field">
                <input
                  type={showLoginPassword ? "text" : "password"}
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
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowLoginPassword((current) => !current)}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </span>
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Logging in..." : "Log In"}
            </button>
            {githubOAuthEnabled && (
              <a href="/api/auth/oauth/github" className="auth-oauth-btn auth-oauth-github">
                Continue with GitHub
              </a>
            )}
            {googleOAuthEnabled && (
              <a href="/api/auth/oauth/google" className="auth-oauth-btn auth-oauth-google">
                Continue with Google
              </a>
            )}
            <button
              type="button"
              className="auth-link-button"
              onClick={() => {
                setMode("forgot");
                setError(null);
                setMessage(null);
              }}
            >
              Forgot password?
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
            {githubOAuthEnabled && (
              <a href="/api/auth/oauth/github" className="auth-oauth-btn auth-oauth-github">
                Continue with GitHub
              </a>
            )}
            {googleOAuthEnabled && (
              <a href="/api/auth/oauth/google" className="auth-oauth-btn auth-oauth-google">
                Continue with Google
              </a>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
