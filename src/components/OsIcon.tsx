import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface OsIconProps {
  os: string;
  type?: string;
  size?: number;
  color?: string;
}

const WindowsIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className="os-icon">
    <path d="M3 5.548l7.065-.966v6.83H3V5.548zM3 12.588h7.065v6.862L3 18.505v-5.917zM11.235 4.45L21 3v8.412h-9.765V4.45zM11.235 12.588H21V21l-9.765-1.384v-7.028z" />
  </svg>
);

const AppleIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className="os-icon">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const LinuxIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className="os-icon">
    <path d="M12 2C9.8 2 8 4.5 8 7.5c0 1.5.4 2.8 1 3.8C7.5 12.5 5 14.5 5 17c0 1.1.9 2 2 2h1.5c.5 1.2 1.8 2 3.5 2s3-.8 3.5-2H17c1.1 0 2-.9 2-2 0-2.5-2.5-4.5-4-5.7.6-1 1-2.3 1-3.8C16 4.5 14.2 2 12 2zm-1.5 5c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7zm3 0c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7zM12 10.5c-.8 0-1.5-.2-1.5-.5s.7-.5 1.5-.5 1.5.2 1.5.5-.7.5-1.5.5z" />
  </svg>
);

const AndroidIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className="os-icon">
    <path d="M17.523 15.34a1.003 1.003 0 010-2.007 1.003 1.003 0 010 2.006zm-11.046 0a1.003 1.003 0 010-2.007 1.003 1.003 0 010 2.006zm11.405-6.02l2.023-3.503a.42.42 0 00-.153-.573.42.42 0 00-.573.154l-2.047 3.544C15.53 8.098 13.83 7.588 12 7.588c-1.83 0-3.53.51-5.132 1.354L4.822 5.398a.42.42 0 00-.573-.154.42.42 0 00-.154.573l2.023 3.503C2.835 11.265.548 14.812.548 18.89h22.904c0-4.078-2.287-7.625-5.57-9.57z" />
  </svg>
);

export const OsIcon: React.FC<OsIconProps> = ({ os, type = 'desktop', size = 24, color = 'white' }) => {
  switch (os) {
    case 'windows':
      return <WindowsIcon size={size} color={color} />;
    case 'macos':
      return <AppleIcon size={size} color={color} />;
    case 'linux':
      return <LinuxIcon size={size} color={color} />;
    case 'android':
      return <AndroidIcon size={size} color={color} />;
    case 'ios':
      return <AppleIcon size={size} color={color} />;
    default:
      return type === 'mobile'
        ? <Smartphone size={size} color={color} />
        : <Monitor size={size} color={color} />;
  }
};
