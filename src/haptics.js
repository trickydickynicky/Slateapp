// src/haptics.js
export const haptic = (type = 'light') => {
    // Uses the Web Vibration API — works on iOS 17.5+ PWA and Android
    if (!navigator.vibrate) return;
    
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30],
      success: [10, 50, 10],
      warning: [20, 100, 20],
      error: [30, 100, 30, 100, 30],
      selection: [5],
    };
    
    navigator.vibrate(patterns[type] || patterns.light);
  };