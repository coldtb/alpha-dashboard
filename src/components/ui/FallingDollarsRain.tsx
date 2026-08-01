import React, { useEffect } from 'react';

export const FallingDollarsRain: React.FC = () => {
  useEffect(() => {
    const container = document.getElementById('falling-dollars-container');
    if (!container) return;

    const spawnRealDollarBill = () => {
      if (!container) return;
      // Cap maximum active bill elements on screen
      if (container.childElementCount > 25) return;

      const bill = document.createElement('div');
      bill.className = 'falling-real-dollar-bill';

      // Random position, 3D speed, sway, rotation
      const startLeft = Math.random() * 95; // 0vw to 95vw
      const duration = 8 + Math.random() * 10; // 8s to 18s smooth slow fall
      const scale = 0.65 + Math.random() * 0.40; // 0.65 to 1.05 scale
      const opacity = 0.15 + Math.random() * 0.22; // 0.15 to 0.37 subtle ambient opacity
      const sway = -70 + Math.random() * 140; // -70px to +70px sway
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
    for (let i = 0; i < 12; i++) {
      setTimeout(spawnRealDollarBill, i * 400);
    }

    // Interval spawner
    const interval = setInterval(spawnRealDollarBill, 500);

    return () => {
      clearInterval(interval);
      if (container) container.innerHTML = '';
    };
  }, []);

  return <div id="falling-dollars-container" />;
};
