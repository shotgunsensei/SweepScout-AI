export const rssFixture = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Approved promotions</title>
  <item><title>Summer Gear Giveaway</title><link>https://sponsor.example/promo?utm_source=feed</link><description>No purchase necessary.</description><pubDate>Tue, 21 Jul 2026 12:00:00 GMT</pubDate></item>
  <item><title>Daily Cash Sweepstakes</title><link>https://sponsor.example/cash#enter</link><description>See official rules.</description></item>
</channel></rss>`;

export const jsonFixture = JSON.stringify({
  promotions: [
    { official_url: "https://sponsor.example/json-promo", name: "JSON Promotion", details: "Official public API result" },
  ],
});

export const structuredHtmlFixture = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"Event","name":"Structured Giveaway","url":"https://sponsor.example/structured","description":"Public listing"}}]}</script>
</head><body>Approved listing page</body></html>`;
