// Runs before first paint (index.html loads it synchronously), so a reader who chose dark gets
// no white flash. A file rather than an inline script, because the CSP allows only 'self'.
(function () {
  var theme = 'light';
  try {
    var stored = localStorage.getItem('ngpdf-theme');
    theme =
      stored === 'dark' || stored === 'light'
        ? stored
        : matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
  } catch {
    // Storage can be refused; fall back to light.
  }
  document.documentElement.dataset.theme = theme;
})();
