import React, { useEffect } from 'react';
import { USD_100_BASE64 } from './usd100Base64';

export const FallingDollarsRain: React.FC = () => {
  useEffect(() => {
    const container = document.getElementById('falling-dollars-container');
    if (!container) return;

    const spawnRealDollarBill = () => {
      if (!container) return;
      if (container.childElementCount > 25) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'falling-real-dollar-bill';

      const img = document.createElement('img');
      img.src = USD_100_BASE64;
      img.alt = "$100 Bill";
      img.className = 'dollar-bill-img';

      wrapper.appendChild(img);

      // Random position, speed, sway, rotation
      const startLeft = Math.random() * 90; // 0vw to 90vw
      const duration = 7 + Math.random() * 8; // 7s to 15s fall duration
      const scale = 0.85 + Math.random() * 0.40; // 0.85 to 1.25 scale
      const opacity = 0.85 + Math.random() * 0.15; // 0.85 to 1.00 full opacity
      const sway = -60 + Math.random() * 120; // -60px to +60px sway
      const rotZ = -20 + Math.random() * 40; // -20deg to +20deg gentle tilt

      wrapper.style.left = `${startLeft}vw`;
      wrapper.style.opacity = `${opacity}`;
      wrapper.style.animationDuration = `${duration}s`;
      wrapper.style.setProperty('--bill-scale', `${scale}`);
      wrapper.style.setProperty('--sway-x', `${sway}px`);
      wrapper.style.setProperty('--rot-z', `${rotZ}deg`);

      container.appendChild(wrapper);

      // Auto-remove element after fall animation completes
      setTimeout(() => {
        if (wrapper.parentNode === container) {
          container.removeChild(wrapper);
        }
      }, duration * 1000);
    };

    // Initial batch
    for (let i = 0; i < 15; i++) {
      setTimeout(spawnRealDollarBill, i * 300);
    }

    // Interval spawner
    const interval = setInterval(spawnRealDollarBill, 400);

    return () => {
      clearInterval(interval);
      if (container) container.innerHTML = '';
    };
  }, []);

  return <div id="falling-dollars-container" />;
};
