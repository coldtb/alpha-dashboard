import React from 'react';

interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, children, className = '', ...props }) => {
  return (
    <div className={`planner-card ${className}`} {...props}>
      {title && <h3 className="panel-title" style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>{title}</h3>}
      {children}
    </div>
  );
};
