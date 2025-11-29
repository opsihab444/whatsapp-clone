'use client';

import React, { useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string | null;
    senderName?: string;
    timestamp?: string;
}

export function ImagePreviewModal({
    isOpen,
    onClose,
    imageUrl,
    senderName,
    timestamp,
}: ImagePreviewModalProps) {
    const [zoom, setZoom] = React.useState(1);
    const [isMounted, setIsMounted] = React.useState(false);

    useEffect(() => {
        setIsMounted(true);
        return () => setIsMounted(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
            setZoom(1);
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const handleDownload = async () => {
        if (!imageUrl) return;
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whatsapp-image-${Date.now()}.jpg`; // Default name
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback for direct links if fetch fails (CORS)
            const a = document.createElement('a');
            a.href = imageUrl;
            a.download = `whatsapp-image-${Date.now()}.jpg`;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    if (!isMounted || !isOpen || !imageUrl) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-md border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                        {senderName && (
                            <span className="text-white font-medium text-sm">{senderName}</span>
                        )}
                        {timestamp && (
                            <span className="text-white/60 text-xs">{timestamp}</span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                        className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Zoom Out"
                    >
                        <ZoomOut className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                        className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Zoom In"
                    >
                        <ZoomIn className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-white/20 mx-1" />
                    <button
                        onClick={handleDownload}
                        className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Download"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
                        title="Close"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Image Container */}
            <div
                className={cn(
                    "flex-1 flex items-center justify-center p-4 overflow-hidden",
                    zoom > 1 ? "cursor-zoom-out" : "cursor-zoom-in"
                )}
                onClick={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
                onWheel={(e) => {
                    // Prevent default scroll behavior if needed, though body overflow is hidden
                    // Zoom in on scroll up (negative deltaY), zoom out on scroll down (positive deltaY)
                    const delta = e.deltaY * -0.001;
                    setZoom(z => Math.min(5, Math.max(0.5, z + delta)));
                }}
            >
                <div
                    className="relative transition-transform duration-200 ease-out"
                    style={{ transform: `scale(${zoom})` }}
                >
                    {/* Use standard img for better control in modal */}
                    <img
                        src={imageUrl}
                        alt="Full preview"
                        className="max-w-full max-h-[85vh] object-contain rounded-md shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>
        </div>,
        document.body
    );
}
