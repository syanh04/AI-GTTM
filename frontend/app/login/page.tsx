'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { Lock, User, ShieldAlert } from 'lucide-react'
import TelegramQRFloat from '@/components/TelegramQRFloat'

export default function LoginPage() {
  const { login, user, isLoading } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/')
    }
  }, [user, isLoading, router])

  const handleSubmit = async () => {
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();
    if (!cleanUsername || !cleanPassword) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await login(cleanUsername, cleanPassword)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#090d16]"
      style={{
        backgroundImage: `
          radial-gradient(ellipse 70% 40% at 50% 0%, rgba(37, 99, 235, 0.12), transparent),
          radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4), rgba(9, 13, 22, 0.95)),
          linear-gradient(to right, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255, 255, 255, 0.025) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 100% 100%, 36px 36px, 36px 36px'
      }}
    >
      {/* Subtle top ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-blue-500/10 blur-[120px] pointer-events-none" />

      {/* Main card with minimalist enterprise dark aesthetic */}
      <div className="relative z-10 bg-slate-900/70 backdrop-blur-xl rounded-2xl p-8 w-full max-w-[400px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] border border-slate-800/90 transition-all duration-300">
        
        {/* Top subtle blue accent indicator */}
        <div className="absolute top-0 left-12 right-12 h-[2px] bg-gradient-to-r from-transparent via-blue-500/80 to-transparent" />

        {/* Logo and Header */}
        <div className="text-center mb-8 relative">
          <div className="relative inline-block mb-3">
            <div className="w-14 h-14 mx-auto rounded-xl bg-slate-800/80 border border-slate-700/60 p-2 shadow-inner flex items-center justify-center">
              <img 
                src="/favicon.png" 
                alt="TrafficAI Logo" 
                className="w-10 h-10 object-contain rounded-lg" 
              />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>TrafficAI</span>
            <span className="text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">ENTERPRISE</span>
          </h1>
          <p className="text-slate-400 text-xs mt-1.5 font-medium tracking-wide">
            HỆ THỐNG GIÁM SÁT GIAO THÔNG THÔNG MINH
          </p>
        </div>

        {/* Form elements */}
        <div className="space-y-5">
          <div>
            <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider block mb-2 px-1">
              Tên đăng nhập
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-300">
                <User className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="Nhập tài khoản (admin/viewer)"
                className="w-full bg-slate-900/40 text-white rounded-2xl pl-11 pr-4 py-3.5 border border-slate-800/80 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 focus:outline-none placeholder-slate-600 text-sm transition-all duration-300 backdrop-blur-md"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider block mb-2 px-1">
              Mật khẩu
            </label>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-300">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="••••••••"
                className="w-full bg-slate-900/40 text-white rounded-2xl pl-11 pr-4 py-3.5 border border-slate-800/80 focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 focus:outline-none placeholder-slate-600 text-sm transition-all duration-300 backdrop-blur-md"
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 rounded-2xl px-4 py-3 text-xs flex items-center gap-2.5 shadow-inner">
              <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 active:from-blue-700 active:to-blue-600 disabled:from-slate-800 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-2xl py-3.5 text-sm transition-all duration-300 shadow-[0_4px_20px_rgba(37,99,235,0.25)] hover:shadow-[0_4px_25px_rgba(37,99,235,0.45)] disabled:shadow-none mt-4 uppercase tracking-wider"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang xử lý...
              </span>
            ) : (
              'Đăng Nhập Hệ Thống'
            )}
          </button>
        </div>

        {process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === 'true' && (
        <div className="mt-8 border-t border-slate-800/60 pt-5 text-center text-slate-500 text-[11px] leading-relaxed">
          <p className="font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Tài khoản demo:</p>
          <div className="flex justify-center gap-4 text-[10px]">
            <span>Quản trị: <b className="text-slate-400">admin / admin123</b></span>
            <span>Vận hành: <b className="text-slate-400">viewer / viewer123</b></span>
          </div>
        </div>
        )}

      </div>

      <TelegramQRFloat />
    </div>
  )
}
