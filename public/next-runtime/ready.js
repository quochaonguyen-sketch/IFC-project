// Retained modules now load after hydration, which can be after DOMContentLoaded.
window.ifcOnReady = function (callback) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', callback, {once: true});
  } else {
    setTimeout(callback, 0);
  }
};
