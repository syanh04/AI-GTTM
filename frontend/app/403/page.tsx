"use client"

import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/AuthContext"

export default function ForbiddenPage() {
  const router = useRouter()
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">

        <div className="text-8xl mb-6">
          🚫
        </div>

        <h1 className="text-6xl font-bold text-red-500 mb-4">
          403
        </h1>

        <h2 className="text-2xl font-semibold text-white mb-3">
          Truy Cập Bị Từ Chối
        </h2>

        <p className="text-gray-400 text-sm mb-2">
          Tài khoản{" "}
          <span className="text-yellow-400 font-medium">
            {user?.username || "của bạn"}
          </span>
          {" "}không có quyền truy cập trang này.
        </p>

        <p className="text-gray-500 text-xs mb-8">
          Chỉ tài khoản Admin mới được phép vào khu vực này.
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            🏠 Về Trang Chủ
          </button>
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            ← Quay Lại
          </button>
        </div>

        <div className="mt-8 text-xs text-gray-600">
          🚦 Traffic Monitor v2.5
        </div>

      </div>
    </div>
  )
}
