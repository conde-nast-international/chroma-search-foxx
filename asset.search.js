'use strict';
const { query, db } = require('@arangodb');
const joi = require('joi');
const createRouter = require('@arangodb/foxx/router');
const router = createRouter();

const view_name = 'AssetsSearchView';
const collection_name = 'assets';

db._dropView(view_name);

const asset_view = db._createView(view_name, 'arangosearch', {});
asset_view.properties({
      links: {
        [collection_name]:
            {
              analyzers: ["text_en"],
              includeAllFields: false,
              fields: {
                source: {},
                properties: {
                  includeAllFields: true,
                  fields:
                      {
                        seasonYear: {
                          analyzers: ["identity"],
                        }
                      }
                }
              }
            }
      }
    }
);

router.get('/search', function (req, res) {
  const start = Date.now();
  const { q } = req.queryParams;
  const results = db._query(`
    let words = TOKENS(@q, 'text_en')
    FOR asset IN AssetsSearchView
    SEARCH ANALYZER(asset.properties.brand in words, 'text_en')
    OR ANALYZER(asset.properties.season in words, 'text_en')
    OR ANALYZER(asset.properties.city in words, 'text_en')
    SORT TFIDF(asset) DESC
    LIMIT 200
    RETURN MERGE({id:asset._id}, asset.properties)
  `, {q}).toArray();
  const time = `${Date.now() - start}ms`;
  res.json({ results, time });
})
.queryParam('q', joi.string().required(), 'search query')
.response(['text/plain'], 'Matched results')
.summary('Search Asset')
.description('Full-text search on asset');

module.exports = router;