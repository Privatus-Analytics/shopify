// Privatus Analytics web pixel (app extension). MIT License.
// Runs in Shopify's strict pixel sandbox: no DOM, no <script>, so it posts
// the same JSON pa.js sends with fetch. It writes no storage and reads one
// flag only, the visitor's own opt-out (privatus_optout).
import { register } from '@shopify/web-pixels-extension'
import { ENDPOINT, EVENTS, hitFor, consentRequired } from './hits.js'

register(({ analytics, browser, init, settings, customerPrivacy }) => {
  const waitForConsent = consentRequired(settings)
  let allowed = !waitForConsent ||
    !!(init && init.customerPrivacy && init.customerPrivacy.analyticsProcessingAllowed)

  if (waitForConsent && customerPrivacy && customerPrivacy.subscribe) {
    customerPrivacy.subscribe('visitorConsentCollected', (event) => {
      allowed = !!(event && event.customerPrivacy && event.customerPrivacy.analyticsProcessingAllowed)
    })
  }

  async function optedOut () {
    try {
      return (await browser.localStorage.getItem('privatus_optout')) === '1'
    } catch (e) {
      return false
    }
  }

  EVENTS.forEach((name) => {
    analytics.subscribe(name, async (event) => {
      if (!allowed) return
      const hit = hitFor(name, event, settings && settings.site_id)
      if (!hit || (await optedOut())) return
      try {
        await fetch(ENDPOINT, {
          method: 'POST',
          body: JSON.stringify(hit),
          headers: { 'Content-Type': 'text/plain' },
          credentials: 'omit',
          keepalive: true
        })
      } catch (e) { /* best effort, like pa.js */ }
    })
  })
})
