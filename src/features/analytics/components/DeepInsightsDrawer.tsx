import React from 'react';
import { useStore } from '../../../store';
import { formatPriceText, formatVolume, getTrueNorthKeyLevels, calculateCustomSetupScore, wikiTradePlans } from '../../../utils/helpers';
import { X } from 'lucide-react';

export const DeepInsightsDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    selectedCoin,
    drawerInsights,
    loadingInsights,
    customTrades,
    top100Coins,
    watchlistPrices,
  } = useStore();

  if (!isDrawerOpen || !selectedCoin) return null;

  const symbol = selectedCoin.symbol;
  const customPlan = customTrades.find((t) => t.symbol === symbol);

  // Check if we have custom plan or normal scanned coin
  let contentHtml = null;

  if (customPlan) {
    const scoreInfo = calculateCustomSetupScore(customPlan, top100Coins, watchlistPrices);
    const riskAmount = customPlan.accountSize * (customPlan.riskPct / 100);
    const riskPctOfEntry = Math.abs(customPlan.entry - customPlan.sl) / customPlan.entry;
    const positionSizeUsdt = riskPctOfEntry > 0 ? riskAmount / riskPctOfEntry : 0;
    const positionSizeTokens = customPlan.entry > 0 ? positionSizeUsdt / customPlan.entry : 0;
    const recommendedLeverage = customPlan.accountSize > 0 ? (positionSizeUsdt / customPlan.accountSize).toFixed(1) : '1';
    const directionClass = customPlan.direction === 'LONG' ? 'change-up' : 'change-down';
    const levels = getTrueNorthKeyLevels(selectedCoin);

    const invalidationText =
      customPlan.direction === 'LONG'
        ? `Хэрэв ханш ${formatPriceText(customPlan.sl)}-оос доош орж 4H хаалт хийвэл арилжааны Stop Loss идэвхжиж, $${riskAmount.toFixed(2)} (${customPlan.riskPct}%) алдагдал хүлээгээд гарна.`
        : `Хэрэв ханш ${formatPriceText(customPlan.sl)}-оос дээш орж 4H хаалт хийвэл арилжааны Stop Loss идэвхжиж, $${riskAmount.toFixed(2)} (${customPlan.riskPct}%) алдагдал хүлээгээд гарна.`;

    const levelPercent = (val: number, min: number, max: number) => {
      if (max === min) return 50;
      return Math.min(Math.max(((val - min) / (max - min)) * 100, 5), 95);
    };

    const maxL = Math.max(customPlan.entry, customPlan.sl, customPlan.tp);
    const minL = Math.min(customPlan.entry, customPlan.sl, customPlan.tp);
    const entryTop = levelPercent(customPlan.entry, minL, maxL);
    const slTop = levelPercent(customPlan.sl, minL, maxL);
    const tpTop = levelPercent(customPlan.tp, minL, maxL);

    contentHtml = (
      <>
        <div className="drawer-header">
          <div className="drawer-symbol">
            {symbol}
            <span className={`plan-type-badge ${directionClass}`} style={{ marginLeft: '8px' }}>
              {customPlan.direction} SETUP
            </span>
          </div>
          <div style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Custom Trade Plan — Score:{' '}
            <span className="score-badge" style={{ display: 'inline-block', background: 'rgba(139, 92, 246, 0.2)', padding: '2px 6px', borderRadius: '4px', color: 'var(--color-primary)', fontWeight: 600 }}>
              {customPlan.score}/100
            </span>
          </div>
          <div className="drawer-price">{formatPriceText(selectedCoin.price)}</div>
        </div>

        <div className="trade-plan-details" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h4 style={{ fontFamily: 'var(--font-title)', marginBottom: '0.5rem', color: 'var(--color-primary)', fontSize: '0.95rem' }}>
              Strategy Analysis
            </h4>
            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div>• Conviction Score: <strong>{scoreInfo.total}/100</strong></div>
              <div>• Risk/Reward Ratio: <strong>{scoreInfo.rr}:1</strong></div>
              <div>• Stop Loss Distance: <strong>{scoreInfo.slPct}%</strong></div>
              <div style={{ marginTop: '0.5rem', fontWeight: 500, color: '#fff' }}>
                Дүгнэлт:{' '}
                {customPlan.score >= 75 ? (
                  <span style={{ color: 'var(--color-green)' }}>🔥 High Conviction setup. Ороход тохиромжтой.</span>
                ) : customPlan.score >= 50 ? (
                  <span style={{ color: 'var(--color-blue)' }}>⏳ Moderate setup. Хяналтад авах.</span>
                ) : (
                  <span style={{ color: 'var(--color-red)' }}>⚠️ Low Conviction setup. Алгасахыг зөвлөж байна.</span>
                )}
              </div>
            </div>
          </div>

          <div className="plan-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Entry Price</span>
              <span className="stat-val" style={{ color: 'var(--color-blue)', fontSize: '1rem', fontWeight: 700 }}>
                {formatPriceText(customPlan.entry)}
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Stop Loss (SL)</span>
              <span className="stat-val down" style={{ color: 'var(--color-red)', fontSize: '1rem', fontWeight: 700 }}>
                {formatPriceText(customPlan.sl)}
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Target Profit (TP)</span>
              <span className="stat-val up" style={{ color: 'var(--color-green)', fontSize: '1rem', fontWeight: 700 }}>
                {formatPriceText(customPlan.tp)}
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Risk/Reward (R:R)</span>
              <span className="stat-val" style={{ color: '#c084fc', fontSize: '1rem', fontWeight: 700 }}>
                {scoreInfo.rr}:1
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Risk Amount</span>
              <span className="stat-val" style={{ color: 'var(--color-red)', fontSize: '1rem', fontWeight: 700 }}>
                ${riskAmount.toFixed(2)} ({customPlan.riskPct}%)
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Position Size</span>
              <span className="stat-val" style={{ color: 'var(--color-green)', fontSize: '1rem', fontWeight: 700 }}>
                ${positionSizeUsdt.toFixed(2)}
              </span>
            </div>
            <div className="plan-stat" style={{ gridColumn: 'span 2', background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Contracts & Recommended Leverage</span>
              <span className="stat-val" style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>
                {positionSizeTokens.toFixed(4)} {symbol} | Leverage: {recommendedLeverage}x (Safe limit:{' '}
                {(100 / parseFloat(scoreInfo.slPct)).toFixed(1)}x)
              </span>
            </div>
          </div>

          <div>
            <h4 style={{ fontFamily: 'var(--font-title)', marginBottom: '0.5rem', color: 'var(--color-blue)', fontSize: '0.95rem' }}>
              Level Visualization
            </h4>
            <div className="plan-visualization" style={{ position: 'relative', height: '120px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden', padding: '0.5rem' }}>
              <div
                className="viz-line tp"
                style={{
                  position: 'absolute',
                  left: '10%',
                  right: '10%',
                  height: '1px',
                  borderTop: '1px dashed rgba(0, 230, 118, 0.3)',
                  top: `${100 - tpTop}%`,
                }}
              />
              <div
                className="viz-line entry"
                style={{
                  position: 'absolute',
                  left: '10%',
                  right: '10%',
                  height: '1px',
                  borderTop: '1px solid var(--color-blue)',
                  top: `${100 - entryTop}%`,
                }}
              />
              <div
                className="viz-line sl"
                style={{
                  position: 'absolute',
                  left: '10%',
                  right: '10%',
                  height: '1px',
                  borderTop: '1px dashed rgba(255, 61, 0, 0.3)',
                  top: `${100 - slTop}%`,
                }}
              />

              <div
                className="viz-label tp"
                style={{
                  position: 'absolute',
                  top: `${100 - tpTop - 12}%`,
                  left: '12%',
                  fontSize: '0.7rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '76%',
                  color: customPlan.direction === 'LONG' ? 'var(--color-green)' : 'var(--color-red)',
                  fontWeight: customPlan.direction === 'LONG' ? '600' : 'normal',
                }}
              >
                <span>{customPlan.direction === 'LONG' ? 'TP Target' : 'SL Level'}</span>
                <span>{formatPriceText(customPlan.direction === 'LONG' ? customPlan.tp : customPlan.sl)}</span>
              </div>
              <div
                className="viz-label entry"
                style={{
                  position: 'absolute',
                  top: `${100 - entryTop - 12}%`,
                  left: '12%',
                  fontSize: '0.7rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '76%',
                  color: 'var(--color-blue)',
                  fontWeight: '600',
                }}
              >
                <span>Entry Level</span>
                <span>{formatPriceText(customPlan.entry)}</span>
              </div>
              <div
                className="viz-label sl"
                style={{
                  position: 'absolute',
                  top: `${100 - slTop - 12}%`,
                  left: '12%',
                  fontSize: '0.7rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '76%',
                  color: customPlan.direction === 'LONG' ? 'var(--color-red)' : 'var(--color-green)',
                  fontWeight: customPlan.direction === 'LONG' ? 'normal' : '600',
                }}
              >
                <span>{customPlan.direction === 'LONG' ? 'SL Level' : 'TP Target'}</span>
                <span>{formatPriceText(customPlan.direction === 'LONG' ? customPlan.sl : customPlan.tp)}</span>
              </div>
            </div>
          </div>

          {levels && (
            <div>
              <h4 style={{ fontFamily: 'var(--font-title)', marginBottom: '0.5rem', color: 'var(--color-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                </svg>
                TrueNorth Key Execution Zones
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(11, 12, 16, 0.4)', padding: '0.8rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Golden Pocket (0.618 support):</span>
                  <span style={{ color: '#ffd700', fontWeight: 600 }}>{formatPriceText(levels.fib0618)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Daily VWAP Pivot:</span>
                  <span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{formatPriceText(levels.vwap)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Short Liq Magnet (+2.5%):</span>
                  <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>{formatPriceText(levels.shortLiqCluster)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Long Liq Magnet (-2.5%):</span>
                  <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{formatPriceText(levels.longLiqCluster)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Deep Insights Placeholder */}
          <div id={`mcp-deep-insights-${symbol}`}>
            {renderDeepInsights()}
          </div>

          <div className="invalidation-box">
            <div className="invalidation-title">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                <path d="M12,2L1,21H23L12,2M12,6L19.8,18H4.2L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z" />
              </svg>
              Risk Invalidation Rule
            </div>
            <div>{invalidationText}</div>
          </div>
        </div>
      </>
    );
  } else {
    // Wiki plan / calculated plan details
    let plan = wikiTradePlans[symbol];
    if (!plan) {
      const isSqueeze = selectedCoin.setup === 'Squeeze Setup';
      const type = isSqueeze ? 'Mean Reversion Long' : selectedCoin.change >= 1.5 ? 'Momentum Long' : 'Range Breakout Long';
      const entryMin = selectedCoin.price * 0.98;
      const entryMax = selectedCoin.price;
      const slPrice = selectedCoin.price * 0.94;
      const tp1Price = selectedCoin.price * 1.05;
      const tp2Price = selectedCoin.price * 1.12;

      plan = {
        planType: type,
        badgeClass: selectedCoin.change >= 0 ? 'change-up' : 'change-down',
        entryZone: `${formatPriceText(entryMin)} – ${formatPriceText(entryMax)} (DCA Zone)`,
        sl: `${formatPriceText(slPrice)} (Below support limit)`,
        tp1: formatPriceText(tp1Price),
        tp2: formatPriceText(tp2Price),
        rr: '2.5:1 (Calculated)',
        invalidation: `Хэрэв ханш ${formatPriceText(slPrice)}-оос доош орж 4H лааны хаалт хийвэл сөрөг хөшүүргийн уналт үүсэх тул SL идэвхжиж арилжаа хүчингүй болно.`,
        desc: isSqueeze
          ? 'Ханш хэвтээ байгаа мөртлөө funding rate сөрөг байгаа нь short squeeze үүсэх таатай суурийг бүрдүүлсэн тул reversion entry бэлтгэнэ.'
          : 'Техникийн дэмжлэг, арилжааны хэмжээний өсөлт дээр суурилсан хамгаалалттай арилжааны чиглэл.',
      };
    }

    const levels = getTrueNorthKeyLevels(selectedCoin);
    const invalidationText = plan.invalidation;

    contentHtml = (
      <>
        <div className="drawer-header">
          <div className="drawer-symbol">
            {symbol}
            <span className={`plan-type-badge ${plan.badgeClass}`} style={{ marginLeft: '8px' }}>
              {plan.planType}
            </span>
          </div>
          <div style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
            Wiki Trade Blueprint — Est. R:R: <span style={{ color: '#ffd700', fontWeight: 600 }}>{plan.rr}</span>
          </div>
          <div className="drawer-price">{formatPriceText(selectedCoin.price)}</div>
        </div>

        <div className="trade-plan-details" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h4 style={{ fontFamily: 'var(--font-title)', marginBottom: '0.5rem', color: 'var(--color-primary)', fontSize: '0.95rem' }}>
              Wiki Plan Strategy
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
              {plan.desc}
            </p>
          </div>

          <div className="plan-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem' }}>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Entry Range</span>
              <span className="stat-val" style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                {plan.entryZone}
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Stop Loss (SL)</span>
              <span className="stat-val down" style={{ color: 'var(--color-red)', fontSize: '0.85rem', fontWeight: 700 }}>
                {plan.sl}
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Take Profit 1</span>
              <span className="stat-val up" style={{ color: 'var(--color-green)', fontSize: '0.85rem', fontWeight: 700 }}>
                {plan.tp1}
              </span>
            </div>
            <div className="plan-stat" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <span className="stat-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Take Profit 2</span>
              <span className="stat-val up" style={{ color: 'var(--color-green)', fontSize: '0.85rem', fontWeight: 700 }}>
                {plan.tp2}
              </span>
            </div>
          </div>

          {levels && (
            <div>
              <h4 style={{ fontFamily: 'var(--font-title)', marginBottom: '0.5rem', color: 'var(--color-blue)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
                </svg>
                TrueNorth Key Execution Zones
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(11, 12, 16, 0.4)', padding: '0.8rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Golden Pocket (0.618 support):</span>
                  <span style={{ color: '#ffd700', fontWeight: 600 }}>{formatPriceText(levels.fib0618)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Daily VWAP Pivot:</span>
                  <span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{formatPriceText(levels.vwap)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', paddingBottom: '0.3rem', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Short Liq Magnet (+2.5%):</span>
                  <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>{formatPriceText(levels.shortLiqCluster)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Long Liq Magnet (-2.5%):</span>
                  <span style={{ color: 'var(--color-green)', fontWeight: 600 }}>{formatPriceText(levels.longLiqCluster)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Deep Insights Placeholder */}
          <div id={`mcp-deep-insights-${symbol}`}>
            {renderDeepInsights()}
          </div>

          <div className="invalidation-box">
            <div className="invalidation-title">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                <path d="M12,2L1,21H23L12,2M12,6L19.8,18H4.2L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z" />
              </svg>
              Risk Invalidation Rule
            </div>
            <div>{invalidationText}</div>
          </div>
        </div>
      </>
    );
  }

  function renderDeepInsights() {
    if (loadingInsights) {
      return (
        <div className="mcp-drawer-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', padding: '2rem 1rem' }}>
          <div className="mcp-spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'bt-spin 1s linear infinite' }}></div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>TrueNorth & Whale Flow ачаалж байна...</div>
        </div>
      );
    }

    if (!drawerInsights) {
      return (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem' }}>
          TrueNorth: {symbol} нь дэмжигдээгүй эсвэл мэдээлэл байхгүй байна.
        </div>
      );
    }

    const { taData, derivData, whaleData, optionsData } = drawerInsights;

    // Build TA channels
    let channelsHtml = null;
    let vwapHtml = null;

    if (taData && taData.support_resistance) {
      const sr = taData.support_resistance;
      if (sr['support and resistance channel'] && sr['support and resistance channel'].channels) {
        const channels = [...sr['support and resistance channel'].channels]
          .sort((a: any, b: any) => b.strength - a.strength)
          .slice(0, 5);
        const currentPrice = taData.token_metadata?.current_price || selectedCoin!.price;

        channelsHtml = (
          <div className="channels-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {channels.map((ch: any, cidx: number) => {
              const mid = (ch.hi + ch.lo) / 2;
              const isSupport = mid < currentPrice;
              const typeColor = isSupport ? 'var(--color-green)' : 'var(--color-red)';
              const typeLabel = isSupport ? 'Support' : 'Resistance';
              const strengthPct = Math.min(ch.strength, 100);

              return (
                <div className="channel-row" key={cidx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: typeColor, fontWeight: 600, fontSize: '0.7rem', marginRight: '6px' }}>{typeLabel}</span>
                    <span className="channel-range" style={{ color: '#fff' }}>
                      {formatPriceText(ch.lo)} – {formatPriceText(ch.hi)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '50px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${strengthPct}%`, height: '100%', background: typeColor, borderRadius: '2px' }} />
                    </div>
                    <span className="channel-strength" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{ch.strength}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      if (sr.vwap && sr.vwap.cumulative) {
        const v = sr.vwap.cumulative;
        const slopeColor = v.slope === 'up' ? 'var(--color-green)' : 'var(--color-red)';
        const stateText = v.state === 'price_above' ? 'Үнэ дээр (Bullish)' : 'Үнэ доор (Bearish)';
        vwapHtml = (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', padding: '0.5rem 0.8rem', background: 'rgba(0,176,255,0.04)', borderRadius: '8px', border: '1px solid rgba(0,176,255,0.1)' }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>VWAP ({v.scope}):</span>
              <span style={{ fontFamily: 'var(--font-title)', fontWeight: 700, color: 'var(--color-blue)', marginLeft: '0.4rem' }}>{formatPriceText(v.value)}</span>
            </div>
            <div style={{ fontSize: '0.7rem' }}>
              <span style={{ color: slopeColor, fontWeight: 600 }}>{v.slope === 'up' ? '↗' : '↘'} {v.slope}</span> · <span style={{ color: 'var(--color-text-muted)' }}>{stateText}</span>
            </div>
          </div>
        );
      }
    }

    // Build Derivatives & Liquidation map
    let derivativesHtml = null;
    if (derivData && derivData.derivative_data) {
      const symKey = Object.keys(derivData.derivative_data).find(k => k !== '_metadata' && k !== 'url' && k !== 'title');
      if (symKey) {
        const d = derivData.derivative_data[symKey];
        
        let fundingBlock = null;
        const fundingKey = Object.keys(d).find(k => k.toLowerCase().includes('funding'));
        if (fundingKey) {
          const f = d[fundingKey];
          const rate = f.current_funding_rate_in_percentage;
          const annualized = f.annualized_funding_cost_est_in_percentage;
          const percentile = f.current_funding_percentile_7d;
          const fundingColor = rate < 0 ? 'var(--color-green)' : rate > 0.01 ? 'var(--color-red)' : 'var(--color-blue)';
          const fundingLabel = rate < 0 ? 'Сөрөг (Short даралт)' : rate > 0.01 ? 'Эерэг (Long даралт)' : 'Төвийг сахисан';

          fundingBlock = (
            <div className="liq-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
              <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="w-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Funding Rate</span>
                <span className="w-val" style={{ color: fundingColor, fontWeight: 700, fontSize: '0.9rem' }}>{rate != null ? rate.toFixed(4) : '–'}%</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{fundingLabel}</span>
              </div>
              <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="w-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Annualized / 7D Percentile</span>
                <span className="w-val" style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>{annualized != null ? annualized.toFixed(2) : '–'}%</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Percentile: {percentile != null ? percentile.toFixed(1) : '–'}%</span>
              </div>
            </div>
          );
        }

        let oiBlock = null;
        const oiKey = Object.keys(d).find(k => k.toLowerCase().includes('open interest'));
        if (oiKey) {
          const oi = d[oiKey];
          const oiCurrent = oi.current_open_interest;
          const oi1h = oi.rolling_changes?.oi_change_1h_abs || 0;
          const oi1d = oi.rolling_changes?.oi_change_1d_abs || 0;
          const oi1hColor = oi1h >= 0 ? 'var(--color-green)' : 'var(--color-red)';
          const oi1dColor = oi1d >= 0 ? 'var(--color-green)' : 'var(--color-red)';

          oiBlock = (
            <div className="liq-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="w-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Open Interest</span>
                <span className="w-val" style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>${formatVolume(oiCurrent)}</span>
              </div>
              <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="w-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>OI Δ (1h / 24h)</span>
                <span className="w-val" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  <span style={{ color: oi1hColor }}>{oi1h >= 0 ? '+' : ''}${formatVolume(Math.abs(oi1h))}</span> /{' '}
                  <span style={{ color: oi1dColor }}>{oi1d >= 0 ? '+' : ''}${formatVolume(Math.abs(oi1d))}</span>
                </span>
              </div>
            </div>
          );
        }

        let liqBlock = null;
        const liqKey = Object.keys(d).find(k => k.toLowerCase().includes('liquidation'));
        if (liqKey) {
          const liq = d[liqKey];
          const shortLiqs = liq.max_liquidation_points?.max_short_liquidation_point || [];
          const longLiqs = liq.max_liquidation_points?.max_long_liquidation_point || [];
          const imb = liq.imbalance;
          
          const shortTotal = imb?.short_total_usd || 0;
          const longTotal = imb?.long_total_usd || 0;
          const total = shortTotal + longTotal;
          const longPct = total > 0 ? (longTotal / total) * 100 : 50;

          liqBlock = (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>Liquidation Imbalance:</div>
              <div className="liq-ratio-bar-wrapper" style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                <div className="liq-ratio-bar-fill long" style={{ background: 'var(--color-green)', width: `${longPct}%`, height: '100%' }} />
                <div className="liq-ratio-bar-fill short" style={{ background: 'var(--color-red)', width: `${100 - longPct}%`, height: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: '0.2rem' }}>
                <span style={{ color: 'var(--color-green)' }}>Long: ${formatVolume(longTotal)}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{imb?.interpretation?.replace(/_/g, ' ') || ''}</span>
                <span style={{ color: 'var(--color-red)' }}>Short: ${formatVolume(shortTotal)}</span>
              </div>

              <div className="liq-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
                {shortLiqs.slice(0, 2).map((s: any, sidx: number) => (
                  <div key={sidx} className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderLeft: '2px solid var(--color-red)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="w-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Short Liq Magnet</span>
                    <span className="w-val" style={{ color: 'var(--color-red)', fontWeight: 700, fontSize: '0.85rem' }}>{formatPriceText(s.price)}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>${formatVolume(s.liq_usd)} · +{s.distance_pct?.toFixed(2)}%</span>
                  </div>
                ))}
                {longLiqs.slice(0, 2).map((l: any, lidx: number) => (
                  <div key={lidx} className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', borderLeft: '2px solid var(--color-green)', padding: '0.4rem 0.6rem', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="w-label" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Long Liq Magnet</span>
                    <span className="w-val" style={{ color: 'var(--color-green)', fontWeight: 700, fontSize: '0.85rem' }}>{formatPriceText(l.price)}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>${formatVolume(l.liq_usd)} · -{l.distance_pct?.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        derivativesHtml = (
          <div className="insight-block">
            <div className="insight-block-title">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                <path d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z" />
              </svg>
              Derivatives & Liquidation Map
              <span className="mcp-status-pill live">LIVE</span>
            </div>
            {fundingBlock}
            {oiBlock}
            {liqBlock}
          </div>
        );
      }
    }

    // Build Whale smart money flow
    let whaleHtml = null;
    if (whaleData && whaleData.smart_money) {
      const sm = whaleData.smart_money;
      const sentiment = sm.sentiment || 'NEUTRAL';
      const sentimentColor = sentiment === 'BULLISH' ? 'var(--color-green)' : sentiment === 'BEARISH' ? 'var(--color-red)' : 'var(--color-blue)';
      const sentimentBg = sentiment === 'BULLISH' ? 'rgba(0,230,118,0.08)' : sentiment === 'BEARISH' ? 'rgba(255,61,0,0.08)' : 'rgba(0,176,255,0.08)';
      const sentimentIcon = sentiment === 'BULLISH' ? '🐂' : sentiment === 'BEARISH' ? '🐻' : '⚖️';

      const lsRatio = sm.long_short_ratio || 0;
      const longPct = lsRatio > 0 ? (lsRatio / (lsRatio + 1)) * 100 : 50;

      const agg = sm.aggregated_position || {};
      const longPos = agg.long_position || 0;
      const shortPos = agg.short_position || 0;
      const netPos = agg.net_position || 0;

      const topWallets = (sm.top_wallets || []).slice(0, 5);

      whaleHtml = (
        <div className="insight-block" style={{ borderColor: `${sentimentColor.replace('var(', '').replace(')', '')}22` }}>
          <div className="insight-block-title">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
              <path d="M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z" />
            </svg>
            Whale Smart Money Flow (Hyperliquid)
            <span className="mcp-status-pill live">LIVE</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
            <span style={{ fontSize: '1.3rem' }}>{sentimentIcon}</span>
            <span className="sentiment-badge" style={{ background: sentimentBg, color: sentimentColor, fontWeight: 700, fontSize: '0.85rem', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              {sentiment}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              L/S Ratio: <span style={{ color: '#fff', fontWeight: 600 }}>{lsRatio.toFixed(2)}</span>
            </span>
          </div>

          <div className="whale-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            <div className="whale-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
              <span className="w-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Long Position</span>
              <span className="w-val" style={{ color: 'var(--color-green)', fontWeight: 700, fontSize: '0.9rem' }}>${formatVolume(longPos)}</span>
            </div>
            <div className="whale-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
              <span className="w-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Short Position</span>
              <span className="w-val" style={{ color: 'var(--color-red)', fontWeight: 700, fontSize: '0.9rem' }}>${formatVolume(shortPos)}</span>
            </div>
          </div>

          <div style={{ marginTop: '0.4rem' }}>
            <div className="whale-ratio-bar-wrapper" style={{ height: '6px', borderRadius: '3px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
              <div className="whale-ratio-bar-fill" style={{ background: 'var(--color-green)', width: `${longPct.toFixed(1)}%`, height: '100%' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: '0.15rem' }}>
              <span style={{ color: 'var(--color-green)' }}>Longs {longPct.toFixed(0)}%</span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                Net:{' '}
                <span style={{ color: netPos >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 600 }}>
                  {netPos >= 0 ? '+' : ''}${formatVolume(Math.abs(netPos))}
                </span>
              </span>
              <span style={{ color: 'var(--color-red)' }}>Shorts {(100 - longPct).toFixed(0)}%</span>
            </div>
          </div>

          <div style={{ marginTop: '0.6rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', fontWeight: 600 }}>Top Whale Positions:</div>
            {topWallets.length > 0 ? (
              topWallets.map((w: any, widx: number) => {
                const dirColor = w.direction === 'LONG' ? 'var(--color-green)' : 'var(--color-red)';
                const pnlColor = w.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
                return (
                  <div key={widx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.02)', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ color: dirColor, fontWeight: 700, fontSize: '0.65rem' }}>{w.direction}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '0.65rem' }}>
                        {w.wallet || w.wallet_address?.slice(0, 10) + '...'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                      <span style={{ color: '#fff', fontWeight: 600 }}>${formatVolume(Math.abs(w.value || 0))}</span>
                      <span style={{ color: pnlColor, fontSize: '0.65rem' }}>{w.pnl >= 0 ? '+' : ''}${formatVolume(Math.abs(w.pnl || 0))}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.6rem' }}>{w.leverage || '?'}x</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Мэдээлэл олдсонгүй.</div>
            )}
          </div>
        </div>
      );
    }

    // Build Options market info
    let optionsHtml = null;
    if (optionsData && optionsData.result && optionsData.result.content && optionsData.result.content[0] && optionsData.result.content[0].text) {
      try {
        const parsed = JSON.parse(optionsData.result.content[0].text);
        if (parsed && parsed.summary) {
          const s = parsed.summary;
          const kl = s.key_levels;

          let sentimentColor = s.sentiment === 'bullish' ? 'var(--color-green)' : s.sentiment === 'bearish' ? 'var(--color-red)' : 'var(--color-text-muted)';

          optionsHtml = (
            <div className="insight-block">
              <div className="insight-block-title">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                  <path d="M19,3H5C3.89,3 3,3.9 3,5V19C3,20.1 3.89,21 5,21H19C20.1,21 21,20.1 21,19V5C21,3.9 20.1,3 19,3M19,19H5V5H19V19M7,10H9V17H7V10M11,7H13V17H11V7M15,13H17V17H15V13Z" />
                </svg>
                Options & Gamma (GEX) Intelligence
                <span className="mcp-status-pill live">LIVE</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.75rem' }}>
                <span>Sentiment: <span style={{ color: sentimentColor, fontWeight: 600, textTransform: 'uppercase' }}>{s.sentiment || 'mixed'}</span></span>
                <span>Regime: <span style={{ color: s.regime === 'negative_gamma' ? 'var(--color-red)' : 'var(--color-green)' , fontWeight: 600 }}>{s.regime === 'negative_gamma' ? 'Negative Gamma' : 'Positive Gamma'}</span></span>
              </div>

              <div className="liq-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                  <span className="w-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>GEX Flip Price</span>
                  <span className="w-val" style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>{kl.gex_flip != null ? formatPriceText(kl.gex_flip) : '-'}</span>
                </div>
                <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                  <span className="w-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Max Pain</span>
                  <span className="w-val" style={{ color: 'var(--color-blue)', fontWeight: 700, fontSize: '0.9rem' }}>{kl.max_pain != null ? formatPriceText(kl.max_pain) : '-'}</span>
                </div>
              </div>

              <div className="liq-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.4rem' }}>
                <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                  <span className="w-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Nearest Put Wall (Support)</span>
                  <span className="w-val" style={{ color: 'var(--color-green)', fontWeight: 700, fontSize: '0.9rem' }}>{kl.nearest_put_wall != null ? formatPriceText(kl.nearest_put_wall) : '-'}</span>
                </div>
                <div className="liq-metric" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', padding: '0.4rem 0.6rem', borderRadius: '6px' }}>
                  <span className="w-label" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Nearest Call Wall (Resistance)</span>
                  <span className="w-val" style={{ color: 'var(--color-red)', fontWeight: 700, fontSize: '0.9rem' }}>{kl.nearest_call_wall != null ? formatPriceText(kl.nearest_call_wall) : '-'}</span>
                </div>
              </div>
            </div>
          );
        }
      } catch (err) {
        console.warn('Failed to parse optionsData:', err);
      }
    }

    return (
      <div className="mcp-insights-container" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.8rem' }}>
        {channelsHtml || vwapHtml ? (
          <div className="insight-block">
            <div className="insight-block-title">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                <path d="M3,14L3.5,14.07L8.07,9.5C7.89,8.85 8.06,8.11 8.59,7.59C9.37,6.8 10.63,6.8 11.41,7.59C11.94,8.11 12.11,8.85 11.93,9.5L14.5,12.07L15,12C15.79,12 16.5,12.31 17.03,12.83L20.29,9.57C20.1,8.92 20.27,8.16 20.8,7.63C21.59,6.84 22.84,6.84 23.63,7.63C24.41,8.41 24.41,9.67 23.63,10.45C23.1,10.98 22.34,11.15 21.7,10.96L18.44,14.22C18.95,15.09 18.88,16.2 18.14,17L21.5,20.37C22.15,20.18 22.91,20.35 23.44,20.88C24.22,21.66 24.22,22.92 23.44,23.7C22.66,24.5 21.39,24.5 20.61,23.7C20.08,23.18 19.91,22.41 20.1,21.77L16.73,18.39C15.93,19.13 14.83,19.2 13.96,18.69L11.39,21.27C11.58,21.91 11.41,22.67 10.88,23.2C10.1,24 8.83,24 8.05,23.2C7.27,22.42 7.27,21.16 8.05,20.38C8.58,19.85 9.34,19.68 9.98,19.87L12.55,17.3C12.04,16.41 12.12,15.3 12.88,14.5L10.3,11.93C9.66,12.11 8.9,11.94 8.38,11.41C7.59,10.63 7.59,9.37 8.38,8.59L3.8,13.17L3,14Z" />
              </svg>
              TrueNorth Support/Resistance Channels
              <span className="mcp-status-pill live">LIVE</span>
            </div>
            {channelsHtml}
            {vwapHtml}
          </div>
        ) : null}

        {derivativesHtml}
        {whaleHtml}
        {optionsHtml}
      </div>
    );
  }

  return (
    <>
      <div className="drawer-backdrop open" onClick={closeDrawer} />
      <div className="drawer open" style={{ display: 'block' }}>
        <button className="drawer-close" onClick={closeDrawer} aria-label="Close details" style={{ cursor: 'pointer' }}>
          <X size={20} />
        </button>
        <div id="drawer-content" style={{ padding: '2rem 1.5rem', height: '100%', overflowY: 'auto' }}>
          {contentHtml}
        </div>
      </div>
    </>
  );
};
