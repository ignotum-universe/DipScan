import { useEffect } from 'react';

export default function AuthHandler() {
  useEffect(() => {
    const handleUnauthorized = () => {
      window.location.href = '/'; 
    };
    
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  return null; // This component renders nothing, just handles logic
}