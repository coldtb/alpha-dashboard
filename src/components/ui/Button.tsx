import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'tab' | 'submit';
  active?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', active, children, className = '', ...props }) => {
  const getClassName = () => {
    let classes = 'custom-btn ';
    if (variant === 'primary') {
      classes += 'btn-primary ';
    } else if (variant === 'tab') {
      classes += `tab-btn ${active ? 'active' : ''} `;
    } else if (variant === 'submit') {
      classes += 'planner-submit-btn ';
    } else {
      classes += `btn-${variant} `;
    }
    return classes + className;
  };

  return (
    <button className={getClassName()} {...props}>
      {children}
    </button>
  );
};
