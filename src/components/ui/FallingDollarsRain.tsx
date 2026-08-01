import React, { useEffect } from 'react';

export const FallingDollarsRain: React.FC = () => {
  useEffect(() => {
    const container = document.getElementById('falling-dollars-container');
    if (!container) return;

    const spawnRealDollarBill = () => {
      if (!container) return;
      // Cap maximum active bill elements on screen
      if (container.childElementCount > 30) return;

      const bill = document.createElement('div');
      bill.className = 'falling-real-dollar-bill';

      // Random position, 3D speed, sway, rotation
      const startLeft = Math.random() * 95; // 0vw to 95vw
      const duration = 7 + Math.random() * 9; // 7s to 16s fall duration
      const scale = 0.70 + Math.random() * 0.45; // 0.70 to 1.15 scale
      const opacity = 0.35 + Math.random() * 0.40; // 0.35 to 0.75 opacity
      const sway = -80 + Math.random() * 160; // -80px to +80px sway
      const rotX = Math.random() * 720;
      const rotY = Math.random() * 720;
      const rotZ = -180 + Math.random() * 360;

      bill.style.left = `${startLeft}vw`;
      bill.style.opacity = `${opacity}`;
      bill.style.animationDuration = `${duration}s`;
      bill.style.setProperty('--bill-scale', `${scale}`);
      bill.style.setProperty('--sway-x', `${sway}px`);
      bill.style.setProperty('--rot-x', `${rotX}deg`);
      bill.style.setProperty('--rot-y', `${rotY}deg`);
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
      setTimeout(spawnRealDollarBill, i * 350);
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
