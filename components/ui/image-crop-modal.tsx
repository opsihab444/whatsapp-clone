'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Plus, Minus, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageFile: File | null;
  onCropComplete: (croppedBlob: Blob) => void;
  isUploading?: boolean;
  title?: string;
}

export function ImageCropModal({
  isOpen,
  onClose,
  imageFile,
  onCropComplete,
  isUploading = false,
  title = 'Drag the image to adjust',
}: ImageCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const CROP_SIZE = 280;
  const MIN_SCALE = 1;
  const MAX_SCALE = 3;
  const SCALE_STEP = 0.1;

  // Load image when file changes
  useEffect(() => {
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageSrc(e.target?.result as string);
        setScale(1);
        setPosition({ x: 0, y: 0 });
      };
      reader.readAsDataURL(imageFile);
    } else {
      setImageSrc(null);
    }
  }, [imageFile]);

  // Calculate image dimensions on load
  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      const img = imageRef.current;
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      
      let width, height;
      if (aspectRatio > 1) {
        height = CROP_SIZE;
        width = CROP_SIZE * aspectRatio;
      } else {
        width = CROP_SIZE;
        height = CROP_SIZE / aspectRatio;
      }
      
      setImageSize({ width, height });
    }
  }, []);


  // Handle zoom
  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + SCALE_STEP, MAX_SCALE));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - SCALE_STEP, MIN_SCALE));
  };

  // Handle mouse/touch drag
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    setDragStart({
      x: clientX - position.x,
      y: clientY - position.y,
    });
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const newX = clientX - dragStart.x;
    const newY = clientY - dragStart.y;
    
    // Calculate bounds
    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;
    const maxX = Math.max(0, (scaledWidth - CROP_SIZE) / 2);
    const maxY = Math.max(0, (scaledHeight - CROP_SIZE) / 2);
    
    setPosition({
      x: Math.max(-maxX, Math.min(maxX, newX)),
      y: Math.max(-maxY, Math.min(maxY, newY)),
    });
  }, [isDragging, dragStart, imageSize, scale]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add/remove event listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setScale((prev) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev + delta)));
  };


  // Crop and export image
  const handleCrop = async () => {
    if (!imageRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const outputSize = 400; // Output image size
    canvas.width = outputSize;
    canvas.height = outputSize;
    
    const img = imageRef.current;
    
    // Calculate crop area in original image coordinates
    const displayScale = imageSize.width / img.naturalWidth;
    const cropCenterX = img.naturalWidth / 2 - position.x / (displayScale * scale);
    const cropCenterY = img.naturalHeight / 2 - position.y / (displayScale * scale);
    const cropSize = CROP_SIZE / (displayScale * scale);
    
    // Draw circular clip
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    
    // Draw image
    ctx.drawImage(
      img,
      cropCenterX - cropSize / 2,
      cropCenterY - cropSize / 2,
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize
    );
    
    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        onCropComplete(blob);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleClose = () => {
    setImageSrc(null);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="w-[380px] max-w-[90vw] p-0 gap-0 overflow-hidden bg-card border-border rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full transition-all duration-200 hover:scale-110"
              onClick={handleClose}
              disabled={isUploading}
            >
              <X className="h-5 w-5" />
            </Button>
            <span className="text-sm text-foreground font-medium">{title}</span>
          </div>
        </div>


        {/* Image Container */}
        <div className="relative bg-black/90">
          <div
            ref={containerRef}
            className="relative w-full aspect-square overflow-hidden cursor-move select-none"
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            onWheel={handleWheel}
          >
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Crop preview"
                className="absolute pointer-events-none transition-transform duration-75"
                style={{
                  width: imageSize.width * scale,
                  height: imageSize.height * scale,
                  left: `calc(50% - ${(imageSize.width * scale) / 2}px + ${position.x}px)`,
                  top: `calc(50% - ${(imageSize.height * scale) / 2}px + ${position.y}px)`,
                }}
                onLoad={handleImageLoad}
                draggable={false}
              />
            )}
            
            {/* Circular overlay mask */}
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full">
                <defs>
                  <mask id="circleMask">
                    <rect width="100%" height="100%" fill="white" />
                    <circle cx="50%" cy="50%" r={CROP_SIZE / 2} fill="black" />
                  </mask>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="rgba(0, 0, 0, 0.6)"
                  mask="url(#circleMask)"
                />
                <circle
                  cx="50%"
                  cy="50%"
                  r={CROP_SIZE / 2}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.3)"
                  strokeWidth="2"
                />
              </svg>
            </div>

            {/* Zoom Controls */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col bg-white dark:bg-zinc-800 rounded-lg shadow-lg overflow-hidden">
              <button
                onClick={handleZoomIn}
                disabled={scale >= MAX_SCALE || isUploading}
                className={cn(
                  "p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors border-b border-gray-200 dark:border-zinc-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Plus className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              </button>
              <button
                onClick={handleZoomOut}
                disabled={scale <= MIN_SCALE || isUploading}
                className={cn(
                  "p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Minus className="h-4 w-4 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </div>
        </div>


        {/* Footer with Confirm Button */}
        <div className="flex justify-center py-4 bg-card">
          <button
            onClick={handleCrop}
            disabled={isUploading || !imageSrc}
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center transition-all duration-300",
              "bg-emerald-500 hover:bg-emerald-600 hover:scale-105 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
              "shadow-lg hover:shadow-xl",
              "animate-fade-in"
            )}
          >
            {isUploading ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Check className="h-6 w-6 text-white" />
            )}
          </button>
        </div>

        {/* Hidden canvas for cropping */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
