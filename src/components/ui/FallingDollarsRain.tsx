import React, { useEffect } from 'react';

export const FallingDollarsRain: React.FC = () => {
  useEffect(() => {
    const container = document.getElementById('falling-dollars-container');
    if (!container) return;

    const spawnRealDollarBill = () => {
      if (!container) return;
      if (container.childElementCount > 25) return;

      const bill = document.createElement('div');
      bill.className = 'falling-real-dollar-bill';

      // Random position, speed, sway, rotation - FULL BRIGHT VISIBILITY
      const startLeft = Math.random() * 90; // 0vw to 90vw
      const duration = 6 + Math.random() * 7; // 6s to 13s fall duration
      const scale = 0.85 + Math.random() * 0.35; // 0.85 to 1.20 scale
      const opacity = 0.88 + Math.random() * 0.12; // 0.88 to 1.00 FULL BRIGHT OPACITY
      const sway = -70 + Math.random() * 140; // -70px to +70px gentle sway
      const rotZ = -20 + Math.random() * 40; // -20deg to +20deg gentle tilt

      bill.style.left = `${startLeft}vw`;
      bill.style.opacity = `${opacity}`;
      bill.style.animationDuration = `${duration}s`;
      bill.style.setProperty('--bill-scale', `${scale}`);
      bill.style.setProperty('--sway-x', `${sway}px`);
      bill.style.setProperty('--rot-z', `${rotZ}deg`);

      container.appendChild(bill);

      // Auto-remove element after fall animation completes
      setTimeout(() => {
        if (bill.parentNode === container) {
          container.removeChild(bill);
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
