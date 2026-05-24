import React, { useLayoutEffect, useRef, useState } from 'react';

interface ScaleWrapperProps {
  children: React.ReactNode;
  width?: number; // Base design width
  height?: number; // Base design height
}

/**
 * ScaleWrapper - Automatically scales its content to fit within the parent container
 * without using scrollbars or overflowing.
 */
export const ScaleWrapper: React.FC<ScaleWrapperProps> = ({ children }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const updateScale = () => {
      if (!wrapperRef.current || !contentRef.current) return;

      const parentWidth = wrapperRef.current.clientWidth;
      const parentHeight = wrapperRef.current.clientHeight;
      
      const designWidth = 900;
      const designHeight = 630;

      if (parentWidth > 0 && parentHeight > 0) {
        const scaleX = parentWidth / designWidth;
        const scaleY = parentHeight / designHeight;
        
        // Use the smaller scale factor to ensure it fits perfectly
        const newScale = Math.min(scaleX, scaleY);
        setScale(newScale);
      }
    };

    updateScale();
    
    // Also update on window resize
    window.addEventListener('resize', updateScale);
    
    // Create an observer to detect content changes (e.g. switching mini-games)
    const observer = new MutationObserver(updateScale);
    if (wrapperRef.current) {
      observer.observe(wrapperRef.current, { childList: true, subtree: true });
    }

    return () => {
      window.removeEventListener('resize', updateScale);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={contentRef}
        style={{
          width: '900px', 
          height: '630px', 
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          transition: 'transform 0.1s ease-out',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
};
