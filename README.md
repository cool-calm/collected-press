# Collected Press

Render Markdown from any GitHub repo or gist.

## Examples

### Rendered

- React’s Changelog: https://press.collected.workers.dev/view/1/github/facebook/react@a8cabb5648a14ef55cb96d679a526e3f731e9611/CHANGELOG.md
- Night Owl CSS: https://press.collected.workers.dev/view/1/github/highlightjs/highlight.js@e076acce3af97f2f7d89651a2661340df8fabc50/src/styles/night-owl.css

### Raw HTML

- Gist: https://press.collected.workers.dev/1/github/gist/gaearon/e7d97cdf38a2907924ea12e4ebdf3c85
- Repo Readme: https://press.collected.workers.dev/1/github/RoyalIcing/yieldmachine@4478530fc40c3bf1208f8ea477f455ad34da308d/readme.md
- Long Readme: https://press.collected.workers.dev/1/github/avelino/awesome-go@fa471593c56bf802ee77c81c419a3b45e4de9014/README.md

### Themed

- Gist with theme: https://press.collected.workers.dev/1/github/gist/gaearon/e7d97cdf38a2907924ea12e4ebdf3c85?theme
- Repo Readme with theme: https://press.collected.workers.dev/1/github/RoyalIcing/yieldmachine@4478530fc40c3bf1208f8ea477f455ad34da308d/readme.md?theme
- Long Readme with theme: https://press.collected.workers.dev/1/github/avelino/awesome-go@fa471593c56bf802ee77c81c419a3b45e4de9014/README.md?theme

## Principles

- Service is stateless. You pass in exactly what parameters you need.
- Can be called from anywhere. Backends, frontends, JavaScript, Swift, Rust, C#, Golang.
- Runs on the edge, has low latency for end users which provides a great user experience.
- Responses can be heavily cached like a CDN.

## Use Cases

- Allows zero-build websites. Just proxy HTTP, passing the repo, sha, and file path you want. As soon as you push changes to GitHub, it’s available to be served.
- Great for documentation websites.
