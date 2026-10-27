// Throw this in a service to answer with a clean status and code.
class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

module.exports = { HttpError };
