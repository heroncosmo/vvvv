import { useEffect, useRef, useState } from "react";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  [key: string]: any;
}

export default function LazyImage({ src, alt, className, ...props }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <img
      ref={imgRef}
      src={isLoaded ? src : undefined}
      data-src={!isLoaded ? src : undefined}
      alt={alt}
      className={`transition-opacity duration-300 ${!isLoaded ? 'opacity-0' : isLoaded ? 'opacity-100' : ''} ${className}`}
      onLoad={() => setIsLoaded(true)}
      {...props}
    />
  );
}
