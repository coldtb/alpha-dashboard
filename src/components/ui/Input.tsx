import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="form-group">
      {label && <label>{label}</label>}
      <input className={className} {...props} />
      {error && <span className="error-text" style={{ fontSize: '0.7rem', color: 'var(--color-red)', marginTop: '2px', display: 'block' }}>{error}</span>}
    </div>
  );
};
