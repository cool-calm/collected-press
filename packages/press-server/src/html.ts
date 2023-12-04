import markdownIt from 'markdown-it'
import highlightjsPlugin from 'markdown-it-highlightjs'
import taskListsPlugin from 'markdown-it-task-lists'
import frontMatterPlugin from 'markdown-it-front-matter'
import { parse as parseYAML } from 'yaml'

let frontMatterCallback = (frontMatter: string) => {}

export const md = markdownIt({ html: true, linkify: true })
  .use(highlightjsPlugin)
  .use(taskListsPlugin)
  .use(frontMatterPlugin, (frontMatter: string) => {
    frontMatterCallback(frontMatter)
  })

export interface FrontmatterProperties {
  title?: string
  date?: string
  includes?: ReadonlyArray<string>
}
export function renderMarkdown(markdown: string): {
  html: string
  frontMatter: FrontmatterProperties
} {
  let frontMatterSource = ''
  frontMatterCallback = (receivedFrontmatter: string) => {
    frontMatterSource = receivedFrontmatter
  }
  const html: string = md.render(markdown)

  let frontMatter: FrontmatterProperties = {}
  try {
    frontMatter = parseYAML(frontMatterSource) ?? {}
  } catch {}

  return Object.freeze({ html, frontMatter })
}

export function streamText(
  makeSource: () => AsyncGenerator<string, void, void>,
): [ReadableStream<Uint8Array>, Promise<void>] {
  const encoder = new TextEncoder()
  // We can’t create a new ReadableStream in Cloudflare: https://developers.cloudflare.com/workers/runtime-apis/streams/readablestream/
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  async function performWrite() {
    for await (const chunk of makeSource()) {
      await writer.write(encoder.encode(chunk))
    }
    await writer.close()
  }

  return [readable, performWrite()]
}

export function streamStyledMarkdown(makeMarkdown) {
  return streamText(async function* () {
    yield* styledHTMLHeadElements()
    yield '<body><article>'
    yield md.render(await makeMarkdown())
    yield '</article>'
  })
}

const styledHTMLHeadElements = () => [
  `<!doctype html>`,
  `<html lang=en>`,
  `<meta charset=utf-8>`,
  `<meta name=viewport content="width=device-width, initial-scale=1.0">`,
  // '<link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet">',
  `<link href="https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css" rel="stylesheet">`,
  `<link href="https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css" rel="stylesheet">`,
  // '<link href="https://cdn.jsdelivr.net/npm/tailwindcss@^2/dist/base.min.css" rel="stylesheet">',
  // '<link href="https://cdn.jsdelivr.net/npm/highlight.js@11.2.0/styles/night-owl.css" rel="stylesheet">',
  // '<script src="https://cdn.usefathom.com/script.js" data-site="NSVCNPFP" defer></script>',
  '<title>Collected.Press</title>',
  `<style>
:root { --_color_: #0060F2; --shade-color: rgba(0,0,0,0.1); --block-margin-bottom: 1rem; }
body { line-height: 1.7; max-width: 50rem; margin: auto; padding: 3rem 1rem; background: rgb(250 250 250) }
a { color: var(--_color_); }
a:hover { text-decoration: underline; }
p, ul, ol, pre, hr, blockquote, h1, h2, h3, h4, h5, h6 { margin-bottom: var(--block-margin-bottom); }
pre { white-space: pre-wrap; white-space: break-spaces; }
h1, article > h2:first-child { font-size: 3em; line-height: 3.5rem; font-weight: 600; }
h1 > a:only-child { color: inherit; }
h2 { font-size: 2em; font-weight: 600; }
h3 { font-size: 1.25em; font-weight: 600; }
h4 { font-size: 1em; font-weight: 600; }
h5 { font-size: .875em; font-weight: 600; }
h6 { font-size: .85em; font-weight: 600; }
img { display: inline-block; }
article { color: rgb(82, 82, 91); }
article + article { margin-top: 8rem; }
article ul { list-style: inside; }
article ol { list-style: decimal inside; }
article ul ul, article ul ol, article ol ul, article ol ol { --block-margin-bottom: 0; padding-left: 2em; }
article pre { font-size: 90%; }
article code:not(pre *) { font-size: 90%; background-color: var(--shade-color); padding: .175em .375em; border-radius: 0.2em; }
header nav { display: flex; justify-content: center; margin-bottom: 3rem; }
header nav ul { display: flex; flex-wrap: wrap; }
header nav ul { padding: 0 0.5em; border-radius: 9999px; background: white; box-shadow: rgb(255, 255, 255) 0px 0px 0px 0px, rgba(24, 24, 27, 0.05) 0px 0px 0px 1px, rgba(39, 39, 42, 0.05) 0px 10px 15px -3px, rgba(39, 39, 42, 0.05) 0px 4px 6px -4px; }
header nav a { display: inline-block; padding: 0.5em 1em; font-weight: bold; color: inherit; }
header nav a:hover { color: var(--_color_); text-decoration: none; }
main nav { font-size: 1.5rem; }
main nav li [data-date] { display: block; font-size: 0.875rem; margin-bottom: -0.75rem; }
main nav li a { display: inline-flex; padding: 0.5em 0; font-weight: bold; color: currentColor; }
form { padding: 1rem; }
form[method="GET"] { display: flex; gap: 1rem; align-items: center; }
form button { padding: 0.25rem 0.75rem; background-color: #0060F224; color: black; border: 0.5px solid var(--_color_); border-radius: 999px; }
footer[role=contentinfo] { margin-top: 3rem; padding-top: 1rem; border-top: 0.25px solid currentColor; font-size: 0.75rem; }
</style>`,
]

export function defaultHTMLHead(): string {
  return styledHTMLHeadElements().join('\n')
}

export function renderStyledHTML(...contentHTML): string {
  return [...styledHTMLHeadElements(), '<body>', ...contentHTML]
    .filter(Boolean)
    .join('\n')
}
