import React, { useEffect } from 'react';

export const FallingDollarsRain: React.FC = () => {
  useEffect(() => {
    const container = document.getElementById('falling-dollars-container');
    if (!container) return;

    // Symbols to drop: '$' signs and '$100' cash bill icons
    const dollarSymbols = ['$', '$', '$', '💵', '$100', '$', '💸', '$'];

    const spawnDollar = () => {
      if (!container) return;
      // Cap maximum active particles on screen to avoid lag
      if (container.childElementCount > 35) return;

      const dollar = document.createElement('div');
      dollar.className = 'falling-dollar-particle';

      const randomSymbol = dollarSymbols[Math.floor(Math.random() * dollarSymbols.length)];
      dollar.innerText = randomSymbol;

      // Random position, speed, rotation, and opacity
      const startLeft = Math.random() * 100; // 0vw to 100vw
      const duration = 6 + Math.random() * 8; // 6s to 14s fall duration
      const size = randomSymbol === '$100' || randomSymbol === '💵' ? (16 + Math.random() * 10) : (18 + Math.random() * 16);
      const opacity = 0.15 + Math.random() * 0.25; // 0.15 to 0.40 subtle opacity
      const sway = -60 + Math.random() * 120; // -60px to +60px sway
      const rotZ = -180 + Math.random() * 360;

      dollar.style.left = `${startLeft}vw`;
      dollar.style.fontSize = `${size}px`;
      dollar.style.opacity = `${opacity}`;
      dollar.style.animationDuration = `${duration}s`;
      dollar.style.setProperty('--sway-x', `${sway}px`);
      dollar.style.setProperty('--rot-z', `${rotZ}deg`);

      container.appendChild(dollar);

      // Auto-remove element after fall animation completes
      setTimeout(() => {
        if (dollar.parentNode === container) {
          container.removeChild(dollar);
        }
      }, duration * 1000);
    };

    // Initial batch
    for (let i = 0; i < 15; i++) {
      setTimeout(spawnDollar, i * 300);
    }

    // Interval spawner
    const interval = setInterval(spawnDollar, 400);

    return () => {
      clearInterval(interval);
      if (container) container.innerHTML = '';
    };
  }, []);

  return <div id="falling-dollars-container" />;
};
