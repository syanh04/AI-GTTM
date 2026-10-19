'use client';

import React, { useState } from 'react';
import { MessageCircle, X, Minimize2 } from 'lucide-react';
import AIChatbot from './AIChatbot';

export default function FloatingChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 bg-primary text-primary-foreground p-4 rounded-full shadow-lg hover:scale-110 transition-transform duration-200 flex items-center gap-2"
                    aria-label="Mở trợ lý AI"
                >
                    <MessageCircle className="w-6 h-6" />
                    <span className="text-sm font-medium hidden md:inline">Trợ Lý AI</span>
                </button>
            )}

            {/* Floating Chat Window */}
            {isOpen && (
                <div
                    className={`fixed bottom-6 right-6 z-50 bg-card border border-border rounded-lg shadow-2xl transition-all duration-300 ${isMinimized ? 'w-80 h-14' : 'w-96 h-[600px]'
                        }`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-border bg-primary/10">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-primary" />
                            <h3 className="font-semibold text-sm">Trợ Lý AI Giao Thông</h3>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsMinimized(!isMinimized)}
                                className="p-1.5 hover:bg-muted rounded transition"
                                aria-label={isMinimized ? 'Mở rộng' : 'Thu nhỏ'}
                            >
                                <Minimize2 className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 hover:bg-muted rounded transition"
                                aria-label="Đóng"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Content */}
                    {!isMinimized && (
                        <div className="h-[calc(100%-56px)]">
                            <AIChatbot />
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
