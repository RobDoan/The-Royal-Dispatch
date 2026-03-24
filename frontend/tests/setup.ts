import '@testing-library/jest-dom';

// Mock HTMLMediaElement methods not implemented in jsdom
window.HTMLMediaElement.prototype.play = () => Promise.resolve();
window.HTMLMediaElement.prototype.pause = () => {};
window.HTMLMediaElement.prototype.load = () => {};
