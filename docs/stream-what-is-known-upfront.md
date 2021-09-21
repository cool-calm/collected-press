# Stream what is known upfront

_Note: this is talking about a server-rendered page. A statically rendered page will have the entire HTML upfront, so doesn’t require streaming._

## Problem

Too often HTML is served in one large blob. Someone requests a URL, and we do some processing for a little while to fetch all the data we need, and then we return some HTML.

Browsers are hungry. When they are provided HTML they process it. For example, as soon as your browser sees a `<link>` element it will schedule to download its content.

Browser don’t care if they receive half a HTML document at one moment, and the other half many seconds later. It’s best you take advantage of this behaviour.

## Solution

If you don’t send your `<head>` and all the `<link>` elements inside until you’ve assembled your page down to the final `</html>`, then you are holding up the browser.

So what we do is send the stuff that we do know about upfront as soon as possible.

## How

Here’s an HTML page with some content and links to a stylesheet and external JavaScript file:

```html
<!doctype html>
<html lang=en>
<head>
  <meta charset=utf-8>
  <meta name=viewport content="width=device-width, initial-scale=1.0">
  <title>My wonderful page</title>
  <meta property="og:description" content="It’s stunning">
  <link href="/assets/style.css" rel="stylesheet">
  <script src="/assets/main.js"></script>
</head>
<body>
  <h1>My wonderful page</h1>
  <p>And its wonderful content.</p>
  <p>So fantastic.</p>
</body>
</html>
```

Now let’s pretend that we fetch the content such as the title and paragraphs from a database. That database query might take say half a second to complete.

This is the content above that comes from the database:

```html
<!-- in the head -->
  <title>My wonderful page</title>
  <meta property="og:description" content="It’s stunning">

<!-- in the body -->
  <h1>My wonderful page</h1>
  <p>And its wonderful content.</p>
  <p>So fantastic.</p>
```

If we look at a different page, it would have different content:

```html
<!-- in the head -->
  <title>My really terrible page</title>
  <meta property="og:description" content="It’s bad">

<!-- in the body -->
  <h1>My really terrible page</h1>
  <p>And its woeful content.</p>
  <p>So awful.</p>
```

The other things in the HTML remained the same:

```html
<!doctype html>
<html lang=en>
<head>
  <meta charset=utf-8>
  <meta name=viewport content="width=device-width, initial-scale=1.0">
  <title><!-- title went here --></title>
  <!-- og:description went here -->
  <link href="/assets/style.css" rel="stylesheet">
  <script src="/assets/main.js"></script>
</head>
<body>
  <!-- body content went here -->
</body>
</html>
```

So what we can do is rearrange our page so that anything we know upfront, like links to stylesheets, is sent earlier:

```html
<!doctype html>
<html lang=en>
<head>
  <meta charset=utf-8>
  <meta name=viewport content="width=device-width, initial-scale=1.0">
  <link href="/assets/style.css" rel="stylesheet">
  <script src="/assets/main.js"></script>
  <!-- These move down -->
  <title>My wonderful page</title>
  <meta property="og:description" content="It’s stunning">
</head>
<body>
  <h1>My wonderful page</h1>
  <p>And its wonderful content.</p>
  <p>So fantastic.</p>
</body>
</html>
```

And we send the first part as soon as we receive our request:

```html
<!doctype html>
<html lang=en>
<head>
  <meta charset=utf-8>
  <meta name=viewport content="width=device-width, initial-scale=1.0">
  <link href="/assets/style.css" rel="stylesheet">
  <script src="/assets/main.js"></script>
```

We then query the database, which as you recall takes half a second to complete. But we’ve already sent some HTML to our users, so their browser will be able to use the stylesheet and script links we’ve provided it, and start downloading them sooner.

When we have our content from the database, we can then assemble and send the next part of the HTML:

```html
  <title>My wonderful page</title>
  <meta property="og:description" content="It’s stunning">
</head>
<body>
  <h1>My wonderful page</h1>
  <p>And its wonderful content.</p>
  <p>So fantastic.</p>
</body>
</html>
```

Now the user experience will be faster. The CSS & JS will load earlier, leading to the the overall page being loaded sooner.

----

Note: For an example of how to achieve this in a Cloudflare Worker, see [this `streamStyledHTML()` function](https://github.com/RoyalIcing/regenerated.dev/blob/c5f0a6477f84a5ee305c968941f60f6ef16e0098/index.js#L91).

---

## Faster with defer

You might find things load even earlier if you use the `defer` attribute on scripts, and move them before blocking references like stylesheet links.

Now our scripts [won’t block the parsing](https://developers.google.com/web/fundamentals/performance/critical-rendering-path/adding-interactivity-with-javascript) of HTML.

```html
<!doctype html>
<html lang=en>
<head>
  <meta charset=utf-8>
  <meta name=viewport content="width=device-width, initial-scale=1.0">
  <script defer src="/assets/main.js"></script>
  <link href="/assets/style.css" rel="stylesheet">
```

## Faster with preload?

If we had multiple stylesheets, we could also add a `preload` link for each one. This means the browser sees every URL before it starts blocking to finish loading the `rel="stylesheet"` links.

```html
<!doctype html>
<html lang=en>
<head>
  <meta charset=utf-8>
  <meta name=viewport content="width=device-width, initial-scale=1.0">
  <script defer src="/assets/main.js"></script>
  <link rel=preload href="/assets/first.css" as=style>
  <link rel=preload href="/assets/second.css" as=style>
  <link rel=preload href="/assets/third.css" as=style>
  <link href="/assets/first.css" rel="stylesheet"> <!- The browser now blocks here while it waits -->
  <link href="/assets/second.css" rel="stylesheet">
  <link href="/assets/third.css" rel="stylesheet">
```
