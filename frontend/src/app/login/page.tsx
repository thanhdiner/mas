"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Loader2, Bot, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { setAuthToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await api.auth.login(email, password);
      setAuthToken(data.access_token);
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to login. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div 
        className="max-w-md w-full rounded-2xl p-8 relative overflow-hidden"
        style={{ background: "var(--surface-container)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#7bd0ff] to-[#008abb]"></div>
        
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4" style={{ background: "var(--surface-high)" }}>
            <Bot className="w-6 h-6 text-accent-cyan" />
          </div>
          <h1 className="text-2xl font-heading font-semibold text-foreground mb-2">Welcome Back</h1>
          <p className="text-sm" style={{ color: "var(--on-surface-dim)" }}>
            Sign in to orchestrate your multi-agent system
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg text-sm text-[#ffb4ab] border-l-2 border-[#93000a]" style={{ background: "var(--surface-lowest)" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" style={{ color: "var(--on-surface-dim)" }}>Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="bg-surface-lowest border-0 text-foreground h-11"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" style={{ color: "var(--on-surface-dim)" }}>Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="bg-surface-lowest border-0 text-foreground h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-dim hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 gradient-primary text-[#060e20] font-medium border-0 hover:opacity-90 mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
            Sign In
          </Button>
        </form>

        <div className="mt-6 text-center text-sm" style={{ color: "var(--on-surface-dim)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-accent-cyan hover:underline transition-colors">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
