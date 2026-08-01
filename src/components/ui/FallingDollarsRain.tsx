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

      // Random position, 2.5D speed, sway, rotation
      const startLeft = Math.random() * 92; // 0vw to 92vw
      const duration = 7 + Math.random() * 8; // 7s to 15s fall duration
      const scale = 0.70 + Math.random() * 0.40; // 0.70 to 1.10 scale
      const opacity = 0.28 + Math.random() * 0.25; // 0.28 to 0.53 crisp opacity
      const sway = -60 + Math.random() * 120; // -60px to +60px gentle sway
      const rotZ = -25 + Math.random() * 50; // -25deg to +25deg gentle tilt

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
    for (let i = 0; i < 14; i++) {
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
