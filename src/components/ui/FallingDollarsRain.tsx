import React, { useEffect } from 'react';

export const FallingDollarsRain: React.FC = () => {
  useEffect(() => {
    const container = document.getElementById('falling-dollars-container');
    if (!container) return;

    const spawnDollarBill = () => {
      if (!container) return;
      // Cap maximum active bill elements on screen
      if (container.childElementCount > 30) return;

      const bill = document.createElement('div');
      bill.className = 'falling-paper-dollar-bill';

      // Inner banknote content: $100 Cash Bill Design
      bill.innerHTML = `
        <div class="bill-border">
          <span class="bill-corner top-left">$100</span>
          <span class="bill-corner top-right">$100</span>
          <div class="bill-seal">
            <span class="bill-text">100</span>
            <span class="bill-label">UNITED STATES OF AMERICA</span>
          </div>
          <span class="bill-corner bottom-left">$100</span>
          <span class="bill-corner bottom-right">$100</span>
        </div>
      `;

      // Random position, 3D speed, sway, rotation
      const startLeft = Math.random() * 95; // 0vw to 95vw
      const duration = 7 + Math.random() * 9; // 7s to 16s fall duration
      const scale = 0.65 + Math.random() * 0.45; // 0.65 to 1.10 scale
      const opacity = 0.25 + Math.random() * 0.35; // 0.25 to 0.60 opacity
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
    for (let i = 0; i < 12; i++) {
      setTimeout(spawnDollarBill, i * 400);
    }

    // Interval spawner
    const interval = setInterval(spawnDollarBill, 500);

    return () => {
      clearInterval(interval);
      if (container) container.innerHTML = '';
    };
  }, []);

  return <div id="falling-dollars-container" />;
};
