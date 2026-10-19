"use client"

import { useEffect, useState } from "react"
import { useAuth }
  from "@/lib/AuthContext"
import { useVideoState }
  from "@/lib/VideoContext"
import AIControlPanel
  from "@/components/AIControlPanel"
import SystemSettings
  from "@/components/admin/SystemSettings"

function AIControlPanelLimited() {
  const {
    detectVehicle,
    setDetectVehicle,
    detectPlate,
    setDetectPlate,
  } = useVideoState()

  const toggleClass = (on: boolean) =>
    `relative inline-flex w-11 h-6
     rounded-full transition-colors
     duration-200 focus:outline-none
     ${on ? "bg-green-500"
           : "bg-gray-300"}`

  const knobClass = (on: boolean) =>
    `inline-block w-5 h-5 mt-0.5
     ml-0.5 bg-white rounded-full
     shadow-sm transition-transform
     duration-200
     ${on ? "translate-x-5"
           : "translate-x-0"}`

  return (
    <div className="space-y-4">
      <p className="text-xs
        text-amber-400 bg-amber-400/10
        rounded-lg px-3 py-2 mb-4">
        Tài khoản User chỉ có thể
        bật/tắt nhận diện xe và
        biển số.
      </p>

      {/* Nhận Diện Xe */}
      <div className="flex items-center
        justify-between py-2">
        <span className="text-sm
          text-muted-foreground">
          Nhận Diện Xe
        </span>
        <button
          onClick={() =>
            setDetectVehicle(
              !detectVehicle)}
          className={toggleClass(
            detectVehicle)}>
          <span className={knobClass(
            detectVehicle)} />
        </button>
      </div>

      {/* Nhận Diện Biển Số */}
      <div className="flex items-center
        justify-between py-2">
        <span className="text-sm
          text-muted-foreground">
          Nhận Diện Biển Số
        </span>
        <button
          onClick={() =>
            setDetectPlate(
              !detectPlate)}
          className={toggleClass(
            detectPlate)}>
          <span className={knobClass(
            detectPlate)} />
        </button>
      </div>
    </div>
  )
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({
  isOpen,
  onClose,
}: SettingsModalProps) {

  const { user } = useAuth()
  const isAdmin =
    user?.role === "admin"

  const [activeTab, setActiveTab]
    = useState<"ai"|"system">("ai")

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("ai")
    }
    const handleKey = (
      e: KeyboardEvent
    ) => {
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      document.addEventListener(
        "keydown", handleKey)
    }
    return () => {
      document.removeEventListener(
        "keydown", handleKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0
          bg-black/40 backdrop-blur-sm
          z-40 transition-opacity duration-200
          ease-out"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed
        top-1/2 left-1/2
        -translate-x-1/2
        -translate-y-1/2
        z-50 w-full max-w-lg lg:max-w-xl
        xl:max-w-2xl 2xl:max-w-3xl
        max-h-[80vh] lg:max-h-[85vh]
        xl:max-h-[88vh] overflow-y-auto
        bg-white rounded-2xl
        border border-gray-200
        shadow-2xl transition-all duration-200
        ease-out">

        {/* Header Modal */}
        <div className="flex items-center
          justify-between px-4 py-3 lg:px-5 lg:py-3
          xl:px-6 xl:py-4
          border-b border-gray-200
          sticky top-0 bg-white
          rounded-t-2xl z-10">
          <div className="flex items-center">
            <div>
              <h2 className="text-lg
                font-semibold text-gray-900">
                Cài Đặt Hệ Thống
              </h2>
              <p className="text-xs
                text-gray-500">
                Cấu hình AI và
                giám sát camera
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8
              rounded-full bg-gray-100
              hover:bg-gray-200
              text-gray-500
              hover:text-gray-700
              flex items-center
              justify-center
              transition-colors
              text-lg font-bold">
            ✕
          </button>
        </div>

        <div className="flex border-b
          border-gray-200 px-6 gap-1">
          <button
            onClick={()=>setActiveTab("ai")}
            className={`py-3 px-4 text-sm
              font-medium border-b-2
              transition-colors
              ${activeTab==="ai"
                ?"text-blue-600 border-blue-600"
                :"text-gray-500 border-transparent hover:text-gray-600"
              }`}>
             AI Điều Khiển
          </button>
          {isAdmin && (
            <button
              onClick={()=>
                setActiveTab("system")}
              className={`py-3 px-4 text-sm
                font-medium border-b-2
                transition-colors
                ${activeTab==="system"
                  ?"text-blue-600 border-blue-600"
                  :"text-gray-500 border-transparent hover:text-gray-600"
                }`}>
               Cài Đặt Chung
            </button>
          )}
        </div>

        <div className="p-4 lg:p-5 xl:p-6">
          {activeTab==="ai" && (
            isAdmin
              ? <AIControlPanel />
              : <AIControlPanelLimited />
          )}
          {activeTab==="system" &&
            isAdmin && <SystemSettings />}
        </div>

        {/* Footer */}
        <div className="px-6 py-4
          border-t border-gray-200
          flex justify-end sticky
          bottom-0 bg-white
          px-4 py-3 lg:px-5 lg:py-3
          xl:px-6 xl:py-4
          rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2
              bg-gray-100
              hover:bg-gray-200
              text-gray-700 text-sm
              font-medium rounded-lg
              transition-colors">
            Đóng
          </button>
        </div>

      </div>
    </>
  )
}
