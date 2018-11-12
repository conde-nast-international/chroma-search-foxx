"use strict";
const { db } = require("@arangodb");
module.context.use("/", require("./brand.search"));
module.context.use("/es", require("./elasticsearch/index.route"));
// The asset search service works only on Arango 3.4+
if (db._version().indexOf("3.4") !== -1) {
  module.context.use("/", require("./asset.search"));
}
