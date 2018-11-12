"use strict";
const { query, db } = require("@arangodb");
const request = require("../utils/request");
const createRouter = require("@arangodb/foxx/router");
const queues = require("@arangodb/foxx/queues");
const router = createRouter();
const bulkUpdate = require("./bulk.update");
const {
  elasticsearch_index_interval,
  elasticsearch_index_max_fails
} = module.context.configuration;

const OP_INSERT_REPLACE = 2300;

const getIntialOps = () => {
  return db
    ._query(
      `
      FOR asset IN assets
        FILTER asset.properties
        LET tags = (FOR link IN has_tags
            FILTER link._from == asset._id
            LET tag = DOCUMENT(link._to)
            FILTER tag
            RETURN tag.name ? tag.name : tag.names.en_GB 
        )
        // we only index tagged assets for know
        FILTER tags
        RETURN MERGE({id: asset._id, tags}, asset.properties)
      `
    )
    .toArray()
    .map(doc => ({
      type: OP_INSERT_REPLACE,
      doc
    }));
};

const handleIndexJobSuccess = ({ to, ops }) => {
  console.info(`index succeed with tick:${to}`);
  ops.forEach(op => console.debug(op));
};

const handleIndexJobExit = () => {
  console.error(`The indexing job has failed too many times`);
};

router
  .put("/index/start", function(req, res) {
    const queue = queues.create("es-index");
    const jobs = queue.all();
    if (jobs.length) {
      return res.status(500).json({
        result: "indexing job already running, try stopping it first",
        jobs
      });
    }

    const mount = module.context.mount;
    const job = queue.push(
      {
        mount,
        name: "sync-index"
      },
      {
        index: "assets"
      },
      {
        maxFailures: elasticsearch_index_max_fails,
        repeatTimes: Infinity,
        repeatDelay: elasticsearch_index_interval,
        success: handleIndexJobSuccess,
        failure: handleIndexJobExit
      }
    );
    res.json({ result: "started", job });
  })
  .response(200, ["application/json"], "started job description")
  .summary("Start syncing the latest changes to ElasticSearch")
  .description("Start a job that sync WAL logs to ElasticSearch");

router
  .put("/index/stop", function(req, res) {
    const queue = queues.get("es-index");
    const jobs = queue.all();
    if (jobs.length) {
      jobs.forEach(job => {
        queue.delete(job);
      });
      db._drop(module.context.collectionName("es-index"));
      return res.json({ result: "stopped", jobs });
    }
    return res.status(400).json({ result: "no index job running" });
  })
  .response(200, ["application/json"], "stopped jobs description")
  .summary("Stop syncing changes")
  .description("Stop syncing WAL logs to ElasticSearch");

router
  .put("/index/all", function(req, res) {
    const start = Date.now();
    const results = bulkUpdate(getIntialOps());
    const total = results.length;
    const took = `${Date.now() - start}ms`;
    res.json({ result: "ok", took, total });
  })
  .response(200, ["application/json"], "how many assets indexed")
  .summary("Index all assets")
  .description("Index all tagged assets on ElasticSearch");

module.exports = router;
