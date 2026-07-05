import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', style, ...props }) => {
  return (
    <div className="form-group">
      {label && <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '2px' }}>{label}</label>}
      <select 
        className={className} 
        style={{ 
          background: 'var(--bg-input)', 
          border: '1px solid var(--border-light)', 
          color: 'var(--color-text)', 
          padding: '0.4rem', 
          borderRadius: '0.5rem', 
          outline: 'none', 
          fontSize: '0.85rem',
          ...style 
        }} 
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ color: '#ffffff', backgroundColor: '#1a1b20' }}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
