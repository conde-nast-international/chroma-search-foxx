/*global require*/
'use strict';
const arangodb = require("@arangodb");
const joi = require('joi');
const {uniqBy, flatten, deburr} = require('lodash');
const createRouter = require("@arangodb/foxx/router");

const db = arangodb.db;
const router = createRouter();

const docMap = new Map();
const fs = require('fuzzyset.js')([], false);

const PUNCTUATIONS = /[!"#$%&'()*+./:;<=>?@[\\\]^_`{|}~-]/;
const WHITESPACE = /\s/;

function tokenize(str) {
  let toSplit = false;
  let inPunctuation = false;
  const tokens = [];
  let token = '';
  for (let char of str) {

    if(PUNCTUATIONS.test(char)) {
      inPunctuation = true;
      toSplit = false;
      token += char;
    }
    else if(WHITESPACE.test(char)) {
      toSplit = true;
    } else {
      // close the current token
      if(toSplit && !inPunctuation) {
        tokens.push(token);
        token = '';
      }

      token += char;
      toSplit = false;
      inPunctuation = false;
    }
  }

  if(token) {
    tokens.push(token);
    token = '';
  }
  return tokens;
}

function indexString(str, doc) {
  const exists = fs.add(str) === false;
  if(!exists) {
    const docsOfTheString = docMap.get(str) || [];
    docsOfTheString.push(doc._id);
    // create reverse mapping and add it to index
    docMap.set(str, docsOfTheString);
  }
}

function createCollectionIndex(collectionName, key) {
  const docs = db._query(`FOR doc IN ${collectionName} RETURN KEEP(doc, "_id", "${key}")`).toArray();
  docs.forEach((doc) => {
    const val = doc[key];
    if (typeof val !== 'string') {
      console.error(`index key "${key}" in collection "${collectionName}" is not a string`);
    }

    // index both the whole string and tokens
    indexString(val, doc);
    tokenize(val).forEach(str => {
      indexString(str, doc);
      indexString(deburr(str), doc);
    });
  });
}

function retrieveDocsFromString(str) {
  const ids = docMap.get(str);
  console.assert(ids && ids.length, `should have found at least one doc for string: ${str}`);
  return ids.map(id => {
    const [collectionName, key] = id.split('/');
    const collection = db._collection(collectionName);
    return collection.document(key);
  });
}

createCollectionIndex('brands', 'name');

router.get('/search', function (req, res) {
  const start = Date.now();
  const query = req.queryParams.q;
  const matches = fs.get(query, [], .7);
  const results = uniqBy(flatten(matches.map(([score, str]) => {
    return retrieveDocsFromString(str).map(({ _id: id, name }) => (
        {id, name, score}
    ));
  })), 'id');
  const time = `${Date.now() - start}ms`;
  res.json({results, time});
})
.queryParam('q', joi.string().required(), 'search term')
.response(['text/plain'], 'Matched results')
.summary('Search taxonomy')
.description('Fuzzy search a term in taxonomy');

module.exports = router;