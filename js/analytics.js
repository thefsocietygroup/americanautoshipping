/* Extracted from an inline <script> in index.html.
   Defers Google Analytics (G-GCNFZSPDXN) and GTM (GTM-NX9TD6G) until the
   first user interaction, or 5s after load, whichever comes first. */
(function () {
  var loaded = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function () {
      window.dataLayer.push(arguments);
    };
  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    window.gtag("js", new Date());
    window.gtag("config", "G-GCNFZSPDXN");
    var g = document.createElement("script");
    g.src = "https://www.googletagmanager.com/gtag/js?id=G-GCNFZSPDXN";
    g.async = true;
    document.head.appendChild(g);
    dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    var t = document.createElement("script");
    t.src = "https://www.googletagmanager.com/gtm.js?id=GTM-NX9TD6G";
    t.async = true;
    document.head.appendChild(t);
  }
  setTimeout(loadAnalytics, 5000);
  ["scroll", "click", "keydown", "mousemove", "touchstart"].forEach(function (e) {
    document.addEventListener(e, loadAnalytics, { once: true, passive: true });
  });
})();
