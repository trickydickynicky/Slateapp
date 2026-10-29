import React from 'react';

export default function BackButton({ onClick, title }) {
  return (
    <>
      <div style={{ position: 'sticky', top: 'calc(env(safe-area-inset-top) + 4px)', height: 0, zIndex: 50 }}>
        <button
          onClick={onClick}
          aria-label="Back"
          className="text-gray-400 hover:text-white text-2xl font-light"
          style={{ position: 'absolute', top: 0, left: 0, height: 32, lineHeight: '32px', padding: '0 16px 0 4px' }}
        >‹</button>
      </div>
      {title
        ? <div style={{ minHeight: 32, paddingLeft: 32, display: 'flex', alignItems: 'center', marginBottom: 16 }}>{title}</div>
        : <div style={{ height: 40 }} />}
    </>
  );
}