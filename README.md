# Chroma Search Service

This HTTP endpoint implements a rather simple full-text fuzzy search to Chroma taxonomy collections as [ArangoDB Foxx Application](https://docs.arangodb.com/devel/Manual/Foxx/).

## Deployment
The service can be deployed to a running **local Arango instance** automatically with [Foxx CLI](https://github.com/arangodb/foxx-cli) with simply a npm script:
```bash
# For first-time deployment if this service hasn't been installed yet
npm run deploy:install 
# For deployment updates
npm run deploy 
```   

## How does it work
The fuzzy-search works briefly in two stages for the search:
 - When the service starts, it will create search indexes on top of existing collection's text data, both the original string and tokenized/normalized text will be indexed, meanwhile a reverse map will be built to lookup the original document.
 - When a search query is received on the search endpoint, the query string is used to match to the best of any indexed text and a score will be produced using [cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity) and [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance) algorithms. Results above a defined threshold are then returned.
