const request = require("@arangodb/request");
const { arangodb_credentials } = module.context.configuration;

const handleResponseError = ({ statusCode, message }) => {
  if (statusCode > 400) {
    throw new Error(`${statusCode}:${message}`);
  }
};

const getBasicAuthString = value =>
  new Buffer(arangodb_credentials).toString("base64");

const basic_auth_headers = {
  Authorization: `Basic ${getBasicAuthString()}`
};

module.exports = options => {
  // Use HTTP Basic to auth the requests to arango HTTP API (relative urls)
  if (/^\//.exec(options.url)) {
    options.headers = Object.assign({}, basic_auth_headers, options.headers);
  }

  const res = request(options);
  handleResponseError(res);
  return res;
};
