import React from 'react';

export function SectionContainer({ title, subtitle, children, className = "" }) {
  return (
    <section className={`py-16 md:py-24 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <div className="text-center max-w-3xl mx-auto mb-16">
            {title && <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">{title}</h2>}
            {subtitle && <p className="text-lg text-slate-600">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
