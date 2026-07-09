// Configuração centralizada para otimização de imagens na landing page
// Seguindo as melhores práticas SaaS 2025

export interface ImageConfig {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpg' | 'png';
  loading?: 'lazy' | 'eager';
  sizes?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const defaultImageStyle: React.CSSProperties = {
  filter: 'brightness(1.05) saturate(1.1)',
  transition: 'all 0.3s ease'
};

export const heroImageStyle: React.CSSProperties = {
  ...defaultImageStyle,
  filter: 'brightness(1.1) saturate(1.2)'
};

export const backgroundImageStyle: React.CSSProperties = {
  filter: 'blur(2px) saturate(0.8)',
  transform: 'scale(1.1)',
  objectPosition: 'center'
};

export const profileImageStyle: React.CSSProperties = {
  ...defaultImageStyle,
  filter: 'brightness(1.05) saturate(1.1)',
  border: '2px solid rgba(34, 197, 94, 0.3)'
};

export const nicheImageStyle: React.CSSProperties = {
  ...defaultImageStyle,
  filter: 'brightness(0.8) saturate(0.7)'
};

// Padrão de URLs para Unsplash com otimização
export const getOptimizedUrl = (
  baseUrl: string, 
  width: number = 300, 
  height: number = 200, 
  quality: number = 80,
  format: 'webp' | 'jpg' = 'webp'
): string => {
  const baseUrlClean = baseUrl.split('?')[0];
  return `${baseUrlClean}?w=${width}&h=${height}&fit=crop&auto=format&q=${quality}&fm=${format}`;
};

// Lazy loading para todas as imagens exceto hero
export const defaultLoadingStrategy = 'lazy' as const;

// Tamanhos padrão para diferentes tipos de imagens
export const imageSizes = {
  profile: { width: 100, height: 100 },
  card: { width: 300, height: 200 },
  hero: { width: 1920, height: 1080 },
  thumbnail: { width: 80, height: 80 },
  testimonial: { width: 60, height: 60 }
};

// Coerência visual - filtros consistentes
export const visualFilters = {
  professional: 'brightness(1.05) saturate(1.1)',
  warm: 'brightness(1.1) saturate(1.2) sepia(0.1)',
  cool: 'brightness(1.05) saturate(0.9) hue-rotate(10deg)',
  dramatic: 'brightness(0.9) contrast(1.2) saturate(1.3)'
};
