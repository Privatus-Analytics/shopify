# Privatus Analytics for Shopify

Two pieces, use both for full coverage:

| Piece | Tracks | Where it runs |
| --- | --- | --- |
| `theme-app-extension/` (app embed) | Storefront pageviews, engagement, modules, `privatus.track()` from theme code | Online store theme `<head>` |
| `custom-pixel.js` (Customer Events pixel) | `page_viewed`, `Add to Cart`, **`Purchase` on checkout completion** | Shopify's pixel sandbox (also on checkout) |

**Checkout note:** themes and app embeds do not run on Shopify checkout or the thank-you page. The
`checkout_completed` event (and so revenue) is only available through a Customer Events pixel — install
`custom-pixel.js` if you want purchases. If you use both pieces, set the pixel to skip pageviews on storefront pages
you already count via the theme (`STOREFRONT_PAGEVIEWS = false`, see below).

## 1. Custom pixel (Customer Events)

1. Shopify admin → **Settings → Customer events → Add custom pixel**, name it "Privatus Analytics".
2. Paste the contents of `custom-pixel.js` and edit the constants at the top:
   * `SITE_ID` — your `pa_…` site id.
   * `API` — `https://privatusanalytics.com` (change it only for a self-hosted instance).
   * `RESPECT_CONSENT` — `false` by default (Privatus Analytics is cookieless and stores nothing). Set `true` to send only when
     `init.customerPrivacy.analyticsProcessingAllowed` is true; updates via `customerPrivacy.subscribe('visitorConsentCollected')`.
3. Customer privacy → Permission: "Not required" (cookieless) unless `RESPECT_CONSENT` is on; Data sale: "Data collected does not qualify as data sale".
4. **Save**, then **Connect**.

Why hits are sent directly: custom pixels run in a strict sandbox where `<script>` tags cannot be loaded, so the
pixel POSTs the same short-key JSON that `pa.js` sends (`s,t,u,r,n,p,rv,cu,id,l,w`) to `{API}/api/event` with
`fetch` and `Content-Type: text/plain`.

What is sent:

* `page_viewed` → pageview, `u` = page URL, `r` = referrer (origin + path only).
* `product_added_to_cart` → event `Add to Cart` with props `product_type`, `vendor`, `quantity`, `price`, `currency`.
* `checkout_completed` → event `Purchase` with `rv` = `checkout.totalPrice.amount`, `cu` = currency, props `items`
  (quantity sum) and `coupon_used`.

Privacy: no customer ids, emails, addresses, order ids or checkout tokens. Checkout URLs are collapsed to `/checkout`
(and `/checkout/thank-you` for purchases), order status URLs to `/account/orders/:id`, and all query parameters except
UTM/click-id campaign parameters are removed. The pixel honours the
visitor opt-out flag (`privatus_optout` in the storefront's localStorage, read via `browser.localStorage`) and never
writes storage.

Requirements/assumptions: the hit URL's hostname must be the site's domain in Privatus Analytics — with a custom domain,
checkout runs on the same domain; if checkout is on `*.myshopify.com`, add it to the site's extra domains.

### Avoiding double pageviews

If the theme app embed is enabled, set `STOREFRONT_PAGEVIEWS = false` in the pixel: it then only counts checkout
pages (which the theme cannot reach), plus Add to Cart and Purchase events.

## 2. Theme app extension (app embed)

This is an extension for a Shopify app you own (Partner Dashboard / Shopify CLI):

1. `shopify app init` (or use your existing app), then copy `theme-app-extension/` to `extensions/privatus-analytics/`.
2. `shopify app deploy`, install the app on the store.
3. Online Store → Themes → **Customize → App embeds** → enable **Privatus Analytics** and fill in the settings:
   site id, SPA mode, modules (engage/auto/vitals/clicks), script host, allowed domains,
   excluded paths, masks, canonical.

The block targets `head`, prints the queue stub plus
`<script defer src="{host}/js/pa.js" data-site="…">`, escapes every value with Liquid's `escape`, always masks
`/account/orders/*`, and prints nothing in the theme editor (`request.design_mode`).

Without an app, you can paste the same `<script>` tag into `layout/theme.liquid` before `</head>`.

## Verify

```sh
docker run --rm -v "$PWD":/w -w /w node:22 node --check custom-pixel.js
```

## License

MIT — see `LICENSE`.
