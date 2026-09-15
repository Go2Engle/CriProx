const sources = Object.freeze({
  moxfield: {
    id: /^[A-Za-z0-9_-]+$/,
    url: (id) => `https://api2.moxfield.com/v3/decks/all/${encodeURIComponent(id)}`,
  },
  archidekt: {
    id: /^\d+$/,
    url: (id) => `https://archidekt.com/api/decks/${encodeURIComponent(id)}/`,
  },
});

function deckSourceUrl(request) {
  const provider = request?.provider;
  const source = Object.hasOwn(sources, provider) ? sources[provider] : undefined;
  const id = request?.id;
  if (!source || typeof id !== 'string' || !source.id.test(id))
    throw new Error('Unsupported deck source request.');
  return source.url(id);
}

module.exports = { deckSourceUrl };
