import posthog from 'posthog-js'

// Initialize PostHog
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST

if (posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    // Exception autocapture - captures uncaught errors and unhandled promise rejections
    capture_exceptions: true,
    // Session replay
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,
      maskInputFn: (text, element) => {
        // Mask any sensitive inputs if needed
        if (element?.getAttribute('type') === 'password') {
          return '*'.repeat(text.length)
        }
        return text
      },
    },
  })
}

export { posthog }
