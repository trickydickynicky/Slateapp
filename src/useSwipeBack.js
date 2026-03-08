import { useEffect, useRef } from 'react';

export function useSwipeBack(onClose) {
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const el = document.querySelector('.swipe-back-screen');
    if (!el) return;

    const onTouchStart = (e) => {
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (x > 30) return;
      touchStartX.current = x;
      touchStartY.current = y;
      isDragging.current = false;
    };

    const onTouchMove = (e) => {
      if (touchStartX.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      if (!isDragging.current) {
        if (Math.abs(dy) > Math.abs(dx)) {
          touchStartX.current = null;
          return;
        }
        if (dx > 10) isDragging.current = true;
      }

      if (isDragging.current) {
        e.preventDefault();
        const progress = Math.min(dx / window.innerWidth, 1);
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = `${1 - progress * 0.3}`;
      }
    };

    const onTouchEnd = (e) => {
      if (!isDragging.current) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const velocity = dx / window.innerWidth;

      if (velocity > 0.35) {
        el.style.transition = 'transform 0.25s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease';
        el.style.transform = `translateX(100%)`;
        el.style.opacity = '0';
        setTimeout(onClose, 250);
      } else {
        el.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease';
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
      }

      setTimeout(() => {
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
      }, 320);

      touchStartX.current = null;
      isDragging.current = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onClose]);
}