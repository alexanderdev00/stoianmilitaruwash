const jsdom = require('jsdom');
const fs = require('fs');

process.on('unhandledRejection', (reason, promise) => {
  console.log('UNHANDLED REJECTION:', reason);
});

const html = fs.readFileSync('index.html', 'utf8');
const dom = new jsdom.JSDOM(html, { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.fetch = async () => ({ ok: false });

const appCode = fs.readFileSync('app.js', 'utf8');
const script = dom.window.document.createElement('script');
script.textContent = appCode;
dom.window.document.body.appendChild(script);

try {
  dom.window.eval(`
    window.app = new SpalatorieApp();
  `);
  setTimeout(() => {
    console.log("App init finished. Loading screen:", dom.window.document.getElementById('loading-screen').className);
  }, 1000);
} catch (e) {
  console.log("SYNC ERROR:", e);
}
