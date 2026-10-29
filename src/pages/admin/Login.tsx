import { useState } from "react";
import { useNavigate } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { ErrorNote } from "../../components/ui";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export function Login() {
  useDocumentTitle("Barber login");
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login", { username, password });
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6">
      <h1 className="display text-[44px] leading-tight">Barber login</h1>
      <div className="flex flex-col gap-2">
        <label htmlFor="u" className="label">
          Username
        </label>
        <input id="u" className="field" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="p" className="label">
          Password
        </label>
        <input id="p" type="password" className="field" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <ErrorNote message={error} />}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
