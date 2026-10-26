# Privatus Analytics for Shopify

**See how many people visit your Shopify store, and which visits end in a sale. No cookies, no bots.**

You want to know if people visit your store and which visits turn into sales.
But Google Analytics uses cookies, so in many countries you must show a cookie
pop-up first (the box that asks visitors to say yes to cookies). Many people
click no, so they never show up in your numbers. Bots add fake visits on top.

The Privatus Analytics app adds the script to your store theme, and a pixel that
counts Add to Cart, Checkout Started and Purchase with the order total, on
checkout too. You paste no code. The script sets no cookies and keeps no IP
addresses. Bots are filtered out before they are counted.

So you see how many real shoppers came, which pages they looked at, where they
came from and how many bought, on one simple dashboard. A report comes to your
inbox each week, and you can set alerts for when traffic jumps or drops. And you
don't need a cookie pop-up for your analytics.

**Free plan, no card:** 10,000 events a month (an event is a page view or an action you track) on up to 3 sites. [Start free at privatusanalytics.com](https://privatusanalytics.com).

- **No cookies.** No cookies and no hidden IDs on your visitors' devices, and no IP
  addresses are kept. Laws differ by country, so check your own legal advice.
- **Real people, not bots.** Known bots, data centers and spam visits are left
  out on every plan.
- **Small and fast.** The script is about 3 KB when compressed.

## About this repo

The Privatus Analytics app for Shopify has two extensions. The app installs both, so a merchant pastes nothing:

| Piece | Counts | Where it runs |
| --- | --- | --- |
| `theme-app-extension/` (app embed) | Storefront pageviews, engagement, modules, `privatus.track()` from theme code | Online store theme `<head>` |
| `extensions/privatus-analytics-pixel/` (web pixel) | `Add to Cart`, `Checkout Started`, `Purchase` with the order total | Shopify's pixel sandbox (also on checkout) |

`custom-pixel.js` is the same idea as a Customer Events custom pixel, for a store that adds the script by hand and does
not install the app.

**Checkout note:** themes and app embeds do not run on Shopify checkout or the thank-you page. Checkout and purchases
are only visible to a pixel, which is why the app has one. The pixel never counts pageviews, so nothing is counted twice.

## 1. The app

The app's embedded admin page, OAuth install and webhooks are served by privatusanalytics.com (`/shopify/*` in the
Rails app). `shopify.app.toml` is that app's configuration. Scopes: `read_themes` (to show whether the app embed is on),
`write_pixels` and `read_customer_events` (to create, update and delete the app's own web pixel).

1. Copy `theme-app-extension/` to `extensions/privatus-analytics/` and `extensions/privatus-analytics-pixel/` to the
   same place in the app project, and `shopify.app.toml` to its root.
2. `npm install` in the project, then `shopify app deploy`, then install the app on the store.
3. In the app (Shopify admin, Apps, Privatus Analytics), connect a site: paste its site id, or log in or sign up in a new
   tab. The app writes the site id to an app-owned metafield (`privatus_analytics.site_id`) that the embed reads, and
   creates the web pixel with the same site id (`webPixelCreate`). Disconnecting deletes the pixel.
4. Click **Open the theme editor**, switch on **Privatus Analytics** under App embeds and save. The other settings (SPA
   mode, modules, script host, allowed domains, excluded paths, masks, canonical) are optional.

### The app embed

The block targets `head`, prints the queue stub plus
`<script defer src="{host}/js/pa.js" data-site="...">`, escapes every value with Liquid's `escape`, always masks
`/account/orders/*`, and prints nothing in the theme editor (`request.design_mode`). The Site ID setting is only read
when the metafield is empty. The script host defaults to `https://privatusstats.com`, the Privatus Analytics tracker
host.

Without the app, you can paste the same `<script>` tag into `layout/theme.liquid` before `</head>`.

### The web pixel

The pixel runs in Shopify's strict sandbox, where `<script>` tags cannot be loaded, so it posts the same short-key JSON
that `pa.js` sends to `https://privatusstats.com/api/event` with `fetch` and `Content-Type: text/plain`. It subscribes to
three events only:

* `product_added_to_cart`: event `Add to Cart`, no properties.
* `checkout_started`: event `Checkout Started` on `/checkout`, no properties.
* `checkout_completed`: event `Purchase` on `/checkout/thank-you`, with `rv` (the order total, in major units like
  `pa.js`, stored in minor units) and `cu` (its currency).

Each hit also has the site id, the page URL (campaign parameters only), the referrer's origin and path, the browser
language and the screen width. It never has a customer's email, name, phone, address, order id, checkout token,
Shopify client id, IP address or User-Agent string. The pixel writes no storage and honours the visitor's own opt-out
flag (`privatus_optout`).

Settings (set by the app with `webPixelCreate` and `webPixelUpdate`, never typed by the merchant):

* `site_id`: the connected site's public id.
* `respect_consent`: `"false"` by default. The merchant switches it on in the app with **Respect the store's cookie
  consent**. Then the pixel sends only while `init.customerPrivacy.analyticsProcessingAllowed` is true and follows
  `customerPrivacy.subscribe('visitorConsentCollected')`.

Customer privacy in `shopify.extension.toml`: every purpose is `false` and data sale is `disabled`, so Shopify runs the
pixel without waiting for consent. Privatus Analytics sets no cookies and stores no personal data. Whether a store needs
consent for it depends on the store's own legal advice, which is why the consent setting exists.

The hit URL's hostname must be the site's domain in Privatus Analytics. With a custom domain, checkout runs on the same
domain. If checkout is on `*.myshopify.com`, add it to the site's extra domains.

## 2. Custom pixel (without the app)

1. Shopify admin, **Settings, Customer events, Add custom pixel**, name it "Privatus Analytics".
2. Paste the contents of `custom-pixel.js` and edit the constants at the top:
   * `SITE_ID`: your `pa_...` site id.
   * `API`: `https://privatusstats.com` (change it only for a self-hosted instance).
   * `RESPECT_CONSENT`: `false` by default. Set `true` to send only when
     `init.customerPrivacy.analyticsProcessingAllowed` is true.
   * `STOREFRONT_PAGEVIEWS`: set `false` when the script tag already counts storefront pageviews.
3. Customer privacy, Permission: "Not required" unless `RESPECT_CONSENT` is on. Data sale: "Data collected does not
   qualify as data sale".
4. **Save**, then **Connect**.

The custom pixel also counts pageviews and sends a few product attributes with Add to Cart (`product_type`, `vendor`,
`quantity`, `price`, `currency`) and the item count and a coupon flag with Purchase. Like the app's pixel it never sends
customer data.

## Verify

```sh
docker run --rm -v "$PWD":/w -w /w node:22 node --check custom-pixel.js
docker run --rm -v "$PWD/extensions/privatus-analytics-pixel":/w -w /w node:22 node --test test/hits.test.js
```

## License

MIT, see `LICENSE`.
