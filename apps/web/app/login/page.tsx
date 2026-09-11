"use client";

import { useState, FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <p className="font-serif text-2xl text-paper">CRM Imobiliário</p>
          <p className="text-sm text-paper/60 mt-1">Leads e atendimento via WhatsApp</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-paper rounded border border-border p-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-ink/80 mb-1">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus:border-amber outline-none"
              placeholder="voce@imobiliaria.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-ink/80 mb-1">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus:border-amber outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-rust">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-ink text-paper text-sm font-medium py-2.5 hover:bg-ink/90 disabled:opacity-60 transition-colors"
          >
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
