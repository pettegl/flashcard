import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
}

const read = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight });

/** Current viewport size in CSS px, updated on resize and orientation change. */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(read);

  useEffect(() => {
    const update = () =>
      setViewport((current) => {
        const next = read();
        return next.width === current.width && next.height === current.height ? current : next;
      });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return viewport;
}
