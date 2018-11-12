const request = require("@arangodb/request");

const { elasticsearch_host } = module.context.configuration;
const bulk_index_api = `${elasticsearch_host}/asset/_bulk`;

const OP_INSERT_REPLACE = 2300;
const OP_REMOVE = 2302;

const bulkUpdate = events => {
  let body = "";

  function write_nl_json(obj) {
    body += JSON.stringify(obj) + "\n";
  }

  events.forEach(event => {
    const { type, doc } = event;
    const index = { _index: "assets", _type: "_doc", _id: doc.id };
    if (type === OP_INSERT_REPLACE) {
      write_nl_json({ index: index });
    } else if (type === OP_REMOVE) {
      write_nl_json({ delete: index });
    }
    write_nl_json(doc);
  });

  const res = request({
    url: bulk_index_api,
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson"
    },
    body
  });

  const { statusCode, message, body: responseBody } = res;

  const { errors, items } = JSON.parse(responseBody.toString());
  if (errors) {
    const failed = items
      .filter(val => !!val.error)
      .map(val => ({
        id: val._id,
        error: val.error.reason
      }));
    console.error(
      "The following docs have failed:\n" + JSON.stringify(failed, null, " ")
    );
  }

  return items;
};

module.exports = bulkUpdate;
