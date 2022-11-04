import markdownIt from 'markdown-it'
import highlightjsPlugin from 'markdown-it-highlightjs'
import taskListsPlugin from 'markdown-it-task-lists'
import frontMatterPlugin from 'markdown-it-front-matter'
import { encodeHex } from './encodings'

export const md = markdownIt({ html: true, linkify: true })
  .use(highlightjsPlugin)
  .use(taskListsPlugin)
  .use(frontMatterPlugin, (frontMatter) => { })

const assets = {
  tailwindcssbase: null,
  "night-owl": null
};

export function lookupAsset(assetName) {
  return assets[assetName]
}

async function fetchAsset(url) {
  return await fetch(url)
    .then(res => res.text())
    .then(async (source) => ({
      source,
      sha256: await crypto.subtle.digest("SHA-256", (new TextEncoder()).encode(source))
    }))
}
export async function loadAssets() {
  const tailwindcssbase = fetchAsset("https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css")
  const nightOwl = fetchAsset("https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css")

  assets["tailwindcssbase"] ||= await tailwindcssbase;
  assets["night-owl"] ||= await nightOwl;
}
function assetSHA256(assetName) {
  return encodeHex(assets[assetName].sha256)
}

function streamHTML(makeSource) {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  async function performWrite() {
    for await (const chunk of makeSource()) {
      await writer.write(encoder.encode(chunk));
    }
    await writer.close();
  }

  return [readable, performWrite()];
}

export function streamStyledMarkdown(makeMarkdown) {
  return streamHTML(async function* () {
    yield* styledHTMLHeadElements();
    yield "<body><article>";
    yield md.render(await makeMarkdown());
    yield "</article>";
  })
}


const styledHTMLHeadElements = () => [
  `<!doctype html>`,
  `<html lang=en>`,
  `<meta charset=utf-8>`,
  `<meta name=viewport content="width=device-width, initial-scale=1.0">`,
  // '<link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">',
  `<link href="/assets/tailwindcssbase/${assetSHA256("tailwindcssbase")}.css" rel="stylesheet">`,
  `<link href="/assets/night-owl/${assetSHA256("night-owl")}.css" rel="stylesheet">`,
  // '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css" rel="stylesheet">',
  // '<link href="https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css" rel="stylesheet">',
  '<script src="https://cdn.usefathom.com/script.js" data-site="NSVCNPFP" defer></script>',
  `<style>
:root { --_color_: #0060F2; --shade-color: rgba(0,0,0,0.1); --block-margin-bottom: 1rem; }
body { max-width: 50rem; margin: auto; padding: 3rem 1rem; }
a { color: var(--_color_); }
a:hover { text-decoration: underline; }
p, ul, ol, pre, hr, blockquote, h1, h2, h3, h4, h5, h6 { margin-bottom: var(--block-margin-bottom); }
pre { white-space: pre-wrap; white-space: break-spaces; }
h1, article > h2:first-child { font-size: 2em; font-weight: 600; }
h2 { font-size: 1.5em; font-weight: 600; }
h3 { font-size: 1.25em; font-weight: 600; }
h4 { font-size: 1em; font-weight: 600; }
h5 { font-size: .875em; font-weight: 600; }
h6 { font-size: .85em; font-weight: 600; }
img { display: inline-block; }
article + article { margin-top: 8rem; }
article ul { list-style: inside; }
article ol { list-style: decimal inside; }
article ul ul, article ul ol, article ol ul, article ol ol { --block-margin-bottom: 0; padding-left: 2em; }
article pre { font-size: 90%; }
article code:not(pre *) { font-size: 90%; background-color: var(--shade-color); padding: .175em .375em; border-radius: 0.2em; }
nav ul { display: flex; flex-wrap: wrap; }
nav a { display: inline-block; padding: 0.5em; background: #f5f5f5; }
nav a { border: 1px solid #e5e5e5; }
nav li:not(:first-child) a { border-left: none; }
nav a:hover { background: #e9e9e9; border-color: #ddd; }
form { padding: 1rem; }
form[method="GET"] { display: flex; gap: 1rem; align-items: center; }
form button { padding: 0.25rem 0.75rem; background-color: #0060F224; color: black; border: 0.5px solid var(--_color_); border-radius: 999px; }
footer[role=contentinfo] { margin-top: 3rem; padding-top: 1rem; border-top: 0.25px solid currentColor; font-size: 0.75rem; }
</style>`,
];

export function renderStyledHTML(...contentHTML) {
  return [
    ...styledHTMLHeadElements(),
    "<body>",
    ...contentHTML,
  ].filter(Boolean).join('\n')
}

/**
 *
 * @param {string} markdown
 * @param {string} path
 * @param {string} mimeType
 * @param {undefined | URLSearchParams | Map} options
 * @returns {string}
 */
export function renderMarkdown(markdown, path, mimeType, options) {
  const [, extension] = /.+[.]([a-z\d]+)$/.exec(path) || []
  if (extension && extension !== 'md' && mimeType !== 'text/markdown') {
    markdown = [`~~~~~~~~~~~~${extension}`, markdown, '~~~~~~~~~~~~'].join('\n')
  }

  let html = md.render(markdown)

  if (options && options.has('theme')) {
    html = renderStyledHTML('<article>', html, '</article>')
  }

  return html
}

/**
 *
 * @param {string} markdown
 * @param {string} type
 * @returns {string}
 */
export function renderCodeAsMarkdown(markdown, type) {
  markdown = [`~~~~~~~~~~~~${type}`, markdown, '~~~~~~~~~~~~'].join('\n')
  return md.render(markdown)
}