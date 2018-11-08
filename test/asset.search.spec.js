'use strict';
const { query, db } = require('@arangodb');

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
                        year: {
                          analyzers: ["identity"],
                        }
                      }
                }
              }
            }
      }
    }
);

// it works
console.log('search "source" field with analyzer override:', query(`
    FOR asset IN AssetsSearchView
    SEARCH ANALYZER(asset.source == 'fashionshow', 'text_en')
    RETURN asset._id
  `).toArray());

// it works
console.log('phrase search "properties.brand" field', query(`
    FOR asset IN AssetsSearchView
    SEARCH ANALYZER(asset.properties.brand in ['Ralph'], 'text_en')
    RETURN asset._id
  `).toArray());

// it works
console.log('phrase search "properties.brand" field', query(`
    FOR asset IN AssetsSearchView
    SEARCH ANALYZER(asset.properties.brand in TOKENS('Ralph & Russo', 'text_en'), 'text_en')
    RETURN asset._id
  `).toArray());

// it works
console.log('phrase search "properties.brand" field', query(`
    FOR asset IN AssetsSearchView
    SEARCH PHRASE(asset.properties.brand, 'Ralph & Russo', 'text_en')
    RETURN asset._id
  `).toArray());

// it works
console.log('phrase search "source" field:', query(`
    FOR asset IN AssetsSearchView
    SEARCH PHRASE(asset.source, 'fashionshow', 'text_en') 
    RETURN asset._id
  `).toArray());

// it works
console.log('phrase search "properties.brand" field', query(`
    FOR asset IN AssetsSearchView
    SEARCH PHRASE(asset.properties.brand, 'Ralph', 'text_en')
    RETURN asset._id
  `).toArray());

// it doesn't works
console.log('phrase search "properties.year" field', query(`
    FOR asset IN AssetsSearchView
    SEARCH asset.properties.year == 2018
    RETURN asset._id
  `).toArray());