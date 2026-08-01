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

      // Random flutter wave speed for paper wind movement
      const flutterSpeed = 2.2 + Math.random() * 2.0; // 2.2s to 4.2s paper wave
      img.style.setProperty('--flutter-speed', `${flutterSpeed}s`);

      wrapper.appendChild(img);

      // Random position, speed, sway, rotation — Realistic Wind Flutter
      const startLeft = Math.random() * 90; // 0vw to 90vw
      const duration = 8 + Math.random() * 9; // 8s to 17s graceful drifting fall
      const scale = 0.82 + Math.random() * 0.38; // 0.82 to 1.20 scale
      const opacity = 0.45 + Math.random() * 0.10; // 50% Dim Opacity
      const sway = -80 + Math.random() * 160; // -80px to +80px wind sway
      const rotZ = -22 + Math.random() * 44; // -22deg to +22deg wind tilt

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
      setTimeout(spawnRealDollarBill, i * 320);
    }

    // Interval spawner
    const interval = setInterval(spawnRealDollarBill, 450);

    return () => {
      clearInterval(interval);
      if (container) container.innerHTML = '';
    };
  }, []);

  return <div id="falling-dollars-container" />;
};
