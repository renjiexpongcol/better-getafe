import React from 'react';

export function Card({ title, description, image, footer, onClick }) {
  return (
    <div 
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full"
      onClick={onClick}
    >
      {image && (
        <div className="h-48 w-full overflow-hidden">
          <img src={image} alt={title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
        </div>
      )}
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-xl font-bold text-slate-800 mb-2">{title}</h3>
        <p className="text-slate-600 mb-4 flex-1 line-clamp-3">{description}</p>
        {footer && (
          <div className="pt-4 border-t border-gray-100 mt-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
