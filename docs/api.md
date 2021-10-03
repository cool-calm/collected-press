# Collected.Press API

We serve a read-only transformation of public GitHub repos. It is provided with no warranty.

----

## GET GitHub HEAD Ref `/1/github/{owner}/{repo}/refs/HEAD`

Get the latest SHA of the [default branch](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/changing-the-default-branch), which is usually main.

This is equivalent to running `git ls-remote https://github.com/owner/repo --symref HEAD` in your shell.

You can use this SHA in any collected.press route that accepts them.

----

## GET GitHub Repo File `/1/github/{owner}/{repo}@{sha}/{...path}`

Renders a file within a GitHub repo.

### Markdown (file extension `.md`)

If the file is Markdown, then it is rendered as HTML. Syntax highlighting is done using [highlight.js](https://highlightjs.org/). This HTML has no `<head>` or `<body>`, and is designed for you to provide your own CSS, meta tags, links, and so on.

### Images (MIME type `image/*`)

Images are presented on an HTML page, with links pointing to the corresponding [jsdelivr URL][jsdelivr-github].

### Other file types

Other file types are wrapped in Markdown [fenced code blocks](https://www.markdownguide.org/extended-syntax/#fenced-code-blocks) using the file extension as the language. This is then rendered to HTML like any other Markdown.

For example a `style.css` file will get transformed into:
```markdown
~~~~~~~~~~~~css
CONTENTS OF style.css
~~~~~~~~~~~~
```

----

## GET View GitHub Repo `/github/{owner}/{repo}`

Lists the HEAD and branches for a provided GitHub repo.

For example:

- https://collected.press/github/evanw/esbuild
- https://collected.press/github/vuejs/vue
- https://collected.press/github/tailwindlabs/tailwindcss
- https://collected.press/github/graphql/graphql-js
- https://collected.press/github/facebook/react

----

## GET Home `/`

Renders the latest version of the collected.press [readme](https://github.com/RoyalIcing/collected-press/blob/main/README.md).


[jsdelivr-github]: https://www.jsdelivr.com/?docs=gh