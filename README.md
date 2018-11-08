# Chroma Search Service

This HTTP endpoint provides search capability to Chroma ArangoDb as [ArangoDB Foxx Application](https://docs.arangodb.com/devel/Manual/Foxx/).

## Deployment
The service can be deployed to a running **local Arango instance** automatically with [Foxx CLI](https://github.com/arangodb/foxx-cli) with simply a npm script:
```bash
# For first-time deployment if this service hasn't been installed yet
npm run deploy:install 
# For deployment updates
npm run deploy 
```   
## Brand Fuzzy Search
The `/fuzzy` endpoint provides a rather simple full-text fuzzy search to Chroma taxonomy collections 

### How does it work
The fuzzy-search works briefly in two stages for the search:
 - When the service starts, it will create search indexes on top of existing collection's texts, the text string will be tokenized into individual words, and each word will be normalized (e.g. remove punctuation) meanwhile a reverse map will be built to point to the original document.
 - In order to support for making a partial match on one string, a set of sub-strings will also indexed, all pointing to the belonging document of the original string 
 - When a search query is received on the search endpoint, the query string is used to match to the best of any indexed text and a score will be produced using [cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity) and [Levenshtein distance](https://en.wikipedia.org/wiki/Levenshtein_distance) algorithms. Results above a defined threshold are then returned.
 
### How are the results ordered
When the query has matched for more than one documents, the order will be sorted asc based on **conceptual distance** between the indexed string and the document, which is defined as follows:     
  - If the query matches the **nth** part of the text, e.g. if query `saint` matches the text `Central Saint Martins`, add a distance of `n` to conceptual distance. Matching on the start is better than matching on the middle.  
  - If the query matches a word from the start but leave **m** chars unmatched at the end, add a distance of `m * 0.1` to conceptual distance. Matching more of a word is better than matching less of it.
  - If the query matches a word which is a normalized version of the original, add a distance of `0.5` to conceptual distance.
  

## Asset full-text search
The `/search` endpoint is an experiment implementation to search the asset collection with [Arango 3.4 SearchView](https://docs.arangodb.com/3.4/AQL/Views/).

## Pre-requisite
This service only works with the [Arango 3.4](https://github.com/conde-nast-international/chroma-api/tree/feature/arango-3.4) version.