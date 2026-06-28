import React, { useState } from 'react';
import { wikiPrompts } from '../../../utils/helpers';

export const PromptsHub: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex(null);
      }, 2000);
    });
  };

  return (
    <section>
      <h2 className="grid-section-title">
        <svg width="20" height="20" fill="var(--color-primary)" viewBox="0 0 24 24" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '6px' }}>
          <path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3M7,7H17V5H19V19H5V5H7V7Z"/>
        </svg>
        TrueNorth AI Prompts Clipboard Hub
      </h2>
      <div className="prompts-section">
        {wikiPrompts.map((prompt, idx) => (
          <div key={idx} className="prompt-card">
            <div className="prompt-card-header">
              <div className="prompt-title">{prompt.title}</div>
              <button
                className="copy-btn"
                onClick={() => handleCopy(prompt.code, idx)}
                style={{
                  backgroundColor: copiedIndex === idx ? 'var(--color-green)' : '',
                  color: copiedIndex === idx ? '#0b0c10' : '',
                }}
              >
                {copiedIndex === idx ? (
                  <>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ marginRight: '4px', verticalAlign: 'middle' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                    </svg>
                    Copy Prompt
                  </>
                )}
              </button>
            </div>
            <div className="prompt-desc">{prompt.desc}</div>
            <div className="prompt-code">{prompt.code}</div>
          </div>
        ))}
      </div>
    </section>
  );
};
