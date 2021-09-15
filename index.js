import markdownIt from 'markdown-it';
import highlightjsPlugin from 'markdown-it-highlightjs';

const md = markdownIt({ html: true, linkify: true })
  .use(highlightjsPlugin);

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event))
});
/**
 * Respond with hello worker text
 * @param {Request} request
 * @param {Event} event
 */
async function handleRequest(request, event) {
  const { pathname } = new URL(request.url);
  const headers = new Headers();

  function resJSON(json, status = 200) {
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(json), { status, headers });
  }
  function resHTML(html, status = 200) {
    headers.set('content-type', 'text/html;charset=utf-8');
    // headers.set('content-type', 'text/html');
    return new Response(html, { status, headers });
  }

  if (pathname === '/health') {
    const sourceURL = 'https://cdn.jsdelivr.net/gh/RoyalIcing/yieldmachine@4478530fc40c3bf1208f8ea477f455ad34da308d/readme.md';
    const sourceText = await fetch(sourceURL).then(res => res.text());
    const html = md.render(sourceText);
    return resHTML(html);
  }

  // return resHTML('<p>Page not found</p>', 404);
  return new Response('Page not found');
}
