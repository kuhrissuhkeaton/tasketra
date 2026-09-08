// Plausible's standard init shim, moved out of an inline <script> tag in
// index.html into this external file. The inline version was silently
// blocked by our own CSP (script-src 'self' https://plausible.io has no
// 'unsafe-inline'), which meant plausible.init() never ran and Plausible
// was never actually recording pageviews/events in production. Serving
// this from 'self' fixes that without loosening the CSP.
window.plausible = window.plausible || function () { (plausible.q = plausible.q || []).push(arguments); };
plausible.init = plausible.init || function (i) { plausible.o = i || {}; };
plausible.init();
