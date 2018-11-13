const { query, db } = require("@arangodb");
const request = require("../utils/request");
const bulkUpdate = require("../elasticsearch/bulk.update");
const flatten = require("lodash/flatten");
const uniq = require("lodash/uniq");
const rep_state_api = `/_db/chroma/_api/replication/logger-state`;
const logger_entries_api = `/_db/chroma/_api/replication/logger-follow`;
const OP_INSERT_REPLACE = 2300;
const OP_REMOVE = 2302;

const options = module.context.argv[0] || {};

// query replication logger state
const getLatestReplicationTick = () => {
  const res = request({
    url: rep_state_api,
    json: true
  });
  const {
    state: { lastLogTick }
  } = JSON.parse(res.body);
  return +lastLogTick;
};

const fromCollection = (doc, collections) => {
  return collections.find(name => doc._id.startsWith(name + "/"));
};

const COLLECTIONS = new Map(
  ["assets", "has_tags", "people"].map(name => [name, 1])
);

const logs2ops = logs => {
  // https://docs.arangodb.com/3.4/HTTP/Replications/WALAccess.html#operation-types
  // only interested in insert/replace/delete on specific collections
  const ops = flatten(
    logs
      .filter(log => {
        return (
          (log.type === OP_REMOVE || log.type === OP_INSERT_REPLACE) &&
          COLLECTIONS.has(log.cname)
        );
      })
      .map(log => {
        // Handle remove
        const { type, cname } = log;
        const doc = log.data;
        if (type === OP_REMOVE) {
          doc._id = `${cname}/${log.data._key}`;
        }

        let ids;

        switch (cname) {
          case "assets":
            return { type, id: doc._id };

          case "has_tags":
            if (doc._from) {
              // query affected assets
              ids = db
                ._query(
                  `
                  let asset = DOCUMENT('${doc._from}')
                  FILTER asset
                  RETURN asset._id
                `
                )
                .toArray();

              // return the affect asset ids
              return ids.map(id => ({ type: OP_INSERT_REPLACE, id }));
            }

            // Unfortunately we can't do anything with the deletion from "has_tags" collection,
            // since we can't know what were the vertexes on the removal log of an edge
            /*
              {
                "tick": "5208604",
                "type": 2302,
                "tid": "0",
                "database": "115",
                "cid": "5178797",
                "cname": "has_tags",
                "data": {
                  "_key": "5133773",
                  "_rev": "_Xu1yBMm--_",
                  "_id": "has_tags/5133773"
                }
              }
             */
            return [];

          case "people":
            // update assets tagged with this people
            ids = db
              ._query(
                `
                let tagged = (
                    FOR tag IN has_tags
                      // all tags pointed to this person
                      FILTER tag._to == "${doc._id}"
                      RETURN tag._from
                )
      
                // find affected assets 
                FOR asset IN assets
                  FILTER asset._id in tagged
                  RETURN asset._id
              `
              )
              .toArray();

            // return the affect asset ids
            return ids.map(id => ({ type: OP_INSERT_REPLACE, id }));
        }
      })
  ).filter(Boolean);

  const removalOps = uniq(
    ops.filter(({ type, id }) => type === OP_REMOVE).map(({ type, id }) => id)
  ).map(id => ({
    type: OP_REMOVE,
    doc: { id: id }
  }));

  const upsert_ids = uniq(
    ops
      .filter(({ type, id }) => type === OP_INSERT_REPLACE)
      .map(({ type, id }) => id)
  );

  const upsertOps = db
    ._query(
      `
    FOR id IN ${JSON.stringify(upsert_ids)}
      LET asset = DOCUMENT(id)
      FILTER asset
      FILTER asset.properties
      LET tags = (
        FOR link IN has_tags
          FILTER link._from == asset._id
          LET tag = DOCUMENT(link._to)
          FILTER tag
          RETURN tag.name ? tag.name : tag.names.en_GB 
      )
      RETURN MERGE({id: asset._id, tags}, asset.properties)
    `
    )
    .toArray()
    .map(doc => ({
      type: OP_INSERT_REPLACE,
      doc
    }));

  const all = removalOps.concat(upsertOps);
  return all;
};

const parse_nd_json = lines => {
  lines = lines.trim();
  if (!lines) {
    return [];
  }
  return lines.split("\n").map(line => {
    return JSON.parse(line);
  });
};

const getTailLogs = from => {
  const res = request({
    url: `${logger_entries_api}?includeSystem=false&&from=${from}`
  });
  const { body, headers } = res;
  const to =
    +headers["x-arango-replication-lastincluded"] ||
    +headers["x-arango-replication-lasttick"];
  const ticks = parse_nd_json(body);
  return {
    from,
    to,
    ticks
  };
};

// _name ends up a system collection
const collection_name = `_${module.context.collectionName("_es_indexer")}`;
const getTickCollection = () => {
  let esIndexCol = db._collection(collection_name);
  if (!esIndexCol) {
    esIndexCol = db._create(collection_name, {
      isSystem: true
    });
    console.log('created sys collection:', collection_name);
  }
  return esIndexCol;
};

const LAST_TICK_KEY = 'last_tick_indexed';

const getLastTick = () => {
  const col = getTickCollection();
  return col.exists(LAST_TICK_KEY)
    ? col.document(LAST_TICK_KEY).value
    : getLatestReplicationTick();
};

const setLastTick = value => {
  const ticks = getTickCollection();
  if (ticks.exists(LAST_TICK_KEY)) {
    ticks.update(LAST_TICK_KEY, {
      value
    });
  } else {
    ticks.insert({
      _key: LAST_TICK_KEY,
      value
    });
  }
};

const startTick = getLastTick();
const { to, ticks } = getTailLogs(startTick);
const ops = logs2ops(ticks);
bulkUpdate(ops);
setLastTick(to);
module.exports = { from: startTick, to, ops };
